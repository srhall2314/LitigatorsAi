"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ValidationSummary } from "./components/ValidationSummary"
import { CitationsReportPage } from "./components/CitationsReportPage"

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
  standardWorkflowCheck?: CitationCheck | null
  accessLevel?: 'owner' | 'edit' | 'view' | 'route' | null
  shares?: Array<{
    id: string
    permission: string
    routedFromId?: string | null
    routedAt?: string | null
    createdAt: string
    sharedBy?: {
      id: string
      name: string | null
      email: string
    }
    routedFrom?: {
      id: string
      name: string | null
      email: string
    } | null
  }>
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
  // Workflow tracking fields (optional for backward compatibility)
  workflowType?: string | null
  workflowId?: string | null
  workflowStep?: string | null
  workflowMetadata?: any | null
  documentMetadata?: any | null
  citationCount?: number | null
  identificationMethod?: string | null
  completedSteps?: string[]
  currentStep?: string | null
  // Assignment tracking for soft routing
  assignedToId?: string | null
  assignedAt?: string | null
  assignedTo?: {
    id: string
    name: string | null
    email: string
  } | null
}

interface CitationCheckerWorkflowProps {
  initialFileId?: string | null
  initialCheckId?: string | null
  initialStep?: WorkflowStep
}

export function CitationCheckerWorkflow({ 
  initialFileId = null, 
  initialCheckId = null,
  initialStep = "upload"
}: CitationCheckerWorkflowProps = {}) {
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(initialStep)
  const [completedSteps, setCompletedSteps] = useState<Set<WorkflowStep>>(new Set())
  const [selectedFileId, setSelectedFileId] = useState<string | null>(initialFileId)
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(initialCheckId)
  const [files, setFiles] = useState<FileUpload[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [initializing, setInitializing] = useState(true)

  // Update selectedCheckId when it changes (e.g., after citation identification creates new version)
  const updateSelectedCheckId = (newCheckId: string) => {
    setSelectedCheckId(newCheckId)
  }

  const loadFiles = useCallback(async () => {
    try {
      setLoadingFiles(true)
      const res = await fetch("/api/citation-checker/files")
      if (res.ok) {
        const data = await res.json()
        setFiles(data)
        return data
      } else {
        console.error("Failed to load files:", res.status, res.statusText)
        const errorData = await res.json().catch(() => ({}))
        console.error("Error details:", errorData)
        return []
      }
    } catch (error) {
      console.error("Error loading files:", error)
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack)
      }
      return []
    } finally {
      setLoadingFiles(false)
    }
  }, [])

  // Initialize workflow state from URL params or props
  useEffect(() => {
    const initializeWorkflow = async () => {
      setInitializing(true)
      
      // Check URL search params first
      const urlFileId = searchParams?.get('fileId')
      const urlCheckId = searchParams?.get('checkId')
      const urlStep = searchParams?.get('step') as WorkflowStep | null
      
      let fileId = urlFileId || initialFileId
      let checkId = urlCheckId || initialCheckId
      let step = urlStep || initialStep
      
      // Load files
      const filesData = await loadFiles()
      
      // If no fileId provided, use the most recent file
      if (!fileId && filesData.length > 0) {
        const latestFile = filesData[0]
        fileId = latestFile.id
        
        // Try to find checkId from the file
        if (latestFile.citationChecks && latestFile.citationChecks.length > 0) {
          // Prefer check with JSON, otherwise use latest
          const checkWithJson = latestFile.citationChecks.find((check: any) => check.jsonData)
          checkId = checkWithJson?.id || latestFile.citationChecks[0].id
        }
      }
      
      // If we have fileId but no checkId, try to load it from the file
      if (fileId && !checkId && filesData.length > 0) {
        const file = filesData.find((f: any) => f.id === fileId)
        if (file && file.citationChecks && file.citationChecks.length > 0) {
          const checkWithJson = file.citationChecks.find((check: any) => check.jsonData)
          checkId = checkWithJson?.id || file.citationChecks[0].id
        }
      }
      
      // Update state
      if (fileId) {
        setSelectedFileId(fileId)
      }
      if (checkId) {
        setSelectedCheckId(checkId)
      }
      if (step && step !== currentStep) {
        setCurrentStep(step)
      }
      
      // Determine completed steps based on what data exists
      if (fileId && filesData.length > 0) {
        const completed = new Set<WorkflowStep>(["upload"])
        const file = filesData.find((f: any) => f.id === fileId)
        
        if (file && file.citationChecks && file.citationChecks.length > 0) {
          const latestCheck = file.citationChecks[0]
          if (latestCheck.jsonData) {
            completed.add("generate-json")
            if (latestCheck.jsonData?.document?.citations?.length > 0) {
              completed.add("identify-citations")
            }
          }
        }
        setCompletedSteps(completed)
      }
      
      setInitializing(false)
    }
    
    initializeWorkflow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

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
              // Use standardWorkflowCheck if available, otherwise use latest check
              const check = file.standardWorkflowCheck || file.citationChecks[0]
              const currentStepFromCheck = check?.currentStep
              const completedStepsFromCheck = check?.completedSteps || []
              
              // All workflow steps in order
              const allSteps: WorkflowStep[] = ["upload", "generate-json", "identify-citations", "validate-citations", "review-discrepancies", "citations-report"]
              
              // Map workflow step to WorkflowStep type
              const stepMap: Record<string, WorkflowStep> = {
                "generate-json": "generate-json",
                "identify-citations": "identify-citations",
                "validate-citations": "validate-citations",
                "review-discrepancies": "review-discrepancies",
                "citations-report": "citations-report",
              }
              
              // Determine which step to navigate to
              let targetStep: WorkflowStep = "generate-json" // Default
              if (currentStepFromCheck && stepMap[currentStepFromCheck]) {
                targetStep = stepMap[currentStepFromCheck]
              } else if (completedStepsFromCheck.length > 0) {
                // If we have completed steps but no current step, go to the next uncompleted step
                const lastCompleted = completedStepsFromCheck[completedStepsFromCheck.length - 1]
                const lastCompletedIndex = allSteps.indexOf(lastCompleted as WorkflowStep)
                if (lastCompletedIndex >= 0 && lastCompletedIndex < allSteps.length - 1) {
                  targetStep = allSteps[lastCompletedIndex + 1]
                }
              }
              
              // Set completed steps
              const completed = new Set<WorkflowStep>(["upload", ...completedStepsFromCheck.filter(s => allSteps.includes(s as WorkflowStep)) as WorkflowStep[]])
              setCompletedSteps(completed)
              setCurrentStep(targetStep)
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
      component: selectedFileId ? (
        <CitationsReportPage fileId={selectedFileId} checkId={selectedCheckId || undefined} />
      ) : (
        <div className="p-6 text-center">
          <p className="text-gray-600">Please select a file first</p>
        </div>
      ),
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

  const loadContextData = useCallback(async () => {
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
  }, [checkId])

  useEffect(() => {
    if (checkId) {
      loadContextData()
    }
  }, [checkId, loadContextData])

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
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return null
    
    const statusConfig: Record<string, { label: string; color: string }> = {
      uploaded: { label: "Uploaded", color: "bg-gray-100 text-gray-800 border border-gray-200" },
      json_generated: { label: "JSON Generated", color: "bg-blue-100 text-blue-800 border border-blue-200" },
      citations_identified: { label: "Citations Identified", color: "bg-purple-100 text-purple-800 border border-purple-200" },
      citations_validated: { label: "Citations Validated", color: "bg-green-100 text-green-800 border border-green-200" },
      discrepancies_reviewed: { label: "Discrepancies Reviewed", color: "bg-yellow-100 text-yellow-800 border border-yellow-200" },
      report_generated: { label: "Report Generated", color: "bg-indigo-100 text-indigo-800 border border-indigo-200" },
    }
    
    const config = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-800 border border-gray-200" }
    return (
      <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const getAccessLevelBadge = (accessLevel: string | undefined) => {
    if (!accessLevel) return null
    
    const levelConfig: Record<string, { label: string; color: string }> = {
      owner: { label: "Owner", color: "bg-indigo-100 text-indigo-800 border border-indigo-200" },
      edit: { label: "Can Edit", color: "bg-green-100 text-green-800 border border-green-200" },
      view: { label: "View Only", color: "bg-gray-100 text-gray-800 border border-gray-200" },
      route: { label: "Can Route", color: "bg-blue-100 text-blue-800 border border-blue-200" },
    }
    
    const config = levelConfig[accessLevel] || { label: accessLevel, color: "bg-gray-100 text-gray-800 border border-gray-200" }
    return (
      <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const getCurrentStepLabel = (currentStep: string | null | undefined) => {
    if (!currentStep) return null
    
    const stepLabels: Record<string, string> = {
      "generate-json": "Generate JSON",
      "identify-citations": "Identify Citations",
      "validate-citations": "Validate Citations",
      "review-discrepancies": "Review Discrepancies",
      "citations-report": "Citations Report",
    }
    
    return stepLabels[currentStep] || currentStep
  }

  const handleDeleteClick = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering file select
    setConfirmDeleteId(fileId)
  }

  const handleDeleteConfirm = async (fileId: string) => {
    setDeletingFileId(fileId)
    try {
      const res = await fetch(`/api/citation-checker/files/${fileId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        // Refresh files list
        onRefresh()
        setConfirmDeleteId(null)
      } else {
        const errorData = await res.json()
        alert(`Failed to delete file: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Delete error:", error)
      alert("Failed to delete file. Please try again.")
    } finally {
      setDeletingFileId(null)
    }
  }

  const handleDeleteCancel = () => {
    setConfirmDeleteId(null)
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
              // Use standardWorkflowCheck if available, otherwise use latest check
              const check = file.standardWorkflowCheck || file.citationChecks[0]
              const latestCheck = file.citationChecks[0]
              const status = check?.status
              const currentStep = check?.currentStep
              const citationCount = check?.citationCount
              
              // Get routing information
              const assignedTo = latestCheck?.assignedTo
              const routedShare = file.shares?.find(share => share.routedFromId)
              const routedFrom = routedShare?.routedFrom
              
              // Determine which check ID to use
              const checkId = check?.id || latestCheck?.id || ""
              
              return (
                <div
                  key={file.id}
                  className="p-4 border border-gray-200 rounded-md hover:border-gray-300 transition-colors bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* File Name */}
                      <div className="font-medium text-black truncate mb-3">
                        {file.originalName}
                      </div>
                      
                      {/* Status Section - Current State Indicators */}
                      <div className="mb-3 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status:</span>
                          {getStatusBadge(status)}
                          {getAccessLevelBadge(file.accessLevel || undefined)}
                        </div>
                      </div>
                      
                      {/* Workflow Section - Progress Information */}
                      {(currentStep || citationCount !== null) && (
                        <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-md">
                          <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5">Workflow</div>
                          <div className="space-y-1 text-xs text-blue-900">
                            {currentStep && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600">●</span>
                                <span>Current: <span className="font-medium">{getCurrentStepLabel(currentStep)}</span></span>
                              </div>
                            )}
                            {citationCount !== null && citationCount !== undefined && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600">●</span>
                                <span>Citations: <span className="font-medium">{citationCount}</span></span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Metadata Section - File Info & Routing */}
                      <div className="space-y-1.5 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">📄</span>
                          <span>{formatFileSize(file.fileSize)} • {new Date(file.createdAt).toLocaleDateString()}</span>
                          {file.user && (
                            <span className="text-gray-400">
                              by {file.user.name || file.user.email}
                            </span>
                          )}
                        </div>
                        
                        {(assignedTo || routedFrom) && (
                          <div className="pt-1.5 border-t border-gray-100 space-y-1">
                            {assignedTo && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-400">👤</span>
                                <span>Assigned to: <span className="font-medium text-gray-700">{assignedTo.name || assignedTo.email}</span></span>
                              </div>
                            )}
                            {routedFrom && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-400">↪️</span>
                                <span>Routed from: <span className="font-medium text-gray-700">{routedFrom.name || routedFrom.email}</span></span>
                                {routedShare?.routedAt && (
                                  <span className="text-gray-400">
                                    ({new Date(routedShare.routedAt).toLocaleDateString()})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Section - Interactive Buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => onFileSelect(file.id, checkId)}
                        disabled={!checkId}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm transition-all"
                      >
                        {currentStep ? "Continue" : "Select"}
                      </button>
                      {file.accessLevel === 'owner' && (
                        <button
                          onClick={(e) => handleDeleteClick(file.id, e)}
                          disabled={deletingFileId === file.id}
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                        >
                          {deletingFileId === file.id ? "Deleting..." : "Delete"}
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

      {/* Delete Confirmation Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirm Delete
            </h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this file and all associated reports? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(confirmDeleteId)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [currentFileId, setCurrentFileId] = useState<string | null>(fileId)
  const [currentCheckId, setCurrentCheckId] = useState<string | null>(checkId)

  // Load fileId if not provided
  useEffect(() => {
    const loadFileId = async () => {
      if (currentFileId) return
      
      try {
        const fileRes = await fetch(`/api/citation-checker/files`)
        if (fileRes.ok) {
          const files = await fileRes.json()
          if (files.length > 0) {
            const latestFile = files[0]
            setCurrentFileId(latestFile.id)
            if (latestFile.citationChecks && latestFile.citationChecks.length > 0) {
              const checkWithJson = latestFile.citationChecks.find((check: any) => check.jsonData)
              const targetCheckId = checkWithJson?.id || latestFile.citationChecks[0].id
              setCurrentCheckId(targetCheckId)
              if (onCheckIdUpdate) {
                onCheckIdUpdate(targetCheckId)
              }
            }
          }
        }
      } catch (error) {
        console.error("[GenerateJsonStep] Error loading fileId:", error)
      }
    }
    
    loadFileId()
  }, [currentFileId, onCheckIdUpdate])

  // Update local state when props change
  useEffect(() => {
    if (fileId && fileId !== currentFileId) {
      setCurrentFileId(fileId)
    }
    if (checkId && checkId !== currentCheckId) {
      setCurrentCheckId(checkId)
    }
  }, [fileId, checkId, currentFileId, currentCheckId])

  const loadCheckData = useCallback(async () => {
    setLoading(true)
    try {
      const targetFileId = currentFileId || fileId
      const targetCheckId = currentCheckId || checkId
      
      // First try to load from checkId if provided
      if (targetCheckId) {
        console.log('[GenerateJsonStep] Loading check data for checkId:', targetCheckId)
        const res = await fetch(`/api/citation-checker/checks/${targetCheckId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.jsonData) {
            console.log('[GenerateJsonStep] Found JSON in check:', targetCheckId)
            setJsonData(JSON.stringify(data.jsonData, null, 2))
            setLoading(false)
            return
          }
        }
      }
      
      // If no checkId or checkId doesn't have JSON, check the file's latest check
      if (targetFileId) {
        console.log('[GenerateJsonStep] Checking file for existing JSON:', targetFileId)
        const fileRes = await fetch(`/api/citation-checker/files`)
        if (fileRes.ok) {
          const files = await fileRes.json()
          const file = files.find((f: any) => f.id === targetFileId)
          if (file && file.citationChecks && file.citationChecks.length > 0) {
            // Find the latest check with JSON
            const checkWithJson = file.citationChecks.find((check: any) => check.jsonData)
            if (checkWithJson) {
              console.log('[GenerateJsonStep] Found JSON in file check:', checkWithJson.id)
              setJsonData(JSON.stringify(checkWithJson.jsonData, null, 2))
              // Update checkId to the one with JSON
              setCurrentCheckId(checkWithJson.id)
              if (onCheckIdUpdate && checkWithJson.id !== targetCheckId) {
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
  }, [currentCheckId, currentFileId, checkId, fileId, onCheckIdUpdate])

  useEffect(() => {
    loadCheckData()
  }, [loadCheckData])

  const handleGenerate = async (forceRegenerate = false) => {
    const targetFileId = currentFileId || fileId
    if (!targetFileId) {
      alert("No file selected. Please upload a file first.")
      return
    }

    setGenerating(true)
    try {
      const url = forceRegenerate 
        ? `/api/citation-checker/files/${targetFileId}/generate-json?force=true`
        : `/api/citation-checker/files/${targetFileId}/generate-json`
      
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
        if (data.id) {
          setCurrentCheckId(data.id)
          if (data.id !== currentCheckId && data.id !== checkId && onCheckIdUpdate) {
            onCheckIdUpdate(data.id)
          }
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
              disabled={generating || !currentFileId}
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
            disabled={generating || !currentFileId}
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
      
      <ContextPanel 
        fileId={currentFileId || fileId}
        checkId={currentCheckId || checkId}
        showJson={true}
      />
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
  const router = useRouter()
  const [identifying, setIdentifying] = useState(false)
  const [identifyingEyecite, setIdentifyingEyecite] = useState(false)
  const [citations, setCitations] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [currentCheckId, setCurrentCheckId] = useState<string | null>(checkId)
  const [identificationMethod, setIdentificationMethod] = useState<string | null>(null)
  const [loadingCheckId, setLoadingCheckId] = useState(false)

  // Load checkId from file if not provided
  useEffect(() => {
    const loadCheckId = async () => {
      // If we already have a checkId from props, use it
      if (checkId) {
        setCurrentCheckId(checkId)
        return
      }
      
      if (currentCheckId || !fileId) return
      
      setLoadingCheckId(true)
      try {
        const fileRes = await fetch(`/api/citation-checker/files`)
        if (fileRes.ok) {
          const files = await fileRes.json()
          const file = files.find((f: any) => f.id === fileId)
          if (file && file.citationChecks && file.citationChecks.length > 0) {
            // Find the latest check with JSON that is NOT from heavy analysis or test runs
            // This is the normal workflow check we want to use
            let targetCheck = null
            
            for (const check of file.citationChecks) {
              if (!check.jsonData) continue
              
              // Use workflowType field if available, fallback to checking jsonData
              const workflowType = check.workflowType
              const isNormalWorkflow = !workflowType || workflowType === "standard"
              
              // Fallback: check jsonData for non-migrated records
              if (!isNormalWorkflow) {
                const metadata = check.jsonData?.document?.metadata
                const hasHeavyAnalysisRun = metadata?.heavyAnalysisRunId
                const hasTestRun = metadata?.testRunId
                
                // Skip if it's from heavy analysis or test runs
                if (hasHeavyAnalysisRun || hasTestRun) {
                  continue
                }
              } else if (workflowType && workflowType !== "standard") {
                // Skip if workflowType indicates it's not standard
                continue
              }
              
              // This is a normal workflow check with JSON
              targetCheck = check
              break
            }
            
            // If no normal workflow check found, use the latest check with JSON anyway
            if (!targetCheck) {
              targetCheck = file.citationChecks.find((check: any) => check.jsonData) || file.citationChecks[0]
            }
            
            if (targetCheck) {
              console.log('[IdentifyCitationsStep] Found check:', targetCheck.id)
              setCurrentCheckId(targetCheck.id)
              if (onCheckIdUpdate) {
                onCheckIdUpdate(targetCheck.id)
              }
            }
          }
        }
      } catch (error) {
        console.error("[IdentifyCitationsStep] Error loading checkId:", error)
      } finally {
        setLoadingCheckId(false)
      }
    }
    
    loadCheckId()
  }, [fileId, checkId, currentCheckId, onCheckIdUpdate])

  // Update currentCheckId when checkId prop changes
  useEffect(() => {
    if (checkId && checkId !== currentCheckId) {
      setCurrentCheckId(checkId)
    }
  }, [checkId, currentCheckId])

  const handleIdentify = async (useEyecite: boolean = false) => {
    const targetCheckId = currentCheckId || checkId
    if (!targetCheckId) {
      setError("No citation check selected. Please ensure JSON has been generated first.")
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
        ? `/api/citation-checker/checks/${targetCheckId}/identify-citations-eyecite`
        : `/api/citation-checker/checks/${targetCheckId}/identify-citations`
      
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
          const citations = data.jsonData.document.citations
          setCitations(citations)
        }
        
        // Track which method was used
        setIdentificationMethod(useEyecite ? 'eyecite' : 'custom')
        
        onComplete()
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.details || errorData.error || `Failed to identify citations${useEyecite ? ' with Eyecite' : ''}`
        console.error('[IdentifyCitationsStep] API Error:', errorData)
        setError(errorMessage)
        
        // Log detailed error if available
        if (errorData.stack) {
          console.error('[IdentifyCitationsStep] Error stack:', errorData.stack)
        }
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
      {/* Navigation Button at Top */}
      {fileId && (
        <div className="pb-4 border-b border-gray-200">
          <button
            onClick={() => router.push(`/citation-checker/create-document?fileId=${fileId}`)}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 whitespace-nowrap"
          >
            ← Back to Editor
          </button>
        </div>
      )}
      {loadingCheckId && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-blue-800 text-sm">Loading citation check data...</p>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Citation Identification Method</h3>
          <div className="flex gap-4">
            <button
              onClick={() => handleIdentify(false)}
              disabled={identifying || identifyingEyecite || !currentCheckId || loadingCheckId}
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {identifying ? "Identifying..." : "Identify Citations (Custom)"}
            </button>
            <button
              onClick={() => handleIdentify(true)}
              disabled={identifying || identifyingEyecite || !currentCheckId || loadingCheckId}
              className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {identifyingEyecite ? "Identifying..." : "Identify Citations (Eyecite)"}
            </button>
          </div>
          {!currentCheckId && !loadingCheckId && (
            <p className="text-sm text-red-600 mt-2">
              No citation check found. Please ensure JSON has been generated in the previous step.
            </p>
          )}
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
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Found {citations.length} {citations.length === 1 ? 'Citation' : 'Citations'}
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {citations.map((citation: any, index: number) => {
              const type = (citation.citationType || 'unknown') as 'case' | 'statute' | 'regulation' | 'rule' | 'unknown'
              const text = citation.citationText || ''
              const typeColor = {
                case: 'bg-blue-100 text-blue-800',
                statute: 'bg-green-100 text-green-800',
                regulation: 'bg-purple-100 text-purple-800',
                rule: 'bg-orange-100 text-orange-800',
                unknown: 'bg-gray-100 text-gray-800'
              }[type] || 'bg-gray-100 text-gray-800'
              
              return (
                <div 
                  key={citation.id || index} 
                  className="flex items-start gap-2 p-2 bg-white rounded border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${typeColor} flex-shrink-0`}>
                    {type.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-700 flex-1 break-words">
                    {text.length > 100 ? `${text.substring(0, 100)}...` : text}
                  </span>
                </div>
              )
            })}
          </div>
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
  const [results, setResults] = useState<{ valid: number; invalid: number; uncertain?: number; total?: number } | null>(null)
  const [citations, setCitations] = useState<any[]>([])
  
  // Load citations from check data
  useEffect(() => {
    if (!checkId) return
    
    const loadCitations = async () => {
      try {
        const res = await fetch(`/api/citation-checker/checks/${checkId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.jsonData?.document?.citations) {
            setCitations(data.jsonData.document.citations)
          }
        }
      } catch (err) {
        console.error('Failed to load citations:', err)
      }
    }
    
    loadCitations()
  }, [checkId])

  const handleValidate = async () => {
    setValidating(true)
    // TODO: Implement citation validation API
    setTimeout(() => {
      setResults({ valid: 1, invalid: 1, uncertain: 0, total: 2 })
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
        <div className="mt-4">
          <ValidationSummary
            statistics={{
              lowRisk: results.valid,
              moderateRisk: results.uncertain || 0,
              needsReview: results.invalid,
              total: results.total || (results.valid + results.invalid + (results.uncertain || 0))
            }}
            showTotal={false}
            variant="compact"
          />
        </div>
      )}
      
      {citations.length > 0 && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Citations ({citations.length})
          </h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {citations.slice(0, 10).map((citation: any, index: number) => {
              const type = (citation.citationType || 'unknown') as 'case' | 'statute' | 'regulation' | 'rule' | 'unknown'
              const text = citation.citationText || ''
              const typeColor = {
                case: 'bg-blue-100 text-blue-800',
                statute: 'bg-green-100 text-green-800',
                regulation: 'bg-purple-100 text-purple-800',
                rule: 'bg-orange-100 text-orange-800',
                unknown: 'bg-gray-100 text-gray-800'
              }[type] || 'bg-gray-100 text-gray-800'
              
              return (
                <div 
                  key={citation.id || index} 
                  className="flex items-center gap-2 p-1.5 bg-white rounded text-xs"
                >
                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${typeColor} flex-shrink-0`}>
                    {type.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-600 flex-1 truncate">
                    {text.length > 60 ? `${text.substring(0, 60)}...` : text}
                  </span>
                </div>
              )
            })}
            {citations.length > 10 && (
              <div className="text-xs text-gray-500 text-center pt-1">
                ...and {citations.length - 10} more
              </div>
            )}
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

