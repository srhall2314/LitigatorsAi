"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CitationList } from "./CitationList"
import { ContextPanel } from "./ContextPanel"
import { CitationValidation, ValidationVerdict } from "@/types/citation-json"

interface ValidateCitationsPageProps {
  fileId: string
}

interface ValidationResult {
  valid: number
  invalid: number
  uncertain: number
  total: number
}

export function ValidateCitationsPage({ fileId }: ValidateCitationsPageProps) {
  const router = useRouter()
  const [validating, setValidating] = useState(false)
  const [results, setResults] = useState<ValidationResult | null>(null)
  const [citations, setCitations] = useState<any[]>([])
  const [checkId, setCheckId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{
    tier2Current: number
    tier2Total: number
    tier3Current: number
    tier3Total: number
    stage: 'idle' | 'tier2' | 'tier3' | 'complete'
  }>({
    tier2Current: 0,
    tier2Total: 0,
    tier3Current: 0,
    tier3Total: 0,
    stage: 'idle'
  })
  
  // Load citations from check data
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
              if (data.jsonData?.document?.citations) {
                setCitations(data.jsonData.document.citations)
                
                // Calculate results from validation data if available
                const validatedCitations = data.jsonData.document.citations.filter((c: any) => c.validation)
                if (validatedCitations.length > 0) {
                  const valid = validatedCitations.filter((c: any) => 
                    c.validation.consensus.recommendation === "CITATION_LIKELY_VALID"
                  ).length
                  const invalid = validatedCitations.filter((c: any) => 
                    c.validation.consensus.recommendation === "CITATION_LIKELY_HALLUCINATED"
                  ).length
                  const uncertain = validatedCitations.filter((c: any) => 
                    c.validation.consensus.recommendation === "CITATION_UNCERTAIN"
                  ).length
                  
                  setResults({
                    valid,
                    invalid,
                    uncertain,
                    total: validatedCitations.length
                  })
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load citations:', err)
      }
    }
    
    loadData()
  }, [fileId])

  const handleValidate = async () => {
    if (!checkId) {
      alert("No citation check selected")
      return
    }

    setValidating(true)
    setProgress({
      tier2Current: 0,
      tier2Total: 0,
      tier3Current: 0,
      tier3Total: 0,
      stage: 'tier2'
    })

    try {
      // Use EventSource for streaming progress updates (GET request)
      const eventSource = new EventSource(`/api/citation-checker/checks/${checkId}/validate-citations?stream=true`)
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('[Progress] Received:', data.type, data)
          
          if (data.type === "start") {
            setProgress(prev => ({
              ...prev,
              tier2Total: data.tier2Total || 0,
              tier3Total: data.tier3Total || 0,
              stage: 'tier2'
            }))
          } else if (data.type === "tier2_progress") {
            setProgress(prev => ({
              ...prev,
              tier2Current: data.tier2Current || data.current || 0,
              tier2Total: data.tier2Total || data.total || prev.tier2Total,
              stage: 'tier2'
            }))
          } else if (data.type === "tier2_complete") {
            setProgress(prev => ({
              ...prev,
              tier2Current: prev.tier2Total,
              tier3Total: data.tier3Count || 0,
              stage: data.tier3Count > 0 ? 'tier3' : 'complete'
            }))
          } else if (data.type === "tier3_progress") {
            setProgress(prev => ({
              ...prev,
              tier2Current: data.tier2Current || prev.tier2Total,
              tier2Total: data.tier2Total || prev.tier2Total,
              tier3Current: data.tier3Current || 0,
              tier3Total: data.tier3Total || prev.tier3Total,
              stage: 'tier3'
            }))
          } else if (data.type === "complete") {
            // Update checkId if a new version was created
            if (data.checkId) {
              setCheckId(data.checkId)
            }
            
            // Reload citations with validation data
            if (data.jsonData?.document?.citations) {
              setCitations(data.jsonData.document.citations)
              
              // Calculate results
              const validatedCitations = data.jsonData.document.citations.filter((c: any) => c.validation)
              const valid = validatedCitations.filter((c: any) => 
                c.validation.consensus.recommendation === "CITATION_LIKELY_VALID"
              ).length
              const invalid = validatedCitations.filter((c: any) => 
                c.validation.consensus.recommendation === "CITATION_LIKELY_HALLUCINATED"
              ).length
              const uncertain = validatedCitations.filter((c: any) => 
                c.validation.consensus.recommendation === "CITATION_UNCERTAIN"
              ).length
              
              setResults({
                valid,
                invalid,
                uncertain,
                total: validatedCitations.length
              })
            }
            
            setProgress(prev => ({
              ...prev,
              stage: 'complete'
            }))
            
            eventSource.close()
            setValidating(false)
          } else if (data.type === "error") {
            alert(`Failed to validate citations: ${data.error || "Unknown error"}`)
            eventSource.close()
            setValidating(false)
          }
        } catch (err) {
          console.error("Error parsing progress update:", err)
        }
      }
      
      eventSource.onerror = (error) => {
        console.error("EventSource error:", error)
        eventSource.close()
        setValidating(false)
        alert("Connection error during validation. Please try again.")
      }
    } catch (error) {
      console.error("Validation error:", error)
      alert("Failed to start validation")
      setValidating(false)
    }
  }

  // Helper function to get color for verdict
  const getVerdictColor = (verdict: ValidationVerdict) => {
    if (verdict === "VALID") return "bg-green-500"
    if (verdict === "INVALID") return "bg-red-500"
    return "bg-yellow-500" // UNCERTAIN
  }

  // Helper function to render agent indicators
  const renderAgentIndicators = (validation: CitationValidation) => {
    if (!validation?.panel_evaluation) return null
    
    return (
      <div className="flex items-center gap-1">
        {validation.panel_evaluation.map((agent, idx) => (
          <div
            key={idx}
            className={`w-3 h-3 rounded-full ${getVerdictColor(agent.verdict)}`}
            title={`${agent.agent}: ${agent.verdict}`}
          />
        ))}
      </div>
    )
  }

  // Helper function to format confidence score
  const formatConfidenceScore = (score: number) => {
    return (score * 100).toFixed(0)
  }

  return (
    <div className="space-y-6">
      {/* Navigation Button at Top */}
      {citations.length > 0 && results && (
        <div className="pb-4 border-b border-gray-200">
          <button
            onClick={() => router.push(`/citation-checker/${fileId}/review-discrepancies`)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Continue to Review Discrepancies
          </button>
        </div>
      )}
      
      <button
        onClick={handleValidate}
        disabled={validating || !checkId}
        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {validating ? "Validating Citations..." : "Validate Citations"}
      </button>

      {/* Progress Indicator */}
      {validating && progress.stage !== 'idle' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Validation Progress</h3>
          
          {/* Tier 2 Progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Tier 2: Panel Validation
              </span>
              <span className="text-sm text-gray-600">
                {progress.tier2Current} / {progress.tier2Total}
                {progress.tier2Total > 0 && ` (${Math.round((progress.tier2Current / progress.tier2Total) * 100)}%)`}
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ 
                  width: progress.tier2Total > 0 
                    ? `${(progress.tier2Current / progress.tier2Total) * 100}%` 
                    : '0%' 
                }}
              />
            </div>
          </div>

          {/* Tier 3 Progress */}
          {progress.tier3Total > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Tier 3: Detailed Review
                </span>
                <span className="text-sm text-gray-600">
                  {progress.tier3Current} / {progress.tier3Total}
                  {progress.tier3Total > 0 && ` (${Math.round((progress.tier3Current / progress.tier3Total) * 100)}%)`}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-300"
                  style={{ 
                    width: progress.tier3Total > 0 
                      ? `${(progress.tier3Current / progress.tier3Total) * 100}%` 
                      : '0%' 
                  }}
                />
              </div>
            </div>
          )}

          {progress.stage === 'complete' && (
            <div className="mt-3 text-sm text-green-700 font-medium">
              ✓ Validation complete!
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Validation Summary</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Total Validated</div>
                <div className="text-2xl font-bold text-gray-900">{results.total}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Valid Citations</div>
                <div className="text-2xl font-bold text-green-600">{results.valid}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Uncertain Citations</div>
                <div className="text-2xl font-bold text-yellow-600">{results.uncertain}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Invalid Citations</div>
                <div className="text-2xl font-bold text-red-600">{results.invalid}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {citations.length > 0 && (
        <>
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Citation Validation Results ({citations.length})
            </h3>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {citations.map((citation: any, index: number) => {
                const validation = citation.validation as CitationValidation | undefined
                const hasValidation = !!validation
                
                return (
                  <div
                    key={citation.id || index}
                    className="p-4 bg-white rounded-md border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            citation.citationType === 'case' ? 'bg-blue-100 text-blue-800' :
                            citation.citationType === 'statute' ? 'bg-green-100 text-green-800' :
                            citation.citationType === 'regulation' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {citation.citationType?.toUpperCase() || 'UNKNOWN'}
                          </span>
                          {hasValidation && (
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              validation.consensus.recommendation === "CITATION_LIKELY_VALID" ? 'bg-green-100 text-green-800' :
                              validation.consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {validation.consensus.recommendation === "CITATION_LIKELY_VALID" ? "VALID" :
                               validation.consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? "INVALID" :
                               "UNCERTAIN"}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{citation.citationText || citation.text}</p>
                        
                        {hasValidation && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-600">Panel Evaluation:</span>
                              {renderAgentIndicators(validation)}
                              <span className="text-xs text-gray-500">
                                ({validation.consensus.verdict_counts.VALID}V / {validation.consensus.verdict_counts.UNCERTAIN}U / {validation.consensus.verdict_counts.INVALID}I)
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-600">Consensus Score:</span>
                              <div className="flex items-center gap-2">
                                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      validation.consensus.confidence_score >= 0.8 ? 'bg-green-500' :
                                      validation.consensus.confidence_score >= 0.5 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${validation.consensus.confidence_score * 100}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-gray-700">
                                  {formatConfidenceScore(validation.consensus.confidence_score)}%
                                </span>
                              </div>
                            </div>
                            {validation.consensus.reasoning && (
                              <p className="text-xs text-gray-600 italic mt-1">
                                {validation.consensus.reasoning}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
      
      <ContextPanel 
        fileId={fileId}
        checkId={checkId}
        showJson={true}
        showCitationCount={true}
      />
    </div>
  )
}

