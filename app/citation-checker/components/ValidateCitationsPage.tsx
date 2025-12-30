"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { CitationList } from "./CitationList"
import { ContextPanel } from "./ContextPanel"
import { CitationValidation, ValidationVerdict } from "@/types/citation-json"
import { getTier3FinalStatus } from "@/lib/citation-identification/validation"
import { isNewFormatCitationValidation, calculateRiskStatistics, getCitationRiskLevel } from "@/lib/citation-identification/format-helpers"
import { ValidationSummary } from "./ValidationSummary"
import { buttonStyles } from "@/lib/styles"

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
    tier2Pending?: number
    tier2Processing?: number
    tier2Completed?: number
    tier2Failed?: number
    tier3Pending?: number
    tier3Processing?: number
    tier3Completed?: number
    tier3Failed?: number
    jobStatus?: string
  }>({
    tier2Current: 0,
    tier2Total: 0,
    tier3Current: 0,
    tier3Total: 0,
    stage: 'idle'
  })
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Shared function to load citations and results for a specific checkId
  const loadCitationsAndResultsForCheckId = async (specificCheckId: string) => {
    try {
      setCheckId(specificCheckId)
      
      // Load check data
      const checkRes = await fetch(`/api/citation-checker/checks/${specificCheckId}`)
      if (checkRes.ok) {
        const data = await checkRes.json()
        if (data.jsonData?.document?.citations) {
          setCitations(data.jsonData.document.citations)
          
          // Calculate results from validation data using risk-based utility
          const riskStats = calculateRiskStatistics(data.jsonData.document.citations)
          if (riskStats.total > 0) {
            // Map risk statistics to results format for backward compatibility with UI
            setResults({
              valid: riskStats.lowRisk,
              uncertain: riskStats.moderateRisk,
              invalid: riskStats.needsReview,
              total: riskStats.total
            })
          } else {
            // No validated citations yet
            setResults(null)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load citations:', err)
    }
  }

  // Shared function to load citations and results (uses latest check from files API)
  const loadCitationsAndResults = async () => {
    try {
      // Get file to find checkId
      const fileRes = await fetch(`/api/citation-checker/files`)
      if (fileRes.ok) {
        const files = await fileRes.json()
        const file = files.find((f: any) => f.id === fileId)
        if (file?.citationChecks?.[0]) {
          const currentCheckId = file.citationChecks[0].id
          await loadCitationsAndResultsForCheckId(currentCheckId)
        }
      }
    } catch (err) {
      console.error('Failed to load citations:', err)
    }
  }
  
  // Load citations from check data
  useEffect(() => {
    loadCitationsAndResults()
  }, [fileId])

  const handleValidate = async () => {
    console.log(`[ValidateCitationsPage] handleValidate called, checkId: ${checkId}, fileId: ${fileId}`)
    if (!checkId) {
      console.error(`[ValidateCitationsPage] No checkId available`)
      alert("No citation check selected")
      return
    }

    console.log(`[ValidateCitationsPage] Starting validation with checkId: ${checkId}`)
    setValidating(true)
    setProgress({
      tier2Current: 0,
      tier2Total: 0,
      tier3Current: 0,
      tier3Total: 0,
      stage: 'tier2'
    })

    try {
      console.log(`[ValidateCitationsPage] Starting validation for checkId: ${checkId}`)
      // Start validation job with force=true to allow rerunning (for testing new prompts)
      const response = await fetch(`/api/citation-checker/checks/${checkId}/validate-citations?force=true`, {
        method: 'POST',
      })
      console.log(`[ValidateCitationsPage] Response status: ${response.status}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        console.error("Validation API error:", errorData)
        alert(`Failed to create validation job: ${errorData.error || errorData.details || `HTTP ${response.status}`}`)
        setValidating(false)
        return
      }
      
      const data = await response.json()
      console.log(`[ValidateCitationsPage] Response data:`, data)
      
      if (data.jobId) {
        console.log(`[ValidateCitationsPage] Job ID received: ${data.jobId}, status: ${data.status}, message: ${data.message}`)
        
        // If a new checkId was returned (new version created), update it
        if (data.checkId && data.checkId !== checkId) {
          console.log(`[ValidateCitationsPage] New checkId received: ${data.checkId} (was ${checkId})`)
          setCheckId(data.checkId)
        }
        
        // If job is already completed, skip polling and just load the data
        if (data.status === 'completed') {
          console.log(`[ValidateCitationsPage] Job already completed, loading data directly`)
          setValidating(false)
          // Use the new checkId if provided, otherwise reload from files API
          if (data.checkId) {
            loadCitationsAndResultsForCheckId(data.checkId)
          } else {
            loadCitationsAndResults()
          }
        } else {
          // Start polling for status
          startPolling(data.jobId, data.checkId)
        }
      } else if (data.error) {
        console.error("Validation job creation error:", data)
        alert(`Failed to create validation job: ${data.error}${data.details ? ` - ${data.details}` : ''}`)
        setValidating(false)
      } else {
        console.error("Unexpected response format:", data)
        alert('Failed to create validation job: Unexpected response format')
        setValidating(false)
      }
    } catch (error) {
      console.error("Validation error:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      alert(`Failed to start validation: ${errorMessage}`)
      setValidating(false)
    }
  }

  const startPolling = (jobId: string, newCheckId?: string) => {
    console.log(`[ValidateCitationsPage] Starting polling for jobId: ${jobId}, newCheckId: ${newCheckId}`)
    
    // Clear any existing polling interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    
    // If a new checkId was provided, update it
    if (newCheckId && newCheckId !== checkId) {
      console.log(`[ValidateCitationsPage] Updating checkId during polling: ${newCheckId}`)
      setCheckId(newCheckId)
    }
    
    const poll = async () => {
      try {
        console.log(`[ValidateCitationsPage] Polling job status for jobId: ${jobId}`)
        const response = await fetch(`/api/citation-checker/jobs/${jobId}`)
        
        if (!response.ok) {
          console.error(`[ValidateCitationsPage] Polling failed: ${response.status} ${response.statusText}`)
          throw new Error(`Failed to fetch job status: ${response.statusText}`)
        }
        
        const job = await response.json()
        
        console.log('[ValidateCitationsPage] Job progress update:', {
          jobId: job.id,
          status: job.status,
          tier2: job.tier2Progress,
          tier3: job.tier3Progress,
          checkId: job.checkId
        })
        
        // Determine stage based on progress
        let stage: 'tier2' | 'tier3' | 'complete' = 'tier2'
        if (job.status === 'completed') {
          stage = 'complete'
        } else if (job.tier2Progress && job.tier2Progress.current >= job.tier2Progress.total && job.tier3Progress && job.tier3Progress.total > 0) {
          // Tier 2 is complete, now on Tier 3
          stage = 'tier3'
        } else if (job.tier2Progress && job.tier2Progress.current < job.tier2Progress.total) {
          // Still on Tier 2
          stage = 'tier2'
        } else if (job.tier3Progress && job.tier3Progress.total > 0) {
          // Tier 2 done, Tier 3 in progress
          stage = 'tier3'
        }
        
        const newProgress = {
          tier2Current: job.tier2Progress?.current || 0,
          tier2Total: job.tier2Progress?.total || 0,
          tier3Current: job.tier3Progress?.current || 0,
          tier3Total: job.tier3Progress?.total || 0,
          stage: stage,
          tier2Pending: job.tier2Progress?.pending,
          tier2Processing: job.tier2Progress?.processing,
          tier2Completed: job.tier2Progress?.completed,
          tier2Failed: job.tier2Progress?.failed,
          tier3Pending: job.tier3Progress?.pending,
          tier3Processing: job.tier3Progress?.processing,
          tier3Completed: job.tier3Progress?.completed,
          tier3Failed: job.tier3Progress?.failed,
          jobStatus: job.status,
        }
        
        console.log('[ValidateCitationsPage] Setting progress state:', newProgress)
        setProgress(newProgress)
        
        if (job.status === 'completed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          setValidating(false)
          // Use checkId from job response (most reliable), fallback to newCheckId param, then reload from files API
          const checkIdToLoad = job.checkId || newCheckId
          if (checkIdToLoad) {
            console.log(`[ValidateCitationsPage] Validation completed, loading data for checkId: ${checkIdToLoad}`)
            loadCitationsAndResultsForCheckId(checkIdToLoad)
          } else {
            console.log(`[ValidateCitationsPage] Validation completed, reloading from files API`)
            loadCitationsAndResults()
          }
        } else if (job.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          setValidating(false)
          alert(`Validation failed: ${job.error || 'Unknown error'}`)
        }
      } catch (error) {
        console.error('Error polling job status:', error)
        // Don't stop polling on error - might be temporary network issue
      }
    }
    
    // Start polling immediately, then every 2 seconds
    poll()
    pollIntervalRef.current = setInterval(poll, 2000)
  }
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Helper function to get color for verdict
  const getVerdictColor = (verdict: ValidationVerdict) => {
    if (verdict === "VALID") return "bg-green-500"
    if (verdict === "INVALID") return "bg-red-500"
    return "bg-yellow-500" // UNCERTAIN
  }

  // Helper function to render agent indicators
  const renderAgentIndicators = (validation: CitationValidation) => {
    if (!validation?.panel_evaluation) return null
    
    const isNewFormat = isNewFormatCitationValidation(validation)
    
    return (
      <div className="flex items-center gap-1">
        {validation.panel_evaluation.map((agent, idx) => {
          if (isNewFormat && typeof agent.score === 'number') {
            // New format: show score-based color
            const scoreColor = agent.score >= 8 ? 'bg-green-500' : agent.score >= 5 ? 'bg-yellow-500' : 'bg-red-500'
            return (
              <div
                key={idx}
                className={`w-3 h-3 rounded-full ${scoreColor}`}
                title={`${agent.agent}: ${agent.score}/10`}
              />
            )
          } else if (agent.verdict) {
            // Legacy format: show verdict-based color
            return (
              <div
                key={idx}
                className={`w-3 h-3 rounded-full ${getVerdictColor(agent.verdict)}`}
                title={`${agent.agent}: ${agent.verdict}`}
              />
            )
          }
          return null
        })}
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
            className={buttonStyles.primary + " py-3"}
          >
            Continue to Review Discrepancies
          </button>
        </div>
      )}
      
      <button
        onClick={() => {
          console.log(`[ValidateCitationsPage] Button clicked, checkId: ${checkId}, validating: ${validating}`)
          handleValidate()
        }}
        disabled={validating || !checkId}
        className={buttonStyles.primary + " py-3"}
      >
        {validating ? "Validating Citations..." : "Validate Citations"}
      </button>
      {!checkId && (
        <div className="text-red-600 text-sm mt-2">Warning: No check ID available. Please ensure citations have been identified first.</div>
      )}

      {/* Progress Indicator */}
      {validating && progress.stage !== 'idle' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Validation Progress {progress.jobStatus && `(${progress.jobStatus})`}
          </h3>
          {/* Debug info - remove after testing */}
          <div className="mb-2 text-xs text-gray-500 font-mono">
            Debug: T2={progress.tier2Current}/{progress.tier2Total} T3={progress.tier3Current}/{progress.tier3Total} Stage={progress.stage}
          </div>
          
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
            {/* Queue Status Breakdown */}
            {(progress.tier2Pending !== undefined || progress.tier2Processing !== undefined || progress.tier2Failed !== undefined) && (
              <div className="mt-2 flex gap-4 text-xs text-gray-600">
                {progress.tier2Pending !== undefined && progress.tier2Pending > 0 && (
                  <span>Pending: {progress.tier2Pending}</span>
                )}
                {progress.tier2Processing !== undefined && progress.tier2Processing > 0 && (
                  <span className="text-blue-600 font-medium">Processing: {progress.tier2Processing}</span>
                )}
                {progress.tier2Completed !== undefined && progress.tier2Completed > 0 && (
                  <span className="text-green-600">Completed: {progress.tier2Completed}</span>
                )}
                {progress.tier2Failed !== undefined && progress.tier2Failed > 0 && (
                  <span className="text-red-600">Failed: {progress.tier2Failed}</span>
                )}
              </div>
            )}
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
              {/* Queue Status Breakdown */}
              {(progress.tier3Pending !== undefined || progress.tier3Processing !== undefined || progress.tier3Failed !== undefined) && (
                <div className="mt-2 flex gap-4 text-xs text-gray-600">
                  {progress.tier3Pending !== undefined && progress.tier3Pending > 0 && (
                    <span>Pending: {progress.tier3Pending}</span>
                  )}
                  {progress.tier3Processing !== undefined && progress.tier3Processing > 0 && (
                    <span className="text-blue-600 font-medium">Processing: {progress.tier3Processing}</span>
                  )}
                  {progress.tier3Completed !== undefined && progress.tier3Completed > 0 && (
                    <span className="text-green-600">Completed: {progress.tier3Completed}</span>
                  )}
                  {progress.tier3Failed !== undefined && progress.tier3Failed > 0 && (
                    <span className="text-red-600">Failed: {progress.tier3Failed}</span>
                  )}
                </div>
              )}
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
        <div className="mt-4">
          <ValidationSummary
            statistics={{
              lowRisk: results.valid,
              moderateRisk: results.uncertain,
              needsReview: results.invalid,
              total: results.total
            }}
          />
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
                          {hasValidation && (() => {
                            const riskLevel = getCitationRiskLevel(citation)
                            if (riskLevel === 'LOW_RISK') {
                              return <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">LOW RISK</span>
                            } else if (riskLevel === 'NEEDS_ADDITIONAL_REVIEW') {
                              return <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800">NEEDS REVIEW</span>
                            } else {
                              return <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-800">MODERATE RISK</span>
                            }
                          })()}
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{citation.citationText || citation.text}</p>
                        
                        {hasValidation && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-600">Panel Evaluation:</span>
                              {renderAgentIndicators(validation)}
                              <span className="text-xs text-gray-500">
                                {(() => {
                                  const isNewFormat = isNewFormatCitationValidation(validation)
                                  if (isNewFormat && validation.consensus.scores) {
                                    const highScores = validation.consensus.scores.filter(s => s >= 8).length
                                    const mediumScores = validation.consensus.scores.filter(s => s >= 5 && s < 8).length
                                    const lowScores = validation.consensus.scores.filter(s => s < 5).length
                                    return `(Avg: ${validation.consensus.average_score?.toFixed(1) || 'N/A'}, σ: ${validation.consensus.standard_deviation?.toFixed(1) || 'N/A'})`
                                  } else if (validation.consensus.verdict_counts) {
                                    return `(${validation.consensus.verdict_counts.VALID}V / ${validation.consensus.verdict_counts.UNCERTAIN}U / ${validation.consensus.verdict_counts.INVALID}I)`
                                  } else {
                                    return '(N/A)'
                                  }
                                })()}
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

