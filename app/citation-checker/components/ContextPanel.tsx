"use client"

import { useState, useEffect, useCallback } from "react"

interface ContextPanelProps {
  fileId: string | null
  checkId: string | null
  showJson?: boolean
  showCitationCount?: boolean
  showValidationResults?: boolean
}

export function ContextPanel({ 
  fileId, 
  checkId,
  showJson = false,
  showCitationCount = false,
  showValidationResults = false
}: ContextPanelProps) {
  const [fileInfo, setFileInfo] = useState<{ filename: string } | null>(null)
  const [jsonData, setJsonData] = useState<string | null>(null)
  const [citationCount, setCitationCount] = useState<number | null>(null)
  const [validationResults, setValidationResults] = useState<{ valid: number; invalid: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const loadContextData = useCallback(async () => {
    if (!checkId) return
    
    try {
      const checkRes = await fetch(`/api/citation-checker/checks/${checkId}`)
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        
        if (checkData.fileUpload) {
          setFileInfo({ filename: checkData.fileUpload.originalName })
        }
        
        if (checkData.jsonData) {
          setJsonData(JSON.stringify(checkData.jsonData, null, 2))
          
          if (checkData.jsonData.document?.citations) {
            setCitationCount(checkData.jsonData.document.citations.length)
          } else if (checkData.jsonData.document?.metadata?.totalCitations) {
            setCitationCount(checkData.jsonData.document.metadata.totalCitations)
          }
        }
        
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
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200 relative">
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
                    a.download = `CC-${fileId || 'document'}-${new Date().toISOString().split('T')[0]}.json`
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
              <pre className="text-xs text-black overflow-auto max-h-64 pr-20">{jsonData}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

