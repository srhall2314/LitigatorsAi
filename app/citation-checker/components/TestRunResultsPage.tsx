"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface TestRunResult {
  id: string
  version: number
  runNumber: number
  status: string
  createdAt: string
  updatedAt: string
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

interface AgentConsistency {
  agentName: string
  uniqueCitations: number // Total unique citations evaluated
  multiRunCitations: number // Citations that appear in 2+ runs (for consistency calculation)
  consistentCitations: number // Citations where agent voted the same way in all runs
  averageConsistency: number // Average consistency across all citations (only for multi-run citations)
  totalEvaluations: number
  verdictDistribution: {
    VALID: number
    INVALID: number
    UNCERTAIN: number
    [key: string]: number // Allow for score-based keys (e.g., SCORE_8) and risk levels
  }
}

interface TestRunData {
  testRunId: string
  testRunTotal: number
  runsCompleted: number
  runs: TestRunResult[]
  sourceCheckId?: string | null // ID of the check used as template
  statistics: {
    validRange: {
      min: number
      max: number
      avg: number
    }
    invalidRange: {
      min: number
      max: number
      avg: number
    }
    consistency: string
    totalTokens: number
    totalCost: number
  }
  agentConsistency?: AgentConsistency[]
  tier3AgentConsistency?: AgentConsistency[]
}

interface QueueStatus {
  checkId: string
  version: number
  runNumber: number
  hasJob: boolean
  jobStatus: string | null
  tier2Total: number
  tier2Completed: number
  tier2Pending: number
  tier2Processing: number
  tier3Total: number
  tier3Completed: number
  tier3Pending: number
  tier3Processing: number
  totalPending: number
  totalProcessing: number
  totalCompleted: number
  totalItems: number
  progress: number
}

interface QueueStatusData {
  testRunId: string
  queueStatus: QueueStatus[]
  overallStats: {
    totalRuns: number
    runsWithJobs: number
    totalPending: number
    totalProcessing: number
    totalCompleted: number
    totalItems: number
    averageProgress: number
  }
}

interface TestRunResultsPageProps {
  fileId: string
  testRunId: string
}

export function TestRunResultsPage({ fileId, testRunId }: TestRunResultsPageProps) {
  const router = useRouter()
  const [data, setData] = useState<TestRunData | null>(null)
  const [queueStatus, setQueueStatus] = useState<QueueStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    let mounted = true

    const loadTestRun = async () => {
      try {
        const testRunRes = await fetch(`/api/citation-checker/files/${fileId}/test-runs/${testRunId}`)
        
        if (testRunRes.ok) {
          const testRunData = await testRunRes.json()
          if (mounted) {
            setData(testRunData)
            setLoading(false)
            
            // Fetch queue status for each run using existing endpoints
            // First get jobId from validate-citations GET endpoint, then get job status
            if (testRunData.runs && testRunData.runs.length > 0) {
              const queueStatusPromises = testRunData.runs.map(async (run: TestRunResult) => {
                try {
                  // Get jobId from validate-citations GET endpoint
                  const validateRes = await fetch(`/api/citation-checker/checks/${run.id}/validate-citations`)
                  if (validateRes.ok) {
                    const validateData = await validateRes.json()
                    if (validateData.jobId) {
                      // Now get the job status
                      const jobRes = await fetch(`/api/citation-checker/jobs/${validateData.jobId}`)
                      if (jobRes.ok) {
                        const jobData = await jobRes.json()
                        
                        // Use current values from job (more reliable than queue item counts)
                        const tier2Completed = jobData.tier2Progress.current
                        const tier3Completed = jobData.tier3Progress.current
                        const tier2Total = jobData.tier2Progress.total
                        const tier3Total = jobData.tier3Progress.total
                        
                        // Calculate progress - if job is completed, show 100%
                        const isCompleted = jobData.status === 'completed'
                        const totalItems = tier2Total + tier3Total
                        const totalCompleted = tier2Completed + tier3Completed
                        const progress = isCompleted 
                          ? 100 
                          : totalItems > 0 
                            ? Math.round((totalCompleted / totalItems) * 100)
                            : 0
                        
                        return {
                          checkId: run.id,
                          version: run.version,
                          runNumber: run.runNumber,
                          hasJob: true,
                          jobStatus: jobData.status,
                          tier2Total,
                          tier2Completed,
                          tier2Pending: jobData.tier2Progress.pending,
                          tier2Processing: jobData.tier2Progress.processing,
                          tier3Total,
                          tier3Completed,
                          tier3Pending: jobData.tier3Progress.pending,
                          tier3Processing: jobData.tier3Progress.processing,
                          totalPending: jobData.tier2Progress.pending + jobData.tier3Progress.pending,
                          totalProcessing: jobData.tier2Progress.processing + jobData.tier3Progress.processing,
                          totalCompleted,
                          totalItems,
                          progress,
                        }
                      }
                    }
                  }
                  // No job found
                  return {
                    checkId: run.id,
                    version: run.version,
                    runNumber: run.runNumber,
                    hasJob: false,
                    jobStatus: null,
                    tier2Total: 0,
                    tier2Completed: 0,
                    tier2Pending: 0,
                    tier2Processing: 0,
                    tier3Total: 0,
                    tier3Completed: 0,
                    tier3Pending: 0,
                    tier3Processing: 0,
                    totalPending: 0,
                    totalProcessing: 0,
                    totalCompleted: 0,
                    totalItems: 0,
                    progress: 0,
                  }
                } catch (err) {
                  console.error(`Error fetching queue status for run ${run.runNumber}:`, err)
                  return null
                }
              })
              
              const queueStatuses = (await Promise.all(queueStatusPromises)).filter((s): s is QueueStatus => s !== null)
              const overallStats = {
                totalRuns: queueStatuses.length,
                runsWithJobs: queueStatuses.filter(s => s.hasJob).length,
                totalPending: queueStatuses.reduce((sum, s) => sum + s.totalPending, 0),
                totalProcessing: queueStatuses.reduce((sum, s) => sum + s.totalProcessing, 0),
                totalCompleted: queueStatuses.reduce((sum, s) => sum + s.totalCompleted, 0),
                totalItems: queueStatuses.reduce((sum, s) => sum + s.totalItems, 0),
                averageProgress: queueStatuses.length > 0
                  ? Math.round(queueStatuses.reduce((sum, s) => sum + s.progress, 0) / queueStatuses.length)
                  : 0,
              }
              
              if (mounted) {
                setQueueStatus({
                  testRunId,
                  queueStatus: queueStatuses,
                  overallStats,
                })
                
                // Stop polling if all runs are complete AND no active queue items
                const hasActiveQueue = overallStats.totalPending + overallStats.totalProcessing > 0
                if (testRunData.runsCompleted >= testRunData.testRunTotal && !hasActiveQueue && intervalRef.current) {
                  clearInterval(intervalRef.current)
                  intervalRef.current = null
                }
              }
            }
          }
        } else {
          const errorData = await testRunRes.json().catch(() => ({ error: "Unknown error" }))
          if (mounted) {
            setError(errorData.error || "Failed to load test run")
            setLoading(false)
          }
        }
      } catch (err) {
        console.error("Error loading test run:", err)
        if (mounted) {
          setError("Failed to load test run")
          setLoading(false)
        }
      }
    }

    // Initial load
    loadTestRun()

    // Poll for updates every 3 seconds
    intervalRef.current = setInterval(() => {
      loadTestRun()
    }, 3000)

    return () => {
      mounted = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [fileId, testRunId])

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading test run results...</div>
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

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">No test run data found</div>
      </div>
    )
  }

  const allRunsComplete = data.runsCompleted === data.testRunTotal
  const hasActiveQueue = queueStatus && queueStatus.overallStats.totalPending + queueStatus.overallStats.totalProcessing > 0

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-2xl font-semibold text-black">
              Test Run: {data.testRunId.slice(0, 8)}...
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Progress: {data.runsCompleted} of {data.testRunTotal} runs completed
            </p>
          </div>
          {!allRunsComplete && (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
              <span className="text-sm text-gray-600">Processing...</span>
            </div>
          )}
        </div>
        {!allRunsComplete && (
          <div className="mt-2 text-sm text-yellow-600">
            Some runs are still processing. Results will update automatically.
          </div>
        )}
      </div>

      {/* Queue Status Monitor */}
      {queueStatus && hasActiveQueue && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Queue Status Monitor
          </h3>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm font-semibold text-gray-900">
                {queueStatus.overallStats.averageProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${queueStatus.overallStats.averageProgress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-600">
              <span>
                Completed: {queueStatus.overallStats.totalCompleted} / {queueStatus.overallStats.totalItems}
              </span>
              <span>
                Pending: {queueStatus.overallStats.totalPending} • Processing: {queueStatus.overallStats.totalProcessing}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {queueStatus.queueStatus.map((status) => (
              <div
                key={status.checkId}
                className="p-3 bg-white border border-gray-200 rounded-md"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    Run {status.runNumber}
                  </span>
                  <span className="text-xs text-gray-500">
                    {status.progress}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      status.progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Tier 2:</span>
                    <span>
                      {status.tier2Completed}/{status.tier2Total}
                      {status.tier2Pending > 0 && ` (${status.tier2Pending} pending)`}
                      {status.tier2Processing > 0 && ` (${status.tier2Processing} processing)`}
                    </span>
                  </div>
                  {(status.tier3Total > 0 || status.tier3Pending > 0 || status.tier3Processing > 0 || status.tier3Completed > 0) && (
                    <div className="flex justify-between">
                      <span>Tier 3:</span>
                      <span>
                        {status.tier3Completed}/{status.tier3Total || status.tier3Pending + status.tier3Processing + status.tier3Completed}
                        {status.tier3Pending > 0 && ` (${status.tier3Pending} pending)`}
                        {status.tier3Processing > 0 && ` (${status.tier3Processing} processing)`}
                      </span>
                    </div>
                  )}
                  {status.jobStatus === 'completed' && (
                    <div className="text-xs font-medium text-green-600 mt-1">
                      ✓ Completed
                    </div>
                  )}
                  {!status.hasJob && (
                    <div className="text-yellow-600">Job not created yet</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Run #
              </th>
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
                Low Risk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Moderate Risk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Needs Review
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
            {data.runs.map((run) => (
              <tr
                key={run.id}
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      Run {run.runNumber}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-600">
                    v{run.version}
                  </span>
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
      {data.runs.length > 1 && (
        <>
          <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Consistency Analysis
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600 mb-1">Low Risk Range</div>
                <div className="text-lg font-semibold text-gray-900">
                  {data.statistics.validRange.min} - {data.statistics.validRange.max}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Avg: {data.statistics.validRange.avg.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Needs Review Range</div>
                <div className="text-lg font-semibold text-gray-900">
                  {data.statistics.invalidRange.min} - {data.statistics.invalidRange.max}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Avg: {data.statistics.invalidRange.avg.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Consistency Score</div>
                <div className="text-lg font-semibold text-gray-900">
                  {data.statistics.consistency}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Higher is better
                </div>
              </div>
            </div>
          </div>
          
          {/* Cost & Token Information - Development Panel */}
          <div className="mt-8 border-t-4 border-orange-300 pt-6">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-orange-900">Development Panel</h3>
                <p className="text-sm font-medium text-orange-800 mb-2">Token Usage & Estimated Cost</p>
                <p className="text-sm text-orange-700 mt-1">
                  LLM token usage and cost tracking for development purposes (not part of final product)
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-orange-600 font-medium mb-1">Total Tokens</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {data.statistics.totalTokens.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-orange-600 font-medium mb-1">Total Cost</div>
                  <div className="text-lg font-semibold text-gray-900">
                    ${data.statistics.totalCost.toFixed(4)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tier 2 Agent-Level Consistency Analysis */}
      {data.agentConsistency && data.agentConsistency.length > 0 && (
        <div className="mt-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Tier 2 Agent Consistency Analysis
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Measures how consistently each Tier 2 agent votes across multiple runs for the same citations.
            Higher consistency indicates more reliable agent behavior.
          </p>
          <div className="space-y-4">
            {data.agentConsistency.map((agent) => {
              const agentDisplayName = agent.agentName
                .replace(/_/g, ' ')
                .replace(/v\d+$/, '')
                .replace(/\b\w/g, l => l.toUpperCase())
              
              return (
                <div key={agent.agentName} className="p-4 bg-white border border-gray-200 rounded-md">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-900">{agentDisplayName}</h4>
                      <p className="text-xs text-gray-500">
                        Evaluated {agent.uniqueCitations} unique citations ({agent.multiRunCitations} appear in multiple runs)
                      </p>
                      {agent.multiRunCitations < agent.uniqueCitations && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {agent.uniqueCitations - agent.multiRunCitations} citation{agent.uniqueCitations - agent.multiRunCitations !== 1 ? 's' : ''} only evaluated once (not included in consistency)
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {agent.averageConsistency.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">Average Consistency</div>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          agent.averageConsistency >= 80 ? 'bg-green-500' :
                          agent.averageConsistency >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${agent.averageConsistency}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600 mb-1">Consistency Metrics</div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>Perfectly consistent:</span>
                          <span className="font-medium">
                            {agent.consistentCitations} / {agent.multiRunCitations} citations
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Perfect consistency rate:</span>
                          <span className="font-medium">
                            {agent.multiRunCitations > 0 ? ((agent.consistentCitations / agent.multiRunCitations) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">Reliability</div>
                      <div className="text-xs">
                        {agent.averageConsistency >= 90 && (
                          <span className="text-green-600 font-medium">✓ Highly Reliable</span>
                        )}
                        {agent.averageConsistency >= 70 && agent.averageConsistency < 90 && (
                          <span className="text-yellow-600 font-medium">⚠ Moderately Reliable</span>
                        )}
                        {agent.averageConsistency < 70 && (
                          <span className="text-red-600 font-medium">✗ Low Reliability</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tier 3 Agent-Level Consistency Analysis */}
      {data.tier3AgentConsistency && data.tier3AgentConsistency.length > 0 && (
        <div className="mt-8 p-6 bg-orange-50 border border-orange-200 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Tier 3 Agent Consistency Analysis
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Measures how consistently each Tier 3 agent votes across multiple runs for citations that were escalated to Tier 3.
            Consistency is calculated only for citations that appear in 2+ runs (same citation evaluated multiple times).
          </p>
          <div className="space-y-4">
            {data.tier3AgentConsistency.map((agent) => {
              const agentDisplayName = agent.agentName
                .replace(/tier3_/g, '')
                .replace(/_/g, ' ')
                .replace(/v\d+$/, '')
                .replace(/\b\w/g, l => l.toUpperCase())
              
              return (
                <div key={agent.agentName} className="p-4 bg-white border border-gray-200 rounded-md">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-900">{agentDisplayName}</h4>
                      <p className="text-xs text-gray-500">
                        Evaluated {agent.uniqueCitations} unique citations ({agent.multiRunCitations} appear in multiple runs)
                      </p>
                      {agent.multiRunCitations < agent.uniqueCitations && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {agent.uniqueCitations - agent.multiRunCitations} citation{agent.uniqueCitations - agent.multiRunCitations !== 1 ? 's' : ''} only evaluated once (not included in consistency)
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {agent.averageConsistency.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">Average Consistency</div>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          agent.averageConsistency >= 80 ? 'bg-green-500' :
                          agent.averageConsistency >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${agent.averageConsistency}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600 mb-1">Consistency Metrics</div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>Perfectly consistent:</span>
                          <span className="font-medium">
                            {agent.consistentCitations} / {agent.multiRunCitations} citations
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Perfect consistency rate:</span>
                          <span className="font-medium">
                            {agent.multiRunCitations > 0 ? ((agent.consistentCitations / agent.multiRunCitations) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">Reliability</div>
                      <div className="text-xs">
                        {agent.averageConsistency >= 90 && (
                          <span className="text-green-600 font-medium">✓ Highly Reliable</span>
                        )}
                        {agent.averageConsistency >= 70 && agent.averageConsistency < 90 && (
                          <span className="text-yellow-600 font-medium">⚠ Moderately Reliable</span>
                        )}
                        {agent.averageConsistency < 70 && (
                          <span className="text-red-600 font-medium">✗ Low Reliability</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex space-x-4 items-center flex-wrap gap-2">
        <button
          onClick={() => router.push(`/citation-checker/${fileId}/validation-runs`)}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm"
        >
          View All Validation Runs
        </button>
        <a
          href={`/api/citation-checker/files/${fileId}/test-runs/${testRunId}/export`}
          download={`test-run-${testRunId}-export.json`}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 inline-flex items-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export JSON (T2 & T3 Data)
        </a>
        {data.sourceCheckId && (
          <a
            href={`/api/citation-checker/checks/${data.sourceCheckId}`}
            download={`test-run-${testRunId}-source.json`}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 inline-flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Source JSON
          </a>
        )}
        <button
          onClick={() => router.push(`/citation-checker/${fileId}/test-run/setup`)}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
        >
          Run Another Test
        </button>
        <button
          onClick={() => window.open(`/api/citation-checker/files/${fileId}/heavy-analysis/compare?testRunId=${testRunId}`, '_blank')}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
        >
          Compare Heavy Analysis
        </button>
      </div>
    </div>
  )
}

