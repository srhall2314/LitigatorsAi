"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { ContextPanel } from "./ContextPanel"
import { CitationValidation, ValidationVerdict, Tier3FinalStatus } from "@/types/citation-json"
import { getTier3FinalStatus } from "@/lib/citation-identification/validation"
import { isNewFormatCitationValidation, isNewFormatTier3Result, calculateRiskStatistics, getCitationRiskLevel } from "@/lib/citation-identification/format-helpers"
import { ValidationSummary } from "./ValidationSummary"
import jsPDF from "jspdf"

interface CitationsReportPageProps {
  fileId: string
  checkId?: string // Optional checkId to view a specific validation run
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
  manualReview?: {
    status: "approved" | "questionable"
    notes?: string
    reviewedBy?: string
  }
}

interface DocumentMetadata {
  filename: string
  uploadDate: string
  documentType?: string
  totalCitations: number
  identificationMethod?: string
}

export function CitationsReportPage({ fileId, checkId: initialCheckId }: CitationsReportPageProps) {
  const [checkId, setCheckId] = useState<string | null>(initialCheckId || null)
  const [citations, setCitations] = useState<CitationWithValidation[]>([])
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null)
  const [checkMetadata, setCheckMetadata] = useState<{
    version: number
    createdAt: string
    updatedAt: string
    isCurrent: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        let targetCheckId = initialCheckId
        
        // If checkId is provided in URL, use it directly
        if (targetCheckId) {
          console.log(`[CitationsReportPage] Using provided checkId from URL: ${targetCheckId}`)
        } else {
          // If no checkId provided, find the latest normal workflow check
          console.log(`[CitationsReportPage] No checkId in URL, finding latest normal workflow check`)
          const fileRes = await fetch(`/api/citation-checker/files`)
          if (fileRes.ok) {
            const files = await fileRes.json()
            const file = files.find((f: any) => f.id === fileId)
            if (file?.citationChecks && file.citationChecks.length > 0) {
              // Find the latest check from normal workflow (not heavy analysis or test runs)
              for (const check of file.citationChecks) {
                // Use workflowType field if available
                const workflowType = check.workflowType
                const isNormalWorkflow = !workflowType || workflowType === "standard"
                
                if (!isNormalWorkflow) {
                  // Skip if workflowType indicates it's not standard
                  continue
                }
                
                // Check if it has validation using workflow fields
                const hasValidation = check.status === "citations_validated" || 
                                     check.completedSteps?.includes("validate-citations") ||
                                     (check.citationCount && check.citationCount > 0)
                
                // Fallback: check jsonData if available (for non-migrated records)
                if (!hasValidation && check.jsonData) {
                  const metadata = check.jsonData?.document?.metadata
                  const hasHeavyAnalysisRun = metadata?.heavyAnalysisRunId
                  const hasTestRun = metadata?.testRunId
                  
                  // Skip if it's from heavy analysis or test runs
                  if (hasHeavyAnalysisRun || hasTestRun) {
                    continue
                  }
                  
                  const jsonHasValidation = check.jsonData?.document?.citations?.some(
                    (citation: any) => citation.validation
                  )
                  
                  if (jsonHasValidation) {
                    targetCheckId = check.id
                    console.log(`[CitationsReportPage] Found normal workflow check: ${targetCheckId}`)
                    break
                  }
                } else if (hasValidation) {
                  targetCheckId = check.id
                  console.log(`[CitationsReportPage] Found normal workflow check: ${targetCheckId}`)
                  break
                }
              }
              
              // If no normal workflow check found, use latest check as fallback
              if (!targetCheckId && file.citationChecks[0]) {
                targetCheckId = file.citationChecks[0].id
                console.log(`[CitationsReportPage] No normal workflow check found, using latest: ${targetCheckId}`)
              }
            } else {
              console.warn(`[CitationsReportPage] No citation checks found for file: ${fileId}`)
              setLoading(false)
              return
            }
          } else {
            console.error(`[CitationsReportPage] Failed to fetch files: ${fileRes.status}`)
            setLoading(false)
            return
          }
        }
        
        if (targetCheckId) {
          setCheckId(targetCheckId)
          
          const checkRes = await fetch(`/api/citation-checker/checks/${targetCheckId}`)
          if (checkRes.ok) {
            const data = await checkRes.json()
            
            console.log(`[CitationsReportPage] Loaded check data:`, {
              checkId: targetCheckId,
              hasJsonData: !!data.jsonData,
              hasDocument: !!data.jsonData?.document,
              citationsCount: data.jsonData?.document?.citations?.length || 0,
              citationsWithValidation: data.jsonData?.document?.citations?.filter((c: any) => c.validation).length || 0,
              metadata: data.jsonData?.document?.metadata
            })
            
            // Set check metadata
            setCheckMetadata({
              version: data.version,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              isCurrent: false, // Will be determined below
            })
            
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
              
              // Log if no citations with validation
              const citationsWithValidation = enrichedCitations.filter((c: any) => c.validation)
              if (citationsWithValidation.length === 0) {
                console.warn(`[CitationsReportPage] No citations with validation found in check ${targetCheckId}`)
              }
            } else {
              console.warn(`[CitationsReportPage] Check ${targetCheckId} has no jsonData.document`)
            }
            
            // Check if this is the current version
            const fileRes = await fetch(`/api/citation-checker/files`)
            if (fileRes.ok) {
              const files = await fileRes.json()
              const file = files.find((f: any) => f.id === fileId)
              if (file?.citationChecks?.[0]?.id === targetCheckId) {
                setCheckMetadata(prev => prev ? { ...prev, isCurrent: true } : null)
              }
            }
          } else {
            console.error(`[CitationsReportPage] Failed to fetch check ${targetCheckId}: ${checkRes.status}`)
            const errorData = await checkRes.json().catch(() => ({}))
            console.error(`[CitationsReportPage] Error details:`, errorData)
          }
        } else {
          console.warn(`[CitationsReportPage] No checkId found for file ${fileId}`)
        }
      } catch (err) {
        console.error('Failed to load report data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [fileId, initialCheckId])

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

  // Get final status for a citation, prioritizing manual review over AI validation
  const getFinalStatus = (citation: CitationWithValidation): {
    status: "APPROVED" | "QUESTIONABLE" | "LOW_RISK" | "MODERATE_RISK" | "NEEDS_ADDITIONAL_REVIEW" | "UNKNOWN"
    source: "manual" | "ai"
  } => {
    // Manual review takes precedence
    if (citation.manualReview?.status === "approved") {
      return { status: "APPROVED", source: "manual" }
    }
    if (citation.manualReview?.status === "questionable") {
      return { status: "QUESTIONABLE", source: "manual" }
    }
    
    // Fall back to AI validation
    const riskLevel = getCitationRiskLevel(citation as any)
    return { status: riskLevel || "UNKNOWN", source: "ai" }
  }

  // Filter citations that have validation results
  const citationsWithValidation = citations.filter(c => c.validation)

  // Calculate statistics using risk-based utility function, but prioritize manual reviews
  const calculateStatisticsWithManualReviews = () => {
    let approved = 0
    let questionable = 0
    let lowRisk = 0
    let moderateRisk = 0
    let needsReview = 0
    
    citations.forEach(citation => {
      const finalStatus = getFinalStatus(citation)
      if (finalStatus.source === "manual") {
        if (finalStatus.status === "APPROVED") approved++
        else if (finalStatus.status === "QUESTIONABLE") questionable++
      } else {
        if (finalStatus.status === "LOW_RISK") lowRisk++
        else if (finalStatus.status === "MODERATE_RISK") moderateRisk++
        else if (finalStatus.status === "NEEDS_ADDITIONAL_REVIEW") needsReview++
      }
    })
    
    return { approved, questionable, lowRisk, moderateRisk, needsReview, total: citations.length }
  }
  
  const stats = calculateStatisticsWithManualReviews()
  const { lowRisk, moderateRisk, needsReview, total: validatedTotal } = stats
  
  // Verify the sum matches validatedTotal (for debugging)
  const sumOfRisks = lowRisk + moderateRisk + needsReview
  if (sumOfRisks !== validatedTotal) {
    console.warn(`[CitationsReportPage] Risk count mismatch: sum=${sumOfRisks}, validatedTotal=${validatedTotal}`)
  }
  
  // Map to display variables for backward compatibility with existing UI code
  const validCount = lowRisk
  const uncertainCount = moderateRisk
  const invalidCount = needsReview
  const tier3Count = citations.filter(c => c.tier_3).length
  const tier3ValidatedCount = citations.filter(c => {
    const tier3Status = getTier3FinalStatus(c.tier_3)
    return tier3Status === "VALID"
  }).length

  // Calculate token usage and costs from all citations
  const tokenUsageSummary = citations.reduce((acc, citation) => {
    // Tier 2: Always aggregate tokens from panel_evaluation, use run_cost for cost if available
    if (citation.validation?.panel_evaluation) {
      for (const verdict of citation.validation.panel_evaluation) {
        if (verdict.token_usage) {
          const model = verdict.model
          if (!acc.byModel[model]) {
            acc.byModel[model] = {
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              cost: 0,
            }
          }
          acc.byModel[model].input_tokens += verdict.token_usage.input_tokens || 0
          acc.byModel[model].output_tokens += verdict.token_usage.output_tokens || 0
          acc.byModel[model].total_tokens += verdict.token_usage.total_tokens || 0
          
          // Use cost from verdict if available, otherwise calculate from run_cost
          if (verdict.cost) {
            acc.byModel[model].cost += verdict.cost.total_cost || 0
          }
        }
      }
      
      // Use run_cost for cost if available (more accurate than summing individual costs)
      if (citation.validation.run_cost) {
        acc.total.cost += citation.validation.run_cost.total.total_cost || 0
        // Update byModel costs from run_cost
        for (const [model, cost] of Object.entries(citation.validation.run_cost.byModel)) {
          if (!acc.byModel[model]) {
            acc.byModel[model] = {
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              cost: 0,
            }
          }
          acc.byModel[model].cost = cost.total_cost || 0
        }
      }
    }

    // Tier 3: Always aggregate tokens from panel_evaluation, use run_cost for cost if available
    if (citation.tier_3?.panel_evaluation) {
      for (const verdict of citation.tier_3.panel_evaluation) {
        if (verdict.token_usage) {
          const model = verdict.model
          if (!acc.byModel[model]) {
            acc.byModel[model] = {
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              cost: 0,
            }
          }
          acc.byModel[model].input_tokens += verdict.token_usage.input_tokens || 0
          acc.byModel[model].output_tokens += verdict.token_usage.output_tokens || 0
          acc.byModel[model].total_tokens += verdict.token_usage.total_tokens || 0
          
          // Use cost from verdict if available, otherwise calculate from run_cost
          if (verdict.cost) {
            acc.byModel[model].cost += verdict.cost.total_cost || 0
          }
        }
      }
      
      // Use run_cost for cost if available (more accurate than summing individual costs)
      if (citation.tier_3.run_cost) {
        acc.total.cost += citation.tier_3.run_cost.total.total_cost || 0
        // Update byModel costs from run_cost
        for (const [model, cost] of Object.entries(citation.tier_3.run_cost.byModel)) {
          if (!acc.byModel[model]) {
            acc.byModel[model] = {
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              cost: 0,
            }
          }
          const costData = cost as { total_cost?: number }
          acc.byModel[model].cost += costData.total_cost || 0
        }
      }
    }

    return acc
  }, {
    byModel: {} as Record<string, {
      input_tokens: number
      output_tokens: number
      total_tokens: number
      cost: number
    }>,
    total: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cost: 0,
    },
  })

  // Calculate token totals from byModel
  for (const modelUsage of Object.values(tokenUsageSummary.byModel)) {
    tokenUsageSummary.total.input_tokens += modelUsage.input_tokens
    tokenUsageSummary.total.output_tokens += modelUsage.output_tokens
    tokenUsageSummary.total.total_tokens += modelUsage.total_tokens
    // Cost is already aggregated above
  }

  // Debug: Log token usage summary (remove in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Token Usage Debug] Summary:', {
      totalTokens: tokenUsageSummary.total.total_tokens,
      totalCost: tokenUsageSummary.total.cost,
      byModel: tokenUsageSummary.byModel,
      sampleCitation: citations[0] ? {
        hasValidation: !!citations[0].validation,
        hasPanelEval: !!citations[0].validation?.panel_evaluation,
        panelEvalLength: citations[0].validation?.panel_evaluation?.length,
        firstVerdictHasTokens: !!citations[0].validation?.panel_evaluation?.[0]?.token_usage,
        hasRunCost: !!citations[0].validation?.run_cost,
      } : 'no citations',
    })
  }

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
  const getVerdictColor = (verdict?: ValidationVerdict, score?: number) => {
    if (typeof score === 'number') {
      // New format: score-based
      if (score >= 8) return "bg-green-500"
      if (score >= 5) return "bg-yellow-500"
      return "bg-red-500"
    }
    // Legacy format: verdict-based
    if (verdict === "VALID") return "bg-green-500"
    if (verdict === "INVALID") return "bg-red-500"
    return "bg-yellow-500"
  }

  const getAgentDisplayName = (agentName: string) => {
    const names: Record<string, string> = {
      'citation_authority_validator_v1': 'Agent: Authority Specialist',
      'case_ecology_validator_v1': 'Agent: Ecology Specialist',
      'temporal_reality_validator_v1': 'Agent: Temporal Specialist',
      'legal_knowledge_validator_v1': 'Agent: Knowledge Generalist',
      'reality_assessment_expert_v1': 'Agent: Reality Generalist',
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
    setGeneratingPDF(true)
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const margin = 15
      const pageWidth = pdfWidth - (margin * 2)
      let yPosition = margin
      const sectionSpacing = 10

      // Helper function to add text with word wrapping and page breaks
      const addText = (
        text: string, 
        fontSize: number = 10, 
        isBold: boolean = false, 
        color: [number, number, number] = [0, 0, 0],
        align: 'left' | 'center' | 'right' = 'left'
      ) => {
        pdf.setFontSize(fontSize)
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal')
        pdf.setTextColor(color[0], color[1], color[2])
        
        const lines = pdf.splitTextToSize(text, pageWidth)
        const currentLineHeight = fontSize * 0.35 // Approximate line height in mm
        
        // Check if we need a new page
        if (yPosition + (lines.length * currentLineHeight) > pdfHeight - margin) {
          pdf.addPage()
          yPosition = margin
        }
        
        lines.forEach((line: string) => {
          pdf.text(line, margin, yPosition, { align })
          yPosition += currentLineHeight
        })
      }

      // Helper function to check if we need a new page
      const checkNewPage = (requiredSpace: number) => {
        if (yPosition + requiredSpace > pdfHeight - margin) {
          pdf.addPage()
          yPosition = margin
          return true
        }
        return false
      }

      // Helper function to add a horizontal line
      const addHorizontalLine = () => {
        checkNewPage(5)
        pdf.setDrawColor(200, 200, 200)
        pdf.line(margin, yPosition, pdfWidth + margin, yPosition)
        yPosition += 3
      }

      // Title
      addText('Citation Validation Report', 18, true, [0, 0, 0], 'center')
      yPosition += sectionSpacing

      // Document Metadata
      if (metadata) {
        addText('Document Information', 14, true)
        yPosition += 3
        addText(`File Name: ${metadata.filename}`, 11, true)
        addText(`Upload Date: ${new Date(metadata.uploadDate).toLocaleDateString()}`, 10)
        if (metadata.documentType) {
          addText(`Document Type: ${metadata.documentType}`, 10)
        }
        if (metadata.identificationMethod) {
          addText(`Identification Method: ${metadata.identificationMethod}`, 10)
        }
        yPosition += sectionSpacing
        addHorizontalLine()
        yPosition += sectionSpacing
      }

      // Summary Statistics
      addText('Summary Statistics', 14, true)
      yPosition += 5
      
      addText(`Total Citations: ${citations.length}`, 12, true)
      addText(`Low Risk: ${validCount}`, 11, false, [34, 197, 94]) // green
      addText(`Moderate Risk: ${uncertainCount}`, 11, false, [234, 179, 8]) // yellow
      addText(`Needs Review: ${invalidCount}`, 11, false, [239, 68, 68]) // red
      addText(`Tier 3 Reviewed: ${tier3Count}`, 11, false, [147, 51, 234]) // purple
      yPosition += sectionSpacing

      // Summary paragraph
      const summaryText = `Your document contains ${citations.length} citation${citations.length !== 1 ? 's' : ''}.` +
        (validCount > 0 ? ` ${validCount} citation${validCount !== 1 ? 's were' : ' was'} validated successfully.` : '') +
        (tier3ValidatedCount > 0 ? ` ${tier3ValidatedCount} citation${tier3ValidatedCount !== 1 ? 's were' : ' was'} validated by Tier 3 review.` : '') +
        (uncertainCount > 0 ? ` ${uncertainCount} citation${uncertainCount !== 1 ? 's have' : ' has'} uncertain validation results.` : '') +
        (invalidCount > 0 ? ` ${invalidCount} citation${invalidCount !== 1 ? 's were' : ' was'} flagged as potentially invalid.` : '') +
        (tier3Count > 0 ? ` ${tier3Count} citation${tier3Count !== 1 ? 's received' : ' received'} deep investigation (Tier 3) review.` : '')
      
      addText(summaryText, 10)
      yPosition += sectionSpacing * 2

      // Citation Summary by Paragraph
      if (citationsByParagraph.size > 0) {
        addText('Citation Summary by Paragraph', 14, true)
        yPosition += sectionSpacing
        
        // Helper to get status text and color for a citation
        const getCitationStatus = (citation: CitationWithValidation) => {
          if (citation.tier_3) {
            const tier3Status = getTier3FinalStatus(citation.tier_3)
            if (tier3Status === "VALID") {
              return { text: 'VALID (T3)', color: [34, 197, 94] as [number, number, number] }
            } else if (tier3Status === "FAIL") {
              return { text: 'INVALID (T3)', color: [239, 68, 68] as [number, number, number] }
            } else {
              return { text: 'UNCERTAIN (T3)', color: [234, 179, 8] as [number, number, number] }
            }
          } else if (citation.validation) {
            const recommendation = citation.validation.consensus.recommendation
            if (recommendation === "CITATION_LIKELY_VALID") {
              return { text: 'VALID', color: [34, 197, 94] as [number, number, number] }
            } else if (recommendation === "CITATION_LIKELY_HALLUCINATED") {
              return { text: 'INVALID', color: [239, 68, 68] as [number, number, number] }
            } else {
              return { text: 'UNCERTAIN', color: [234, 179, 8] as [number, number, number] }
            }
          }
          return { text: 'N/A', color: [128, 128, 128] as [number, number, number] }
        }

        // Group and display citations by paragraph
        Array.from(citationsByParagraph.entries()).forEach(([paragraphId, paraCitations]) => {
          paraCitations.forEach((citation) => {
            checkNewPage(15) // Reserve space for each citation row
            
            const status = getCitationStatus(citation)
            const citationText = citation.citationText.length > 80 
              ? citation.citationText.substring(0, 77) + '...' 
              : citation.citationText
            
            // Paragraph ID
            pdf.setFontSize(9)
            pdf.setFont('helvetica', 'bold')
            pdf.setTextColor(100, 100, 100)
            pdf.text(paragraphId, margin, yPosition)
            
            // Status
            pdf.setFontSize(9)
            pdf.setFont('helvetica', 'bold')
            pdf.setTextColor(status.color[0], status.color[1], status.color[2])
            const statusX = margin + 25
            pdf.text(status.text, statusX, yPosition)
            
            // Citation text
            pdf.setFontSize(9)
            pdf.setFont('helvetica', 'normal')
            pdf.setTextColor(0, 0, 0)
            const citationX = statusX + 35
            const citationWidth = pageWidth - (citationX - margin)
            const citationLines = pdf.splitTextToSize(citationText, citationWidth)
            citationLines.forEach((line: string, idx: number) => {
              if (idx === 0) {
                pdf.text(line, citationX, yPosition)
              } else {
                yPosition += 4
                checkNewPage(5)
                pdf.text(line, citationX, yPosition)
              }
            })
            
            yPosition += 5
          })
        })
        
        yPosition += sectionSpacing
        addHorizontalLine()
        yPosition += sectionSpacing
      }

      // Citation Details
      addText('Citation Details', 14, true)
      yPosition += sectionSpacing

      sortedCitations.forEach((citation, index) => {
        checkNewPage(60) // Reserve space for citation block
        
        // Citation number and type
        const citationType = citation.citationType?.toUpperCase() || 'UNKNOWN'
        addText(`Citation ${index + 1} [${citationType}]`, 12, true)
        yPosition += 2
        
        // Citation text
        addText(citation.citationText, 10)
        yPosition += 5

        // Validation results
        if (citation.validation) {
          const consensus = citation.validation.consensus
          const recommendation = consensus.recommendation
          
          let statusText = ''
          let statusColor: [number, number, number] = [0, 0, 0]
          
          // Check Tier 3 first if it exists
          if (citation.tier_3) {
            const tier3Status = getTier3FinalStatus(citation.tier_3)
            const consensus = citation.tier_3?.consensus
            
            if (tier3Status === "VALID") {
              statusText = 'Status: VALID (Tier 3 Verified)'
              statusColor = [34, 197, 94]
            } else if (tier3Status === "FAIL") {
              statusText = 'Status: INVALID (Tier 3 Confirmed)'
              statusColor = [239, 68, 68]
            } else {
              statusText = 'Status: WARN (Tier 3 Review)'
              statusColor = [234, 179, 8]
            }
            
            // Add Tier 3 consensus info
            if (consensus) {
              if (consensus.risk_level_counts) {
                // New format: risk-based
                addText(`Tier 3 Consensus: ${consensus.risk_level_counts.LOW_RISK} Low Risk, ${consensus.risk_level_counts.MODERATE_RISK} Moderate Risk, ${consensus.risk_level_counts.NEEDS_ADDITIONAL_REVIEW} Needs Review`, 9)
              } else if (consensus.verdict_counts) {
                // Legacy format: verdict-based
                addText(`Tier 3 Consensus: ${consensus.verdict_counts.VALID}/3 Valid, ${consensus.verdict_counts.INVALID}/3 Invalid, ${consensus.verdict_counts.UNCERTAIN}/3 Uncertain`, 9)
              }
              addText(`Tier 3 Agreement: ${consensus.agreement_level} (${(consensus.confidence_score * 100).toFixed(0)}% confidence)`, 9)
              yPosition += 2
            }
            
            // Add Tier 3 reasoning if available
            if (citation.tier_3.reasoning) {
              addText(`Tier 3 Reasoning: ${citation.tier_3.reasoning}`, 9)
              yPosition += 2
            }
            
            // Show Tier 2 recommendation for comparison
            let tier2Text = ''
            if (recommendation === "CITATION_LIKELY_VALID") {
              tier2Text = 'Tier 2 Recommendation: VALID'
            } else if (recommendation === "CITATION_LIKELY_HALLUCINATED") {
              tier2Text = 'Tier 2 Recommendation: INVALID'
            } else {
              tier2Text = 'Tier 2 Recommendation: UNCERTAIN'
            }
            addText(tier2Text, 9, false, [128, 128, 128])
          } else {
            // No Tier 3, use Tier 2 recommendation
            if (recommendation === "CITATION_LIKELY_VALID") {
              statusText = 'Status: VALID'
              statusColor = [34, 197, 94]
            } else if (recommendation === "CITATION_LIKELY_HALLUCINATED") {
              statusText = 'Status: INVALID'
              statusColor = [239, 68, 68]
            } else {
              statusText = 'Status: UNCERTAIN'
              statusColor = [234, 179, 8]
            }
          }
          
          addText(statusText, 10, true, statusColor)
          addText(`Confidence Score: ${(consensus.confidence_score * 100).toFixed(0)}%`, 10)
          addText(`Agreement Level: ${consensus.agreement_level}`, 10)
          
          if (consensus.reasoning) {
            addText(`Reasoning: ${consensus.reasoning}`, 9)
            yPosition += 2
          }

          // Panel evaluation summary
          if (citation.validation.panel_evaluation && citation.validation.panel_evaluation.length > 0) {
            const isNewFormat = isNewFormatCitationValidation(citation.validation)
            if (isNewFormat && citation.validation.consensus.scores) {
              const avgScore = citation.validation.consensus.average_score || 0
              const stdDev = citation.validation.consensus.standard_deviation || 0
              addText(`Panel Evaluation: Avg Score ${avgScore.toFixed(1)}/10 (σ=${stdDev.toFixed(1)})`, 9)
              
              // List individual agent scores
              citation.validation.panel_evaluation.forEach(agent => {
                const agentName = getAgentDisplayName(agent.agent)
                const scoreText = typeof agent.score === 'number' 
                  ? `${agentName}: ${agent.score}/10`
                  : `${agentName}: N/A`
                addText(scoreText, 8, false, [100, 100, 100])
              })
            } else {
              // Legacy format
              const verdicts = citation.validation.panel_evaluation.map(a => a.verdict).filter((v): v is ValidationVerdict => !!v)
              const validCount = verdicts.filter(v => v === 'VALID').length
              const uncertainCount = verdicts.filter(v => v === 'UNCERTAIN').length
              const invalidCount = verdicts.filter(v => v === 'INVALID').length
              addText(`Panel Evaluation: ${validCount} Valid / ${uncertainCount} Uncertain / ${invalidCount} Invalid`, 9)
              
              // List individual agent verdicts
              citation.validation.panel_evaluation.forEach(agent => {
                const agentName = getAgentDisplayName(agent.agent)
                const verdictText = agent.verdict ? `${agentName}: ${agent.verdict}` : `${agentName}: N/A`
                addText(verdictText, 8, false, [100, 100, 100])
              })
            }
          }

          // Document context if available
          if (citation.paragraphId && citation.paragraphText) {
            yPosition += 3
            addText(`Document Context (${citation.paragraphId}):`, 9, true)
            addText(citation.paragraphText.substring(0, 500) + (citation.paragraphText.length > 500 ? '...' : ''), 8, false, [80, 80, 80])
          }
        }
        
        yPosition += sectionSpacing
        addHorizontalLine()
        yPosition += sectionSpacing
      })

      const filename = metadata?.filename 
        ? `CC-${metadata.filename.replace(/\.[^/.]+$/, '')}-${new Date().toISOString().split('T')[0]}.pdf`
        : `CC-Report-${new Date().toISOString().split('T')[0]}.pdf`

      pdf.save(filename)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
      
      {/* Validation Run Info */}
      {checkMetadata && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">Validation Run</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Version {checkMetadata.version}</span>
                  {checkMetadata.isCurrent && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Current
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">Validation Date</div>
                <div className="text-sm text-gray-900">
                  {new Date(checkMetadata.updatedAt).toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
            <Link
              href={`/citation-checker/${fileId}/validation-runs`}
              className="text-sm text-indigo-600 hover:text-indigo-900 font-medium"
            >
              View All Runs →
            </Link>
          </div>
        </div>
      )}

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
            {validatedTotal < citations.length && (
              <div className="text-xs text-gray-500 mt-1">
                {validatedTotal} validated
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-gray-600">Low Risk</div>
            <div className="text-2xl font-bold text-green-600">{validCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Moderate Risk</div>
            <div className="text-2xl font-bold text-yellow-600">{uncertainCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Needs Review</div>
            <div className="text-2xl font-bold text-red-600">{invalidCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Tier 3 Reviewed</div>
            <div className="text-2xl font-bold text-purple-600">{tier3Count}</div>
          </div>
        </div>
        
        {/* Validation Status Note */}
        {validatedTotal < citations.length && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> {citations.length - validatedTotal} citation{citations.length - validatedTotal !== 1 ? 's have' : ' has'} not yet been validated. 
              Risk statistics only include validated citations ({validatedTotal} of {citations.length}).
            </p>
          </div>
        )}

        {/* Token Usage and Cost Summary - Development Panel */}
        {(tokenUsageSummary.total.total_tokens > 0 || tokenUsageSummary.total.cost > 0) && (
          <div className="mt-8 border-t-4 border-orange-300 pt-6">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-orange-900">Development Panel</h3>
                <p className="text-sm font-medium text-orange-800 mb-2">Token Usage & Estimated Cost</p>
                <p className="text-sm text-orange-700 mt-1">
                  LLM token usage and cost tracking for development purposes (not part of final product)
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-xs text-orange-600 font-medium mb-1">Total Tokens</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {tokenUsageSummary.total.total_tokens.toLocaleString()}
                    <span className="text-xs text-gray-500 ml-2">
                      ({tokenUsageSummary.total.input_tokens.toLocaleString()} in / {tokenUsageSummary.total.output_tokens.toLocaleString()} out)
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-orange-600 font-medium mb-1">Estimated Cost</div>
                  <div className="text-lg font-semibold text-gray-900">
                    ${tokenUsageSummary.total.cost.toFixed(4)}
                    <span className="text-xs text-gray-500 ml-2">USD</span>
                  </div>
                </div>
              </div>
              
              {/* Breakdown by Model */}
              {Object.keys(tokenUsageSummary.byModel).length > 0 && (
                <div className="mt-4 pt-4 border-t border-orange-200">
                  <div className="text-sm font-semibold text-orange-900 mb-3">Breakdown by Model</div>
                  <div className="space-y-2">
                    {Object.entries(tokenUsageSummary.byModel).map(([model, usage]) => (
                      <div key={model} className="bg-white border border-orange-200 rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono text-gray-900">{model}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-gray-600">
                              {usage.total_tokens.toLocaleString()} tokens
                            </span>
                            <span className="text-sm font-semibold text-gray-900">
                              ${usage.cost.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6">
          <h4 className="font-semibold text-black mb-2">Summary</h4>
          <p className="text-black text-sm">
            Your document contains {citations.length} citation{citations.length !== 1 ? 's' : ''}. 
            {validCount > 0 && ` ${validCount} citation${validCount !== 1 ? 's are' : ' is'} assessed as low risk.`}
            {tier3ValidatedCount > 0 && ` ${tier3ValidatedCount} citation${tier3ValidatedCount !== 1 ? 's were' : ' was'} validated by Tier 3 review.`}
            {uncertainCount > 0 && ` ${uncertainCount} citation${uncertainCount !== 1 ? 's have' : ' has'} moderate risk assessment.`}
            {invalidCount > 0 && ` ${invalidCount} citation${invalidCount !== 1 ? 's need' : ' needs'} additional review.`}
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
                  const validation = citation.validation
                  const isNewFormat = validation ? isNewFormatCitationValidation(validation) : false
                  
                  // Tier 2: Show all 5 agent dots + computed square
                  let tier2Visual = null
                  if (validation?.panel_evaluation) {
                    const consensus = validation.consensus
                    tier2Visual = (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* All 5 agent dots */}
                        {validation.panel_evaluation.map((agent, idx) => {
                          const agentIsNewFormat = typeof agent.score === 'number'
                          return (
                            <div
                              key={idx}
                              className={`w-2.5 h-2.5 rounded-full ${getVerdictColor(agent.verdict, agent.score)}`}
                              title={agentIsNewFormat 
                                ? `${getAgentDisplayName(agent.agent)}: ${agent.score}/10`
                                : `${getAgentDisplayName(agent.agent)}: ${agent.verdict}`
                              }
                            />
                          )
                        })}
                        
                        {/* Arrow */}
                        <span className="text-gray-400 text-xs mx-0.5">→</span>
                        
                        {/* Computed square */}
                        {isNewFormat && consensus.average_score !== undefined ? (
                          <div 
                            className={`w-3 h-3 rounded border border-gray-300 ${
                              consensus.average_score >= 8 ? 'bg-green-500' :
                              consensus.average_score >= 5 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            title={`Computed Average: ${consensus.average_score.toFixed(1)}/10`}
                          />
                        ) : (
                          <div 
                            className={`w-3 h-3 rounded border border-gray-300 ${getStoplightColor(consensus?.recommendation || '')}`}
                            title={`Computed: ${consensus?.recommendation || 'N/A'}`}
                          />
                        )}
                      </div>
                    )
                  }
                  
                  // Square badge = Tier 3 verdict (only if Tier 3 exists)
                  let badgeElement = null
                  if (citation.tier_3) {
                    const tier3Status = getTier3FinalStatus(citation.tier_3)
                    const tier3Consensus = citation.tier_3.consensus
                    const isNewFormatT3 = isNewFormatTier3Result(citation.tier_3)
                    let badgeStatus: 'valid' | 'invalid' | 'uncertain'
                    let badgeLabel: string
                    
                    if (isNewFormatT3 && tier3Consensus?.final_risk_level) {
                      if (tier3Consensus.final_risk_level === "LOW_RISK") {
                        badgeStatus = 'valid'
                        badgeLabel = `${tier3Consensus.risk_level_counts?.LOW_RISK || 0}/3`
                      } else if (tier3Consensus.final_risk_level === "NEEDS_ADDITIONAL_REVIEW") {
                        badgeStatus = 'invalid'
                        badgeLabel = `${tier3Consensus.risk_level_counts?.NEEDS_ADDITIONAL_REVIEW || 0}/3`
                      } else {
                        badgeStatus = 'uncertain'
                        badgeLabel = `${tier3Consensus.risk_level_counts?.MODERATE_RISK || 0}/3`
                      }
                    } else {
                      if (tier3Status === "VALID") {
                        badgeStatus = 'valid'
                        badgeLabel = tier3Consensus?.verdict_counts ? `${tier3Consensus.verdict_counts.VALID}/3` : "V"
                      } else if (tier3Status === "FAIL") {
                        badgeStatus = 'invalid'
                        badgeLabel = tier3Consensus?.verdict_counts ? `${tier3Consensus.verdict_counts.INVALID}/3` : "I"
                      } else {
                        badgeStatus = 'uncertain'
                        badgeLabel = tier3Consensus?.verdict_counts ? `${tier3Consensus.verdict_counts.UNCERTAIN}/3` : "W"
                      }
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
                      {tier2Visual}
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

        {/* Show message if no citations with validation */}
        {citations.length > 0 && sortedCitations.length === 0 && (
          <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="text-lg font-semibold text-yellow-900 mb-2">No Validated Citations Found</h4>
            <p className="text-yellow-800 text-sm">
              This check has {citations.length} citation{citations.length !== 1 ? 's' : ''}, but none have been validated yet.
              Please run citation validation first.
            </p>
          </div>
        )}

        {/* Show message if no citations at all */}
        {citations.length === 0 && !loading && (
          <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">No Citations Found</h4>
            <p className="text-gray-700 text-sm">
              This check does not have any citations. Please ensure citations have been identified first.
            </p>
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
                            
                            {/* Show Manual Review Status First (takes priority) */}
                            {citation.manualReview?.status === "approved" && (
                              <>
                                <span className="px-3 py-1 text-sm font-semibold rounded bg-blue-100 text-blue-800 border-2 border-blue-300">
                                  ✓ APPROVED (Manual Review)
                                </span>
                                <span className="px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700">
                                  Manually Approved
                                </span>
                              </>
                            )}
                            {citation.manualReview?.status === "questionable" && (
                              <>
                                <span className="px-3 py-1 text-sm font-semibold rounded bg-purple-100 text-purple-800 border-2 border-purple-300">
                                  ? QUESTIONABLE (Manual Review)
                                </span>
                                <span className="px-2 py-1 text-xs font-medium rounded bg-purple-50 text-purple-700">
                                  Marked as Questionable
                                </span>
                              </>
                            )}
                            
                            {/* Show Tier 3 risk level if it exists and overrides Tier 2 (only if no manual review) */}
                            {!citation.manualReview && citation.tier_3 && (() => {
                              const tier3Consensus = citation.tier_3?.consensus
                              const isNewFormatT3 = isNewFormatTier3Result(citation.tier_3)
                              
                              if (isNewFormatT3 && tier3Consensus?.final_risk_level) {
                                const riskLevel = tier3Consensus.final_risk_level
                                const lowRiskCount = tier3Consensus.risk_level_counts?.LOW_RISK || 0
                                const moderateRiskCount = tier3Consensus.risk_level_counts?.MODERATE_RISK || 0
                                const needsReviewCount = tier3Consensus.risk_level_counts?.NEEDS_ADDITIONAL_REVIEW || 0
                                
                                if (riskLevel === "LOW_RISK") {
                                  return (
                                    <>
                                      <span className="px-3 py-1 text-sm font-semibold rounded bg-green-100 text-green-800 border-2 border-green-300">
                                        ✓ LOW RISK (Tier 3: {lowRiskCount}/3)
                                      </span>
                                      <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                        Updated by Tier 3
                                      </span>
                                    </>
                                  )
                                } else if (riskLevel === "NEEDS_ADDITIONAL_REVIEW") {
                                  return (
                                    <>
                                      <span className="px-3 py-1 text-sm font-semibold rounded bg-red-100 text-red-800 border-2 border-red-300">
                                        NEEDS REVIEW (Tier 3: {needsReviewCount}/3)
                                      </span>
                                      <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                        Confirmed by Tier 3
                                      </span>
                                    </>
                                  )
                                } else {
                                  return (
                                    <>
                                      <span className="px-3 py-1 text-sm font-semibold rounded bg-orange-100 text-orange-800 border-2 border-orange-300">
                                        MODERATE RISK (Tier 3: {moderateRiskCount}/3)
                                      </span>
                                      <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                        Requires Review
                                      </span>
                                    </>
                                  )
                                }
                              } else {
                                // Legacy format
                                const tier3Status = getTier3FinalStatus(citation.tier_3)
                                const validCount = tier3Consensus?.verdict_counts?.VALID || 0
                                
                                if (tier3Status === "VALID") {
                                  return (
                                    <>
                                      <span className="px-3 py-1 text-sm font-semibold rounded bg-green-100 text-green-800 border-2 border-green-300">
                                        ✓ VALID (Tier 3: {validCount}/3)
                                      </span>
                                      <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                        Updated by Tier 3
                                      </span>
                                    </>
                                  )
                                } else if (tier3Status === "FAIL") {
                                  return (
                                    <>
                                      <span className="px-3 py-1 text-sm font-semibold rounded bg-red-100 text-red-800 border-2 border-red-300">
                                        INVALID (Tier 3: {validCount}/3)
                                      </span>
                                      <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                        Confirmed by Tier 3
                                      </span>
                                    </>
                                  )
                                } else {
                                  return (
                                    <>
                                      <span className="px-3 py-1 text-sm font-semibold rounded bg-orange-100 text-orange-800 border-2 border-orange-300">
                                        WARN (Tier 3: {validCount}/3)
                                      </span>
                                      <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                        Requires Review
                                      </span>
                                    </>
                                  )
                                }
                              }
                            })()}
                            
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
                          
                          {/* Manual Review Section */}
                          {citation.manualReview && (
                            <div className={`mb-4 p-4 border-2 rounded-lg ${
                              citation.manualReview.status === "approved" 
                                ? "bg-blue-50 border-blue-200" 
                                : "bg-purple-50 border-purple-200"
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                  citation.manualReview.status === "approved"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-purple-100 text-purple-800"
                                }`}>
                                  {citation.manualReview.status === "approved" ? "✓ APPROVED" : "? QUESTIONABLE"}
                                </span>
                                <span className="text-sm font-medium text-gray-700">
                                  Manual Review
                                </span>
                              </div>
                              {citation.manualReview.notes && (
                                <p className="text-sm text-gray-700 mt-2">
                                  <span className="font-medium">Notes: </span>
                                  {citation.manualReview.notes}
                                </p>
                              )}
                              {citation.manualReview.reviewedBy && (
                                <p className="text-xs text-gray-600 mt-1">
                                  Reviewed by: {citation.manualReview.reviewedBy}
                                </p>
                              )}
                            </div>
                          )}
                          
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
                      {isNewFormatCitationValidation(validation) && consensus.scores ? (
                        // New format: Show score-based statistics
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="text-xs font-medium text-gray-600 mb-1">Average Score</div>
                              <div className="text-lg font-semibold text-gray-900">
                                {consensus.average_score?.toFixed(1)}/10
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-600 mb-1">Standard Deviation</div>
                              <div className="text-lg font-semibold text-gray-900">
                                σ = {consensus.standard_deviation?.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-600 mb-1">Agreement Level</div>
                              <div className="text-sm font-semibold text-gray-900 capitalize">{consensus.agreement_level}</div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-600 mb-1">Variance</div>
                              <div className="text-sm font-semibold text-gray-900">
                                {consensus.variance?.toFixed(2)}
                              </div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-gray-200">
                            <div className="text-xs font-medium text-gray-600 mb-1">Score Distribution</div>
                            <div className="flex items-center gap-2 text-xs">
                              {consensus.scores.map((score, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-1 rounded font-medium ${
                                    score >= 8 ? 'bg-green-100 text-green-800' :
                                    score >= 5 ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {score}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-xs text-gray-600 italic pt-2 border-t border-gray-200">
                            {consensus.reasoning}
                          </div>
                        </div>
                      ) : (
                        // Legacy format: Show confidence-based statistics
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
                      )}
                      {!isNewFormatCitationValidation(validation) && (
                        <div className="text-xs text-gray-600 italic">{consensus.reasoning}</div>
                      )}
                    </div>

                    {/* Panel Evaluation Details */}
                    <div className="mb-4">
                      <h5 className="text-sm font-semibold text-gray-900 mb-3">Panel Evaluation Results</h5>
                      
                      {/* Visual Summary: 5 dots + computed square */}
                      <div className="mb-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="text-xs font-medium text-gray-600 mb-2">Tier 2 Panel Summary</div>
                        <div className="flex items-center gap-3">
                          {/* All 5 agent dots */}
                          <div className="flex items-center gap-1.5">
                            {validation.panel_evaluation.map((agent, idx) => {
                              const isNewFormat = typeof agent.score === 'number'
                              return (
                                <div
                                  key={idx}
                                  className={`w-5 h-5 rounded-full ${getVerdictColor(agent.verdict, agent.score)}`}
                                  title={isNewFormat 
                                    ? `${getAgentDisplayName(agent.agent)}: ${agent.score}/10`
                                    : `${getAgentDisplayName(agent.agent)}: ${agent.verdict}`
                                  }
                                />
                              )
                            })}
                          </div>
                          
                          {/* Arrow/separator */}
                          <div className="text-gray-400">→</div>
                          
                          {/* Computed total square */}
                          {(() => {
                            const isNewFormat = isNewFormatCitationValidation(validation)
                            if (isNewFormat && consensus.average_score !== undefined) {
                              const avgScore = consensus.average_score
                              const squareColor = avgScore >= 8 ? 'bg-green-500' : avgScore >= 5 ? 'bg-yellow-500' : 'bg-red-500'
                              return (
                                <div className="flex items-center gap-2">
                                  <div 
                                    className={`w-6 h-6 rounded ${squareColor} border-2 border-gray-300`}
                                    title={`Computed Average: ${avgScore.toFixed(1)}/10`}
                                  />
                                  <span className="text-xs font-semibold text-gray-700">
                                    {avgScore.toFixed(1)}/10
                                  </span>
                                </div>
                              )
                            } else {
                              // Legacy format: use recommendation
                              const rec = consensus.recommendation
                              const squareColor = rec === 'CITATION_LIKELY_VALID' ? 'bg-green-500' :
                                                 rec === 'CITATION_LIKELY_HALLUCINATED' ? 'bg-red-500' :
                                                 'bg-yellow-500'
                              return (
                                <div className="flex items-center gap-2">
                                  <div 
                                    className={`w-6 h-6 rounded ${squareColor} border-2 border-gray-300`}
                                    title={`Computed: ${rec}`}
                                  />
                                  <span className="text-xs font-semibold text-gray-700">
                                    {rec === 'CITATION_LIKELY_VALID' ? 'VALID' :
                                     rec === 'CITATION_LIKELY_HALLUCINATED' ? 'INVALID' :
                                     'UNCERTAIN'}
                                  </span>
                                </div>
                              )
                            }
                          })()}
                        </div>
                      </div>
                      
                      {/* Detailed agent results */}
                      <div className="space-y-3">
                        {validation.panel_evaluation.map((agent, idx) => {
                          const isNewFormat = typeof agent.score === 'number'
                          return (
                            <div
                              key={idx}
                              className="p-3 border border-gray-200 rounded-md bg-white"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded-full ${getVerdictColor(agent.verdict, agent.score)}`} />
                                  <span className="text-sm font-medium text-gray-900">
                                    {getAgentDisplayName(agent.agent)}
                                  </span>
                                </div>
                                {isNewFormat ? (
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                                    (agent.score ?? 0) >= 8 ? 'bg-green-100 text-green-800' :
                                    (agent.score ?? 0) >= 5 ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {agent.score ?? 0}/10
                                  </span>
                                ) : (
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                                    agent.verdict === 'VALID' ? 'bg-green-100 text-green-800' :
                                    agent.verdict === 'INVALID' ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {agent.verdict}
                                  </span>
                                )}
                              </div>
                              {isNewFormat && agent.reasoning && (
                                <div className="mt-2 text-xs text-gray-600">
                                  <span className="font-medium">Reasoning: </span>
                                  <span className="italic">{agent.reasoning}</span>
                                </div>
                              )}
                              {!isNewFormat && (agent.invalid_reason || agent.uncertain_reason) && (
                                <div className="mt-2 text-xs text-gray-600">
                                  <span className="font-medium">Reason: </span>
                                  <span className="italic">{agent.invalid_reason || agent.uncertain_reason}</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Tier 3 Investigation Results */}
                    {citation.tier_3 && (
                      <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-md">
                        <h5 className="text-sm font-semibold text-purple-900 mb-3">Tier 3: Panel Investigation</h5>
                        <div className="space-y-3">
                          {/* Consensus Summary */}
                          {citation.tier_3?.consensus && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`px-3 py-1 text-sm font-semibold rounded ${
                                  (citation.tier_3.consensus?.final_status === "VALID" || citation.tier_3.consensus?.final_risk_level === "LOW_RISK") ? 'bg-green-100 text-green-800' :
                                  (citation.tier_3.consensus?.final_status === "FAIL" || citation.tier_3.consensus?.final_risk_level === "NEEDS_ADDITIONAL_REVIEW") ? 'bg-red-100 text-red-800' :
                                  'bg-orange-100 text-orange-800'
                                }`}>
                                  {(() => {
                                    const consensus = citation.tier_3?.consensus
                                    if (consensus?.final_risk_level) {
                                      const count = consensus.risk_level_counts?.LOW_RISK || 0
                                      return `${consensus.final_risk_level} (${count}/3 Low Risk)`
                                    } else if (consensus?.final_status) {
                                      const count = consensus.verdict_counts?.VALID || 0
                                      return `${consensus.final_status} (${count}/3 Valid)`
                                    }
                                    return 'N/A'
                                  })()}
                                </span>
                                <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800">
                                  {citation.tier_3.consensus?.agreement_level} ({Math.round((citation.tier_3.consensus?.confidence_score || 0) * 100)}%)
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mb-2">
                                {citation.tier_3.consensus?.reasoning}
                              </div>
                            </div>
                          )}
                          
                          {/* Panel Evaluation Details */}
                          {citation.tier_3.panel_evaluation && citation.tier_3.panel_evaluation.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-gray-700 mb-2">Panel Evaluation Results</div>
                              <div className="space-y-2">
                                {citation.tier_3.panel_evaluation.map((agent: any, idx: number) => {
                                  const isNewFormatT3Agent = agent.risk_level !== undefined
                                  return (
                                    <div
                                      key={idx}
                                      className="p-2 border border-gray-200 rounded-md bg-white"
                                    >
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                          <div className={`w-3 h-3 rounded-full ${
                                            isNewFormatT3Agent ? (
                                              agent.risk_level === 'LOW_RISK' ? 'bg-green-500' :
                                              agent.risk_level === 'NEEDS_ADDITIONAL_REVIEW' ? 'bg-red-500' :
                                              'bg-yellow-500'
                                            ) : (
                                              agent.verdict === 'VALID' ? 'bg-green-500' :
                                              agent.verdict === 'INVALID' ? 'bg-red-500' :
                                              'bg-yellow-500'
                                            )
                                          }`} />
                                          <span className="text-xs font-medium text-gray-900">
                                            {agent.agent}
                                          </span>
                                        </div>
                                        {isNewFormatT3Agent ? (
                                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                            agent.risk_level === 'LOW_RISK' ? 'bg-green-100 text-green-800' :
                                            agent.risk_level === 'NEEDS_ADDITIONAL_REVIEW' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                          }`}>
                                            {agent.risk_level.replace('_', ' ')}
                                          </span>
                                        ) : (
                                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                            agent.verdict === 'VALID' ? 'bg-green-100 text-green-800' :
                                            agent.verdict === 'INVALID' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                          }`}>
                                            {agent.verdict}
                                          </span>
                                        )}
                                      </div>
                                      {agent.reasoning && (
                                        <div className="text-xs text-gray-600 mt-1">
                                          {agent.reasoning}
                                        </div>
                                      )}
                                      <div className="text-xs mt-1">
                                        <span className="font-medium">Case Link: </span>
                                        {agent.case_link ? (
                                          <a 
                                            href={agent.case_link} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 underline break-all"
                                          >
                                            {agent.case_link.length > 60 
                                              ? `${agent.case_link.substring(0, 60)}...` 
                                              : agent.case_link}
                                          </a>
                                        ) : (
                                          <span className="text-gray-500 italic">NOT_FOUND</span>
                                        )}
                                      </div>
                                      {!isNewFormatT3Agent && (agent.invalid_reason || agent.uncertain_reason) && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          Reason: {agent.invalid_reason || agent.uncertain_reason}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          
                          {/* Legacy reasoning display for backward compatibility */}
                          {citation.tier_3?.reasoning && !citation.tier_3?.consensus && (
                            <div>
                              <div className="text-xs font-medium text-gray-700 mb-1">Reasoning</div>
                              <p className="text-sm text-gray-700">{citation.tier_3.reasoning}</p>
                            </div>
                          )}
                          
                          {citation.tier_3?.key_evidence && !citation.tier_3?.consensus && (
                            <div>
                              <div className="text-xs font-medium text-gray-700 mb-1">Key Evidence</div>
                              <p className="text-sm text-gray-700">{citation.tier_3.key_evidence}</p>
                            </div>
                          )}
                          
                          {citation.tier_3?.remaining_uncertainties && (
                            <div>
                              <div className="text-xs font-medium text-gray-700 mb-1">Remaining Uncertainties</div>
                              <p className="text-sm text-gray-600 italic">{citation.tier_3.remaining_uncertainties}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Verdict Summary */}
                    {citation.tier_3?.consensus && (
                      <div className="p-3 bg-gray-50 rounded-md">
                        <div className="text-xs font-medium text-gray-600 mb-2">Verdict Summary</div>
                        <div className="flex items-center gap-4 text-sm">
                          {citation.tier_3.consensus.risk_level_counts ? (
                            <>
                              <span className="text-green-700">
                                <span className="font-semibold">{citation.tier_3.consensus.risk_level_counts.LOW_RISK}</span> Low Risk
                              </span>
                              <span className="text-yellow-700">
                                <span className="font-semibold">{citation.tier_3.consensus.risk_level_counts.MODERATE_RISK}</span> Moderate Risk
                              </span>
                              <span className="text-red-700">
                                <span className="font-semibold">{citation.tier_3.consensus.risk_level_counts.NEEDS_ADDITIONAL_REVIEW}</span> Needs Review
                              </span>
                            </>
                          ) : citation.tier_3.consensus.verdict_counts ? (
                            <>
                              <span className="text-green-700">
                                <span className="font-semibold">{citation.tier_3.consensus.verdict_counts.VALID}</span> Valid
                              </span>
                              <span className="text-yellow-700">
                                <span className="font-semibold">{citation.tier_3.consensus.verdict_counts.UNCERTAIN}</span> Uncertain
                              </span>
                              <span className="text-red-700">
                                <span className="font-semibold">{citation.tier_3.consensus.verdict_counts.INVALID}</span> Invalid
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )}
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
