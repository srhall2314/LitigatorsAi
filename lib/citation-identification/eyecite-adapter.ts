/**
 * Eyecite Adapter
 * Converts Eyecite citation extraction results to CitationDocument format
 */

import { CitationDocument, Citation, ContentParagraph } from '@/types/citation-json'
import { getCitations } from '@beshkenadze/eyecite'
import { validateCitation } from './validators'
import { CitationMatch } from './patterns'

/**
 * Convert Eyecite citation to CitationMatch format for validation
 */
function eyeciteToCitationMatch(eyeciteCitation: any, text: string, startIndex: number, endIndex: number): CitationMatch | null {
  const citationText = eyeciteCitation.toString()
  const citationType = eyeciteCitation.constructor.name
  
  // Map Eyecite citation types to our types
  if (citationType === 'FullCaseCitation' || citationType === 'ShortCaseCitation') {
    // Extract components from Eyecite citation
    const metadata = eyeciteCitation.metadata || {}
    const volume = eyeciteCitation.volume?.toString() || ''
    const reporter = eyeciteCitation.reporter?.toString() || ''
    const page = eyeciteCitation.page?.toString() || ''
    const year = eyeciteCitation.year?.toString() || ''
    const court = metadata.court || ''
    const plaintiff = metadata.plaintiff || ''
    const defendant = metadata.defendant || ''
    
    return {
      fullMatch: citationText,
      startIndex,
      endIndex,
      type: 'case',
      components: {
        party_1: plaintiff,
        party_2: defendant,
        volume,
        reporter,
        page,
        court,
        year,
      },
    }
  }
  
  // For other types (Supra, Id, Unknown), we'll handle them as secondary or case
  // Try to extract what we can
  if (citationType === 'SupraCitation' || citationType === 'IdCitation') {
    const metadata = eyeciteCitation.metadata || {}
    const volume = eyeciteCitation.volume?.toString() || ''
    const reporter = eyeciteCitation.reporter?.toString() || ''
    const page = eyeciteCitation.page?.toString() || ''
    const year = eyeciteCitation.year?.toString() || ''
    const court = metadata.court || ''
    
    // Try to get parties from resolved citation if available
    const plaintiff = metadata.plaintiff || ''
    const defendant = metadata.defendant || ''
    
    return {
      fullMatch: citationText,
      startIndex,
      endIndex,
      type: 'case', // Treat as case citation
      components: {
        party_1: plaintiff,
        party_2: defendant,
        volume,
        reporter,
        page,
        court,
        year,
      },
    }
  }
  
  // Unknown citations - return null for now, could be handled as secondary
  return null
}

/**
 * Find citation positions in text
 * Eyecite doesn't provide exact positions, so we need to find them
 */
function findCitationPosition(text: string, citationText: string, startFrom: number = 0): { startIndex: number; endIndex: number } | null {
  // Try exact match first
  let index = text.indexOf(citationText, startFrom)
  if (index !== -1) {
    return {
      startIndex: index,
      endIndex: index + citationText.length,
    }
  }
  
  // Try normalized match (remove extra whitespace)
  const normalizedCitation = citationText.replace(/\s+/g, ' ').trim()
  const normalizedText = text.substring(startFrom).replace(/\s+/g, ' ')
  const normalizedIndex = normalizedText.indexOf(normalizedCitation)
  
  if (normalizedIndex !== -1) {
    // Find the actual position accounting for whitespace differences
    let actualIndex = startFrom
    let normalizedPos = 0
    
    for (let i = startFrom; i < text.length; i++) {
      if (normalizedPos === normalizedIndex) {
        return {
          startIndex: i,
          endIndex: i + citationText.length, // Approximate
        }
      }
      if (text[i].match(/\s/)) {
        // Skip whitespace in original but count in normalized
        if (!text.substring(i).match(/^\s+/)) {
          normalizedPos++
        }
      } else {
        normalizedPos++
      }
    }
  }
  
  return null
}

/**
 * Identify citations using Eyecite and convert to CitationDocument format
 */
export function identifyCitationsEyecite(jsonData: CitationDocument): CitationDocument {
  const { document } = jsonData
  
  // Process each content paragraph to find citations
  const allCitations: Citation[] = []
  let citationCounter = 1
  
  // Process content and add inline markers
  const updatedContent = document.content.map((paragraph: ContentParagraph) => {
    const text = paragraph.text
    
    // Run Eyecite on this paragraph
    let eyeciteCitations: any[] = []
    try {
      eyeciteCitations = getCitations(text)
    } catch (error) {
      console.error('Error running Eyecite on paragraph:', error)
      return paragraph
    }
    
    if (eyeciteCitations.length === 0) {
      return paragraph
    }
    
    // Convert Eyecite citations to our format and find positions
    const citationMatches: Array<{ match: CitationMatch; eyecite: any }> = []
    let searchStart = 0
    
    for (const eyeciteCitation of eyeciteCitations) {
      const citationText = eyeciteCitation.toString()
      const position = findCitationPosition(text, citationText, searchStart)
      
      if (position) {
        const match = eyeciteToCitationMatch(eyeciteCitation, text, position.startIndex, position.endIndex)
        if (match) {
          citationMatches.push({ match, eyecite: eyeciteCitation })
          searchStart = position.endIndex // Continue searching from end of this citation
        }
      }
    }
    
    if (citationMatches.length === 0) {
      return paragraph
    }
    
    // Sort matches by start index in reverse order to insert markers correctly
    const sortedMatches = [...citationMatches].sort((a, b) => b.match.startIndex - a.match.startIndex)
    
    let updatedText = text
    const paragraphCitations: Citation[] = []
    
    // Process matches in reverse order to maintain correct indices
    for (const { match, eyecite } of sortedMatches) {
      const citationId = `cit_${String(citationCounter).padStart(3, '0')}`
      citationCounter++
      
      // Validate citation using existing validator
      const tier1Result = validateCitation(match)
      
      // Create citation object with proper component structure
      let extractedComponents: any
      
      if (match.type === 'case') {
        extractedComponents = {
          parties: [
            match.components.party_1 || '',
            match.components.party_2 || '',
          ].filter(p => p),
          reporter: match.components.reporter,
          page: match.components.page,
          court: match.components.court,
          year: match.components.year ? parseInt(match.components.year) : undefined,
        }
      } else if (match.type === 'statute') {
        extractedComponents = {
          title: match.components.volume,
          code: match.components.code,
          section: match.components.section,
          subdivision: null,
        }
      } else if (match.type === 'regulation') {
        extractedComponents = {
          title: match.components.volume,
          code: match.components.code,
          section: match.components.section,
        }
      } else if (match.type === 'rule') {
        extractedComponents = {
          ruleSet: `Federal Rules of ${match.components.category || 'Procedure'}`,
          rule: match.components.rule_number,
          subdivision: null,
        }
      } else {
        // Fallback for unknown types
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
      
      paragraphCitations.push(citation)
      allCitations.push(citation)
      
      // Wrap citation text with markers
      const before = updatedText.substring(0, match.startIndex)
      const citationText = updatedText.substring(match.startIndex, match.endIndex)
      const after = updatedText.substring(match.endIndex)
      
      updatedText = `${before}[CITATION:${citationId}]${citationText}[/CITATION:${citationId}]${after}`
    }
    
    return {
      ...paragraph,
      text: updatedText,
    }
  })
  
  // Update document
  const updatedDocument: CitationDocument = {
    document: {
      ...document,
      content: updatedContent,
      citations: allCitations,
      metadata: {
        ...document.metadata,
        totalCitations: allCitations.length,
        identificationMethod: 'eyecite',
      },
    },
  }
  
  return updatedDocument
}

