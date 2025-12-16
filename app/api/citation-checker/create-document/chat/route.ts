import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { generateDocument, ChatMessage } from "@/lib/ai/document-generation"
import { ANTHROPIC_API_KEY } from "@/lib/env"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { message, conversationHistory = [], currentDocument = null, systemPrompt, mode = "edit" } = body

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
        apiKey: ANTHROPIC_API_KEY,
        systemPrompt: systemPrompt || undefined,
        mode: mode as "ask" | "edit",
      }
    )

    return NextResponse.json({
      response: result.response,
      tokenUsage: result.tokenUsage,
    })
  } catch (error) {
    console.error("Error in chat endpoint:", error)
    return NextResponse.json(
      { 
        error: "Failed to generate response",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

