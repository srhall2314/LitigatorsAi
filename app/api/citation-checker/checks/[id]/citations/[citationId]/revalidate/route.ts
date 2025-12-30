import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateCitationWithPanel, validateCitationTier3 } from "@/lib/citation-identification/validation"
import { extractDocumentContext } from "@/lib/citation-identification/context-extractor"
import { ANTHROPIC_API_KEY } from "@/lib/env"
import { CitationDocument, Citation } from "@/types/citation-json"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; citationId: string }> }
) {
  try {
    const { id, citationId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      )
    }

    // Load CitationCheck by checkId
    const currentCheck = await prisma.citationCheck.findUnique({
      where: { id },
    })

    if (!currentCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    if (!currentCheck.jsonData) {
      return NextResponse.json(
        { error: "JSON data not found. Please generate JSON first." },
        { status: 400 }
      )
    }

    const jsonData = currentCheck.jsonData as unknown as CitationDocument
    
    // Find citation by citationId
    if (!jsonData.document?.citations) {
      return NextResponse.json(
        { error: "No citations found in document." },
        { status: 400 }
      )
    }

    const citationIndex = jsonData.document.citations.findIndex(
      (c: Citation) => c.id === citationId
    )

    if (citationIndex === -1) {
      return NextResponse.json(
        { error: `Citation ${citationId} not found` },
        { status: 404 }
      )
    }

    const citation = jsonData.document.citations[citationIndex]

    // Extract context using extractDocumentContext
    const context = extractDocumentContext(citationId, jsonData, true)

    // Get request body to check for forceTier3 flag
    const body = await request.json().catch(() => ({}))
    const forceTier3 = body.forceTier3 === true

    // Run Tier 2 validation
    const validation = await validateCitationWithPanel(
      citation,
      context,
      ANTHROPIC_API_KEY
    )

    // Check if Tier 3 is needed (either triggered by Tier 2 or forced by flag)
    let tier3Result = null
    if (validation.consensus.tier_3_trigger || forceTier3) {
      // Run Tier 3 validation
      tier3Result = await validateCitationTier3(
        citation,
        context,
        validation,
        ANTHROPIC_API_KEY
      )
    }

    // Update citation in jsonData.document.citations array
    const updatedCitation: Citation = {
      ...citation,
      validation,
      tier_3: tier3Result,
    }

    jsonData.document.citations[citationIndex] = updatedCitation

    // Update CitationCheck using PATCH to save updated jsonData
    const updated = await prisma.citationCheck.update({
      where: { id },
      data: {
        jsonData: jsonData as any,
      },
    })

    // Return updated citation object
    return NextResponse.json({
      citation: updatedCitation,
      checkId: updated.id,
    })
  } catch (error) {
    return handleApiError(error, 'RevalidateCitation')
  }
}

