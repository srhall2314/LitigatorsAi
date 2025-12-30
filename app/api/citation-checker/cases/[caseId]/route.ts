import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessCase } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check access
    const hasAccess = await canAccessCase(user.id, caseId, "view")
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const case_ = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        documents: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            citationChecks: {
              where: { workflowType: "standard" },
              orderBy: { version: "desc" },
              take: 1,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            addedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            addedAt: "asc",
          },
        },
        _count: {
          select: {
            documents: true,
            members: true,
          },
        },
      },
    })

    if (!case_) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    return NextResponse.json({
      ...case_,
      createdAt: case_.createdAt.toISOString(),
      updatedAt: case_.updatedAt.toISOString(),
      documents: case_.documents.map(doc => ({
        ...doc,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      })),
      members: case_.members.map(member => ({
        ...member,
        addedAt: member.addedAt.toISOString(),
      })),
    })
  } catch (error) {
    return handleApiError(error, 'GetCase')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check access - need edit permission
    const hasAccess = await canAccessCase(user.id, caseId, "edit")
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, status, metadata } = body

    const updateData: any = {}
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Case name cannot be empty" },
          { status: 400 }
        )
      }
      updateData.name = name.trim()
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null
    }
    if (status !== undefined) {
      updateData.status = status
    }
    if (metadata !== undefined) {
      updateData.metadata = metadata
    }

    const case_ = await prisma.case.update({
      where: { id: caseId },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            documents: true,
            members: true,
          },
        },
      },
    })

    return NextResponse.json({
      ...case_,
      createdAt: case_.createdAt.toISOString(),
      updatedAt: case_.updatedAt.toISOString(),
    })
  } catch (error) {
    return handleApiError(error, 'UpdateCase')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check access - need route permission (case owner)
    const hasAccess = await canAccessCase(user.id, caseId, "route")
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Check if case has documents
    const case_ = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        _count: {
          select: {
            documents: true,
          },
        },
      },
    })

    if (!case_) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    // Delete case - documents will have caseId set to null (onDelete: SetNull)
    await prisma.case.delete({
      where: { id: caseId },
    })

    return NextResponse.json({ 
      success: true,
      message: "Case deleted successfully. Documents have been unassigned from the case.",
    })
  } catch (error) {
    return handleApiError(error, 'DeleteCase')
  }
}

