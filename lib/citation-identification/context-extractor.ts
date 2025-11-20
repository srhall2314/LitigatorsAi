/**
 * Context Extractor
 * Extracts document context (surrounding sentences) for citations
 */

import { CitationDocument, Citation, ContentParagraph } from '@/types/citation-json'

/**
 * Extract document context for a citation
 * Finds paragraph containing citation and optionally includes preceding sentences
 * 
 * @param citationId - The citation ID (e.g., "cit_001")
 * @param jsonData - The full document JSON
 * @param includePreceding - Whether to include 1-2 sentences from previous paragraph
 * @returns Context string with full paragraph + optional preceding sentences
 */
export function extractDocumentContext(
  citationId: string,
  jsonData: CitationDocument,
  includePreceding: boolean = true
): string {
  const { document } = jsonData
  
  // Find the citation object to get its actual citationText
  const citation = document.citations?.find(c => c.id === citationId)
  const citationText = citation?.citationText || ''
  
  // Find paragraph containing this citation
  let containingParagraph: ContentParagraph | null = null
  let paragraphIndex = -1
  
  for (let i = 0; i < document.content.length; i++) {
    const paragraph = document.content[i]
    // Check if paragraph text contains citation marker
    if (paragraph.text.includes(`[CITATION:${citationId}]`)) {
      containingParagraph = paragraph
      paragraphIndex = i
      break
    }
  }
  
  if (!containingParagraph) {
    // Fallback: return empty context if citation not found
    console.warn(`[ContextExtractor] Citation ${citationId} not found in document content`)
    return ''
  }
  
  // Extract paragraph text, removing citation markers for cleaner context
  // Use the citation's actual citationText to replace the marker content
  // This fixes cases where markers are incorrectly split or nested
  let contextText = containingParagraph.text
  
  if (citationText) {
    // Strategy: Find all marker regions for this citation and replace with citationText
    // This handles:
    // 1. Split citations (e.g., "2" and "8 U.S.C. § 1332" -> "28 U.S.C. § 1332")
    // 2. Malformed nested markers (e.g., [CITATION:cit_001][CITATION:ci[/CITATION:cit_001]t_001])
    // 3. Overlapping markers from duplicate matches
    
    const openingMarker = `[CITATION:${citationId}]`
    const closingMarker = `[/CITATION:${citationId}]`
    
    // Find all occurrences of this citation's markers
    const openingIndices: number[] = []
    const closingIndices: number[] = []
    
    let searchIndex = 0
    while (true) {
      const openingIndex = contextText.indexOf(openingMarker, searchIndex)
      if (openingIndex === -1) break
      openingIndices.push(openingIndex)
      searchIndex = openingIndex + openingMarker.length
    }
    
    searchIndex = 0
    while (true) {
      const closingIndex = contextText.indexOf(closingMarker, searchIndex)
      if (closingIndex === -1) break
      closingIndices.push(closingIndex)
      searchIndex = closingIndex + closingMarker.length
    }
    
    if (openingIndices.length > 0 && closingIndices.length > 0) {
      // Find the first opening and last closing to determine the full region
      const firstOpeningIndex = Math.min(...openingIndices)
      const lastClosingIndex = Math.max(...closingIndices) + closingMarker.length
      
      // Extract the region between first opening and last closing
      const markedRegion = contextText.substring(firstOpeningIndex, lastClosingIndex)
      
      // Remove all citation markers to get the actual content
      // Use more specific patterns to avoid removing text that looks like markers
      const markedContent = markedRegion
        .replace(/\[CITATION:[a-zA-Z0-9_]+\]/g, '')  // Proper opening markers
        .replace(/\[\/CITATION:[a-zA-Z0-9_]+\]/g, '') // Proper closing markers
        .replace(/\[CITATION:[^\]]*\]/g, '')         // Malformed opening markers
        .replace(/\[\/CITATION:[^\]]*\]/g, '')       // Malformed closing markers
        .trim()
      
      // Normalize both for comparison (lowercase, normalize whitespace)
      const normalizedCitationText = citationText.toLowerCase().replace(/\s+/g, ' ').trim()
      const normalizedMarkedContent = markedContent.toLowerCase().replace(/\s+/g, ' ').trim()
      
      // Check if citationText matches marked content
      const contentMatches = normalizedCitationText === normalizedMarkedContent
      
      // If content doesn't match or citationText is significantly longer, 
      // replace the entire region with citationText (handles split/malformed markers)
      if (!contentMatches || citationText.length > markedContent.length * 1.5) {
        // Look ahead to see if there are other citation markers that might be part of this citation
        let extendedClosingIndex = lastClosingIndex
        const lookAheadRegion = contextText.substring(
          lastClosingIndex, 
          Math.min(lastClosingIndex + 200, contextText.length)
        )
        
        // Find all closing markers in look-ahead region
        const lookAheadMarkers = [...lookAheadRegion.matchAll(/\[\/CITATION:([^\]]+)\]/g)]
        
        // If we find markers and citationText is much longer, extend to include them
        if (lookAheadMarkers.length > 0 && citationText.length > markedContent.length * 1.5) {
          const lastMarker = lookAheadMarkers[lookAheadMarkers.length - 1]
          extendedClosingIndex = lastClosingIndex + lastMarker.index! + lastMarker[0].length
        }
        
        // Before replacing, check if there's text immediately after the closing marker
        // that should be included (e.g., "(a)" after "28 U.S.C. § 1332")
        const textAfterMarker = contextText.substring(extendedClosingIndex, extendedClosingIndex + 20)
        const textAfterCleaned = textAfterMarker
          .replace(/\[CITATION:[^\]]*\]/g, '')
          .replace(/\[\/CITATION:[^\]]*\]/g, '')
          .trim()
        
        // If there's parenthetical text that looks like part of the citation, include it
        let citationWithSubdivision = citationText
        if (textAfterCleaned.match(/^\([a-z0-9]+\)/)) {
          citationWithSubdivision = citationText + textAfterCleaned.match(/^\([a-z0-9]+\)/)![0]
          extendedClosingIndex += textAfterCleaned.match(/^\([a-z0-9]+\)/)![0].length
        }
        
        // Replace the entire region with the correct citationText
        const before = contextText.substring(0, firstOpeningIndex)
        const after = contextText.substring(extendedClosingIndex)
        contextText = before + citationWithSubdivision + after
      } else {
        // Content matches, just remove the markers
        const before = contextText.substring(0, firstOpeningIndex)
        const after = contextText.substring(lastClosingIndex)
        contextText = before + markedContent + after
      }
    }
  }
  
  // Remove all remaining citation markers for cleaner context
  // Use a comprehensive approach to catch all marker variations and fragments
  let iterations = 0
  let previousText = ''
  while (iterations < 5 && contextText !== previousText) {
    previousText = contextText
    
    // Remove properly formed markers first
    contextText = contextText
      .replace(/\[CITATION:[a-zA-Z0-9_]+\]/g, '')  // Opening markers: [CITATION:cit_XXX]
      .replace(/\[\/CITATION:[a-zA-Z0-9_]+\]/g, '') // Closing markers: [/CITATION:cit_XXX]
    
    // Remove malformed markers (with brackets)
    contextText = contextText
      .replace(/\[CITATION:[^\]]*\]/g, '')  // Any opening marker, even malformed
      .replace(/\[\/CITATION:[^\]]*\]/g, '') // Any closing marker, even malformed
    
    // Remove marker fragments (without closing bracket)
    contextText = contextText
      .replace(/\[CITATION:[^\[]*/g, '')    // Opening marker fragments
      .replace(/\[\/CITATION:[^\[]*/g, '')  // Closing marker fragments
    
    // Clean up common fragment patterns
    contextText = contextText
      .replace(/\]\d+\]/g, '')               // Remove patterns like ]03] or ]004]
      .replace(/\d+\]\]/g, '')               // Remove patterns like 03]] or 004]]
      .replace(/\]\]/g, '')                  // Remove double brackets
      .replace(/\]\s*\]/g, '')               // Remove bracket-space-bracket
    
    iterations++
  }
  
  // Final cleanup: remove any remaining bracket-number patterns that might be fragments
  contextText = contextText
    .replace(/\d+\]/g, '')                   // Remove number-bracket patterns
    .replace(/\]\d+/g, '')                   // Remove bracket-number patterns
    .replace(/\s+/g, ' ')                    // Normalize whitespace
    .trim()
  
  // Optionally include preceding sentences from previous paragraph
  if (includePreceding && paragraphIndex > 0) {
    const previousParagraph = document.content[paragraphIndex - 1]
    if (previousParagraph && previousParagraph.text) {
      // Extract last 1-2 sentences from previous paragraph
      const sentences = previousParagraph.text
        .replace(/\[CITATION:.*?\]/g, '') // Remove citation markers
        .split(/[.!?]+/)
        .filter(s => s.trim().length > 0)
      
      if (sentences.length > 0) {
        // Take last 1-2 sentences
        const precedingSentences = sentences.slice(-2).join('. ').trim()
        if (precedingSentences) {
          contextText = `${precedingSentences}. ${contextText}`
        }
      }
    }
  }
  
  return contextText
}

/**
 * Extract context for multiple citations efficiently
 * Returns a map of citationId -> context
 */
export function extractContextsForCitations(
  citations: Citation[],
  jsonData: CitationDocument,
  includePreceding: boolean = true
): Map<string, string> {
  const contextMap = new Map<string, string>()
  
  for (const citation of citations) {
    const context = extractDocumentContext(citation.id, jsonData, includePreceding)
    contextMap.set(citation.id, context)
  }
  
  return contextMap
}

