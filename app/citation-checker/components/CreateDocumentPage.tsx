"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DocumentWizard, DocumentWizardData } from "./DocumentWizard"
import { buildWizardPrompt } from "@/lib/ai/document-generation"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

type InteractionMode = "ask" | "edit"

export function CreateDocumentPage() {
  const router = useRouter()
  const [showWizard, setShowWizard] = useState(true)
  const [documentText, setDocumentText] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState("")
  const [mode, setMode] = useState<InteractionMode>("edit")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  // Default saved prompts (can be enhanced later to store in database)
  const savedPrompts = [
    {
      name: "Legal Brief",
      prompt: "Create a legal brief with proper structure including introduction, statement of facts, argument, and conclusion. Include properly formatted Bluebook citations.",
    },
    {
      name: "Motion for Summary Judgment",
      prompt: "Create a motion for summary judgment with standard sections: introduction, statement of undisputed facts, legal argument, and conclusion with citations.",
    },
    {
      name: "Memorandum of Law",
      prompt: "Create a legal memorandum with proper heading, statement of issues, facts, analysis, and conclusion. Use Bluebook citation format.",
    },
  ]

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
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate response")
      }

      const data = await response.json()
      const assistantMessage: ChatMessage = { role: "assistant", content: data.response }

      // Update chat messages
      setChatMessages((prev) => [...prev, assistantMessage])

      // Only update document text if in "edit" mode
      // In "ask" mode, the AI answers questions but doesn't modify the document
      if (mode === "edit") {
        // If the response contains substantial content (likely a document or major update), update document text
        // The AI is instructed to return full document text when creating/modifying documents
        // We update if the response is substantial (more than 100 chars) or if it appears to be document content
        if (data.response.length > 100 || 
            (data.response.includes('\n\n') && data.response.split('\n').length > 3)) {
          // Update document text with AI response
          setDocumentText(data.response)
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

  const handleSaveAndContinue = async () => {
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
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to save document")
      }

      const data = await response.json()
      
      // Navigate to generate-json step
      router.push(`/citation-checker/${data.fileUpload.id}/generate-json`)
    } catch (error) {
      console.error("Error saving document:", error)
      alert(`Failed to save document: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setSaving(false)
    }
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
      
      // Set the generated document
      setDocumentText(data.response)
      
      // Add initial messages to chat
      setChatMessages([
        { role: "user", content: wizardPrompt },
        { role: "assistant", content: data.response },
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

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-[calc(100vh-250px)] min-h-[600px]">
        {/* Left Panel: Document Editor */}
        <div className="border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-black">Document Editor</h2>
                <p className="text-sm text-gray-600">Edit your document directly or use the chat to generate content</p>
              </div>
              <button
                onClick={() => {
                  if (confirm("Return to wizard? Your current document will be cleared.")) {
                    setShowWizard(true)
                    setDocumentText("")
                    setChatMessages([])
                  }
                }}
                className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
              >
                New Document
              </button>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-auto">
            <textarea
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              placeholder="Your document will appear here. Use the chat panel to generate content, or type directly in this editor."
              className="w-full h-full resize-none border border-gray-300 rounded-md p-4 text-sm font-mono text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={handleSaveAndContinue}
              disabled={!documentText.trim() || saving}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save & Continue to Citation Checker"}
            </button>
          </div>
        </div>

        {/* Right Panel: Chat Interface */}
        <div className="flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-black">AI Assistant</h2>
            <p className="text-sm text-gray-600">Chat with AI to generate or modify your document</p>
          </div>

          {/* Saved Prompts */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="mb-2">
              <span className="text-sm font-medium text-gray-700">Quick Prompts:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {savedPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleApplyPrompt(prompt.prompt)}
                  className="px-3 py-1 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {prompt.name}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            {/* Mode Toggle */}
            <div className="mb-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("ask")}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    mode === "ask"
                      ? "bg-indigo-600 text-white"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Ask
                </button>
                <button
                  onClick={() => setMode("edit")}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
            </div>

            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === "ask"
                    ? "Ask a question about the document... (Enter to send)"
                    : "Describe changes or create content... (Enter to send, Shift+Enter for new line)"
                }
                rows={2}
                className="flex-1 border border-gray-300 rounded-md p-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
              <button
                onClick={handleSendMessage}
                disabled={!currentMessage.trim() || loading}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed self-end"
              >
                {mode === "ask" ? "Ask" : "Edit"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

