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
 * Federal Rule Pattern
 * Format: Fed. R. [Category] P. Rule
 * Example: Fed. R. Civ. P. 12(b)
 */
const FEDERAL_RULE_PATTERN = /Fed\.\s+R\.\s+(Civ|Crim|Evid|App|Bankr)\.\s+P\.\s+(\d+[a-z]*(?:\([^)]+\))?)/gi

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
 */
export function findFederalStatuteCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = []
  let match
  
  FEDERAL_STATUTE_PATTERN.lastIndex = 0
  
  while ((match = FEDERAL_STATUTE_PATTERN.exec(text)) !== null) {
    matches.push({
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
  
  return matches
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
 * Find all federal rule citations in text
 */
export function findFederalRuleCitations(text: string): CitationMatch[] {
  const matches: CitationMatch[] = []
  let match
  
  FEDERAL_RULE_PATTERN.lastIndex = 0
  
  const categoryMap: Record<string, string> = {
    'Civ': 'Civil Procedure',
    'Crim': 'Criminal Procedure',
    'Evid': 'Evidence',
    'App': 'Appellate Procedure',
    'Bankr': 'Bankruptcy',
  }
  
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
  
  // Sort by start index
  allMatches.sort((a, b) => a.startIndex - b.startIndex)
  
  return allMatches
}

