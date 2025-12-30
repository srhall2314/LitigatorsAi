"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ContextPanel } from "./ContextPanel"

interface GenerateJsonPageProps {
  fileId: string
}

export function GenerateJsonPage({ fileId }: GenerateJsonPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [generating, setGenerating] = useState(false)
  const [jsonData, setJsonData] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [checkId, setCheckId] = useState<string | null>(null)

  const loadCheckData = useCallback(async () => {
    setLoading(true)
    try {
      // First, check if checkId was provided in query params
      const queryCheckId = searchParams.get('checkId')
      
      if (queryCheckId) {
        // Load the specific check
        const checkRes = await fetch(`/api/citation-checker/checks/${queryCheckId}`)
        if (checkRes.ok) {
          const checkData = await checkRes.json()
          setCheckId(checkData.id)
          if (checkData.jsonData) {
            setJsonData(JSON.stringify(checkData.jsonData, null, 2))
            setLoading(false)
            return
          }
        }
      }
      
      // If no checkId in query or check doesn't have JSON, check the file's latest check
      const fileRes = await fetch(`/api/citation-checker/files`)
      if (fileRes.ok) {
        const files = await fileRes.json()
        const file = files.find((f: any) => f.id === fileId)
        if (file && file.citationChecks && file.citationChecks.length > 0) {
          // Find the latest check with JSON
          const checkWithJson = file.citationChecks.find((check: any) => check.jsonData)
          if (checkWithJson) {
            console.log('[GenerateJsonPage] Found JSON in file check:', checkWithJson.id)
            setJsonData(JSON.stringify(checkWithJson.jsonData, null, 2))
            setCheckId(checkWithJson.id)
          } else {
            // Use the latest check (even without JSON)
            setCheckId(file.citationChecks[0].id)
          }
        }
      }
    } catch (error) {
      console.error("[GenerateJsonPage] Error loading check:", error)
    } finally {
      setLoading(false)
    }
  }, [fileId, searchParams])

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
        if (data.jsonData) {
          setJsonData(JSON.stringify(data.jsonData, null, 2))
        }
        if (data.id) {
          setCheckId(data.id)
        }
        if (!forceRegenerate) {
          router.push(`/citation-checker/${fileId}/identify-citations`)
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
      {/* Navigation Button at Top */}
      {jsonData && (
        <div className="flex space-x-4 pb-4 border-b border-gray-200">
          <button
            onClick={() => handleGenerate(true)}
            disabled={generating || !fileId}
            className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
          >
            {generating ? "Regenerating JSON..." : "Regenerate JSON"}
          </button>
          <button
            onClick={() => router.push(`/citation-checker/${fileId}/identify-citations`)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Continue to Next Step
          </button>
        </div>
      )}
      
      {loading && (
        <p className="text-gray-600">Loading existing JSON...</p>
      )}
      {jsonData ? (
        <div>
          <p className="text-green-600 mb-4">✓ JSON already generated</p>
          <div className="mt-8 border-t-4 border-orange-300 pt-6">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-orange-900">Development Panel</h3>
                <p className="text-sm font-medium text-orange-800 mb-2">JSON Data</p>
                <p className="text-sm text-orange-700 mt-1">
                  JSON data export for development purposes (not part of final product)
                </p>
              </div>
              <div className="bg-white border border-orange-200 rounded-md p-4 relative">
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
                className="p-2 bg-white border border-orange-300 rounded hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                  a.download = `CC-${fileId}-${new Date().toISOString().split('T')[0]}.json`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                }}
                className="p-2 bg-white border border-orange-300 rounded hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                title="Download JSON file"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
                <pre className="text-sm text-gray-900 overflow-auto max-h-96 pr-20">{jsonData}</pre>
              </div>
            </div>
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
            <div className="mt-8 border-t-4 border-orange-300 pt-6">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-orange-900">Development Panel</h3>
                  <p className="text-sm font-medium text-orange-800 mb-2">JSON Data</p>
                  <p className="text-sm text-orange-700 mt-1">
                    JSON data export for development purposes (not part of final product)
                  </p>
                </div>
                <div className="bg-white border border-orange-200 rounded-md p-4 relative">
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
                  className="p-2 bg-white border border-orange-300 rounded hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                    a.download = `CC-${fileId}-${new Date().toISOString().split('T')[0]}.json`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }}
                  className="p-2 bg-white border border-orange-300 rounded hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  title="Download JSON file"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>
                  <pre className="text-sm text-gray-900 overflow-auto max-h-96 pr-20">{jsonData}</pre>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      
      <ContextPanel 
        fileId={fileId}
        checkId={checkId}
        showJson={true}
      />
    </div>
  )
}

