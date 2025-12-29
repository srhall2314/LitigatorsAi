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

    // Get files routed to current user (where assignedToId matches or share has routedFromId)
    const routedShares = await prisma.documentShare.findMany({
      where: {
        sharedWithId: user.id,
        routedFromId: { not: null },
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

    // Also get checks directly assigned to user
    const assignedChecks = await prisma.citationCheck.findMany({
      where: {
        assignedToId: user.id,
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
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    })

    // Format response - combine routed shares and assigned checks
    const files = routedShares.map((share) => ({
      ...share.fileUpload,
      share: {
        id: share.id,
        permission: share.permission,
        routedFromId: share.routedFromId,
        routedAt: share.routedAt,
        createdAt: share.createdAt,
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

    // Add files from assigned checks that aren't already in shares
    const assignedFileIds = new Set(files.map((f: any) => f.id))
    for (const check of assignedChecks) {
      if (!assignedFileIds.has(check.fileUploadId)) {
        files.push({
          ...check.fileUpload,
          share: undefined as any,
          createdAt: check.fileUpload.createdAt.toISOString(),
          updatedAt: check.fileUpload.updatedAt.toISOString(),
          citationChecks: [{
            ...check,
            createdAt: check.createdAt.toISOString(),
            updatedAt: check.updatedAt.toISOString(),
            assignedAt: check.assignedAt ? check.assignedAt.toISOString() : null,
            completedSteps: check.completedSteps || [],
          }],
        })
      }
    }

    return NextResponse.json(files)
  } catch (error) {
    console.error("Error fetching routed files:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch routed files",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

