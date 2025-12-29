/**
 * AI Document Generation Utilities
 * Handles AI chat interactions for document creation
 */

import Anthropic from '@anthropic-ai/sdk'
import retry from 'async-retry'
import type OpenAI from 'openai'
import type { GoogleGenerativeAI } from '@google/generative-ai'
import { extractTokens, calculateCost, TokenUsage, Provider } from '@/lib/citation-identification/token-tracking'

// Default system prompt for document editing
const DEFAULT_EDIT_SYSTEM_PROMPT = `You are a legal document writing assistant. Your task is to help create and edit legal documents such as briefs, motions, memoranda, and other legal filings.

Important guidelines:
1. Generate well-structured legal documents with proper formatting
2. Use Bluebook citation format for all legal citations
3. Ensure citations follow standard legal citation patterns (e.g., "Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020)")
4. Create clear headings and well-organized paragraphs
5. Maintain a professional legal writing style
6. When the user provides existing document text, you MUST preserve ALL existing content unless explicitly asked to remove or replace it
7. When making edits, only modify the specific parts requested by the user - keep all other content exactly as it was
8. When creating a new document from scratch (no existing content provided), generate the complete document
9. When modifying an existing document, return the complete document text with ONLY the requested changes applied

The user will provide you with:
- Their current document text (if any exists - preserve this unless asked to change it)
- Their instructions or requests

CRITICAL RULES - RESPONSE FORMAT:
- You MUST respond with valid JSON only, in this exact format:
  {
    "explanation": "Brief explanation of what changes were made (or empty string if no explanation needed)",
    "document": "The complete document text with all changes applied"
  }
- If the user provides existing document text, you must return the COMPLETE document with their existing content preserved, making ONLY the specific changes they requested. Do not remove, rewrite, or replace content that the user did not ask you to change.
- The "document" field must contain the complete document text - no explanatory text, comments, or meta-commentary.
- The "explanation" field can contain a brief note about what was changed (e.g., "Cleaned up grammar and formatting", "Fixed citation errors"), or be an empty string if no explanation is needed.
- When the user asks you to edit, clean, fix, correct, modify, or improve the document, you MUST return the complete edited document text in the "document" field.
- Your response must be valid JSON - do not include any text before or after the JSON object.`

// System prompt for asking questions (read-only mode)
const DEFAULT_ASK_SYSTEM_PROMPT = `You are a legal document assistant. Your task is to answer questions about legal documents provided by the user.

Important guidelines:
1. Analyze the document text provided by the user
2. Answer questions about the document's content, structure, citations, or legal arguments
3. Provide helpful, accurate information based on the document
4. Do NOT modify or return the document text - only provide answers to questions
5. If asked about citations, explain them in Bluebook format context
6. If asked about document structure, explain the sections and organization

The user will provide you with:
- The current document text (for context)
- Questions about the document

Respond with helpful answers and explanations, but do NOT return the document text itself.`

export interface WizardData {
  documentType: string
  court: string
  caseName: string
  plaintiff?: string
  defendant?: string
  movant?: string
  respondent?: string
  caseNumber?: string
  filingDate?: string
  motionType?: string
  keyIssues?: string
  additionalContext?: string
}

/**
 * Build a structured prompt from wizard form data
 */
export function buildWizardPrompt(wizardData: WizardData): string {
  const {
    documentType,
    court,
    caseName,
    plaintiff,
    defendant,
    movant,
    respondent,
    caseNumber,
    filingDate,
    motionType,
    keyIssues,
    additionalContext,
  } = wizardData

  let prompt = `Create a ${documentType}`

  // Add motion type if applicable
  if (motionType) {
    const motionTypeLabels: Record<string, string> = {
      "summary-judgment": "Motion for Summary Judgment",
      "dismiss": "Motion to Dismiss",
      "compel": "Motion to Compel",
      "strike": "Motion to Strike",
      "protect": "Motion for Protective Order",
      "default": "Motion for Default Judgment",
      "preliminary-injunction": "Motion for Preliminary Injunction",
    }
    prompt += ` - ${motionTypeLabels[motionType] || motionType}`
  }

  prompt += ` with the following information:\n\n`

  // Court information
  prompt += `COURT: ${court}\n`
  
  // Case information
  prompt += `CASE NAME: ${caseName}\n`
  
  if (caseNumber) {
    prompt += `CASE NUMBER: ${caseNumber}\n`
  }
  
  if (filingDate) {
    prompt += `FILING DATE: ${filingDate}\n`
  }

  // Parties
  prompt += `\nPARTIES:\n`
  if (movant || respondent) {
    if (movant) prompt += `Movant: ${movant}\n`
    if (respondent) prompt += `Respondent: ${respondent}\n`
  } else {
    if (plaintiff) prompt += `Plaintiff: ${plaintiff}\n`
    if (defendant) prompt += `Defendant: ${defendant}\n`
  }

  // Key issues
  if (keyIssues) {
    prompt += `\nKEY ISSUES / TOPICS:\n${keyIssues}\n`
  }

  // Additional context
  if (additionalContext) {
    prompt += `\nADDITIONAL CONTEXT:\n${additionalContext}\n`
  }

  prompt += `\nPlease create a complete, professionally formatted legal document with:\n`
  prompt += `1. Proper caption including court, case name, case number (if provided), and parties\n`
  prompt += `2. Appropriate document title\n`
  prompt += `3. Well-structured sections appropriate for this document type\n`
  prompt += `4. Professional legal writing style\n`
  prompt += `5. Proper Bluebook citation format for any case law, statutes, or regulations referenced\n`
  prompt += `6. Clear headings and logical organization\n`

  if (keyIssues) {
    prompt += `7. Address the key issues and topics mentioned above\n`
  }

  prompt += `\nGenerate the complete document text ready for filing.`

  return prompt
}

// Retry configuration
const RETRY_CONFIG = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 10000,
  factor: 2,
  randomize: true,
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: any): boolean {
  if (error?.status) {
    const status = error.status
    if (status === 429 || (status >= 500 && status < 600)) {
      return true
    }
    if (status >= 400 && status < 500) {
      return false
    }
  }
  
  if (error?.code) {
    const code = error.code.toLowerCase()
    if (code === 'econnreset' || code === 'etimedout' || code === 'econnrefused' || 
        code === 'enotfound' || code === 'timeout' || code === 'network_error') {
      return true
    }
  }
  
  const message = error?.message?.toLowerCase() || ''
  if (message.includes('rate limit') || 
      message.includes('timeout') || 
      message.includes('network') ||
      message.includes('server error') ||
      message.includes('temporary')) {
    return true
  }
  
  return true
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DocumentGenerationOptions {
  apiKey: string
  provider?: Provider // Default: "anthropic"
  model?: string // Default varies by provider
  systemPrompt?: string
  maxTokens?: number // Default: 4096
  temperature?: number // Default: 0.7
  mode?: "ask" | "edit" // Default: "edit"
}

export interface DocumentGenerationResult {
  response: string
  parsedResponse?: {
    explanation?: string
    document?: string
  } | null
  tokenUsage?: TokenUsage & {
    cost?: {
      input_cost: number
      output_cost: number
      total_cost: number
    }
  }
}

// Default models per provider
const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-3-5-haiku-20241022',
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-pro',
  grok: 'grok-3-fast',
}

const GROK_MODELS = ['grok-3-fast-beta', 'grok-3-fast', 'grok-3-fast-latest']

/**
 * Generate or update document using AI chat
 */
export async function generateDocument(
  userMessage: string,
  conversationHistory: ChatMessage[],
  currentDocument: string | null,
  options: DocumentGenerationOptions
): Promise<DocumentGenerationResult> {
  const provider = options.provider || 'anthropic'
  const model = options.model || DEFAULT_MODELS[provider]
  const maxTokens = options.maxTokens || 4096
  const temperature = options.temperature ?? 0.7
  const mode = options.mode || "edit"
  
  // Select system prompt based on mode
  const systemPrompt = options.systemPrompt || 
    (mode === "ask" ? DEFAULT_ASK_SYSTEM_PROMPT : DEFAULT_EDIT_SYSTEM_PROMPT)

  // Build current message with document context
  let userContent = userMessage
  if (currentDocument && currentDocument.trim().length > 0) {
    if (mode === "ask") {
      // In ask mode, provide document as context for questions
      userContent = `Document text:\n\n${currentDocument}\n\nQuestion: ${userMessage}`
    } else {
      // In edit mode, send document in JSON format for structured editing
      const documentJson = JSON.stringify({
        document: currentDocument,
        request: userMessage
      })
      userContent = `Current document (JSON format):\n\`\`\`json\n${documentJson}\n\`\`\`\n\nUser request: ${userMessage}\n\nPlease return your response as JSON with "explanation" and "document" fields.`
    }
  } else if (mode === "edit") {
    // Even without existing document, request JSON format
    userContent = `${userMessage}\n\nPlease return your response as JSON with "explanation" and "document" fields.`
  }

  try {
    let responseText: string
    let tokenUsage: TokenUsage | null = null
    let parsedResponse: { explanation?: string; document?: string } | null = null
    let jsonParseAttempts = 0
    const maxJsonRetries = 3

    // Build messages array for conversation-based APIs
    const conversationMessages: Array<{ role: string; content: string }> = []
    for (const msg of conversationHistory) {
      conversationMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })
    }
    conversationMessages.push({
      role: 'user',
      content: userContent,
    })

    // Call appropriate provider
    if (provider === 'anthropic') {
      const anthropic = new Anthropic({ apiKey: options.apiKey })
      const messages: Anthropic.Messages.MessageParam[] = conversationMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))

      const message = await retry(
        async (bail: (error: Error) => void): Promise<Anthropic.Messages.Message> => {
          try {
            return await anthropic.messages.create({
              model,
              max_tokens: maxTokens,
              temperature,
              system: systemPrompt,
              messages: messages as Anthropic.MessageParam[],
            })
          } catch (error: any) {
            if (!isRetryableError(error)) {
              bail(error instanceof Error ? error : new Error(String(error)))
              throw error
            }
            throw error
          }
        },
        {
          ...RETRY_CONFIG,
          onRetry: (error: Error, attempt: number) => {
            console.warn(
              `[DocumentGeneration] Retrying (attempt ${attempt}/${RETRY_CONFIG.retries + 1}):`,
              error instanceof Error ? error.message : String(error)
            )
          },
        }
      )

      responseText = message.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
      
      tokenUsage = extractTokens(message, model, 'anthropic')
    } else if (provider === 'openai' || provider === 'grok') {
      const { default: OpenAI } = await import('openai')
      const baseURL = provider === 'grok' ? 'https://api.x.ai/v1' : undefined
      const openai = new OpenAI({ apiKey: options.apiKey, baseURL })

      if (provider === 'grok' && !GROK_MODELS.includes(model)) {
        throw new Error(`Invalid Grok model: ${model}. Valid models: ${GROK_MODELS.join(', ')}`)
      }

      const isGPT51 = model.startsWith('gpt-5.1')
      const requestParams: any = {
        model,
        temperature,
        messages: conversationMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
      }

      // Add system message if provided
      if (systemPrompt) {
        requestParams.messages.unshift({
          role: 'system',
          content: systemPrompt,
        })
      }

      // Use correct parameter name based on model version
      if (isGPT51) {
        requestParams.max_completion_tokens = maxTokens
      } else {
        requestParams.max_tokens = maxTokens
      }

      const completion = await retry(
        async (bail: (error: Error) => void) => {
          try {
            return await openai.chat.completions.create(requestParams)
          } catch (error: any) {
            if (!isRetryableError(error)) {
              bail(error instanceof Error ? error : new Error(String(error)))
              throw error
            }
            throw error
          }
        },
        RETRY_CONFIG
      )

      responseText = completion.choices[0]?.message?.content || ''
      tokenUsage = extractTokens(completion, model, provider === 'grok' ? 'grok' : 'openai')
    } else if (provider === 'gemini') {
      // Gemini doesn't support system messages in the same way, so we'll prepend it to the first user message
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(options.apiKey)
      
      // Combine system prompt with conversation for Gemini
      let fullPrompt = systemPrompt ? `${systemPrompt}\n\n` : ''
      for (const msg of conversationMessages) {
        fullPrompt += `${msg.role === 'assistant' ? 'Assistant' : 'User'}: ${msg.content}\n\n`
      }

      const genModel = genAI.getGenerativeModel({ 
        model,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
        },
      })

      const result = await retry(
        async (bail: (error: Error) => void) => {
          try {
            return await genModel.generateContent(fullPrompt)
          } catch (error: any) {
            if (!isRetryableError(error)) {
              bail(error instanceof Error ? error : new Error(String(error)))
              throw error
            }
            throw error
          }
        },
        RETRY_CONFIG
      )

      responseText = result.response.text()
      const usageMetadata = (result.response as any).usageMetadata
      tokenUsage = usageMetadata ? {
        input_tokens: usageMetadata.promptTokenCount || 0,
        output_tokens: usageMetadata.candidatesTokenCount || 0,
        total_tokens: usageMetadata.totalTokenCount || 0,
        provider: 'gemini',
        model,
      } : null
    } else {
      throw new Error(`Unsupported provider: ${provider}`)
    }

    // Try to parse JSON response (for edit mode)
    if (mode === "edit") {
      try {
        // Try to extract JSON from code blocks first
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                         responseText.match(/```\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[1])
        } else {
          // Try parsing the entire response as JSON
          parsedResponse = JSON.parse(responseText.trim())
        }
      } catch (e) {
        // JSON parsing failed, will use raw text
        console.warn(
          `[DocumentGeneration] JSON parse failed, using raw text:`,
          e instanceof Error ? e.message : String(e)
        )
        parsedResponse = null
      }
    }

    // Calculate cost if token usage is available
    let cost: { input_cost: number; output_cost: number; total_cost: number } | undefined
    if (tokenUsage) {
      const costData = calculateCost(tokenUsage)
      if (costData) {
        cost = {
          input_cost: costData.input_cost,
          output_cost: costData.output_cost,
          total_cost: costData.total_cost,
        }
      }
    }

    return {
      response: responseText,
      parsedResponse, // Include parsed JSON if available
      tokenUsage: tokenUsage ? {
        ...tokenUsage,
        cost,
      } : undefined,
    }
  } catch (error) {
    console.error('[DocumentGeneration] Failed after retries:', error)
    throw new Error(
      `Document generation failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Get default system prompt for edit mode
 */
export function getDefaultSystemPrompt(): string {
  return DEFAULT_EDIT_SYSTEM_PROMPT
}

/**
 * Get system prompt for ask mode
 */
export function getAskSystemPrompt(): string {
  return DEFAULT_ASK_SYSTEM_PROMPT
}
