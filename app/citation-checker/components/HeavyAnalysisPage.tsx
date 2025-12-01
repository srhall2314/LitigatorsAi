"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface HeavyAnalysisPageProps {
  fileId: string
}

interface HeavyAnalysisResult {
  checkId: string
  version: number
  citationsAnalyzed: number
  riskLevelCounts: {
    'Low Risk': number
    'Medium Risk': number
    'human review': number
  }
  totalCost: string
  message: string
}

type Provider = 'anthropic' | 'openai' | 'gemini' | 'grok'

const PROVIDER_MODELS: Record<Provider, string[]> = {
  anthropic: ['claude-sonnet-4-5-20250929', 'claude-opus-4-20250514'],
  openai: ['gpt-5.1', 'gpt-5.1-2025-11-13', 'gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini'],
  gemini: ['gemini-3-pro-preview', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
  grok: ['grok-3-fast-beta', 'grok-3-fast', 'grok-3-fast-latest'],
}

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-pro',
  grok: 'grok-3-fast',
}

interface HeavyAnalysisRun {
  runId: string
  runTotal: number
  createdAt: string
  updatedAt: string
  runsCompleted: number
  runs: Array<{
    id: string
    version: number
    runNumber: number
    createdAt: string
    updatedAt: string
  }>
}

export function HeavyAnalysisPage({ fileId }: HeavyAnalysisPageProps) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<HeavyAnalysisResult | null>(null)
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [model, setModel] = useState<string>(DEFAULT_MODELS.anthropic)
  const [numberOfRuns, setNumberOfRuns] = useState<number>(1)
  const [runMode, setRunMode] = useState<'single' | 'multi'>('single')
  const [previousRuns, setPreviousRuns] = useState<HeavyAnalysisRun[]>([])
  const [loadingRuns, setLoadingRuns] = useState(true)

  useEffect(() => {
    const loadPreviousRuns = async () => {
      try {
        const res = await fetch(`/api/citation-checker/files/${fileId}/heavy-analysis-runs`)
        if (res.ok) {
          const data = await res.json()
          setPreviousRuns(data.runs || [])
        }
      } catch (err) {
        console.error("Error loading previous heavy analysis runs:", err)
      } finally {
        setLoadingRuns(false)
      }
    }

    loadPreviousRuns()
  }, [fileId])

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider)
    setModel(DEFAULT_MODELS[newProvider])
  }

  const handleRunHeavyAnalysis = async () => {
    setRunning(true)
    setError(null)
    setResult(null)

    try {
      if (runMode === 'multi' && numberOfRuns > 1) {
        // Run multiple heavy analysis runs
        const res = await fetch(`/api/citation-checker/files/${fileId}/heavy-analysis-runs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ numberOfRuns, provider, model }),
        })

        if (res.ok) {
          const data = await res.json()
          // Navigate to results page
          router.push(`/citation-checker/${fileId}/heavy-analysis/${data.runId}/results`)
        } else {
          const errorData = await res.json().catch(() => ({ error: "Unknown error" }))
          setError(errorData.error || errorData.details || "Failed to run heavy analysis")
        }
      } else {
        // Single run
        const res = await fetch(`/api/citation-checker/files/${fileId}/heavy-analysis`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider, model }),
        })

        if (res.ok) {
          const data = await res.json()
          setResult(data)
        } else {
          const errorData = await res.json().catch(() => ({ error: "Unknown error" }))
          setError(errorData.error || errorData.details || "Failed to run heavy analysis")
        }
      }
    } catch (err) {
      console.error("Error running heavy analysis:", err)
      setError("Failed to run heavy analysis. Please try again.")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-black mb-2">
          Heavy Model Analysis
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          Run a comprehensive analysis of all citations using a heavy model. 
          This analyzes the entire document at once and provides risk assessments, case fit analysis, 
          and verification links for each citation. You can run this multiple times to assess consistency.
        </p>
      </div>

      {/* Previous Multi-Run Results */}
      {previousRuns.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-4 bg-white">
          <h4 className="text-md font-semibold text-black mb-3">Previous Multi-Run Results</h4>
          <div className="space-y-2">
            {previousRuns.map((run) => (
              <div
                key={run.runId}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-black">
                    {run.runsCompleted} of {run.runTotal} runs completed
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Created: {new Date(run.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/citation-checker/${fileId}/heavy-analysis/${run.runId}/results`)}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  View Results
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingRuns && (
        <div className="text-sm text-gray-500">Loading previous runs...</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-black mb-2">
            Run Mode
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="single"
                checked={runMode === 'single'}
                onChange={(e) => setRunMode(e.target.value as 'single' | 'multi')}
                disabled={running}
                className="mr-2"
              />
              <span className="text-sm text-black">Single Run</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="multi"
                checked={runMode === 'multi'}
                onChange={(e) => setRunMode(e.target.value as 'single' | 'multi')}
                disabled={running}
                className="mr-2"
              />
              <span className="text-sm text-black">Multi-Run Test</span>
            </label>
          </div>
        </div>

        {runMode === 'multi' && (
          <div>
            <label className="block text-sm font-medium text-black mb-2">
              Number of Runs
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={numberOfRuns}
              onChange={(e) => setNumberOfRuns(parseInt(e.target.value) || 1)}
              disabled={running}
              className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black disabled:opacity-50"
            />
            <p className="mt-2 text-sm text-gray-500">
              Enter a number between 1 and 10. Each run will be processed sequentially and results can be compared.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-black mb-2">
            AI Provider
          </label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as Provider)}
            disabled={running}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black disabled:opacity-50"
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="grok">Grok (xAI)</option>
            <option value="gemini">Google (Gemini)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-black mb-2">
            Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={running}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black disabled:opacity-50"
          >
            {PROVIDER_MODELS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800 font-medium mb-2">{result.message}</p>
          <div className="text-sm text-green-700 space-y-1">
            <p>Check ID: {result.checkId}</p>
            <p>Version: {result.version}</p>
            <p>Citations Analyzed: {result.citationsAnalyzed}</p>
            <div className="mt-2">
              <p className="font-medium">Risk Level Distribution:</p>
              <ul className="list-disc list-inside ml-2">
                <li>Low Risk: {result.riskLevelCounts['Low Risk']}</li>
                <li>Medium Risk: {result.riskLevelCounts['Medium Risk']}</li>
                <li>Human Review: {result.riskLevelCounts['human review']}</li>
              </ul>
            </div>
            <p className="mt-2">Total Cost: ${result.totalCost}</p>
          </div>
        </div>
      )}

      <div className="flex space-x-4">
        <button
          onClick={handleRunHeavyAnalysis}
          disabled={running || (runMode === 'multi' && (numberOfRuns < 1 || numberOfRuns > 10))}
          className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running 
            ? (runMode === 'multi' ? `Running ${numberOfRuns} Analysis${numberOfRuns > 1 ? 'es' : ''}...` : "Running Analysis...")
            : (runMode === 'multi' ? `Run ${numberOfRuns} Analysis${numberOfRuns > 1 ? 'es' : ''}` : "Run Heavy Analysis")
          }
        </button>
        <button
          onClick={() => router.back()}
          disabled={running}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
        >
          Back
        </button>
      </div>
    </div>
  )
}

