import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { CitationDocument, Citation } from "@/types/citation-json"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; citationId: string }> }
) {
  try {
    const { id, citationId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    const citationCheck = await prisma.citationCheck.findUnique({
      where: { id },
    })

    if (!citationCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    if (!citationCheck.jsonData) {
      return NextResponse.json(
        { error: "Citation check has no document data" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { status, notes } = body

    if (!status || (status !== "approved" && status !== "questionable" && status !== null)) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'approved', 'questionable', or null" },
        { status: 400 }
      )
    }

    const jsonData = citationCheck.jsonData as unknown as CitationDocument
    const citations = jsonData.document?.citations || []

    const citationIndex = citations.findIndex(
      (c: Citation) => c.id === citationId
    )

    if (citationIndex === -1) {
      return NextResponse.json(
        { error: `Citation ${citationId} not found` },
        { status: 404 }
      )
    }

    // Update citation with manual review
    const updatedCitation: Citation = {
      ...citations[citationIndex],
      manualReview: status
        ? {
            status,
            reviewedAt: new Date().toISOString(),
            reviewedBy: user.email,
            notes: notes || undefined,
          }
        : undefined,
    }

    citations[citationIndex] = updatedCitation

    // Update CitationCheck
    const updated = await prisma.citationCheck.update({
      where: { id },
      data: {
        jsonData: jsonData as any,
      },
    })

    return NextResponse.json({
      citation: updatedCitation,
      checkId: updated.id,
    })
  } catch (error) {
    return handleApiError(error, 'UpdateManualReview')
  }
}

