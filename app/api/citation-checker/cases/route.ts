import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessCase } from "@/lib/access-control"

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
    console.error("Error fetching cases:", error)
    return NextResponse.json(
      { error: "Failed to fetch cases" },
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
    console.error("Error creating case:", error)
    return NextResponse.json(
      { error: "Failed to create case" },
      { status: 500 }
    )
  }
}

