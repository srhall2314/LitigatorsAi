import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { identifyCitationsEyecite } from "@/lib/citation-identification/eyecite-adapter"
import { requireAuth, handleApiError, getNextVersionNumber } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Get the current CitationCheck
    const currentCheck = await prisma.citationCheck.findUnique({
      where: { id },
    })

    if (!currentCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    // Find the base version (version 1 with json_generated status) that has the original unprocessed JSON
    // This ensures we always regenerate from clean, unmarked text
    const baseCheck = await prisma.citationCheck.findFirst({
      where: { 
        fileUploadId: currentCheck.fileUploadId,
        status: "json_generated",
      },
      orderBy: { version: "asc" }, // Get the earliest version with json_generated status
    })

    // Fallback to version 1 if no json_generated status found
    const sourceCheck = baseCheck || await prisma.citationCheck.findFirst({
      where: { 
        fileUploadId: currentCheck.fileUploadId,
        version: 1,
      },
    })

    if (!sourceCheck || !sourceCheck.jsonData) {
      return NextResponse.json(
        { error: "Base JSON data not found. Please generate JSON first." },
        { status: 400 }
      )
    }

    // Get the latest version for this fileUploadId to determine next version number
    const nextVersion = await getNextVersionNumber(currentCheck.fileUploadId)

    // Create new version by copying jsonData from base version (unprocessed JSON)
    // Inherit workflow fields from source check
    const newVersion = await prisma.citationCheck.create({
      data: {
        fileUploadId: currentCheck.fileUploadId,
        userId: user.id,
        version: nextVersion,
        status: "citations_identified",
        jsonData: sourceCheck.jsonData as any, // Copy from base version (unprocessed)
        // Inherit workflow fields from source check
        workflowType: sourceCheck.workflowType || "standard",
        workflowId: sourceCheck.workflowId || sourceCheck.id,
        workflowMetadata: sourceCheck.workflowMetadata as any,
        documentMetadata: sourceCheck.documentMetadata as any,
        identificationMethod: "eyecite", // Set identification method
        completedSteps: sourceCheck.completedSteps || ["upload", "generate-json"],
        currentStep: "identify-citations",
      },
    })

    // Process citations using Eyecite and update jsonData
    // Use the base version's jsonData which should have no citation markers
    const jsonData = sourceCheck.jsonData as any
    logger.debug('Input jsonData structure', {
      hasDocument: !!jsonData?.document,
      hasContent: !!jsonData?.document?.content,
      contentLength: jsonData?.document?.content?.length,
    }, 'EyeciteAPI')
    
    let result
    try {
      result = identifyCitationsEyecite(jsonData)
      logger.debug('Result structure', {
        hasDocument: !!result?.document,
        hasLogs: Array.isArray(result?.logs),
        logsLength: result?.logs?.length,
      }, 'EyeciteAPI')
    } catch (error) {
      logger.error('Error in identifyCitationsEyecite', error, 'EyeciteAPI')
      throw error
    }
    
    const { document: updatedJsonData, logs } = result
    
    // updatedJsonData is a CitationDocument, which has a document property
    // We need to store the full CitationDocument structure
    logger.debug('updatedJsonData structure', {
      type: typeof updatedJsonData,
      hasDocumentProperty: 'document' in updatedJsonData,
    }, 'EyeciteAPI')

    // Update version with citations
    const updated = await prisma.citationCheck.update({
      where: { id: newVersion.id },
      data: {
        jsonData: updatedJsonData as any, // This is the full CitationDocument
        status: "citations_identified",
      },
    })

    // Sync workflow fields from updated jsonData (non-blocking)
    try {
      const { syncWorkflowFields } = await import("@/lib/workflow/workflow-utils")
      await syncWorkflowFields(prisma, newVersion.id)
    } catch (syncError) {
      logger.warn("Failed to sync workflow fields", syncError, 'EyeciteAPI')
      // Don't fail the request if sync fails
    }

    // Return updated check with logs for browser console
    return NextResponse.json({
      ...updated,
      logs, // Include logs for browser console
    })
  } catch (error) {
    return handleApiError(error, 'EyeciteAPI')
  }
}

