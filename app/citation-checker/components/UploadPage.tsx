"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FileUpload } from "../types"
import { AccessIndicator } from "./AccessIndicator"
import { DocumentSharePanel } from "./DocumentSharePanel"
import { DocumentRouter } from "./DocumentRouter"

export function UploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState<FileUpload[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [fileChecksMap, setFileChecksMap] = useState<Record<string, any[]>>({})
  const [loadingChecks, setLoadingChecks] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<"all" | "my-files" | "shared" | "routed">("all")
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [showRouter, setShowRouter] = useState(false)
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null)
  const [editingFileName, setEditingFileName] = useState("")
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [])

  // No longer need to auto-load checks - we have all workflow info in the files list
  // Individual checks are only loaded when user explicitly needs them (e.g., viewing a report)

  const loadFiles = async () => {
    try {
      let url = "/api/citation-checker/files"
      if (filter === "shared") {
        url = "/api/citation-checker/files/shared-with-me"
      } else if (filter === "routed") {
        url = "/api/citation-checker/files/routed-to-me"
      }
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        console.log("[UploadPage] Loaded files:", data.length, "files")
        setFiles(data)
      } else {
        console.error("[UploadPage] Failed to load files:", res.status, res.statusText)
      }
    } catch (error) {
      console.error("Error loading files:", error)
    } finally {
      setLoadingFiles(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [filter])

  // Load all checks for a specific file (lazy loading)
  const loadFileChecks = async (fileId: string) => {
    if (fileChecksMap[fileId] || loadingChecks[fileId]) {
      return // Already loaded or loading
    }

    setLoadingChecks(prev => ({ ...prev, [fileId]: true }))
    try {
      // First get validation runs to get check IDs
      const runsRes = await fetch(`/api/citation-checker/files/${fileId}/validation-runs`)
      const checkIds = new Set<string>()
      
      if (runsRes.ok) {
        const runsData = await runsRes.json()
        // Extract all check IDs from validation runs
        for (const run of runsData.runs || []) {
          if (run.id) {
            checkIds.add(run.id)
          }
        }
      }
      
      // Also get the latest check from files API
      const file = files.find(f => f.id === fileId)
      if (file?.citationChecks?.[0]) {
        checkIds.add(file.citationChecks[0].id)
      }
      
      // Fetch all checks in parallel
      const checkPromises = Array.from(checkIds).map(async (checkId) => {
        try {
          const checkRes = await fetch(`/api/citation-checker/checks/${checkId}`)
          if (checkRes.ok) {
            return await checkRes.json()
          }
        } catch (err) {
          console.error(`Error fetching check ${checkId}:`, err)
        }
        return null
      })
      
      const allChecks = (await Promise.all(checkPromises)).filter((c): c is any => c !== null)
      
      setFileChecksMap(prev => ({ ...prev, [fileId]: allChecks }))
    } catch (err) {
      console.error(`Error loading checks for file ${fileId}:`, err)
    } finally {
      setLoadingChecks(prev => ({ ...prev, [fileId]: false }))
    }
  }

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
        router.push(`/citation-checker/${data.fileUpload.id}/run-citation-checker`)
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

  const handleFileSelect = (fileId: string, checkId: string) => {
    router.push(`/citation-checker/${fileId}/generate-json`)
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
        // Remove file from local state
        setFiles(files.filter(f => f.id !== fileId))
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

  const handleRenameStart = (fileId: string, currentName: string) => {
    setEditingFileNameId(fileId)
    setEditingFileName(currentName)
  }

  const handleRenameCancel = () => {
    setEditingFileNameId(null)
    setEditingFileName("")
  }

  const handleRenameSave = async (fileId: string) => {
    if (!editingFileName.trim()) {
      alert("Document name cannot be empty")
      return
    }

    setRenaming(true)
    try {
      const res = await fetch(`/api/citation-checker/files/${fileId}/rename`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editingFileName.trim(),
        }),
      })

      if (res.ok) {
        // Reload files to get updated name
        await loadFiles()
        setEditingFileNameId(null)
        setEditingFileName("")
      } else {
        const errorData = await res.json()
        alert(`Failed to rename document: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Rename error:", error)
      alert("Failed to rename document. Please try again.")
    } finally {
      setRenaming(false)
    }
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-black">Uploaded Files</h3>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Files</option>
            <option value="my-files">My Files</option>
            <option value="shared">Shared With Me</option>
            <option value="routed">Routed To Me</option>
          </select>
        </div>
        {loadingFiles ? (
          <p className="text-gray-500">Loading files...</p>
        ) : files.length === 0 ? (
          <p className="text-gray-500">No files found.</p>
        ) : (
          <div className="space-y-3">
            {files.map((file) => {
              // Ensure citationChecks is always an array
              if (!file.citationChecks) {
                file.citationChecks = []
              }
              // Safely get latest check - citationChecks might be empty array
              const latestCheck = file.citationChecks && file.citationChecks.length > 0 
                ? file.citationChecks[0] 
                : null
              
              // Use the standardWorkflowCheck field from API (already filtered and validated)
              // This ensures we find standard workflow checks even if latest check is a test run
              const normalWorkflowCheck = (file as any).standardWorkflowCheck || null
              
              // Use standardWorkflowCheck if available, otherwise use latest check
              const check = normalWorkflowCheck || latestCheck
              const status = check?.status
              const currentStep = check?.currentStep
              const citationCount = check?.citationCount
              
              // Get routing information
              const assignedTo = latestCheck?.assignedTo
              const routedShare = file.shares?.find(share => share.routedFromId)
              const routedFrom = routedShare?.routedFrom
              
              // Determine which check ID to use
              const checkId = check?.id || latestCheck?.id || ""
              
              // Check if document is a draft (can be edited)
              // Draft = status "uploaded", no jsonData, and is text/plain (AI-generated)
              const isDraft = status === "uploaded" && 
                             !check?.jsonData && 
                             file.mimeType === "text/plain"
              
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
              
              return (
                <div
                  key={file.id}
                  className="p-4 border border-gray-200 rounded-md hover:border-gray-300 transition-colors bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* File Name with Share/Route buttons */}
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        {editingFileNameId === file.id ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              type="text"
                              value={editingFileName}
                              onChange={(e) => setEditingFileName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRenameSave(file.id)
                                } else if (e.key === "Escape") {
                                  handleRenameCancel()
                                }
                              }}
                              autoFocus
                              disabled={renaming}
                              className="flex-1 border border-indigo-300 rounded-md px-2 py-1 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              onClick={() => handleRenameSave(file.id)}
                              disabled={renaming}
                              className="px-2 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium disabled:opacity-50"
                            >
                              {renaming ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={handleRenameCancel}
                              disabled={renaming}
                              className="px-2 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 text-xs font-medium disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div 
                              className="font-medium text-black truncate flex-1 min-w-0"
                              title={file.originalName}
                            >
                              {file.originalName}
                            </div>
                            {file.accessLevel === "owner" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRenameStart(file.id, file.originalName)
                                }}
                                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                                title="Rename document"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            {(file.accessLevel === "owner" || file.accessLevel === "route") && (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedFileId(file.id)
                                    setShowSharePanel(true)
                                    setShowRouter(false)
                                  }}
                                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 text-xs font-medium transition-all"
                                >
                                  Share
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedFileId(file.id)
                                    setShowRouter(true)
                                    setShowSharePanel(false)
                                  }}
                                  className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 text-xs font-medium transition-all"
                                >
                                  Route
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      
                      {/* Status Section - Current State Indicators */}
                      <div className="mb-3 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status:</span>
                          {getStatusBadge(status)}
                          {file.accessLevel && (
                            <AccessIndicator accessLevel={file.accessLevel} />
                          )}
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
                      {isDraft && (
                        <button
                          onClick={() => {
                            router.push(`/citation-checker/create-document?fileId=${file.id}`)
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 text-sm font-medium shadow-sm transition-all whitespace-nowrap"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => {
                          // If citations are validated, go to document review (Stage 8)
                          if (status === "citations_validated" && normalWorkflowCheck) {
                            router.push(`/citation-checker/${file.id}/document-review${checkId ? `?checkId=${checkId}` : ''}`)
                            return
                          }
                          
                          // If report is available, go directly to report
                          if (normalWorkflowCheck && status === "report_generated") {
                            router.push(`/citation-checker/${file.id}/report?checkId=${normalWorkflowCheck.id}`)
                            return
                          }
                          
                          // Otherwise, go to validate citations (unified pipeline)
                          router.push(`/citation-checker/${file.id}/run-citation-checker${checkId ? `?checkId=${checkId}` : ''}`)
                        }}
                        disabled={!checkId}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all whitespace-nowrap"
                      >
                        {status === "citations_validated" ? "Review Citations" : normalWorkflowCheck ? "View Report" : currentStep ? "Continue" : "Validate Citations"}
                      </button>
                    </div>
                  </div>
                  
                  {/* Delete button in bottom right */}
                  {file.accessLevel === "owner" && (
                    <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={(e) => handleDeleteClick(file.id, e)}
                        disabled={deletingFileId === file.id}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                      >
                        {deletingFileId === file.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Share Panel Modal */}
      {showSharePanel && selectedFileId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Share Document</h3>
              <button
                onClick={() => {
                  setShowSharePanel(false)
                  setSelectedFileId(null)
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <DocumentSharePanel
              fileId={selectedFileId}
              accessLevel={files.find(f => f.id === selectedFileId)?.accessLevel || null}
              onShareChange={() => {
                loadFiles()
                setShowSharePanel(false)
                setSelectedFileId(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Router Modal */}
      {showRouter && selectedFileId && (() => {
        const file = files.find(f => f.id === selectedFileId)
        if (!file) return null
        const latestCheck = file.citationChecks && file.citationChecks.length > 0 
          ? file.citationChecks[0] 
          : null
        if (!latestCheck) return null
        
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Route Document</h3>
                <button
                  onClick={() => {
                    setShowRouter(false)
                    setSelectedFileId(null)
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              <DocumentRouter
                fileId={selectedFileId}
                checkId={latestCheck.id}
                accessLevel={file.accessLevel || null}
                onRoute={() => {
                  loadFiles()
                  setShowRouter(false)
                  setSelectedFileId(null)
                }}
              />
            </div>
          </div>
        )
      })()}

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

