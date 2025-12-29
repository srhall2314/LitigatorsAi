"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FileUpload, CitationCheck } from "../types"
import { AccessIndicator } from "./AccessIndicator"
import { FileCaseAssignmentModal } from "./FileCaseAssignmentModal"
import { DocumentSharePanel } from "./DocumentSharePanel"
import { DocumentRouter } from "./DocumentRouter"

interface DocumentDetailPageProps {
  fileId: string
  checkId?: string
}

export function DocumentDetailPage({ fileId, checkId: initialCheckId }: DocumentDetailPageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<FileUpload | null>(null)
  const [check, setCheck] = useState<CitationCheck | null>(null)
  const [documentText, setDocumentText] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [exportingText, setExportingText] = useState(false)
  const [showCaseModal, setShowCaseModal] = useState(false)
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [showRouter, setShowRouter] = useState(false)
  const [shares, setShares] = useState<any[]>([])
  const [routingHistory, setRoutingHistory] = useState<any[]>([])

  useEffect(() => {
    loadDocument()
  }, [fileId, initialCheckId])

  const loadDocument = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load file data
      const fileRes = await fetch(`/api/citation-checker/files`)
      if (!fileRes.ok) {
        throw new Error("Failed to load file data")
      }

      const files = await fileRes.json()
      const fileData = files.find((f: FileUpload) => f.id === fileId)
      if (!fileData) {
        throw new Error("File not found")
      }

      setFile(fileData)
      
      // Load shares
      try {
        const sharesRes = await fetch(`/api/citation-checker/files/${fileId}/share`)
        if (sharesRes.ok) {
          const sharesData = await sharesRes.json()
          setShares(sharesData)
        }
      } catch (err) {
        console.error("Error loading shares:", err)
      }
      
      // Load routing history
      try {
        const routeRes = await fetch(`/api/citation-checker/files/${fileId}/route`)
        if (routeRes.ok) {
          const routeData = await routeRes.json()
          setRoutingHistory(routeData)
        }
      } catch (err) {
        console.error("Error loading routing history:", err)
      }

      // Find the check to use
      let targetCheckId = initialCheckId
      if (!targetCheckId && fileData.citationChecks && fileData.citationChecks.length > 0) {
        // Find the latest standard workflow check
        for (const c of fileData.citationChecks) {
          const workflowType = c.workflowType
          const isNormalWorkflow = !workflowType || workflowType === "standard"
          if (isNormalWorkflow && c.jsonData?.document) {
            targetCheckId = c.id
            break
          }
        }
        if (!targetCheckId && fileData.citationChecks[0]) {
          targetCheckId = fileData.citationChecks[0].id
        }
      }

      if (targetCheckId) {
        const checkRes = await fetch(`/api/citation-checker/checks/${targetCheckId}`)
        if (checkRes.ok) {
          const checkData = await checkRes.json()
          setCheck(checkData)

          // Extract document text from jsonData
          if (checkData.jsonData?.document) {
            const content = checkData.jsonData.document.content || []
            const text = content
              .map((para: any) => {
                return para.text
                  .replace(/\[CITATION:[^\]]+\]/g, '')
                  .replace(/\[\/CITATION:[^\]]+\]/g, '')
                  .trim()
              })
              .filter((text: string) => text.length > 0)
              .join('\n\n')
            setDocumentText(text)
          } else if (fileData.blobUrl) {
            // Fallback to fetching from blob if no jsonData
            const blobRes = await fetch(fileData.blobUrl)
            if (blobRes.ok) {
              const text = await blobRes.text()
              setDocumentText(text)
            }
          }
        }
      } else if (fileData.blobUrl) {
        // No check data, try to load from blob
        const blobRes = await fetch(fileData.blobUrl)
        if (blobRes.ok) {
          const text = await blobRes.text()
          setDocumentText(text)
        }
      }
    } catch (err) {
      console.error("Error loading document:", err)
      setError(err instanceof Error ? err.message : "Failed to load document")
    } finally {
      setLoading(false)
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
      finalized: { label: "Finalized", color: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
      report_generated: { label: "Report Generated", color: "bg-indigo-100 text-indigo-800 border border-indigo-200" },
    }
    
    const config = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-800 border border-gray-200" }
    return (
      <span className={`px-3 py-1.5 text-sm font-semibold rounded-md ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const handleExportToText = async () => {
    if (!file || !documentText) return

    setExportingText(true)
    try {
      const blob = new Blob([documentText], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${file.originalName.replace(/\.[^/.]+$/, '')}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error exporting to text:", error)
      alert("Failed to export document to text")
    } finally {
      setExportingText(false)
    }
  }

  const handleGenerateReport = () => {
    if (!check) return
    router.push(`/citation-checker/${fileId}/report${check.id ? `?checkId=${check.id}` : ''}`)
  }

  const handleEditDocument = () => {
    if (!file) return

    // Check if document has been processed
    const hasJsonData = check?.jsonData?.document
    const hasManualReviews = check?.jsonData?.document?.citations?.some((c: any) => 
      c.manualReview?.status === "approved" || c.manualReview?.status === "questionable"
    )

    let confirmMessage = "Are you sure you want to edit this document?"
    
    if (hasJsonData) {
      if (hasManualReviews) {
        const reviewCount = check.jsonData.document.citations.filter((c: any) => 
          c.manualReview?.status === "approved" || c.manualReview?.status === "questionable"
        ).length
        confirmMessage = `Warning: This document has ${reviewCount} manual review decision(s) that will be lost if you edit it.\n\nEditing will require re-running citation validation.\n\nDo you want to continue?`
      } else {
        confirmMessage = "This document has been processed through citation validation. Editing will require re-running citation validation.\n\nDo you want to continue?"
      }
    }

    if (confirm(confirmMessage)) {
      router.push(`/citation-checker/create-document?fileId=${fileId}`)
    }
  }

  const handleCaseAssign = async () => {
    await loadDocument()
    setShowCaseModal(false)
  }

  const handleShareChange = async () => {
    await loadDocument()
    setShowSharePanel(false)
  }

  const handleRoute = async () => {
    await loadDocument()
    setShowRouter(false)
  }


  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading document...</p>
      </div>
    )
  }

  if (error || !file) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || "File not found"}</p>
        <button
          onClick={() => router.push('/citation-checker')}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Back to Files
        </button>
      </div>
    )
  }

  const status = check?.status
  const citationCount = check?.citationCount
  const currentStep = check?.currentStep

  return (
    <div className="flex gap-6 h-full">
      {/* Left Side - Document Text */}
      <div className="flex-1 bg-white border border-gray-200 rounded-lg p-6 overflow-y-auto max-h-[calc(100vh-12rem)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{file.originalName}</h2>
        </div>
        <div className="prose max-w-none">
          <div className="whitespace-pre-wrap text-gray-900 leading-relaxed">
            {documentText || <span className="text-gray-400 italic">No document text available</span>}
          </div>
        </div>
      </div>

      {/* Right Side - Status, Actions, Metadata */}
      <div className="w-80 flex-shrink-0 space-y-6">
        {/* Status Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Status</h3>
          <div className="space-y-3">
            {getStatusBadge(status)}
            {file.accessLevel && (
              <div>
                <AccessIndicator accessLevel={file.accessLevel} />
              </div>
            )}
            {citationCount !== null && citationCount !== undefined && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Citations:</span> {citationCount}
              </div>
            )}
            {currentStep && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Current Step:</span> {currentStep}
              </div>
            )}
          </div>
        </div>

        {/* Case Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Case</h3>
            {file.accessLevel === "owner" && (
              <button
                onClick={() => setShowCaseModal(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
              >
                {file.caseId ? "Change" : "Assign"}
              </button>
            )}
          </div>
          <div className="space-y-2 text-sm">
            {file.case ? (
              <div>
                <div className="font-medium text-gray-700 mb-1">{file.case.name}</div>
                {file.case.description && (
                  <div className="text-gray-600 text-xs">{file.case.description}</div>
                )}
                {file.legalDocumentType && (
                  <div className="text-gray-600 mt-1">
                    <span className="font-medium">Type:</span> {file.legalDocumentType}
                  </div>
                )}
                {file.filedByOrganization && (
                  <div className="text-gray-600">
                    <span className="font-medium">Filed By:</span> {file.filedByOrganization}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm italic">No case assigned</div>
            )}
          </div>
        </div>

        {/* Share Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Share</h3>
            {(file.accessLevel === "owner" || file.accessLevel === "route") && (
              <button
                onClick={() => setShowSharePanel(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
              >
                Manage
              </button>
            )}
          </div>
          <div className="space-y-2 text-sm">
            {shares.length > 0 ? (
              <div className="space-y-1">
                {shares.slice(0, 3).map((share) => (
                  <div key={share.id} className="text-gray-600">
                    <span className="font-medium">
                      {share.sharedWith?.name || share.sharedWith?.email}
                    </span>
                    <span className="text-gray-400 ml-2">({share.permission})</span>
                  </div>
                ))}
                {shares.length > 3 && (
                  <div className="text-gray-500 text-xs">+{shares.length - 3} more</div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm italic">Not shared</div>
            )}
          </div>
        </div>

        {/* Route Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Route</h3>
            {(file.accessLevel === "owner" || file.accessLevel === "route") && check && (
              <button
                onClick={() => setShowRouter(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
              >
                Route
              </button>
            )}
          </div>
          <div className="space-y-2 text-sm">
            {routingHistory.length > 0 ? (
              <div className="space-y-1">
                {routingHistory.slice(0, 3).map((route) => (
                  <div key={route.id} className="text-gray-600">
                    <div className="font-medium">
                      {route.sharedWith?.name || route.sharedWith?.email}
                    </div>
                    {route.routedFrom && (
                      <div className="text-xs text-gray-500">
                        From: {route.routedFrom.name || route.routedFrom.email}
                      </div>
                    )}
                    {route.routedAt && (
                      <div className="text-xs text-gray-400">
                        {new Date(route.routedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
                {routingHistory.length > 3 && (
                  <div className="text-gray-500 text-xs">+{routingHistory.length - 3} more</div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm italic">No routing history</div>
            )}
          </div>
        </div>

        {/* Actions Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Actions</h3>
          <div className="space-y-2">
            {file.accessLevel === "owner" && (
              <button
                onClick={handleEditDocument}
                className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium border-0"
                style={{ backgroundColor: '#ea580c', color: '#ffffff' }}
              >
                Edit Document
              </button>
            )}
            <button
              onClick={() => alert("Export to Word functionality coming soon")}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm font-medium"
              disabled
            >
              Export to Word (Coming Soon)
            </button>
            <button
              onClick={handleExportToText}
              disabled={!documentText || exportingText}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {exportingText ? "Exporting..." : "Export to Text"}
            </button>
            {(status === "finalized" || status === "report_generated") && (
              <button
                onClick={handleGenerateReport}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm font-medium"
              >
                Generate Final Report
              </button>
            )}
          </div>
        </div>

        {/* Metadata Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Metadata</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-gray-700">File Size:</span>
              <span className="text-gray-600 ml-2">{formatFileSize(file.fileSize)}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">File Type:</span>
              <span className="text-gray-600 ml-2">{file.mimeType}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Created:</span>
              <span className="text-gray-600 ml-2">{new Date(file.createdAt).toLocaleDateString()}</span>
            </div>
            {file.user && (
              <div>
                <span className="font-medium text-gray-700">Created By:</span>
                <span className="text-gray-600 ml-2">{file.user.name || file.user.email}</span>
              </div>
            )}
            {file.case && (
              <div>
                <span className="font-medium text-gray-700">Case:</span>
                <span className="text-gray-600 ml-2">{file.case.name}</span>
              </div>
            )}
            {file.legalDocumentType && (
              <div>
                <span className="font-medium text-gray-700">Document Type:</span>
                <span className="text-gray-600 ml-2">{file.legalDocumentType}</span>
              </div>
            )}
            {file.filedByOrganization && (
              <div>
                <span className="font-medium text-gray-700">Filed By:</span>
                <span className="text-gray-600 ml-2">{file.filedByOrganization}</span>
              </div>
            )}
            {check?.version && (
              <div>
                <span className="font-medium text-gray-700">Version:</span>
                <span className="text-gray-600 ml-2">{check.version}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCaseModal && file && (
        <FileCaseAssignmentModal
          fileId={fileId}
          currentCaseId={file.caseId || null}
          onAssign={handleCaseAssign}
          onCancel={() => setShowCaseModal(false)}
        />
      )}

      {showSharePanel && file && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Share Document</h3>
              <button
                onClick={() => setShowSharePanel(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <DocumentSharePanel
              fileId={fileId}
              accessLevel={file.accessLevel || null}
              onShareChange={handleShareChange}
            />
          </div>
        </div>
      )}

      {showRouter && file && check && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Route Document</h3>
              <button
                onClick={() => setShowRouter(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <DocumentRouter
              fileId={fileId}
              checkId={check.id}
              accessLevel={file.accessLevel || null}
              onRoute={handleRoute}
            />
          </div>
        </div>
      )}
    </div>
  )
}

