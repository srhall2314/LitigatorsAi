/**
 * Paragraph Citation Processor
 * Functions to re-identify and validate citations in a single paragraph
 */

import { CitationDocument, Citation, ContentParagraph } from '@/types/citation-json'
import { findAllCitations, CitationMatch } from './patterns'
import { validateCitation } from './validators'
import { extractDocumentContext } from './context-extractor'
import { validateCitationWithPanel, validateCitationTier3 } from './validation'
import { ANTHROPIC_API_KEY } from '@/lib/env'

/**
 * Re-identify citations in a single paragraph
 * Returns new citations found in the paragraph text
 */
export function reidentifyCitationsInParagraph(
  paragraph: ContentParagraph,
  existingCitations: Citation[],
  startCitationCounter: number = 1
): { 
  updatedParagraph: ContentParagraph
  newCitations: Citation[]
  removedCitationIds: string[]
  nextCitationCounter: number
} {
  // Strip existing citation markers to find fresh citations
  const textWithoutMarkers = paragraph.text.replace(/\[CITATION:[^\]]+\]/g, '').replace(/\[\/CITATION:[^\]]+\]/g, '')
  
  // Find all citations in the paragraph
  const matches = findAllCitations(textWithoutMarkers)
  
  // Get existing citation IDs for this paragraph
  const existingCitationIds = new Set<string>()
  const citationMarkerRegex = /\[CITATION:([^\]]+)\]/g
  let match
  while ((match = citationMarkerRegex.exec(paragraph.text)) !== null) {
    existingCitationIds.add(match[1])
  }
  
  const removedCitationIds = Array.from(existingCitationIds)
  const newCitations: Citation[] = []
  let citationCounter = startCitationCounter
  
  if (matches.length === 0) {
    // No citations found - remove all markers
    const cleanedText = paragraph.text.replace(/\[CITATION:[^\]]+\]/g, '').replace(/\[\/CITATION:[^\]]+\]/g, '')
    return {
      updatedParagraph: {
        ...paragraph,
        text: cleanedText,
      },
      newCitations: [],
      removedCitationIds,
      nextCitationCounter: citationCounter,
    }
  }
  
  // Sort matches by start index in reverse order to insert markers correctly
  const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex)
  
  let updatedText = textWithoutMarkers
  
  // Process matches in reverse order to maintain correct indices
  for (const match of sortedMatches) {
    const citationId = `cit_${String(citationCounter).padStart(3, '0')}`
    citationCounter++
    
    // Validate citation
    const tier1Result = validateCitation(match)
    
    // Create citation object with proper component structure
    let extractedComponents: any
    
    if (match.type === 'case') {
      extractedComponents = {
        parties: [match.components.party_1, match.components.party_2],
        reporter: match.components.reporter,
        page: match.components.page,
        court: match.components.court,
        year: parseInt(match.components.year),
      }
    } else if (match.type === 'statute') {
      if (match.components.code === 'Act') {
        extractedComponents = {
          title: '',
          code: 'Act',
          section: match.components.act_name || match.components.section,
          act_name: match.components.act_name,
          acronym: match.components.acronym || null,
          subdivision: null,
        }
      } else if (match.components.code === 'Rev. Stat.') {
        extractedComponents = {
          title: '',
          code: 'Rev. Stat.',
          section: match.components.section,
          subdivision: null,
        }
      } else {
        extractedComponents = {
          title: match.components.volume,
          code: match.components.code,
          section: match.components.section,
          subdivision: null,
        }
      }
    } else if (match.type === 'regulation') {
      extractedComponents = {
        title: match.components.volume,
        code: match.components.code,
        section: match.components.section,
      }
    } else if (match.type === 'rule') {
      if (match.components.code === 'Local Rule') {
        extractedComponents = {
          ruleSet: 'Local Rules',
          rule: match.components.rule_number,
          subdivision: null,
        }
      } else {
        extractedComponents = {
          ruleSet: `Federal Rules of ${match.components.category}`,
          rule: match.components.rule_number,
          subdivision: null,
        }
      }
    } else {
      extractedComponents = match.components
    }
    
    const citation: Citation = {
      id: citationId,
      citationText: match.fullMatch,
      citationType: match.type,
      extractedComponents: extractedComponents as any,
      tier_1: tier1Result,
      tier_2: {
        evaluations: [],
        consensus: 'VALID',
        consensusConfidence: 0,
        escalated: false,
      },
      tier_3: null,
      recommendations: null,
    }
    
    newCitations.push(citation)
    
    // Wrap citation text with markers
    const before = updatedText.substring(0, match.startIndex)
    const citationText = updatedText.substring(match.startIndex, match.endIndex)
    const after = updatedText.substring(match.endIndex)
    
    updatedText = `${before}[CITATION:${citationId}]${citationText}[/CITATION:${citationId}]${after}`
  }
  
  return {
    updatedParagraph: {
      ...paragraph,
      text: updatedText,
    },
    newCitations,
    removedCitationIds,
    nextCitationCounter: citationCounter,
  }
}

/**
 * Validate citations in a paragraph
 * Runs Tier 2 and Tier 3 validation for new citations
 */
export async function validateParagraphCitations(
  jsonData: CitationDocument,
  paragraphId: string,
  citationIds: string[]
): Promise<Citation[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key not configured")
  }
  
  const validatedCitations: Citation[] = []
  
  for (const citationId of citationIds) {
    const citation = jsonData.document.citations.find(c => c.id === citationId)
    if (!citation) continue
    
    // Extract context
    const context = extractDocumentContext(citationId, jsonData, true)
    
    // Run Tier 2 validation
    const validation = await validateCitationWithPanel(
      citation,
      context,
      ANTHROPIC_API_KEY
    )
    
    // Check if Tier 3 is needed
    let tier3Result = null
    if (validation.consensus.tier_3_trigger) {
      tier3Result = await validateCitationTier3(
        citation,
        context,
        validation,
        ANTHROPIC_API_KEY
      )
    }
    
    validatedCitations.push({
      ...citation,
      validation,
      tier_3: tier3Result,
    })
  }
  
  return validatedCitations
}

