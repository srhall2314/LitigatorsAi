/**
 * Tier 2 Citation Validation Service
 * Main service for running 5-agent panel validation per validationT2.md specification
 */

import Anthropic from '@anthropic-ai/sdk'
import retry from 'async-retry'
import { Citation, CitationDocument, AgentVerdict, Consensus, CitationValidation, AgreementLevel, CitationRecommendationType, Tier3Result } from '@/types/citation-json'
import {
  getCitationAuthorityValidatorPrompt,
  getCaseEcologyValidatorPrompt,
  getTemporalRealityValidatorPrompt,
  getLegalKnowledgeValidatorPrompt,
  getRealityAssessmentExpertPrompt
} from './validation-prompts'
import { parseAgentResponse, ParsedVerdict } from './response-parser'
import { getTier3InvestigationPrompt, parseTier3Response } from './tier3-prompts'
import { extractDocumentContext } from './context-extractor'

// Agent configurations
const AGENT_CONFIGS = [
  {
    name: 'citation_authority_validator_v1',
    getPrompt: getCitationAuthorityValidatorPrompt,
  },
  {
    name: 'case_ecology_validator_v1',
    getPrompt: getCaseEcologyValidatorPrompt,
  },
  {
    name: 'temporal_reality_validator_v1',
    getPrompt: getTemporalRealityValidatorPrompt,
  },
  {
    name: 'legal_knowledge_validator_v1',
    getPrompt: getLegalKnowledgeValidatorPrompt,
  },
  {
    name: 'reality_assessment_expert_v1',
    getPrompt: getRealityAssessmentExpertPrompt,
  },
] as const

const MODEL = 'claude-haiku-4-5-20251001' // Claude Haiku 4.5 for Tier 2 (fast and cost-efficient)
const TIER3_MODEL = 'claude-sonnet-4-5-20250929' // Claude Sonnet 4.5 for Tier 3 (most capable model)

// Retry configuration
const RETRY_CONFIG = {
  retries: 3,
  minTimeout: 1000, // 1 second
  maxTimeout: 10000, // 10 seconds
  factor: 2, // Exponential backoff: 1s, 2s, 4s
  randomize: true, // Add jitter to prevent thundering herd
}

/**
 * Determine if an error is retryable
 * Retry on: rate limits, timeouts, network errors, server errors (5xx)
 * Don't retry on: authentication errors (401), bad requests (400), not found (404)
 */
function isRetryableError(error: any): boolean {
  // Check for Anthropic API error structure
  if (error?.status) {
    const status = error.status
    // Retry on rate limits (429) and server errors (5xx)
    if (status === 429 || (status >= 500 && status < 600)) {
      return true
    }
    // Don't retry on client errors (4xx) except rate limits
    if (status >= 400 && status < 500) {
      return false
    }
  }
  
  // Check for network/timeout errors
  if (error?.code) {
    const code = error.code.toLowerCase()
    // Retry on network errors
    if (code === 'econnreset' || code === 'etimedout' || code === 'econnrefused' || 
        code === 'enotfound' || code === 'timeout' || code === 'network_error') {
      return true
    }
  }
  
  // Check error message for common retryable patterns
  const message = error?.message?.toLowerCase() || ''
  if (message.includes('rate limit') || 
      message.includes('timeout') || 
      message.includes('network') ||
      message.includes('server error') ||
      message.includes('temporary')) {
    return true
  }
  
  // Default: retry on unknown errors (could be transient)
  return true
}

/**
 * Call a single validation agent with retry logic
 */
async function callValidationAgent(
  agentConfig: typeof AGENT_CONFIGS[number],
  citation: Citation,
  context: string,
  apiKey: string
): Promise<AgentVerdict> {
  const anthropic = new Anthropic({ apiKey })
  const prompt = agentConfig.getPrompt(citation, context)
  
  try {
    const message = await retry(
      async (bail: (error: Error) => void): Promise<Anthropic.Messages.Message> => {
        try {
          return await anthropic.messages.create({
            model: MODEL,
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          })
        } catch (error: any) {
          // If error is not retryable, bail out immediately
          if (!isRetryableError(error)) {
            bail(error instanceof Error ? error : new Error(String(error)))
            throw error // This will never execute but satisfies TypeScript
          }
          // Otherwise, throw to trigger retry
          throw error
        }
      },
      {
        ...RETRY_CONFIG,
        onRetry: (error: Error, attempt: number) => {
          console.warn(
            `[Validation] Retrying agent ${agentConfig.name} (attempt ${attempt}/${RETRY_CONFIG.retries + 1}):`,
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
    
    // Parse response
    const parsed = parseAgentResponse(responseText, agentConfig.name)
    
    // Build agent verdict
    const verdict: AgentVerdict = {
      agent: agentConfig.name,
      verdict: parsed.verdict,
      timestamp: new Date().toISOString(),
      model: MODEL,
    }
    
    if (parsed.invalid_reason) {
      verdict.invalid_reason = parsed.invalid_reason
    }
    if (parsed.uncertain_reason) {
      verdict.uncertain_reason = parsed.uncertain_reason
    }
    
    return verdict
  } catch (error) {
    console.error(`[Validation] Error calling agent ${agentConfig.name} after retries:`, error)
    
    // Return UNCERTAIN verdict on error after retries exhausted
    return {
      agent: agentConfig.name,
      verdict: 'UNCERTAIN',
      uncertain_reason: 'api_error',
      timestamp: new Date().toISOString(),
      model: MODEL,
    }
  }
}

/**
 * Calculate consensus from panel evaluations
 */
export function calculateConsensus(panelEvaluations: AgentVerdict[]): Consensus {
  // Count verdicts
  const verdict_counts = {
    VALID: 0,
    INVALID: 0,
    UNCERTAIN: 0,
  }
  
  for (const eval_ of panelEvaluations) {
    verdict_counts[eval_.verdict]++
  }
  
  // Determine agreement level
  const maxCount = Math.max(verdict_counts.VALID, verdict_counts.INVALID, verdict_counts.UNCERTAIN)
  let agreement_level: AgreementLevel
  
  if (maxCount === 5) {
    agreement_level = 'unanimous'
  } else if (maxCount === 4) {
    agreement_level = 'strong'
  } else {
    agreement_level = 'split'
  }
  
  // Calculate confidence score: agreement_count / 5 (linear, no squaring)
  const confidence_score = maxCount / 5
  
  // Determine recommendation
  // Thresholds based on VALID verdict count:
  // - 4-5 VALID (confidence 0.8-1.0) = CITATION_LIKELY_VALID
  // - 2-3 VALID (confidence 0.4-0.6) = CITATION_UNCERTAIN
  // - 0-1 VALID (confidence <= 0.4) = CITATION_LIKELY_HALLUCINATED
  let recommendation: CitationRecommendationType
  let reasoning = ''
  
  if (verdict_counts.VALID >= 4) {
    // 4-5 VALID verdicts - high confidence in validity
    recommendation = 'CITATION_LIKELY_VALID'
    reasoning = `All agents (${verdict_counts.VALID}/5) found no issues. Citation assessed as real.`
  } else if (verdict_counts.VALID >= 2) {
    // 2-3 VALID - split decision, uncertain
    recommendation = 'CITATION_UNCERTAIN'
    reasoning = `Panel disagreement: ${verdict_counts.VALID} valid, ${verdict_counts.INVALID} invalid, ${verdict_counts.UNCERTAIN} uncertain. Citation has both credible and suspicious markers.`
  } else {
    // 0-1 VALID with majority INVALID - likely hallucinated
    recommendation = 'CITATION_LIKELY_HALLUCINATED'
    reasoning = `Majority finding against validity: ${verdict_counts.VALID} valid, ${verdict_counts.INVALID} invalid, ${verdict_counts.UNCERTAIN} uncertain. Multiple validators flagged problems.`
  }
  
  // Add specific agent concerns to reasoning
  const concerns: string[] = []
  for (const eval_ of panelEvaluations) {
    if (eval_.verdict === 'INVALID' && eval_.invalid_reason) {
      concerns.push(`${eval_.agent}: ${eval_.invalid_reason}`)
    } else if (eval_.verdict === 'UNCERTAIN' && eval_.uncertain_reason) {
      concerns.push(`${eval_.agent}: ${eval_.uncertain_reason}`)
    }
  }
  
  if (concerns.length > 0) {
    reasoning += ` Concerns: ${concerns.join('; ')}.`
  }
  
  // Determine tier_3_trigger
  const tier_3_trigger = confidence_score < 0.8 // Trigger if not high confidence
  
  return {
    agreement_level,
    verdict_counts,
    confidence_score,
    recommendation,
    reasoning,
    tier_3_trigger,
  }
}

/**
 * Validate a single citation with the 5-agent panel
 */
export async function validateCitationWithPanel(
  citation: Citation,
  documentContext: string,
  apiKey: string
): Promise<CitationValidation> {
  // Call all 5 agents in parallel
  const agentPromises = AGENT_CONFIGS.map(agentConfig =>
    callValidationAgent(agentConfig, citation, documentContext, apiKey)
  )
  
  const panelEvaluations = await Promise.all(agentPromises)
  
  // Calculate consensus
  const consensus = calculateConsensus(panelEvaluations)
  
  return {
    panel_evaluation: panelEvaluations,
    consensus,
  }
}

/**
 * Perform Tier 3 investigation for a citation with retry logic
 */
export async function validateCitationTier3(
  citation: Citation,
  context: string,
  tier2Results: CitationValidation,
  apiKey: string
): Promise<Tier3Result> {
  const anthropic = new Anthropic({ apiKey })
  const prompt = getTier3InvestigationPrompt(citation, context, tier2Results)
  
  try {
    const message = await retry(
      async (bail: (error: Error) => void): Promise<Anthropic.Messages.Message> => {
        try {
          return await anthropic.messages.create({
            model: TIER3_MODEL,
            max_tokens: 2048,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          })
        } catch (error: any) {
          // If error is not retryable, bail out immediately
          if (!isRetryableError(error)) {
            bail(error instanceof Error ? error : new Error(String(error)))
            throw error // This will never execute but satisfies TypeScript
          }
          // Otherwise, throw to trigger retry
          throw error
        }
      },
      {
        ...RETRY_CONFIG,
        onRetry: (error: Error, attempt: number) => {
          console.warn(
            `[Tier3] Retrying citation ${citation.id} investigation (attempt ${attempt}/${RETRY_CONFIG.retries + 1}):`,
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
    
    // Parse response
    const parsed = parseTier3Response(responseText)
    
    // Build Tier 3 result
    const result: Tier3Result = {
      verdict: parsed.verdict,
      reasoning: parsed.reasoning,
      key_evidence: parsed.key_evidence,
      confidence: parsed.confidence,
      timestamp: new Date().toISOString(),
      model: TIER3_MODEL,
    }
    
    if (parsed.remaining_uncertainties) {
      result.remaining_uncertainties = parsed.remaining_uncertainties
    }
    
    return result
  } catch (error) {
    console.error(`[Tier3] Error investigating citation ${citation.id} after retries:`, error)
    if (error instanceof Error) {
      console.error(`[Tier3] Error message: ${error.message}`)
      console.error(`[Tier3] Error stack: ${error.stack}`)
    }
    
    // Return uncertain result on error after retries exhausted
    return {
      verdict: 'NEEDS_HUMAN_REVIEW',
      reasoning: `Error occurred during Tier 3 investigation: ${error instanceof Error ? error.message : String(error)}`,
      key_evidence: 'Investigation could not be completed due to technical error',
      confidence: 'low',
      timestamp: new Date().toISOString(),
      model: TIER3_MODEL,
    }
  }
}

/**
 * Validate all citations in a document
 */
export async function validateAllCitations(
  jsonData: CitationDocument,
  apiKey: string,
  onProgress?: (tier2Current: number, tier2Total: number, tier3Current: number, tier3Total: number) => void
): Promise<CitationDocument> {
  const { document } = jsonData
  const citations = document.citations || []
  
  // Extract contexts for all citations
  const contexts = new Map<string, string>()
  for (const citation of citations) {
    const context = extractDocumentContext(citation.id, jsonData, true)
    contexts.set(citation.id, context)
  }
  
  // First, run Tier 2 validation for all citations
  const citationsWithTier2 = []
  let tier3Count = 0
  
  for (let i = 0; i < citations.length; i++) {
    const citation = citations[i]
    const context = contexts.get(citation.id) || ''
    
    if (onProgress) {
      onProgress(i + 1, citations.length, 0, 0)
    }
    
    const validation = await validateCitationWithPanel(citation, context, apiKey)
    
    // Check if Tier 3 is needed
    if (validation.consensus.tier_3_trigger) {
      tier3Count++
    }
    
    citationsWithTier2.push({
      ...citation,
      validation,
    })
  }
  
  // Now run Tier 3 for citations that need it
  const updatedCitations = []
  let tier3Current = 0
  
  // Send initial Tier 3 progress if there are any citations needing Tier 3
  if (tier3Count > 0 && onProgress) {
    onProgress(citations.length, citations.length, 0, tier3Count)
  }
  
  for (let i = 0; i < citationsWithTier2.length; i++) {
    const citation = citationsWithTier2[i]
    
    if (citation.validation?.consensus.tier_3_trigger) {
      const context = contexts.get(citation.id) || ''
      
      // Send progress before starting Tier 3
      tier3Current++
      if (onProgress) {
        onProgress(citations.length, citations.length, tier3Current, tier3Count)
      }
      
      const tier3Result = await validateCitationTier3(
        citation,
        context,
        citation.validation,
        apiKey
      )
      
      // Send progress after completing Tier 3
      if (onProgress) {
        onProgress(citations.length, citations.length, tier3Current, tier3Count)
      }
      
      updatedCitations.push({
        ...citation,
        tier_3: tier3Result,
      })
    } else {
      updatedCitations.push({
        ...citation,
        tier_3: null,
      })
    }
  }
  
  // Return updated document
  return {
    document: {
      ...document,
      citations: updatedCitations,
    },
  }
}

