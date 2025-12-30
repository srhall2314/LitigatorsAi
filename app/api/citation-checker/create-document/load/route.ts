import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleApiError, getLatestCheck } from "@/lib/api-helpers"
import { canAccessFile } from "@/lib/access-control"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get('fileId')

    if (!fileId) {
      return NextResponse.json(
        { error: "fileId is required" },
        { status: 400 }
      )
    }

    const fileUpload = await prisma.fileUpload.findUnique({
      where: { id: fileId },
      include: { user: true },
    })

    if (!fileUpload) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Check if user has permission (owner, admin, or has access via share/case)
    const hasAccess = await canAccessFile(user.id, fileId, 'edit')
    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Check if document has already entered citation workflow
    const latestCheck = await getLatestCheck(fileId)

    // If document has jsonData, extract text from it instead of blocking
    if (latestCheck?.jsonData) {
      const jsonData = latestCheck.jsonData as any
      const content = jsonData.document?.content || []
      const citations = jsonData.document?.citations || []
      
      // Count manual reviews
      const manualReviews = citations.filter((c: any) => 
        c.manualReview?.status === "approved" || 
        c.manualReview?.status === "questionable"
      )
      const manualReviewCount = manualReviews.length
      
      // Reconstruct document text by removing citation markers
      const documentText = content
        .map((para: any) => {
          return para.text
            .replace(/\[CITATION:[^\]]+\]/g, '')
            .replace(/\[\/CITATION:[^\]]+\]/g, '')
            .trim()
        })
        .filter((text: string) => text.length > 0)
        .join('\n\n')
      
      return NextResponse.json({
        fileId: fileUpload.id,
        documentText,
        filename: fileUpload.originalName,
        createdAt: fileUpload.createdAt.toISOString(),
        updatedAt: fileUpload.updatedAt.toISOString(),
        hasJsonData: true,
        hasManualReviews: manualReviewCount > 0,
        manualReviewCount: manualReviewCount,
        warning: manualReviewCount > 0 
          ? `This document has ${manualReviewCount} manual review decision(s) that will be lost if you edit it.`
          : "This document has been processed through citation validation. Editing will require re-running citation validation."
      })
    }

    // Fetch document text from blob storage
    if (!fileUpload.blobUrl) {
      return NextResponse.json(
        { error: "File URL not found" },
        { status: 404 }
      )
    }
    
    const response = await fetch(fileUpload.blobUrl)
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch document from storage" },
        { status: 500 }
      )
    }

    const documentText = await response.text()

    return NextResponse.json({
      fileId: fileUpload.id,
      documentText,
      filename: fileUpload.originalName,
      createdAt: fileUpload.createdAt.toISOString(),
      updatedAt: fileUpload.updatedAt.toISOString(),
    })
  } catch (error) {
    return handleApiError(error, 'LoadDocument')
  }
}

