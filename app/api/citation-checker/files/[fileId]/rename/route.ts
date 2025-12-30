import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { fileId } = await params
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Document name is required" },
        { status: 400 }
      )
    }

    const fileUpload = await prisma.fileUpload.findUnique({
      where: { id: fileId },
    })

    if (!fileUpload) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Check if user has permission (owner only for rename)
    if (fileUpload.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Update the document name
    const updatedFile = await prisma.fileUpload.update({
      where: { id: fileId },
      data: {
        originalName: name.trim(),
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      fileUpload: {
        ...updatedFile,
        createdAt: updatedFile.createdAt.toISOString(),
        updatedAt: updatedFile.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    return handleApiError(error, 'RenameFile')
  }
}

