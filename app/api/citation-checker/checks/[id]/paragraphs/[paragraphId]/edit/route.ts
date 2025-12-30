import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { CitationDocument, ContentParagraph, Citation } from "@/types/citation-json"
import { reidentifyCitationsInParagraph, validateParagraphCitations } from "@/lib/citation-identification/paragraph-processor"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paragraphId: string }> }
) {
  try {
    const { id, paragraphId } = await params
    
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
    const { paragraphText, editedCitations } = body

    if (!paragraphText) {
      return NextResponse.json(
        { error: "Paragraph text is required" },
        { status: 400 }
      )
    }

    const jsonData = citationCheck.jsonData as unknown as CitationDocument
    const content = jsonData.document?.content || []
    const citations = jsonData.document?.citations || []

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

    const originalParagraph = content[paragraphIndex]

    // Create a temporary paragraph with the edited text for re-identification
    const editedParagraph: ContentParagraph = {
      ...originalParagraph,
      text: paragraphText,
    }

    // Find the highest citation counter to continue numbering
    // Extract numbers from citation IDs like "cit_001", "cit_002", etc.
    const citationNumbers = citations
      .map(c => {
        const match = c.id.match(/cit_(\d+)/)
        return match ? parseInt(match[1], 10) : 0
      })
      .filter(n => n > 0)
    
    const maxCitationNumber = citationNumbers.length > 0 ? Math.max(...citationNumbers) : 0
    const startCitationCounter = maxCitationNumber + 1

    // Re-identify citations in the edited paragraph
    const { updatedParagraph, newCitations, removedCitationIds, nextCitationCounter } = 
      reidentifyCitationsInParagraph(editedParagraph, citations, startCitationCounter)

    // Remove old citations that were in this paragraph
    const updatedCitations = citations.filter(
      (c: Citation) => !removedCitationIds.includes(c.id)
    )

    // Add new citations (without validation yet - we'll validate them next)
    updatedCitations.push(...newCitations)

    // Update paragraph in content
    content[paragraphIndex] = updatedParagraph

    // Update document with new citations (before validation)
    jsonData.document.citations = updatedCitations
    jsonData.document.metadata = {
      ...jsonData.document.metadata,
      totalCitations: updatedCitations.length,
    }

    // Save intermediate state (paragraph updated, citations re-identified)
    await prisma.citationCheck.update({
      where: { id },
      data: {
        jsonData: jsonData as any,
      },
    })

    // Validate the new citations (Tier 2 and Tier 3 if needed)
    const newCitationIds = newCitations.map(c => c.id)
    if (newCitationIds.length > 0) {
      try {
        const validatedCitations = await validateParagraphCitations(
          jsonData,
          paragraphId,
          newCitationIds
        )

        // Update citations with validation results
        for (const validatedCitation of validatedCitations) {
          const citationIndex = updatedCitations.findIndex(
            (c: Citation) => c.id === validatedCitation.id
          )
          if (citationIndex !== -1) {
            updatedCitations[citationIndex] = validatedCitation
          }
        }

        // Update document with validated citations
        jsonData.document.citations = updatedCitations
      } catch (validationError) {
        logger.error("Error validating citations after edit", validationError, 'EditParagraph')
        // Continue even if validation fails - citations are still re-identified
      }
    }

    // Final save with validated citations
    const updated = await prisma.citationCheck.update({
      where: { id },
      data: {
        jsonData: jsonData as any,
      },
    })

    return NextResponse.json({
      paragraph: updatedParagraph,
      newCitations: newCitations.map(c => c.id),
      removedCitations: removedCitationIds,
      checkId: updated.id,
    })
  } catch (error) {
    return handleApiError(error, 'EditParagraph')
  }
}

