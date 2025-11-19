/**
 * Citation Identification Service
 * Main service for identifying citations in JSON documents
 */

import { CitationDocument, Citation, ContentParagraph } from '@/types/citation-json'
import { findAllCitations, CitationMatch } from './patterns'
import { validateCitation } from './validators'

/**
 * Identify citations in a document and update JSON structure
 */
export function identifyCitations(jsonData: CitationDocument): CitationDocument {
  const { document } = jsonData
  
  // Process each content paragraph to find citations
  const allCitations: Citation[] = []
  let citationCounter = 1
  
  // Process content and add inline markers
  const updatedContent = document.content.map((paragraph: ContentParagraph) => {
    const text = paragraph.text
    const matches = findAllCitations(text)
    
    if (matches.length === 0) {
      return paragraph
    }
    
    // Sort matches by start index in reverse order to insert markers correctly
    const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex)
    
    let updatedText = text
    const paragraphCitations: Citation[] = []
    
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
          ruleSet: `Federal Rules of ${match.components.category}`,
          rule: match.components.rule_number,
          subdivision: null,
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
        identificationMethod: 'custom',
      },
    },
  }
  
  return updatedDocument
}

