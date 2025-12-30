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

    const members = await prisma.caseMember.findMany({
      where: { caseId },
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
    })

    return NextResponse.json(members.map(member => ({
      ...member,
      addedAt: member.addedAt.toISOString(),
    })))
  } catch (error) {
    return handleApiError(error, 'GetCaseMembers')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check access - need edit permission to add members
    const hasAccess = await canAccessCase(user.id, caseId, "edit")
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { userId, role } = body

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    // Validate role
    const validRoles = ["owner", "editor", "viewer", "member"]
    const memberRole = role && validRoles.includes(role) ? role : "member"

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if user is already a member
    const existingMember = await prisma.caseMember.findUnique({
      where: {
        caseId_userId: {
          caseId,
          userId,
        },
      },
    })

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this case" },
        { status: 400 }
      )
    }

    // Add member
    const member = await prisma.caseMember.create({
      data: {
        caseId,
        userId,
        role: memberRole,
        addedById: user.id,
      },
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
      ...member,
      addedAt: member.addedAt.toISOString(),
    })
  } catch (error) {
    return handleApiError(error, 'AddCaseMember')
  }
}

