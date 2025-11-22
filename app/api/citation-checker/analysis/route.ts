import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CitationDocument, Citation, CitationValidation, AnalysisStatistics, Tier3Verdict, ValidationVerdict, AgreementLevel } from "@/types/citation-json"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Query all CitationCheck records
    const citationChecks = await prisma.citationCheck.findMany({
      where: {
        jsonData: {
          not: null,
        },
      },
    })

    // Initialize statistics
    const stats: AnalysisStatistics = {
      completion: {
        total: 0,
        tier1Only: 0,
        tier1And2: 0,
        allThreeTiers: 0,
        completionRates: {
          tier1: 0,
          tier2: 0,
          tier3: 0,
        },
      },
      tier2Voting: {
        validVotes: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        invalidVotes: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        uncertainVotes: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        agreementLevels: {
          unanimous: 0,
          strong: 0,
          split: 0,
        },
      },
      tier3Validation: {
        escalated: 0,
        analyzed: 0,
        escalationRate: 0,
        tier3WithUnanimousTier2: 0,
        tier3WithUnanimousTier2Rate: 0,
        verdicts: {
          VERIFIED_REAL: 0,
          LIKELY_REAL: 0,
          LIKELY_FABRICATED: 0,
          NEEDS_HUMAN_REVIEW: 0,
        },
      },
      agentAgreement: {
        pairwiseMatrix: {},
        agentStats: {},
      },
      efficiency: {
        unanimousDecisions: 0,
        unanimousRate: 0,
        escalationRate: 0,
        averageConfidence: {
          tier2: 0,
          tier3: 0,
        },
      },
    }

    // Agent names for tracking
    const agentNames = [
      'citation_authority_validator_v1',
      'case_ecology_validator_v1',
      'temporal_reality_validator_v1',
      'legal_knowledge_validator_v1',
      'reality_assessment_expert_v1',
    ]

    // Initialize agent stats
    agentNames.forEach(agent => {
      stats.agentAgreement.agentStats[agent] = {
        valid: 0,
        invalid: 0,
        uncertain: 0,
      }
    })

    // Initialize pairwise matrix
    agentNames.forEach(agent1 => {
      stats.agentAgreement.pairwiseMatrix[agent1] = {}
      agentNames.forEach(agent2 => {
        stats.agentAgreement.pairwiseMatrix[agent1][agent2] = 0
      })
    })

    let totalCitations = 0
    let citationsWithTier1 = 0
    let citationsWithTier2 = 0
    let citationsWithTier3 = 0
    let totalTier2Confidence = 0
    let tier2ConfidenceCount = 0
    let totalTier3Confidence = 0
    let tier3ConfidenceCount = 0

    // Track documents that completed all 3 tiers
    let documentsWithAllThreeTiers = 0
    let citationsInCompleteDocuments = 0
    let invalidCitationsInCompleteDocuments = 0
    let tier2Unanimous5of5InCompleteDocuments = 0
    let tier2ValidatedInCompleteDocuments = 0
    let tier3RunsInCompleteDocuments = 0
    let tier3ValidatedInCompleteDocuments = 0
    // Track VALID vote distribution in completed documents
    const validVoteDistributionInComplete: Record<0 | 1 | 2 | 3 | 4 | 5, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

    // Process each citation check
    for (const check of citationChecks) {
      if (!check.jsonData) continue

      try {
        const jsonData = check.jsonData as any
        const document = jsonData.document as CitationDocument['document']
        
        if (!document?.citations || !Array.isArray(document.citations)) {
          continue
        }

        // Check if this document has all citations through all 3 tiers
        let documentHasAllThreeTiers = true
        let documentInvalidCount = 0
        let documentTotalCitations = document.citations.length
        let documentTier2Unanimous5of5Count = 0
        let documentTier2ValidatedCount = 0
        let documentTier3RunsCount = 0
        let documentTier3ValidatedCount = 0
        // Track distribution temporarily - only add if document completes
        const documentDistribution: Record<0 | 1 | 2 | 3 | 4 | 5, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

        for (const citation of document.citations as Citation[]) {
          const hasTier1 = citation.tier_1 !== null && citation.tier_1 !== undefined
          const hasTier2 = citation.validation !== null && citation.validation !== undefined
          
          // A citation has completed all 3 tiers if:
          // - Has Tier 1 AND Tier 2 AND
          // - Either has Tier 3 (escalated) OR Tier 2 didn't trigger escalation (passed)
          const tier3Triggered = citation.validation?.consensus?.tier_3_trigger === true
          const hasTier3 = citation.tier_3 !== null && citation.tier_3 !== undefined
          const completedAllThree = hasTier1 && hasTier2 && (hasTier3 || !tier3Triggered)

          if (!completedAllThree) {
            documentHasAllThreeTiers = false
          } else {
            // Count invalid citations
            // Invalid if: Tier 3 verdict is LIKELY_FABRICATED or NEEDS_HUMAN_REVIEW
            // OR if Tier 2 consensus flagged it but no Tier 3 yet (shouldn't happen if completed)
            if (hasTier3 && citation.tier_3 && (
              citation.tier_3.verdict === 'LIKELY_FABRICATED' || 
              citation.tier_3.verdict === 'NEEDS_HUMAN_REVIEW'
            )) {
              documentInvalidCount++
            }

            // Count Tier 2 validated citations - citations where consensus recommendation is CITATION_LIKELY_VALID
            if (hasTier2 && citation.validation && citation.validation.consensus) {
              if (citation.validation.consensus.recommendation === 'CITATION_LIKELY_VALID') {
                documentTier2ValidatedCount++
              }
            }

            // Count Tier 3 runs (escalations) - citations that were escalated to Tier 3
            if (tier3Triggered) {
              documentTier3RunsCount++
            }

            // Count Tier 3 validated citations - citations where Tier 3 verdict is VERIFIED_REAL or LIKELY_REAL
            if (hasTier3 && citation.tier_3) {
              if (citation.tier_3.verdict === 'VERIFIED_REAL' || citation.tier_3.verdict === 'LIKELY_REAL') {
                documentTier3ValidatedCount++
              }
            }

            // Count Tier 2 citations with 5/5 VALID votes in completed documents
            // Only count if citation actually has Tier 2 validation data
            if (hasTier2 && citation.validation && citation.validation.panel_evaluation) {
              const validCount = citation.validation.panel_evaluation.filter(e => e.verdict === 'VALID').length
              // Track distribution temporarily (only add if document completes)
              if (citation.validation.panel_evaluation.length === 5 && validCount >= 0 && validCount <= 5) {
                documentDistribution[validCount as 0 | 1 | 2 | 3 | 4 | 5]++
              }
              // Only count if exactly 5 agents voted VALID
              if (validCount === 5 && citation.validation.panel_evaluation.length === 5) {
                documentTier2Unanimous5of5Count++
              }
            }
          }
        }

        // Track documents with all citations through all 3 tiers
        if (documentHasAllThreeTiers && documentTotalCitations > 0) {
          documentsWithAllThreeTiers++
          citationsInCompleteDocuments += documentTotalCitations
          invalidCitationsInCompleteDocuments += documentInvalidCount
          tier2Unanimous5of5InCompleteDocuments += documentTier2Unanimous5of5Count
          tier2ValidatedInCompleteDocuments += documentTier2ValidatedCount
          tier3RunsInCompleteDocuments += documentTier3RunsCount
          tier3ValidatedInCompleteDocuments += documentTier3ValidatedCount
          // Add distribution to global count only if document completed
          for (let i = 0; i <= 5; i++) {
            validVoteDistributionInComplete[i as 0 | 1 | 2 | 3 | 4 | 5] += documentDistribution[i as 0 | 1 | 2 | 3 | 4 | 5]
          }
        }

        for (const citation of document.citations as Citation[]) {
          totalCitations++
          
          // Check completion status
          const hasTier1 = citation.tier_1 !== null && citation.tier_1 !== undefined
          const hasTier2 = citation.validation !== null && citation.validation !== undefined
          const hasTier3 = citation.tier_3 !== null && citation.tier_3 !== undefined

          if (hasTier1) citationsWithTier1++
          if (hasTier2) citationsWithTier2++
          if (hasTier3) citationsWithTier3++

          if (hasTier1 && !hasTier2 && !hasTier3) {
            stats.completion.tier1Only++
          } else if (hasTier1 && hasTier2 && !hasTier3) {
            stats.completion.tier1And2++
          } else if (hasTier1 && hasTier2 && hasTier3) {
            stats.completion.allThreeTiers++
          }

          // Process Tier 2 validation data
          if (hasTier2 && citation.validation) {
            const validation = citation.validation as CitationValidation
            
            // Count votes
            const validCount = validation.panel_evaluation?.filter(e => e.verdict === 'VALID').length || 0
            const invalidCount = validation.panel_evaluation?.filter(e => e.verdict === 'INVALID').length || 0
            const uncertainCount = validation.panel_evaluation?.filter(e => e.verdict === 'UNCERTAIN').length || 0

            // Update vote distributions
            if (validCount >= 0 && validCount <= 5) {
              stats.tier2Voting.validVotes[validCount as 0 | 1 | 2 | 3 | 4 | 5]++
            }
            if (invalidCount >= 0 && invalidCount <= 5) {
              stats.tier2Voting.invalidVotes[invalidCount as 0 | 1 | 2 | 3 | 4 | 5]++
            }
            if (uncertainCount >= 0 && uncertainCount <= 5) {
              stats.tier2Voting.uncertainVotes[uncertainCount as 0 | 1 | 2 | 3 | 4 | 5]++
            }

            // Track agreement levels
            if (validation.consensus) {
              const agreementLevel = validation.consensus.agreement_level
              if (agreementLevel === 'unanimous') {
                stats.tier2Voting.agreementLevels.unanimous++
                // Check if it's unanimous VALID (5/5)
                if (validCount === 5) {
                  stats.efficiency.unanimousDecisions++
                }
              } else if (agreementLevel === 'strong') {
                stats.tier2Voting.agreementLevels.strong++
              } else if (agreementLevel === 'split') {
                stats.tier2Voting.agreementLevels.split++
              }

              // Track confidence scores
              if (validation.consensus.confidence_score !== undefined) {
                totalTier2Confidence += validation.consensus.confidence_score
                tier2ConfidenceCount++
              }

              // Track escalation
              if (validation.consensus.tier_3_trigger) {
                stats.tier3Validation.escalated++
              }
            }

            // Track agent-specific statistics
            if (validation.panel_evaluation) {
              for (const eval_ of validation.panel_evaluation) {
                const agentName = eval_.agent
                if (stats.agentAgreement.agentStats[agentName]) {
                  if (eval_.verdict === 'VALID') {
                    stats.agentAgreement.agentStats[agentName].valid++
                  } else if (eval_.verdict === 'INVALID') {
                    stats.agentAgreement.agentStats[agentName].invalid++
                  } else if (eval_.verdict === 'UNCERTAIN') {
                    stats.agentAgreement.agentStats[agentName].uncertain++
                  }
                }
              }

              // Calculate pairwise agreement (symmetric matrix)
              for (let i = 0; i < validation.panel_evaluation.length; i++) {
                for (let j = i + 1; j < validation.panel_evaluation.length; j++) {
                  const agent1 = validation.panel_evaluation[i].agent
                  const agent2 = validation.panel_evaluation[j].agent
                  if (validation.panel_evaluation[i].verdict === validation.panel_evaluation[j].verdict) {
                    // Update both directions for symmetric matrix
                    if (stats.agentAgreement.pairwiseMatrix[agent1] && stats.agentAgreement.pairwiseMatrix[agent1][agent2] !== undefined) {
                      stats.agentAgreement.pairwiseMatrix[agent1][agent2]++
                    }
                    if (stats.agentAgreement.pairwiseMatrix[agent2] && stats.agentAgreement.pairwiseMatrix[agent2][agent1] !== undefined) {
                      stats.agentAgreement.pairwiseMatrix[agent2][agent1]++
                    }
                  }
                }
              }
            }
          }

          // Process Tier 3 data
          if (hasTier3 && citation.tier_3) {
            stats.tier3Validation.analyzed++
            
            // Check if this Tier 3 citation had unanimous 5/5 VALID votes in Tier 2
            if (hasTier2 && citation.validation) {
              const validCount = citation.validation.panel_evaluation?.filter(e => e.verdict === 'VALID').length || 0
              if (validCount === 5) {
                stats.tier3Validation.tier3WithUnanimousTier2++
              }
            }
            
            // Track Tier 3 verdicts
            const verdict = citation.tier_3.verdict
            if (verdict && stats.tier3Validation.verdicts[verdict] !== undefined) {
              stats.tier3Validation.verdicts[verdict]++
            }

            // Track Tier 3 confidence (convert to numeric for averaging)
            if (citation.tier_3.confidence) {
              const confidenceMap: Record<string, number> = { high: 0.8, medium: 0.5, low: 0.2 }
              const numericConfidence = confidenceMap[citation.tier_3.confidence] || 0
              totalTier3Confidence += numericConfidence
              tier3ConfidenceCount++
            }
          }
        }
      } catch (error) {
        console.error(`Error processing citation check ${check.id}:`, error)
        continue
      }
    }

    // Calculate completion rates
    stats.completion.total = totalCitations
    if (totalCitations > 0) {
      stats.completion.completionRates.tier1 = (citationsWithTier1 / totalCitations) * 100
      stats.completion.completionRates.tier2 = (citationsWithTier2 / totalCitations) * 100
      stats.completion.completionRates.tier3 = (citationsWithTier3 / totalCitations) * 100
    }

    // Calculate escalation rate
    if (citationsWithTier2 > 0) {
      stats.tier3Validation.escalationRate = (stats.tier3Validation.escalated / citationsWithTier2) * 100
    }

    // Calculate Tier 3 with unanimous Tier 2 rate
    if (stats.tier3Validation.analyzed > 0) {
      stats.tier3Validation.tier3WithUnanimousTier2Rate = (stats.tier3Validation.tier3WithUnanimousTier2 / stats.tier3Validation.analyzed) * 100
    }

    // Calculate efficiency metrics
    if (citationsWithTier2 > 0) {
      stats.efficiency.unanimousRate = (stats.efficiency.unanimousDecisions / citationsWithTier2) * 100
      stats.efficiency.escalationRate = stats.tier3Validation.escalationRate
    }

    // Calculate average confidence scores
    if (tier2ConfidenceCount > 0) {
      stats.efficiency.averageConfidence.tier2 = totalTier2Confidence / tier2ConfidenceCount
    }
    if (tier3ConfidenceCount > 0) {
      stats.efficiency.averageConfidence.tier3 = totalTier3Confidence / tier3ConfidenceCount
    }

    // Add statistics for documents through all 3 tiers
    const invalidPercentage = citationsInCompleteDocuments > 0 
      ? (invalidCitationsInCompleteDocuments / citationsInCompleteDocuments) * 100 
      : 0
    
    const tier2Unanimous5of5Percentage = citationsInCompleteDocuments > 0
      ? (tier2Unanimous5of5InCompleteDocuments / citationsInCompleteDocuments) * 100
      : 0

    // Verify the math: distribution should sum to total citations
    const distributionSum = Object.values(validVoteDistributionInComplete).reduce((a, b) => a + b, 0)
    if (distributionSum !== citationsInCompleteDocuments) {
      console.warn(`[Analysis API] Distribution sum (${distributionSum}) doesn't match total citations (${citationsInCompleteDocuments})`)
    }
    if (validVoteDistributionInComplete[5] !== tier2Unanimous5of5InCompleteDocuments) {
      console.warn(`[Analysis API] Distribution 5/5 count (${validVoteDistributionInComplete[5]}) doesn't match tracked count (${tier2Unanimous5of5InCompleteDocuments})`)
    }

    const response = {
      ...stats,
      documentsThroughAllThree: {
        documentRuns: documentsWithAllThreeTiers,
        totalCitations: citationsInCompleteDocuments,
        invalidCitations: invalidCitationsInCompleteDocuments,
        invalidPercentage: invalidPercentage,
        tier2Unanimous5of5Count: tier2Unanimous5of5InCompleteDocuments,
        tier2Unanimous5of5Percentage: tier2Unanimous5of5Percentage,
        tier2Validated: tier2ValidatedInCompleteDocuments,
        tier3Runs: tier3RunsInCompleteDocuments,
        tier3Validated: tier3ValidatedInCompleteDocuments,
        tier2ValidVoteDistribution: validVoteDistributionInComplete,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error generating analysis statistics:", error)
    return NextResponse.json(
      { 
        error: "Failed to generate analysis statistics",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

