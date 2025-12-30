import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseWordDocument, parseTextDocument } from "@/lib/document-parser"
import { canModifyWorkflow } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    const fileUpload = await prisma.fileUpload.findUnique({
      where: { id: fileId },
      include: {
        citationChecks: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    })

    if (!fileUpload) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    if (!fileUpload.blobUrl) {
      return NextResponse.json(
        { error: "File URL not found" },
        { status: 400 }
      )
    }

    // Check if user can modify workflow
    const latestCheck = fileUpload.citationChecks[0]
    if (latestCheck) {
      const canModify = await canModifyWorkflow(user.id, latestCheck.id)
      if (!canModify) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else {
      // Check file access for new check creation
      const { canAccessFile } = await import("@/lib/access-control")
      const hasAccess = await canAccessFile(user.id, fileId, 'edit')
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Check if JSON already exists
    const hasJson = latestCheck && latestCheck.jsonData
    
    // Check for force regeneration parameter
    const { searchParams } = new URL(request.url)
    const forceRegenerate = searchParams.get("force") === "true"

    let citationCheck
    // Return existing JSON if it exists and we're not forcing regeneration
    // Don't check status - just check if jsonData exists
    if (hasJson && latestCheck && !forceRegenerate) {
      // Use existing check (unless forcing regeneration)
      citationCheck = latestCheck
      return NextResponse.json(citationCheck)
    } else {
      // Create new version or update existing
      const version = latestCheck ? latestCheck.version + 1 : 1
      
      // In test system: any user can create citation checks for any file
      citationCheck = await prisma.citationCheck.create({
        data: {
          fileUploadId: fileUpload.id,
          userId: user.id, // Track who created this check, but file is accessible to all
          version,
          status: "uploaded",
        },
      })
    }

    // Download file from Vercel Blob Storage
    let fileBuffer: ArrayBuffer
    try {
      logger.debug('Downloading file', { blobUrl: fileUpload.blobUrl, filename: fileUpload.originalName, mimeType: fileUpload.mimeType, fileSize: fileUpload.fileSize }, 'GenerateJson')
      
      const fileResponse = await fetch(fileUpload.blobUrl)
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.statusText}`)
      }
      fileBuffer = await fileResponse.arrayBuffer()
      logger.debug('File downloaded successfully', { bufferSize: fileBuffer.byteLength }, 'GenerateJson')
    } catch (error) {
      logger.error("Error downloading file", error, 'GenerateJson')
      return NextResponse.json(
        { 
          error: "Failed to download file from storage",
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      )
    }

    // Parse document to JSON structure (Word or text)
    let jsonData: any
    try {
      logger.debug('Starting document parse', undefined, 'GenerateJson')
      
      // Check if this is a text file
      if (fileUpload.mimeType === 'text/plain') {
        // Parse as plain text
        const text = new TextDecoder('utf-8').decode(fileBuffer)
        logger.debug('Parsing as text document', { textLength: text.length }, 'GenerateJson')
        jsonData = await parseTextDocument(
          text,
          fileUpload.originalName,
          fileUpload.createdAt.toISOString()
        )
      } else {
        // Parse as Word document (existing behavior)
        jsonData = await parseWordDocument(
          fileBuffer,
          fileUpload.originalName,
          fileUpload.createdAt.toISOString()
        )
      }
      
      logger.debug('Document parsed successfully', { contentBlocks: jsonData?.document?.content?.length || 0 }, 'GenerateJson')
    } catch (error) {
      logger.error("Error parsing document", error, 'GenerateJson')
      return NextResponse.json(
        { 
          error: "Failed to parse document",
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      )
    }

    // Update citation check with JSON (stored as JsonB)
    const updated = await prisma.citationCheck.update({
      where: { id: citationCheck.id },
      data: {
        status: "json_generated",
        jsonData: jsonData as any,
      },
    })

    // Sync workflow fields from jsonData (non-blocking)
    try {
      const { syncWorkflowFields } = await import("@/lib/workflow/workflow-utils")
      await syncWorkflowFields(prisma, citationCheck.id)
    } catch (syncError) {
      logger.warn("Failed to sync workflow fields", syncError, 'GenerateJson')
      // Don't fail the request if sync fails
    }

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error, 'GenerateJson')
  }
}

