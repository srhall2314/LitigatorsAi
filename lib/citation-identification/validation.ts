/**
 * Tier 2 Citation Validation Service
 * Main service for running 5-agent panel validation per validationT2.md specification
 */

import Anthropic from '@anthropic-ai/sdk'
import retry from 'async-retry'
import { Citation, CitationDocument, AgentVerdict, Consensus, CitationValidation, AgreementLevel, CitationRecommendationType, Tier3Result, Tier3AgentVerdict, Tier3Consensus, Tier3FinalStatus, Tier3AgreementLevel, Tier3RiskLevel } from '@/types/citation-json'
import {
  getCitationAuthorityValidatorPrompt,
  getCaseEcologyValidatorPrompt,
  getTemporalRealityValidatorPrompt,
  getLegalKnowledgeValidatorPrompt,
  getRealityAssessmentExpertPrompt
} from './validation-prompts'
import { parseAgentResponse, ParsedVerdict } from './response-parser'
import { 
  getTier3InvestigationPrompt, 
  parseTier3Response, 
  parseTier3AgentResponse,
  getRigorousLegalInvestigatorPrompt,
  getHolisticLegalAnalystPrompt,
  getPatternRecognitionExpertPrompt
} from './tier3-prompts'
import { extractDocumentContext } from './context-extractor'
import { extractTokens, calculateCost, calculateRunCost } from './token-tracking'

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

// Tier 3 agent configurations
const TIER3_AGENT_CONFIGS = [
  {
    name: 'tier3_rigorous_legal_investigator_v1',
    getPrompt: getRigorousLegalInvestigatorPrompt,
  },
  {
    name: 'tier3_holistic_legal_analyst_v1',
    getPrompt: getHolisticLegalAnalystPrompt,
  },
  {
    name: 'tier3_pattern_recognition_expert_v1',
    getPrompt: getPatternRecognitionExpertPrompt,
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
            temperature: 0.4, // Balanced temperature for consistent but not overly conservative validation
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
    
    // Extract token usage from response
    const tokenUsage = extractTokens(message, MODEL, 'anthropic')
    
    // Extract text from response
    const responseText = message.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    
    // Parse response
    const parsed = parseAgentResponse(responseText, agentConfig.name)
    
    // Build agent verdict - prioritize new format (numeric score)
    const verdict: AgentVerdict = {
      agent: agentConfig.name,
      timestamp: new Date().toISOString(),
      model: MODEL,
    }
    
    // New format: numeric scoring
    if (parsed.score !== undefined) {
      verdict.score = parsed.score
      if (parsed.reasoning) {
        verdict.reasoning = parsed.reasoning
      }
    } else {
      // Legacy format: verdict-based
      verdict.verdict = parsed.verdict
      if (parsed.invalid_reason) {
        verdict.invalid_reason = parsed.invalid_reason
      }
      if (parsed.uncertain_reason) {
        verdict.uncertain_reason = parsed.uncertain_reason
      }
    }
    
    // Add token usage and cost if available
    if (tokenUsage) {
      verdict.token_usage = {
        input_tokens: tokenUsage.input_tokens,
        output_tokens: tokenUsage.output_tokens,
        total_tokens: tokenUsage.total_tokens,
        provider: tokenUsage.provider,
      }
      const cost = calculateCost(tokenUsage)
      verdict.cost = cost
    }
    
    return verdict
  } catch (error) {
    console.error(`[Validation] Error calling agent ${agentConfig.name} after retries:`, error)
    
    // Return default score of 5 (middle) on error after retries exhausted
    return {
      agent: agentConfig.name,
      score: 5,
      reasoning: 'api_error',
      timestamp: new Date().toISOString(),
      model: MODEL,
    }
  }
}

/**
 * Calculate consensus from panel evaluations
 * Supports both new format (numeric scoring) and legacy format (verdict-based)
 */
export function calculateConsensus(panelEvaluations: AgentVerdict[]): Consensus {
  // Check if we're using new format (numeric scoring)
  const isNewFormat = panelEvaluations.some(eval_ => typeof eval_.score === 'number')
  
  if (isNewFormat) {
    // NEW FORMAT: Numeric scoring
    const scores = panelEvaluations
      .map(eval_ => eval_.score ?? 5) // Default to 5 if score missing
      .filter((score): score is number => typeof score === 'number' && score >= 1 && score <= 10)
    
    // Calculate statistics
    const average_score = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - average_score, 2), 0) / scores.length
    const standard_deviation = Math.sqrt(variance)
    
    // Determine agreement level based on standard deviation
    let agreement_level: AgreementLevel
    if (standard_deviation <= 1.0) {
      agreement_level = 'unanimous' // Very low variance
    } else if (standard_deviation <= 2.0) {
      agreement_level = 'strong' // Low variance
    } else {
      agreement_level = 'split' // High variance
    }
    
    // Calculate confidence score: normalized average (0-1 scale)
    const confidence_score = average_score / 10
    
    // Determine recommendation based on average_score
    let recommendation: CitationRecommendationType
    let reasoning = ''
    
    if (average_score >= 8.0) {
      recommendation = 'CITATION_LIKELY_VALID'
      reasoning = `High average confidence (${average_score.toFixed(1)}/10). Citation assessed as real.`
    } else if (average_score >= 5.0) {
      recommendation = 'CITATION_UNCERTAIN'
      reasoning = `Moderate average confidence (${average_score.toFixed(1)}/10). Citation has mixed signals.`
    } else {
      recommendation = 'CITATION_LIKELY_HALLUCINATED'
      reasoning = `Low average confidence (${average_score.toFixed(1)}/10). Multiple concerns identified.`
    }
    
    // Add variance information
    if (standard_deviation > 2.0) {
      reasoning += ` High variance (σ=${standard_deviation.toFixed(1)}) indicates panel disagreement.`
    }
    
    // Add specific agent concerns to reasoning
    const concerns: string[] = []
    for (const eval_ of panelEvaluations) {
      if (eval_.score !== undefined && eval_.score < 5 && eval_.reasoning) {
        concerns.push(`${eval_.agent}: ${eval_.reasoning.substring(0, 50)}`)
      }
    }
    
    if (concerns.length > 0) {
      reasoning += ` Concerns: ${concerns.join('; ')}.`
    }
    
    // Code-based Tier 3 escalation: variance OR low average score
    const tier_3_trigger = standard_deviation > 2.0 || average_score < 6.0
    
    return {
      agreement_level,
      scores,
      average_score,
      variance,
      standard_deviation,
      confidence_score,
      recommendation,
      reasoning,
      tier_3_trigger,
    }
  } else {
    // LEGACY FORMAT: Verdict-based
  const verdict_counts = {
    VALID: 0,
    INVALID: 0,
    UNCERTAIN: 0,
  }
  
  for (const eval_ of panelEvaluations) {
      if (eval_.verdict) {
    verdict_counts[eval_.verdict]++
      }
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
  let recommendation: CitationRecommendationType
  let reasoning = ''
  
  if (verdict_counts.VALID >= 4) {
    recommendation = 'CITATION_LIKELY_VALID'
    reasoning = `All agents (${verdict_counts.VALID}/5) found no issues. Citation assessed as real.`
  } else if (verdict_counts.VALID >= 2) {
    recommendation = 'CITATION_UNCERTAIN'
    reasoning = `Panel disagreement: ${verdict_counts.VALID} valid, ${verdict_counts.INVALID} invalid, ${verdict_counts.UNCERTAIN} uncertain. Citation has both credible and suspicious markers.`
  } else {
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
  
  const result: CitationValidation = {
    panel_evaluation: panelEvaluations,
    consensus,
  }
  
  // Calculate and add run cost
  result.run_cost = calculateRunCost(result)
  
  return result
}

/**
 * Call a single Tier 3 agent with retry logic
 */
async function callTier3Agent(
  agentConfig: typeof TIER3_AGENT_CONFIGS[number],
  citation: Citation,
  context: string,
  // tier2Results parameter kept for logging but not passed to prompts (Tier 3 evaluates independently)
  tier2Results: CitationValidation,
  apiKey: string
): Promise<Tier3AgentVerdict> {
  const anthropic = new Anthropic({ apiKey })
  // Remove tier2Results from prompt call - Tier 3 evaluates independently
  const prompt = agentConfig.getPrompt(citation, context)
  const agentName = agentConfig.name
  
  try {
    const message = await retry(
      async (bail: (error: Error) => void): Promise<Anthropic.Messages.Message> => {
        try {
          return await anthropic.messages.create({
            model: TIER3_MODEL,
            max_tokens: 2048,
            temperature: 0.4, // Balanced temperature for consistent but not overly conservative validation
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
            `[Tier3] Retrying agent ${agentName} (attempt ${attempt}/${RETRY_CONFIG.retries + 1}):`,
            error instanceof Error ? error.message : String(error)
          )
        },
      }
    )
    
    // Extract token usage from response
    const tokenUsage = extractTokens(message, TIER3_MODEL, 'anthropic')
    
    // Extract text from response
    const responseText = message.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    
    // Parse response
    const parsed = parseTier3AgentResponse(responseText, agentName)
    
    // Build agent verdict - prioritize new format (risk-based)
    const verdict: Tier3AgentVerdict = {
      agent: agentName,
      reasoning: parsed.reasoning,
      timestamp: new Date().toISOString(),
      model: TIER3_MODEL,
    }
    
    // New format: risk-based evaluation
    if (parsed.risk_level) {
      verdict.risk_level = parsed.risk_level
    } else {
      // Legacy format: verdict-based
      verdict.verdict = parsed.verdict
      if (parsed.invalid_reason) {
        verdict.invalid_reason = parsed.invalid_reason
      }
      if (parsed.uncertain_reason) {
        verdict.uncertain_reason = parsed.uncertain_reason
      }
    }
    
    // Add token usage and cost if available
    if (tokenUsage) {
      verdict.token_usage = {
        input_tokens: tokenUsage.input_tokens,
        output_tokens: tokenUsage.output_tokens,
        total_tokens: tokenUsage.total_tokens,
        provider: tokenUsage.provider,
      }
      const cost = calculateCost(tokenUsage)
      verdict.cost = cost
    }
    
    return verdict
  } catch (error) {
    console.error(`[Tier3] Error calling agent ${agentName} after retries:`, error)
    
    // Return default MODERATE_RISK on error after retries exhausted
    return {
      agent: agentName,
      risk_level: 'MODERATE_RISK',
      reasoning: `Error occurred during Tier 3 investigation: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: new Date().toISOString(),
      model: TIER3_MODEL,
    }
  }
}

/**
 * Helper function to get Tier 3 final status from new format (risk-based) or legacy format
 * Maps risk levels to final_status for backward compatibility
 */
export function getTier3FinalStatus(tier3Result: Tier3Result | null | undefined): Tier3FinalStatus | null {
  if (!tier3Result) {
    return null
  }
  
  // New format: use consensus.final_risk_level and map to final_status
  if (tier3Result.consensus?.final_risk_level) {
    const riskLevel = tier3Result.consensus.final_risk_level
    if (riskLevel === 'LOW_RISK') {
      return 'VALID'
    } else if (riskLevel === 'MODERATE_RISK') {
      return 'WARN'
    } else if (riskLevel === 'NEEDS_ADDITIONAL_REVIEW') {
      return 'FAIL'
    }
  }
  
  // Legacy format: use consensus.final_status
  if (tier3Result.consensus?.final_status) {
    return tier3Result.consensus.final_status
  }
  
  // Old format: map legacy verdict to new status
  if (tier3Result.verdict) {
    if (tier3Result.verdict === 'VERIFIED_REAL' || tier3Result.verdict === 'LIKELY_REAL') {
      return 'VALID'
    } else if (tier3Result.verdict === 'NEEDS_HUMAN_REVIEW') {
      return 'WARN'
    } else if (tier3Result.verdict === 'LIKELY_FABRICATED') {
      return 'FAIL'
    }
  }
  
  // Default to WARN if we can't determine
  return 'WARN'
}

/**
 * Calculate Tier 3 consensus from 3-agent panel evaluations
 * Supports both new format (risk-based) and legacy format (verdict-based)
 */
export function calculateTier3Consensus(panelEvaluations: Tier3AgentVerdict[]): Tier3Consensus {
  // Check if we're using new format (risk-based)
  const isNewFormat = panelEvaluations.some(eval_ => eval_.risk_level !== undefined)
  
  if (isNewFormat) {
    // NEW FORMAT: Risk-based evaluation
    const risk_level_counts = {
      LOW_RISK: 0,
      MODERATE_RISK: 0,
      NEEDS_ADDITIONAL_REVIEW: 0,
    }
    
    for (const eval_ of panelEvaluations) {
      if (eval_.risk_level) {
        risk_level_counts[eval_.risk_level]++
      }
    }
    
    // Determine final_risk_level (majority wins, with tie-breaker logic)
    let final_risk_level: Tier3RiskLevel
    const maxCount = Math.max(
      risk_level_counts.LOW_RISK,
      risk_level_counts.MODERATE_RISK,
      risk_level_counts.NEEDS_ADDITIONAL_REVIEW
    )
    
    if (risk_level_counts.LOW_RISK === maxCount && risk_level_counts.LOW_RISK >= 2) {
      final_risk_level = 'LOW_RISK'
    } else if (risk_level_counts.NEEDS_ADDITIONAL_REVIEW === maxCount && risk_level_counts.NEEDS_ADDITIONAL_REVIEW >= 2) {
      final_risk_level = 'NEEDS_ADDITIONAL_REVIEW'
    } else {
      final_risk_level = 'MODERATE_RISK' // Default for ties or mixed results
    }
    
    // Determine agreement level
    let agreement_level: Tier3AgreementLevel
    if (maxCount === 3) {
      agreement_level = 'unanimous'
    } else if (maxCount === 2) {
      agreement_level = 'majority'
    } else {
      agreement_level = 'split'
    }
    
    // Calculate confidence score: maxCount / 3
    const confidence_score = maxCount / 3
    
    // Generate reasoning
    let reasoning = `Panel consensus: ${risk_level_counts.LOW_RISK} low risk, ${risk_level_counts.MODERATE_RISK} moderate risk, ${risk_level_counts.NEEDS_ADDITIONAL_REVIEW} needs additional review. `
    
    if (final_risk_level === 'LOW_RISK') {
      reasoning += 'All three agents assessed the citation as low risk.'
    } else if (final_risk_level === 'MODERATE_RISK') {
      reasoning += 'Mixed risk assessment - some concerns exist but citation may still be valid.'
    } else {
      reasoning += 'Multiple agents identified significant concerns requiring additional review.'
    }
    
    // Add specific agent concerns to reasoning
    const concerns: string[] = []
    for (const eval_ of panelEvaluations) {
      if (eval_.risk_level === 'NEEDS_ADDITIONAL_REVIEW' && eval_.reasoning) {
        concerns.push(`${eval_.agent}: ${eval_.reasoning.substring(0, 100)}`)
      } else if (eval_.risk_level === 'MODERATE_RISK' && eval_.reasoning) {
        concerns.push(`${eval_.agent}: ${eval_.reasoning.substring(0, 80)}`)
      }
    }
    
    if (concerns.length > 0) {
      reasoning += ` Concerns: ${concerns.join('; ')}.`
    }
    
    return {
      agreement_level,
      risk_level_counts,
      final_risk_level,
      confidence_score,
      reasoning,
    }
  } else {
    // LEGACY FORMAT: Verdict-based
  const verdict_counts = {
    VALID: 0,
    INVALID: 0,
    UNCERTAIN: 0,
  }
  
  for (const eval_ of panelEvaluations) {
      if (eval_.verdict) {
    verdict_counts[eval_.verdict]++
      }
  }
  
  // Determine final_status based on VALID count:
  // - VALID if 3 VALID votes (3/3)
  // - WARN if 2 VALID votes (2/3)
  // - FAIL if <2 VALID votes
  let final_status: Tier3FinalStatus
  if (verdict_counts.VALID === 3) {
    final_status = 'VALID'
  } else if (verdict_counts.VALID === 2) {
    final_status = 'WARN'
  } else {
    final_status = 'FAIL'
  }
  
  // Determine agreement level
  const maxCount = Math.max(verdict_counts.VALID, verdict_counts.INVALID, verdict_counts.UNCERTAIN)
  let agreement_level: Tier3AgreementLevel
  if (maxCount === 3) {
    agreement_level = 'unanimous'
  } else if (maxCount === 2) {
    agreement_level = 'majority'
  } else {
    agreement_level = 'split'
  }
  
  // Calculate confidence score: maxCount / 3
  const confidence_score = maxCount / 3
  
  // Generate reasoning
  let reasoning = `Panel consensus: ${verdict_counts.VALID} valid, ${verdict_counts.INVALID} invalid, ${verdict_counts.UNCERTAIN} uncertain. `
  
  if (final_status === 'VALID') {
    reasoning += 'All three agents found the citation to be valid.'
  } else if (final_status === 'WARN') {
    reasoning += 'Two agents found the citation valid, but one agent raised concerns.'
  } else {
    reasoning += 'Less than two agents found the citation valid, indicating potential issues.'
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
  
  return {
    agreement_level,
    verdict_counts,
    final_status,
    confidence_score,
    reasoning,
    }
  }
}

/**
 * Perform Tier 3 investigation for a citation with 3-agent panel
 */
export async function validateCitationTier3(
  citation: Citation,
  context: string,
  tier2Results: CitationValidation,
  apiKey: string
): Promise<Tier3Result> {
  try {
    // Call all 3 agents in parallel
    const agentPromises = TIER3_AGENT_CONFIGS.map(agentConfig =>
      callTier3Agent(agentConfig, citation, context, tier2Results, apiKey)
    )
    
    const panelEvaluations = await Promise.all(agentPromises)
    
    // Calculate consensus
    const consensus = calculateTier3Consensus(panelEvaluations)
    
    // Aggregate reasoning and evidence from panel
    const allReasoning = panelEvaluations.map(e => e.reasoning || '').filter(r => r.length > 0)
    const aggregatedReasoning = allReasoning.length > 0 
      ? allReasoning.join(' ') 
      : consensus.reasoning
    
    // Build Tier 3 result
    const result: Tier3Result = {
      panel_evaluation: panelEvaluations,
      consensus,
      // Legacy fields for backward compatibility
      reasoning: aggregatedReasoning,
      key_evidence: consensus.reasoning,
      timestamp: new Date().toISOString(),
      model: TIER3_MODEL,
    }
    
    // Calculate and add run cost
    result.run_cost = calculateRunCost(result)
    
    return result
  } catch (error) {
    console.error(`[Tier3] Error investigating citation ${citation.id} after retries:`, error)
    if (error instanceof Error) {
      console.error(`[Tier3] Error message: ${error.message}`)
      console.error(`[Tier3] Error stack: ${error.stack}`)
    }
    
    // Return fail result on error after retries exhausted
    // Create error panel evaluation
    const errorPanel: Tier3AgentVerdict[] = [
      {
        agent: 'tier3_agent_error',
        verdict: 'UNCERTAIN',
        uncertain_reason: 'api_error',
        reasoning: `Error occurred during Tier 3 investigation: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
        model: TIER3_MODEL,
      },
      {
        agent: 'tier3_agent_error',
        verdict: 'UNCERTAIN',
        uncertain_reason: 'api_error',
        reasoning: 'Investigation could not be completed due to technical error',
        timestamp: new Date().toISOString(),
        model: TIER3_MODEL,
      },
      {
        agent: 'tier3_agent_error',
        verdict: 'UNCERTAIN',
        uncertain_reason: 'api_error',
        reasoning: 'Investigation could not be completed due to technical error',
        timestamp: new Date().toISOString(),
        model: TIER3_MODEL,
      },
    ]
    
    return {
      panel_evaluation: errorPanel,
      consensus: calculateTier3Consensus(errorPanel),
      reasoning: `Error occurred during Tier 3 investigation: ${error instanceof Error ? error.message : String(error)}`,
      key_evidence: 'Investigation could not be completed due to technical error',
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

