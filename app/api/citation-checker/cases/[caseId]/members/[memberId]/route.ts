import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessCase } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; memberId: string }> }
) {
  try {
    const { caseId, memberId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check access - need edit permission to update member roles
    const hasAccess = await canAccessCase(user.id, caseId, "edit")
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { role } = body

    if (!role || typeof role !== "string") {
      return NextResponse.json(
        { error: "Role is required" },
        { status: 400 }
      )
    }

    // Validate role
    const validRoles = ["owner", "editor", "viewer", "member"]
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      )
    }

    // Check if member exists
    const member = await prisma.caseMember.findUnique({
      where: { id: memberId },
    })

    if (!member || member.caseId !== caseId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // Update member role
    const updatedMember = await prisma.caseMember.update({
      where: { id: memberId },
      data: { role },
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
    })

    return NextResponse.json({
      ...updatedMember,
      addedAt: updatedMember.addedAt.toISOString(),
    })
  } catch (error) {
    return handleApiError(error, 'UpdateCaseMember')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; memberId: string }> }
) {
  try {
    const { caseId, memberId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check access - need edit permission to remove members
    const hasAccess = await canAccessCase(user.id, caseId, "edit")
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Check if member exists
    const member = await prisma.caseMember.findUnique({
      where: { id: memberId },
    })

    if (!member || member.caseId !== caseId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // Remove member
    await prisma.caseMember.delete({
      where: { id: memberId },
    })

    return NextResponse.json({ 
      success: true,
      message: "Member removed successfully",
    })
  } catch (error) {
    return handleApiError(error, 'RemoveCaseMember')
  }
}

