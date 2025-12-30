import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTier3FinalStatus } from "@/lib/citation-identification/validation"
import { getCitationRiskLevel } from "@/lib/citation-identification/format-helpers"
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
    // Use findMany with full jsonData to ensure we get the latest updates
    const checks = await prisma.citationCheck.findMany({
      where: { fileUploadId: fileId },
      orderBy: { version: "asc" },
      select: {
        id: true,
        version: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        jsonData: true,
        workflowType: true,
        workflowId: true,
        workflowMetadata: true,
      },
    })
    
    // Ensure we have the latest data by checking if any checks have been updated recently
    // This helps avoid stale data issues

    // Filter checks that belong to this test run
    // Use workflowId if available, fallback to jsonData for non-migrated records
    const testRunChecks = checks.filter(check => {
      // Use workflowId from database if available
      if (check.workflowType === "test_run" && check.workflowId === testRunId) {
        const metadata = check.workflowMetadata as any
        logger.debug(`Found test run check`, { checkId: check.id, version: check.version, testRunNumber: metadata?.testRunNumber }, 'TestRuns')
        const citations = (check.jsonData as any)?.document?.citations || []
        const citationsWithValidation = citations.filter((c: any) => c.validation).length
        logger.debug(`Check citations with validation`, { checkId: check.id, citationsWithValidation, totalCitations: citations.length }, 'TestRuns')
        return true
      }
      
      // Fallback: check jsonData for non-migrated records
      const jsonData = check.jsonData as any
      const metadata = jsonData?.document?.metadata
      const matches = metadata?.testRunId === testRunId
      if (matches) {
        logger.debug(`Found test run check (from jsonData)`, { checkId: check.id, version: check.version, testRunNumber: metadata?.testRunNumber }, 'TestRuns')
        const citations = jsonData?.document?.citations || []
        const citationsWithValidation = citations.filter((c: any) => c.validation).length
        logger.debug(`Check citations with validation`, { checkId: check.id, citationsWithValidation, totalCitations: citations.length }, 'TestRuns')
      }
      return matches
    })

    if (testRunChecks.length === 0) {
      return NextResponse.json({ 
        error: "Test run not found",
        runs: [],
        statistics: null,
      })
    }

    // Extract metadata from first check to get test run info
    const firstCheck = testRunChecks[0]
    const firstJsonData = firstCheck.jsonData as any
    const metadata = firstJsonData?.document?.metadata
    const testRunTotal = metadata?.testRunTotal || testRunChecks.length

    // Process each check to extract summary statistics
    const runs = testRunChecks.map(check => {
      const jsonData = check.jsonData as any
      const citations = jsonData?.document?.citations || []
      const runMetadata = jsonData?.document?.metadata
      const runNumber = runMetadata?.testRunNumber || check.version
      
      // Calculate statistics
      let validCount = 0
      let invalidCount = 0
      let uncertainCount = 0
      let tier3Count = 0
      let totalTokens = 0
      let totalCost = 0
      let totalValidatedCount = 0 // Track citations with validation data

      for (const citation of citations) {
        if (citation.validation) {
          totalValidatedCount++ // Count all citations with validation
          
          // Use risk-based evaluation
          const riskLevel = getCitationRiskLevel(citation)
          
          // Count all validated citations - getCitationRiskLevel should never return null if validation exists
          // but handle all cases to ensure every validated citation is counted
          if (riskLevel === 'LOW_RISK') {
            validCount++
          } else if (riskLevel === 'NEEDS_ADDITIONAL_REVIEW') {
            invalidCount++
          } else if (riskLevel === 'MODERATE_RISK') {
            uncertainCount++
          } else if (riskLevel === null) {
            // This shouldn't happen if validation exists, but handle it
            logger.warn(`Citation has validation but getCitationRiskLevel returned null`, { runNumber, citationId: citation.id }, 'TestRuns')
            uncertainCount++ // Count as MODERATE_RISK
          } else {
            // Unknown risk level - log warning and count as MODERATE_RISK
            logger.warn(`Unknown risk level for citation`, { runNumber, citationId: citation.id, riskLevel }, 'TestRuns')
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

      // Verify counts match - all validated citations should be counted
      const sumOfRisks = validCount + invalidCount + uncertainCount
      if (sumOfRisks !== totalValidatedCount) {
        logger.error(`CRITICAL - Risk count mismatch`, { runNumber, sumOfRisks, totalValidatedCount, totalCitations: citations.length }, 'TestRuns')
        // This should never happen - if it does, there's a bug in getCitationRiskLevel or the counting logic
        // For now, we'll add the missing citations to uncertainCount to make the numbers match
        const missing = totalValidatedCount - sumOfRisks
        if (missing > 0) {
          logger.error(`Adding missing citations to uncertainCount`, { runNumber, missing }, 'TestRuns')
          uncertainCount += missing
        }
      }

      return {
        id: check.id,
        version: check.version,
        runNumber,
        status: check.status,
        createdAt: check.createdAt.toISOString(),
        updatedAt: check.updatedAt.toISOString(),
        statistics: {
          totalCitations: citations.length,
          totalValidated: totalValidatedCount, // Add validated count for debugging
          valid: validCount,
          invalid: invalidCount,
          uncertain: uncertainCount,
          tier3Reviewed: tier3Count,
          totalTokens,
          totalCost,
        },
      }
    })

    // Calculate consistency statistics
    const validCounts = runs.map(r => r.statistics.valid)
    const invalidCounts = runs.map(r => r.statistics.invalid)
    const avgValid = validCounts.reduce((a, b) => a + b, 0) / validCounts.length
    const variance = validCounts.reduce((sum, val) => sum + Math.pow(val - avgValid, 2), 0) / validCounts.length
    const stdDev = Math.sqrt(variance)
    const consistency = stdDev === 0 ? 100 : Math.max(0, 100 - (stdDev / Math.max(avgValid, 1)) * 100)

    // Calculate Tier 2 agent-level consistency across runs
    // For each citation, track how each agent voted across all runs
    // Consistency = how often did the agent vote the same way for the same citation across runs?
    const citationTier2AgentVerdicts = new Map<string, Map<string, string[]>>()
    // Structure: citationId -> agentName -> [verdict1, verdict2, verdict3, ...]

    // Calculate Tier 3 agent-level consistency across runs
    const citationTier3AgentVerdicts = new Map<string, Map<string, string[]>>()
    // Structure: citationId -> agentName -> [verdict1, verdict2, verdict3, ...]

    // Process each run to extract agent verdicts
    for (const check of testRunChecks) {
      const jsonData = check.jsonData as any
      const citations = jsonData?.document?.citations || []

      for (const citation of citations) {
        const citationId = citation.id

        // Process Tier 2 agent verdicts
        if (citation.validation?.panel_evaluation) {
          if (!citationTier2AgentVerdicts.has(citationId)) {
            citationTier2AgentVerdicts.set(citationId, new Map())
          }
          const agentVerdictsMap = citationTier2AgentVerdicts.get(citationId)!

          // Record each Tier 2 agent's verdict/score for this citation in this run
          for (const agentVerdict of citation.validation.panel_evaluation) {
            const agentName = agentVerdict.agent
            // New format: use score, legacy format: use verdict
            const verdict = typeof agentVerdict.score === 'number' 
              ? `SCORE_${agentVerdict.score}` 
              : agentVerdict.verdict || 'UNKNOWN'
            
            if (!agentVerdictsMap.has(agentName)) {
              agentVerdictsMap.set(agentName, [])
            }
            agentVerdictsMap.get(agentName)!.push(verdict)
          }
        }

        // Process Tier 3 agent verdicts (only for citations that were escalated)
        if (citation.tier_3?.panel_evaluation) {
          if (!citationTier3AgentVerdicts.has(citationId)) {
            citationTier3AgentVerdicts.set(citationId, new Map())
          }
          const tier3AgentVerdictsMap = citationTier3AgentVerdicts.get(citationId)!

          // Record each Tier 3 agent's risk level/verdict for this citation in this run
          for (const agentVerdict of citation.tier_3.panel_evaluation) {
            const agentName = agentVerdict.agent
            // New format: use risk_level, legacy format: use verdict
            const verdict = agentVerdict.risk_level || agentVerdict.verdict || 'UNKNOWN'
            
            if (!tier3AgentVerdictsMap.has(agentName)) {
              tier3AgentVerdictsMap.set(agentName, [])
            }
            tier3AgentVerdictsMap.get(agentName)!.push(verdict)
          }
        }
      }
    }

    // Helper function to calculate agent consistency
    const calculateAgentConsistency = (
      citationAgentVerdicts: Map<string, Map<string, string[]>>
    ): Array<{
      agentName: string
      uniqueCitations: number // Total unique citations evaluated
      multiRunCitations: number // Citations that appear in 2+ runs (for consistency calculation)
      consistentCitations: number
      averageConsistency: number
      totalEvaluations: number
      verdictDistribution: { VALID: number; INVALID: number; UNCERTAIN: number; [key: string]: number } // Allow for score-based keys
    }> => {
      const agentConsistencyMap = new Map<string, {
        agentName: string
        uniqueCitations: Set<string> // Track unique citations
        multiRunCitations: number
        consistentCitations: number
        averageConsistency: number
        totalEvaluations: number
        verdictDistribution: { [key: string]: number } // Dynamic distribution for scores/risk levels
      }>()

      // Process each agent
      for (const [citationId, agentVerdictsMap] of citationAgentVerdicts.entries()) {
        for (const [agentName, verdicts] of agentVerdictsMap.entries()) {
          // Initialize agent stats if needed
          if (!agentConsistencyMap.has(agentName)) {
            agentConsistencyMap.set(agentName, {
              agentName,
              uniqueCitations: new Set(),
              multiRunCitations: 0,
              consistentCitations: 0,
              averageConsistency: 0,
              totalEvaluations: 0,
              verdictDistribution: {},
            })
          }

          const agentStats = agentConsistencyMap.get(agentName)!
          
          // Track unique citations
          agentStats.uniqueCitations.add(citationId)
          agentStats.totalEvaluations += verdicts.length

          // Count verdicts/scores/risk levels for distribution
          for (const verdict of verdicts) {
            const key = verdict || 'UNKNOWN'
            agentStats.verdictDistribution[key] = (agentStats.verdictDistribution[key] || 0) + 1
          }

          // Only calculate consistency for citations that appear in 2+ runs
          if (verdicts.length >= 2) {
            agentStats.multiRunCitations++

            // Calculate consistency for this citation: how many times did they vote the same way?
            // For scores, consider them consistent if within 2 points of each other
            const verdictCounts = new Map<string, number>()
            const scores: number[] = []
            
            for (const verdict of verdicts) {
              // Check if it's a score-based verdict (format: SCORE_X)
              if (verdict.startsWith('SCORE_')) {
                const score = parseInt(verdict.replace('SCORE_', ''), 10)
                if (!isNaN(score)) {
                  scores.push(score)
                }
              } else {
                verdictCounts.set(verdict, (verdictCounts.get(verdict) || 0) + 1)
              }
            }
            
            let citationConsistency: number
            if (scores.length > 0) {
              // For scores: calculate consistency based on variance
              // If all scores are within 2 points, consider consistent
              const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
              const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length
              const stdDev = Math.sqrt(variance)
              // Consistency: 100% if stdDev <= 1, decreases as stdDev increases
              citationConsistency = stdDev <= 1 ? 100 : Math.max(0, 100 - (stdDev - 1) * 20)
            } else {
              // For verdicts: count how many times they voted the same way
              const maxCount = verdictCounts.size > 0 
                ? Math.max(...Array.from(verdictCounts.values()))
                : 0
              citationConsistency = (maxCount / verdicts.length) * 100
            }

            // Track if perfectly consistent (100% for verdicts, or stdDev <= 1 for scores)
            if (citationConsistency === 100 || (scores.length > 0 && citationConsistency >= 95)) {
              agentStats.consistentCitations++
            }

            // Update running average (only for multi-run citations)
            const currentTotal = (agentStats.averageConsistency * (agentStats.multiRunCitations - 1)) + citationConsistency
            agentStats.averageConsistency = currentTotal / agentStats.multiRunCitations
          }
        }
      }

      // Convert to array format and sort by consistency (most consistent first)
      return Array.from(agentConsistencyMap.values())
        .map(stats => ({
          agentName: stats.agentName,
          uniqueCitations: stats.uniqueCitations.size,
          multiRunCitations: stats.multiRunCitations,
          consistentCitations: stats.consistentCitations,
          averageConsistency: stats.multiRunCitations > 0 ? stats.averageConsistency : 0,
          totalEvaluations: stats.totalEvaluations,
          verdictDistribution: {
            // Include legacy format for backward compatibility
            VALID: stats.verdictDistribution['VALID'] || 0,
            INVALID: stats.verdictDistribution['INVALID'] || 0,
            UNCERTAIN: stats.verdictDistribution['UNCERTAIN'] || 0,
            // Include all other keys (scores, risk levels, etc.)
            ...Object.fromEntries(
              Object.entries(stats.verdictDistribution).filter(([key]) => 
                !['VALID', 'INVALID', 'UNCERTAIN'].includes(key)
              )
            ),
          },
        }))
        .sort((a, b) => b.averageConsistency - a.averageConsistency)
    }

    // Calculate Tier 2 agent consistency
    const tier2AgentConsistency = calculateAgentConsistency(citationTier2AgentVerdicts)
    
    // Calculate Tier 3 agent consistency
    const tier3AgentConsistency = calculateAgentConsistency(citationTier3AgentVerdicts)

    // Find the source check ID (the check used as template for test runs)
    const testRunVersions = testRunChecks.map(c => c.version).sort((a, b) => a - b)
    const firstTestRunVersion = Math.min(...testRunVersions)
    const sourceVersion = firstTestRunVersion - 1
    const sourceCheck = checks.find(c => c.version === sourceVersion)
    const sourceCheckId = sourceCheck?.id || null

    return NextResponse.json({
      testRunId,
      testRunTotal,
      runsCompleted: runs.length,
      runs,
      sourceCheckId, // ID of the check that was used as template
      statistics: {
        validRange: {
          min: Math.min(...validCounts),
          max: Math.max(...validCounts),
          avg: avgValid,
        },
        invalidRange: {
          min: Math.min(...invalidCounts),
          max: Math.max(...invalidCounts),
          avg: invalidCounts.reduce((a, b) => a + b, 0) / invalidCounts.length,
        },
        consistency: consistency.toFixed(1),
        totalTokens: runs.reduce((sum, r) => sum + r.statistics.totalTokens, 0),
        totalCost: runs.reduce((sum, r) => sum + r.statistics.totalCost, 0),
      },
      agentConsistency: tier2AgentConsistency,
      tier3AgentConsistency: tier3AgentConsistency,
    })
  } catch (error) {
    return handleApiError(error, 'GetTestRun')
  }
}

