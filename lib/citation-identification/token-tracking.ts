/**
 * Token usage tracking and cost calculation
 * Designed to support multiple providers/models (currently Anthropic, extensible for OpenAI, Gemini)
 */

export type Provider = 'anthropic' | 'openai' | 'gemini'

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  provider: Provider
  model: string
}

export interface TokenCost {
  input_cost: number
  output_cost: number
  total_cost: number
  currency: string
}

import { getModelPricing } from './model-pricing'

/**
 * Extract token usage from Anthropic API response
 * Designed to be extended for other providers
 */
export function extractAnthropicTokens(
  response: any,
  model: string
): TokenUsage | null {
  if (!response?.usage) return null
  
  return {
    input_tokens: response.usage.input_tokens || 0,
    output_tokens: response.usage.output_tokens || 0,
    total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
    provider: 'anthropic',
    model,
  }
}

/**
 * Extract token usage from OpenAI API response (for future use)
 */
export function extractOpenAITokens(
  response: any,
  model: string
): TokenUsage | null {
  if (!response?.usage) return null
  
  return {
    input_tokens: response.usage.prompt_tokens || 0,
    output_tokens: response.usage.completion_tokens || 0,
    total_tokens: response.usage.total_tokens || 0,
    provider: 'openai',
    model,
  }
}

/**
 * Extract token usage from Google Gemini API response (for future use)
 */
export function extractGeminiTokens(
  response: any,
  model: string
): TokenUsage | null {
  if (!response?.usageMetadata) return null
  
  return {
    input_tokens: response.usageMetadata.promptTokenCount || 0,
    output_tokens: response.usageMetadata.candidatesTokenCount || 0,
    total_tokens: response.usageMetadata.totalTokenCount || 0,
    provider: 'gemini',
    model,
  }
}

/**
 * Extract token usage from API response (auto-detect provider)
 * Currently supports Anthropic, designed to support others
 */
export function extractTokens(
  response: any,
  model: string,
  provider?: Provider
): TokenUsage | null {
  // Auto-detect provider if not specified
  if (!provider) {
    if (response?.usage?.input_tokens !== undefined) {
      provider = 'anthropic'
    } else if (response?.usage?.prompt_tokens !== undefined) {
      provider = 'openai'
    } else if (response?.usageMetadata) {
      provider = 'gemini'
    } else {
      return null
    }
  }
  
  switch (provider) {
    case 'anthropic':
      return extractAnthropicTokens(response, model)
    case 'openai':
      return extractOpenAITokens(response, model)
    case 'gemini':
      return extractGeminiTokens(response, model)
    default:
      return null
  }
}

/**
 * Calculate cost for token usage based on model pricing
 */
export function calculateCost(tokenUsage: TokenUsage): TokenCost {
  const pricing = getModelPricing(tokenUsage.model)
  
  if (!pricing) {
    console.warn(`[TokenTracking] No pricing found for model: ${tokenUsage.model}`)
    return {
      input_cost: 0,
      output_cost: 0,
      total_cost: 0,
      currency: 'USD',
    }
  }
  
  // Pricing is per 1M tokens, so divide by 1,000,000
  const inputCost = (tokenUsage.input_tokens / 1_000_000) * pricing.input
  const outputCost = (tokenUsage.output_tokens / 1_000_000) * pricing.output
  
  return {
    input_cost: inputCost,
    output_cost: outputCost,
    total_cost: inputCost + outputCost,
    currency: 'USD',
  }
}

/**
 * Calculate total cost for a validation run
 * Aggregates token usage from all agent verdicts
 * Works with both Tier 2 and Tier 3 results
 */
export function calculateRunCost(validationResult: any): {
  byModel: Record<string, TokenCost>
  total: TokenCost
} {
  const modelUsage: Record<string, TokenUsage> = {}
  
  // Extract from Tier 2 panel evaluations
  if (validationResult?.panel_evaluation) {
    for (const verdict of validationResult.panel_evaluation) {
      if (verdict.token_usage && verdict.model) {
        const model = verdict.model
        if (!modelUsage[model]) {
          modelUsage[model] = {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            provider: verdict.token_usage.provider || 'anthropic',
            model,
          }
        }
        modelUsage[model].input_tokens += verdict.token_usage.input_tokens || 0
        modelUsage[model].output_tokens += verdict.token_usage.output_tokens || 0
        modelUsage[model].total_tokens += verdict.token_usage.total_tokens || 0
      }
    }
  }
  
  // Extract from Tier 3 panel evaluations (if nested in tier_3)
  if (validationResult?.tier_3?.panel_evaluation) {
    for (const verdict of validationResult.tier_3.panel_evaluation) {
      if (verdict.token_usage && verdict.model) {
        const model = verdict.model
        if (!modelUsage[model]) {
          modelUsage[model] = {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            provider: verdict.token_usage.provider || 'anthropic',
            model,
          }
        }
        modelUsage[model].input_tokens += verdict.token_usage.input_tokens || 0
        modelUsage[model].output_tokens += verdict.token_usage.output_tokens || 0
        modelUsage[model].total_tokens += verdict.token_usage.total_tokens || 0
      }
    }
  }
  
  // Also check if validationResult is a Tier3Result directly
  if (validationResult?.panel_evaluation && validationResult?.consensus?.final_status !== undefined) {
    // This is a Tier3Result
    for (const verdict of validationResult.panel_evaluation) {
      if (verdict.token_usage && verdict.model) {
        const model = verdict.model
        if (!modelUsage[model]) {
          modelUsage[model] = {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            provider: verdict.token_usage.provider || 'anthropic',
            model,
          }
        }
        modelUsage[model].input_tokens += verdict.token_usage.input_tokens || 0
        modelUsage[model].output_tokens += verdict.token_usage.output_tokens || 0
        modelUsage[model].total_tokens += verdict.token_usage.total_tokens || 0
      }
    }
  }
  
  // Calculate costs per model
  const byModel: Record<string, TokenCost> = {}
  let totalInputCost = 0
  let totalOutputCost = 0
  
  for (const [model, usage] of Object.entries(modelUsage)) {
    const cost = calculateCost(usage)
    byModel[model] = cost
    totalInputCost += cost.input_cost
    totalOutputCost += cost.output_cost
  }
  
  return {
    byModel,
    total: {
      input_cost: totalInputCost,
      output_cost: totalOutputCost,
      total_cost: totalInputCost + totalOutputCost,
      currency: 'USD',
    },
  }
}

