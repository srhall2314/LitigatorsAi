/**
 * Format Detection and Display Helpers
 * Utilities for detecting format versions and providing display helpers
 */

import { AgentVerdict, Tier3AgentVerdict, CitationValidation, Tier3Result, Tier3RiskLevel } from '@/types/citation-json'
import { getTier3FinalStatus } from './validation'

/**
 * Citation with optional validation data
 */
export interface CitationWithValidation {
  validation?: CitationValidation
  tier_3?: Tier3Result
}

/**
 * Get the risk level from a citation's validation data.
 * This is the primary function - uses risk-based evaluation throughout.
 * 
 * Priority: Tier 3 > Tier 2
 * 
 * Tier 3 (new format): Returns final_risk_level directly
 *   - LOW_RISK: Citation appears authentic and reliable
 *   - MODERATE_RISK: Some concerns exist but citation may still be valid
 *   - NEEDS_ADDITIONAL_REVIEW: Significant concerns suggest citation may be fabricated
 * 
 * Tier 3 (legacy): Maps final_status to risk levels
 *   - VALID → LOW_RISK
 *   - WARN → MODERATE_RISK
 *   - FAIL → NEEDS_ADDITIONAL_REVIEW
 * 
 * Tier 2 (new format): Maps average_score to risk levels
 *   - average_score >= 8.0 → LOW_RISK
 *   - 5.0 <= average_score < 8.0 → MODERATE_RISK
 *   - average_score < 5.0 → NEEDS_ADDITIONAL_REVIEW
 * 
 * Tier 2 (legacy): Maps recommendation to risk levels
 *   - CITATION_LIKELY_VALID → LOW_RISK
 *   - CITATION_UNCERTAIN → MODERATE_RISK
 *   - CITATION_LIKELY_HALLUCINATED → NEEDS_ADDITIONAL_REVIEW
 * 
 * @param citation Citation with optional validation and tier_3 data
 * @returns Risk level or null if no validation data exists
 */
export function getCitationRiskLevel(citation: CitationWithValidation): Tier3RiskLevel | null {
  if (!citation.validation) {
    return null
  }

  // Priority 1: Tier 3 evaluation (if exists)
  if (citation.tier_3) {
    const tier3Consensus = citation.tier_3.consensus
    
    // New format: risk-based evaluation - return directly
    if (tier3Consensus?.final_risk_level) {
      return tier3Consensus.final_risk_level
    }
    
    // Legacy format: map final_status to risk level
    const tier3Status = getTier3FinalStatus(citation.tier_3)
    if (tier3Status === 'VALID') {
      return 'LOW_RISK'
    } else if (tier3Status === 'WARN') {
      return 'MODERATE_RISK'
    } else if (tier3Status === 'FAIL') {
      return 'NEEDS_ADDITIONAL_REVIEW'
    }
  }

  // Priority 2: Tier 2 evaluation - map to risk levels
  const consensus = citation.validation.consensus
  
  // Check for new format first (numeric scoring)
  if (consensus?.average_score !== undefined && typeof consensus.average_score === 'number') {
    // New format: numeric scoring - map to risk levels
    const avgScore = consensus.average_score
    if (avgScore >= 8.0) {
      return 'LOW_RISK'
    } else if (avgScore >= 5.0) {
      return 'MODERATE_RISK'
    } else {
      return 'NEEDS_ADDITIONAL_REVIEW'
    }
  }
  
  // Fall back to legacy format: recommendation-based - map to risk levels
  const recommendation = consensus?.recommendation
  if (recommendation === 'CITATION_LIKELY_VALID') {
    return 'LOW_RISK'
  } else if (recommendation === 'CITATION_UNCERTAIN') {
    return 'MODERATE_RISK'
  } else if (recommendation === 'CITATION_LIKELY_HALLUCINATED') {
    return 'NEEDS_ADDITIONAL_REVIEW'
  }

  // Default to MODERATE_RISK if we can't determine (shouldn't happen, but be safe)
  return 'MODERATE_RISK'
}


/**
 * Calculate risk-based statistics from an array of citations.
 * Returns counts by risk level.
 * 
 * @param citations Array of citations with optional validation data
 * @returns Object with risk level counts and total
 */
export function calculateRiskStatistics(citations: CitationWithValidation[]): {
  lowRisk: number
  moderateRisk: number
  needsReview: number
  total: number
} {
  const validatedCitations = citations.filter(c => c.validation)
  
  const lowRisk = validatedCitations.filter(c => getCitationRiskLevel(c) === 'LOW_RISK').length
  const moderateRisk = validatedCitations.filter(c => getCitationRiskLevel(c) === 'MODERATE_RISK').length
  const needsReview = validatedCitations.filter(c => getCitationRiskLevel(c) === 'NEEDS_ADDITIONAL_REVIEW').length
  
  // Verify all validated citations are counted (should never happen, but check for bugs)
  const sumOfRisks = lowRisk + moderateRisk + needsReview
  if (sumOfRisks !== validatedCitations.length) {
    console.warn(`[calculateRiskStatistics] Count mismatch: sum=${sumOfRisks}, validated=${validatedCitations.length}`)
    // Find citations that aren't being counted
    const uncounted = validatedCitations.filter(c => {
      const riskLevel = getCitationRiskLevel(c)
      return riskLevel !== 'LOW_RISK' && riskLevel !== 'MODERATE_RISK' && riskLevel !== 'NEEDS_ADDITIONAL_REVIEW'
    })
    if (uncounted.length > 0) {
      console.warn(`[calculateRiskStatistics] Found ${uncounted.length} citations with null/unknown risk level:`, uncounted.map(c => ({ id: (c as any).id, hasValidation: !!c.validation, hasTier3: !!c.tier_3 })))
    }
  }
  
  return {
    lowRisk,
    moderateRisk,
    needsReview,
    total: validatedCitations.length
  }
}


/**
 * Check if an AgentVerdict uses the new format (numeric scoring)
 */
export function isNewFormatAgentVerdict(verdict: any): boolean {
  return typeof verdict === 'object' && 
         verdict !== null && 
         typeof verdict.score === 'number' &&
         verdict.score >= 1 && 
         verdict.score <= 10
}

/**
 * Check if a Tier3AgentVerdict uses the new format (risk-based)
 */
export function isNewFormatTier3Verdict(verdict: any): boolean {
  return typeof verdict === 'object' && 
         verdict !== null && 
         typeof verdict.risk_level === 'string' &&
         ['LOW_RISK', 'MODERATE_RISK', 'NEEDS_ADDITIONAL_REVIEW'].includes(verdict.risk_level)
}

/**
 * Check if a CitationValidation uses the new format
 */
export function isNewFormatCitationValidation(validation: any): boolean {
  if (!validation || !validation.panel_evaluation || !Array.isArray(validation.panel_evaluation)) {
    return false
  }
  // Check if all agents use new format
  return validation.panel_evaluation.every((agent: any) => isNewFormatAgentVerdict(agent))
}

/**
 * Check if a Tier3Result uses the new format
 */
export function isNewFormatTier3Result(tier3: any): boolean {
  if (!tier3 || !tier3.panel_evaluation || !Array.isArray(tier3.panel_evaluation)) {
    return false
  }
  // Check if all agents use new format
  return tier3.panel_evaluation.every((agent: any) => isNewFormatTier3Verdict(agent))
}

/**
 * Get color class for a score (1-10)
 */
export function getScoreColor(score: number): string {
  if (score >= 8) {
    return 'bg-green-100 text-green-800'
  } else if (score >= 5) {
    return 'bg-yellow-100 text-yellow-800'
  } else {
    return 'bg-red-100 text-red-800'
  }
}

/**
 * Get color class for a risk level
 */
export function getRiskLevelColor(riskLevel: Tier3RiskLevel): string {
  switch (riskLevel) {
    case 'LOW_RISK':
      return 'bg-green-100 text-green-800'
    case 'MODERATE_RISK':
      return 'bg-yellow-100 text-yellow-800'
    case 'NEEDS_ADDITIONAL_REVIEW':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

/**
 * Get label for a score
 */
export function getScoreLabel(score: number): string {
  if (score >= 9) {
    return 'Very High Confidence'
  } else if (score >= 8) {
    return 'High Confidence'
  } else if (score >= 6) {
    return 'Moderate Confidence'
  } else if (score >= 4) {
    return 'Low Confidence'
  } else {
    return 'Very Low Confidence'
  }
}

/**
 * Get label for a risk level
 */
export function getRiskLevelLabel(riskLevel: Tier3RiskLevel): string {
  switch (riskLevel) {
    case 'LOW_RISK':
      return 'Low Risk'
    case 'MODERATE_RISK':
      return 'Moderate Risk'
    case 'NEEDS_ADDITIONAL_REVIEW':
      return 'Needs Additional Review'
    default:
      return 'Unknown'
  }
}

/**
 * Get color for a score (for charts/graphs)
 */
export function getScoreColorHex(score: number): string {
  if (score >= 8) {
    return '#10b981' // green-500
  } else if (score >= 5) {
    return '#eab308' // yellow-500
  } else {
    return '#ef4444' // red-500
  }
}

/**
 * Get color for a risk level (for charts/graphs)
 */
export function getRiskLevelColorHex(riskLevel: Tier3RiskLevel): string {
  switch (riskLevel) {
    case 'LOW_RISK':
      return '#10b981' // green-500
    case 'MODERATE_RISK':
      return '#eab308' // yellow-500
    case 'NEEDS_ADDITIONAL_REVIEW':
      return '#ef4444' // red-500
    default:
      return '#6b7280' // gray-500
  }
}

