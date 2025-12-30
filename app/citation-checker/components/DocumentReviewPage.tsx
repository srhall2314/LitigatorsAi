"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ContentParagraph, Citation, AgentVerdict, ValidationVerdict } from "@/types/citation-json"
import { getTier3FinalStatus } from "@/lib/citation-identification/validation"
import { isNewFormatCitationValidation, getCitationRiskLevel } from "@/lib/citation-identification/format-helpers"

interface DocumentReviewPageProps {
  fileId: string
  checkId?: string
}

interface ParagraphWithCitations {
  paragraph: ContentParagraph
  citations: Citation[]
}

interface CitationIndicator {
  citationId: string
  status: "valid" | "invalid" | "uncertain" | "needs-review"
  tier3Status?: "valid" | "warn" | "fail"
}

export function DocumentReviewPage({ fileId, checkId: initialCheckId }: DocumentReviewPageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paragraphs, setParagraphs] = useState<ParagraphWithCitations[]>([])
  const [checkId, setCheckId] = useState<string | null>(initialCheckId || null)
  const [metadata, setMetadata] = useState<{ filename: string } | null>(null)
  const [updatingCitations, setUpdatingCitations] = useState<Set<string>>(new Set())
  const [revalidatingCitations, setRevalidatingCitations] = useState<Set<string>>(new Set())
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set())
  const [recentlyRevalidated, setRecentlyRevalidated] = useState<Set<string>>(new Set())
  const [editingParagraph, setEditingParagraph] = useState<{ paragraphId: string; text: string; citations: Citation[] } | null>(null)
  const [editText, setEditText] = useState<string>("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingNotes, setEditingNotes] = useState<{ paragraphId: string; notes: string } | null>(null)
  const [notesText, setNotesText] = useState<string>("")
  const [savingNotes, setSavingNotes] = useState(false)
  const [showBackToEditorWarning, setShowBackToEditorWarning] = useState(false)
  const [showDevSection, setShowDevSection] = useState(false)
  const [jsonData, setJsonData] = useState<any>(null)

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setLoading(true)
        setError(null)

        let targetCheckId = initialCheckId

        // If no checkId provided, find the latest normal workflow check
        if (!targetCheckId) {
          const fileRes = await fetch(`/api/citation-checker/files`)
          if (fileRes.ok) {
            const files = await fileRes.json()
            const file = files.find((f: any) => f.id === fileId)
            if (file?.citationChecks && file.citationChecks.length > 0) {
              // Find the latest check from normal workflow
              for (const check of file.citationChecks) {
                const workflowType = check.workflowType
                const isNormalWorkflow = !workflowType || workflowType === "standard"
                
                if (!isNormalWorkflow) continue
                
                if (check.jsonData?.document) {
                  targetCheckId = check.id
                  break
                }
              }
              
              if (!targetCheckId && file.citationChecks[0]) {
                targetCheckId = file.citationChecks[0].id
              }
            }
          }
        }

        if (targetCheckId) {
          setCheckId(targetCheckId)
          const checkRes = await fetch(`/api/citation-checker/checks/${targetCheckId}`)
          if (checkRes.ok) {
            const data = await checkRes.json()
            
            if (data.jsonData?.document) {
              const document = data.jsonData.document
              const content = document.content || []
              const citations = document.citations || []

              // Store jsonData for download
              setJsonData(data.jsonData)

              // Set metadata
              if (document.metadata) {
                setMetadata({ filename: document.metadata.filename || "Document" })
              }

              // Map citations to paragraphs
              const paragraphsWithCitations: ParagraphWithCitations[] = content.map((para: ContentParagraph) => {
                // Find citations in this paragraph by checking for citation markers
                const citationIds = new Set<string>()
                const citationMarkerRegex = /\[CITATION:([^\]]+)\]/g
                let match
                while ((match = citationMarkerRegex.exec(para.text)) !== null) {
                  citationIds.add(match[1])
                }

                // Get citation objects for this paragraph
                const paraCitations = citations.filter((cit: Citation) => 
                  citationIds.has(cit.id)
                )

                return {
                  paragraph: para,
                  citations: paraCitations,
                }
              })

              setParagraphs(paragraphsWithCitations)
            } else {
              setError("Document data not found")
            }
          } else {
            setError("Failed to load document data")
          }
        } else {
          setError("No citation check found. Please ensure the document has been processed.")
        }
      } catch (err) {
        console.error("Error loading document:", err)
        setError(err instanceof Error ? err.message : "Failed to load document")
      } finally {
        setLoading(false)
      }
    }

    loadDocument()
  }, [fileId, initialCheckId])

  const getCitationStatus = (citation: Citation): CitationIndicator["status"] => {
    // Check Tier 3 first if it exists
    if (citation.tier_3) {
      const tier3Status = getTier3FinalStatus(citation.tier_3)
      if (tier3Status === "VALID") return "valid"
      if (tier3Status === "FAIL") return "invalid"
      return "needs-review"
    }

    // Check Tier 2 validation if it exists
    if (citation.validation) {
      const riskLevel = getCitationRiskLevel(citation as any)
      if (riskLevel === "LOW_RISK") return "valid"
      if (riskLevel === "NEEDS_ADDITIONAL_REVIEW") return "needs-review"
      if (riskLevel === "MODERATE_RISK") return "uncertain"
      // Fallback to consensus recommendation
      const recommendation = citation.validation.consensus?.recommendation
      if (recommendation === "CITATION_LIKELY_VALID") return "valid"
      if (recommendation === "CITATION_LIKELY_HALLUCINATED") return "invalid"
      return "uncertain"
    }

    // Default to uncertain if no validation
    return "uncertain"
  }

  const renderParagraphText = (paraWithCitations: ParagraphWithCitations) => {
    const { paragraph, citations } = paraWithCitations
    const parts: Array<{ text: string; isCitation: boolean; citationId?: string }> = []
    let lastIndex = 0
    const citationRegex = /\[CITATION:([^\]]+)\](.*?)\[\/CITATION:\1\]/g
    let match

    // Find all citations in the text
    while ((match = citationRegex.exec(paragraph.text)) !== null) {
      // Add text before citation
      if (match.index > lastIndex) {
        parts.push({
          text: paragraph.text.substring(lastIndex, match.index),
          isCitation: false,
        })
      }

      // Add citation
      const citationId = match[1]
      const citationText = match[2]
      parts.push({
        text: citationText.trim(),
        isCitation: true,
        citationId,
      })

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < paragraph.text.length) {
      parts.push({
        text: paragraph.text.substring(lastIndex),
        isCitation: false,
      })
    }

    return parts
  }

  const getStatusIcon = (status: CitationIndicator["status"]) => {
    switch (status) {
      case "valid":
        return (
          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case "invalid":
        return (
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      case "needs-review":
        return (
          <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )
      default: // uncertain
        return (
          <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )
    }
  }

  const handleManualReview = async (citationId: string, status: "approved" | "questionable" | null) => {
    if (!checkId) return

    setUpdatingCitations(prev => new Set(prev).add(citationId))
    
    try {
      const res = await fetch(
        `/api/citation-checker/checks/${checkId}/citations/${citationId}/manual-review`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        }
      )

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to update manual review")
      }

      const data = await res.json()
      
      // Update local state
      setParagraphs(prev => prev.map(para => ({
        ...para,
        citations: para.citations.map(cit => 
          cit.id === citationId ? data.citation : cit
        ),
      })))
    } catch (err) {
      console.error("Error updating manual review:", err)
      alert(err instanceof Error ? err.message : "Failed to update manual review")
    } finally {
      setUpdatingCitations(prev => {
        const next = new Set(prev)
        next.delete(citationId)
        return next
      })
    }
  }

  const handleRevalidateCitation = async (citationId: string, forceTier3: boolean = true) => {
    if (!checkId) return

    setRevalidatingCitations(prev => new Set(prev).add(citationId))
    
    try {
      const res = await fetch(
        `/api/citation-checker/checks/${checkId}/citations/${citationId}/revalidate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            forceTier3: forceTier3, // Always force Tier 3 when rechecking from document review page
          }),
        }
      )

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to revalidate citation")
      }

      const data = await res.json()
      
      // Mark as recently revalidated for visual feedback
      setRecentlyRevalidated(prev => new Set(prev).add(citationId))
      // Clear the indicator after 3 seconds
      setTimeout(() => {
        setRecentlyRevalidated(prev => {
          const next = new Set(prev)
          next.delete(citationId)
          return next
        })
      }, 3000)
      
      // Update the specific citation in local state immediately
      // This ensures color coding updates right away
      setParagraphs(prev => prev.map(para => ({
        ...para,
        citations: para.citations.map(cit => {
          if (cit.id === citationId) {
            // Update with the revalidated citation data
            return data.citation as Citation
          }
          return cit
        }),
      })))

      // Also reload full document to ensure everything is in sync
      const checkRes = await fetch(`/api/citation-checker/checks/${checkId}`)
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        if (checkData.jsonData?.document) {
          const document = checkData.jsonData.document
          const content = document.content || []
          const citations = document.citations || []

          const paragraphsWithCitations: ParagraphWithCitations[] = content.map((para: ContentParagraph) => {
            const citationIds = new Set<string>()
            const citationMarkerRegex = /\[CITATION:([^\]]+)\]/g
            let match
            while ((match = citationMarkerRegex.exec(para.text)) !== null) {
              citationIds.add(match[1])
            }

            const paraCitations = citations.filter((cit: Citation) => 
              citationIds.has(cit.id)
            )

            return {
              paragraph: para,
              citations: paraCitations,
            }
          })

          setParagraphs(paragraphsWithCitations)
        }
      }
    } catch (err) {
      console.error("Error revalidating citation:", err)
      alert(err instanceof Error ? err.message : "Failed to revalidate citation")
    } finally {
      setRevalidatingCitations(prev => {
        const next = new Set(prev)
        next.delete(citationId)
        return next
      })
    }
  }

  const hasManualReviews = () => {
    const allCitations = paragraphs.flatMap(p => p.citations)
    return allCitations.some(c => 
      c.manualReview?.status === "approved" || 
      c.manualReview?.status === "questionable"
    )
  }

  const getManualReviewCount = () => {
    const allCitations = paragraphs.flatMap(p => p.citations)
    return {
      approved: allCitations.filter(c => c.manualReview?.status === "approved").length,
      questionable: allCitations.filter(c => c.manualReview?.status === "questionable").length,
      total: allCitations.filter(c => 
        c.manualReview?.status === "approved" || 
        c.manualReview?.status === "questionable"
      ).length
    }
  }

  const handleBackToEditor = () => {
    if (hasManualReviews()) {
      setShowBackToEditorWarning(true)
    } else {
      router.push(`/citation-checker/create-document?fileId=${fileId}`)
    }
  }

  const handleConfirmBackToEditor = () => {
    setShowBackToEditorWarning(false)
    router.push(`/citation-checker/create-document?fileId=${fileId}`)
  }

  const toggleCitationDetails = (citationId: string) => {
    setExpandedCitations(prev => {
      const next = new Set(prev)
      if (next.has(citationId)) {
        next.delete(citationId)
      } else {
        next.add(citationId)
      }
      return next
    })
  }

  const getAgentDisplayName = (agentName: string) => {
    const names: Record<string, string> = {
      'citation_authority_validator_v1': 'Authority Specialist',
      'case_ecology_validator_v1': 'Ecology Specialist',
      'temporal_reality_validator_v1': 'Temporal Specialist',
      'legal_knowledge_validator_v1': 'Knowledge Generalist',
      'reality_assessment_expert_v1': 'Reality Generalist',
    }
    return names[agentName] || agentName
  }

  const getTier3AgentDisplayName = (agentName: string) => {
    const names: Record<string, string> = {
      'tier3_rigorous_legal_investigator_v1': 'Senior Litigator Reviewer (20+ Years)',
      'tier3_holistic_legal_analyst_v1': 'Specialist Legal Researcher',
      'tier3_pattern_recognition_expert_v1': 'Appellate Clerk / Judicial Reviewer',
    }
    return names[agentName] || agentName
  }

  const getVerdictColor = (verdict?: ValidationVerdict, score?: number) => {
    if (typeof score === 'number') {
      if (score >= 8) return "bg-green-500"
      if (score >= 5) return "bg-yellow-500"
      return "bg-red-500"
    }
    if (verdict === "VALID") return "bg-green-500"
    if (verdict === "INVALID") return "bg-red-500"
    return "bg-yellow-500"
  }

  const formatConfidenceScore = (score: number) => {
    return (score * 100).toFixed(0)
  }

  const handleEditParagraph = (paraWithCitations: ParagraphWithCitations) => {
    // Show paragraph text with citation markers visible for editing
    // This allows users to see and edit citation markers if needed
    setEditText(paraWithCitations.paragraph.text)
    setEditingParagraph({
      paragraphId: paraWithCitations.paragraph.id,
      text: paraWithCitations.paragraph.text,
      citations: paraWithCitations.citations,
    })
  }

  const handleSaveEdit = async () => {
    if (!checkId || !editingParagraph) return

    setSavingEdit(true)
    
    try {
      // Extract citations from edited text by finding citation markers
      const citationMarkerRegex = /\[CITATION:([^\]]+)\](.*?)\[\/CITATION:\1\]/g
      const editedCitations: Array<{ citationId: string; citationText: string }> = []
      let match
      const matches: Array<{ citationId: string; citationText: string; startIndex: number; endIndex: number }> = []
      
      // Find all citation markers in the edited text
      while ((match = citationMarkerRegex.exec(editText)) !== null) {
        const citationId = match[1]
        const citationText = match[2].trim()
        editedCitations.push({ citationId, citationText })
        matches.push({
          citationId,
          citationText,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        })
      }

      // If citation markers are present, update citation texts
      // If no markers found but citations exist, the user may have removed markers
      // In that case, we'll save the paragraph text as-is (citations may need re-identification)
      
      const updatedParagraphText = editText

      const res = await fetch(
        `/api/citation-checker/checks/${checkId}/paragraphs/${editingParagraph.paragraphId}/edit`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paragraphText: updatedParagraphText,
            editedCitations: editedCitations.length > 0 ? editedCitations : undefined,
          }),
        }
      )

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to save edit")
      }

      const data = await res.json()

      // Show success message with info about re-identification
      if (data.newCitations && data.newCitations.length > 0) {
        console.log(`Re-identified ${data.newCitations.length} citation(s) in paragraph`)
      }
      if (data.removedCitations && data.removedCitations.length > 0) {
        console.log(`Removed ${data.removedCitations.length} old citation(s)`)
      }

      // Reload document to get updated data
      const checkRes = await fetch(`/api/citation-checker/checks/${checkId}`)
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        if (checkData.jsonData?.document) {
          const document = checkData.jsonData.document
          const content = document.content || []
          const citations = document.citations || []

          const paragraphsWithCitations: ParagraphWithCitations[] = content.map((para: ContentParagraph) => {
            const citationIds = new Set<string>()
            const citationMarkerRegex = /\[CITATION:([^\]]+)\]/g
            let match
            while ((match = citationMarkerRegex.exec(para.text)) !== null) {
              citationIds.add(match[1])
            }

            const paraCitations = citations.filter((cit: Citation) => 
              citationIds.has(cit.id)
            )

            return {
              paragraph: para,
              citations: paraCitations,
            }
          })

          setParagraphs(paragraphsWithCitations)
        }
      }

      setEditingParagraph(null)
      setEditText("")
      
      // Show success notification
      if (data.newCitations && data.newCitations.length > 0) {
        alert(`Paragraph updated. ${data.newCitations.length} citation(s) re-identified and validated.`)
      } else {
        alert("Paragraph updated successfully.")
      }
    } catch (err) {
      console.error("Error saving edit:", err)
      alert(err instanceof Error ? err.message : "Failed to save edit")
    } finally {
      setSavingEdit(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingParagraph(null)
    setEditText("")
  }

  const handleEditNotes = (paraWithCitations: ParagraphWithCitations) => {
    setNotesText(paraWithCitations.paragraph.notes || "")
    setEditingNotes({
      paragraphId: paraWithCitations.paragraph.id,
      notes: paraWithCitations.paragraph.notes || "",
    })
  }

  const handleSaveNotes = async () => {
    if (!checkId || !editingNotes) return

    setSavingNotes(true)
    
    try {
      const res = await fetch(
        `/api/citation-checker/checks/${checkId}/paragraphs/${editingNotes.paragraphId}/notes`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notes: notesText,
          }),
        }
      )

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to save notes")
      }

      // Update local state
      setParagraphs(prev => prev.map(para => 
        para.paragraph.id === editingNotes.paragraphId
          ? {
              ...para,
              paragraph: {
                ...para.paragraph,
                notes: notesText || undefined,
              },
            }
          : para
      ))

      setEditingNotes(null)
      setNotesText("")
    } catch (err) {
      console.error("Error saving notes:", err)
      alert(err instanceof Error ? err.message : "Failed to save notes")
    } finally {
      setSavingNotes(false)
    }
  }

  const handleCancelNotes = () => {
    setEditingNotes(null)
    setNotesText("")
  }

  const getParagraphIndicators = (paragraph: ParagraphWithCitations) => {
    const indicators: Array<{ type: string; icon: JSX.Element; count: number }> = []
    
    if (paragraph.citations.length > 0) {
      const statusCounts = {
        valid: 0,
        invalid: 0,
        uncertain: 0,
        "needs-review": 0,
      }

      paragraph.citations.forEach(citation => {
        const status = getCitationStatus(citation)
        statusCounts[status]++
      })

      if (statusCounts.valid > 0) {
        indicators.push({
          type: "valid-citations",
          icon: getStatusIcon("valid"),
          count: statusCounts.valid,
        })
      }
      if (statusCounts.invalid > 0) {
        indicators.push({
          type: "invalid-citations",
          icon: getStatusIcon("invalid"),
          count: statusCounts.invalid,
        })
      }
      if (statusCounts["needs-review"] > 0) {
        indicators.push({
          type: "needs-review-citations",
          icon: getStatusIcon("needs-review"),
          count: statusCounts["needs-review"],
        })
      }
      if (statusCounts.uncertain > 0) {
        indicators.push({
          type: "uncertain-citations",
          icon: getStatusIcon("uncertain"),
          count: statusCounts.uncertain,
        })
      }
    }

    return indicators
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading document...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">{error}</p>
        </div>
        <div className="mt-4">
          <Link
            href={`/citation-checker/${fileId}/full-analysis${checkId ? `?checkId=${checkId}` : ''}`}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            ← Back to Full Analysis
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Back to Editor and Generate Report Buttons */}
      <div className="flex justify-between items-start gap-4">
        {metadata && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Document</h3>
            <p className="text-blue-800">{metadata.filename}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleBackToEditor}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 whitespace-nowrap"
          >
            ← Back to Editor
          </button>
          {checkId && (
            <button
              onClick={() => {
                router.push(`/citation-checker/${fileId}/finalize-document?checkId=${checkId}`)
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 whitespace-nowrap"
            >
              Finalize Document
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Analysis Indicators</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="flex items-center gap-2">
            {getStatusIcon("valid")}
            <span className="text-sm text-gray-700">Valid Citations</span>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon("invalid")}
            <span className="text-sm text-gray-700">Invalid Citations</span>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon("uncertain")}
            <span className="text-sm text-gray-700">Uncertain Citations</span>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon("needs-review")}
            <span className="text-sm text-gray-700">Needs Review</span>
          </div>
        </div>
        <div className="pt-3 border-t border-gray-200">
          <h5 className="text-xs font-semibold text-gray-700 mb-2">Manual Review</h5>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 rounded text-xs font-medium">
                ✓ Approved
              </span>
              <span className="text-xs text-gray-600">Manually approved citation</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-300 rounded text-xs font-medium">
                ? Questionable
              </span>
              <span className="text-xs text-gray-600">Marked as questionable</span>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Review Summary */}
      {(() => {
        const allCitations = paragraphs.flatMap(p => p.citations)
        const approvedCount = allCitations.filter(c => c.manualReview?.status === "approved").length
        const questionableCount = allCitations.filter(c => c.manualReview?.status === "questionable").length
        const totalReviewed = approvedCount + questionableCount
        
        // Count citations that need human review (not yet manually reviewed)
        const needsReviewInvalid = allCitations.filter(c => 
          !c.manualReview && getCitationStatus(c) === "invalid"
        ).length
        const needsReviewUncertain = allCitations.filter(c => 
          !c.manualReview && getCitationStatus(c) === "uncertain"
        ).length
        const needsReviewNeedsReview = allCitations.filter(c => 
          !c.manualReview && getCitationStatus(c) === "needs-review"
        ).length
        const totalNeedsReview = needsReviewInvalid + needsReviewUncertain + needsReviewNeedsReview
        
        return (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Review Summary</h4>
            
            {/* Manual Review Status */}
            <div className="mb-3 pb-3 border-b border-gray-200">
              <div className="text-xs font-medium text-gray-600 mb-2">Manual Review Status</div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-800">
                  <span className="font-semibold">{totalReviewed}</span> of <span className="font-semibold">{allCitations.length}</span> citations reviewed
                </span>
                {approvedCount > 0 && (
                  <span className="text-blue-700">
                    <span className="font-semibold">{approvedCount}</span> approved
                  </span>
                )}
                {questionableCount > 0 && (
                  <span className="text-purple-700">
                    <span className="font-semibold">{questionableCount}</span> questionable
                  </span>
                )}
              </div>
            </div>

            {/* Citations Needing Review */}
            {totalNeedsReview > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-600 mb-2">Citations Needing Human Review</div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {needsReviewInvalid > 0 && (
                    <div className="flex items-center gap-2">
                      {getStatusIcon("invalid")}
                      <span className="text-red-700">
                        <span className="font-semibold">{needsReviewInvalid}</span> Invalid
                      </span>
                    </div>
                  )}
                  {needsReviewUncertain > 0 && (
                    <div className="flex items-center gap-2">
                      {getStatusIcon("uncertain")}
                      <span className="text-yellow-700">
                        <span className="font-semibold">{needsReviewUncertain}</span> Uncertain
                      </span>
                    </div>
                  )}
                  {needsReviewNeedsReview > 0 && (
                    <div className="flex items-center gap-2">
                      {getStatusIcon("needs-review")}
                      <span className="text-orange-700">
                        <span className="font-semibold">{needsReviewNeedsReview}</span> Needs Review
                      </span>
                    </div>
                  )}
                  <span className="text-gray-600 ml-auto">
                    <span className="font-semibold">{totalNeedsReview}</span> total needing review
                  </span>
                </div>
              </div>
            )}
            
            {/* All reviewed message */}
            {totalNeedsReview === 0 && totalReviewed > 0 && (
              <div className="text-sm text-green-700 font-medium">
                ✓ All citations have been manually reviewed
              </div>
            )}
            
            {/* No reviews yet */}
            {totalReviewed === 0 && (
              <div className="text-sm text-gray-600">
                No citations have been manually reviewed yet
              </div>
            )}
          </div>
        )
      })()}

      {/* Document Paragraphs */}
      <div className="space-y-4">
        {paragraphs.map((paraWithCitations, index) => {
          const indicators = getParagraphIndicators(paraWithCitations)
          const isHeading = paraWithCitations.paragraph.type === "heading"

          return (
            <div
              key={paraWithCitations.paragraph.id}
              className={`p-4 border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors ${
                isHeading ? "bg-gray-50" : ""
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Indicators Column */}
                <div className="flex-shrink-0 flex flex-col items-center gap-2 pt-1">
                  {indicators.length > 0 ? (
                    indicators.map((indicator, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col items-center"
                        title={`${indicator.type}: ${indicator.count}`}
                      >
                        {indicator.icon}
                        {indicator.count > 1 && (
                          <span className="text-xs text-gray-600 mt-0.5">
                            {indicator.count}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="w-5 h-5" /> // Spacer for alignment
                  )}
                </div>

                {/* Paragraph Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500">
                        {paraWithCitations.paragraph.id}
                      </span>
                      {isHeading && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700 rounded">
                          Heading {paraWithCitations.paragraph.level || 1}
                        </span>
                      )}
                      {paraWithCitations.citations.length > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-800 rounded">
                          {paraWithCitations.citations.length} citation{paraWithCitations.citations.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {paraWithCitations.paragraph.notes && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded flex items-center gap-1">
                          📝 Has notes
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditNotes(paraWithCitations)}
                        className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        title="Add or edit notes for this paragraph"
                      >
                        📝 {paraWithCitations.paragraph.notes ? "Edit Notes" : "Add Notes"}
                      </button>
                      <button
                        onClick={() => handleEditParagraph(paraWithCitations)}
                        className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        title="Edit paragraph and citations"
                      >
                        ✏️ Edit
                      </button>
                    </div>
                  </div>
                  
                  {/* Display Notes */}
                  {paraWithCitations.paragraph.notes && 
                   (!editingNotes || editingNotes.paragraphId !== paraWithCitations.paragraph.id) && (
                    <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-yellow-900 mb-1">Notes:</div>
                          <div className="text-sm text-yellow-800 whitespace-pre-wrap">
                            {paraWithCitations.paragraph.notes}
                          </div>
                        </div>
                        <button
                          onClick={() => handleEditNotes(paraWithCitations)}
                          className="px-2 py-1 text-xs font-medium text-yellow-700 bg-white border border-yellow-300 rounded hover:bg-yellow-100 transition-colors flex-shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <div
                      className={`text-gray-900 whitespace-pre-wrap ${
                        isHeading
                          ? `font-semibold text-lg ${
                              paraWithCitations.paragraph.level === 1
                                ? "text-xl"
                                : paraWithCitations.paragraph.level === 2
                                ? "text-lg"
                                : ""
                            }`
                          : "text-base leading-relaxed"
                      }`}
                    >
                      {renderParagraphText(paraWithCitations).map((part, partIndex) => {
                        if (part.isCitation && part.citationId) {
                          const citation = paraWithCitations.citations.find(c => c.id === part.citationId)
                          const status = citation ? getCitationStatus(citation) : "uncertain"
                          const manualReview = citation?.manualReview
                          const isRevalidated = recentlyRevalidated.has(part.citationId)
                          
                          const statusColors = {
                            valid: "bg-green-100 text-green-800 border-green-300",
                            invalid: "bg-red-100 text-red-800 border-red-300",
                            uncertain: "bg-yellow-100 text-yellow-800 border-yellow-300",
                            "needs-review": "bg-orange-100 text-orange-800 border-orange-300",
                          }

                          // Use system status color (recheck updates this)
                          // Manual review adds an indicator but doesn't override the system color
                          let displayColors = statusColors[status]
                          
                          // Add animation/pulse effect if recently revalidated
                          const animationClass = isRevalidated ? "animate-pulse ring-2 ring-indigo-400" : ""

                          return (
                            <span
                              key={partIndex}
                              className="inline-flex items-center gap-1"
                            >
                              <span
                                className={`px-1.5 py-0.5 rounded border text-sm font-medium ${displayColors} ${animationClass} transition-all duration-300`}
                                title={`Citation: ${part.text}${manualReview ? ` (Manually ${manualReview.status})` : ''}${isRevalidated ? ' (Just revalidated)' : ''}`}
                              >
                                {part.text}
                              </span>
                              {isRevalidated && (
                                <span className="text-indigo-600 animate-pulse" title="Just revalidated">
                                  ✨
                                </span>
                              )}
                              {manualReview?.status === "approved" && (
                                <span className="text-blue-600" title="Manually approved">
                                  ✓
                                </span>
                              )}
                              {manualReview?.status === "questionable" && (
                                <span className="text-purple-600" title="Marked as questionable">
                                  ?
                                </span>
                              )}
                            </span>
                          )
                        }
                        return <span key={partIndex}>{part.text}</span>
                      })}
                    </div>

                    {/* Manual Review Controls for Citations in this Paragraph */}
                    {paraWithCitations.citations.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-gray-100">
                        {paraWithCitations.citations.map((citation) => {
                          const isUpdating = updatingCitations.has(citation.id)
                          const isRevalidating = revalidatingCitations.has(citation.id)
                          const isExpanded = expandedCitations.has(citation.id)
                          const manualReview = citation.manualReview
                          const systemStatus = getCitationStatus(citation)
                          const validation = citation.validation
                          const tier3 = citation.tier_3

                          return (
                            <div
                              key={citation.id}
                              className="bg-gray-50 rounded-md border border-gray-200 overflow-hidden"
                            >
                              {/* Citation Header with Controls */}
                              <div className="flex items-center gap-2 px-3 py-2">
                                <span className="text-xs font-mono text-gray-500 flex-shrink-0">
                                  {citation.id}:
                                </span>
                                <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">
                                  {citation.citationText}
                                </span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => toggleCitationDetails(citation.id)}
                                    className="px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                                    title={isExpanded ? "Hide details" : "Show system review details"}
                                  >
                                    {isExpanded ? "▼" : "▶"} Details
                                  </button>
                                  <button
                                    onClick={() => handleRevalidateCitation(citation.id)}
                                    disabled={isRevalidating}
                                    className="px-2 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Recheck citation with AI"
                                  >
                                    {isRevalidating ? "..." : "🔄 Recheck"}
                                  </button>
                                  <button
                                    onClick={() => handleManualReview(
                                      citation.id,
                                      manualReview?.status === "approved" ? null : "approved"
                                    )}
                                    disabled={isUpdating}
                                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                      manualReview?.status === "approved"
                                        ? "bg-blue-600 text-white"
                                        : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    title="Mark as approved"
                                  >
                                    {isUpdating ? "..." : "✓ Approve"}
                                  </button>
                                  <button
                                    onClick={() => handleManualReview(
                                      citation.id,
                                      manualReview?.status === "questionable" ? null : "questionable"
                                    )}
                                    disabled={isUpdating}
                                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                      manualReview?.status === "questionable"
                                        ? "bg-purple-600 text-white"
                                        : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    title="Mark as questionable"
                                  >
                                    {isUpdating ? "..." : "? Questionable"}
                                  </button>
                                </div>
                                {manualReview && (
                                  <span className="text-xs text-gray-500 flex-shrink-0">
                                    (Reviewed)
                                  </span>
                                )}
                              </div>

                              {/* Expandable System Review Details */}
                              {isExpanded && (
                                <div className="px-3 py-3 bg-white border-t border-gray-200 space-y-3">
                                  {validation ? (
                                    <>
                                      {/* Tier 2 Validation */}
                                      <div>
                                        <h5 className="text-xs font-semibold text-gray-900 mb-2">Tier 2 System Review</h5>
                                        <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                                          {isNewFormatCitationValidation(validation) && validation.consensus.scores ? (
                                            <div className="space-y-2">
                                              <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                  <div className="text-xs font-medium text-gray-600 mb-1">Average Score</div>
                                                  <div className="text-sm font-semibold text-gray-900">
                                                    {validation.consensus.average_score?.toFixed(1)}/10
                                                  </div>
                                                </div>
                                                <div>
                                                  <div className="text-xs font-medium text-gray-600 mb-1">Agreement</div>
                                                  <div className="text-xs font-semibold text-gray-900 capitalize">
                                                    {validation.consensus.agreement_level}
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="text-xs text-gray-600 italic pt-2 border-t border-gray-200">
                                                {validation.consensus.reasoning}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="space-y-2">
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium text-gray-600">Agreement Level</span>
                                                <span className="text-xs font-semibold text-gray-900 capitalize">
                                                  {validation.consensus.agreement_level}
                                                </span>
                                              </div>
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium text-gray-600">Confidence</span>
                                                <span className="text-xs font-semibold text-gray-700">
                                                  {formatConfidenceScore(validation.consensus.confidence_score)}%
                                                </span>
                                              </div>
                                              <div className="text-xs text-gray-600 italic pt-2 border-t border-gray-200">
                                                {validation.consensus.reasoning}
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        {/* Panel Evaluation */}
                                        <div className="mt-2">
                                          <div className="text-xs font-medium text-gray-600 mb-2">Panel Evaluation</div>
                                          <div className="space-y-1.5">
                                            {validation.panel_evaluation.map((agent: AgentVerdict, idx: number) => {
                                              const isNewFormat = typeof agent.score === 'number'
                                              return (
                                                <div
                                                  key={idx}
                                                  className="flex items-center justify-between px-2 py-1 bg-white rounded border border-gray-200"
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full ${getVerdictColor(agent.verdict, agent.score)}`} />
                                                    <span className="text-xs text-gray-700">
                                                      {getAgentDisplayName(agent.agent)}
                                                    </span>
                                                  </div>
                                                  {isNewFormat ? (
                                                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                                      (agent.score ?? 0) >= 8 ? 'bg-green-100 text-green-800' :
                                                      (agent.score ?? 0) >= 5 ? 'bg-yellow-100 text-yellow-800' :
                                                      'bg-red-100 text-red-800'
                                                    }`}>
                                                      {agent.score ?? 0}/10
                                                    </span>
                                                  ) : (
                                                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                                      agent.verdict === 'VALID' ? 'bg-green-100 text-green-800' :
                                                      agent.verdict === 'INVALID' ? 'bg-red-100 text-red-800' :
                                                      'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                      {agent.verdict}
                                                    </span>
                                                  )}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-gray-500 italic">
                                      No system validation available. Click "Recheck" to run validation.
                                    </div>
                                  )}

                                  {/* Tier 3 Review if exists */}
                                  {tier3 && (
                                    <div className="pt-2 border-t border-gray-200">
                                      <h5 className="text-xs font-semibold text-gray-900 mb-2">Tier 3 Deep Review</h5>
                                      <div className="p-3 bg-purple-50 rounded-md border border-purple-200 space-y-3">
                                        {/* Consensus Summary */}
                                        <div>
                                          <div className="flex items-center gap-2 mb-2">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                              (() => {
                                                const tier3Status = getTier3FinalStatus(tier3)
                                                return tier3Status === "VALID" ? 'bg-green-100 text-green-800' :
                                                       tier3Status === "FAIL" ? 'bg-red-100 text-red-800' :
                                                       'bg-orange-100 text-orange-800'
                                              })()
                                            }`}>
                                              {(() => {
                                                const tier3Status = getTier3FinalStatus(tier3)
                                                return tier3Status || 'UNKNOWN'
                                              })()}
                                            </span>
                                            {tier3.consensus && (
                                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                                (tier3.consensus.confidence_score || 0) >= 0.8 ? 'bg-green-100 text-green-800' :
                                                (tier3.consensus.confidence_score || 0) >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-gray-100 text-gray-800'
                                              }`}>
                                                {formatConfidenceScore(tier3.consensus.confidence_score)}% Confidence
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-xs text-gray-700 whitespace-pre-wrap">
                                            {tier3.consensus?.reasoning || tier3.reasoning || "Tier 3 review completed"}
                                          </div>
                                          {tier3.consensus && (
                                            <div className="mt-2 text-xs text-gray-600">
                                              Agreement: {tier3.consensus.agreement_level} ({formatConfidenceScore(tier3.consensus.confidence_score)}%)
                                            </div>
                                          )}
                                        </div>

                                        {/* Tier 3 Panel Evaluation Details - Expandable */}
                                        {tier3.panel_evaluation && tier3.panel_evaluation.length > 0 && (
                                          <details className="mt-2">
                                            <summary className="cursor-pointer text-xs font-semibold text-purple-900 hover:text-purple-700 mb-2">
                                              Show Tier 3 Panel Details ({tier3.panel_evaluation.length} agents)
                                            </summary>
                                            <div className="mt-2 space-y-2 pt-2 border-t border-purple-200">
                                              {tier3.panel_evaluation.map((agent: any, idx: number) => (
                                                <div
                                                  key={idx}
                                                  className="p-2 border border-purple-200 rounded-md bg-white"
                                                >
                                                  <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                      <div className={`w-3 h-3 rounded-full ${
                                                        agent.verdict === 'VALID' ? 'bg-green-500' :
                                                        agent.verdict === 'INVALID' ? 'bg-red-500' :
                                                        'bg-yellow-500'
                                                      }`} />
                                                      <span className="text-xs font-medium text-gray-900">
                                                        {getTier3AgentDisplayName(agent.agent)}
                                                      </span>
                                                    </div>
                                                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                                      agent.verdict === 'VALID' ? 'bg-green-100 text-green-800' :
                                                      agent.verdict === 'INVALID' ? 'bg-red-100 text-red-800' :
                                                      'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                      {agent.verdict}
                                                    </span>
                                                  </div>
                                                  {agent.reasoning && (
                                                    <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">
                                                      <span className="font-medium">Reasoning: </span>
                                                      <span>{agent.reasoning}</span>
                                                    </div>
                                                  )}
                                                  <div className="mt-1 text-xs">
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
                                                  {(agent.invalid_reason || agent.uncertain_reason) && (
                                                    <div className="mt-1 text-xs text-gray-600">
                                                      <span className="font-medium">Reason Code: </span>
                                                      <span className="italic">{agent.invalid_reason || agent.uncertain_reason}</span>
                                                    </div>
                                                  )}
                                                  <div className="mt-1 text-xs text-gray-500">
                                                    Model: {agent.model} • {new Date(agent.timestamp).toLocaleString()}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </details>
                                        )}

                                        {/* Legacy fields display (if present and panel_evaluation not available) */}
                                        {(!tier3.panel_evaluation || tier3.panel_evaluation.length === 0) && tier3.key_evidence && (
                                          <div className="pt-2 border-t border-purple-200">
                                            <div className="text-xs font-medium text-gray-700 mb-1">Key Evidence</div>
                                            <p className="text-xs text-gray-700 whitespace-pre-wrap">{tier3.key_evidence}</p>
                                          </div>
                                        )}
                                        
                                        {(!tier3.panel_evaluation || tier3.panel_evaluation.length === 0) && tier3.remaining_uncertainties && (
                                          <div className="pt-2 border-t border-purple-200">
                                            <div className="text-xs font-medium text-gray-700 mb-1">Remaining Uncertainties</div>
                                            <p className="text-xs text-gray-600 italic whitespace-pre-wrap">{tier3.remaining_uncertainties}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-6 border-t border-gray-200">
        <Link
          href={`/citation-checker/${fileId}/full-analysis${checkId ? `?checkId=${checkId}` : ''}`}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
        >
          ← Back to Full Analysis
        </Link>
        <Link
          href={`/citation-checker/${fileId}/report${checkId ? `?checkId=${checkId}` : ''}`}
          className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          View Full Report →
        </Link>
      </div>

      {/* Development Test Section */}
      {showDevSection && (
        <div className="mt-8 border-t-4 border-orange-300 pt-6">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-orange-900">Development Test Section</h3>
                <p className="text-sm text-orange-700 mt-1">
                  Download JSON data for testing and development purposes
                </p>
              </div>
              <button
                onClick={() => setShowDevSection(false)}
                className="px-3 py-1 text-xs bg-orange-200 text-orange-800 rounded hover:bg-orange-300"
              >
                Hide
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-orange-900 mb-2">Complete Citation Check Data</h4>
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    Check ID: <span className="font-mono text-xs">{checkId || 'N/A'}</span>
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        if (!checkId) {
                          alert('No check ID available')
                          return
                        }
                        
                        // Fetch the complete check record from the database
                        const checkRes = await fetch(`/api/citation-checker/checks/${checkId}`)
                        if (!checkRes.ok) {
                          throw new Error('Failed to fetch check data')
                        }
                        
                        const completeCheckData = await checkRes.json()
                        
                        // Download the entire check record
                        const blob = new Blob([JSON.stringify(completeCheckData, null, 2)], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        const dateStr = new Date().toISOString().split('T')[0]
                        a.download = `citation-check-${fileId}-${checkId}-${dateStr}.json`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        URL.revokeObjectURL(url)
                      } catch (error) {
                        console.error('Error downloading JSON:', error)
                        alert('Failed to download JSON. Please try again.')
                      }
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium shadow-sm"
                  >
                    Download JSON
                  </button>
                  <p className="text-xs text-orange-600 mt-1">
                    Downloads the complete citation check record including: full document text (all paragraphs with inline citations), all citation validation data (Tier 2, Tier 3, manual reviews), workflow metadata, and related file/user information
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show Dev Section Toggle */}
      {!showDevSection && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={() => setShowDevSection(true)}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Show Development Test Section
          </button>
        </div>
      )}

      {/* Edit Notes Modal */}
      {editingNotes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Notes for Paragraph: {editingNotes.paragraphId}
              </h3>
              <p className="text-sm text-gray-600">
                Add notes or comments about this paragraph for your reference.
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  className="w-full h-48 p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter your notes about this paragraph..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={handleCancelNotes}
                disabled={savingNotes}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingNotes ? "Saving..." : "Save Notes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Paragraph Modal */}
      {editingParagraph && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Edit Paragraph: {editingParagraph.paragraphId}
              </h3>
              <p className="text-sm text-gray-600">
                Edit the paragraph text and citation text. After saving, citations will be re-identified and validated for this paragraph only.
              </p>
              {savingEdit && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-blue-800">
                      Saving and re-identifying citations...
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paragraph Text
                </label>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full h-64 p-3 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter paragraph text..."
                />
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-500">
                    {editingParagraph.citations.length > 0 ? (
                      <>
                        This paragraph contains {editingParagraph.citations.length} citation{editingParagraph.citations.length !== 1 ? 's' : ''}. 
                        Citation markers are shown as <code className="bg-gray-100 px-1 rounded">[CITATION:id]...[/CITATION:id]</code>
                      </>
                    ) : (
                      "Edit the paragraph text as needed."
                    )}
                  </p>
                  <p className="text-xs text-amber-600">
                    <strong>Note:</strong> If you edit citation text, make sure to keep the citation markers intact, or the citation may need to be re-identified.
                  </p>
                </div>
              </div>

              {editingParagraph.citations.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">
                    Citations in this paragraph:
                  </h4>
                  <div className="space-y-2">
                    {editingParagraph.citations.map((citation) => {
                      // Check if this citation is in the edited text
                      const hasMarker = editText.includes(`[CITATION:${citation.id}]`)
                      return (
                        <div key={citation.id} className={`text-xs p-2 rounded ${hasMarker ? 'bg-white' : 'bg-amber-50 border border-amber-200'}`}>
                          <div className="flex items-start gap-2">
                            <span className="font-mono font-semibold text-gray-700">{citation.id}:</span>
                            <div className="flex-1">
                              <div className="text-gray-700">{citation.citationText}</div>
                              {!hasMarker && (
                                <div className="text-amber-700 mt-1 italic">
                                  ⚠️ Citation marker not found in edited text
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                disabled={savingEdit}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editText.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back to Editor Warning Dialog */}
      {showBackToEditorWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Warning: Manual Reviews Will Be Lost
            </h3>
            <div className="mb-6">
              <p className="text-gray-700 mb-2">
                You have manual review decisions that will be lost if you edit the document:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 mb-4">
                {getManualReviewCount().approved > 0 && (
                  <li>{getManualReviewCount().approved} approved citation(s)</li>
                )}
                {getManualReviewCount().questionable > 0 && (
                  <li>{getManualReviewCount().questionable} questionable citation(s)</li>
                )}
              </ul>
              <p className="text-gray-700">
                Editing the document will require re-running citation validation, and your manual review decisions will need to be made again.
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowBackToEditorWarning(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBackToEditor}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

