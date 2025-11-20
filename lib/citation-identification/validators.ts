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
 * 
 * Required components for VALID_FORMAT:
 * - reporter (must be valid)
 * - volume (must exist)
 * - page (must exist)
 * 
 * Optional components (don't affect validity):
 * - court (often in parenthetical, not always present)
 * - year (often in parenthetical, not always present)
 */
export function validateCaseCitation(match: CitationMatch): Tier1Result {
  const { components } = match
  const reporter = components.reporter || ''
  const volume = components.volume || ''
  const page = components.page || ''
  const court = components.court || ''
  const yearStr = components.year || ''
  
  // Required: reporter must be valid
  const reporterValid = isValidReporter(reporter)
  
  // Required: volume must exist
  const volumeExists = volume.trim().length > 0
  
  // Required: page must exist (can be "___" for not-yet-paginated cases)
  const pageExists = page.trim().length > 0
  const pageValid = pageExists && (page.trim() === '___' || /^\d+/.test(page.trim()))
  
  // Optional: court validation (if present, should be valid, but absence is OK)
  const courtValid = !court || isValidCourt(court)
  
  // Optional: year validation (if present, should be reasonable, but absence is OK)
  let yearValid = true
  if (yearStr && yearStr.trim().length > 0) {
    const year = parseInt(yearStr)
    const currentYear = new Date().getFullYear()
    yearValid = !isNaN(year) && year >= 1800 && year <= currentYear + 1
  }
  
  // VALID_FORMAT: reporter is valid AND volume/page exist
  // Court and year are optional - their presence/absence doesn't affect format validity
  // Page can be "___" for not-yet-paginated cases
  if (reporterValid && volumeExists && pageValid) {
    // Higher confidence if court/year are also present and valid
    const hasOptionalInfo = (court && isValidCourt(court)) || (yearStr && yearValid)
    return {
      status: 'VALID_FORMAT',
      confidence: hasOptionalInfo ? 0.99 : 0.95,
    }
  } 
  // INVALID_FORMAT: missing required components or invalid reporter
  else if (!reporterValid || !volumeExists || !pageExists) {
    return {
      status: 'INVALID_FORMAT',
      confidence: 0.85,
    }
  } 
  // AMBIGUOUS_FORMAT: has required components but optional ones are invalid
  else {
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

