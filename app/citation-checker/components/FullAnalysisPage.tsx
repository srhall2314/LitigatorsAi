"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

interface FullAnalysisPageProps {
  fileId: string
  checkId?: string
}

export function FullAnalysisPage({ fileId, checkId }: FullAnalysisPageProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisStarted, setAnalysisStarted] = useState(false)

  // Check if analysis has already been run
  useEffect(() => {
    const checkAnalysisStatus = async () => {
      try {
        // TODO: Check if analysis already exists for this file/check
        // This will be implemented when the API is ready
      } catch (err) {
        console.error("Error checking analysis status:", err)
      }
    }
    
    checkAnalysisStatus()
  }, [fileId, checkId])

  const handleStartAnalysis = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // TODO: Implement API call to start full document analysis
      // This will trigger an AI to analyze the entire document
      setAnalysisStarted(true)
    } catch (err) {
      console.error("Error starting analysis:", err)
      setError(err instanceof Error ? err.message : "Failed to start analysis")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          Full Document Analysis
        </h3>
        <p className="text-blue-800 text-sm mb-4">
          This stage will use AI to perform a comprehensive analysis of your entire document. 
          The analysis will examine the document structure, content quality, citation patterns, 
          and provide detailed insights about the document as a whole.
        </p>
        <div className="space-y-2 text-sm text-blue-700">
          <p className="font-medium">What this analysis includes:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Comprehensive document structure analysis</li>
            <li>Content quality assessment</li>
            <li>Citation pattern analysis</li>
            <li>Overall document insights and recommendations</li>
          </ul>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {analysisStarted ? (
        <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-lg font-semibold text-green-900 mb-2">
            Analysis Started
          </h3>
          <p className="text-green-800 text-sm mb-4">
            Your full document analysis has been initiated. This process may take some time 
            depending on the size of your document.
          </p>
          <div className="flex items-center gap-2 mb-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
            <span className="text-green-700 text-sm">Processing...</span>
          </div>
          <Link
            href={`/citation-checker/${fileId}/document-review${checkId ? `?checkId=${checkId}` : ''}`}
            className="inline-block px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Continue to Document Review →
          </Link>
        </div>
      ) : (
        <div className="flex space-x-4">
          <button
            onClick={handleStartAnalysis}
            disabled={loading}
            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Starting Analysis..." : "Start Full Document Analysis"}
          </button>
          <Link
            href={`/citation-checker/${fileId}/document-review${checkId ? `?checkId=${checkId}` : ''}`}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Continue to Document Review →
          </Link>
          <Link
            href={`/citation-checker/${fileId}/report${checkId ? `?checkId=${checkId}` : ''}`}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            ← Back to Report
          </Link>
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Note</h4>
        <p className="text-sm text-gray-600">
          The full document analysis feature is currently being set up. 
          Once implemented, this will provide comprehensive AI-powered insights about your document.
        </p>
      </div>
    </div>
  )
}

