/**
 * Response Parser for Validation Agents
 * Parses LLM responses to extract numeric scores (new format) or VALID/INVALID/UNCERTAIN verdicts (legacy format)
 */

import { ValidationVerdict } from '@/types/citation-json'

export interface ParsedVerdict {
  // New format: numeric scoring
  score?: number; // 1-10
  reasoning?: string; // Optional explanation
  // Legacy format: kept for backward compatibility
  verdict?: ValidationVerdict
  invalid_reason?: string
  uncertain_reason?: string
}

/**
 * Parse agent response to extract numeric score (new format) or verdict (legacy format)
 * Supports both new numeric scoring format and legacy VALID/INVALID/UNCERTAIN format
 */
export function parseAgentResponse(
  responseText: string,
  agentName: string
): ParsedVerdict {
  const normalized = responseText.trim().toUpperCase()
  
  // NEW FORMAT: Try to parse numeric score (1-10)
  // Look for SCORE: pattern
  const scoreMatch = responseText.match(/SCORE:\s*(\d+)/i) || 
                     responseText.match(/SCORE\s*(\d+)/i) ||
                     responseText.match(/(?:^|\s)(\d{1,2})(?:\s|$)/)
  
  if (scoreMatch) {
    const parsedScore = parseInt(scoreMatch[1], 10)
    if (parsedScore >= 1 && parsedScore <= 10) {
      // Extract reasoning if provided - capture everything after REASONING: to end of response
      // Try to capture until a blank line or another section marker, otherwise capture everything
      const reasoningMatch = responseText.match(/REASONING:\s*([\s\S]*?)(?:\n\n|\nSCORE:|$)/i) ||
                             responseText.match(/REASONING:\s*([\s\S]*)/i)
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : undefined
      
      return {
        score: parsedScore,
        reasoning,
      }
    }
  }
  
  // LEGACY FORMAT: Parse VALID/INVALID/UNCERTAIN verdicts
  // Try to parse as JSON first (legacy JSON format)
  try {
    // Extract JSON from response (handle cases where there might be markdown code blocks)
    let jsonText = responseText.trim()
    
    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
    jsonText = jsonText.trim()
    
    // Try to extract JSON object if there's extra text
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }
    
    const parsed = JSON.parse(jsonText)
    
    if (parsed.label && ['VALID', 'INVALID', 'UNCERTAIN'].includes(parsed.label)) {
      const verdict: ValidationVerdict = parsed.label as ValidationVerdict
      const result: ParsedVerdict = { verdict }
      
      // Extract reason from JSON
      if (parsed.reason) {
        // Use the reason text, or derive reason code from signals if needed
        if (verdict === 'INVALID') {
          // Try to extract a reason code from the reason text or signals
          result.invalid_reason = parsed.reason.substring(0, 100) // Store first 100 chars as reason
        } else if (verdict === 'UNCERTAIN') {
          result.uncertain_reason = parsed.reason.substring(0, 100) // Store first 100 chars as reason
        }
      }
      
      return result
    }
  } catch (e) {
    // Not JSON, fall through to text parsing
  }
  
  // Fallback to text parsing (legacy format)
  // Look for verdict keywords
  let verdict: ValidationVerdict = 'UNCERTAIN' // Default to uncertain if unclear
  let invalid_reason: string | undefined
  let uncertain_reason: string | undefined

  // Check for VALID verdict
  if (normalized.includes('VALID') && !normalized.includes('INVALID')) {
    // Make sure it's not part of "INVALID"
    const validIndex = normalized.indexOf('VALID')
    const invalidIndex = normalized.indexOf('INVALID')
    
    if (invalidIndex === -1 || validIndex < invalidIndex) {
      verdict = 'VALID'
    }
  }
  
  // Check for INVALID verdict
  if (normalized.includes('INVALID')) {
    verdict = 'INVALID'
    
    // Try to extract reason code
    // Look for common reason code patterns
    const reasonMatch = responseText.match(/invalid[:\s]+([a-z_]+)/i) ||
                        responseText.match(/reason[:\s]+([a-z_]+)/i) ||
                        responseText.match(/code[:\s]+([a-z_]+)/i)
    
    if (reasonMatch && reasonMatch[1]) {
      invalid_reason = reasonMatch[1].toLowerCase().trim()
    } else {
      // Try to find reason codes from known list
      const knownReasons = [
        'reporter_court_mismatch',
        'volume_impossible',
        'page_unreasonable',
        'reporter_timing_wrong',
        'year_implausible',
        'temporal_impossibility',
        'anachronistic_issue',
        'historical_mismatch',
        'future_dated',
        'case_type_implausible',
        'characteristics_mismatch',
        'party_role_impossible',
        'entity_type_impossible',
        'inconsistent_with_knowledge',
        'unknown_authority',
        'doctrine_impossible',
        'jurisdiction_mismatch',
        'cross_dimension_contradiction',
        'structural_incoherence',
        'authority_category_mismatch',
        'impossible_combination'
      ]
      
      for (const reason of knownReasons) {
        if (normalized.includes(reason.toUpperCase().replace(/_/g, ' ')) ||
            normalized.includes(reason.replace(/_/g, '-'))) {
          invalid_reason = reason
          break
        }
      }
    }
  }
  
  // Check for UNCERTAIN verdict
  if (normalized.includes('UNCERTAIN')) {
    verdict = 'UNCERTAIN'
    
    // Try to extract reason code
    const reasonMatch = responseText.match(/uncertain[:\s]+([a-z_]+)/i) ||
                        responseText.match(/reason[:\s]+([a-z_]+)/i) ||
                        responseText.match(/code[:\s]+([a-z_]+)/i)
    
    if (reasonMatch && reasonMatch[1]) {
      uncertain_reason = reasonMatch[1].toLowerCase().trim()
    } else {
      // Try to find reason codes from known list
      const knownReasons = [
        'unusual_volume_page',
        'reporter_edge_case',
        'timing_questionable',
        'names_generic_but_possible',
        'unusual_pairing',
        'characteristics_unclear',
        'early_in_reporter_series',
        'edge_of_legal_development',
        'timing_unusual_but_possible',
        'unfamiliar_but_possible',
        'edge_case_authority',
        'weak_signals_both_ways',
        'mixed_signals',
        'insufficient_evidence',
        'unusual_but_not_invalid'
      ]
      
      for (const reason of knownReasons) {
        if (normalized.includes(reason.toUpperCase().replace(/_/g, ' ')) ||
            normalized.includes(reason.replace(/_/g, '-'))) {
          uncertain_reason = reason
          break
        }
      }
    }
  }

  // If we couldn't determine verdict, log for debugging
  if (verdict === 'UNCERTAIN' && !normalized.includes('UNCERTAIN') && !normalized.includes('SCORE')) {
    console.warn(`[ResponseParser] Could not parse verdict from agent ${agentName}. Response: ${responseText.substring(0, 200)}`)
  }

  const result: ParsedVerdict = { verdict }
  if (invalid_reason) {
    result.invalid_reason = invalid_reason
  }
  if (uncertain_reason) {
    result.uncertain_reason = uncertain_reason
  }

  return result
}

