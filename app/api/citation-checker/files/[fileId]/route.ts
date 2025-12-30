/**
 * DELETE /api/citation-checker/files/[fileId]
 * Deletes a file and all associated data
 * 
 * Note: This file handles DELETE at the base path.
 * For routing operations (POST/GET), see route/route.ts
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deleteBlob } from "@/lib/blob"
import { canAccessFile } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    // Use centralized auth helper
    const authResult = await requireAuth(request)
    if (authResult.error) {
      return authResult.error
    }
    const { user } = authResult

    // Get the file upload record
    const fileUpload = await prisma.fileUpload.findUnique({
      where: { id: fileId },
      include: {
        citationChecks: true,
      },
    })

    if (!fileUpload) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Check if user has route permission (owner or admin can delete)
    const hasAccess = await canAccessFile(user.id, fileId, 'route')
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    
    // Delete the blob from Vercel Blob Storage if URL exists
    if (fileUpload.blobUrl) {
      try {
        await deleteBlob(fileUpload.blobUrl)
      } catch (blobError) {
        // Log error but continue with database deletion
        logger.warn(`Error deleting blob ${fileUpload.blobUrl}`, blobError, 'FileDelete')
        // Don't fail the request if blob deletion fails - the blob might already be deleted
      }
    }

    // Delete the file upload record (this will cascade delete CitationCheck records)
    await prisma.fileUpload.delete({
      where: { id: fileId },
    })

    logger.info(`File deleted successfully`, { fileId, userId: user.id }, 'FileDelete')

    return NextResponse.json({ 
      success: true,
      message: "File and all associated data deleted successfully"
    })
  } catch (error) {
    return handleApiError(error, 'FileDelete')
  }
}

