"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { buttonStyles } from "@/lib/styles"

interface RunCitationCheckerPageProps {
  fileId: string
  checkId?: string
}

interface PipelineProgress {
  stage: 'idle' | 'generate-json' | 'identify-citations' | 'validate-citations' | 'complete' | 'error'
  currentStep: string
  message: string
  checkId: string | null
  jobId: string | null
  jsonGenerated: boolean
  citationsIdentified: boolean
  validationProgress: {
    tier2Current: number
    tier2Total: number
    tier3Current: number
    tier3Total: number
    stage: 'idle' | 'tier2' | 'tier3' | 'complete'
  }
}

export function RunCitationCheckerPage({ fileId, checkId: initialCheckId }: RunCitationCheckerPageProps) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [identificationMethod, setIdentificationMethod] = useState<'regex' | 'eyecite'>('eyecite')
  const [progress, setProgress] = useState<PipelineProgress>({
    stage: 'idle',
    currentStep: '',
    message: '',
    checkId: initialCheckId || null,
    jobId: null,
    jsonGenerated: false,
    citationsIdentified: false,
    validationProgress: {
      tier2Current: 0,
      tier2Total: 0,
      tier3Current: 0,
      tier3Total: 0,
      stage: 'idle'
    }
  })
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load current state on mount
  useEffect(() => {
    const loadCurrentState = async () => {
      try {
        const fileRes = await fetch(`/api/citation-checker/files`)
        if (fileRes.ok) {
          const files = await fileRes.json()
          const file = files.find((f: any) => f.id === fileId)
          if (file?.citationChecks?.[0]) {
            const check = file.citationChecks[0]
            const hasJson = !!check.jsonData
            const hasCitations = hasJson && check.jsonData?.document?.citations?.length > 0
            const hasValidation = hasCitations && check.jsonData?.document?.citations?.some((c: any) => c.validation)
            
            setProgress(prev => ({
              ...prev,
              checkId: check.id,
              jsonGenerated: hasJson,
              citationsIdentified: hasCitations,
              stage: hasValidation ? 'complete' : hasCitations ? 'validate-citations' : hasJson ? 'identify-citations' : 'idle'
            }))
            
            // Load identification method if it exists
            if (check.identificationMethod) {
              setIdentificationMethod(check.identificationMethod === 'eyecite' ? 'eyecite' : 'regex')
            }
          }
        }
      } catch (err) {
        console.error('Failed to load current state:', err)
      }
    }
    
    loadCurrentState()
  }, [fileId])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  const pollValidationProgress = async (jobId: string, checkIdToUse: string | null) => {
    try {
      console.log(`[RunCitationCheckerPage] Polling job status for jobId: ${jobId}`)
      const response = await fetch(`/api/citation-checker/jobs/${jobId}`)
      if (response.ok) {
        const data = await response.json()
        
        console.log('[RunCitationCheckerPage] Job progress update:', {
          jobId: data.id,
          status: data.status,
          tier2Progress: data.tier2Progress,
          tier3Progress: data.tier3Progress,
          checkId: data.checkId
        })
        
        // Extract progress from the correct structure
        const tier2Current = data.tier2Progress?.current || data.tier2Completed || 0
        const tier2Total = data.tier2Progress?.total || data.tier2Total || 0
        const tier3Current = data.tier3Progress?.current || data.tier3Completed || 0
        const tier3Total = data.tier3Progress?.total || data.tier3Total || 0
        
        // Determine stage
        let stage: 'idle' | 'tier2' | 'tier3' | 'complete' = 'tier2'
        if (data.status === 'completed') {
          stage = 'complete'
        } else if (tier2Current >= tier2Total && tier3Total > 0) {
          stage = 'tier3'
        } else if (tier2Current < tier2Total) {
          stage = 'tier2'
        }
        
        setProgress(prev => ({
          ...prev,
          validationProgress: {
            tier2Current: tier2Current,
            tier2Total: tier2Total,
            tier3Current: tier3Current,
            tier3Total: tier3Total,
            stage: stage
          },
          message: data.status === 'completed' 
            ? 'Validation complete!' 
            : `Validating citations... (Tier 2: ${tier2Current}/${tier2Total}, Tier 3: ${tier3Current}/${tier3Total})`
        }))
        
        if (data.status === 'completed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          setProgress(prev => ({ ...prev, stage: 'complete', message: 'Validation complete!' }))
          // Wait a moment for final updates, then navigate
          const finalCheckId = data.checkId || checkIdToUse
          setTimeout(() => {
            router.push(`/citation-checker/${fileId}/document-review${finalCheckId ? `?checkId=${finalCheckId}` : ''}`)
          }, 1000)
        }
      }
    } catch (err) {
      console.error('Error polling validation progress:', err)
    }
  }

  const startPolling = (jobId: string, checkIdToUse: string | null) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    
    // Poll immediately
    pollValidationProgress(jobId, checkIdToUse)
    
    // Then poll every 2 seconds
    pollIntervalRef.current = setInterval(() => {
      pollValidationProgress(jobId, checkIdToUse)
    }, 2000)
  }

  const handleRunPipeline = async () => {
    setRunning(true)
    setProgress(prev => ({ ...prev, stage: 'generate-json', currentStep: 'Initializing...', message: 'Starting citation validation...' }))

    try {
      // First, ensure we have a check ID
      let checkIdToUse = progress.checkId
      
      if (!checkIdToUse) {
        // Get or create a check by calling generate-json (which creates a check if needed)
        setProgress(prev => ({ ...prev, currentStep: 'Preparing...', message: 'Setting up citation check...' }))
        
        const jsonRes = await fetch(`/api/citation-checker/files/${fileId}/generate-json`, {
          method: 'POST'
        })
        
        if (!jsonRes.ok) {
          const errorData = await jsonRes.json()
          throw new Error(errorData.error || 'Failed to initialize citation check')
        }
        
        const jsonData = await jsonRes.json()
        checkIdToUse = jsonData.id
        setProgress(prev => ({ 
          ...prev, 
          checkId: checkIdToUse,
          jsonGenerated: !!jsonData.jsonData,
          citationsIdentified: !!(jsonData.jsonData?.document?.citations?.length > 0)
        }))
      }

      if (!checkIdToUse) {
        throw new Error('No citation check ID available')
      }

      // Use the unified pipeline endpoint which handles JSON generation, identification, and validation
      setProgress(prev => ({ ...prev, stage: 'generate-json', currentStep: 'Running Pipeline...', message: 'Running complete citation checking pipeline...' }))
      
      const pipelineRes = await fetch(`/api/citation-checker/checks/${checkIdToUse}/run-full-pipeline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identificationMethod: identificationMethod || 'eyecite'
        })
      })
      
      if (!pipelineRes.ok) {
        const errorData = await pipelineRes.json()
        throw new Error(errorData.error || errorData.details || 'Failed to start pipeline')
      }
      
      const pipelineData = await pipelineRes.json()
      
      if (pipelineData.jobId) {
        setProgress(prev => ({ 
          ...prev, 
          checkId: pipelineData.checkId || checkIdToUse,
          jobId: pipelineData.jobId,
          stage: 'validate-citations',
          currentStep: 'Validating Citations',
          message: 'Pipeline started successfully',
          jsonGenerated: true,
          citationsIdentified: true
        }))
        
        // Start polling for validation progress
        startPolling(pipelineData.jobId, pipelineData.checkId || checkIdToUse)
      } else {
        throw new Error('No job ID returned from pipeline')
      }
    } catch (error) {
      console.error('Pipeline error:', error)
      setProgress(prev => ({ 
        ...prev, 
        stage: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }))
      setRunning(false)
    }
  }

  const getProgressPercentage = () => {
    if (progress.stage === 'idle') return 0
    if (progress.stage === 'generate-json') return 20
    if (progress.stage === 'identify-citations') return 40
    if (progress.stage === 'validate-citations') {
      const { tier2Current, tier2Total, tier3Current, tier3Total, stage } = progress.validationProgress
      if (stage === 'tier2') {
        return 40 + (tier2Total > 0 ? (tier2Current / tier2Total) * 40 : 0)
      } else if (stage === 'tier3') {
        return 80 + (tier3Total > 0 ? (tier3Current / tier3Total) * 20 : 0)
      }
      return 40
    }
    if (progress.stage === 'complete') return 100
    return 0
  }

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-4">
        <div 
          className="bg-indigo-600 h-4 rounded-full transition-all duration-300"
          style={{ width: `${getProgressPercentage()}%` }}
        />
      </div>

      {/* Current Status */}
      {progress.stage !== 'idle' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="font-semibold text-blue-900">{progress.currentStep}</span>
          </div>
          <p className="text-blue-800 text-sm">{progress.message}</p>
          
          {/* Validation Progress Details */}
          {progress.stage === 'validate-citations' && progress.validationProgress.stage !== 'idle' && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-blue-700">
                Tier 2: {progress.validationProgress.tier2Current} / {progress.validationProgress.tier2Total}
              </div>
              {progress.validationProgress.tier3Total > 0 && (
                <div className="text-xs text-blue-700">
                  Tier 3: {progress.validationProgress.tier3Current} / {progress.validationProgress.tier3Total}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {progress.stage === 'error' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-semibold mb-2">Error</p>
          <p className="text-red-700 text-sm">{progress.message}</p>
        </div>
      )}

      {/* Citation Identification Method Selection */}
      {(progress.stage === 'idle' || progress.stage === 'error') && !progress.citationsIdentified && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Citation Identification Method</h3>
          <div className="flex gap-4">
            <button
              onClick={() => setIdentificationMethod('regex')}
              disabled={running}
              className={`px-6 py-3 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
                identificationMethod === 'regex'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500'
              }`}
            >
              Custom Regex
            </button>
            <button
              onClick={() => setIdentificationMethod('eyecite')}
              disabled={running}
              className={`px-6 py-3 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
                identificationMethod === 'eyecite'
                  ? 'bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500'
              }`}
            >
              Eyecite
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {identificationMethod === 'eyecite' 
              ? 'Uses Eyecite library for case citations, with custom patterns for statutes and regulations.'
              : 'Uses custom regex patterns to identify all citation types.'}
          </p>
        </div>
      )}

      {/* Action Button */}
      <div className="flex gap-4">
        {progress.stage === 'idle' || progress.stage === 'error' ? (
          <button
            onClick={handleRunPipeline}
            disabled={running}
            className={buttonStyles.primary + " py-3"}
          >
            {running ? 'Running...' : 'Validate Citations'}
          </button>
        ) : progress.stage === 'complete' ? (
          <button
            onClick={() => router.push(`/citation-checker/${fileId}/document-review${progress.checkId ? `?checkId=${progress.checkId}` : ''}`)}
            className={buttonStyles.primary + " py-3 bg-green-600 hover:bg-green-700 focus:ring-green-500"}
          >
            Continue to Document Review →
          </button>
        ) : null}
        
        {progress.stage !== 'idle' && progress.stage !== 'complete' && progress.stage !== 'error' && (
          <button
            onClick={() => {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
              }
              setRunning(false)
              setProgress(prev => ({ ...prev, stage: 'idle', message: '' }))
            }}
            className={buttonStyles.secondary + " py-3"}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Status Summary */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Pipeline Status</h3>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            {progress.jsonGenerated ? (
              <span className="text-green-600">✓</span>
            ) : (
              <span className="text-gray-400">○</span>
            )}
            <span className={progress.jsonGenerated ? 'text-gray-900' : 'text-gray-500'}>
              JSON Generated
            </span>
          </div>
          <div className="flex items-center gap-2">
            {progress.citationsIdentified ? (
              <span className="text-green-600">✓</span>
            ) : (
              <span className="text-gray-400">○</span>
            )}
            <span className={progress.citationsIdentified ? 'text-gray-900' : 'text-gray-500'}>
              Citations Identified
            </span>
          </div>
          <div className="flex items-center gap-2">
            {progress.validationProgress.stage === 'complete' ? (
              <span className="text-green-600">✓</span>
            ) : (
              <span className="text-gray-400">○</span>
            )}
            <span className={progress.validationProgress.stage === 'complete' ? 'text-gray-900' : 'text-gray-500'}>
              Citations Validated
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

