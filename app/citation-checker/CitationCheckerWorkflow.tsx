"use client"

import { useState, useEffect, useCallback } from "react"

type WorkflowStep = 
  | "upload"
  | "generate-json"
  | "identify-citations"
  | "validate-citations"
  | "review-discrepancies"
  | "citations-report"

interface StepConfig {
  id: WorkflowStep
  title: string
  description: string
  component: React.ReactNode
}

interface FileUpload {
  id: string
  filename: string
  originalName: string
  fileSize: number
  mimeType: string
  blobUrl: string | null
  createdAt: string
  citationChecks: CitationCheck[]
  user?: {
    id: string
    name: string | null
    email: string
  }
}

interface CitationCheck {
  id: string
  fileUploadId: string
  version: number
  status: string
  jsonData: any | null // Complete JSON blob structure - format TBD by parser
}

export function CitationCheckerWorkflow() {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>("upload")
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set())
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null)
  const [files, setFiles] = useState<FileUpload[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)

  // Update selectedCheckId when it changes (e.g., after citation identification creates new version)
  const updateSelectedCheckId = (newCheckId: string) => {
    setSelectedCheckId(newCheckId)
  }

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      const res = await fetch("/api/citation-checker/files")
      if (res.ok) {
        const data = await res.json()
        setFiles(data)
      }
    } catch (error) {
      console.error("Error loading files:", error)
    } finally {
      setLoadingFiles(false)
    }
  }

  const steps: StepConfig[] = [
    {
      id: "upload",
      title: "Upload File",
      description: "Upload your document to begin citation checking",
      component: (
        <UploadStep 
          onComplete={(fileId, checkId) => {
            setSelectedFileId(fileId)
            setSelectedCheckId(checkId)
            handleStepComplete("upload")
          }}
          files={files}
          loadingFiles={loadingFiles}
          onFileSelect={(fileId, checkId) => {
            setSelectedFileId(fileId)
            setSelectedCheckId(checkId)
            const file = files.find(f => f.id === fileId)
            if (file) {
              const hasJson = file.citationChecks[0]?.jsonData
              if (hasJson) {
                // JSON already exists, jump to generate-json step
                setCurrentStep("generate-json")
                setCompletedSteps(new Set(["upload"]))
              } else {
                // No JSON yet, navigate to generate-json step to create it
                setCurrentStep("generate-json")
                setCompletedSteps(new Set(["upload"]))
              }
            }
          }}
          onRefresh={loadFiles}
        />
      ),
    },
    {
      id: "generate-json",
      title: "Generate JSON",
      description: "Convert document to structured JSON format",
      component: (
        <GenerateJsonStep 
          onComplete={() => handleStepComplete("generate-json")}
          fileId={selectedFileId}
          checkId={selectedCheckId}
          onCheckIdUpdate={updateSelectedCheckId}
        />
      ),
    },
    {
      id: "identify-citations",
      title: "Identify Citations",
      description: "Extract and identify all citations from the document",
      component: (
        <IdentifyCitationsStep 
          onComplete={() => handleStepComplete("identify-citations")}
          fileId={selectedFileId}
          checkId={selectedCheckId}
          onCheckIdUpdate={updateSelectedCheckId}
        />
      ),
    },
    {
      id: "validate-citations",
      title: "Validate Citations",
      description: "Verify citation accuracy and completeness",
      component: (
        <ValidateCitationsStep 
          onComplete={() => handleStepComplete("validate-citations")}
          fileId={selectedFileId}
          checkId={selectedCheckId}
        />
      ),
    },
    {
      id: "review-discrepancies",
      title: "Review Discrepancies",
      description: "Review and address any citation discrepancies",
      component: (
        <ReviewDiscrepanciesStep 
          onComplete={() => handleStepComplete("review-discrepancies")}
          fileId={selectedFileId}
          checkId={selectedCheckId}
        />
      ),
    },
    {
      id: "citations-report",
      title: "Citations Report",
      description: "View the final citation validation report",
      component: <CitationsReportStep fileId={selectedFileId} checkId={selectedCheckId} />,
    },
  ]

  const handleStepComplete = (stepId: WorkflowStep) => {
    setCompletedSteps((prev) => new Set([...prev, stepId]))
    const currentIndex = steps.findIndex((s) => s.id === stepId)
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1].id)
    }
  }

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep)
  const currentStepData = steps[currentStepIndex]

  return (
    <>
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isActive = step.id === currentStep
            const isCompleted = completedSteps.has(step.id)
            const isAccessible = index === 0 || completedSteps.has(steps[index - 1].id)

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <button
                    onClick={() => isAccessible && setCurrentStep(step.id)}
                    disabled={!isAccessible}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium mb-2 ${
                      isCompleted
                        ? "bg-green-600 text-white"
                        : isActive
                        ? "bg-indigo-600 text-white"
                        : isAccessible
                        ? "bg-gray-200 text-gray-600 hover:bg-gray-300"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {isCompleted ? "✓" : index + 1}
                  </button>
                  <div className="text-center">
                    <div
                      className={`text-xs font-medium ${
                        isActive ? "text-indigo-600" : "text-gray-500"
                      }`}
                    >
                      {step.title}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-1 flex-1 mx-2 ${
                      isCompleted ? "bg-green-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Current Step Content */}
      <div className="border border-gray-200 rounded-lg p-8 bg-white">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black mb-2">
            Step {currentStepIndex + 1}: {currentStepData.title}
          </h2>
          <p className="text-black text-gray-600">
            {currentStepData.description}
          </p>
        </div>

        <div className="mt-8">{currentStepData.component}</div>
      </div>
    </>
  )
}

// Context Panel Component
function ContextPanel({ 
  fileId, 
  checkId,
  showJson = false,
  showCitationCount = false,
  showValidationResults = false
}: { 
  fileId: string | null
  checkId: string | null
  showJson?: boolean
  showCitationCount?: boolean
  showValidationResults?: boolean
}) {
  const [fileInfo, setFileInfo] = useState<{ filename: string } | null>(null)
  const [jsonData, setJsonData] = useState<string | null>(null)
  const [citationCount, setCitationCount] = useState<number | null>(null)
  const [validationResults, setValidationResults] = useState<{ valid: number; invalid: number } | null>(null)

  useEffect(() => {
    if (checkId) {
      loadContextData()
    }
  }, [checkId])

  const loadContextData = async () => {
    if (!checkId) return
    
    try {
      // Load check data
      const checkRes = await fetch(`/api/citation-checker/checks/${checkId}`)
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        
        // Get file info
        if (checkData.fileUpload) {
          setFileInfo({ filename: checkData.fileUpload.originalName })
        }
        
        // Get JSON data
        if (checkData.jsonData) {
          setJsonData(JSON.stringify(checkData.jsonData, null, 2))
          
          // Extract citation count from JSON
          if (checkData.jsonData.document?.citations) {
            setCitationCount(checkData.jsonData.document.citations.length)
          } else if (checkData.jsonData.document?.metadata?.totalCitations) {
            setCitationCount(checkData.jsonData.document.metadata.totalCitations)
          }
        }
        
        // Extract validation results from JSON if available
        if (checkData.jsonData?.document?.citations) {
          const citations = checkData.jsonData.document.citations
          const valid = citations.filter((c: any) => 
            c.tier_2?.consensus === "VALID"
          ).length
          const invalid = citations.length - valid
          setValidationResults({ valid, invalid })
        }
      }
    } catch (error) {
      console.error("Error loading context data:", error)
    }
  }

  if (!fileInfo && !jsonData && !citationCount) {
    return null
  }

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Context & Debug Info</h3>
      <div className="space-y-4">
        {fileInfo && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">File Name</div>
            <div className="text-sm text-black">{fileInfo.filename}</div>
          </div>
        )}
        
        {showCitationCount && citationCount !== null && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Total Citations</div>
            <div className="text-sm font-semibold text-black">{citationCount}</div>
          </div>
        )}
        
        {showValidationResults && validationResults && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">Validation Results</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-600">Valid</div>
                <div className="text-lg font-bold text-green-600">{validationResults.valid}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Invalid/Flagged</div>
                <div className="text-lg font-bold text-red-600">{validationResults.invalid}</div>
              </div>
            </div>
          </div>
        )}
        
        {showJson && jsonData && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">Current JSON</div>
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
              <pre className="text-xs text-black overflow-auto max-h-64">{jsonData}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Step Components
function UploadStep({ 
  onComplete, 
  files, 
  loadingFiles,
  onFileSelect,
  onRefresh 
}: { 
  onComplete: (fileId: string, checkId: string) => void
  files: FileUpload[]
  loadingFiles: boolean
  onFileSelect: (fileId: string, checkId: string) => void
  onRefresh: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/citation-checker/files", {
        method: "POST",
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        onComplete(data.fileUpload.id, data.citationCheck.id)
        onRefresh()
      } else {
        alert("Failed to upload file")
      }
    } catch (error) {
      console.error("Upload error:", error)
      alert("Failed to upload file")
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB"
    return (bytes / (1024 * 1024)).toFixed(2) + " MB"
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-black mb-2">
          Upload New Word Document
        </label>
        <input
          type="file"
          accept=".doc,.docx"
          onChange={handleFileChange}
          className="block w-full text-sm text-black file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {file && (
          <p className="mt-2 text-sm text-black">
            Selected: {file.name} ({formatFileSize(file.size)})
          </p>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload File"}
      </button>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-black mb-4">Uploaded Files</h3>
        {loadingFiles ? (
          <p className="text-gray-500">Loading files...</p>
        ) : files.length === 0 ? (
          <p className="text-gray-500">No files uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {files.map((file) => {
              const latestCheck = file.citationChecks[0]
              const hasJson = latestCheck?.jsonData
              
              return (
                <div
                  key={file.id}
                  className="p-4 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-black">{file.originalName}</div>
                      <div className="text-sm text-gray-500">
                        {formatFileSize(file.fileSize)} • {new Date(file.createdAt).toLocaleDateString()}
                        {file.user && (
                          <span className="ml-2 text-gray-400">
                            by {file.user.name || file.user.email}
                          </span>
                        )}
                        {hasJson && (
                          <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                            JSON Generated
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {hasJson ? (
                        <button
                          onClick={() => onFileSelect(file.id, latestCheck!.id)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                        >
                          Continue from JSON
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const checkId = latestCheck?.id || ""
                            onFileSelect(file.id, checkId)
                          }}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!latestCheck}
                        >
                          Select & Generate JSON
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function GenerateJsonStep({ 
  onComplete, 
  fileId, 
  checkId,
  onCheckIdUpdate
}: { 
  onComplete: () => void
  fileId: string | null
  checkId: string | null
  onCheckIdUpdate?: (newCheckId: string) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [jsonData, setJsonData] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadCheckData = useCallback(async () => {
    setLoading(true)
    try {
      // First try to load from checkId if provided
      if (checkId) {
        console.log('[GenerateJsonStep] Loading check data for checkId:', checkId)
        const res = await fetch(`/api/citation-checker/checks/${checkId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.jsonData) {
            console.log('[GenerateJsonStep] Found JSON in check:', checkId)
            setJsonData(JSON.stringify(data.jsonData, null, 2))
            setLoading(false)
            return
          }
        }
      }
      
      // If no checkId or checkId doesn't have JSON, check the file's latest check
      if (fileId) {
        console.log('[GenerateJsonStep] Checking file for existing JSON:', fileId)
        const fileRes = await fetch(`/api/citation-checker/files`)
        if (fileRes.ok) {
          const files = await fileRes.json()
          const file = files.find((f: any) => f.id === fileId)
          if (file && file.citationChecks && file.citationChecks.length > 0) {
            // Find the latest check with JSON
            const checkWithJson = file.citationChecks.find((check: any) => check.jsonData)
            if (checkWithJson) {
              console.log('[GenerateJsonStep] Found JSON in file check:', checkWithJson.id)
              setJsonData(JSON.stringify(checkWithJson.jsonData, null, 2))
              // Update checkId to the one with JSON
              if (onCheckIdUpdate && checkWithJson.id !== checkId) {
                onCheckIdUpdate(checkWithJson.id)
              }
            } else {
              console.log('[GenerateJsonStep] No JSON found in file checks')
            }
          }
        }
      }
    } catch (error) {
      console.error("[GenerateJsonStep] Error loading check:", error)
    } finally {
      setLoading(false)
    }
  }, [checkId, fileId, onCheckIdUpdate])

  useEffect(() => {
    loadCheckData()
  }, [loadCheckData])

  const handleGenerate = async (forceRegenerate = false) => {
    if (!fileId) return

    setGenerating(true)
    try {
      const url = forceRegenerate 
        ? `/api/citation-checker/files/${fileId}/generate-json?force=true`
        : `/api/citation-checker/files/${fileId}/generate-json`
      
      const res = await fetch(url, {
        method: "POST",
      })

      if (res.ok) {
        const data = await res.json()
        // jsonData is a JSON object (JsonB), stringify for display
        if (data.jsonData) {
          setJsonData(JSON.stringify(data.jsonData, null, 2))
        }
        // Update checkId if a new version was created (regeneration) or if we got existing check
        if (data.id && data.id !== checkId && onCheckIdUpdate) {
          onCheckIdUpdate(data.id)
        }
        // Only auto-advance if this was initial generation, not regeneration
        if (!forceRegenerate) {
          onComplete()
        }
      } else {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }))
        const errorMessage = errorData.details || errorData.error || "Failed to generate JSON"
        alert(`Failed to generate JSON: ${errorMessage}`)
        console.error("Generate JSON error:", errorData)
      }
    } catch (error) {
      console.error("Generate error:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to generate JSON"
      alert(`Failed to generate JSON: ${errorMessage}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {loading && (
        <p className="text-gray-600">Loading existing JSON...</p>
      )}
      {jsonData ? (
        <div>
          <p className="text-green-600 mb-4">✓ JSON already generated</p>
          <div className="mt-4 p-4 bg-gray-50 rounded-md relative">
            <div className="absolute top-2 right-2 flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(jsonData).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }).catch((err) => {
                    console.error('Failed to copy:', err)
                    alert('Failed to copy to clipboard')
                  })
                }}
                className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title="Copy JSON to clipboard"
              >
                {copied ? (
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([jsonData], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `citation-check-${fileId || 'document'}-${new Date().toISOString().split('T')[0]}.json`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                }}
                className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title="Download JSON file"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
            <pre className="text-sm text-black overflow-auto max-h-96 pr-20">{jsonData}</pre>
          </div>
          <div className="mt-4 flex space-x-4">
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating || !fileId}
              className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
            >
              {generating ? "Regenerating JSON..." : "Regenerate JSON"}
            </button>
            <button
              onClick={onComplete}
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Continue to Next Step
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => handleGenerate(false)}
            disabled={generating || !fileId}
            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {generating ? "Generating JSON..." : "Generate JSON"}
          </button>

          {jsonData && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md relative">
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(jsonData).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }).catch((err) => {
                      console.error('Failed to copy:', err)
                      alert('Failed to copy to clipboard')
                    })
                  }}
                  className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title="Copy JSON to clipboard"
                >
                  {copied ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([jsonData], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `citation-check-${fileId || 'document'}-${new Date().toISOString().split('T')[0]}.json`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }}
                  className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title="Download JSON file"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>
              <pre className="text-sm text-black overflow-auto max-h-96 pr-20">{jsonData}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function IdentifyCitationsStep({ 
  onComplete, 
  fileId,
  checkId,
  onCheckIdUpdate
}: { 
  onComplete: () => void
  fileId: string | null
  checkId: string | null
  onCheckIdUpdate?: (newCheckId: string) => void
}) {
  const [identifying, setIdentifying] = useState(false)
  const [identifyingEyecite, setIdentifyingEyecite] = useState(false)
  const [citations, setCitations] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [currentCheckId, setCurrentCheckId] = useState<string | null>(checkId)
  const [identificationMethod, setIdentificationMethod] = useState<string | null>(null)

  const handleIdentify = async (useEyecite: boolean = false) => {
    if (!checkId) {
      setError("No citation check selected")
      return
    }

    if (useEyecite) {
      setIdentifyingEyecite(true)
    } else {
      setIdentifying(true)
    }
    setError(null)
    
    try {
      const endpoint = useEyecite 
        ? `/api/citation-checker/checks/${checkId}/identify-citations-eyecite`
        : `/api/citation-checker/checks/${checkId}/identify-citations`
      
      const res = await fetch(endpoint, {
        method: "POST",
      })

      if (res.ok) {
        const data = await res.json()
        
        // Log Eyecite logs to browser console if present
        if (useEyecite && data.logs && Array.isArray(data.logs)) {
          console.group(`[Eyecite] Citation Identification Logs`)
          data.logs.forEach((logEntry: any) => {
            const { level, message, data: logData, timestamp } = logEntry
            const time = new Date(timestamp).toLocaleTimeString()
            const logMessage = `[${time}] ${message}`
            
            if (logData !== undefined) {
              switch (level) {
                case 'error':
                  console.error(logMessage, logData)
                  break
                case 'warn':
                  console.warn(logMessage, logData)
                  break
                case 'info':
                  console.info(logMessage, logData)
                  break
                default:
                  console.log(logMessage, logData)
              }
            } else {
              switch (level) {
                case 'error':
                  console.error(logMessage)
                  break
                case 'warn':
                  console.warn(logMessage)
                  break
                case 'info':
                  console.info(logMessage)
                  break
                default:
                  console.log(logMessage)
              }
            }
          })
          console.groupEnd()
        }
        
        // Update checkId to the new version
        setCurrentCheckId(data.id)
        if (onCheckIdUpdate) {
          onCheckIdUpdate(data.id)
        }
        
        // Extract citations from jsonData
        if (data.jsonData?.document?.citations) {
          const citationTexts = data.jsonData.document.citations.map(
            (cit: any) => cit.citationText
          )
          setCitations(citationTexts)
        }
        
        // Track which method was used
        setIdentificationMethod(useEyecite ? 'eyecite' : 'custom')
        
        onComplete()
      } else {
        const errorData = await res.json()
        setError(errorData.error || errorData.details || `Failed to identify citations${useEyecite ? ' with Eyecite' : ''}`)
      }
    } catch (err) {
      console.error("Identify citations error:", err)
      setError(`Failed to identify citations${useEyecite ? ' with Eyecite' : ''}`)
    } finally {
      if (useEyecite) {
        setIdentifyingEyecite(false)
      } else {
        setIdentifying(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Citation Identification Method</h3>
          <div className="flex gap-4">
            <button
              onClick={() => handleIdentify(false)}
              disabled={identifying || identifyingEyecite || !checkId}
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {identifying ? "Identifying..." : "Identify Citations (Custom)"}
            </button>
            <button
              onClick={() => handleIdentify(true)}
              disabled={identifying || identifyingEyecite || !checkId}
              className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {identifyingEyecite ? "Identifying..." : "Identify Citations (Eyecite)"}
            </button>
          </div>
        </div>
        {identificationMethod && (
          <div className="text-sm text-gray-600">
            Last used: <span className="font-medium">{identificationMethod === 'eyecite' ? 'Eyecite' : 'Custom Regex'}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {citations.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold text-black mb-2">
            Found {citations.length} Citations
          </h3>
          <ul className="list-disc list-inside space-y-2 text-black">
            {citations.map((citation, index) => (
              <li key={index}>{citation}</li>
            ))}
          </ul>
        </div>
      )}
      
      <ContextPanel 
        fileId={fileId}
        checkId={currentCheckId || checkId}
        showJson={true}
      />
    </div>
  )
}

function ValidateCitationsStep({ 
  onComplete, 
  fileId,
  checkId 
}: { 
  onComplete: () => void
  fileId: string | null
  checkId: string | null
}) {
  const [validating, setValidating] = useState(false)
  const [results, setResults] = useState<{ valid: number; invalid: number } | null>(null)

  const handleValidate = async () => {
    setValidating(true)
    // TODO: Implement citation validation API
    setTimeout(() => {
      setResults({ valid: 1, invalid: 1 })
      setValidating(false)
      onComplete()
    }, 2000)
  }

  return (
    <div className="space-y-6">
      <button
        onClick={handleValidate}
        disabled={validating}
        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {validating ? "Validating Citations..." : "Validate Citations"}
      </button>

      {results && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Valid Citations</div>
              <div className="text-2xl font-bold text-green-600">{results.valid}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Invalid Citations</div>
              <div className="text-2xl font-bold text-red-600">{results.invalid}</div>
            </div>
          </div>
        </div>
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

function ReviewDiscrepanciesStep({ 
  onComplete, 
  fileId,
  checkId 
}: { 
  onComplete: () => void
  fileId: string | null
  checkId: string | null
}) {
  const [discrepancies] = useState([
    {
      citation: "Smith v. Jones, 123 F.3d 456 (2020)",
      issue: "Case not found in database",
      severity: "high",
    },
  ])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-black mb-4">
          Citation Discrepancies
        </h3>
        {discrepancies.length > 0 ? (
          <div className="space-y-4">
            {discrepancies.map((disc, index) => (
              <div
                key={index}
                className="p-4 border border-red-200 rounded-md bg-red-50"
              >
                <div className="font-medium text-black mb-1">{disc.citation}</div>
                <div className="text-sm text-red-700">{disc.issue}</div>
                <div className="mt-2">
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      disc.severity === "high"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {disc.severity.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-black text-gray-500">No discrepancies found.</p>
        )}
      </div>

      <button
        onClick={onComplete}
        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        Continue to Report
      </button>
      
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

function CitationsReportStep({ fileId, checkId }: { fileId: string | null; checkId: string | null }) {
  return (
    <div className="space-y-6">
      <div className="p-6 bg-gray-50 rounded-md">
        <h3 className="text-lg font-semibold text-black mb-4">
          Citation Validation Report
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <div className="text-sm text-gray-600">Total Citations</div>
            <div className="text-2xl font-bold text-black">2</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Valid</div>
            <div className="text-2xl font-bold text-green-600">1</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Invalid</div>
            <div className="text-2xl font-bold text-red-600">1</div>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="font-semibold text-black mb-2">Summary</h4>
          <p className="text-black text-sm">
            Your document contains 2 citations. 1 citation was validated successfully,
            while 1 citation requires attention. Please review the discrepancies section
            for details.
          </p>
        </div>
      </div>

      <div className="flex space-x-4">
        <button className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
          Download Report
        </button>
        <button className="px-6 py-3 border border-gray-300 text-black rounded-md hover:bg-gray-50">
          Start New Check
        </button>
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
