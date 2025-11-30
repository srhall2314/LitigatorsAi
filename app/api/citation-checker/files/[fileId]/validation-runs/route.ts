import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getTier3FinalStatus } from "@/lib/citation-identification/validation"
import { getCitationRiskLevel } from "@/lib/citation-identification/format-helpers"

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
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

    // Get all citation checks for this file, ordered by version (newest first)
    const checks = await prisma.citationCheck.findMany({
      where: { fileUploadId: params.fileId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        jsonData: true,
      },
    })

    // Get the latest version to determine which is current
    const latestVersion = checks.length > 0 ? checks[0].version : 0

    // Process each check to extract summary statistics
    const runs = checks
      .filter(check => {
        // Only include checks that have validation results
        const jsonData = check.jsonData as any
        const citations = jsonData?.document?.citations || []
        return citations.some((citation: any) => citation.validation)
      })
      .map(check => {
        const jsonData = check.jsonData as any
        const citations = jsonData?.document?.citations || []
        
        // Calculate statistics
        let validCount = 0
        let invalidCount = 0
        let uncertainCount = 0
        let tier3Count = 0
        let totalTokens = 0
        let totalCost = 0

        for (const citation of citations) {
          if (citation.validation) {
            // Use risk-based evaluation
            const riskLevel = getCitationRiskLevel(citation)
            if (riskLevel === 'LOW_RISK') {
              validCount++
            } else if (riskLevel === 'NEEDS_ADDITIONAL_REVIEW') {
              invalidCount++
            } else if (riskLevel === 'MODERATE_RISK') {
              uncertainCount++
            }
            
            // Track Tier 3 count separately
            if (citation.tier_3) {
              tier3Count++
            }

            // Aggregate token usage
            if (citation.validation?.run_cost) {
              totalCost += citation.validation.run_cost.total.total_cost || 0
            }
            if (citation.tier_3?.run_cost) {
              totalCost += citation.tier_3.run_cost.total.total_cost || 0
            }

            // Aggregate tokens from panel evaluations
            if (citation.validation?.panel_evaluation) {
              for (const verdict of citation.validation.panel_evaluation) {
                if (verdict.token_usage) {
                  totalTokens += verdict.token_usage.total_tokens || 0
                }
              }
            }
            if (citation.tier_3?.panel_evaluation) {
              for (const verdict of citation.tier_3.panel_evaluation) {
                if (verdict.token_usage) {
                  totalTokens += verdict.token_usage.total_tokens || 0
                }
              }
            }
          }
        }

        return {
          id: check.id,
          version: check.version,
          status: check.status,
          createdAt: check.createdAt.toISOString(),
          updatedAt: check.updatedAt.toISOString(),
          isCurrent: check.version === latestVersion,
          statistics: {
            totalCitations: citations.length,
            valid: validCount,
            invalid: invalidCount,
            uncertain: uncertainCount,
            tier3Reviewed: tier3Count,
            totalTokens,
            totalCost,
          },
        }
      })

    return NextResponse.json({ runs })
  } catch (error) {
    console.error("Error fetching validation runs:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

