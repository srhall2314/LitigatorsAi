import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string; testRunId: string }> }
) {
  try {
    const { fileId, testRunId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Get all citation checks for this file
    const checks = await prisma.citationCheck.findMany({
      where: { fileUploadId: fileId },
      orderBy: { version: "asc" },
      select: {
        id: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        jsonData: true,
      },
    })
    
    // Filter checks that belong to this test run
    const testRunChecks = checks.filter(check => {
      const jsonData = check.jsonData as any
      const metadata = jsonData?.document?.metadata
      return metadata?.testRunId === testRunId
    })

    if (testRunChecks.length === 0) {
      return NextResponse.json({ 
        error: "Test run not found",
      }, { status: 404 })
    }

    // Extract metadata from first check
    const firstCheck = testRunChecks[0]
    const firstJsonData = firstCheck.jsonData as any
    const metadata = firstJsonData?.document?.metadata
    const testRunTotal = metadata?.testRunTotal || testRunChecks.length

    // Build export structure: citationId -> runs data
    const citationData = new Map<string, {
      citationId: string
      citationText: string
      citationType?: string
      runs: Array<{
        runNumber: number
        checkId: string
        version: number
        tier2?: {
          panel_evaluation: Array<{
            agent: string
            verdict: string
            invalid_reason?: string
            uncertain_reason?: string
            timestamp: string
            model: string
          }>
          consensus: {
            agreement_level: string
            verdict_counts: {
              VALID: number
              INVALID: number
              UNCERTAIN: number
            }
            recommendation: string
            tier_3_trigger: boolean
          }
        }
        tier3?: {
          panel_evaluation: Array<{
            agent: string
            verdict: string
            invalid_reason?: string
            uncertain_reason?: string
            timestamp: string
            model: string
          }>
          consensus: {
            agreement_level: string
            verdict_counts: {
              VALID: number
              INVALID: number
              UNCERTAIN: number
            }
            final_status: string
            confidence_score: number
          }
        }
      }>
    }>()

    // Process each run
    for (const check of testRunChecks) {
      const jsonData = check.jsonData as any
      const citations = jsonData?.document?.citations || []
      const runMetadata = jsonData?.document?.metadata
      const runNumber = runMetadata?.testRunNumber || check.version

      for (const citation of citations) {
        const citationId = citation.id
        
        if (!citationData.has(citationId)) {
          citationData.set(citationId, {
            citationId,
            citationText: citation.text || '',
            citationType: citation.type,
            runs: [],
          })
        }

        const citationEntry = citationData.get(citationId)!
        
        const runData: any = {
          runNumber,
          checkId: check.id,
          version: check.version,
        }

        // Add Tier 2 data if available
        if (citation.validation?.panel_evaluation) {
          runData.tier2 = {
            panel_evaluation: citation.validation.panel_evaluation.map((eval_: any) => ({
              agent: eval_.agent,
              // New format: include score and reasoning
              score: eval_.score,
              reasoning: eval_.reasoning,
              // Legacy format: include verdict and reasons
              verdict: eval_.verdict,
              invalid_reason: eval_.invalid_reason,
              uncertain_reason: eval_.uncertain_reason,
              timestamp: eval_.timestamp,
              model: eval_.model,
              // Include token usage and cost
              token_usage: eval_.token_usage,
              cost: eval_.cost,
            })),
            consensus: {
              agreement_level: citation.validation.consensus?.agreement_level,
              // New format: include scores and statistics
              scores: citation.validation.consensus?.scores,
              average_score: citation.validation.consensus?.average_score,
              variance: citation.validation.consensus?.variance,
              standard_deviation: citation.validation.consensus?.standard_deviation,
              // Legacy format: include verdict_counts
              verdict_counts: citation.validation.consensus?.verdict_counts,
              recommendation: citation.validation.consensus?.recommendation,
              tier_3_trigger: citation.validation.consensus?.tier_3_trigger,
              confidence_score: citation.validation.consensus?.confidence_score,
              reasoning: citation.validation.consensus?.reasoning,
            },
            // Include run_cost if available
            run_cost: citation.validation.run_cost,
          }
        }

        // Add Tier 3 data if available
        if (citation.tier_3?.panel_evaluation) {
          runData.tier3 = {
            panel_evaluation: citation.tier_3.panel_evaluation.map((eval_: any) => ({
              agent: eval_.agent,
              // New format: include risk_level and reasoning
              risk_level: eval_.risk_level,
              reasoning: eval_.reasoning,
              // Legacy format: include verdict and reasons
              verdict: eval_.verdict,
              invalid_reason: eval_.invalid_reason,
              uncertain_reason: eval_.uncertain_reason,
              timestamp: eval_.timestamp,
              model: eval_.model,
              // Include token usage and cost
              token_usage: eval_.token_usage,
              cost: eval_.cost,
            })),
            consensus: {
              agreement_level: citation.tier_3.consensus?.agreement_level,
              // New format: include risk_level_counts and final_risk_level
              risk_level_counts: citation.tier_3.consensus?.risk_level_counts,
              final_risk_level: citation.tier_3.consensus?.final_risk_level,
              // Legacy format: include verdict_counts and final_status
              verdict_counts: citation.tier_3.consensus?.verdict_counts,
              final_status: citation.tier_3.consensus?.final_status,
              confidence_score: citation.tier_3.consensus?.confidence_score,
              reasoning: citation.tier_3.consensus?.reasoning,
            },
            // Include Tier3Result top-level fields
            run_cost: citation.tier_3.run_cost,
            timestamp: citation.tier_3.timestamp,
            model: citation.tier_3.model,
            // Legacy fields
            reasoning: citation.tier_3.reasoning,
            key_evidence: citation.tier_3.key_evidence,
          }
        }

        citationEntry.runs.push(runData)
      }
    }

    // Convert to array and sort by citationId
    const exportData = {
      testRunId,
      fileId,
      testRunTotal,
      runsCompleted: testRunChecks.length,
      exportedAt: new Date().toISOString(),
      citations: Array.from(citationData.values())
        .sort((a, b) => a.citationId.localeCompare(b.citationId))
        .map(citation => ({
          ...citation,
          runs: citation.runs.sort((a, b) => a.runNumber - b.runNumber),
        })),
    }

    // Return as JSON with download headers
    return NextResponse.json(exportData, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="test-run-${testRunId}-export.json"`,
      },
    })
  } catch (error) {
    return handleApiError(error, 'ExportTestRun')
  }
}

