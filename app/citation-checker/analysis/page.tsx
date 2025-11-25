import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { AnalysisStatistics, CitationDocument, Citation, CitationValidation, Tier3Verdict, Tier3FinalStatus, ValidationVerdict, AgreementLevel } from "@/types/citation-json"
import { getTier3FinalStatus } from "@/lib/citation-identification/validation"
import { prisma } from "@/lib/prisma"

async function getAnalysisData(): Promise<AnalysisStatistics | null> {
  try {
    // Query all CitationCheck records
    const citationChecks = await prisma.citationCheck.findMany({
      where: {
        jsonData: {
          not: null as any,
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
          VALID: 0,
          WARN: 0,
          FAIL: 0,
        },
        legacyVerdicts: {
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
      documentsThroughAllThree: {
        documentRuns: 0,
        totalCitations: 0,
        invalidCitations: 0,
        invalidPercentage: 0,
        tier2Unanimous5of5Count: 0,
        tier2Unanimous5of5Percentage: 0,
        tier2Validated: 0,
        tier3Runs: 0,
        tier3Validated: 0,
        tier2ValidVoteDistribution: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
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
            // Invalid if: Tier 3 final_status is FAIL or WARN
            // OR if Tier 2 consensus flagged it but no Tier 3 yet (shouldn't happen if completed)
            if (hasTier3 && citation.tier_3) {
              const tier3Status = getTier3FinalStatus(citation.tier_3)
              if (tier3Status === 'FAIL' || tier3Status === 'WARN') {
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

            // Count Tier 3 validated citations - citations where Tier 3 final_status is VALID
            if (hasTier3 && citation.tier_3) {
              const tier3Status = getTier3FinalStatus(citation.tier_3)
              if (tier3Status === 'VALID') {
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
      console.warn(`[Analysis] Distribution sum (${distributionSum}) doesn't match total citations (${citationsInCompleteDocuments})`)
    }
    if (validVoteDistributionInComplete[5] !== tier2Unanimous5of5InCompleteDocuments) {
      console.warn(`[Analysis] Distribution 5/5 count (${validVoteDistributionInComplete[5]}) doesn't match tracked count (${tier2Unanimous5of5InCompleteDocuments})`)
    }

    // Update documentsThroughAllThree with calculated values
    stats.documentsThroughAllThree = {
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
    }

    return stats
  } catch (error) {
    console.error('Error generating analysis data:', error)
    return null
  }
}

function BarChart({ 
  data, 
  maxValue, 
  color = 'bg-blue-500' 
}: { 
  data: Record<number, number>
  maxValue: number
  color?: string
}) {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4, 5].map((key) => {
        const value = data[key] || 0
        const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0
        return (
          <div key={key} className="flex items-center gap-2">
            <div className="w-8 text-sm text-black">{key}</div>
            <div className="flex-1 bg-gray-200 rounded h-6 relative overflow-hidden">
              <div
                className={`${color} h-full rounded transition-all`}
                style={{ width: `${percentage}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs text-black font-medium">
                {value > 0 && value}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  color = 'text-black' 
}: { 
  title: string
  value: string | number
  subtitle?: string
  color?: string
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
      <p className={`text-3xl font-semibold ${color} mb-1`}>{value}</p>
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
    </div>
  )
}

export default async function AnalysisPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  const stats = await getAnalysisData()

  if (!stats) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              <h1 className="text-4xl font-normal text-black mb-4">
                Citation Analysis
              </h1>
              <p className="text-black text-lg">
                Unable to load analysis data. Please try again later.
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const maxValidVotes = Math.max(...Object.values(stats.tier2Voting.validVotes))
  const maxInvalidVotes = Math.max(...Object.values(stats.tier2Voting.invalidVotes))
  const maxUncertainVotes = Math.max(...Object.values(stats.tier2Voting.uncertainVotes))
  const maxVotes = Math.max(maxValidVotes, maxInvalidVotes, maxUncertainVotes, 1)

  // Agent name abbreviations for display
  const agentDisplayNames: Record<string, string> = {
    'citation_authority_validator_v1': 'Authority',
    'case_ecology_validator_v1': 'Ecology',
    'temporal_reality_validator_v1': 'Temporal',
    'legal_knowledge_validator_v1': 'Knowledge',
    'reality_assessment_expert_v1': 'Reality',
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-black mb-2">
              Citation Analysis
            </h1>
            <p className="text-black text-lg">
              Statistics and insights on citation validation performance
            </p>
          </div>

          {/* Documents Through All 3 Tiers - Top Section */}
          <div className="border border-gray-200 rounded-lg p-6 mb-8 bg-blue-50">
            <h2 className="text-2xl font-semibold text-black mb-4">Documents Through All 3 Tiers</h2>
            <p className="text-gray-600 mb-6">
              Statistics for documents where all citations have completed Tier 1, Tier 2, and Tier 3 validation
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <StatCard
                title="Document Runs"
                value={stats.documentsThroughAllThree.documentRuns}
                subtitle="Documents fully processed"
                color="text-blue-600"
              />
              <StatCard
                title="Total Citations Checked"
                value={stats.documentsThroughAllThree.totalCitations}
                subtitle="Citations in completed documents"
              />
              <StatCard
                title="Validated at Tier 2"
                value={stats.documentsThroughAllThree.tier2Validated || 0}
                subtitle={stats.documentsThroughAllThree.totalCitations > 0 
                  ? `${((stats.documentsThroughAllThree.tier2Validated || 0) / stats.documentsThroughAllThree.totalCitations * 100).toFixed(1)}% of citations`
                  : "Citations with VALID determination"}
                color="text-blue-600"
              />
              <StatCard
                title="Tier 3 Runs"
                value={stats.documentsThroughAllThree.tier3Runs || 0}
                subtitle={stats.documentsThroughAllThree.totalCitations > 0
                  ? `${((stats.documentsThroughAllThree.tier3Runs || 0) / stats.documentsThroughAllThree.totalCitations * 100).toFixed(1)}% of citations`
                  : "Citations escalated to Tier 3"}
                color="text-orange-600"
              />
              <StatCard
                title="Validated at Tier 3"
                value={stats.documentsThroughAllThree.tier3Validated || 0}
                subtitle={stats.documentsThroughAllThree.tier3Runs > 0
                  ? `${((stats.documentsThroughAllThree.tier3Validated || 0) / stats.documentsThroughAllThree.tier3Runs * 100).toFixed(1)}% of Tier 3 runs`
                  : "Citations with VALID verdict"}
                color="text-purple-600"
              />
            </div>
            
            {/* Tier 2 VALID Vote Distribution for Completed Documents Only */}
            {stats.documentsThroughAllThree.tier2ValidVoteDistribution && (
              <div className="mt-6 pt-6 border-t border-gray-300">
                <h3 className="text-lg font-medium text-black mb-3">Tier 2 VALID Vote Distribution (Completed Documents Only)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[0, 1, 2, 3, 4, 5].map((count) => {
                    const value = stats.documentsThroughAllThree.tier2ValidVoteDistribution[count as 0 | 1 | 2 | 3 | 4 | 5] || 0
                    const percentage = stats.documentsThroughAllThree.totalCitations > 0 
                      ? (value / stats.documentsThroughAllThree.totalCitations) * 100 
                      : 0
                    return (
                      <div key={count} className="bg-white rounded p-3 border border-gray-200">
                        <div className="text-sm text-gray-600 mb-1">{count} VALID</div>
                        <div className="text-xl font-semibold text-black">{value}</div>
                        <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Tier 2 Voting Distribution */}
          <div className="border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-black mb-4">Tier 2 Voting Distribution</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-lg font-medium text-black mb-3">VALID Votes</h3>
                <BarChart data={stats.tier2Voting.validVotes} maxValue={maxVotes} color="bg-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-black mb-3">INVALID Votes</h3>
                <BarChart data={stats.tier2Voting.invalidVotes} maxValue={maxVotes} color="bg-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-black mb-3">UNCERTAIN Votes</h3>
                <BarChart data={stats.tier2Voting.uncertainVotes} maxValue={maxVotes} color="bg-yellow-500" />
              </div>
            </div>
          </div>

          {/* Agreement Levels */}
          <div className="border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-black mb-4">Agreement Levels</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(() => {
                const totalAgreementLevels = stats.tier2Voting.agreementLevels.unanimous + 
                  stats.tier2Voting.agreementLevels.strong + 
                  stats.tier2Voting.agreementLevels.split
                const unanimousPercentage = totalAgreementLevels > 0 
                  ? (stats.tier2Voting.agreementLevels.unanimous / totalAgreementLevels) * 100 
                  : 0
                const strongPercentage = totalAgreementLevels > 0 
                  ? (stats.tier2Voting.agreementLevels.strong / totalAgreementLevels) * 100 
                  : 0
                const splitPercentage = totalAgreementLevels > 0 
                  ? (stats.tier2Voting.agreementLevels.split / totalAgreementLevels) * 100 
                  : 0
                
                return (
                  <>
                    <div className="bg-gray-50 rounded p-4">
                      <div className="text-sm text-gray-600 mb-1">Unanimous</div>
                      <div className="text-2xl font-semibold text-green-600">
                        {stats.tier2Voting.agreementLevels.unanimous}
                        {totalAgreementLevels > 0 && (
                          <span className="text-base font-normal text-gray-600 ml-2">
                            ({unanimousPercentage.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-4">
                      <div className="text-sm text-gray-600 mb-1">Strong (4/5)</div>
                      <div className="text-2xl font-semibold text-blue-600">
                        {stats.tier2Voting.agreementLevels.strong}
                        {totalAgreementLevels > 0 && (
                          <span className="text-base font-normal text-gray-600 ml-2">
                            ({strongPercentage.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-4">
                      <div className="text-sm text-gray-600 mb-1">Split</div>
                      <div className="text-2xl font-semibold text-orange-600">
                        {stats.tier2Voting.agreementLevels.split}
                        {totalAgreementLevels > 0 && (
                          <span className="text-base font-normal text-gray-600 ml-2">
                            ({splitPercentage.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          {/* Tier 3 Validation */}
          <div className="border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-black mb-4">Tier 3 Validation</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <StatCard
                title="Escalated"
                value={stats.tier3Validation.escalated}
                subtitle="Citations flagged for Tier 3"
              />
              <StatCard
                title="Analyzed"
                value={stats.tier3Validation.analyzed}
                subtitle="Citations with Tier 3 results"
              />
              <StatCard
                title="Escalation Rate"
                value={`${stats.tier3Validation.escalationRate.toFixed(1)}%`}
                subtitle="Of Tier 2 citations"
              />
            </div>
            <div className="mt-4">
              <h3 className="text-lg font-medium text-black mb-3">Tier 3 Verdicts</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(stats.tier3Validation.verdicts).map(([verdict, count]) => {
                  const totalAnalyzed = stats.tier3Validation.analyzed
                  const percentage = totalAnalyzed > 0 ? (count / totalAnalyzed) * 100 : 0
                  return (
                    <div key={verdict} className="bg-gray-50 rounded p-4">
                      <div className="text-sm text-gray-600 mb-1">{verdict.replace(/_/g, ' ')}</div>
                      <div className="text-2xl font-semibold text-black">
                        {count}
                        {totalAnalyzed > 0 && (
                          <span className="text-base font-normal text-gray-600 ml-2">
                            ({percentage.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Agent Statistics */}
          <div className="border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-black mb-4">Agent Statistics</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VALID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">INVALID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UNCERTAIN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(stats.agentAgreement.agentStats).map(([agent, stats]) => {
                    const total = stats.valid + stats.invalid + stats.uncertain
                    return (
                      <tr key={agent}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-black">
                          {agentDisplayNames[agent] || agent}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-green-600">{stats.valid}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600">{stats.invalid}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-yellow-600">{stats.uncertain}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-black font-medium">{total}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pairwise Agreement Matrix */}
          <div className="border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-black mb-4">Pairwise Agreement Matrix</h2>
            <p className="text-sm text-gray-600 mb-4">
              Number of citations where each pair of agents agreed (same verdict)
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                    {Object.keys(stats.agentAgreement.pairwiseMatrix).map(agent => (
                      <th key={agent} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {agentDisplayNames[agent] || agent}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(stats.agentAgreement.pairwiseMatrix).map(([agent1, agreements]) => {
                    // Calculate total citations with Tier 2 for percentage calculation
                    const totalTier2Citations = stats.completion.tier1And2 + stats.completion.allThreeTiers
                    return (
                      <tr key={agent1}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-black">
                          {agentDisplayNames[agent1] || agent1}
                        </td>
                        {Object.keys(stats.agentAgreement.pairwiseMatrix).map(agent2 => {
                          const count = agreements[agent2] || 0
                          const isDiagonal = agent1 === agent2
                          const percentage = !isDiagonal && totalTier2Citations > 0 
                            ? (count / totalTier2Citations) * 100 
                            : 0
                          return (
                            <td
                              key={agent2}
                              className={`px-4 py-3 whitespace-nowrap text-sm text-center ${
                                isDiagonal ? 'bg-gray-100 font-semibold' : ''
                              }`}
                            >
                              {isDiagonal ? (
                                '-'
                              ) : (
                                <div>
                                  <div className="font-medium">{count}</div>
                                  {totalTier2Citations > 0 && (
                                    <div className="text-xs text-gray-500">
                                      ({percentage.toFixed(1)}%)
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Efficiency Metrics */}
          <div className="border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-black mb-4">Efficiency Metrics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Unanimous Decisions"
                value={stats.efficiency.unanimousDecisions}
                subtitle={`${stats.efficiency.unanimousRate.toFixed(1)}% of Tier 2 citations`}
                color="text-green-600"
              />
              <StatCard
                title="Escalation Rate"
                value={`${stats.efficiency.escalationRate.toFixed(1)}%`}
                subtitle="Citations requiring Tier 3"
              />
              <StatCard
                title="Avg Tier 2 Confidence"
                value={stats.efficiency.averageConfidence.tier2.toFixed(3)}
                subtitle="Average confidence score"
              />
              <StatCard
                title="Avg Tier 3 Confidence"
                value={stats.efficiency.averageConfidence.tier3.toFixed(3)}
                subtitle="Average confidence score"
              />
            </div>
          </div>

          {/* Completion Data - Moved to Bottom */}
          <div className="border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-black mb-4">Completion Metrics</h2>
            <p className="text-gray-600 mb-6">
              Progress tracking for citations across all documents
            </p>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <StatCard
                title="Total Citations"
                value={stats.completion.total}
                subtitle="Processed across all documents"
              />
              <StatCard
                title="Tier 1 Completion"
                value={`${stats.completion.completionRates.tier1.toFixed(1)}%`}
                subtitle={`${stats.completion.tier1Only + stats.completion.tier1And2 + stats.completion.allThreeTiers} citations`}
              />
              <StatCard
                title="Tier 2 Completion"
                value={`${stats.completion.completionRates.tier2.toFixed(1)}%`}
                subtitle={`${stats.completion.tier1And2 + stats.completion.allThreeTiers} citations`}
              />
              <StatCard
                title="Tier 3 Completion"
                value={`${stats.completion.completionRates.tier3.toFixed(1)}%`}
                subtitle={`${stats.completion.allThreeTiers} citations`}
              />
            </div>

            {/* Completion Breakdown */}
            <div>
              <h3 className="text-lg font-medium text-black mb-4">Completion Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded p-4">
                  <div className="text-sm text-gray-600 mb-1">Tier 1 Only</div>
                  <div className="text-2xl font-semibold text-black">{stats.completion.tier1Only}</div>
                </div>
                <div className="bg-gray-50 rounded p-4">
                  <div className="text-sm text-gray-600 mb-1">Tier 1 + Tier 2</div>
                  <div className="text-2xl font-semibold text-black">{stats.completion.tier1And2}</div>
                </div>
                <div className="bg-gray-50 rounded p-4">
                  <div className="text-sm text-gray-600 mb-1">All Three Tiers</div>
                  <div className="text-2xl font-semibold text-black">{stats.completion.allThreeTiers}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

