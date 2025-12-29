import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessFile } from "@/lib/access-control"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
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

    // Check if user has route permission (owner or admin can route)
    const hasRoutePermission = await canAccessFile(user.id, fileId, 'route')
    if (!hasRoutePermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { routeToEmail, message } = body

    if (!routeToEmail || typeof routeToEmail !== 'string') {
      return NextResponse.json(
        { error: "routeToEmail is required" },
        { status: 400 }
      )
    }

    // Don't allow routing to self
    if (routeToEmail === user.email) {
      return NextResponse.json(
        { error: "Cannot route document to yourself" },
        { status: 400 }
      )
    }

    // Find the user to route to
    const routeToUser = await prisma.user.findUnique({
      where: { email: routeToEmail },
    })

    if (!routeToUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Get the latest CitationCheck for this file
    const latestCheck = await prisma.citationCheck.findFirst({
      where: { fileUploadId: fileId },
      orderBy: { version: "desc" },
    })

    if (!latestCheck) {
      return NextResponse.json(
        { error: "Citation check not found" },
        { status: 404 }
      )
    }

    // Check if share already exists
    const existingShare = await prisma.documentShare.findUnique({
      where: {
        fileUploadId_sharedWithId: {
          fileUploadId: fileId,
          sharedWithId: routeToUser.id,
        },
      },
    })

    let share
    if (existingShare) {
      // Update existing share to route permission
      share = await prisma.documentShare.update({
        where: { id: existingShare.id },
        data: {
          permission: 'route',
          routedFromId: user.id,
          routedAt: new Date(),
        },
        include: {
          sharedWith: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          sharedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          routedFrom: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })
    } else {
      // Create new share with route permission
      share = await prisma.documentShare.create({
        data: {
          fileUploadId: fileId,
          sharedWithId: routeToUser.id,
          sharedById: user.id,
          permission: 'route',
          routedFromId: user.id,
          routedAt: new Date(),
        },
        include: {
          sharedWith: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          sharedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          routedFrom: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })
    }

    // Soft route: Update CitationCheck assignedToId (keep existing check)
    const updatedCheck = await prisma.citationCheck.update({
      where: { id: latestCheck.id },
      data: {
        assignedToId: routeToUser.id,
        assignedAt: new Date(),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({
      check: updatedCheck,
      share,
      message: message || null,
    }, { status: 201 })
  } catch (error) {
    console.error("Error routing document:", error)
    return NextResponse.json(
      { 
        error: "Failed to route document",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
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

    // Check if user has view access
    const hasAccess = await canAccessFile(user.id, fileId, 'view')
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get routing history (shares where routedFromId is set)
    const routingHistory = await prisma.documentShare.findMany({
      where: {
        fileUploadId: fileId,
        routedFromId: { not: null },
      },
      include: {
        sharedWith: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sharedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        routedFrom: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { routedAt: "desc" },
    })

    return NextResponse.json(routingHistory)
  } catch (error) {
    console.error("Error fetching routing history:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch routing history",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

