import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessFile } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check if user has route permission (owner or admin can share)
    const hasRoutePermission = await canAccessFile(user.id, fileId, 'route')
    if (!hasRoutePermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { sharedWithEmail, permission } = body

    if (!sharedWithEmail || typeof sharedWithEmail !== 'string') {
      return NextResponse.json(
        { error: "sharedWithEmail is required" },
        { status: 400 }
      )
    }

    if (!permission || !['view', 'edit', 'route'].includes(permission)) {
      return NextResponse.json(
        { error: "permission must be 'view', 'edit', or 'route'" },
        { status: 400 }
      )
    }

    // Don't allow sharing with self
    if (sharedWithEmail === user.email) {
      return NextResponse.json(
        { error: "Cannot share document with yourself" },
        { status: 400 }
      )
    }

    // Find the user to share with
    const sharedWithUser = await prisma.user.findUnique({
      where: { email: sharedWithEmail },
    })

    if (!sharedWithUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Check if share already exists
    const existingShare = await prisma.documentShare.findUnique({
      where: {
        fileUploadId_sharedWithId: {
          fileUploadId: fileId,
          sharedWithId: sharedWithUser.id,
        },
      },
    })

    if (existingShare) {
      // Update existing share with new permission
      const updatedShare = await prisma.documentShare.update({
        where: { id: existingShare.id },
        data: { permission },
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
        },
      })

      return NextResponse.json(updatedShare)
    }

    // Create new share
    const share = await prisma.documentShare.create({
      data: {
        fileUploadId: fileId,
        sharedWithId: sharedWithUser.id,
        sharedById: user.id,
        permission,
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
      },
    })

    return NextResponse.json(share, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'ShareDocument')
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Check if user has view access
    const hasAccess = await canAccessFile(user.id, fileId, 'view')
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get all shares for this file
    const shares = await prisma.documentShare.findMany({
      where: { fileUploadId: fileId },
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
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(shares)
  } catch (error) {
    return handleApiError(error, 'GetShares')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Get shareId from query params
    const { searchParams } = new URL(request.url)
    const shareId = searchParams.get('shareId')

    if (!shareId) {
      return NextResponse.json(
        { error: "shareId is required" },
        { status: 400 }
      )
    }

    // Get the share to verify ownership
    const share = await prisma.documentShare.findUnique({
      where: { id: shareId },
      include: {
        fileUpload: true,
      },
    })

    if (!share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 })
    }

    // Check if user is owner or admin
    if (share.fileUpload.userId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Delete the share
    await prisma.documentShare.delete({
      where: { id: shareId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'RevokeShare')
  }
}

