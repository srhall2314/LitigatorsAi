import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    // Get files routed from current user (where routedFromId matches user.id)
    const routedShares = await prisma.documentShare.findMany({
      where: {
        routedFromId: user.id,
      },
      include: {
        fileUpload: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            citationChecks: {
              orderBy: { version: "desc" },
              take: 1,
              select: {
                id: true,
                fileUploadId: true,
                version: true,
                status: true,
                workflowType: true,
                workflowStep: true,
                currentStep: true,
                completedSteps: true,
                assignedToId: true,
                assignedAt: true,
                assignedTo: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
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

    // Format response
    const files = routedShares.map((share) => ({
      ...share.fileUpload,
      share: {
        id: share.id,
        permission: share.permission,
        routedFromId: share.routedFromId,
        routedAt: share.routedAt,
        createdAt: share.createdAt,
        sharedWith: share.sharedWith,
        sharedBy: share.sharedBy,
        routedFrom: share.routedFrom,
      },
      createdAt: share.fileUpload.createdAt.toISOString(),
      updatedAt: share.fileUpload.updatedAt.toISOString(),
      citationChecks: share.fileUpload.citationChecks.map((check: any) => ({
        ...check,
        createdAt: check.createdAt.toISOString(),
        updatedAt: check.updatedAt.toISOString(),
        assignedAt: check.assignedAt ? check.assignedAt.toISOString() : null,
        completedSteps: check.completedSteps || [],
      })),
    }))

    return NextResponse.json(files)
  } catch (error) {
    console.error("Error fetching routed from files:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch routed from files",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

