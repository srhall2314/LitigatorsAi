import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { identifyCitations } from "@/lib/citation-identification"
import { canModifyWorkflow } from "@/lib/access-control"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
    const latestVersion = await prisma.citationCheck.findFirst({
      where: { fileUploadId: currentCheck.fileUploadId },
      orderBy: { version: "desc" },
    })

    const nextVersion = latestVersion ? latestVersion.version + 1 : 1

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
      console.warn("[identify-citations] Failed to sync workflow fields:", syncError)
      // Don't fail the request if sync fails
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error identifying citations:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to identify citations",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

