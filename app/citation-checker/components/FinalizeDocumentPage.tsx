"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface FinalizeDocumentPageProps {
  fileId: string
  checkId?: string
}

export function FinalizeDocumentPage({ fileId, checkId: initialCheckId }: FinalizeDocumentPageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [finalizing, setFinalizing] = useState(false)
  const [checkId, setCheckId] = useState<string | null>(initialCheckId || null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadCheckData()
  }, [fileId, initialCheckId])

  const loadCheckData = async () => {
    try {
      setLoading(true)
      setError(null)

      let targetCheckId = initialCheckId

      // If no checkId provided, find the latest standard workflow check
      if (!targetCheckId) {
        const fileRes = await fetch(`/api/citation-checker/files`)
        if (fileRes.ok) {
          const files = await fileRes.json()
          const file = files.find((f: any) => f.id === fileId)
          if (file?.citationChecks && file.citationChecks.length > 0) {
            // Find the latest check from standard workflow
            for (const check of file.citationChecks) {
              const workflowType = check.workflowType
              const isNormalWorkflow = !workflowType || workflowType === "standard"
              
              if (!isNormalWorkflow) continue
              
              if (check.jsonData?.document) {
                targetCheckId = check.id
                break
              }
            }
            
            if (!targetCheckId && file.citationChecks[0]) {
              targetCheckId = file.citationChecks[0].id
            }
          }
        }
      }

      if (targetCheckId) {
        setCheckId(targetCheckId)
        const checkRes = await fetch(`/api/citation-checker/checks/${targetCheckId}`)
        if (checkRes.ok) {
          const data = await checkRes.json()
          setStatus(data.status)
        } else {
          setError("Failed to load citation check data")
        }
      } else {
        setError("No citation check found for this document")
      }
    } catch (error) {
      console.error("Error loading check:", error)
      setError("Failed to load document data")
    } finally {
      setLoading(false)
    }
  }

  const handleFinalize = async () => {
    if (!checkId) {
      alert("No citation check available")
      return
    }

    if (!confirm("Are you sure you want to finalize this document? Once finalized, you will be able to generate the report.")) {
      return
    }

    setFinalizing(true)
    try {
      const res = await fetch(`/api/citation-checker/checks/${checkId}/finalize`, {
        method: "POST",
      })

      if (res.ok) {
        const data = await res.json()
        setStatus(data.status)
        // Navigate to report page after finalization
        router.push(`/citation-checker/${fileId}/report${checkId ? `?checkId=${checkId}` : ''}`)
      } else {
        const errorData = await res.json()
        alert(`Failed to finalize document: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error finalizing:", error)
      alert("Failed to finalize document. Please try again.")
    } finally {
      setFinalizing(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading document data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => router.push(`/citation-checker/${fileId}/document-review`)}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Back to Review
        </button>
      </div>
    )
  }

  const isFinalized = status === "finalized"

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-8">
        <div className="text-center space-y-6">
          <div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">
              {isFinalized ? "Document Finalized" : "Finalize Document"}
            </h3>
            <p className="text-gray-600">
              {isFinalized 
                ? "This document has been finalized. You can now generate the report."
                : "Finalize this document to complete the review process and enable report generation."}
            </p>
          </div>

          {!isFinalized && (
            <div className="pt-4">
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="px-8 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {finalizing ? "Finalizing..." : "Finalize Document"}
              </button>
            </div>
          )}

          {isFinalized && (
            <div className="pt-4 space-y-4">
              <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-md">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Document Finalized
              </div>
              <button
                onClick={() => router.push(`/citation-checker/${fileId}/report${checkId ? `?checkId=${checkId}` : ''}`)}
                className="px-8 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-lg font-medium"
              >
                Generate Report
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={() => router.push(`/citation-checker/${fileId}/document-review${checkId ? `?checkId=${checkId}` : ''}`)}
              className="text-gray-600 hover:text-gray-800 underline"
            >
              ← Back to Review Citations
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

