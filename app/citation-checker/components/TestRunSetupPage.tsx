"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface TestRun {
  testRunId: string
  testRunTotal: number
  runsCompleted: number
  createdAt: string
  updatedAt: string
}

interface TestRunSetupPageProps {
  fileId: string
}

export function TestRunSetupPage({ fileId }: TestRunSetupPageProps) {
  const router = useRouter()
  const [numberOfRuns, setNumberOfRuns] = useState<number>(3)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previousTestRuns, setPreviousTestRuns] = useState<TestRun[]>([])
  const [loadingPrevious, setLoadingPrevious] = useState(true)

  useEffect(() => {
    const loadPreviousTestRuns = async () => {
      try {
        const res = await fetch(`/api/citation-checker/files/${fileId}/test-runs`)
        if (res.ok) {
          const data = await res.json()
          setPreviousTestRuns(data.testRuns || [])
        }
      } catch (err) {
        console.error("Error loading previous test runs:", err)
      } finally {
        setLoadingPrevious(false)
      }
    }

    loadPreviousTestRuns()
  }, [fileId])

  const handleCreateTestRun = async () => {
    if (numberOfRuns < 1 || numberOfRuns > 10) {
      setError("Number of runs must be between 1 and 10")
      return
    }

    setCreating(true)
    setError(null)

    try {
      const res = await fetch(`/api/citation-checker/files/${fileId}/test-runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ numberOfRuns }),
      })

      if (res.ok) {
        const data = await res.json()
        // Navigate to results page - it will show progress as runs complete
        router.push(`/citation-checker/${fileId}/test-run/${data.testRunId}/results`)
      } else {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }))
        setError(errorData.error || errorData.details || "Failed to create test run")
      }
    } catch (err) {
      console.error("Error creating test run:", err)
      setError("Failed to create test run. Please try again.")
    } finally {
      setCreating(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-black mb-2">
          Multi-Run Test Setup
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          Run multiple validation passes on this file sequentially to assess consistency 
          and reliability of the citation validation system. Each run will be processed 
          independently and results can be compared.
        </p>
      </div>

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
          className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black"
          disabled={creating}
        />
        <p className="mt-2 text-sm text-gray-500">
          Enter a number between 1 and 10. Each run will create a new validation job 
          that processes through the queue system.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div className="flex space-x-4">
        <button
          onClick={handleCreateTestRun}
          disabled={creating || numberOfRuns < 1 || numberOfRuns > 10}
          className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Creating Test Run..." : "Start Test Run"}
        </button>
        <button
          onClick={() => router.back()}
          disabled={creating}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {/* Previous Test Runs */}
      {!loadingPrevious && previousTestRuns.length > 0 && (
        <div className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-black mb-4">
            Previous Test Runs
          </h3>
          <div className="space-y-3">
            {previousTestRuns.map((testRun) => (
              <div
                key={testRun.testRunId}
                className="p-4 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-black">
                      Test Run ({testRun.runsCompleted} / {testRun.testRunTotal} runs)
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Created: {formatDate(testRun.createdAt)} • 
                      Updated: {formatDate(testRun.updatedAt)}
                    </div>
                  </div>
                  <Link
                    href={`/citation-checker/${fileId}/test-run/${testRun.testRunId}/results`}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                  >
                    View Results
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

