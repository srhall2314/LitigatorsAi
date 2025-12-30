import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { uploadBlob } from "@/lib/blob"
import { getAccessibleFilesWhere, getFileAccessLevel } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Filter files by access control - users see only their files and shared files
    // Exclude jsonData to improve performance - it's huge and not needed for the list view
    const files = await prisma.fileUpload.findMany({
      where: getAccessibleFilesWhere(user.id, user.role),
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
        caseId: true,
        legalDocumentType: true,
        filedByOrganization: true,
        case: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        citationChecks: {
          orderBy: { version: "desc" },
          take: 1, // Get latest version for display
          select: {
            id: true,
            fileUploadId: true,
            version: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            workflowType: true,
            workflowId: true,
            workflowStep: true,
            workflowMetadata: true,
            documentMetadata: true,
            citationCount: true,
            identificationMethod: true,
            completedSteps: true,
            currentStep: true,
            assignedToId: true,
            assignedAt: true,
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            // Explicitly exclude jsonData
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        shares: {
          where: { sharedWithId: user.id },
          select: {
            id: true,
            permission: true,
            routedFromId: true,
            routedAt: true,
            createdAt: true,
            sharedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Get all file IDs to batch query standard workflow checks
    const fileIds = files.map(f => f.id)
    
    // Use a single efficient query to get all standard workflow checks for all files
    // This replaces N+1 queries with a single query + JavaScript grouping
    const allStandardChecks = fileIds.length > 0 ? await prisma.citationCheck.findMany({
      where: {
        fileUploadId: { in: fileIds },
        AND: [
          {
            OR: [
              { workflowType: "standard" },
              { workflowType: null },
            ],
          },
          {
            OR: [
              { status: "citations_validated" },
              { citationCount: { gt: 0 } },
            ],
          },
        ],
      },
      select: {
        id: true,
        fileUploadId: true,
        version: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        workflowType: true,
        workflowId: true,
        workflowStep: true,
        workflowMetadata: true,
        documentMetadata: true,
        citationCount: true,
        identificationMethod: true,
        completedSteps: true,
        currentStep: true,
        // Explicitly exclude jsonData
      },
      orderBy: [
        { fileUploadId: "asc" },
        { version: "desc" },
      ],
    }) : []
    
    // Group by fileUploadId and take the first (latest version) for each file
    // Since results are already ordered by fileUploadId and version DESC, 
    // we can just take the first occurrence of each fileUploadId
    const standardChecksMap = new Map<string, typeof allStandardChecks[0]>()
    for (const check of allStandardChecks) {
      if (!standardChecksMap.has(check.fileUploadId)) {
        standardChecksMap.set(check.fileUploadId, check)
      }
    }

    // Combine files with their standard workflow checks and add access level
    const filesWithStandardChecks = await Promise.all(files.map(async (file) => {
      const standardCheck = standardChecksMap.get(file.id) || null

      // Extract only the fields we need (jsonData is already excluded from query)
      const standardCheckData = standardCheck ? {
        id: standardCheck.id,
        fileUploadId: standardCheck.fileUploadId,
        version: standardCheck.version,
        status: standardCheck.status,
        createdAt: standardCheck.createdAt,
        updatedAt: standardCheck.updatedAt,
        workflowType: standardCheck.workflowType || null,
        workflowId: standardCheck.workflowId || null,
        workflowStep: standardCheck.workflowStep || null,
        workflowMetadata: standardCheck.workflowMetadata || null,
        documentMetadata: standardCheck.documentMetadata || null,
        citationCount: standardCheck.citationCount || null,
        identificationMethod: standardCheck.identificationMethod || null,
        completedSteps: standardCheck.completedSteps || [],
        currentStep: standardCheck.currentStep || null,
      } : null

      // Get access level for this file
      const accessLevel = await getFileAccessLevel(user.id, file.id)

      return {
        ...file,
        standardWorkflowCheck: standardCheckData, // Add the standard check separately
        accessLevel, // Add access level indicator
      }
    }))

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
        assignedToId: check.assignedToId || null,
        assignedAt: check.assignedAt ? check.assignedAt.toISOString() : null,
        assignedTo: check.assignedTo || null,
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
      shares: (file.shares || []).map((share: any) => ({
        id: share.id,
        permission: share.permission,
        routedFromId: share.routedFromId || null,
        routedAt: share.routedAt ? share.routedAt.toISOString() : null,
        createdAt: share.createdAt.toISOString(),
        sharedBy: share.sharedBy,
      })),
    }))

    return NextResponse.json(serializedFiles)
  } catch (error) {
    return handleApiError(error, 'GetFiles')
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Get optional case assignment fields
    const caseId = formData.get("caseId") as string | null
    const legalDocumentType = formData.get("legalDocumentType") as string | null
    const filedByOrganization = formData.get("filedByOrganization") as string | null

    // Validate caseId if provided
    if (caseId) {
      const case_ = await prisma.case.findUnique({
        where: { id: caseId },
      })
      if (!case_) {
        return NextResponse.json({ error: "Case not found" }, { status: 404 })
      }
      // Check if user has access to the case
      const { canAccessCase } = await import("@/lib/access-control")
      const hasCaseAccess = await canAccessCase(user.id, caseId, "view")
      if (!hasCaseAccess) {
        return NextResponse.json(
          { error: "You do not have access to this case" },
          { status: 403 }
        )
      }
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
    return handleApiError(error, 'UploadFile')
  }
}

