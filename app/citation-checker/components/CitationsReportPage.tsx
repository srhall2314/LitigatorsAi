"use client"

import { useState, useEffect, useRef } from "react"
import { ContextPanel } from "./ContextPanel"
import { CitationValidation, ValidationVerdict } from "@/types/citation-json"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

interface CitationsReportPageProps {
  fileId: string
}

interface CitationWithValidation {
  id: string
  citationText: string
  citationType: string
  validation?: CitationValidation
  tier_3?: any
  extractedComponents?: any
  paragraphId?: string
  paragraphText?: string
}

interface DocumentMetadata {
  filename: string
  uploadDate: string
  documentType?: string
  totalCitations: number
  identificationMethod?: string
}

export function CitationsReportPage({ fileId }: CitationsReportPageProps) {
  const [checkId, setCheckId] = useState<string | null>(null)
  const [citations, setCitations] = useState<CitationWithValidation[]>([])
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const fileRes = await fetch(`/api/citation-checker/files`)
        if (fileRes.ok) {
          const files = await fileRes.json()
          const file = files.find((f: any) => f.id === fileId)
          if (file?.citationChecks?.[0]) {
            const currentCheckId = file.citationChecks[0].id
            setCheckId(currentCheckId)
            
            const checkRes = await fetch(`/api/citation-checker/checks/${currentCheckId}`)
            if (checkRes.ok) {
              const data = await checkRes.json()
              if (data.jsonData?.document) {
                const document = data.jsonData.document
                const citationsList = document.citations || []
                const content = document.content || []
                
                // Set metadata
                if (document.metadata) {
                  setMetadata(document.metadata)
                }
                
                // Enrich citations with paragraph context
                const enrichedCitations = citationsList.map((citation: any) => {
                  let paragraphId: string | undefined
                  let paragraphText: string | undefined
                  
                  for (const para of content) {
                    if (para.text && para.text.includes(`[CITATION:${citation.id}]`)) {
                      paragraphId = para.id
                      paragraphText = para.text
                        .replace(/\[CITATION:[^\]]+\]/g, '')
                        .replace(/\[\/CITATION:[^\]]+\]/g, '')
                        .trim()
                      break
                    }
                  }
                  
                  return {
                    ...citation,
                    paragraphId,
                    paragraphText,
                  }
                })
                
                setCitations(enrichedCitations)
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load report data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [fileId])

  // Handler to reload citation data
  const reloadCitationData = async () => {
    if (!checkId) return
    
    try {
      const checkRes = await fetch(`/api/citation-checker/checks/${checkId}`)
      if (checkRes.ok) {
        const data = await checkRes.json()
        if (data.jsonData?.document) {
          const document = data.jsonData.document
          const citationsList = document.citations || []
          const content = document.content || []
          
          // Enrich citations with paragraph context
          const enrichedCitations = citationsList.map((citation: any) => {
            let paragraphId: string | undefined
            let paragraphText: string | undefined
            
            for (const para of content) {
              if (para.text && para.text.includes(`[CITATION:${citation.id}]`)) {
                paragraphId = para.id
                paragraphText = para.text
                  .replace(/\[CITATION:[^\]]+\]/g, '')
                  .replace(/\[\/CITATION:[^\]]+\]/g, '')
                  .trim()
                break
              }
            }
            
            return {
              ...citation,
              paragraphId,
              paragraphText,
            }
          })
          
          setCitations(enrichedCitations)
        }
      }
    } catch (err) {
      console.error('Failed to reload citation data:', err)
    }
  }

  // Handler to reprocess a single citation
  const handleReprocessCitation = async (citationId: string) => {
    if (!checkId) return
    
    setReprocessingId(citationId)
    try {
      const res = await fetch(`/api/citation-checker/checks/${checkId}/citations/${citationId}/revalidate`, {
        method: 'POST'
      })
      
      if (res.ok) {
        // Reload check data to refresh UI
        await reloadCitationData()
      } else {
        const errorData = await res.json()
        alert(`Failed to reprocess citation: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error reprocessing citation:', error)
      alert('Failed to reprocess citation. Please try again.')
    } finally {
      setReprocessingId(null)
    }
  }

  // Calculate statistics using new validation structure
  // Tier 3 verdicts override Tier 2 when present
  const citationsWithValidation = citations.filter(c => c.validation)
  const validCount = citationsWithValidation.filter(c => {
    // If Tier 3 exists and marks as valid, count as valid
    if (c.tier_3 && (c.tier_3.verdict === "VERIFIED_REAL" || c.tier_3.verdict === "LIKELY_REAL")) {
      return true
    }
    // Otherwise use Tier 2 recommendation
    return c.validation?.consensus.recommendation === "CITATION_LIKELY_VALID"
  }).length
  const invalidCount = citationsWithValidation.filter(c => {
    // If Tier 3 exists and marks as invalid, count as invalid
    if (c.tier_3 && c.tier_3.verdict === "LIKELY_FABRICATED") {
      return true
    }
    // Otherwise use Tier 2 recommendation
    return c.validation?.consensus.recommendation === "CITATION_LIKELY_HALLUCINATED"
  }).length
  const uncertainCount = citationsWithValidation.filter(c => {
    // If Tier 3 exists, only count as uncertain if Tier 3 verdict is needs human review
    if (c.tier_3) {
      return c.tier_3.verdict === "NEEDS_HUMAN_REVIEW"
    }
    // Otherwise use Tier 2 recommendation
    return c.validation?.consensus.recommendation === "CITATION_UNCERTAIN"
  }).length
  const tier3Count = citations.filter(c => c.tier_3).length
  const tier3ValidatedCount = citations.filter(c => 
    c.tier_3 && (c.tier_3.verdict === "VERIFIED_REAL" || c.tier_3.verdict === "LIKELY_REAL")
  ).length

  // Sort citations: Invalid → Uncertain → Valid
  const sortedCitations = [...citationsWithValidation].sort((a, b) => {
    const aRec = a.validation?.consensus.recommendation || ''
    const bRec = b.validation?.consensus.recommendation || ''
    
    const order = {
      'CITATION_LIKELY_HALLUCINATED': 0,
      'CITATION_UNCERTAIN': 1,
      'CITATION_LIKELY_VALID': 2,
    }
    
    return (order[aRec as keyof typeof order] ?? 3) - (order[bRec as keyof typeof order] ?? 3)
  })

  // Group citations by paragraph for summary
  const citationsByParagraph = new Map<string, CitationWithValidation[]>()
  citationsWithValidation.forEach(citation => {
    if (citation.paragraphId) {
      if (!citationsByParagraph.has(citation.paragraphId)) {
        citationsByParagraph.set(citation.paragraphId, [])
      }
      citationsByParagraph.get(citation.paragraphId)!.push(citation)
    }
  })

  // Helper to scroll to citation detail
  const scrollToCitation = (citationId: string) => {
    const element = document.getElementById(`citation-${citationId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Helper to get stoplight color
  const getStoplightColor = (recommendation: string) => {
    if (recommendation === "CITATION_LIKELY_VALID") return "bg-green-500"
    if (recommendation === "CITATION_LIKELY_HALLUCINATED") return "bg-red-500"
    return "bg-yellow-500"
  }

  // Helper functions
  const getVerdictColor = (verdict: ValidationVerdict) => {
    if (verdict === "VALID") return "bg-green-500"
    if (verdict === "INVALID") return "bg-red-500"
    return "bg-yellow-500"
  }

  const getAgentDisplayName = (agentName: string) => {
    const names: Record<string, string> = {
      'citation_authority_validator_v1': 'Agent: Citation Authority Validator',
      'case_ecology_validator_v1': 'Agent: Case Ecology Validator',
      'temporal_reality_validator_v1': 'Agent: Temporal Reality Validator',
      'legal_knowledge_validator_v1': 'Agent: Legal Knowledge Validator',
      'reality_assessment_expert_v1': 'Agent: Reality Assessment Expert',
    }
    return names[agentName] || `Agent: ${agentName}`
  }

  const formatConfidenceScore = (score: number) => {
    return (score * 100).toFixed(0)
  }

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // Show a temporary success message
      setCopiedStates(prev => ({ ...prev, [key]: true }))
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [key]: false }))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      alert('Failed to copy to clipboard')
    }
  }

  const handleDownloadPDF = async () => {
    if (!reportRef.current) {
      alert('Report content not available. Please wait for the page to load.')
      return
    }

    setGeneratingPDF(true)
    
    try {
      // Store reference to avoid null issues
      const reportElement = reportRef.current
      if (!reportElement) {
        throw new Error('Report element not found')
      }

      // Hide buttons and context panel for PDF
      const buttons = document.querySelectorAll('.pdf-hide')
      const originalDisplays: string[] = []
      buttons.forEach(btn => {
        const element = btn as HTMLElement
        originalDisplays.push(element.style.display)
        element.style.display = 'none'
      })

      // Use requestAnimationFrame to allow UI to update
      await new Promise(resolve => requestAnimationFrame(resolve))

      // Wait a bit more to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100))

      // Double-check element still exists
      if (!reportRef.current) {
        throw new Error('Report element was removed during PDF generation')
      }

      // Optimize canvas settings for better performance
      const canvas = await html2canvas(reportRef.current, {
        scale: 1.5, // Reduced from 2 for better performance
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        removeContainer: false,
        allowTaint: false,
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
          // Ensure cloned document has proper styling
          const clonedElement = clonedDoc.querySelector('[data-report-content]')
          if (clonedElement) {
            (clonedElement as HTMLElement).style.overflow = 'visible'
          }
        }
      })

      const imgData = canvas.toDataURL('image/png', 0.95)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      
      // Convert pixels to mm (assuming 96 DPI)
      const pxToMm = 0.264583
      const imgWidthMm = (canvas.width * pxToMm) / 1.5 // Account for scale
      const imgHeightMm = (canvas.height * pxToMm) / 1.5
      
      // Calculate how many pages we need
      const imgAspectRatio = canvas.width / canvas.height
      const pageAspectRatio = pdfWidth / pdfHeight
      
      // Scale image to fit page width
      const scaledWidth = pdfWidth - 20 // Leave margins
      const scaledHeight = (scaledWidth / imgAspectRatio)
      
      // Calculate number of pages needed
      const totalPages = Math.ceil(scaledHeight / (pdfHeight - 20))
      
      // Add image to PDF, splitting across pages
      let yPosition = 10 // Start with top margin
      let sourceY = 0
      
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage()
          yPosition = 10 // Reset to top for new page
        }
        
        // Calculate how much of the image fits on this page
        const pageHeight = pdfHeight - 20 // Leave margins
        const sourceHeight = (pageHeight / scaledHeight) * canvas.height
        
        // Create a temporary canvas for this page's portion
        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = canvas.width
        pageCanvas.height = Math.min(sourceHeight, canvas.height - sourceY)
        const pageCtx = pageCanvas.getContext('2d')
        
        if (pageCtx) {
          pageCtx.drawImage(
            canvas,
            0, sourceY, canvas.width, pageCanvas.height, // Source
            0, 0, pageCanvas.width, pageCanvas.height // Destination
          )
          
          const pageImgData = pageCanvas.toDataURL('image/png', 0.95)
          const pageImgHeight = (pageCanvas.height * pxToMm) / 1.5
          const pageScaledHeight = Math.min(pageHeight, pageImgHeight)
          
          pdf.addImage(
            pageImgData,
            'PNG',
            10, // x offset (left margin)
            yPosition,
            scaledWidth,
            pageScaledHeight
          )
          
          sourceY += pageCanvas.height
          
          // Break if we've processed all the image
          if (sourceY >= canvas.height) {
            break
          }
        }
      }

      const filename = metadata?.filename 
        ? `CC-${metadata.filename.replace(/\.[^/.]+$/, '')}-${new Date().toISOString().split('T')[0]}.pdf`
        : `CC-Report-${new Date().toISOString().split('T')[0]}.pdf`

      pdf.save(filename)

      // Restore buttons
      buttons.forEach((btn, index) => {
        const element = btn as HTMLElement
        element.style.display = originalDisplays[index] || ''
      })
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}. The page may be too large. Try printing instead.`)
      
      // Restore buttons on error
      const buttons = document.querySelectorAll('.pdf-hide')
      buttons.forEach(btn => {
        ;(btn as HTMLElement).style.display = ''
      })
    } finally {
      setGeneratingPDF(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Loading report data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* PDF Generation Overlay */}
      {generatingPDF && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 text-center max-w-md">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-900 text-lg font-semibold mb-2">Generating PDF...</p>
            <p className="text-gray-600 text-sm">This may take a moment for large reports</p>
          </div>
        </div>
      )}
      
      {/* Action Buttons at Top */}
      <div className="flex space-x-4 pdf-hide pb-4 border-b border-gray-200">
        <button
          onClick={handleDownloadPDF}
          disabled={generatingPDF}
          className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generatingPDF ? "Generating PDF..." : "Download PDF Report"}
        </button>
        <button
          onClick={() => window.print()}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Print Report
        </button>
        <button
          onClick={() => window.location.href = `/citation-checker`}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Start New Check
        </button>
      </div>
      
      {/* Document Metadata */}
      {metadata && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Document Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs font-medium text-blue-700 mb-1">File Name</div>
              <div className="text-gray-900 font-medium">{metadata.filename}</div>
            </div>
            {metadata.documentType && (
              <div>
                <div className="text-xs font-medium text-blue-700 mb-1">Document Type</div>
                <div className="text-gray-900 font-medium capitalize">{metadata.documentType}</div>
              </div>
            )}
            <div>
              <div className="text-xs font-medium text-blue-700 mb-1">Upload Date</div>
              <div className="text-gray-900">{new Date(metadata.uploadDate).toLocaleDateString()}</div>
            </div>
            {metadata.identificationMethod && (
              <div>
                <div className="text-xs font-medium text-blue-700 mb-1">Identification Method</div>
                <div className="text-gray-900 capitalize">{metadata.identificationMethod}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Statistics */}
      <div className="p-6 bg-gray-50 rounded-md" ref={reportRef} data-report-content>
        <h3 className="text-lg font-semibold text-black mb-4">
          Citation Validation Report
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div>
            <div className="text-sm text-gray-600">Total Citations</div>
            <div className="text-2xl font-bold text-black">{citations.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Valid</div>
            <div className="text-2xl font-bold text-green-600">{validCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Uncertain</div>
            <div className="text-2xl font-bold text-yellow-600">{uncertainCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Invalid</div>
            <div className="text-2xl font-bold text-red-600">{invalidCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Tier 3 Reviewed</div>
            <div className="text-2xl font-bold text-purple-600">{tier3Count}</div>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="font-semibold text-black mb-2">Summary</h4>
          <p className="text-black text-sm">
            Your document contains {citations.length} citation{citations.length !== 1 ? 's' : ''}. 
            {validCount > 0 && ` ${validCount} citation${validCount !== 1 ? 's were' : ' was'} validated successfully.`}
            {tier3ValidatedCount > 0 && ` ${tier3ValidatedCount} citation${tier3ValidatedCount !== 1 ? 's were' : ' was'} validated by Tier 3 review.`}
            {uncertainCount > 0 && ` ${uncertainCount} citation${uncertainCount !== 1 ? 's have' : ' has'} uncertain validation results.`}
            {invalidCount > 0 && ` ${invalidCount} citation${invalidCount !== 1 ? 's were' : ' was'} flagged as potentially invalid.`}
            {tier3Count > 0 && ` ${tier3Count} citation${tier3Count !== 1 ? 's received' : ' received'} deep investigation (Tier 3) review.`}
          </p>
        </div>

        {/* Citation Summary by Paragraph */}
        {citationsByParagraph.size > 0 && (
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Citation Summary by Paragraph</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {Array.from(citationsByParagraph.entries()).map(([paragraphId, paraCitations]) => (
                paraCitations.map((citation) => {
                  // Dot = Tier 2 recommendation (always shown)
                  const recommendation = citation.validation?.consensus.recommendation || ''
                  const dotColor = getStoplightColor(recommendation)
                  
                  // Square badge = Tier 3 verdict (only if Tier 3 exists)
                  let badgeElement = null
                  if (citation.tier_3) {
                    const tier3Verdict = citation.tier_3.verdict
                    let badgeStatus: 'valid' | 'invalid' | 'uncertain'
                    let badgeLabel: string
                    
                    if (tier3Verdict === "VERIFIED_REAL" || tier3Verdict === "LIKELY_REAL") {
                      badgeStatus = 'valid'
                      badgeLabel = "V"
                    } else if (tier3Verdict === "LIKELY_FABRICATED") {
                      badgeStatus = 'invalid'
                      badgeLabel = "I"
                    } else {
                      // NEEDS_HUMAN_REVIEW or other
                      badgeStatus = 'uncertain'
                      badgeLabel = "U"
                    }
                    
                    badgeElement = (
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded flex-shrink-0 ${
                        badgeStatus === 'valid' ? 'bg-green-100 text-green-800' :
                        badgeStatus === 'invalid' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {badgeLabel}
                      </span>
                    )
                  }
                  
                  return (
                    <button
                      key={citation.id}
                      onClick={() => scrollToCitation(citation.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
                    >
                      <span className="text-xs font-medium text-gray-600 w-20 flex-shrink-0">
                        {paragraphId}
                      </span>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                      {badgeElement}
                      <span className="text-gray-700 flex-1 truncate">
                        {citation.citationText}
                      </span>
                    </button>
                  )
                })
              ))}
            </div>
          </div>
        )}

        {/* Citation Details */}
        {sortedCitations.length > 0 && (
          <div className="mt-8">
            <h4 className="text-lg font-semibold text-black mb-4">Citation Details</h4>
            <div className="space-y-6">
              {sortedCitations.map((citation) => {
                const validation = citation.validation!
                const consensus = validation.consensus
                
                return (
                  <div
                    id={`citation-${citation.id}`}
                    key={citation.id}
                    className="p-6 border border-gray-200 rounded-lg bg-white shadow-sm scroll-mt-4"
                  >
                    {/* Citation Header */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {/* Reprocess Button */}
                            <button
                              onClick={() => handleReprocessCitation(citation.id)}
                              disabled={reprocessingId === citation.id}
                              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                                reprocessingId === citation.id
                                  ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                              }`}
                              title="Reprocess this citation for Tier 2 and Tier 3 validation"
                            >
                              {reprocessingId === citation.id ? (
                                <span className="flex items-center gap-1">
                                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Reprocessing...
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  Reprocess Citation
                                </span>
                              )}
                            </button>
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              citation.citationType === 'case' ? 'bg-blue-100 text-blue-800' :
                              citation.citationType === 'statute' ? 'bg-green-100 text-green-800' :
                              citation.citationType === 'regulation' ? 'bg-purple-100 text-purple-800' :
                              citation.citationType === 'rule' ? 'bg-orange-100 text-orange-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {citation.citationType?.toUpperCase() || 'UNKNOWN'}
                            </span>
                            
                            {/* Show Tier 3 verdict if it exists and overrides Tier 2 */}
                            {citation.tier_3 && (
                              citation.tier_3.verdict === "VERIFIED_REAL" || citation.tier_3.verdict === "LIKELY_REAL" ? (
                                <>
                                  <span className="px-3 py-1 text-sm font-semibold rounded bg-green-100 text-green-800 border-2 border-green-300">
                                    ✓ VALID (Tier 3)
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                    Updated by Tier 3
                                  </span>
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                                    consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    Tier 2: {consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? "INVALID" : "UNCERTAIN"}
                                  </span>
                                </>
                              ) : citation.tier_3.verdict === "LIKELY_FABRICATED" ? (
                                <>
                                  <span className="px-3 py-1 text-sm font-semibold rounded bg-red-100 text-red-800 border-2 border-red-300">
                                    INVALID (Tier 3)
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                    Confirmed by Tier 3
                                  </span>
                                </>
                              ) : citation.tier_3.verdict === "NEEDS_HUMAN_REVIEW" ? (
                                <>
                                  <span className="px-3 py-1 text-sm font-semibold rounded bg-orange-100 text-orange-800 border-2 border-orange-300">
                                    NEEDS REVIEW (Tier 3)
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                    Requires Human Review
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className={`px-3 py-1 text-sm font-semibold rounded ${
                                    consensus.recommendation === "CITATION_LIKELY_VALID" ? 'bg-green-100 text-green-800' :
                                    consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {consensus.recommendation === "CITATION_LIKELY_VALID" ? "VALID" :
                                     consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? "INVALID" :
                                     "UNCERTAIN"}
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-orange-100 text-orange-800">
                                    Tier 3: {citation.tier_3.verdict.replace(/_/g, ' ')}
                                  </span>
                                </>
                              )
                            )}
                            
                            {/* Default Tier 2 status if no Tier 3 */}
                            {!citation.tier_3 && (
                              <span className={`px-3 py-1 text-sm font-semibold rounded ${
                                consensus.recommendation === "CITATION_LIKELY_VALID" ? 'bg-green-100 text-green-800' :
                                consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {consensus.recommendation === "CITATION_LIKELY_VALID" ? "VALID" :
                                 consensus.recommendation === "CITATION_LIKELY_HALLUCINATED" ? "INVALID" :
                                 "UNCERTAIN"}
                              </span>
                            )}
                            
                            {consensus.tier_3_trigger && !citation.tier_3 && (
                              <span className="px-2 py-1 text-xs font-medium rounded bg-orange-100 text-orange-800">
                                TIER 3 TRIGGERED
                              </span>
                            )}
                          </div>
                          <p className="text-base font-medium text-gray-900 mb-3">{citation.citationText}</p>
                          
                          {/* Related JSON */}
                          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md overflow-hidden">
                            <div className="flex items-center justify-between mb-2 gap-2">
                              <div className="text-xs font-semibold text-gray-900 min-w-0">
                                Related JSON
                              </div>
                              <button
                                onClick={() => copyToClipboard(JSON.stringify(citation, null, 2), `json-${citation.id}`)}
                                className={`px-3 py-1 text-xs font-medium text-white rounded focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors flex-shrink-0 ${
                                  copiedStates[`json-${citation.id}`]
                                    ? 'bg-green-600 focus:ring-green-500'
                                    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                                }`}
                              >
                                {copiedStates[`json-${citation.id}`] ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <div className="overflow-x-auto">
                              <pre className="text-xs text-gray-700 overflow-y-auto max-h-48 bg-white p-2 rounded border border-gray-200 whitespace-pre-wrap break-words overflow-wrap-anywhere max-w-full">
                                {JSON.stringify(citation, null, 2)}
                              </pre>
                            </div>
                          </div>
                          
                          {/* Document Context */}
                          {citation.paragraphId && citation.paragraphText && (
                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md overflow-hidden">
                              <div className="flex items-center justify-between mb-1 gap-2">
                                <div className="text-xs font-semibold text-blue-900 min-w-0">
                                  Document Context ({citation.paragraphId})
                                </div>
                                <button
                                  onClick={() => copyToClipboard(citation.paragraphText || '', `context-${citation.id}`)}
                                  className={`px-3 py-1 text-xs font-medium text-white rounded focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors flex-shrink-0 ${
                                    copiedStates[`context-${citation.id}`]
                                      ? 'bg-green-600 focus:ring-green-500'
                                      : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                                  }`}
                                >
                                  {copiedStates[`context-${citation.id}`] ? 'Copied!' : 'Copy'}
                                </button>
                              </div>
                              <p className="text-sm text-gray-700 italic break-words whitespace-pre-wrap overflow-wrap-anywhere max-w-full">
                                {citation.paragraphText}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Consensus Summary */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-md">
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1">Agreement Level</div>
                          <div className="text-sm font-semibold text-gray-900 capitalize">{consensus.agreement_level}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1">Confidence Score</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  consensus.confidence_score >= 0.8 ? 'bg-green-500' :
                                  consensus.confidence_score >= 0.4 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${consensus.confidence_score * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-700">
                              {formatConfidenceScore(consensus.confidence_score)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 italic">{consensus.reasoning}</div>
                    </div>

                    {/* Panel Evaluation Details */}
                    <div className="mb-4">
                      <h5 className="text-sm font-semibold text-gray-900 mb-3">Panel Evaluation Results</h5>
                      <div className="space-y-3">
                        {validation.panel_evaluation.map((agent, idx) => (
                          <div
                            key={idx}
                            className="p-3 border border-gray-200 rounded-md bg-white"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded-full ${getVerdictColor(agent.verdict)}`} />
                                <span className="text-sm font-medium text-gray-900">
                                  {getAgentDisplayName(agent.agent)}
                                </span>
                              </div>
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                agent.verdict === 'VALID' ? 'bg-green-100 text-green-800' :
                                agent.verdict === 'INVALID' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {agent.verdict}
                              </span>
                            </div>
                            {(agent.invalid_reason || agent.uncertain_reason) && (
                              <div className="mt-2 text-xs text-gray-600">
                                <span className="font-medium">Reason: </span>
                                <span className="italic">{agent.invalid_reason || agent.uncertain_reason}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tier 3 Investigation Results */}
                    {citation.tier_3 && (
                      <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-md">
                        <h5 className="text-sm font-semibold text-purple-900 mb-3">Tier 3: Deep Investigation</h5>
                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-3 py-1 text-sm font-semibold rounded ${
                                citation.tier_3.verdict === "VERIFIED_REAL" ? 'bg-green-100 text-green-800' :
                                citation.tier_3.verdict === "LIKELY_REAL" ? 'bg-blue-100 text-blue-800' :
                                citation.tier_3.verdict === "LIKELY_FABRICATED" ? 'bg-red-100 text-red-800' :
                                citation.tier_3.verdict === "NEEDS_HUMAN_REVIEW" ? 'bg-orange-100 text-orange-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {citation.tier_3.verdict.replace(/_/g, ' ')}
                              </span>
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                citation.tier_3.confidence === "high" ? 'bg-green-100 text-green-800' :
                                citation.tier_3.confidence === "medium" ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {citation.tier_3.confidence.toUpperCase()} Confidence
                              </span>
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-xs font-medium text-gray-700 mb-1">Reasoning</div>
                            <p className="text-sm text-gray-700">{citation.tier_3.reasoning}</p>
                          </div>
                          
                          <div>
                            <div className="text-xs font-medium text-gray-700 mb-1">Key Evidence</div>
                            <p className="text-sm text-gray-700">{citation.tier_3.key_evidence}</p>
                          </div>
                          
                          {citation.tier_3.remaining_uncertainties && (
                            <div>
                              <div className="text-xs font-medium text-gray-700 mb-1">Remaining Uncertainties</div>
                              <p className="text-sm text-gray-600 italic">{citation.tier_3.remaining_uncertainties}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Verdict Summary */}
                    <div className="p-3 bg-gray-50 rounded-md">
                      <div className="text-xs font-medium text-gray-600 mb-2">Verdict Summary</div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-green-700">
                          <span className="font-semibold">{consensus.verdict_counts.VALID}</span> Valid
                        </span>
                        <span className="text-yellow-700">
                          <span className="font-semibold">{consensus.verdict_counts.UNCERTAIN}</span> Uncertain
                        </span>
                        <span className="text-red-700">
                          <span className="font-semibold">{consensus.verdict_counts.INVALID}</span> Invalid
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      
      <div className="pdf-hide">
        <ContextPanel 
          fileId={fileId}
          checkId={checkId}
          showJson={true}
          showCitationCount={true}
          showValidationResults={true}
        />
      </div>
    </div>
  )
}
