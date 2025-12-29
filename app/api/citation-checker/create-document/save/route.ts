import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadBlob } from "@/lib/blob"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const body = await request.json()
    const { documentText, filename, fileId, caseId, legalDocumentType, filedByOrganization } = body

    if (!documentText || typeof documentText !== 'string') {
      return NextResponse.json(
        { error: "documentText is required" },
        { status: 400 }
      )
    }

    // If fileId is provided, update existing document
    if (fileId) {
      const existingFile = await prisma.fileUpload.findUnique({
        where: { id: fileId },
        include: { user: true },
      })

      if (!existingFile) {
        return NextResponse.json({ error: "File not found" }, { status: 404 })
      }

      // Check if user has permission (owner or has access)
      if (existingFile.userId !== user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      // Check if document has already entered citation workflow (has jsonData)
      const latestCheck = await prisma.citationCheck.findFirst({
        where: { fileUploadId: fileId },
        orderBy: { version: 'desc' },
      })

      if (latestCheck?.jsonData) {
        return NextResponse.json(
          { error: "Cannot edit document that has already entered citation workflow" },
          { status: 400 }
        )
      }

      // Convert text to ArrayBuffer for blob storage
      const textBuffer = Buffer.from(documentText, 'utf-8')
      const arrayBuffer = textBuffer.buffer.slice(textBuffer.byteOffset, textBuffer.byteOffset + textBuffer.byteLength)

      // Upload new version to blob storage
      // Use existing filename for blob storage, but update originalName if new name provided
      const blobFilename = existingFile.originalName
      const blob = await uploadBlob(blobFilename, arrayBuffer, {
        contentType: 'text/plain',
      })

      // Update file metadata - only update originalName if a new name was provided
      const updateData: any = {
        filename: blob.pathname,
        fileSize: textBuffer.length,
        blobUrl: blob.url,
        updatedAt: new Date(),
      }
      
      if (filename && filename.trim().length > 0) {
        updateData.originalName = filename.trim()
      }
      
      // Handle case assignment fields if provided
      if (caseId !== undefined) {
        if (caseId) {
          // Validate case exists and user has access
          const case_ = await prisma.case.findUnique({
            where: { id: caseId },
          })
          if (!case_) {
            return NextResponse.json({ error: "Case not found" }, { status: 404 })
          }
          const { canAccessCase } = await import("@/lib/access-control")
          const hasCaseAccess = await canAccessCase(user.id, caseId, "view")
          if (!hasCaseAccess) {
            return NextResponse.json(
              { error: "You do not have access to this case" },
              { status: 403 }
            )
          }
        }
        updateData.caseId = caseId || null
      }
      if (legalDocumentType !== undefined) {
        updateData.legalDocumentType = legalDocumentType?.trim() || null
      }
      if (filedByOrganization !== undefined) {
        updateData.filedByOrganization = filedByOrganization?.trim() || null
      }

      const updatedFile = await prisma.fileUpload.update({
        where: { id: fileId },
        data: updateData,
      })

      return NextResponse.json({
        fileUpload: {
          ...updatedFile,
          createdAt: updatedFile.createdAt.toISOString(),
          updatedAt: updatedFile.updatedAt.toISOString(),
        },
      })
    }

    // Create new document
    // Generate filename if not provided
    const finalFilename = filename || `ai-generated-document-${new Date().toISOString().split('T')[0]}.txt`

    // Validate caseId if provided
    if (caseId) {
      const case_ = await prisma.case.findUnique({
        where: { id: caseId },
      })
      if (!case_) {
        return NextResponse.json({ error: "Case not found" }, { status: 404 })
      }
      const { canAccessCase } = await import("@/lib/access-control")
      const hasCaseAccess = await canAccessCase(user.id, caseId, "view")
      if (!hasCaseAccess) {
        return NextResponse.json(
          { error: "You do not have access to this case" },
          { status: 403 }
        )
      }
    }

    // Convert text to ArrayBuffer for blob storage
    const textBuffer = Buffer.from(documentText, 'utf-8')
    const arrayBuffer = textBuffer.buffer.slice(textBuffer.byteOffset, textBuffer.byteOffset + textBuffer.byteLength)

    // Upload to Vercel Blob Storage
    const blob = await uploadBlob(finalFilename, arrayBuffer, {
      contentType: 'text/plain',
    })

    // Save file metadata to database
    const fileUpload = await prisma.fileUpload.create({
      data: {
        userId: user.id,
        filename: blob.pathname,
        originalName: finalFilename,
        fileSize: textBuffer.length,
        mimeType: 'text/plain',
        blobUrl: blob.url,
        caseId: caseId || null,
        legalDocumentType: legalDocumentType?.trim() || null,
        filedByOrganization: filedByOrganization?.trim() || null,
      },
    })

    // Create initial citation check record with workflow tracking
    const citationCheck = await prisma.citationCheck.create({
      data: {
        fileUploadId: fileUpload.id,
        userId: user.id,
        version: 1,
        status: "uploaded",
        // Populate workflow fields for standard workflow
        workflowType: "standard",
        workflowId: null, // Will be set to check.id after creation
        completedSteps: ["upload"],
        currentStep: "generate-json",
      },
    })
    
    // Update workflowId to check.id for standard workflow grouping
    await prisma.citationCheck.update({
      where: { id: citationCheck.id },
      data: { workflowId: citationCheck.id },
    })

    // Serialize Date objects for JSON response
    return NextResponse.json({
      fileUpload: {
        ...fileUpload,
        createdAt: fileUpload.createdAt.toISOString(),
        updatedAt: fileUpload.updatedAt.toISOString(),
      },
      citationCheck: {
        ...citationCheck,
        createdAt: citationCheck.createdAt.toISOString(),
        updatedAt: citationCheck.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("Error saving document:", error)
    if (error instanceof Error) {
      console.error("Save error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to save document",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

