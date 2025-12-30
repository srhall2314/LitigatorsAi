/**
 * Centralized color constants and mappings
 * These provide semantic color names that can be used throughout the application
 */

/**
 * Citation status colors - used for validation status badges
 */
export const citationStatusColors = {
  valid: "bg-green-100 text-green-800 border-green-300",
  invalid: "bg-red-100 text-red-800 border-red-300",
  uncertain: "bg-yellow-100 text-yellow-800 border-yellow-300",
  "needs-review": "bg-orange-100 text-orange-800 border-orange-300",
} as const;

export type CitationStatus = keyof typeof citationStatusColors;

/**
 * Citation type colors - used for citation type badges
 */
export const citationTypeColors = {
  case: "bg-blue-100 text-blue-800",
  statute: "bg-green-100 text-green-800",
  regulation: "bg-purple-100 text-purple-800",
  rule: "bg-orange-100 text-orange-800",
  unknown: "bg-gray-100 text-gray-800",
} as const;

export type CitationType = keyof typeof citationTypeColors;

/**
 * Risk level colors - used for validation summaries and risk indicators
 */
export const riskLevelColors = {
  low: "text-green-600",
  moderate: "text-yellow-600",
  high: "text-orange-600",
  "needs-review": "text-red-600",
} as const;

export type RiskLevel = keyof typeof riskLevelColors;

/**
 * Manual review status colors
 */
export const manualReviewColors = {
  approved: "text-blue-600",
  questionable: "text-purple-600",
  rejected: "text-red-600",
} as const;

export type ManualReviewStatus = keyof typeof manualReviewColors;

/**
 * Helper function to get citation status color classes
 */
export function getCitationStatusColor(status: CitationStatus | string): string {
  return citationStatusColors[status as CitationStatus] || citationStatusColors.uncertain;
}

/**
 * Helper function to get citation type color classes
 */
export function getCitationTypeColor(type: CitationType | string): string {
  return citationTypeColors[type as CitationType] || citationTypeColors.unknown;
}

/**
 * Helper function to get risk level color classes
 */
export function getRiskLevelColor(level: RiskLevel | string): string {
  return riskLevelColors[level as RiskLevel] || riskLevelColors.moderate;
}

