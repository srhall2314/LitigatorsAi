import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CitationDocument, Citation } from "@/types/citation-json"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; citationId: string }> }
) {
  try {
    const { id, citationId } = await params
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
    console.error("Error updating manual review:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to update manual review",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

