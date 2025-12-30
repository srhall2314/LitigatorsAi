import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessFile, canAccessCase } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check access - need edit permission
    const hasAccess = await canAccessFile(user.id, fileId, "edit")
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { caseId, legalDocumentType, filedByOrganization } = body

    // Validate caseId if provided
    if (caseId !== null && caseId !== undefined) {
      if (typeof caseId !== "string") {
        return NextResponse.json(
          { error: "caseId must be a string or null" },
          { status: 400 }
        )
      }

      // Check if case exists
      const case_ = await prisma.case.findUnique({
        where: { id: caseId },
      })

      if (!case_) {
        return NextResponse.json({ error: "Case not found" }, { status: 404 })
      }

      // Check if user has access to the case (view permission is enough to assign documents)
      const hasCaseAccess = await canAccessCase(user.id, caseId, "view")
      if (!hasCaseAccess) {
        return NextResponse.json(
          { error: "You do not have access to this case" },
          { status: 403 }
        )
      }
    }

    const updateData: any = {}
    if (caseId !== undefined) {
      updateData.caseId = caseId
    }
    if (legalDocumentType !== undefined) {
      updateData.legalDocumentType = legalDocumentType?.trim() || null
    }
    if (filedByOrganization !== undefined) {
      updateData.filedByOrganization = filedByOrganization?.trim() || null
    }

    const file = await prisma.fileUpload.update({
      where: { id: fileId },
      data: updateData,
      include: {
        case: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
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

    return NextResponse.json({
      ...file,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    })
  } catch (error) {
    return handleApiError(error, 'AssignCaseToFile')
  }
}

