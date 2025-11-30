"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface ValidationRun {
  id: string
  version: number
  status: string
  createdAt: string
  updatedAt: string
  isCurrent: boolean
  statistics: {
    totalCitations: number
    valid: number
    invalid: number
    uncertain: number
    tier3Reviewed: number
    totalTokens: number
    totalCost: number
  }
}

interface ValidationRunsListProps {
  fileId: string
}

export function ValidationRunsList({ fileId }: ValidationRunsListProps) {
  const router = useRouter()
  const [runs, setRuns] = useState<ValidationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadRuns = async () => {
      try {
        const res = await fetch(`/api/citation-checker/files/${fileId}/validation-runs`)
        if (res.ok) {
          const data = await res.json()
          setRuns(data.runs || [])
        } else {
          setError("Failed to load validation runs")
        }
      } catch (err) {
        console.error("Error loading validation runs:", err)
        setError("Failed to load validation runs")
      } finally {
        setLoading(false)
      }
    }

    loadRuns()
  }, [fileId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading validation runs...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">
          No validation runs found. Run validation first to see history.
        </div>
      </div>
    )
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
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-black mb-2">
          Validation Runs ({runs.length})
        </h2>
        <p className="text-gray-600 text-sm">
          Compare results across different validation runs to assess consistency
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Version
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Citations
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Valid
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Uncertain
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invalid
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tier 3
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tokens
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cost
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {runs.map((run) => (
              <tr
                key={run.id}
                className={`hover:bg-gray-50 ${
                  run.isCurrent ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                }`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      v{run.version}
                    </span>
                    {run.isCurrent && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        Current
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {formatDate(run.updatedAt)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {run.statistics.totalCitations}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-green-600">
                    {run.statistics.valid}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-yellow-600">
                    {run.statistics.uncertain}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-red-600">
                    {run.statistics.invalid}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-purple-600">
                    {run.statistics.tier3Reviewed}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-600">
                    {run.statistics.totalTokens > 0
                      ? run.statistics.totalTokens.toLocaleString()
                      : "—"}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-600">
                    {run.statistics.totalCost > 0
                      ? `$${run.statistics.totalCost.toFixed(4)}`
                      : "—"}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <Link
                    href={`/citation-checker/${fileId}/report?checkId=${run.id}`}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    View Report
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparison Summary */}
      {runs.length > 1 && (
        <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Consistency Analysis
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-600 mb-1">Valid Citations Range</div>
              <div className="text-lg font-semibold text-gray-900">
                {Math.min(...runs.map((r) => r.statistics.valid))} -{" "}
                {Math.max(...runs.map((r) => r.statistics.valid))}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Invalid Citations Range</div>
              <div className="text-lg font-semibold text-gray-900">
                {Math.min(...runs.map((r) => r.statistics.invalid))} -{" "}
                {Math.max(...runs.map((r) => r.statistics.invalid))}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Average Consistency</div>
              <div className="text-lg font-semibold text-gray-900">
                {(() => {
                  const validCounts = runs.map((r) => r.statistics.valid)
                  const avg = validCounts.reduce((a, b) => a + b, 0) / validCounts.length
                  const variance =
                    validCounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
                    validCounts.length
                  const stdDev = Math.sqrt(variance)
                  const consistency = stdDev === 0 ? 100 : Math.max(0, 100 - (stdDev / avg) * 100)
                  return `${consistency.toFixed(1)}%`
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

