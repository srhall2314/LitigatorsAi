"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FileUpload } from "../types"

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

  useEffect(() => {
    loadFiles()
  }, [])

  // No longer need to auto-load checks - we have all workflow info in the files list
  // Individual checks are only loaded when user explicitly needs them (e.g., viewing a report)

  const loadFiles = async () => {
    try {
      const res = await fetch("/api/citation-checker/files")
      if (res.ok) {
        const data = await res.json()
        console.log("[UploadPage] Loaded files:", data.length, "files")
        console.log("[UploadPage] Sample file:", data[0] ? {
          id: data[0].id,
          name: data[0].originalName,
          checksCount: data[0].citationChecks?.length || 0,
          latestCheck: data[0].citationChecks?.[0] ? {
            id: data[0].citationChecks[0].id,
            status: data[0].citationChecks[0].status,
            workflowType: data[0].citationChecks[0].workflowType
          } : null
        } : "No files")
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
        router.push(`/citation-checker/${data.fileUpload.id}/generate-json`)
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
              // Ensure citationChecks is always an array
              if (!file.citationChecks) {
                file.citationChecks = []
              }
              // Safely get latest check - citationChecks might be empty array
              const latestCheck = file.citationChecks && file.citationChecks.length > 0 
                ? file.citationChecks[0] 
                : null
              
              // Use status and workflow fields instead of checking jsonData
              // Show file if it has a check (even if just uploaded)
              const hasJson = latestCheck?.status && latestCheck.status !== "uploaded"
              const workflowType = latestCheck?.workflowType
              const isNormalWorkflow = !workflowType || workflowType === "standard"
              
              // Always show the file, even if it has no checks yet
              
              // Use the standardWorkflowCheck field from API (already filtered and validated)
              // This ensures we find standard workflow checks even if latest check is a test run
              const normalWorkflowCheck = (file as any).standardWorkflowCheck || null
              const hasValidReport = normalWorkflowCheck !== null
              
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
                        {hasValidReport && (
                          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            Report Available
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {hasValidReport && normalWorkflowCheck && (
                        <button
                          onClick={() => router.push(`/citation-checker/${file.id}/report?checkId=${normalWorkflowCheck.id}`)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                        >
                          View Report
                        </button>
                      )}
                      {hasJson && (
                        <button
                          onClick={() => router.push(`/citation-checker/${file.id}/test-run/setup`)}
                          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                        >
                          Run Test
                        </button>
                      )}
                      {hasJson && (
                        <button
                          onClick={() => router.push(`/citation-checker/${file.id}/heavy-analysis`)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                        >
                          Heavy Analysis
                        </button>
                      )}
                      {hasJson && latestCheck ? (
                        <button
                          onClick={() => router.push(`/citation-checker/${file.id}/generate-json?checkId=${latestCheck.id}`)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                        >
                          Continue from JSON
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const checkId = latestCheck?.id || ""
                            handleFileSelect(file.id, checkId)
                          }}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!latestCheck}
                        >
                          Select & Generate JSON
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDeleteClick(file.id, e)}
                        disabled={deletingFileId === file.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingFileId === file.id ? "Deleting..." : "Delete"}
                      </button>
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

