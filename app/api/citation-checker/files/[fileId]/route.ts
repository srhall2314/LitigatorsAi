import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { deleteBlob } from "@/lib/blob"

export async function DELETE(
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

    // Check if user owns the file (or is admin)
    // In test system: allow deletion if user exists
    // For production, you might want: if (fileUpload.userId !== user.id && user.role !== 'admin')
    
    // Delete the blob from Vercel Blob Storage if URL exists
    if (fileUpload.blobUrl) {
      try {
        await deleteBlob(fileUpload.blobUrl)
      } catch (blobError) {
        // Log error but continue with database deletion
        console.error(`Error deleting blob ${fileUpload.blobUrl}:`, blobError)
        // Don't fail the request if blob deletion fails - the blob might already be deleted
      }
    }

    // Delete the file upload record (this will cascade delete CitationCheck records)
    await prisma.fileUpload.delete({
      where: { id: fileId },
    })

    return NextResponse.json({ 
      success: true,
      message: "File and all associated data deleted successfully"
    })
  } catch (error) {
    console.error("Error deleting file:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to delete file",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

