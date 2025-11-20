"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CitationList } from "./CitationList"
import { ContextPanel } from "./ContextPanel"

interface IdentifyCitationsPageProps {
  fileId: string
}

export function IdentifyCitationsPage({ fileId }: IdentifyCitationsPageProps) {
  const router = useRouter()
  const [identifying, setIdentifying] = useState(false)
  const [identifyingEyecite, setIdentifyingEyecite] = useState(false)
  const [citations, setCitations] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [checkId, setCheckId] = useState<string | null>(null)
  const [identificationMethod, setIdentificationMethod] = useState<string | null>(null)

  // Load checkId from file
  useEffect(() => {
    const loadCheckId = async () => {
      try {
        const res = await fetch(`/api/citation-checker/files`)
        if (res.ok) {
          const files = await res.json()
          const file = files.find((f: any) => f.id === fileId)
          if (file?.citationChecks?.[0]) {
            setCheckId(file.citationChecks[0].id)
            // Load existing citations if available
            const checkWithCitations = file.citationChecks.find((check: any) => 
              check.jsonData?.document?.citations
            )
            if (checkWithCitations?.jsonData?.document?.citations) {
              setCitations(checkWithCitations.jsonData.document.citations)
            }
          }
        }
      } catch (err) {
        console.error('Failed to load check ID:', err)
      }
    }
    loadCheckId()
  }, [fileId])

  const handleIdentify = async (useEyecite: boolean = false) => {
    if (!checkId) {
      setError("No citation check selected")
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
        ? `/api/citation-checker/checks/${checkId}/identify-citations-eyecite`
        : `/api/citation-checker/checks/${checkId}/identify-citations`
      
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
        setCheckId(data.id)
        
        // Extract citations from jsonData
        if (data.jsonData?.document?.citations) {
          setCitations(data.jsonData.document.citations)
        }
        
        // Track which method was used
        setIdentificationMethod(useEyecite ? 'eyecite' : 'custom')
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.details || errorData.error || `Failed to identify citations${useEyecite ? ' with Eyecite' : ''}`
        console.error('[IdentifyCitationsPage] API Error:', errorData)
        setError(errorMessage)
        
        if (errorData.stack) {
          console.error('[IdentifyCitationsPage] Error stack:', errorData.stack)
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
      {citations.length > 0 && (
        <div className="pb-4 border-b border-gray-200">
          <button
            onClick={() => router.push(`/citation-checker/${fileId}/validate-citations`)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Continue to Validation
          </button>
        </div>
      )}
      
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Citation Identification Method</h3>
          <div className="flex gap-4">
            <button
              onClick={() => handleIdentify(false)}
              disabled={identifying || identifyingEyecite || !checkId}
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {identifying ? "Identifying..." : "Identify Citations (Custom)"}
            </button>
            <button
              onClick={() => handleIdentify(true)}
              disabled={identifying || identifyingEyecite || !checkId}
              className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {identifyingEyecite ? "Identifying..." : "Identify Citations (Eyecite)"}
            </button>
          </div>
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
        <CitationList citations={citations} />
      )}
      
      <ContextPanel 
        fileId={fileId}
        checkId={checkId}
        showJson={true}
      />
    </div>
  )
}

