/**
 * Model pricing configuration
 * Prices are per 1M tokens in USD
 * Update this file when pricing changes or new models are added
 */

export interface ModelPricing {
  input: number  // Price per 1M input tokens
  output: number // Price per 1M output tokens
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude models
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
  
  // OpenAI models (for future use)
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  
  // Google Gemini models (for future use)
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
}

/**
 * Get pricing for a model, returns null if not found
 */
export function getModelPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] || null
}

