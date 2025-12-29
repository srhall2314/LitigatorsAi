import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canModifyWorkflow } from "@/lib/access-control"

/**
 * Unified endpoint that runs the complete citation checking pipeline:
 * 1. Generate JSON (if not exists)
 * 2. Identify Citations (if not exists)
 * 3. Validate Citations
 * 
 * This endpoint orchestrates the existing endpoints and returns a jobId for progress tracking.
 */
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

    // Get the current CitationCheck
    const currentCheck = await prisma.citationCheck.findUnique({
      where: { id },
      include: {
        fileUpload: true,
      },
    })

    if (!currentCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    // Check if user can modify workflow
    const canModify = await canModifyWorkflow(user.id, id)
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get identification method from request body (default to 'eyecite')
    const body = await request.json().catch(() => ({}))
    const identificationMethod = body.identificationMethod || currentCheck.identificationMethod || 'eyecite'

    let checkId = id
    let jsonData = currentCheck.jsonData

    // Step 1: Generate JSON if needed
    if (!jsonData) {
      // Import and call generate-json logic
      const { parseWordDocument, parseTextDocument } = await import("@/lib/document-parser")
      
      if (!currentCheck.fileUpload.blobUrl) {
        return NextResponse.json(
          { error: "File URL not found" },
          { status: 400 }
        )
      }

      // Download file
      const fileResponse = await fetch(currentCheck.fileUpload.blobUrl)
      if (!fileResponse.ok) {
        return NextResponse.json(
          { error: "Failed to download file" },
          { status: 500 }
        )
      }

      const fileBuffer = await fileResponse.arrayBuffer()
      const buffer = Buffer.from(fileBuffer)

      // Parse document
      const uploadDate = currentCheck.fileUpload.createdAt.toISOString()
      let parsedDocument
      if (currentCheck.fileUpload.mimeType === "text/plain") {
        // Convert buffer to string for text documents
        const text = buffer.toString('utf-8')
        parsedDocument = await parseTextDocument(text, currentCheck.fileUpload.originalName, uploadDate)
      } else {
        parsedDocument = await parseWordDocument(fileBuffer, currentCheck.fileUpload.originalName, uploadDate)
      }

      // Update check with JSON
      const updated = await prisma.citationCheck.update({
        where: { id: checkId },
        data: {
          jsonData: parsedDocument as any,
          status: "json_generated",
        },
      })

      jsonData = updated.jsonData
      checkId = updated.id
    }

    // Step 2: Identify Citations if needed
    const jsonDataObj = jsonData as any
    const hasCitations = jsonDataObj?.document?.citations?.length > 0

    if (!hasCitations) {
      // Get latest version
      const latestVersion = await prisma.citationCheck.findFirst({
        where: { fileUploadId: currentCheck.fileUploadId },
        orderBy: { version: "desc" },
      })

      const nextVersion = latestVersion ? latestVersion.version + 1 : 1

      // Create new version with identified citations
      const newVersion = await prisma.citationCheck.create({
        data: {
          fileUploadId: currentCheck.fileUploadId,
          userId: user.id,
          version: nextVersion,
          status: "citations_identified",
          jsonData: jsonData as any,
          workflowType: currentCheck.workflowType || "standard",
          workflowId: currentCheck.workflowId || currentCheck.id,
          workflowMetadata: currentCheck.workflowMetadata as any,
          documentMetadata: currentCheck.documentMetadata as any,
          identificationMethod: identificationMethod,
          completedSteps: currentCheck.completedSteps || ["upload", "generate-json"],
          currentStep: "identify-citations",
        },
      })

      // Use the appropriate identification method
      let updatedJsonData: any
      if (identificationMethod === 'eyecite') {
        const { identifyCitationsEyecite } = await import("@/lib/citation-identification/eyecite-adapter")
        const result = identifyCitationsEyecite(jsonDataObj)
        updatedJsonData = result.document
      } else {
        const { identifyCitations } = await import("@/lib/citation-identification")
        updatedJsonData = identifyCitations(jsonDataObj)
      }
      
      const updated = await prisma.citationCheck.update({
        where: { id: newVersion.id },
        data: {
          jsonData: updatedJsonData as any,
          status: "citations_identified",
          identificationMethod: identificationMethod,
        },
      })

      checkId = updated.id
    }

    // Step 3: Start validation
    const validateResponse = await fetch(
      `${request.nextUrl.origin}/api/citation-checker/checks/${checkId}/validate-citations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") || "",
        },
      }
    )

    if (!validateResponse.ok) {
      const errorData = await validateResponse.json()
      return NextResponse.json(
        { error: errorData.error || "Failed to start validation" },
        { status: validateResponse.status }
      )
    }

    const validateData = await validateResponse.json()

    return NextResponse.json({
      jobId: validateData.jobId,
      checkId: validateData.checkId || checkId,
      status: validateData.status || "queued",
      message: "Pipeline started successfully",
    })
  } catch (error) {
    console.error("Error running full pipeline:", error)
    return NextResponse.json(
      {
        error: "Failed to run pipeline",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

