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
              const latestCheck = file.citationChecks[0]
              const hasJson = latestCheck?.jsonData
              
              // Check if document has a valid report (citations with validation)
              const hasValidReport = latestCheck?.jsonData?.document?.citations?.some(
                (citation: any) => citation.validation
              ) || false
              
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
                      {hasValidReport && (
                        <button
                          onClick={() => router.push(`/citation-checker/${file.id}/report`)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                        >
                          View Report
                        </button>
                      )}
                      {hasJson ? (
                        <button
                          onClick={() => handleFileSelect(file.id, latestCheck!.id)}
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

