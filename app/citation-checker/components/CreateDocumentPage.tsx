"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { DocumentWizard, DocumentWizardData } from "./DocumentWizard"
import { buildWizardPrompt } from "@/lib/ai/document-generation"
// @ts-ignore - diff-match-patch types may not be available
import * as dmpModule from "diff-match-patch"
const DiffMatchPatch = (dmpModule as any).default || dmpModule

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

type InteractionMode = "ask" | "edit"
type Provider = "anthropic" | "openai" | "gemini" | "grok"

interface PendingChange {
  originalText: string
  newText: string
  userMessage: string
}

interface SavedPrompt {
  id: string
  name: string
  prompt: string
  isDefault?: boolean
}

interface TokenUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  provider?: Provider
  model?: string
  cost?: {
    input_cost: number
    output_cost: number
    total_cost: number
  }
}

export function CreateDocumentPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [showWizard, setShowWizard] = useState(true)
  const [documentText, setDocumentText] = useState("")
  const [documentName, setDocumentName] = useState("")
  const [currentFileId, setCurrentFileId] = useState<string | null>(null)
  const [loadingDocument, setLoadingDocument] = useState(false)
  
  // Wrapper to log document text changes
  const setDocumentTextWithLogging = (newText: string, reason: string) => {
    console.log('[DocumentState] Setting document text:', {
      reason,
      previousLength: documentText.length,
      newLength: newText.length,
      previousPreview: documentText.substring(0, 100),
      newPreview: newText.substring(0, 100),
      isEmpty: newText.trim().length === 0,
    })
    if (newText.trim().length === 0 && documentText.trim().length > 0) {
      console.error('[DocumentState] WARNING: Document is being cleared!', {
        previousLength: documentText.length,
        reason,
      })
    }
    setDocumentText(newText)
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState("")
  const [mode, setMode] = useState<InteractionMode>("edit")
  const [autoApply, setAutoApply] = useState(true) // Auto-apply changes by default
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Saved prompts state - loaded from API
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
  const [promptsLoading, setPromptsLoading] = useState(true)
  const [editingPrompt, setEditingPrompt] = useState<{ id: string | null; name: string; prompt: string } | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)

  // Development test section state
  const [provider, setProvider] = useState<Provider>("anthropic")
  const [model, setModel] = useState<string>("claude-3-5-haiku-20241022")
  const [tokenUsageHistory, setTokenUsageHistory] = useState<TokenUsage[]>([])
  const [showDevSection, setShowDevSection] = useState(true)

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  // Load prompts from API on mount
  useEffect(() => {
    const loadPrompts = async () => {
      if (!session?.user) {
        setPromptsLoading(false)
        return
      }

      try {
        const response = await fetch("/api/citation-checker/create-document/prompts")
        if (response.ok) {
          const data = await response.json()
          setSavedPrompts(data.prompts || [])
        } else {
          console.error("Failed to load prompts:", response.statusText)
        }
      } catch (error) {
        console.error("Error loading prompts:", error)
      } finally {
        setPromptsLoading(false)
      }
    }

    loadPrompts()
  }, [session])

  // Load existing document if fileId is provided
  useEffect(() => {
    const loadDocument = async () => {
      const fileId = searchParams.get('fileId')
      if (!fileId || currentFileId === fileId) {
        return // Already loaded or no fileId
      }

      setLoadingDocument(true)
      try {
        const response = await fetch(`/api/citation-checker/create-document/load?fileId=${fileId}`)
        if (response.ok) {
          const data = await response.json()
          setDocumentTextWithLogging(data.documentText, 'Loaded existing document')
          setDocumentName(data.filename || "")
          setCurrentFileId(data.fileId)
          setShowWizard(false) // Skip wizard when editing existing document
          
          // Handle documents that have been through citation workflow
          if (data.hasJsonData) {
            if (data.hasManualReviews) {
              const proceed = confirm(
                `Warning: This document has ${data.manualReviewCount} manual review decision(s) that will be lost if you edit it.\n\n` +
                `Editing will require re-running citation validation.\n\n` +
                `Do you want to continue?`
              )
              if (!proceed) {
                router.back()
                return
              }
            } else {
              alert(data.warning || "This document has been processed through citation checking.")
            }
          }
        } else {
          const errorData = await response.json()
          console.error("Failed to load document:", errorData.error)
          alert(`Failed to load document: ${errorData.error || 'Unknown error'}`)
        }
      } catch (error) {
        console.error("Error loading document:", error)
        alert(`Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setLoadingDocument(false)
      }
    }

    loadDocument()
  }, [searchParams, currentFileId, router])

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || loading) return

    const userMessage = currentMessage.trim()
    setCurrentMessage("")
    
    // Add user message to chat
    const newUserMessage: ChatMessage = { role: "user", content: userMessage }
    setChatMessages((prev) => [...prev, newUserMessage])
    setLoading(true)

    try {
      const response = await fetch("/api/citation-checker/create-document/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: chatMessages,
          currentDocument: documentText || null,
          mode: mode, // "ask" or "edit"
          provider: provider,
          model: model,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate response")
      }

      const data = await response.json()
      
      // Track token usage for development section
      if (data.tokenUsage) {
        const usage: TokenUsage = {
          input_tokens: data.tokenUsage.input_tokens || 0,
          output_tokens: data.tokenUsage.output_tokens || 0,
          total_tokens: data.tokenUsage.total_tokens || 0,
          provider: data.tokenUsage.provider || provider,
          model: data.tokenUsage.model || model,
          cost: data.tokenUsage.cost,
        }
        setTokenUsageHistory((prev) => [...prev, usage])
      }
      
      console.log('[DocumentUpdate] Response received:', {
        hasParsedResponse: !!data.parsedResponse,
        parsedResponse: data.parsedResponse,
        rawResponseLength: data.response?.length || 0,
        mode,
        autoApply,
        currentDocumentLength: documentText.length,
        tokenUsage: data.tokenUsage,
      })
      
      // Handle JSON response structure
      let documentContent: string | null = null
      let explanation: string = ""
      let chatMessageContent: string = ""

      if (data.parsedResponse && data.parsedResponse.document) {
        // JSON response - extract structured data
        documentContent = data.parsedResponse.document
        explanation = data.parsedResponse.explanation || ""
        
        console.log('[DocumentUpdate] JSON response parsed:', {
          documentLength: documentContent?.length || 0,
          explanationLength: explanation.length,
          documentPreview: documentContent ? documentContent.substring(0, 100) + '...' : 'N/A',
        })
        
        // Build chat message with explanation (if any) and note about document update
        if (explanation) {
          chatMessageContent = explanation
        } else {
          chatMessageContent = "Document updated."
        }
      } else {
        // Fallback to old format (non-JSON response)
        console.warn('[DocumentUpdate] No parsedResponse, falling back to extractDocumentContent')
        documentContent = extractDocumentContent(data.response)
        chatMessageContent = data.response
        
        console.log('[DocumentUpdate] Extracted content:', {
          extractedLength: documentContent.length,
          extractedPreview: documentContent.substring(0, 100) + '...',
        })
      }

      // Update chat messages
      const assistantMessage: ChatMessage = { 
        role: "assistant", 
        content: chatMessageContent 
      }
      setChatMessages((prev) => [...prev, assistantMessage])

      // Only update document text if in "edit" mode
      // In "ask" mode, the AI answers questions but doesn't modify the document
      if (mode === "edit" && documentContent) {
        console.log('[DocumentUpdate] Processing edit mode update:', {
          documentContentLength: documentContent.length,
          currentDocumentLength: documentText.length,
          documentContentIsEmpty: documentContent.trim().length === 0,
        })
        
        // Check if response looks like document content
        const looksLikeDocument = documentContent.length > 100 || 
            (documentContent.includes('\n\n') && documentContent.split('\n').length > 3) ||
            (documentText.trim().length > 0 && documentContent.length > documentText.length * 0.5)
        
        console.log('[DocumentUpdate] Document validation:', {
          looksLikeDocument,
          lengthCheck: documentContent.length > 100,
          hasParagraphs: documentContent.includes('\n\n') && documentContent.split('\n').length > 3,
          lengthRatio: documentText.trim().length > 0 ? documentContent.length / documentText.length : 0,
        })
        
        if (looksLikeDocument) {
          if (autoApply) {
            console.log('[DocumentUpdate] Auto-apply enabled, processing update')
            
            // Auto-apply: intelligently handle changes
            if (documentText.trim().length === 0) {
              // Empty document - just set the content
              console.log('[DocumentUpdate] Empty document, setting new content:', {
                newContentLength: documentContent.length,
              })
              setDocumentTextWithLogging(documentContent, 'Empty document - setting new content')
            } else {
              // Existing document - check similarity to determine merge strategy
              const dmp = new DiffMatchPatch()
              
              // Calculate similarity (0-1 scale)
              const similarity = dmp.diff_levenshtein(
                dmp.diff_main(documentText, documentContent)
              )
              const maxLength = Math.max(documentText.length, documentContent.length)
              const similarityRatio = maxLength > 0 ? 1 - (similarity / maxLength) : 0
              
              console.log('[DocumentUpdate] Similarity calculation:', {
                similarity,
                maxLength,
                similarityRatio,
                originalLength: documentText.length,
                newLength: documentContent.length,
              })
              
              // If documents are very similar (>70%), the AI likely returned an updated version
              // If very different, it might be a major rewrite - show diff for safety
              if (similarityRatio > 0.7) {
                // Similar documents - AI returned updated version, use it
                console.log('[DocumentUpdate] Similar documents (>70%), applying update:', {
                  similarityRatio,
                  willSetLength: documentContent.length,
                })
                setDocumentTextWithLogging(documentContent, 'Similar documents - applying update')
              } else {
                // Very different - might be accidental replacement, show diff for review
                console.warn('[DocumentUpdate] Documents very different, showing diff for review:', {
                  similarityRatio,
                  originalLength: documentText.length,
                  newLength: documentContent.length,
                })
                setPendingChange({
                  originalText: documentText,
                  newText: documentContent,
                  userMessage: userMessage,
                })
              }
            }
          } else {
            // Manual review: show diff view
            console.log('[DocumentUpdate] Auto-apply disabled, showing diff for review')
            setPendingChange({
              originalText: documentText,
              newText: documentContent,
              userMessage: userMessage,
            })
          }
        } else {
          console.warn('[DocumentUpdate] Response does not look like document content, skipping update:', {
            documentContentLength: documentContent.length,
            looksLikeDocument,
          })
        }
      } else {
        if (mode !== "edit") {
          console.log('[DocumentUpdate] Not in edit mode, skipping document update')
        } else if (!documentContent) {
          console.warn('[DocumentUpdate] No document content extracted, skipping update')
        }
      }
      // In "ask" mode, we don't update the document - just show the answer in chat
    } catch (error) {
      console.error("Error sending message:", error)
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to generate response"}`,
      }
      setChatMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleApplyPrompt = (prompt: string) => {
    setCurrentMessage(prompt)
    textareaRef.current?.focus()
  }

  const handleEditPrompt = (prompt: SavedPrompt) => {
    setEditingPrompt({ id: prompt.id, name: prompt.name, prompt: prompt.prompt })
    setShowEditDialog(true)
  }

  const handleCreatePrompt = () => {
    setEditingPrompt({ id: null, name: "", prompt: "" })
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!editingPrompt || !session?.user) return
    
    const isNew = editingPrompt.id === null
    const name = editingPrompt.name.trim()
    const promptText = editingPrompt.prompt.trim()

    if (!name || !promptText) {
      alert("Please provide both a name and prompt text")
      return
    }

    try {
      if (isNew) {
        // Create new prompt
        const response = await fetch("/api/citation-checker/create-document/prompts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            prompt: promptText,
            isDefault: false,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to create prompt")
        }

        const newPrompt = await response.json()
        setSavedPrompts(prev => [...prev, newPrompt])
      } else {
        // Update existing prompt
        const response = await fetch("/api/citation-checker/create-document/prompts", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: editingPrompt.id,
            name,
            prompt: promptText,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to update prompt")
        }

        const updatedPrompt = await response.json()
        setSavedPrompts(prev =>
          prev.map(p => p.id === updatedPrompt.id ? updatedPrompt : p)
        )
      }

      setShowEditDialog(false)
      setEditingPrompt(null)
    } catch (error) {
      console.error("Error saving prompt:", error)
      alert(`Failed to save prompt: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const handleDeletePrompt = async (promptId: string) => {
    if (!confirm("Are you sure you want to delete this prompt?")) {
      return
    }

    try {
      const response = await fetch(`/api/citation-checker/create-document/prompts?id=${promptId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete prompt")
      }

      setSavedPrompts(prev => prev.filter(p => p.id !== promptId))
    } catch (error) {
      console.error("Error deleting prompt:", error)
      alert(`Failed to delete prompt: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const handleCancelEdit = () => {
    setShowEditDialog(false)
    setEditingPrompt(null)
  }

  const handleAcceptChange = () => {
    if (pendingChange) {
      setDocumentTextWithLogging(pendingChange.newText, 'User accepted changes from diff view')
      setPendingChange(null)
    }
  }

  const handleRejectChange = () => {
    setPendingChange(null)
  }

  /**
   * Extract document content from AI response, removing any explanatory text
   */
  const extractDocumentContent = (response: string): string => {
    // Remove common explanatory prefixes
    const explanatoryPrefixes = [
      /^here are the (document )?edits?:?\s*/i,
      /^here (is|are) the (updated |revised |modified )?document:?\s*/i,
      /^i'?ve (made|applied) the following (changes|edits):?\s*/i,
      /^here (is|are) your (updated |revised |modified )?document:?\s*/i,
      /^below (is|are) the (changes|edits):?\s*/i,
      /^the (updated |revised |modified )?document (is|follows):?\s*/i,
    ]

    let cleaned = response.trim()

    // Try to remove explanatory prefixes
    for (const prefix of explanatoryPrefixes) {
      cleaned = cleaned.replace(prefix, '')
    }

    // Look for patterns like "---" or "```" that might separate explanatory text from document
    const separators = [
      /^[^\n]*\n-{3,}\n/i,  // Text followed by horizontal rule
      /^[^\n]*\n={3,}\n/i,  // Text followed by equals signs
      /^```[^\n]*\n/i,      // Code block marker
    ]

    for (const separator of separators) {
      const match = cleaned.match(separator)
      if (match) {
        cleaned = cleaned.substring(match[0].length)
      }
    }

    // If response starts with quotes or explanatory text followed by newlines, try to find where document starts
    // Look for common document patterns (headings, legal formatting, etc.)
    const lines = cleaned.split('\n')
    let documentStartIndex = 0

    // Skip lines that look like explanatory text (short, conversational)
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim()
      // If line is very short and conversational, it's probably explanatory
      if (line.length < 60 && (
        line.toLowerCase().includes('here') ||
        line.toLowerCase().includes('below') ||
        line.toLowerCase().includes('following') ||
        line.toLowerCase().startsWith('i\'ve') ||
        line.toLowerCase().startsWith('i have')
      )) {
        documentStartIndex = i + 1
      } else {
        // Found what looks like document content
        break
      }
    }

    cleaned = lines.slice(documentStartIndex).join('\n').trim()

    // Remove trailing explanatory text (look for patterns at the end)
    const explanatorySuffixes = [
      /\n-{3,}\n[^\n]*$/i,
      /\n={3,}\n[^\n]*$/i,
      /\n```[^\n]*$/i,
    ]

    for (const suffix of explanatorySuffixes) {
      cleaned = cleaned.replace(suffix, '')
    }

    return cleaned.trim()
  }

  const renderDiff = (original: string, modified: string): JSX.Element[] => {
    const dmp = new DiffMatchPatch()
    const diffs = dmp.diff_main(original, modified)
    dmp.diff_cleanupSemantic(diffs)

    const elements: JSX.Element[] = []
    let key = 0

    diffs.forEach(([operation, text]: [number, string]) => {
      // Split by newlines to handle line breaks properly
      const parts = text.split(/(\n)/)
      
      parts.forEach((part, partIdx) => {
        if (part === '\n') {
          elements.push(<br key={`br-${key++}`} />)
        } else if (part.length > 0) {
          if (operation === -1) { // DIFF_DELETE
            elements.push(
              <span key={key++} className="bg-red-100 text-red-800 line-through">
                {part}
              </span>
            )
          } else if (operation === 1) { // DIFF_INSERT
            elements.push(
              <span key={key++} className="bg-green-100 text-green-800 font-medium">
                {part}
              </span>
            )
          } else { // DIFF_EQUAL (0)
            elements.push(
              <span key={key++} className="text-gray-700">
                {part}
              </span>
            )
          }
        }
      })
    })

    return elements
  }

  const handleSave = async (navigateToCitation = false) => {
    if (!documentText.trim()) {
      alert("Please create or edit a document before saving")
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/citation-checker/create-document/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentText: documentText,
          filename: documentName.trim() || undefined, // Include filename if provided
          fileId: currentFileId, // Include fileId if updating existing document
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to save document")
      }

      const data = await response.json()
      
      // Update currentFileId if this was a new document
      if (!currentFileId && data.fileUpload?.id) {
        setCurrentFileId(data.fileUpload.id)
      }
      
      if (navigateToCitation) {
        // Navigate to validate citations (unified pipeline)
        const fileId = data.fileUpload?.id || currentFileId
        if (fileId) {
          router.push(`/citation-checker/${fileId}/run-citation-checker`)
        }
      } else {
        // Just show success message
        alert("Document saved successfully!")
      }
    } catch (error) {
      console.error("Error saving document:", error)
      alert(`Failed to save document: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndContinue = async () => {
    await handleSave(true)
  }

  const handleWizardGenerate = async (wizardData: DocumentWizardData) => {
    setLoading(true)
    try {
      // Build prompt from wizard data
      const wizardPrompt = buildWizardPrompt(wizardData)
      
      // Call the chat API to generate the document
      const response = await fetch("/api/citation-checker/create-document/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: wizardPrompt,
          conversationHistory: [],
          currentDocument: null,
          mode: "edit",
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate document")
      }

      const data = await response.json()
      
      // Handle JSON response structure
      let documentContent: string = ""
      let explanation: string = ""
      
      if (data.parsedResponse && data.parsedResponse.document) {
        // JSON response - extract structured data
        documentContent = data.parsedResponse.document
        explanation = data.parsedResponse.explanation || "Document generated."
      } else {
        // Fallback to old format
        documentContent = data.response
        explanation = "Document generated."
      }
      
      // Set the generated document
      setDocumentTextWithLogging(documentContent, 'Wizard generated document')
      
      // Add initial messages to chat
      setChatMessages([
        { role: "user", content: wizardPrompt },
        { role: "assistant", content: explanation },
      ])
      
      // Hide wizard and show editor
      setShowWizard(false)
    } catch (error) {
      console.error("Error generating document from wizard:", error)
      alert(`Failed to generate document: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  const handleWizardSkip = () => {
    setShowWizard(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Show loading state when loading existing document
  if (loadingDocument) {
    return (
      <div className="text-center py-12">
        <div className="inline-block p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <p className="text-indigo-800 font-medium">Loading document...</p>
          <p className="text-indigo-600 text-sm mt-1">Please wait</p>
        </div>
      </div>
    )
  }

  // Show wizard if it hasn't been completed yet
  if (showWizard) {
    return (
      <div>
        <DocumentWizard
          onGenerate={handleWizardGenerate}
          onSkip={handleWizardSkip}
        />
        {loading && (
          <div className="mt-4 text-center">
            <div className="inline-block p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-indigo-800 font-medium">Generating your document...</p>
              <p className="text-indigo-600 text-sm mt-1">This may take a moment</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  const handleClearChat = () => {
    if (confirm("Clear all chat messages? This will not affect your document.")) {
      setChatMessages([])
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-[calc(100vh-180px)] min-h-[700px]">
        {/* Left Panel: Document Editor */}
        <div className="border-r border-gray-200 flex flex-col h-full overflow-hidden">
          <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-black">Document Editor</h2>
                <p className="text-sm text-gray-600">Edit your document directly or use the chat to generate content</p>
              </div>
              <button
                onClick={() => {
                  if (confirm("Return to wizard? Your current document will be cleared.")) {
                    setShowWizard(true)
                    setDocumentTextWithLogging("", 'User returned to wizard')
                    setDocumentName("")
                    setChatMessages([])
                  }
                }}
                className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
              >
                New Document
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Name
              </label>
              <input
                type="text"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Enter document name..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4 overflow-auto">
            <textarea
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              placeholder="Your document will appear here. Use the chat panel to generate content, or type directly in this editor."
              className="w-full h-full resize-none border border-gray-300 rounded-md p-4 text-sm font-mono text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-3">
              <button
                onClick={() => handleSave(false)}
                disabled={!documentText.trim() || saving}
                className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleSaveAndContinue}
                disabled={!documentText.trim() || saving}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Chat Interface */}
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-black">AI Assistant</h2>
            <p className="text-sm text-gray-600">Chat with AI to generate or modify your document</p>
          </div>

          {/* Saved Prompts */}
          <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Quick Prompts:</span>
              <button
                onClick={handleCreatePrompt}
                className="text-xs text-indigo-600 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-2 py-1 flex items-center gap-1"
                title="Create new prompt"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New
              </button>
            </div>
            {promptsLoading ? (
              <div className="text-xs text-gray-500 py-2">Loading prompts...</div>
            ) : savedPrompts.length === 0 ? (
              <div className="text-xs text-gray-500 py-2">
                No saved prompts. Click "New" to create one.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {savedPrompts.map((prompt) => (
                  <div key={prompt.id} className="relative group">
                    <button
                      onClick={() => handleApplyPrompt(prompt.prompt)}
                      className="px-3 py-1 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
                    >
                      {prompt.name}
                    </button>
                    <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditPrompt(prompt)
                        }}
                        className="p-0.5 hover:bg-gray-200 rounded-l-md"
                        title="Edit prompt"
                      >
                        <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeletePrompt(prompt.id)
                        }}
                        className="p-0.5 hover:bg-red-200 rounded-r-md"
                        title="Delete prompt"
                      >
                        <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edit/Create Prompt Dialog */}
          {showEditDialog && editingPrompt && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-black mb-4">
                  {editingPrompt.id === null ? "Create New Prompt" : "Edit Prompt"}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Prompt Name
                    </label>
                    <input
                      type="text"
                      value={editingPrompt.name}
                      onChange={(e) => setEditingPrompt({ ...editingPrompt, name: e.target.value })}
                      placeholder="e.g., Legal Brief, Motion for Summary Judgment"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Prompt Text
                    </label>
                    <textarea
                      value={editingPrompt.prompt}
                      onChange={(e) => setEditingPrompt({ ...editingPrompt, prompt: e.target.value })}
                      rows={6}
                      placeholder="Enter the prompt text that will be used to generate documents..."
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    {editingPrompt.id === null ? "Create" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Diff Review Dialog */}
          {pendingChange && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-black mb-2">
                    Review Changes
                  </h3>
                  <p className="text-sm text-gray-600 mb-1">
                    Your request: <span className="font-medium italic">"{pendingChange.userMessage}"</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    <span className="bg-red-100 text-red-800 px-1 rounded">Red</span> = removed,{" "}
                    <span className="bg-green-100 text-green-800 px-1 rounded">Green</span> = added
                  </p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4 font-mono text-sm">
                    <div className="whitespace-pre-wrap">
                      {renderDiff(pendingChange.originalText, pendingChange.newText)}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    onClick={handleRejectChange}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleAcceptChange}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Accept Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <p>Start a conversation to generate your document</p>
                <p className="text-sm mt-2">Try asking: "Create a legal brief about [your topic]"</p>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-black"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg p-3">
                  <p className="text-sm text-gray-600">Thinking...</p>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={currentMessage}
                onChange={(e) => {
                  setCurrentMessage(e.target.value)
                  // Auto-resize textarea
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === "ask"
                    ? "Ask a question about the document... (Enter to send)"
                    : "Describe changes or create content... (Enter to send, Shift+Enter for new line)"
                }
                rows={4}
                className="flex-1 border border-gray-300 rounded-md p-3 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none min-h-[80px] max-h-[200px]"
                style={{ maxHeight: '200px', overflowY: 'auto' }}
              />
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim() || loading}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
                {chatMessages.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    className="px-4 py-1.5 text-xs bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    title="Clear chat history"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            
            {/* Mode Toggle */}
            <div className="mt-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("ask")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    mode === "ask"
                      ? "bg-indigo-600 text-white"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Ask
                </button>
                <button
                  onClick={() => setMode("edit")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    mode === "edit"
                      ? "bg-indigo-600 text-white"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Edit
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                {mode === "ask"
                  ? "Ask questions about the document (won't modify it)"
                  : "Edit or create document content (will update the document)"}
              </p>
              
              {/* Auto-Apply Toggle (only in edit mode) */}
              {mode === "edit" && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoApply}
                      onChange={(e) => setAutoApply(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-xs text-gray-700">
                      Auto-apply changes
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    {autoApply
                      ? "Changes will be applied directly to the document"
                      : "Changes will be shown in a diff view for review"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Development Test Section */}
      {showDevSection && (
        <div className="mt-8 border-t-4 border-orange-300 pt-6">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-orange-900">Development Test Section</h3>
                <p className="text-sm text-orange-700 mt-1">
                  Provider/Model selection and LLM usage tracking (temporary for development)
                </p>
              </div>
              <button
                onClick={() => setShowDevSection(false)}
                className="px-3 py-1 text-xs bg-orange-200 text-orange-800 rounded hover:bg-orange-300"
              >
                Hide
              </button>
            </div>

            {/* Provider and Model Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-orange-900 mb-2">
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => {
                    const newProvider = e.target.value as Provider
                    setProvider(newProvider)
                    // Set default model for provider
                    const defaultModels: Record<Provider, string> = {
                      anthropic: "claude-3-5-haiku-20241022",
                      openai: "gpt-4o",
                      gemini: "gemini-1.5-pro",
                      grok: "grok-3-fast",
                    }
                    setModel(defaultModels[newProvider])
                  }}
                  className="w-full border border-orange-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="gemini">Google (Gemini)</option>
                  <option value="grok">xAI (Grok)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-orange-900 mb-2">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full border border-orange-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {provider === "anthropic" && (
                    <>
                      <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                      <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
                      <option value="claude-opus-4-20250514">Claude Opus 4</option>
                    </>
                  )}
                  {provider === "openai" && (
                    <>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </>
                  )}
                  {provider === "gemini" && (
                    <>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    </>
                  )}
                  {provider === "grok" && (
                    <>
                      <option value="grok-3-fast">Grok 3 Fast</option>
                      <option value="grok-3-fast-beta">Grok 3 Fast Beta</option>
                      <option value="grok-3-fast-latest">Grok 3 Fast Latest</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* LLM Usage Info */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-orange-900">LLM Usage History</h4>
                {tokenUsageHistory.length > 0 && (
                  <button
                    onClick={() => setTokenUsageHistory([])}
                    className="text-xs text-orange-700 hover:text-orange-900 underline"
                  >
                    Clear History
                  </button>
                )}
              </div>
              
              {tokenUsageHistory.length === 0 ? (
                <div className="text-sm text-orange-600 italic py-4 text-center bg-orange-100 rounded border border-orange-200">
                  No usage data yet. Send a message to see token usage and costs.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {tokenUsageHistory.map((usage, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-orange-200 rounded-md p-3 text-sm"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                        <div>
                          <div className="text-xs text-orange-600 font-medium">Provider</div>
                          <div className="text-gray-900 capitalize">{usage.provider || provider}</div>
                        </div>
                        <div>
                          <div className="text-xs text-orange-600 font-medium">Model</div>
                          <div className="text-gray-900 text-xs font-mono">{usage.model || model}</div>
                        </div>
                        <div>
                          <div className="text-xs text-orange-600 font-medium">Input Tokens</div>
                          <div className="text-gray-900">{usage.input_tokens.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-xs text-orange-600 font-medium">Output Tokens</div>
                          <div className="text-gray-900">{usage.output_tokens.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-orange-100">
                        <div>
                          <div className="text-xs text-orange-600 font-medium">Total Tokens</div>
                          <div className="text-gray-900 font-semibold">{usage.total_tokens.toLocaleString()}</div>
                        </div>
                        {usage.cost && (
                          <div>
                            <div className="text-xs text-orange-600 font-medium">Cost</div>
                            <div className="text-gray-900 font-semibold">
                              ${usage.cost.total_cost.toFixed(6)}
                            </div>
                          </div>
                        )}
                      </div>
                      {usage.cost && (
                        <div className="mt-2 pt-2 border-t border-orange-100 text-xs text-gray-600">
                          Input: ${usage.cost.input_cost.toFixed(6)} • Output: ${usage.cost.output_cost.toFixed(6)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Summary Stats */}
              {tokenUsageHistory.length > 0 && (
                <div className="mt-4 pt-4 border-t border-orange-200">
                  <h5 className="text-sm font-semibold text-orange-900 mb-2">Summary</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-orange-600">Total Requests</div>
                      <div className="text-gray-900 font-semibold">{tokenUsageHistory.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-orange-600">Total Input Tokens</div>
                      <div className="text-gray-900 font-semibold">
                        {tokenUsageHistory.reduce((sum, u) => sum + u.input_tokens, 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-orange-600">Total Output Tokens</div>
                      <div className="text-gray-900 font-semibold">
                        {tokenUsageHistory.reduce((sum, u) => sum + u.output_tokens, 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-orange-600">Total Cost</div>
                      <div className="text-gray-900 font-semibold">
                        $
                        {tokenUsageHistory
                          .reduce((sum, u) => sum + (u.cost?.total_cost || 0), 0)
                          .toFixed(6)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

