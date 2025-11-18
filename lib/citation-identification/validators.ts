/**
 * Citation Validators
 * Validate citations against lookup tables and determine tier_1 status
 */

import { CitationMatch } from './patterns'
import { isValidReporter, isValidCourt, isValidCode, isValidRule } from './lookup-tables'

export type Tier1Status = 'VALID_FORMAT' | 'INVALID_FORMAT' | 'AMBIGUOUS_FORMAT'

export interface Tier1Result {
  status: Tier1Status
  confidence: number
}

/**
 * Validate a case citation and determine tier_1 status
 */
export function validateCaseCitation(match: CitationMatch): Tier1Result {
  const { components } = match
  const reporter = components.reporter
  const court = components.court
  const year = parseInt(components.year)
  
  // Check if reporter is valid
  const reporterValid = isValidReporter(reporter)
  
  // Check if court is valid
  const courtValid = isValidCourt(court)
  
  // Check if year is reasonable (1800 to current year + 1)
  const currentYear = new Date().getFullYear()
  const yearValid = year >= 1800 && year <= currentYear + 1
  
  // Determine status
  if (reporterValid && courtValid && yearValid) {
    return {
      status: 'VALID_FORMAT',
      confidence: 0.99,
    }
  } else if (!reporterValid || !courtValid) {
    return {
      status: 'INVALID_FORMAT',
      confidence: 0.85,
    }
  } else {
    return {
      status: 'AMBIGUOUS_FORMAT',
      confidence: 0.70,
    }
  }
}

/**
 * Validate a statute citation and determine tier_1 status
 */
export function validateStatuteCitation(match: CitationMatch): Tier1Result {
  const { components } = match
  const code = components.code
  
  const codeValid = isValidCode(code)
  
  if (codeValid) {
    return {
      status: 'VALID_FORMAT',
      confidence: 0.98,
    }
  } else {
    return {
      status: 'INVALID_FORMAT',
      confidence: 0.80,
    }
  }
}

/**
 * Validate a regulation citation and determine tier_1 status
 */
export function validateRegulationCitation(match: CitationMatch): Tier1Result {
  const { components } = match
  const code = components.code
  
  const codeValid = isValidCode(code)
  
  if (codeValid) {
    return {
      status: 'VALID_FORMAT',
      confidence: 0.98,
    }
  } else {
    return {
      status: 'INVALID_FORMAT',
      confidence: 0.80,
    }
  }
}

/**
 * Validate a rule citation and determine tier_1 status
 */
export function validateRuleCitation(match: CitationMatch): Tier1Result {
  const { components } = match
  const code = components.code
  
  const ruleValid = isValidRule(code)
  
  if (ruleValid) {
    return {
      status: 'VALID_FORMAT',
      confidence: 0.99,
    }
  } else {
    return {
      status: 'INVALID_FORMAT',
      confidence: 0.75,
    }
  }
}

/**
 * Validate a citation based on its type
 */
export function validateCitation(match: CitationMatch): Tier1Result {
  switch (match.type) {
    case 'case':
      return validateCaseCitation(match)
    case 'statute':
      return validateStatuteCitation(match)
    case 'regulation':
      return validateRegulationCitation(match)
    case 'rule':
      return validateRuleCitation(match)
    default:
      return {
        status: 'AMBIGUOUS_FORMAT',
        confidence: 0.50,
      }
  }
}

