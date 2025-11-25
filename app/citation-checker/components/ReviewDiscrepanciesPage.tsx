"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ContextPanel } from "./ContextPanel"
import { CitationValidation, ValidationVerdict } from "@/types/citation-json"

interface ReviewDiscrepanciesPageProps {
  fileId: string
}

interface CitationWithValidation {
  id: string
  citationText: string
  citationType: string
  validation?: CitationValidation
  tier_3?: any
  extractedComponents?: any
  paragraphId?: string
  paragraphText?: string
}

export function ReviewDiscrepanciesPage({ fileId }: ReviewDiscrepanciesPageProps) {
  const router = useRouter()
  const [citations, setCitations] = useState<CitationWithValidation[]>([])
  const [checkId, setCheckId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get file to find checkId
        const fileRes = await fetch(`/api/citation-checker/files`)
        if (fileRes.ok) {
          const files = await fileRes.json()
          const file = files.find((f: any) => f.id === fileId)
          if (file?.citationChecks?.[0]) {
            const currentCheckId = file.citationChecks[0].id
            setCheckId(currentCheckId)
            
            // Load check data
            const checkRes = await fetch(`/api/citation-checker/checks/${currentCheckId}`)
            if (checkRes.ok) {
              const data = await checkRes.json()
              if (data.jsonData?.document) {
                const document = data.jsonData.document
                const citationsList = document.citations || []
                const content = document.content || []
                
                // Enrich citations with paragraph context
                const enrichedCitations = citationsList.map((citation: any) => {
                  // Find paragraph containing this citation
                  let paragraphId: string | undefined
                  let paragraphText: string | undefined
                  
                  for (const para of content) {
                    if (para.text && para.text.includes(`[CITATION:${citation.id}]`)) {
                      paragraphId = para.id
                      // Extract paragraph text, removing citation markers for cleaner display
                      paragraphText = para.text
                        .replace(/\[CITATION:[^\]]+\]/g, '')
                        .replace(/\[\/CITATION:[^\]]+\]/g, '')
                        .trim()
                      break
                    }
                  }
                  
                  return {
                    ...citation,
                    paragraphId,
                    paragraphText,
                  }
                })
                
                setCitations(enrichedCitations)
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load citations:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [fileId])

  // Handler to reload citation data
  const reloadCitationData = async () => {
    if (!checkId) return
    
    try {
      const checkRes = await fetch(`/api/citation-checker/checks/${checkId}`)
      if (checkRes.ok) {
        const data = await checkRes.json()
        if (data.jsonData?.document) {
          const document = data.jsonData.document
          const citationsList = document.citations || []
          const content = document.content || []
          
          // Enrich citations with paragraph context
          const enrichedCitations = citationsList.map((citation: any) => {
            let paragraphId: string | undefined
            let paragraphText: string | undefined
            
            for (const para of content) {
              if (para.text && para.text.includes(`[CITATION:${citation.id}]`)) {
                paragraphId = para.id
                paragraphText = para.text
                  .replace(/\[CITATION:[^\]]+\]/g, '')
                  .replace(/\[\/CITATION:[^\]]+\]/g, '')
                  .trim()
                break
              }
            }
            
            return {
              ...citation,
              paragraphId,
              paragraphText,
            }
          })
          
          setCitations(enrichedCitations)
        }
      }
    } catch (err) {
      console.error('Failed to reload citation data:', err)
    }
  }

  // Handler to reprocess a single citation
  const handleReprocessCitation = async (citationId: string) => {
    if (!checkId) return
    
    setReprocessingId(citationId)
    try {
      const res = await fetch(`/api/citation-checker/checks/${checkId}/citations/${citationId}/revalidate`, {
        method: 'POST'
      })
      
      if (res.ok) {
        // Reload check data to refresh UI
        await reloadCitationData()
      } else {
        const errorData = await res.json()
        alert(`Failed to reprocess citation: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error reprocessing citation:', error)
      alert('Failed to reprocess citation. Please try again.')
    } finally {
      setReprocessingId(null)
    }
  }

  // Filter citations that have validation results
  const citationsWithValidation = citations.filter(c => c.validation)
  
  // Group citations by paragraph
  const citationsByParagraph = new Map<string, CitationWithValidation[]>()
  citationsWithValidation.forEach(citation => {
    if (citation.paragraphId) {
      if (!citationsByParagraph.has(citation.paragraphId)) {
        citationsByParagraph.set(citation.paragraphId, [])
      }
      citationsByParagraph.get(citation.paragraphId)!.push(citation)
    }
  })
  
  // Sort by recommendation priority (INVALID > UNCERTAIN > VALID)
  const sortedCitations = [...citationsWithValidation].sort((a, b) => {
    if (!a.validation || !b.validation) return 0
    
    const priority = {
      'CITATION_LIKELY_HALLUCINATED': 3,
      'CITATION_UNCERTAIN': 2,
      'CITATION_LIKELY_VALID': 1,
    }
    
    const aPriority = priority[a.validation.consensus.recommendation] || 0
    const bPriority = priority[b.validation.consensus.recommendation] || 0
    
    return bPriority - aPriority
  })
  
  // Helper to scroll to citation detail
  const scrollToCitation = (citationId: string) => {
    const element = document.getElementById(`citation-${citationId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  
  // Helper to get stoplight color
  const getStoplightColor = (recommendation: string) => {
    if (recommendation === "CITATION_LIKELY_VALID") return "bg-green-500"
    if (recommendation === "CITATION_LIKELY_HALLUCINATED") return "bg-red-500"
    return "bg-yellow-500"
  }

  // Helper function to get color for verdict
  const getVerdictColor = (verdict: ValidationVerdict) => {
    if (verdict === "VALID") return "bg-green-500"
    if (verdict === "INVALID") return "bg-red-500"
    return "bg-yellow-500" // UNCERTAIN
  }

  // Helper function to get agent display name
  const getAgentDisplayName = (agentName: string) => {
    const names: Record<string, string> = {
      'citation_authority_validator_v1': 'Agent: Citation Authority',
      'case_ecology_validator_v1': 'Agent: Case Ecology',
      'temporal_reality_validator_v1': 'Agent: Temporal Reality',
      'legal_knowledge_validator_v1': 'Agent: Legal Knowledge',
      'reality_assessment_expert_v1': 'Agent: Reality Assessment',
    }
    return names[agentName] || `Agent: ${agentName}`
  }

  // Helper function to format confidence score
  const formatConfidenceScore = (score: number) => {
    return (score * 100).toFixed(0)
  }

  if (loading) {
    return <div className="text-gray-600">Loading citations...</div>
  }

  return (
    <div className="space-y-6">
      {/* Navigation Button at Top */}
      {sortedCitations.length > 0 && (
        <div className="pb-4 border-b border-gray-200">
          <button
            onClick={() => router.push(`/citation-checker/${fileId}/report`)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Continue to Report
          </button>
        </div>
      )}
      
      <div>
        <h3 className="text-lg font-semibold text-black mb-2">
          Citation Review & Panel Evaluation Details
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Review detailed panel evaluation results for each citation. Citations are sorted by priority (Invalid → Uncertain → Valid).
        </p>
        
        {/* Summary by Paragraph */}
        {citationsByParagraph.size > 0 && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Citation Summary by Paragraph</h4>
            <div className="space-y-1">
              {Array.from(citationsByParagraph.entries()).map(([paragraphId, paraCitations]) => (
                paraCitations.map((citation) => {
                  const recommendation = citation.validation?.consensus.recommendation || ''
                  return (
                    <button
                      key={citation.id}
                      onClick={() => scrollToCitation(citation.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
                    >
                      <span className="text-xs font-medium text-gray-600 w-20 flex-shrink-0">
                        {paragraphId}
                      </span>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStoplightColor(recommendation)}`} />
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded flex-shrink-0 ${
                        recommendation === "CITATION_LIKELY_VALID" ? 'bg-green-100 text-green-800' :
                        recommendation === "CITATION_LIKELY_HALLUCINATED" ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {recommendation === "CITATION_LIKELY_VALID" ? "V" :
                         recommendation === "CITATION_LIKELY_HALLUCINATED" ? "I" :
                         "U"}
                      </span>
                      <span className="text-gray-700 flex-1 truncate">
                        {citation.citationText}
                      </span>
                    </button>
                  )
                })
              ))}
            </div>
          </div>
        )}
        
        {sortedCitations.length > 0 ? (
          <div className="space-y-6">
            {sortedCitations.map((citation) => {
              const validation = citation.validation!
              const consensus = validation.consensus
              
              return (
                <div
                  id={`citation-${citation.id}`}
                  key={citation.id}
                  className="p-6 border border-gray-200 rounded-lg bg-white shadow-sm scroll-mt-4"
                >
                  {/* Citation Header */}
                  <div className="mb-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {/* Reprocess Button */}
                          <button
                            onClick={() => handleReprocessCitation(citation.id)}
                            disabled={reprocessingId === citation.id}
                            className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                              reprocessingId === citation.id
                                ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                            }`}
                            title="Reprocess this citation for Tier 2 and Tier 3 validation"
                          >
                            {reprocessingId === citation.id ? (
                              <span className="flex items-center gap-1">
                                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Reprocessing...
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Reprocess Citation
                              </span>
                            )}
                          </button>
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            citation.citationType === 'case' ? 'bg-blue-100 text-blue-800' :
                            citation.citationType === 'statute' ? 'bg-green-100 text-green-800' :
                            citation.citationType === 'regulation' ? 'bg-purple-100 text-purple-800' :
                            citation.citationType === 'rule' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {citation.citationType?.toUpperCase() || 'UNKNOWN'}
                          </span>
                          
                          {/* Show Tier 3 verdict if it exists and overrides Tier 2 */}
                          {citation.tier_3 && (() => {
                            const tier3Status = getTier3FinalStatus(citation.tier_3)
                            const tier3Consensus = citation.tier_3.consensus
                            const validCount = tier3Consensus?.verdict_counts.VALID || 0
                            
                            if (tier3Status === "VALID") {
                              return (
                                <>
                                  <span className="px-3 py-1 text-sm font-semibold rounded bg-green-100 text-green-800 border-2 border-green-300">
                                    ✓ VALID (Tier 3: {validCount}/3)
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                    Updated by Tier 3
                                  </span>
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                                    consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    Tier 2: {consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? "INVALID" : "UNCERTAIN"}
                                  </span>
                                </>
                              )
                            } else if (tier3Status === "FAIL") {
                              return (
                                <>
                                  <span className="px-3 py-1 text-sm font-semibold rounded bg-red-100 text-red-800 border-2 border-red-300">
                                    INVALID (Tier 3: {validCount}/3)
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                    Confirmed by Tier 3
                                  </span>
                                </>
                              )
                            } else {
                              return (
                                <>
                                  <span className="px-3 py-1 text-sm font-semibold rounded bg-orange-100 text-orange-800 border-2 border-orange-300">
                                    WARN (Tier 3: {validCount}/3)
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                    Requires Review
                                  </span>
                                </>
                              )
                            }
                          })()}
                          
                          {/* Default Tier 2 status if no Tier 3 */}
                          {!citation.tier_3 && (
                            <span className={`px-3 py-1 text-sm font-semibold rounded ${
                              consensus.recommendation === "CITATION_LIKELY_VALID" ? 'bg-green-100 text-green-800' :
                              consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {consensus.recommendation === "CITATION_LIKELY_VALID" ? "VALID" :
                               consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? "INVALID" :
                               "UNCERTAIN"}
                            </span>
                          )}
                          
                          {consensus.tier_3_trigger && !citation.tier_3 && (
                            <span className="px-2 py-1 text-xs font-medium rounded bg-orange-100 text-orange-800">
                              TIER 3 TRIGGERED
                            </span>
                          )}
                        </div>
                        <p className="text-base font-medium text-gray-900 mb-3">{citation.citationText}</p>
                        
                        {/* Document Context */}
                        {citation.paragraphId && citation.paragraphText && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <div className="text-xs font-semibold text-blue-900 mb-1">
                              Document Context ({citation.paragraphId})
                            </div>
                            <p className="text-sm text-gray-700 italic">
                              {citation.paragraphText}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Consensus Summary */}
                  <div className="mb-4 p-4 bg-gray-50 rounded-md">
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1">Agreement Level</div>
                        <div className="text-sm font-semibold text-gray-900 capitalize">{consensus.agreement_level}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1">Confidence Score</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                consensus.confidence_score >= 0.8 ? 'bg-green-500' :
                                consensus.confidence_score >= 0.4 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${consensus.confidence_score * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-gray-700">
                            {formatConfidenceScore(consensus.confidence_score)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 italic">{consensus.reasoning}</div>
                  </div>

                  {/* Panel Evaluation Details */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Panel Evaluation Results</h4>
                    <div className="space-y-3">
                      {validation.panel_evaluation.map((agent, idx) => (
                        <div
                          key={idx}
                          className="p-3 border border-gray-200 rounded-md bg-white"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full ${getVerdictColor(agent.verdict)}`} />
                              <span className="text-sm font-medium text-gray-900">
                                {getAgentDisplayName(agent.agent)}
                              </span>
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              agent.verdict === 'VALID' ? 'bg-green-100 text-green-800' :
                              agent.verdict === 'INVALID' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {agent.verdict}
                            </span>
                          </div>
                          {(agent.invalid_reason || agent.uncertain_reason) && (
                            <div className="mt-2 text-xs text-gray-600">
                              <span className="font-medium">Reason: </span>
                              <span className="italic">{agent.invalid_reason || agent.uncertain_reason}</span>
                            </div>
                          )}
                          <div className="mt-1 text-xs text-gray-500">
                            Model: {agent.model} • {new Date(agent.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tier 3 Investigation Results */}
                  {citation.tier_3 && (
                    <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-md">
                      <h4 className="text-sm font-semibold text-purple-900 mb-3">Tier 3: Deep Investigation</h4>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                              <span className={`px-3 py-1 text-sm font-semibold rounded ${
                                (() => {
                                  const tier3Status = getTier3FinalStatus(citation.tier_3)
                                  return tier3Status === "VALID" ? 'bg-green-100 text-green-800' :
                                         tier3Status === "FAIL" ? 'bg-red-100 text-red-800' :
                                         'bg-orange-100 text-orange-800'
                                })()
                              }`}>
                                {(() => {
                                  const tier3Status = getTier3FinalStatus(citation.tier_3)
                                  return tier3Status || 'UNKNOWN'
                                })()}
                              </span>
                            {(() => {
                              const tier3Consensus = citation.tier_3.consensus
                              const confidenceScore = tier3Consensus?.confidence_score || 0
                              
                              return (
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  confidenceScore >= 0.8 ? 'bg-green-100 text-green-800' :
                                  confidenceScore >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {Math.round(confidenceScore * 100)}% Confidence
                                </span>
                              )
                            })()}
                          </div>
                        </div>
                        
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-1">Reasoning</div>
                          <p className="text-sm text-gray-700">{citation.tier_3.reasoning}</p>
                        </div>
                        
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-1">Key Evidence</div>
                          <p className="text-sm text-gray-700">{citation.tier_3.key_evidence}</p>
                        </div>
                        
                        {citation.tier_3.remaining_uncertainties && (
                          <div>
                            <div className="text-xs font-medium text-gray-700 mb-1">Remaining Uncertainties</div>
                            <p className="text-sm text-gray-600 italic">{citation.tier_3.remaining_uncertainties}</p>
                          </div>
                        )}
                        
                        <div className="pt-2 border-t border-purple-200">
                          <div className="text-xs text-gray-500">
                            Model: {citation.tier_3.model} • {new Date(citation.tier_3.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Verdict Summary */}
                  <div className="p-3 bg-gray-50 rounded-md">
                    <div className="text-xs font-medium text-gray-600 mb-2">Verdict Summary</div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-green-700">
                        <span className="font-semibold">{consensus.verdict_counts.VALID}</span> Valid
                      </span>
                      <span className="text-yellow-700">
                        <span className="font-semibold">{consensus.verdict_counts.UNCERTAIN}</span> Uncertain
                      </span>
                      <span className="text-red-700">
                        <span className="font-semibold">{consensus.verdict_counts.INVALID}</span> Invalid
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-6 border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-gray-600">No citations with validation results found. Please validate citations first.</p>
          </div>
        )}
      </div>
      
      <ContextPanel 
        fileId={fileId}
        checkId={checkId}
        showJson={true}
        showCitationCount={true}
        showValidationResults={true}
      />
    </div>
  )
}

