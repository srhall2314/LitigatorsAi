"use client"

import { useState, useEffect } from "react"

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
            if (file && file.citationChecks[0]?.jsonData) {
              // JSON already exists, jump to generate-json step
              setCurrentStep("generate-json")
              setCompletedSteps(new Set(["upload"]))
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
          checkId={selectedCheckId}
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
          checkId={selectedCheckId}
        />
      ),
    },
    {
      id: "citations-report",
      title: "Citations Report",
      description: "View the final citation validation report",
      component: <CitationsReportStep checkId={selectedCheckId} />,
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
                          onClick={() => onFileSelect(file.id, latestCheck?.id || "")}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
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
  checkId 
}: { 
  onComplete: () => void
  fileId: string | null
  checkId: string | null
}) {
  const [generating, setGenerating] = useState(false)
  const [jsonData, setJsonData] = useState<string | null>(null)

  useEffect(() => {
    if (checkId) {
      loadCheckData()
    }
  }, [checkId])

  const loadCheckData = async () => {
    if (!checkId) return
    try {
      const res = await fetch(`/api/citation-checker/checks/${checkId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.jsonData) {
          // jsonData is already a JSON object (JsonB from database)
          setJsonData(JSON.stringify(data.jsonData, null, 2))
        }
      }
    } catch (error) {
      console.error("Error loading check:", error)
    }
  }

  const handleGenerate = async () => {
    if (!fileId) return

    setGenerating(true)
    try {
      const res = await fetch(`/api/citation-checker/files/${fileId}/generate-json`, {
        method: "POST",
      })

      if (res.ok) {
        const data = await res.json()
        // jsonData is a JSON object (JsonB), stringify for display
        if (data.jsonData) {
          setJsonData(JSON.stringify(data.jsonData, null, 2))
        }
        onComplete()
      } else {
        alert("Failed to generate JSON")
      }
    } catch (error) {
      console.error("Generate error:", error)
      alert("Failed to generate JSON")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {jsonData ? (
        <div>
          <p className="text-green-600 mb-4">✓ JSON already generated</p>
          <div className="mt-4 p-4 bg-gray-50 rounded-md">
            <pre className="text-sm text-black overflow-auto max-h-96">{jsonData}</pre>
          </div>
          <button
            onClick={onComplete}
            className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Continue to Next Step
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={handleGenerate}
            disabled={generating || !fileId}
            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {generating ? "Generating JSON..." : "Generate JSON"}
          </button>

          {jsonData && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md">
              <pre className="text-sm text-black overflow-auto max-h-96">{jsonData}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function IdentifyCitationsStep({ 
  onComplete, 
  checkId 
}: { 
  onComplete: () => void
  checkId: string | null
}) {
  const [identifying, setIdentifying] = useState(false)
  const [citations, setCitations] = useState<string[]>([])

  const handleIdentify = async () => {
    setIdentifying(true)
    // TODO: Implement citation identification API
    setTimeout(() => {
      setCitations([
        "Smith v. Jones, 123 F.3d 456 (2020)",
        "Doe v. Roe, 456 U.S. 789 (2019)",
      ])
      setIdentifying(false)
      onComplete()
    }, 2000)
  }

  return (
    <div className="space-y-6">
      <button
        onClick={handleIdentify}
        disabled={identifying}
        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {identifying ? "Identifying Citations..." : "Identify Citations"}
      </button>

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
    </div>
  )
}

function ValidateCitationsStep({ 
  onComplete, 
  checkId 
}: { 
  onComplete: () => void
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
    </div>
  )
}

function ReviewDiscrepanciesStep({ 
  onComplete, 
  checkId 
}: { 
  onComplete: () => void
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
    </div>
  )
}

function CitationsReportStep({ checkId }: { checkId: string | null }) {
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
    </div>
  )
}
