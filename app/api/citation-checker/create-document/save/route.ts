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
    const { documentText, filename } = body

    if (!documentText || typeof documentText !== 'string') {
      return NextResponse.json(
        { error: "documentText is required" },
        { status: 400 }
      )
    }

    // Generate filename if not provided
    const finalFilename = filename || `ai-generated-document-${new Date().toISOString().split('T')[0]}.txt`

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

