"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface HeavyAnalysisResultsPageProps {
  fileId: string
  runId: string
}

interface RunData {
  runId: string
  fileId: string
  totalRuns: number
  runs: Array<{
    checkId: string
    version: number
    runNumber: number
    status: string
    createdAt: string
    updatedAt: string
  }>
  comparisons: Array<{
    citationId: string
    citationText: string
    runs: Array<{
      runNumber: number
      riskLevel: string
      caseFit: string
      caseLink?: string
    }>
    consistency: {
      riskLevelAgreement: number
      mostCommonRiskLevel: string
      riskLevelDistribution: Record<string, number>
      caseLinkConsistency: boolean
      averageCaseFitLength: number
    }
  }>
  statistics: {
    totalCitations: number
    citationsWithFullAgreement: number
    citationsWithFullAgreementRate: number
    citationsWithLinkConsistency: number
    citationsWithLinkConsistencyRate: number
    averageAgreementRate: number
    overallRiskDistribution: Record<string, number>
    totalCost: string
  }
}

export function HeavyAnalysisResultsPage({ fileId, runId }: HeavyAnalysisResultsPageProps) {
  const router = useRouter()
  const [data, setData] = useState<RunData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(`/api/citation-checker/files/${fileId}/heavy-analysis/${runId}`)
        
        if (res.ok) {
          const runData = await res.json()
          setData(runData)
        } else {
          const errorData = await res.json().catch(() => ({ error: "Unknown error" }))
          setError(errorData.error || errorData.message || "Failed to load results")
        }
      } catch (err) {
        console.error("Error loading heavy analysis results:", err)
        setError("Failed to load results. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [fileId, runId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading results...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800 text-sm">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-yellow-800 text-sm">No data available</p>
      </div>
    )
  }

  // Extract domains from case links and count citations per domain
  const extractDomain = (url: string): string | null => {
    if (!url || typeof url !== 'string') return null
    
    const trimmed = url.trim()
    
    // Skip if it's just a number or very short (likely not a domain)
    if (/^\d+$/.test(trimmed) || trimmed.length < 3) {
      return null
    }
    
    // Skip if it looks like a citation format (e.g., "144 U.S. 601" or "601 F.2d 517")
    if (/^\d+\s+[A-Z]/.test(trimmed) || /^\d+\s+\d+/.test(trimmed)) {
      return null
    }
    
    try {
      // Handle URLs with and without protocol
      let urlString = trimmed
      if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = 'https://' + urlString
      }
      const urlObj = new URL(urlString)
      const hostname = urlObj.hostname.replace('www.', '').toLowerCase()
      
      // Validate it looks like a domain (must have at least one dot and TLD)
      if (hostname.includes('.') && hostname.split('.').length >= 2) {
        const parts = hostname.split('.')
        const tld = parts[parts.length - 1]
        // TLD should be at least 2 characters and not all numbers
        if (tld.length >= 2 && !/^\d+$/.test(tld)) {
          // Check that the domain part isn't just numbers
          const domainPart = parts[0]
          if (domainPart && !/^\d+$/.test(domainPart)) {
            return hostname
          }
        }
      }
      return null
    } catch {
      // If it's not a valid URL, try to extract domain-like patterns with strict validation
      // Must match: optional protocol, optional www, domain with TLD
      const domainPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,})/i
      const match = trimmed.match(domainPattern)
      if (match && match[1]) {
        const domain = match[1].toLowerCase()
        const parts = domain.split('.')
        // Must have at least domain and TLD, and TLD shouldn't be just numbers
        if (parts.length >= 2) {
          const tld = parts[parts.length - 1]
          const domainPart = parts[0]
          if (tld.length >= 2 && !/^\d+$/.test(tld) && domainPart && !/^\d+$/.test(domainPart)) {
            return domain
          }
        }
      }
      return null
    }
  }

  const domainCounts = new Map<string, Set<string>>() // domain -> set of citation IDs
  const citationsWithLinks = new Set<string>() // Citations that have at least one valid domain
  const citationsWithoutLinks = new Set<string>() // Citations with no case links at all
  const citationsWithUnparseableLinks = new Set<string>() // Citations with links that couldn't be parsed
  const unparseableLinks = new Map<string, string[]>() // citationId -> array of unparseable links
  
  for (const comparison of data.comparisons) {
    // Collect unique domains from all runs for this citation
    const citationDomains = new Set<string>()
    const hasAnyLink = comparison.runs.some(r => r.caseLink)
    const unparseable: string[] = []
    
    for (const run of comparison.runs) {
      if (run.caseLink) {
        const domain = extractDomain(run.caseLink)
        if (domain) {
          citationDomains.add(domain)
          citationsWithLinks.add(comparison.citationId)
        } else {
          // Track unparseable links
          unparseable.push(run.caseLink)
        }
      }
    }
    
    // Track citations without any links
    if (!hasAnyLink) {
      citationsWithoutLinks.add(comparison.citationId)
    } else if (unparseable.length > 0 && citationDomains.size === 0) {
      // Has links but none could be parsed
      citationsWithUnparseableLinks.add(comparison.citationId)
      unparseableLinks.set(comparison.citationId, unparseable)
    }
    
    // Count this citation for each domain it references
    for (const domain of citationDomains) {
      if (!domainCounts.has(domain)) {
        domainCounts.set(domain, new Set())
      }
      domainCounts.get(domain)!.add(comparison.citationId)
    }
  }

  // Convert to sorted array for display, filtering out invalid domains
  const domainStats = Array.from(domainCounts.entries())
    .filter(([domain]) => {
      if (!domain || domain.length < 3) return false
      // Must not be just numbers
      if (/^\d+$/.test(domain)) return false
      // Must have at least one dot (proper domain structure)
      if (!domain.includes('.')) return false
      // Must have valid domain structure (domain.tld)
      const parts = domain.split('.')
      if (parts.length < 2) return false
      const tld = parts[parts.length - 1]
      const domainPart = parts[0]
      // TLD must be at least 2 chars and not all numbers
      if (tld.length < 2 || /^\d+$/.test(tld)) return false
      // Domain part must not be just numbers
      if (!domainPart || /^\d+$/.test(domainPart)) return false
      return true
    })
    .map(([domain, citationIds]) => ({
      domain,
      count: citationIds.size,
    }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-black mb-2">
          Heavy Analysis Multi-Run Results
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          Comparing {data.totalRuns} run(s) to assess consistency and accuracy.
        </p>
      </div>

      {/* Statistics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="text-sm text-blue-600 font-medium">Total Citations</div>
          <div className="text-2xl font-bold text-blue-900">{data.statistics.totalCitations}</div>
        </div>
        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="text-sm text-green-600 font-medium">Full Agreement</div>
          <div className="text-2xl font-bold text-green-900">
            {data.statistics.citationsWithFullAgreement} ({Math.round(data.statistics.citationsWithFullAgreementRate * 100)}%)
          </div>
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-md">
          <div className="text-sm text-purple-600 font-medium">Total Cost</div>
          <div className="text-2xl font-bold text-purple-900">${data.statistics.totalCost}</div>
        </div>
      </div>

      {/* Risk Level Distribution */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
        <h4 className="font-medium text-black mb-3">Overall Risk Distribution</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-600">Low Risk</div>
            <div className="text-xl font-semibold text-green-700">{data.statistics.overallRiskDistribution['Low Risk']}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Medium Risk</div>
            <div className="text-xl font-semibold text-yellow-700">{data.statistics.overallRiskDistribution['Medium Risk']}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Human Review</div>
            <div className="text-xl font-semibold text-red-700">{data.statistics.overallRiskDistribution['human review']}</div>
          </div>
        </div>
      </div>

      {/* Consistency Metrics */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
        <h4 className="font-medium text-black mb-3">Consistency Metrics</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Average Agreement Rate:</span>
            <span className="font-medium">{Math.round(data.statistics.averageAgreementRate * 100)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Citations with Link Consistency:</span>
            <span className="font-medium">{data.statistics.citationsWithLinkConsistency} ({Math.round(data.statistics.citationsWithLinkConsistencyRate * 100)}%)</span>
          </div>
        </div>
      </div>

      {/* Domain Usage Statistics */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
        <h4 className="font-medium text-black mb-3">Citation Verification Domains</h4>
        <p className="text-sm text-gray-600 mb-3">
          Domains used in case links across all runs, with citation counts.
        </p>
        
        {domainStats.length > 0 ? (
          <>
            <div className="space-y-2">
              {domainStats.map(({ domain, count }) => (
                <div key={domain} className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-black">{domain}</span>
                  </div>
                  <div className="text-sm font-semibold text-indigo-600">
                    {count} citation{count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Total unique domains: {domainStats.length}
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-600 italic">No valid domains found in case links.</div>
        )}
        
        {/* Summary Statistics */}
        <div className="mt-4 pt-4 border-t border-gray-300">
          <h5 className="text-sm font-medium text-black mb-2">Link Coverage Summary</h5>
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Citations with valid domain links:</span>
              <span className="font-medium text-green-700">{citationsWithLinks.size} / {data.statistics.totalCitations}</span>
            </div>
            <div className="flex justify-between">
              <span>Citations without any case links:</span>
              <span className="font-medium text-yellow-700">{citationsWithoutLinks.size} / {data.statistics.totalCitations}</span>
            </div>
            <div className="flex justify-between">
              <span>Citations with unparseable links:</span>
              <span className="font-medium text-orange-700">{citationsWithUnparseableLinks.size} / {data.statistics.totalCitations}</span>
            </div>
            {citationsWithUnparseableLinks.size > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  Show examples of unparseable links ({citationsWithUnparseableLinks.size} citations)
                </summary>
                <div className="mt-2 space-y-1 pl-2 border-l-2 border-gray-200">
                  {Array.from(citationsWithUnparseableLinks).slice(0, 10).map(citationId => {
                    const links = unparseableLinks.get(citationId) || []
                    const comparison = data.comparisons.find(c => c.citationId === citationId)
                    return (
                      <div key={citationId} className="text-xs">
                        <div className="font-medium text-gray-700">
                          {comparison?.citationText || citationId}:
                        </div>
                        <div className="text-gray-500 ml-2">
                          {links.slice(0, 3).map((link, i) => (
                            <div key={`${citationId}-link-${i}`} className="truncate max-w-md" title={link}>
                              {link}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {citationsWithUnparseableLinks.size > 10 && (
                    <div className="text-xs text-gray-400 italic">
                      ... and {citationsWithUnparseableLinks.size - 10} more
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {/* Citation Comparisons */}
      <div>
        <h4 className="font-medium text-black mb-3">Citation-by-Citation Comparison</h4>
        <div className="space-y-4">
          {data.comparisons.map((comparison) => (
            <div key={comparison.citationId} className="p-4 border border-gray-200 rounded-md">
              <div className="mb-2">
                <div className="font-medium text-black">{comparison.citationText}</div>
                <div className="text-xs text-gray-500">ID: {comparison.citationId}</div>
              </div>
              
              <div className="mt-3 space-y-2">
                <div className="text-sm">
                  <span className="text-gray-600">Agreement: </span>
                  <span className={`font-medium ${comparison.consistency.riskLevelAgreement === 1.0 ? 'text-green-700' : comparison.consistency.riskLevelAgreement >= 0.8 ? 'text-yellow-700' : 'text-red-700'}`}>
                    {Math.round(comparison.consistency.riskLevelAgreement * 100)}%
                  </span>
                  <span className="text-gray-600"> • Most Common: </span>
                  <span className="font-medium">{comparison.consistency.mostCommonRiskLevel}</span>
                </div>
                
                <div className="text-xs text-gray-500">
                  Distribution: Low Risk: {comparison.consistency.riskLevelDistribution['Low Risk']}, 
                  Medium Risk: {comparison.consistency.riskLevelDistribution['Medium Risk']}, 
                  Human Review: {comparison.consistency.riskLevelDistribution['human review']}
                </div>

                <details className="mt-2">
                  <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                    View all {data.totalRuns} run results
                  </summary>
                  <div className="mt-2 space-y-2 pl-4 border-l-2 border-gray-200">
                    {comparison.runs.map((run, runIndex) => (
                      <div key={`${comparison.citationId}-run-${run.runNumber}-${runIndex}`} className="text-sm">
                        <div className="font-medium">Run {run.runNumber}: {run.riskLevel}</div>
                        <div className="text-xs text-gray-600 mt-1">{run.caseFit}</div>
                        {run.caseLink && (
                          <div className="text-xs text-blue-600 mt-1">
                            <a href={run.caseLink} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {run.caseLink}
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex space-x-4">
        <button
          onClick={() => router.push(`/citation-checker/${fileId}/heavy-analysis`)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
        >
          Run Another Analysis
        </button>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm"
        >
          Back
        </button>
      </div>
    </div>
  )
}

