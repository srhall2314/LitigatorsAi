/**
 * AI Document Generation Utilities
 * Handles AI chat interactions for document creation
 */

import Anthropic from '@anthropic-ai/sdk'
import retry from 'async-retry'

// Default system prompt for document editing
const DEFAULT_EDIT_SYSTEM_PROMPT = `You are a legal document writing assistant. Your task is to help create and edit legal documents such as briefs, motions, memoranda, and other legal filings.

Important guidelines:
1. Generate well-structured legal documents with proper formatting
2. Use Bluebook citation format for all legal citations
3. Ensure citations follow standard legal citation patterns (e.g., "Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020)")
4. Create clear headings and well-organized paragraphs
5. Maintain a professional legal writing style
6. When the user asks you to create or modify content, update the entire document text accordingly

The user will provide you with:
- Their current document text (which you can edit)
- Their instructions or requests

Respond with the complete, updated document text that incorporates their changes.`

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
  model?: string // Default: claude-3-5-haiku-20241022 (cheaper model for document generation)
  systemPrompt?: string
  maxTokens?: number // Default: 4096
  temperature?: number // Default: 0.7
  mode?: "ask" | "edit" // Default: "edit"
}

export interface DocumentGenerationResult {
  response: string
  tokenUsage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
}

/**
 * Generate or update document using AI chat
 */
export async function generateDocument(
  userMessage: string,
  conversationHistory: ChatMessage[],
  currentDocument: string | null,
  options: DocumentGenerationOptions
): Promise<DocumentGenerationResult> {
  const anthropic = new Anthropic({ apiKey: options.apiKey })
  const model = options.model || 'claude-3-5-haiku-20241022'
  const maxTokens = options.maxTokens || 4096
  const temperature = options.temperature ?? 0.7
  const mode = options.mode || "edit"
  
  // Select system prompt based on mode
  const systemPrompt = options.systemPrompt || 
    (mode === "ask" ? DEFAULT_ASK_SYSTEM_PROMPT : DEFAULT_EDIT_SYSTEM_PROMPT)

  // Build messages array
  const messages: Anthropic.Messages.MessageParam[] = []

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role,
      content: msg.content,
    })
  }

  // Build current message with document context
  let userContent = userMessage
  if (currentDocument && currentDocument.trim().length > 0) {
    if (mode === "ask") {
      // In ask mode, provide document as context for questions
      userContent = `Document text:\n\n${currentDocument}\n\nQuestion: ${userMessage}`
    } else {
      // In edit mode, provide document for editing
      userContent = `Current document text:\n\n${currentDocument}\n\nUser request: ${userMessage}`
    }
  }

  messages.push({
    role: 'user',
    content: userContent,
  })

  try {
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

    // Extract text from response
    const responseText = message.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    // Extract token usage
    const tokenUsage = message.usage
      ? {
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
          total_tokens: message.usage.input_tokens + message.usage.output_tokens,
        }
      : undefined

    return {
      response: responseText,
      tokenUsage,
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
