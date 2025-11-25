/**
 * Response Parser for Validation Agents
 * Parses LLM responses to extract VALID/INVALID/UNCERTAIN verdicts and reason codes
 */

import { ValidationVerdict } from '@/types/citation-json'

export interface ParsedVerdict {
  verdict: ValidationVerdict
  invalid_reason?: string
  uncertain_reason?: string
}

/**
 * Parse agent response to extract verdict and reason codes
 * Looks for exact match: "VALID", "INVALID", or "UNCERTAIN"
 * Extracts reason codes if present
 */
export function parseAgentResponse(
  responseText: string,
  agentName: string
): ParsedVerdict {
  const normalized = responseText.trim().toUpperCase()
  
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
  if (verdict === 'UNCERTAIN' && !normalized.includes('UNCERTAIN')) {
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

