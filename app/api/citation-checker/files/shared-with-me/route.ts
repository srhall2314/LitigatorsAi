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

    // Get permission filter from query params
    const { searchParams } = new URL(request.url)
    const permissionFilter = searchParams.get('permission')

    // Get files shared with current user
    const shares = await prisma.documentShare.findMany({
      where: {
        sharedWithId: user.id,
        ...(permissionFilter && { permission: permissionFilter }),
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
      orderBy: { createdAt: "desc" },
    })

    // Format response
    const files = shares.map((share) => ({
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

    return NextResponse.json(files)
  } catch (error) {
    console.error("Error fetching shared files:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch shared files",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

