/**
 * Heavy Model Analysis Service
 * Runs full-document analysis using a heavy model (Claude Sonnet/GPT-4/Gemini/Grok)
 * Evaluates all citations at once with document context
 */

import Anthropic from '@anthropic-ai/sdk'
import retry from 'async-retry'
import { CitationDocument, Citation, HeavyAnalysisResult, HeavyAnalysisRiskLevel } from '@/types/citation-json'
import { extractTokens, calculateCost, TokenUsage, Provider } from './token-tracking'
// Import types only (not the implementation) to avoid webpack chunking issues
import type OpenAI from 'openai'

// Default model per provider
export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-pro',
  grok: 'grok-3-fast',
}

// Grok models (xAI - using OpenAI-compatible API)
export const GROK_MODELS = ['grok-3-fast-beta', 'grok-3-fast', 'grok-3-fast-latest']

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

/**
 * Extract full document text from JSON (removing citation markers)
 */
function extractFullDocumentText(jsonData: CitationDocument): string {
  const { document } = jsonData
  return document.content
    .map(para => para.text
      .replace(/\[CITATION:[^\]]+\]/g, '')
      .replace(/\[\/CITATION:[^\]]+\]/g, '')
      .trim()
    )
    .filter(text => text.length > 0)
    .join('\n\n')
}

/**
 * Build prompt for heavy model analysis
 */
function buildHeavyAnalysisPrompt(
  documentText: string,
  citations: Citation[],
  basePrompt: string
): string {
  // Format citations list with IDs and full text
  const citationsList = citations
    .map((cit, idx) => {
      const components = cit.extractedComponents
      let details = ''
      
      if ('parties' in components) {
        details = `Parties: ${components.parties.join(' v. ')}, Reporter: ${components.reporter}, Volume: ${components.page}, Court: ${components.court}, Year: ${components.year}`
      } else if ('title' in components && 'code' in components) {
        details = `Title: ${components.title}, Code: ${components.code}, Section: ${components.section}`
      }
      
      return `${idx + 1}. ID: ${cit.id}\n   Citation: ${cit.citationText}\n   ${details ? `   Details: ${details}` : ''}`
    })
    .join('\n\n')

  return `${basePrompt}

## Document Text

${documentText}

## Citations to Verify

Total Citations: ${citations.length}

${citationsList}

## Your Response

Provide your JSON response following the exact format specified above. Include all ${citations.length} citations.`
}

/**
 * Parse heavy model response
 */
function parseHeavyAnalysisResponse(
  responseText: string,
  citations: Citation[]
): Map<string, Omit<HeavyAnalysisResult, 'timestamp' | 'model' | 'token_usage' | 'cost'>> {
  const results = new Map<string, Omit<HeavyAnalysisResult, 'timestamp' | 'model' | 'token_usage' | 'cost'>>()
  
  // Try to extract JSON from response - look for JSON object
  let jsonText = responseText.trim()
  
  // Remove markdown code blocks if present
  jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  
  // Find JSON object boundaries
  const firstBrace = jsonText.indexOf('{')
  const lastBrace = jsonText.lastIndexOf('}')
  
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('No valid JSON object found in response')
  }
  
  jsonText = jsonText.substring(firstBrace, lastBrace + 1)
  
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    console.error('[HeavyAnalysis] JSON parse error:', error)
    console.error('[HeavyAnalysis] JSON text length:', jsonText.length)
    console.error('[HeavyAnalysis] JSON text preview (first 500):', jsonText.substring(0, 500))
    console.error('[HeavyAnalysis] JSON text preview (last 500):', jsonText.substring(Math.max(0, jsonText.length - 500)))
    
    // Check if JSON appears truncated (common when hitting token limits)
    const openBraces = (jsonText.match(/{/g) || []).length
    const closeBraces = (jsonText.match(/}/g) || []).length
    const openBrackets = (jsonText.match(/\[/g) || []).length
    const closeBrackets = (jsonText.match(/\]/g) || []).length
    
    if (openBraces > closeBraces || openBrackets > closeBrackets) {
      const missingBraces = openBraces - closeBraces
      const missingBrackets = openBrackets - closeBrackets
      throw new Error(`Failed to parse JSON: Response appears to be truncated (missing ${missingBraces} closing brace(s) and ${missingBrackets} closing bracket(s)). This usually means the model hit the output token limit. Consider using a model with higher output limits (e.g., Gemini 3 Pro supports 64k tokens) or reducing the number of citations analyzed at once. ${error instanceof Error ? error.message : String(error)}`)
    }
    
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  if (!parsed.citations || !Array.isArray(parsed.citations)) {
    throw new Error('Response missing "citations" array')
  }
  
  // Validate and map results
  for (const result of parsed.citations) {
    if (!result.id) {
      console.warn('[HeavyAnalysis] Result missing id:', result)
      continue
    }
    
    // Verify citation exists
    const citation = citations.find(c => c.id === result.id)
    if (!citation) {
      console.warn(`[HeavyAnalysis] Result for unknown citation ID: ${result.id}`)
      continue
    }
    
    // Validate risk level
    const riskLevel = result.riskLevel
    if (!riskLevel || !['Low Risk', 'Medium Risk', 'human review'].includes(riskLevel)) {
      console.warn(`[HeavyAnalysis] Invalid risk level for ${result.id}: ${riskLevel}, defaulting to "human review"`)
      result.riskLevel = 'human review'
    }
    
    results.set(result.id, {
      riskLevel: result.riskLevel as HeavyAnalysisRiskLevel,
      caseFit: result.caseFit || 'No case fit analysis provided.',
      caseLink: result.caseLink,
      analysis: result.analysis,
    })
  }
  
  // Warn if any citations are missing
  const resultIds = new Set(results.keys())
  const missingIds = citations
    .map(c => c.id)
    .filter(id => !resultIds.has(id))
  
  if (missingIds.length > 0) {
    console.warn(`[HeavyAnalysis] Missing results for ${missingIds.length} citations:`, missingIds)
    
    // Add default results for missing citations
    for (const missingId of missingIds) {
      results.set(missingId, {
        riskLevel: 'human review',
        caseFit: 'No analysis provided by model.',
        caseLink: undefined,
        analysis: 'Citation was not included in model response.',
      })
    }
  }
  
  return results
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropic(
  prompt: string,
  model: string,
  apiKey: string,
  maxOutputTokens: number
): Promise<{ responseText: string; tokenUsage: TokenUsage | null }> {
  const anthropic = new Anthropic({ apiKey })
  
  const message = await retry(
    async (bail: (error: Error) => void): Promise<Anthropic.Messages.Message> => {
      try {
        return await anthropic.messages.create({
          model,
          max_tokens: maxOutputTokens,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        })
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

  const tokenUsage = extractTokens(message, model, 'anthropic')
  const responseText = message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')

  return { responseText, tokenUsage }
}

/**
 * Call OpenAI API (or Grok via OpenAI-compatible endpoint)
 */
async function callOpenAI(
  prompt: string,
  model: string,
  apiKey: string,
  maxOutputTokens: number,
  isGrok: boolean = false
): Promise<{ responseText: string; tokenUsage: TokenUsage | null }> {
  // Dynamic import to avoid webpack chunking issues
  const { default: OpenAI } = await import('openai')
  const baseURL = isGrok ? 'https://api.x.ai/v1' : undefined
  
  // Validate Grok model if it's Grok
  if (isGrok && !GROK_MODELS.includes(model)) {
    throw new Error(`Invalid Grok model: ${model}. Valid models are: ${GROK_MODELS.join(', ')}. The model 'grok-beta' has been deprecated.`)
  }
  
  const openai = new OpenAI({ apiKey, baseURL })
  
  console.log(`[callOpenAI] Calling ${isGrok ? 'Grok' : 'OpenAI'} API with model: ${model}, baseURL: ${baseURL || 'default'}`)
  
  // GPT-5.1 models require 'max_completion_tokens' instead of 'max_tokens'
  const isGPT51 = model.startsWith('gpt-5.1')
  
  const completion = await retry(
    async (bail: (error: Error) => void): Promise<any> => {
      try {
        const requestParams: any = {
          model,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        }
        
        // Use the correct parameter name based on model version
        if (isGPT51) {
          requestParams.max_completion_tokens = maxOutputTokens
        } else {
          requestParams.max_tokens = maxOutputTokens
        }
        
        return await openai.chat.completions.create(requestParams)
      } catch (error: any) {
        // Check for deprecated model errors
        if (error?.message?.includes('deprecated') || error?.message?.includes('grok-beta')) {
          const errorMsg = error.message || String(error)
          console.error(`[callOpenAI] Deprecated model error: ${errorMsg}`)
          bail(new Error(`Model ${model} is deprecated. Please use one of: ${GROK_MODELS.join(', ')}`))
          throw error
        }
        if (!isRetryableError(error)) {
          bail(error instanceof Error ? error : new Error(String(error)))
          throw error
        }
        throw error
      }
    },
    RETRY_CONFIG
  )

  const tokenUsage = extractTokens(completion, model, 'openai')
  const responseText = completion.choices[0]?.message?.content || ''

  return { responseText, tokenUsage }
}

/**
 * Call Google Gemini API
 */
async function callGemini(
  prompt: string,
  model: string,
  apiKey: string,
  maxOutputTokens: number
): Promise<{ responseText: string; tokenUsage: TokenUsage | null }> {
  // Dynamic import to avoid webpack chunking issues
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({ 
    model,
    generationConfig: {
      maxOutputTokens: maxOutputTokens,
      temperature: 0.3,
    },
  })
  
  const result = await retry(
    async (bail: (error: Error) => void) => {
      try {
        return await genModel.generateContent(prompt)
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

  const response = result.response
  const responseText = response.text()
  
  // Extract token usage from Gemini response
  // Gemini returns usage in result.response.usageMetadata
  const usageMetadata = (result.response as any).usageMetadata
  const tokenUsage: TokenUsage | null = usageMetadata ? {
    input_tokens: usageMetadata.promptTokenCount || 0,
    output_tokens: usageMetadata.candidatesTokenCount || 0,
    total_tokens: usageMetadata.totalTokenCount || 0,
    provider: 'gemini',
    model,
  } : null

  return { responseText, tokenUsage }
}

/**
 * Determine provider from model name
 */
export function getProviderFromModel(model: string): Provider {
  if (model.startsWith('claude-') || model.startsWith('claude_')) {
    return 'anthropic'
  }
  if (GROK_MODELS.includes(model)) {
    return 'grok' // Grok is now a separate provider
  }
  if (model.startsWith('gpt-') || model.startsWith('gpt_')) {
    return 'openai'
  }
  if (model.startsWith('gemini-') || model.startsWith('gemini_')) {
    return 'gemini'
  }
  // Default to anthropic for backward compatibility
  return 'anthropic'
}

/**
 * Run heavy model analysis on entire document
 */
export async function runHeavyAnalysis(
  jsonData: CitationDocument,
  basePrompt: string,
  provider: Provider,
  model: string,
  apiKey: string
): Promise<CitationDocument> {
  const citations = jsonData.document.citations || []
  
  if (citations.length === 0) {
    console.log('[HeavyAnalysis] No citations to analyze')
    return jsonData
  }

  console.log(`[HeavyAnalysis] Starting analysis for ${citations.length} citations using ${provider}/${model}`)

  // Extract full document text
  const documentText = extractFullDocumentText(jsonData)
  console.log(`[HeavyAnalysis] Document text length: ${documentText.length} characters`)
  
  // Build prompt
  const prompt = buildHeavyAnalysisPrompt(documentText, citations, basePrompt)
  
  // Estimate token usage (rough estimate: 4 chars per token)
  const estimatedInputTokens = Math.ceil(prompt.length / 4)
  
  // Set max output tokens to each provider's maximum limit
  // This prevents truncation and simplifies the code - models will naturally stop when done
  // Different providers have different maximum limits:
  // - Anthropic Claude: 8192 tokens (required parameter)
  // - OpenAI GPT-5.1: 65536 tokens (64k) for output
  // - OpenAI GPT-4: 16384 tokens (required parameter)
  // - Grok: 8192 tokens (required parameter)
  // - Gemini 3 Pro: 65536 tokens (64k)
  // - Other Gemini models: 8192 tokens (optional, but we set it for consistency)
  let maxOutputTokens: number
  if (provider === 'openai') {
    // Check if this is GPT-5.1 which supports 64k output tokens
    const isGPT51 = model.startsWith('gpt-5.1')
    if (isGPT51) {
      maxOutputTokens = 65536 // GPT-5.1 maximum (64k)
      console.log(`[HeavyAnalysis] Using GPT-5.1 with 64k output token limit`)
    } else {
      maxOutputTokens = 16384 // GPT-4 maximum
    }
  } else if (provider === 'grok') {
    maxOutputTokens = 8192 // Grok maximum
  } else if (provider === 'anthropic') {
    maxOutputTokens = 8192 // Claude maximum
  } else if (provider === 'gemini') {
    // Check if this is Gemini 3 Pro which supports 64k output tokens
    const isGemini3Pro = model.includes('gemini-3-pro') || model.startsWith('gemini-3')
    if (isGemini3Pro) {
      maxOutputTokens = 65536 // Gemini 3 Pro maximum (64k)
      console.log(`[HeavyAnalysis] Using Gemini 3 Pro with 64k output token limit`)
    } else {
      maxOutputTokens = 8192 // Other Gemini models maximum
    }
  } else {
    maxOutputTokens = 8192 // Default fallback
  }
  
  console.log(`[HeavyAnalysis] Estimated input tokens: ${estimatedInputTokens}, Max output tokens: ${maxOutputTokens} (provider: ${provider}, citations: ${citations.length})`)

  // Call appropriate provider
  let responseText: string
  let tokenUsage: TokenUsage | null = null
  
  try {
    if (provider === 'anthropic') {
      const result = await callAnthropic(prompt, model, apiKey, maxOutputTokens)
      responseText = result.responseText
      tokenUsage = result.tokenUsage
    } else if (provider === 'openai') {
      const result = await callOpenAI(prompt, model, apiKey, maxOutputTokens, false)
      responseText = result.responseText
      tokenUsage = result.tokenUsage
    } else if (provider === 'grok') {
      // Grok uses OpenAI-compatible API but with different base URL
      // Verify model is a valid Grok model
      if (!GROK_MODELS.includes(model)) {
        console.error(`[HeavyAnalysis] Invalid Grok model: ${model}. Valid models: ${GROK_MODELS.join(', ')}`)
        throw new Error(`Invalid Grok model: ${model}. Please use one of: ${GROK_MODELS.join(', ')}`)
      }
      console.log(`[HeavyAnalysis] Calling Grok API with model: ${model}`)
      const result = await callOpenAI(prompt, model, apiKey, maxOutputTokens, true)
      responseText = result.responseText
      tokenUsage = result.tokenUsage
    } else if (provider === 'gemini') {
      const result = await callGemini(prompt, model, apiKey, maxOutputTokens)
      responseText = result.responseText
      tokenUsage = result.tokenUsage
    } else {
      throw new Error(`Unsupported provider: ${provider}`)
    }
  } catch (error) {
    console.error('[HeavyAnalysis] Failed after retries:', error)
    throw new Error(`Heavy analysis failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Calculate cost
  const cost = tokenUsage ? calculateCost(tokenUsage) : undefined

  if (tokenUsage) {
    console.log(`[HeavyAnalysis] Token usage: ${tokenUsage.input_tokens} input, ${tokenUsage.output_tokens} output, total: ${tokenUsage.total_tokens}`)
  }
  if (cost) {
    console.log(`[HeavyAnalysis] Cost: $${cost.total_cost.toFixed(4)}`)
  }

  console.log(`[HeavyAnalysis] Response length: ${responseText.length} characters`)

  // Check if response might be truncated (common with token limits)
  // Check for empty response or response that doesn't end properly
  const isEmpty = responseText.trim().length === 0
  const responseEndsAbruptly = !responseText.trim().endsWith('}') && !responseText.trim().endsWith(']')
  
  if (tokenUsage && tokenUsage.output_tokens >= maxOutputTokens * 0.95) {
    if (isEmpty) {
      console.warn(`[HeavyAnalysis] Response is empty - output tokens (${tokenUsage.output_tokens}) hit limit (${maxOutputTokens})`)
      throw new Error(`Response was completely truncated due to token limit. The model output ${tokenUsage.output_tokens} tokens (limit: ${maxOutputTokens}). Consider using a model with higher output limits (e.g., Gemini 3 Pro supports 64k tokens) or reducing the number of citations analyzed at once.`)
    } else if (responseEndsAbruptly) {
      console.warn(`[HeavyAnalysis] Response may be truncated - output tokens (${tokenUsage.output_tokens}) near limit (${maxOutputTokens})`)
      throw new Error(`Response was truncated due to token limit. The model output ${tokenUsage.output_tokens} tokens (limit: ${maxOutputTokens}). Consider using a model with higher output limits (e.g., Gemini 3 Pro supports 64k tokens) or reducing the number of citations analyzed at once.`)
    }
  }

  // Parse response
  let analysisResults: Map<string, Omit<HeavyAnalysisResult, 'timestamp' | 'model' | 'token_usage' | 'cost'>>
  try {
    analysisResults = parseHeavyAnalysisResponse(responseText, citations)
  } catch (error) {
    console.error('[HeavyAnalysis] Failed to parse response:', error)
    console.error('[HeavyAnalysis] Response length:', responseText.length, 'characters')
    console.error('[HeavyAnalysis] Response preview (first 1000 chars):', responseText.substring(0, 1000))
    console.error('[HeavyAnalysis] Response preview (last 500 chars):', responseText.substring(Math.max(0, responseText.length - 500)))
    
    // Check if it's a truncation issue
    if (tokenUsage && tokenUsage.output_tokens >= maxOutputTokens * 0.9) {
      throw new Error(`Failed to parse heavy analysis response: ${error instanceof Error ? error.message : String(error)}. The response appears to be truncated (output tokens: ${tokenUsage.output_tokens}/${maxOutputTokens}). Try increasing max output tokens or using a model with higher limits.`)
    }
    
    throw new Error(`Failed to parse heavy analysis response: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log(`[HeavyAnalysis] Parsed ${analysisResults.size} citation results`)

  // Update citations with heavy analysis results
  const updatedCitations = citations.map(citation => {
    const analysis = analysisResults.get(citation.id)
    if (analysis) {
      return {
        ...citation,
        heavy_analysis: {
          ...analysis,
          timestamp: new Date().toISOString(),
          model,
          token_usage: tokenUsage ? {
            input_tokens: tokenUsage.input_tokens,
            output_tokens: tokenUsage.output_tokens,
            total_tokens: tokenUsage.total_tokens,
            provider: tokenUsage.provider,
          } : undefined,
          cost: cost ? {
            input_cost: cost.input_cost,
            output_cost: cost.output_cost,
            total_cost: cost.total_cost,
            currency: cost.currency,
          } : undefined,
        } as HeavyAnalysisResult,
      }
    }
    // If no analysis found, add default
    return {
      ...citation,
      heavy_analysis: {
        riskLevel: 'human review' as HeavyAnalysisRiskLevel,
        caseFit: 'No analysis provided.',
        caseLink: undefined,
        analysis: 'Citation was not analyzed.',
        timestamp: new Date().toISOString(),
        model,
        token_usage: tokenUsage ? {
          input_tokens: tokenUsage.input_tokens,
          output_tokens: tokenUsage.output_tokens,
          total_tokens: tokenUsage.total_tokens,
          provider: tokenUsage.provider,
        } : undefined,
        cost: cost ? {
          input_cost: cost.input_cost,
          output_cost: cost.output_cost,
          total_cost: cost.total_cost,
          currency: cost.currency,
        } : undefined,
      } as HeavyAnalysisResult,
    }
  })

  // Return updated JSON
  return {
    ...jsonData,
    document: {
      ...jsonData.document,
      citations: updatedCitations,
    },
  }
}

/**
 * Comparison types for cross-run analysis
 */
export interface HeavyAnalysisRun {
  runNumber: number;
  jsonData: CitationDocument;
}

export interface HeavyAnalysisComparison {
  citationId: string;
  citationText: string;
  runs: Array<{
    runNumber: number;
    riskLevel: HeavyAnalysisRiskLevel;
    caseFit: string;
    caseLink?: string;
  }>;
  consistency: {
    riskLevelAgreement: number; // 0-1, percentage of runs with same risk level
    mostCommonRiskLevel: HeavyAnalysisRiskLevel;
    riskLevelDistribution: Record<HeavyAnalysisRiskLevel, number>;
    caseLinkConsistency: boolean; // true if all runs provide same link
    averageCaseFitLength: number;
  };
}

/**
 * Compare heavy analysis results across multiple runs
 */
export function compareHeavyAnalysisRuns(
  runs: HeavyAnalysisRun[]
): HeavyAnalysisComparison[] {
  const citationMap = new Map<string, HeavyAnalysisComparison>()
  
  // Collect all results for each citation
  for (const run of runs) {
    const citations = run.jsonData.document.citations || []
    
    for (const citation of citations) {
      if (!citation.heavy_analysis) continue
      
      const existing = citationMap.get(citation.id) || {
        citationId: citation.id,
        citationText: citation.citationText,
        runs: [],
        consistency: {
          riskLevelAgreement: 0,
          mostCommonRiskLevel: 'human review' as HeavyAnalysisRiskLevel,
          riskLevelDistribution: { 'Low Risk': 0, 'Medium Risk': 0, 'human review': 0 },
          caseLinkConsistency: false,
          averageCaseFitLength: 0,
        },
      }
      
      existing.runs.push({
        runNumber: run.runNumber,
        riskLevel: citation.heavy_analysis.riskLevel,
        caseFit: citation.heavy_analysis.caseFit,
        caseLink: citation.heavy_analysis.caseLink,
      })
      
      citationMap.set(citation.id, existing)
    }
  }
  
  // Calculate consistency metrics
  for (const comparison of citationMap.values()) {
    if (comparison.runs.length === 0) continue
    
    const riskLevels = comparison.runs.map(r => r.riskLevel)
    const riskLevelCounts = {
      'Low Risk': riskLevels.filter(r => r === 'Low Risk').length,
      'Medium Risk': riskLevels.filter(r => r === 'Medium Risk').length,
      'human review': riskLevels.filter(r => r === 'human review').length,
    }
    
    const mostCommon = Object.entries(riskLevelCounts)
      .sort((a, b) => b[1] - a[1])[0][0] as HeavyAnalysisRiskLevel
    
    const agreementCount = riskLevels.filter(r => r === mostCommon).length
    const agreementRate = agreementCount / riskLevels.length
    
    const caseLinks = comparison.runs
      .map(r => r.caseLink)
      .filter((link): link is string => !!link)
    const linkConsistency = caseLinks.length > 0 && 
      new Set(caseLinks).size === 1
    
    const avgCaseFitLength = comparison.runs
      .reduce((sum, r) => sum + r.caseFit.length, 0) / comparison.runs.length
    
    comparison.consistency = {
      riskLevelAgreement: agreementRate,
      mostCommonRiskLevel: mostCommon,
      riskLevelDistribution: riskLevelCounts,
      caseLinkConsistency: linkConsistency,
      averageCaseFitLength: avgCaseFitLength,
    }
  }
  
  return Array.from(citationMap.values())
}

