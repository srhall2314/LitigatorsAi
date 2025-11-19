/**
 * Eyecite Adapter
 * Converts Eyecite citation extraction results to CitationDocument format
 */

import { CitationDocument, Citation, ContentParagraph } from '@/types/citation-json'
import { getCitations } from '@beshkenadze/eyecite'
import { validateCitation } from './validators'
import { CitationMatch, findAllCitations } from './patterns'
import { LogCollector } from './logger'

/**
 * Convert Eyecite citation to CitationMatch format for validation
 */
function eyeciteToCitationMatch(eyeciteCitation: any, text: string, startIndex: number, endIndex: number): CitationMatch | null {
  const citationText = eyeciteCitation.toString()
  const citationType = eyeciteCitation.constructor.name
  
  logger.log(`Converting citation type: ${citationType}, text: ${citationText}`)
  
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
    
    logger.log('Case citation components:', {
      volume, reporter, page, year, court, plaintiff, defendant
    })
    
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
    
    logger.log('Supra/Id citation components:', {
      volume, reporter, page, year, court, plaintiff, defendant
    })
    
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
  
  // Unknown citations - log and return null
  logger.warn(`Unknown citation type: ${citationType}, text: ${citationText}`)
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
    // Count characters in normalized text until we reach the match position
    let charCount = 0
    let textIndex = startFrom
    
    // Count non-whitespace characters in original text
    while (charCount < normalizedIndex && textIndex < text.length) {
      if (!text[textIndex].match(/\s/)) {
        charCount++
      }
      textIndex++
    }
    
    // Now find the end position
    let endCount = 0
    let endIndex = textIndex
    const citationLength = normalizedCitation.length
    
    while (endCount < citationLength && endIndex < text.length) {
      if (!text[endIndex].match(/\s/)) {
        endCount++
      }
      endIndex++
    }
    
    return {
      startIndex: textIndex,
      endIndex: endIndex,
    }
  }
  
  // Try partial match - maybe Eyecite returns abbreviated citation
  // Check if citationText is contained in text (case-insensitive)
  const lowerText = text.toLowerCase()
  const lowerCitation = citationText.toLowerCase()
  const partialIndex = lowerText.indexOf(lowerCitation, startFrom)
  
  if (partialIndex !== -1) {
    return {
      startIndex: partialIndex,
      endIndex: partialIndex + citationText.length,
    }
  }
  
  return null
}

/**
 * Identify citations using Eyecite and convert to CitationDocument format
 * Returns both the updated document and logs for browser console
 */
export function identifyCitationsEyecite(jsonData: CitationDocument): { document: CitationDocument; logs: any[] } {
  const { document } = jsonData
  
  // Create a new logger instance for this request
  const logger = new LogCollector()
  logger.log('Starting Eyecite citation identification')
  
  // Process each content paragraph to find citations
  const allCitations: Citation[] = []
  let citationCounter = 1
  
  // Process content and add inline markers
  const updatedContent = document.content.map((paragraph: ContentParagraph) => {
    const text = paragraph.text
    
    // Run Eyecite on this paragraph
    let eyeciteCitations: any[] = []
    try {
      logger.log(`Processing paragraph: ${paragraph.id}`)
      logger.log(`Text length: ${text.length}`)
      logger.log(`Text preview: ${text.substring(0, 200)}`)
      
      eyeciteCitations = getCitations(text)
      
      logger.log(`Found ${eyeciteCitations.length} citations in paragraph ${paragraph.id}`)
      
      if (eyeciteCitations.length > 0) {
        eyeciteCitations.forEach((cit, idx) => {
          logger.log(`Citation ${idx + 1}:`, {
            type: cit.constructor.name,
            toString: cit.toString(),
            volume: cit.volume,
            reporter: cit.reporter,
            page: cit.page,
            year: cit.year,
            metadata: cit.metadata,
          })
        })
      }
    } catch (error) {
      logger.error('Error running Eyecite on paragraph', error)
      if (error instanceof Error) {
        logger.error('Error details', { message: error.message, stack: error.stack })
      }
      return paragraph
    }
    
    // Convert Eyecite citations to our format and find positions
    const citationMatches: Array<{ match: CitationMatch; eyecite: any }> = []
    let searchStart = 0
    
    // Process Eyecite citations (case citations only)
    for (const eyeciteCitation of eyeciteCitations) {
      const citationText = eyeciteCitation.toString()
      logger.log(`Looking for citation: ${citationText}`)
      logger.log(`Citation text length: ${citationText.length}`)
      
      const position = findCitationPosition(text, citationText, searchStart)
      logger.log(`Position found:`, position)
      
      if (position) {
        const match = eyeciteToCitationMatch(eyeciteCitation, text, position.startIndex, position.endIndex)
        logger.log(`Converted to CitationMatch:`, match)
        
        if (match) {
          citationMatches.push({ match, eyecite: eyeciteCitation })
          searchStart = position.endIndex // Continue searching from end of this citation
        } else {
          logger.warn('Failed to convert citation to CitationMatch')
        }
      } else {
        logger.warn(`Could not find position for citation: ${citationText}`)
        // Try to find it without the searchStart constraint
        const fallbackPosition = findCitationPosition(text, citationText, 0)
        logger.log(`Fallback position search:`, fallbackPosition)
        if (fallbackPosition) {
          const match = eyeciteToCitationMatch(eyeciteCitation, text, fallbackPosition.startIndex, fallbackPosition.endIndex)
          if (match) {
            citationMatches.push({ match, eyecite: eyeciteCitation })
          }
        }
      }
    }
    
    // HYBRID APPROACH: Eyecite only supports case citations
    // Use custom patterns for statutes, regulations, and rules
    logger.log('Checking for non-case citations with custom patterns')
    const customMatches = findAllCitations(text)
    logger.log(`Custom patterns found ${customMatches.length} citations`)
    
    // Filter out case citations (Eyecite handles those) and add non-case citations
    const nonCaseMatches = customMatches.filter(m => 
      m.type !== 'case' && 
      !citationMatches.some(cm => 
        Math.abs(cm.match.startIndex - m.startIndex) < 10 && 
        cm.match.type === 'case'
      )
    )
    
    logger.log(`Adding ${nonCaseMatches.length} non-case citations from custom patterns`)
    nonCaseMatches.forEach(match => {
      citationMatches.push({ match, eyecite: null })
    })
    
    if (citationMatches.length === 0) {
      logger.log(`No citations found in paragraph ${paragraph.id}`)
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
  
  logger.log(`Identification complete. Found ${allCitations.length} total citations`)
  
  return {
    document: updatedDocument,
    logs: logger.getLogs(),
  }
}

