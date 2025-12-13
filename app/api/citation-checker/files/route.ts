import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadBlob } from "@/lib/blob"

export async function GET(request: NextRequest) {
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

    // In test system: all files available to all users
    // Exclude jsonData to improve performance - it's huge and not needed for the list view
    const files = await prisma.fileUpload.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        originalName: true,
        fileSize: true,
        mimeType: true,
        blobUrl: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        citationChecks: {
          orderBy: { version: "desc" },
          take: 1, // Get latest version for display
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // For each file, also find the latest standard workflow check with validation
    // This ensures we can show "View Report" even if latest check is a test run
    // Use efficient query - exclude jsonData completely
    const filesWithStandardChecks = await Promise.all(
      files.map(async (file) => {
        // Find latest standard workflow check with validation
        // Use raw query to avoid Prisma type issues and exclude jsonData
        const standardCheckResult = await prisma.$queryRaw<Array<{
          id: string
          fileUploadId: string
          version: number
          status: string
          createdAt: Date
          updatedAt: Date
          workflowType: string | null
          workflowId: string | null
          workflowStep: string | null
          workflowMetadata: any
          documentMetadata: any
          citationCount: number | null
          identificationMethod: string | null
          completedSteps: string[]
          currentStep: string | null
        }>>`
          SELECT 
            id, "fileUploadId", version, status, "createdAt", "updatedAt",
            "workflowType", "workflowId", "workflowStep", "workflowMetadata",
            "documentMetadata", "citationCount", "identificationMethod",
            "completedSteps", "currentStep"
          FROM "CitationCheck"
          WHERE "fileUploadId" = ${file.id}
            AND ("workflowType" = 'standard' OR "workflowType" IS NULL)
            AND (status = 'citations_validated' OR "citationCount" > 0)
          ORDER BY version DESC
          LIMIT 1
        `
        
        const standardCheck = standardCheckResult[0] || null

        // Extract only the fields we need (jsonData is already excluded from query)
        const standardCheckData = standardCheck ? {
          id: standardCheck.id,
          fileUploadId: standardCheck.fileUploadId,
          version: standardCheck.version,
          status: standardCheck.status,
          createdAt: standardCheck.createdAt,
          updatedAt: standardCheck.updatedAt,
          workflowType: (standardCheck as any).workflowType || null,
          workflowId: (standardCheck as any).workflowId || null,
          workflowStep: (standardCheck as any).workflowStep || null,
          workflowMetadata: (standardCheck as any).workflowMetadata || null,
          documentMetadata: (standardCheck as any).documentMetadata || null,
          citationCount: (standardCheck as any).citationCount || null,
          identificationMethod: (standardCheck as any).identificationMethod || null,
          completedSteps: (standardCheck as any).completedSteps || [],
          currentStep: (standardCheck as any).currentStep || null,
        } : null

        return {
          ...file,
          standardWorkflowCheck: standardCheckData, // Add the standard check separately
        }
      })
    )

    // Serialize Date objects and ensure proper JSON serialization
    const serializedFiles = filesWithStandardChecks.map((file: any) => ({
      ...file,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      citationChecks: (file.citationChecks || []).map((check: any) => ({
        id: check.id,
        fileUploadId: check.fileUploadId,
        version: check.version,
        status: check.status,
        createdAt: check.createdAt.toISOString(),
        updatedAt: check.updatedAt.toISOString(),
        // Include workflow fields (exclude jsonData for performance)
        workflowType: check.workflowType || null,
        workflowId: check.workflowId || null,
        workflowStep: check.workflowStep || null,
        workflowMetadata: check.workflowMetadata || null,
        documentMetadata: check.documentMetadata || null,
        citationCount: check.citationCount || null,
        identificationMethod: check.identificationMethod || null,
        completedSteps: check.completedSteps || [],
        currentStep: check.currentStep || null,
        // Explicitly exclude jsonData - it's huge
      })),
      standardWorkflowCheck: file.standardWorkflowCheck ? {
        ...file.standardWorkflowCheck,
        createdAt: file.standardWorkflowCheck.createdAt.toISOString(),
        updatedAt: file.standardWorkflowCheck.updatedAt.toISOString(),
        workflowMetadata: file.standardWorkflowCheck.workflowMetadata || null,
        documentMetadata: file.standardWorkflowCheck.documentMetadata || null,
        completedSteps: file.standardWorkflowCheck.completedSteps || [],
        workflowType: file.standardWorkflowCheck.workflowType || null,
        workflowId: file.standardWorkflowCheck.workflowId || null,
        workflowStep: file.standardWorkflowCheck.workflowStep || null,
        citationCount: file.standardWorkflowCheck.citationCount || null,
        identificationMethod: file.standardWorkflowCheck.identificationMethod || null,
        currentStep: file.standardWorkflowCheck.currentStep || null,
      } : null,
    }))

    return NextResponse.json(serializedFiles)
  } catch (error) {
    console.error("Error fetching files:", error)
    // Log full error for debugging
    if (error instanceof Error) {
      console.error("Error name:", error.name)
      console.error("Error message:", error.message)
      console.error("Error stack:", error.stack)
    } else {
      console.error("Non-Error object:", JSON.stringify(error, null, 2))
    }
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

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

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Upload to Vercel Blob Storage
    const buffer = await file.arrayBuffer()
    const blob = await uploadBlob(file.name, buffer, {
      contentType: file.type,
    })

    // Save file metadata to database
    const fileUpload = await prisma.fileUpload.create({
      data: {
        userId: user.id,
        filename: blob.pathname,
        originalName: file.name,
        fileSize: file.size,
        mimeType: file.type,
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
        workflowId: null, // Will be set to check.id after creation, or when jsonData is generated
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
    console.error("Error uploading file:", error)
    // Log full error for debugging
    if (error instanceof Error) {
      console.error("Upload error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to upload file",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

