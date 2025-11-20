/**
 * Citation Pattern Matching
 * Regex patterns for identifying citations in text
 */

export interface CitationMatch {
  fullMatch: string
  startIndex: number
  endIndex: number
  type: 'case' | 'statute' | 'regulation' | 'rule'
  components: Record<string, string>
}

/**
 * Federal Case Citation Pattern
 * Format: Party v. Party, Volume Reporter Page (Court Year)
 * Example: Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020)
 */
const FEDERAL_CASE_PATTERN = /([A-Z][A-Za-z0-9\s&.,'\-]+)\s+v\.?\s+([A-Z][A-Za-z0-9\s&.,'\-]+),\s+(\d+)\s+([A-Z][A-Za-z0-9.\s]+)\s+(\d+)\s+\(([^)]+)\s+(\d{4})\)/g

/**
 * Federal Statute Pattern
 * Format: Volume Code § Section
 * Example: 42 U.S.C. § 1983
 */
const FEDERAL_STATUTE_PATTERN = /(\d+)\s+(U\.S\.C\.(?:\s+Supp\.)?)\s+§\s+(\d+[a-z]*(?:\([^)]+\))?)/gi

/**
 * Federal Regulation Pattern
 * Format: Volume C.F.R. § Section
 * Example: 29 C.F.R. § 1910.1200
 */
const FEDERAL_REGULATION_PATTERN = /(\d+)\s+C\.F\.R\.\s+§\s+(\d+\.\d+)/gi

/**
 * Federal Rule Pattern (abbreviated)
 * Format: Fed. R. [Category] P. Rule
 * Example: Fed. R. Civ. P. 12(b)
 */
const FEDERAL_RULE_PATTERN = /Fed\.\s+R\.\s+(Civ|Crim|Evid|App|Bankr)\.\s+P\.\s+(\d+[a-z]*(?:\([^)]+\))?)/gi

/**
 * Federal Rule Pattern (full name)
 * Format: Federal Rule of [Category] Procedure Rule
 * Example: Federal Rule of Civil Procedure 12(b)(6)
 */
const FEDERAL_RULE_FULL_PATTERN = /Federal\s+Rule\s+of\s+(Civil|Criminal|Evidence|Appellate|Bankruptcy)\s+Procedure\s+(\d+[a-z]*(?:\([^)]+\))?)/gi

/**
 * Local Rule Pattern
 * Format: [Court/Type] Local Rule Number
 * Example: Civil Local Rule 7.1
 */
const LOCAL_RULE_PATTERN = /(?:Civil|Criminal|District|Circuit|Supreme)?\s*Local\s+Rule\s+(\d+\.\d+[a-z]*)/gi

/**
 * Act Name Pattern
 * Format: [Act Name] (optional acronym)
 * Example: Civil Rights Act of 1964
 * Example: Age Discrimination in Employment Act (ADEA)
 * Note: Matches act names that end with "Act", "Law", or "Statute"
 * 
 * Restrictions:
 * - Exclude dictionary references like "Black's Law"
 * - Only match when followed by citation-like context (year, section, or citation marker)
 * - Require at least 2 words before "Act/Law/Statute" to avoid false positives
 */
const ACT_NAME_PATTERN = /\b([A-Z][A-Za-z\s&,'\-]{3,}(?:Act|Law|Statute)(?:\s+of\s+\d{4})?)\b(?:\s*\(([A-Z]{2,})\))?(?=\s*(?:of\s+\d{4}|\(|\[|§|\d|$))/g

/**
 * Revised Statutes Pattern
 * Format: Revised Statutes § Section
 * Example: Revised Statutes § 4700
 */
const REVISED_STATUTES_PATTERN = /Revised\s+Statutes\s+§\s+(\d+[a-z]*(?:\([^)]+\))?)/gi

/**
 * Find all federal case citations in text
 */
export function findFederalCaseCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = []
  let match
  
  // Reset regex lastIndex
  FEDERAL_CASE_PATTERN.lastIndex = 0
  
  while ((match = FEDERAL_CASE_PATTERN.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'case',
      components: {
        party_1: match[1].trim(),
        party_2: match[2].trim(),
        volume: match[3],
        reporter: match[4].trim(),
        page: match[5],
        court: match[6].trim(),
        year: match[7],
      },
    })
  }
  
  return matches
}

/**
 * Find all federal statute citations in text
 * Prevents overlapping matches by preferring longer matches
 */
export function findFederalStatuteCitations(text: string): CitationMatch[] {
  const allMatches: CitationMatch[] = []
  let match
  
  FEDERAL_STATUTE_PATTERN.lastIndex = 0
  
  // Collect all matches first
  while ((match = FEDERAL_STATUTE_PATTERN.exec(text)) !== null) {
    allMatches.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'statute',
      components: {
        volume: match[1],
        code: match[2],
        section: match[3],
      },
    })
  }
  
  // Sort by length (longest first), then by start position
  allMatches.sort((a, b) => {
    const aLength = a.endIndex - a.startIndex
    const bLength = b.endIndex - b.startIndex
    if (bLength !== aLength) {
      return bLength - aLength // Longer matches first
    }
    return a.startIndex - b.startIndex // Then by position
  })
  
  // Filter to keep only non-overlapping matches, preferring longer ones
  const filteredMatches: CitationMatch[] = []
  const matchedRegions: Array<{ start: number; end: number }> = []
  
  for (const currentMatch of allMatches) {
    // Check if this match overlaps with any already-kept match
    const overlaps = matchedRegions.some(region =>
      !(currentMatch.endIndex <= region.start || currentMatch.startIndex >= region.end)
    )
    
    // Also check if this match starts within an existing match (e.g., "8" starting within "28")
    const startsWithinExisting = matchedRegions.some(region =>
      currentMatch.startIndex >= region.start && currentMatch.startIndex < region.end
    )
    
    if (!overlaps && !startsWithinExisting) {
      filteredMatches.push(currentMatch)
      matchedRegions.push({ start: currentMatch.startIndex, end: currentMatch.endIndex })
      
      // Debug logging for the specific "28" vs "8" case
      if (currentMatch.fullMatch.includes('U.S.C. § 1332')) {
        console.log(`[findFederalStatuteCitations] Kept match: "${currentMatch.fullMatch}" at ${currentMatch.startIndex}-${currentMatch.endIndex}`)
      }
    } else {
      // Debug logging for filtered matches
      if (currentMatch.fullMatch.includes('U.S.C. § 1332')) {
        console.log(`[findFederalStatuteCitations] Filtered out overlapping match: "${currentMatch.fullMatch}" at ${currentMatch.startIndex}-${currentMatch.endIndex}`)
      }
    }
  }
  
  // Sort final results by start position
  filteredMatches.sort((a, b) => a.startIndex - b.startIndex)
  
  console.log(`[findFederalStatuteCitations] Filtered ${allMatches.length} matches to ${filteredMatches.length} non-overlapping matches`)
  
  return filteredMatches
}

/**
 * Find all federal regulation citations in text
 */
export function findFederalRegulationCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = []
  let match
  
  FEDERAL_REGULATION_PATTERN.lastIndex = 0
  
  while ((match = FEDERAL_REGULATION_PATTERN.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'regulation',
      components: {
        volume: match[1],
        code: 'C.F.R.',
        section: match[2],
      },
    })
  }
  
  return matches
}

/**
 * Find all federal rule citations in text (both abbreviated and full name formats)
 */
export function findFederalRuleCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = []
  let match
  
  const categoryMap: Record<string, string> = {
    'Civ': 'Civil Procedure',
    'Crim': 'Criminal Procedure',
    'Evid': 'Evidence',
    'App': 'Appellate Procedure',
    'Bankr': 'Bankruptcy',
    'Civil': 'Civil Procedure',
    'Criminal': 'Criminal Procedure',
    'Evidence': 'Evidence',
    'Appellate': 'Appellate Procedure',
    'Bankruptcy': 'Bankruptcy',
  }
  
  // Find abbreviated format: Fed. R. Civ. P. 12(b)
  FEDERAL_RULE_PATTERN.lastIndex = 0
  while ((match = FEDERAL_RULE_PATTERN.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'rule',
      components: {
        code: `Fed. R. ${match[1]}. P.`,
        category: categoryMap[match[1]] || match[1],
        rule_number: match[2],
      },
    })
  }
  
  // Find full name format: Federal Rule of Civil Procedure 12(b)(6)
  FEDERAL_RULE_FULL_PATTERN.lastIndex = 0
  while ((match = FEDERAL_RULE_FULL_PATTERN.exec(text)) !== null) {
    const category = match[1]
    const abbrev = category === 'Civil' ? 'Civ' :
                   category === 'Criminal' ? 'Crim' :
                   category === 'Evidence' ? 'Evid' :
                   category === 'Appellate' ? 'App' :
                   category === 'Bankruptcy' ? 'Bankr' : category
    
    matches.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'rule',
      components: {
        code: `Fed. R. ${abbrev}. P.`,
        category: categoryMap[category] || category,
        rule_number: match[2],
      },
    })
  }
  
  return matches
}

/**
 * Find all local rule citations in text
 */
export function findLocalRuleCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = []
  let match
  
  LOCAL_RULE_PATTERN.lastIndex = 0
  
  while ((match = LOCAL_RULE_PATTERN.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'rule',
      components: {
        code: 'Local Rule',
        category: 'Local Rules',
        rule_number: match[1],
      },
    })
  }
  
  return matches
}

/**
 * Find all act name citations in text
 * Filters out false positives like dictionary references and casual mentions
 */
export function findActNameCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = []
  let match
  
  ACT_NAME_PATTERN.lastIndex = 0
  
  // Exclusion patterns for false positives
  const excludePatterns = [
    /Black'?s\s+Law/i, // Dictionary references
    /Federal\s+Arbitration\s+Act/i, // When mentioned casually (not cited)
  ]
  
  while ((match = ACT_NAME_PATTERN.exec(text)) !== null) {
    const fullMatch = match[0]
    const actName = match[1]
    
    // Skip if matches exclusion patterns
    const shouldExclude = excludePatterns.some(pattern => pattern.test(fullMatch))
    if (shouldExclude) {
      continue
    }
    
    // Require at least 2 words before "Act/Law/Statute" (excludes single-word false positives)
    const wordsBeforeAct = actName.split(/\s+/).filter(w => w.length > 0)
    if (wordsBeforeAct.length < 2) {
      continue
    }
    
    // Skip if it's just "Law" or "Act" by itself or with only one word
    if (wordsBeforeAct.length === 1 && (actName.includes('Law') || actName.includes('Act'))) {
      continue
    }
    
    matches.push({
      fullMatch: fullMatch,
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
      type: 'statute',
      components: {
        volume: '',
        code: 'Act',
        section: match[2] || match[1], // Use acronym if present, otherwise full name
        act_name: match[1], // Store full act name
        acronym: match[2] || '',
      },
    })
  }
  
  return matches
}

/**
 * Find all revised statutes citations in text
 */
export function findRevisedStatutesCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = []
  let match
  
  REVISED_STATUTES_PATTERN.lastIndex = 0
  
  while ((match = REVISED_STATUTES_PATTERN.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'statute',
      components: {
        volume: '',
        code: 'Rev. Stat.',
        section: match[1],
      },
    })
  }
  
  return matches
}

/**
 * Find all citations in text (all types)
 */
export function findAllCitations(text: string): CitationMatch[] {
  const allMatches: CitationMatch[] = []
  
  // Find all citation types
  allMatches.push(...findFederalCaseCitations(text))
  allMatches.push(...findFederalStatuteCitations(text))
  allMatches.push(...findFederalRegulationCitations(text))
  allMatches.push(...findFederalRuleCitations(text))
  allMatches.push(...findLocalRuleCitations(text))
  // Disabled act name matching - too many false positives (dictionary references, casual mentions)
  // allMatches.push(...findActNameCitations(text))
  allMatches.push(...findRevisedStatutesCitations(text))
  
  // Sort by start index
  allMatches.sort((a, b) => a.startIndex - b.startIndex)
  
  // Remove overlapping matches (prefer longer/more specific matches)
  const filteredMatches: CitationMatch[] = []
  for (let i = 0; i < allMatches.length; i++) {
    const current = allMatches[i]
    let overlaps = false
    
    for (let j = 0; j < filteredMatches.length; j++) {
      const existing = filteredMatches[j]
      // Check if current overlaps with existing
      if (!(current.endIndex <= existing.startIndex || current.startIndex >= existing.endIndex)) {
        // Overlap detected - keep the longer match
        if (current.endIndex - current.startIndex > existing.endIndex - existing.startIndex) {
          filteredMatches[j] = current
        }
        overlaps = true
        break
      }
    }
    
    if (!overlaps) {
      filteredMatches.push(current)
    }
  }
  
  // Re-sort after filtering
  filteredMatches.sort((a, b) => a.startIndex - b.startIndex)
  
  return filteredMatches
}

