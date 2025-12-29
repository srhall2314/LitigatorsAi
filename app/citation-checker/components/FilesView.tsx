"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FileUpload, Case } from "../types"
import { AccessIndicator } from "./AccessIndicator"
import { DocumentSharePanel } from "./DocumentSharePanel"
import { DocumentRouter } from "./DocumentRouter"
import { FileUploadSection } from "./FileUploadSection"
import { FileCaseAssignmentModal } from "./FileCaseAssignmentModal"

export function FilesView() {
  const router = useRouter()
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [files, setFiles] = useState<FileUpload[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [loadingCases, setLoadingCases] = useState(false)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "my-files" | "shared" | "routed">("all")
  const [caseFilter, setCaseFilter] = useState<string>("")
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [showRouter, setShowRouter] = useState(false)
  const [showCaseAssignment, setShowCaseAssignment] = useState(false)
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null)
  const [editingFileName, setEditingFileName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null)

  useEffect(() => {
    loadFiles()
    loadCases()
  }, [])

  useEffect(() => {
    loadFiles()
  }, [filter, caseFilter])

  const loadFiles = async () => {
    try {
      setLoadingFiles(true)
      let url = "/api/citation-checker/files"
      if (filter === "shared") {
        url = "/api/citation-checker/files/shared-with-me"
      } else if (filter === "routed") {
        url = "/api/citation-checker/files/routed-to-me"
      }
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        console.log("[FilesView] Loaded files:", data.length, "files")
        
        // Filter by case if caseFilter is set
        let filteredData = data
        if (caseFilter) {
          if (caseFilter === "unassigned") {
            filteredData = data.filter((f: FileUpload) => !f.caseId)
          } else {
            filteredData = data.filter((f: FileUpload) => f.caseId === caseFilter)
          }
        }
        
        setFiles(filteredData)
      } else {
        const errorText = await res.text().catch(() => `Status: ${res.status}`)
        console.error("[FilesView] Failed to load files:", res.status, errorText)
      }
    } catch (error) {
      console.error("Error loading files:", error)
    } finally {
      setLoadingFiles(false)
    }
  }

  const loadCases = async () => {
    try {
      setLoadingCases(true)
      const res = await fetch("/api/citation-checker/cases")
      if (res.ok) {
        const data = await res.json()
        setCases(data)
      }
    } catch (error) {
      console.error("Error loading cases:", error)
    } finally {
      setLoadingCases(false)
    }
  }

  const handleUploadComplete = (fileId: string) => {
    setShowUploadModal(false)
    router.push(`/citation-checker/${fileId}/run-citation-checker`)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB"
    return (bytes / (1024 * 1024)).toFixed(2) + " MB"
  }

  const handleFileClick = (fileId: string) => {
    setSelectedFileId(fileId)
    const file = files.find(f => f.id === fileId)
    if (!file) return

    // Determine where to navigate based on file status
    const latestCheck = file.citationChecks && file.citationChecks.length > 0 
      ? file.citationChecks[0] 
      : null
    const normalWorkflowCheck = (file as any).standardWorkflowCheck || null
    const check = normalWorkflowCheck || latestCheck
    const status = check?.status
    const checkId = check?.id || latestCheck?.id || ""

    // Map legacy statuses to current workflow steps
    if (status === "discrepancies_reviewed") {
      // Legacy status - map to document-review
      router.push(`/citation-checker/${fileId}/document-review${checkId ? `?checkId=${checkId}` : ''}`)
    } else if (status === "finalized" || status === "report_generated") {
      // Document is finalized - go to report
      router.push(`/citation-checker/${fileId}/report${checkId ? `?checkId=${checkId}` : ''}`)
    } else if (status === "citations_validated" && normalWorkflowCheck) {
      router.push(`/citation-checker/${fileId}/document-review${checkId ? `?checkId=${checkId}` : ''}`)
    } else {
      router.push(`/citation-checker/${fileId}/run-citation-checker${checkId ? `?checkId=${checkId}` : ''}`)
    }
  }

  const handleDeleteClick = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenActionMenuId(null)
    setConfirmDeleteId(fileId)
  }

  const handleDeleteConfirm = async (fileId: string) => {
    setDeletingFileId(fileId)
    try {
      const res = await fetch(`/api/citation-checker/files/${fileId}`, {
        method: "DELETE",
      })

      if (res.ok) {
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
    setOpenActionMenuId(null)
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

  const handleShareClick = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenActionMenuId(null)
    setSelectedFileId(fileId)
    setShowSharePanel(true)
    setShowRouter(false)
  }

  const handleRouteClick = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenActionMenuId(null)
    setSelectedFileId(fileId)
    setShowRouter(true)
    setShowSharePanel(false)
  }

  const handleAssignCaseClick = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenActionMenuId(null)
    setSelectedFileId(fileId)
    setShowCaseAssignment(true)
  }

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return null
    
    const statusConfig: Record<string, { label: string; color: string }> = {
      uploaded: { label: "Uploaded", color: "bg-gray-100 text-gray-800 border border-gray-200" },
      json_generated: { label: "JSON Generated", color: "bg-blue-100 text-blue-800 border border-blue-200" },
      citations_identified: { label: "Citations Identified", color: "bg-purple-100 text-purple-800 border border-purple-200" },
      citations_validated: { label: "Citations Validated", color: "bg-green-100 text-green-800 border border-green-200" },
      discrepancies_reviewed: { label: "Discrepancies Reviewed", color: "bg-yellow-100 text-yellow-800 border border-yellow-200" },
      finalized: { label: "Finalized", color: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
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

  // Close action menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenActionMenuId(null)
    }
    if (openActionMenuId) {
      document.addEventListener("click", handleClickOutside)
      return () => document.removeEventListener("click", handleClickOutside)
    }
  }, [openActionMenuId])

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-black">Files</h2>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/citation-checker/create-document')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-sm font-medium"
          >
            New File
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-sm font-medium"
          >
            Upload
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
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
        
        <select
          value={caseFilter}
          onChange={(e) => setCaseFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loadingCases}
        >
          <option value="">All Cases</option>
          <option value="unassigned">Unassigned</option>
          {cases.map((case_) => (
            <option key={case_.id} value={case_.id}>
              {case_.name}
            </option>
          ))}
        </select>
      </div>

      {/* File Listing */}
      {loadingFiles ? (
        <p className="text-gray-500">Loading files...</p>
      ) : files.length === 0 ? (
        <p className="text-gray-500">No files found.</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            // Ensure citationChecks is always an array
            if (!file.citationChecks) {
              file.citationChecks = []
            }
            const latestCheck = file.citationChecks && file.citationChecks.length > 0 
              ? file.citationChecks[0] 
              : null
            
            const normalWorkflowCheck = (file as any).standardWorkflowCheck || null
            const check = normalWorkflowCheck || latestCheck
            const status = check?.status
            const currentStep = check?.currentStep
            const citationCount = check?.citationCount
            
            const assignedTo = latestCheck?.assignedTo
            const routedShare = file.shares?.find(share => share.routedFromId)
            const routedFrom = routedShare?.routedFrom
            
            const checkId = check?.id || latestCheck?.id || ""
            
            const isDraft = status === "uploaded" && 
                           !check?.jsonData && 
                           file.mimeType === "text/plain"
            
            const isSelected = selectedFileId === file.id
            const isActionMenuOpen = openActionMenuId === file.id
            
            return (
              <div
                key={file.id}
                onClick={() => handleFileClick(file.id)}
                className={`p-4 border rounded-md transition-all cursor-pointer ${
                  isSelected 
                    ? "border-indigo-500 bg-indigo-50 shadow-md" 
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* File Name Row */}
                    <div className="flex items-center gap-3 mb-2">
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
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            disabled={renaming}
                            className="flex-1 border border-indigo-300 rounded-md px-2 py-1 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRenameSave(file.id)
                            }}
                            disabled={renaming}
                            className="px-2 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-xs font-medium disabled:opacity-50"
                          >
                            {renaming ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRenameCancel()
                            }}
                            disabled={renaming}
                            className="px-2 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-xs font-medium disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div 
                            className="font-medium text-black truncate flex-1 min-w-0 cursor-pointer hover:text-indigo-600 hover:underline"
                            title={file.originalName}
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/citation-checker/${file.id}/detail`)
                            }}
                          >
                            {file.originalName}
                          </div>
                          {file.case && (
                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-md border border-blue-200">
                              {file.case.name}
                            </span>
                          )}
                          {file.legalDocumentType && (
                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-md">
                              {file.legalDocumentType}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    
                    {/* Status and Metadata Row */}
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      {getStatusBadge(status)}
                      {file.accessLevel && (
                        <AccessIndicator accessLevel={file.accessLevel} />
                      )}
                      <span className="text-xs text-gray-500">
                        {formatFileSize(file.fileSize)} • {new Date(file.createdAt).toLocaleDateString()}
                      </span>
                      {file.user && (
                        <span className="text-xs text-gray-500">
                          by {file.user.name || file.user.email}
                        </span>
                      )}
                    </div>
                    
                    {/* Workflow Info */}
                    {(currentStep || citationCount !== null) && (
                      <div className="text-xs text-gray-600">
                        {currentStep && (
                          <span>Current: <span className="font-medium">{getCurrentStepLabel(currentStep)}</span></span>
                        )}
                        {currentStep && citationCount !== null && <span className="mx-2">•</span>}
                        {citationCount !== null && citationCount !== undefined && (
                          <span>Citations: <span className="font-medium">{citationCount}</span></span>
                        )}
                      </div>
                    )}
                    
                    {/* Routing Info */}
                    {(assignedTo || routedFrom) && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                        {assignedTo && (
                          <div>Assigned to: {assignedTo.name || assignedTo.email}</div>
                        )}
                        {routedFrom && (
                          <div>Routed from: {routedFrom.name || routedFrom.email}</div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Action Menu */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenActionMenuId(isActionMenuOpen ? null : file.id)
                      }}
                      className={`p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                        isActionMenuOpen
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800 border border-gray-200"
                      }`}
                      title="Actions"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    
                    {isActionMenuOpen && (
                      <div 
                        className="absolute right-0 mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="py-1">
                          {isDraft && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenActionMenuId(null)
                                router.push(`/citation-checker/create-document?fileId=${file.id}`)
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Edit Document
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              // Map legacy statuses to current workflow steps
                              if (status === "discrepancies_reviewed") {
                                router.push(`/citation-checker/${file.id}/document-review${checkId ? `?checkId=${checkId}` : ''}`)
                              } else if (status === "finalized" || status === "report_generated") {
                                router.push(`/citation-checker/${file.id}/report${checkId ? `?checkId=${checkId}` : ''}`)
                              } else if (status === "citations_validated" && normalWorkflowCheck) {
                                router.push(`/citation-checker/${file.id}/document-review${checkId ? `?checkId=${checkId}` : ''}`)
                              } else {
                                router.push(`/citation-checker/${file.id}/run-citation-checker${checkId ? `?checkId=${checkId}` : ''}`)
                              }
                              setOpenActionMenuId(null)
                            }}
                            disabled={!checkId}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {status === "discrepancies_reviewed" || status === "citations_validated" ? "Review Citations" : status === "finalized" || status === "report_generated" ? "View Report" : currentStep ? "Continue Workflow" : "Validate Citations"}
                          </button>
                          
                          {(file.accessLevel === "owner" || file.accessLevel === "route") && (
                            <>
                              <div className="border-t border-gray-100 my-1"></div>
                              <button
                                onClick={(e) => handleShareClick(file.id, e)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                Share
                              </button>
                              <button
                                onClick={(e) => handleRouteClick(file.id, e)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                Route
                              </button>
                            </>
                          )}
                          
                          {file.accessLevel === "owner" && (
                            <>
                              <div className="border-t border-gray-100 my-1"></div>
                              <button
                                onClick={(e) => handleRenameStart(file.id, file.originalName)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                Rename
                              </button>
                              <button
                                onClick={(e) => handleAssignCaseClick(file.id, e)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                {file.caseId ? "Change Case" : "Assign to Case"}
                              </button>
                              <div className="border-t border-gray-100 my-1"></div>
                              <button
                                onClick={(e) => handleDeleteClick(file.id, e)}
                                disabled={deletingFileId === file.id}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                {deletingFileId === file.id ? "Deleting..." : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Upload File</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <FileUploadSection 
              onUploadComplete={handleUploadComplete}
              onCancel={() => setShowUploadModal(false)}
            />
          </div>
        </div>
      )}

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

      {/* Case Assignment Modal */}
      {showCaseAssignment && selectedFileId && (
        <FileCaseAssignmentModal
          fileId={selectedFileId}
          currentCaseId={files.find(f => f.id === selectedFileId)?.caseId || null}
          onAssign={async () => {
            await loadFiles()
            setShowCaseAssignment(false)
            setSelectedFileId(null)
          }}
          onCancel={() => {
            setShowCaseAssignment(false)
            setSelectedFileId(null)
          }}
        />
      )}

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
