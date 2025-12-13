import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CitationDocument, ContentParagraph } from "@/types/citation-json"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paragraphId: string }> }
) {
  try {
    const { id, paragraphId } = await params
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
    const { notes } = body

    if (notes === undefined) {
      return NextResponse.json(
        { error: "Notes field is required" },
        { status: 400 }
      )
    }

    const jsonData = citationCheck.jsonData as unknown as CitationDocument
    const content = jsonData.document?.content || []

    // Find the paragraph
    const paragraphIndex = content.findIndex(
      (para: ContentParagraph) => para.id === paragraphId
    )

    if (paragraphIndex === -1) {
      return NextResponse.json(
        { error: `Paragraph ${paragraphId} not found` },
        { status: 404 }
      )
    }

    // Update paragraph notes
    const updatedParagraph: ContentParagraph = {
      ...content[paragraphIndex],
      notes: notes || undefined, // Remove notes if empty string
    }

    content[paragraphIndex] = updatedParagraph

    // Update CitationCheck
    const updated = await prisma.citationCheck.update({
      where: { id },
      data: {
        jsonData: jsonData as any,
      },
    })

    return NextResponse.json({
      paragraph: updatedParagraph,
      checkId: updated.id,
    })
  } catch (error) {
    console.error("Error updating paragraph notes:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to update paragraph notes",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

