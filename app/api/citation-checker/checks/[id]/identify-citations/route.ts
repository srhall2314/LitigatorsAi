import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { identifyCitations } from "@/lib/citation-identification"
import { canModifyWorkflow } from "@/lib/access-control"
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

    // Get the current CitationCheck (should be version 1 with json_generated status)
    const currentCheck = await prisma.citationCheck.findUnique({
      where: { id },
    })

    if (!currentCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    if (!currentCheck.jsonData) {
      return NextResponse.json(
        { error: "JSON data not found. Please generate JSON first." },
        { status: 400 }
      )
    }

    // Check if user can modify workflow
    const canModify = await canModifyWorkflow(user.id, id)
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get the latest version for this fileUploadId to determine next version number
    const nextVersion = await getNextVersionNumber(currentCheck.fileUploadId)

    // Create new version (version 2) by copying jsonData from version 1
    // Inherit workflow fields from parent check
    const newVersion = await prisma.citationCheck.create({
      data: {
        fileUploadId: currentCheck.fileUploadId,
        userId: user.id,
        version: nextVersion,
        status: "citations_identified",
        jsonData: currentCheck.jsonData as any, // Copy from version 1
        // Inherit workflow fields from parent check
        workflowType: currentCheck.workflowType || "standard",
        workflowId: currentCheck.workflowId || currentCheck.id,
        workflowMetadata: currentCheck.workflowMetadata as any,
        documentMetadata: currentCheck.documentMetadata as any,
        identificationMethod: currentCheck.identificationMethod,
        completedSteps: currentCheck.completedSteps || ["upload", "generate-json"],
        currentStep: "identify-citations",
      },
    })

    // Process citations and update jsonData
    const jsonData = currentCheck.jsonData as any
    const updatedJsonData = identifyCitations(jsonData)

    // Update version 2 with citations
    const updated = await prisma.citationCheck.update({
      where: { id: newVersion.id },
      data: {
        jsonData: updatedJsonData as any,
        status: "citations_identified",
      },
    })

    // Sync workflow fields from updated jsonData (non-blocking)
    try {
      const { syncWorkflowFields } = await import("@/lib/workflow/workflow-utils")
      await syncWorkflowFields(prisma, newVersion.id)
    } catch (syncError) {
      logger.warn("Failed to sync workflow fields", syncError, 'IdentifyCitations')
      // Don't fail the request if sync fails
    }

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error, 'IdentifyCitations')
  }
}

