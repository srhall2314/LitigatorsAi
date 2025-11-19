/**
 * Citation Comparison Utility
 * Compare results from custom regex and Eyecite identification systems
 */

import { CitationDocument, Citation } from '@/types/citation-json'

export interface ComparisonResult {
  customCount: number
  eyeciteCount: number
  overlapCount: number
  customOnly: Citation[]
  eyeciteOnly: Citation[]
  overlapping: Array<{
    custom: Citation
    eyecite: Citation
    similarity: number
  }>
  typeBreakdown: {
    case: { custom: number; eyecite: number }
    statute: { custom: number; eyecite: number }
    regulation: { custom: number; eyecite: number }
    rule: { custom: number; eyecite: number }
    secondary: { custom: number; eyecite: number }
  }
}

/**
 * Calculate similarity between two citation texts
 * Returns a value between 0 and 1
 */
function citationSimilarity(text1: string, text2: string): number {
  // Normalize texts for comparison
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()
  const norm1 = normalize(text1)
  const norm2 = normalize(text2)
  
  // Exact match
  if (norm1 === norm2) {
    return 1.0
  }
  
  // Check if one contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = Math.min(norm1.length, norm2.length)
    const longer = Math.max(norm1.length, norm2.length)
    return shorter / longer
  }
  
  // Calculate Jaccard similarity (word overlap)
  const words1 = new Set(norm1.split(/\s+/))
  const words2 = new Set(norm2.split(/\s+/))
  
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size
}

/**
 * Find matching citations between two sets
 */
function findMatches(
  customCitations: Citation[],
  eyeciteCitations: Citation[],
  threshold: number = 0.7
): Array<{ custom: Citation; eyecite: Citation; similarity: number }> {
  const matches: Array<{ custom: Citation; eyecite: Citation; similarity: number }> = []
  const usedEyecite = new Set<number>()
  
  for (const customCitation of customCitations) {
    let bestMatch: { citation: Citation; similarity: number; index: number } | null = null
    
    for (let i = 0; i < eyeciteCitations.length; i++) {
      if (usedEyecite.has(i)) continue
      
      const similarity = citationSimilarity(
        customCitation.citationText,
        eyeciteCitations[i].citationText
      )
      
      if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { citation: eyeciteCitations[i], similarity, index: i }
      }
    }
    
    if (bestMatch) {
      matches.push({
        custom: customCitation,
        eyecite: bestMatch.citation,
        similarity: bestMatch.similarity,
      })
      usedEyecite.add(bestMatch.index)
    }
  }
  
  return matches
}

/**
 * Compare citation identification results from custom and Eyecite systems
 */
export function compareCitationResults(
  custom: CitationDocument,
  eyecite: CitationDocument
): ComparisonResult {
  const customCitations = custom.document.citations || []
  const eyeciteCitations = eyecite.document.citations || []
  
  // Find overlapping citations
  const overlapping = findMatches(customCitations, eyeciteCitations)
  const matchedCustomIds = new Set(overlapping.map(m => m.custom.id))
  const matchedEyeciteIds = new Set(overlapping.map(m => m.eyecite.id))
  
  // Find citations unique to each system
  const customOnly = customCitations.filter(c => !matchedCustomIds.has(c.id))
  const eyeciteOnly = eyeciteCitations.filter(c => !matchedEyeciteIds.has(c.id))
  
  // Count citations by type
  const countByType = (citations: Citation[]) => {
    const counts = {
      case: 0,
      statute: 0,
      regulation: 0,
      rule: 0,
      secondary: 0,
    }
    for (const citation of citations) {
      const type = citation.citationType
      if (type in counts) {
        counts[type as keyof typeof counts]++
      }
    }
    return counts
  }
  
  const customTypeCounts = countByType(customCitations)
  const eyeciteTypeCounts = countByType(eyeciteCitations)
  
  return {
    customCount: customCitations.length,
    eyeciteCount: eyeciteCitations.length,
    overlapCount: overlapping.length,
    customOnly,
    eyeciteOnly,
    overlapping,
    typeBreakdown: {
      case: {
        custom: customTypeCounts.case,
        eyecite: eyeciteTypeCounts.case,
      },
      statute: {
        custom: customTypeCounts.statute,
        eyecite: eyeciteTypeCounts.statute,
      },
      regulation: {
        custom: customTypeCounts.regulation,
        eyecite: eyeciteTypeCounts.regulation,
      },
      rule: {
        custom: customTypeCounts.rule,
        eyecite: eyeciteTypeCounts.rule,
      },
      secondary: {
        custom: customTypeCounts.secondary,
        eyecite: eyeciteTypeCounts.secondary,
      },
    },
  }
}

/**
 * Generate a summary report of the comparison
 */
export function generateComparisonReport(result: ComparisonResult): string {
  const lines: string[] = []
  
  lines.push('=== Citation Identification Comparison ===')
  lines.push('')
  lines.push(`Custom Regex: ${result.customCount} citations`)
  lines.push(`Eyecite: ${result.eyeciteCount} citations`)
  lines.push(`Overlapping: ${result.overlapCount} citations`)
  lines.push('')
  
  lines.push('Type Breakdown:')
  for (const [type, counts] of Object.entries(result.typeBreakdown)) {
    lines.push(`  ${type}: Custom=${counts.custom}, Eyecite=${counts.eyecite}`)
  }
  lines.push('')
  
  if (result.customOnly.length > 0) {
    lines.push(`Custom Only (${result.customOnly.length}):`)
    result.customOnly.slice(0, 10).forEach(citation => {
      lines.push(`  - ${citation.citationText}`)
    })
    if (result.customOnly.length > 10) {
      lines.push(`  ... and ${result.customOnly.length - 10} more`)
    }
    lines.push('')
  }
  
  if (result.eyeciteOnly.length > 0) {
    lines.push(`Eyecite Only (${result.eyeciteOnly.length}):`)
    result.eyeciteOnly.slice(0, 10).forEach(citation => {
      lines.push(`  - ${citation.citationText}`)
    })
    if (result.eyeciteOnly.length > 10) {
      lines.push(`  ... and ${result.eyeciteOnly.length - 10} more`)
    }
    lines.push('')
  }
  
  if (result.overlapping.length > 0) {
    lines.push(`Overlapping Citations (${result.overlapping.length}):`)
    result.overlapping.slice(0, 5).forEach(({ custom, eyecite, similarity }) => {
      lines.push(`  Custom: ${custom.citationText}`)
      lines.push(`  Eyecite: ${eyecite.citationText}`)
      lines.push(`  Similarity: ${(similarity * 100).toFixed(1)}%`)
      lines.push('')
    })
    if (result.overlapping.length > 5) {
      lines.push(`  ... and ${result.overlapping.length - 5} more`)
    }
  }
  
  return lines.join('\n')
}

