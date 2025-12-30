import { NextRequest, NextResponse } from "next/server"
import { generateDocument, ChatMessage } from "@/lib/ai/document-generation"
import { ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, GROK_API_KEY } from "@/lib/env"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

type Provider = "anthropic" | "openai" | "gemini" | "grok"

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error

    const body = await request.json()
    const { 
      message, 
      conversationHistory = [], 
      currentDocument = null, 
      systemPrompt, 
      mode = "edit",
      provider = "anthropic",
      model
    } = body

    // Get API key based on provider
    let apiKey: string
    if (provider === "anthropic") {
      apiKey = ANTHROPIC_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: "ANTHROPIC_API_KEY not configured" },
          { status: 500 }
        )
      }
    } else if (provider === "openai") {
      apiKey = OPENAI_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: "OPENAI_API_KEY not configured" },
          { status: 500 }
        )
      }
    } else if (provider === "grok") {
      apiKey = GROK_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: "GROK_API_KEY not configured" },
          { status: 500 }
        )
      }
    } else if (provider === "gemini") {
      apiKey = GEMINI_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY not configured" },
          { status: 500 }
        )
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 }
      )
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      )
    }

    // Validate mode
    if (mode !== "ask" && mode !== "edit") {
      return NextResponse.json(
        { error: "Mode must be 'ask' or 'edit'" },
        { status: 400 }
      )
    }

    // Validate conversation history format
    const history: ChatMessage[] = conversationHistory.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: String(msg.content || ''),
    }))

    // Generate document response
    const result = await generateDocument(
      message,
      history,
      currentDocument || null,
      {
        apiKey,
        provider: provider as Provider,
        model: model || undefined,
        systemPrompt: systemPrompt || undefined,
        mode: mode as "ask" | "edit",
      }
    )

    return NextResponse.json({
      response: result.response,
      parsedResponse: result.parsedResponse,
      tokenUsage: result.tokenUsage,
    })
  } catch (error) {
    return handleApiError(error, 'ChatEndpoint')
  }
}

