import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessCase } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get("filter") || "all" // "all" | "owned" | "member"
    const status = searchParams.get("status") // Optional status filter

    let where: any = {}

    if (user.role === "admin") {
      // Admin sees all cases
      if (status) {
        where.status = status
      }
    } else {
      // Regular users see cases they own or are members of
      if (filter === "owned") {
        where.ownerId = user.id
      } else if (filter === "member") {
        where.members = {
          some: { userId: user.id },
        }
      } else {
        // "all" - cases user owns or is member of
        where.OR = [
          { ownerId: user.id },
          {
            members: {
              some: { userId: user.id },
            },
          },
        ]
      }
      
      if (status) {
        where.status = status
      }
    }

    const cases = await prisma.case.findMany({
      where,
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
      orderBy: {
        updatedAt: "desc",
      },
    })

    return NextResponse.json(cases.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })))
  } catch (error) {
    return handleApiError(error, 'GetCases')
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const { name, description, status, metadata } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Case name is required" },
        { status: 400 }
      )
    }

    const case_ = await prisma.case.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        status: status || "active",
        metadata: metadata || null,
        ownerId: user.id,
      },
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
    return handleApiError(error, 'CreateCase')
  }
}

