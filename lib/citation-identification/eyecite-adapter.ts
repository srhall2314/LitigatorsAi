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
 * Strip existing citation markers from text before processing
 * This prevents nested markers when regenerating citations
 */
function stripCitationMarkers(text: string): string {
  // Remove [CITATION:...] and [/CITATION:...] markers
  return text.replace(/\[CITATION:[^\]]+\]/g, '').replace(/\[\/CITATION:[^\]]+\]/g, '')
}

/**
 * Extract the actual citation text from Eyecite citation object
 * Eyecite's toString() returns object representation, we need the matched text
 */
function extractCitationText(eyeciteCitation: any, text: string): string {
  const citationType = eyeciteCitation.constructor.name
  
  // Try to call matchedText() method first (it's a function, not a property)
  if (typeof eyeciteCitation.matchedText === 'function') {
    try {
      const matched = eyeciteCitation.matchedText()
      if (typeof matched === 'string' && matched.length > 0) {
        return matched
      }
    } catch (e) {
      // Fall through to other methods
    }
  }
  
  // Try matched_text property (if it exists)
  if (eyeciteCitation.matched_text && typeof eyeciteCitation.matched_text === 'string') {
    return eyeciteCitation.matched_text
  }
  
  // Extract the quoted portion from toString() - this is usually the core citation
  const toString = eyeciteCitation.toString()
  const quotedMatch = toString.match(/"([^"]+)"/)
  const coreCitation = quotedMatch ? quotedMatch[1] : ''
  
  // Note: logger is not available in this function scope, so we'll log later
  
  // For case citations, try to find the full citation including parties
  if (citationType === 'FullCaseCitation' || citationType === 'ShortCaseCitation') {
    const metadata = eyeciteCitation.metadata || {}
    const plaintiff = metadata.plaintiff || ''
    const defendant = metadata.defendant || ''
    const volume = eyeciteCitation.volume?.toString() || ''
    const reporter = eyeciteCitation.reporter?.toString() || ''
    const page = eyeciteCitation.page?.toString() || ''
    const year = eyeciteCitation.year?.toString() || ''
    
    // Try to find the full citation pattern in text
    if (plaintiff && defendant && volume && reporter && page) {
      // Escape special regex characters
      const escapedPlaintiff = plaintiff.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedDefendant = defendant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedVolume = volume.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedReporter = reporter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedPage = page.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedYear = year ? year.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
      
      // Use non-greedy quantifiers and limit lookahead to prevent catastrophic backtracking
      // Limit the party name matching to reasonable length (max 200 chars)
      const patterns = [
        // Pattern with year: limit party names and use non-greedy matching
        escapedYear ? new RegExp(`${escapedPlaintiff.substring(0, 200)}\\s+v\\.?\\s+${escapedDefendant.substring(0, 200)}[^,]{0,200}?,\\s+${escapedVolume}\\s+${escapedReporter}\\s+${escapedPage}[^)]{0,100}?\\([^)]{0,100}?${escapedYear}[^)]{0,100}?\\)`, 'i') : null,
        // Pattern without year: simpler, non-greedy
        new RegExp(`${escapedPlaintiff.substring(0, 200)}\\s+v\\.?\\s+${escapedDefendant.substring(0, 200)}[^,]{0,200}?,\\s+${escapedVolume}\\s+${escapedReporter}\\s+${escapedPage}`, 'i'),
      ].filter(p => p !== null) as RegExp[]
      
      // Limit search to first 5000 characters to prevent memory issues
      const searchText = text.substring(0, 5000)
      
      for (const pattern of patterns) {
        try {
          const match = searchText.match(pattern)
        if (match) {
          return match[0]
          }
        } catch (e) {
          // Skip invalid regex patterns
          continue
        }
      }
    }
    
    // Fallback: use core citation (volume reporter page)
    if (coreCitation) {
      return coreCitation
    }
  }
  
  // For law citations (statutes/regulations)
  if (citationType === 'FullLawCitation2') {
    const groups = eyeciteCitation.groups || {}
    const metadata = eyeciteCitation.metadata || {}
    const title = groups.title || groups.chapter || metadata.title || ''
    const reporter = groups.reporter || metadata.reporter || ''
    const section = groups.section || metadata.section || ''
    const pinCite = groups.pinCite || metadata.pinCite || ''
    
    // Try to find the full citation in text
    if (title && reporter && section) {
      const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedReporter = reporter.replace(/\./g, '\\.')
      const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedPinCite = pinCite ? pinCite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
      
      const patterns = [
        escapedPinCite ? new RegExp(`${escapedTitle}\\s+${escapedReporter}\\s+§\\s+${escapedSection}\\s+${escapedPinCite}`, 'i') : null,
        new RegExp(`${escapedTitle}\\s+${escapedReporter}\\s+§\\s+${escapedSection}`, 'i'),
      ].filter(p => p !== null) as RegExp[]
      
      // Limit search to first 5000 characters to prevent memory issues
      const searchText = text.substring(0, 5000)
      
      for (const pattern of patterns) {
        try {
          const match = searchText.match(pattern)
        if (match) {
          return match[0]
          }
        } catch (e) {
          // Skip invalid regex patterns
          continue
        }
      }
    }
    
    // Fallback: use core citation
    if (coreCitation) {
      return coreCitation
    }
  }
  
  // For other types, use core citation or toString
  const result = coreCitation || toString
  
  // Ensure we always return a string
  if (typeof result !== 'string') {
    console.warn('[extractCitationText] Result is not a string:', typeof result, result)
    return String(result || '')
  }
  
  return result
}

/**
 * Convert Eyecite citation to CitationMatch format for validation
 */
function eyeciteToCitationMatch(eyeciteCitation: any, text: string, startIndex: number, endIndex: number, citationText: string, logger: LogCollector): CitationMatch | null {
  const citationType = eyeciteCitation.constructor.name
  
  logger.log(`Converting citation type: ${citationType}, extracted text: ${citationText}`)
  
  // Map Eyecite citation types to our types
  if (citationType === 'FullCaseCitation' || citationType === 'ShortCaseCitation') {
    // Extract components from Eyecite citation
    const metadata = eyeciteCitation.metadata || {}
    const groups = eyeciteCitation.groups || {}
    const volume = eyeciteCitation.volume?.toString() || groups.volume || ''
    // Try multiple sources for reporter
    const reporter = eyeciteCitation.reporter?.toString() || groups.reporter || metadata.reporter || ''
    const page = eyeciteCitation.page?.toString() || groups.page || ''
    const year = eyeciteCitation.year?.toString() || metadata.year || ''
    const court = metadata.court || ''
    const plaintiff = metadata.plaintiff || ''
    const defendant = metadata.defendant || ''
    
    logger.log('Case citation components:', {
      volume, reporter, page, year, court, plaintiff, defendant,
      groupsReporter: groups.reporter,
      metadataReporter: metadata.reporter
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
  
  // For law citations (statutes/regulations)
  if (citationType === 'FullLawCitation2') {
    const groups = eyeciteCitation.groups || {}
    const metadata = eyeciteCitation.metadata || {}
    const title = groups.title || groups.chapter || metadata.title || ''
    const reporter = groups.reporter || metadata.reporter || ''
    const section = groups.section || metadata.section || ''
    
    // Determine if it's a statute (U.S.C.) or regulation (C.F.R.)
    const isRegulation = reporter === 'C.F.R.' || reporter === 'C.F.R'
    
    logger.log('Law citation components:', {
      title, reporter, section, isRegulation
    })
    
    return {
      fullMatch: citationText,
      startIndex,
      endIndex,
      type: isRegulation ? 'regulation' : 'statute',
      components: {
        volume: title, // Title for statutes, chapter for regulations
        code: reporter,
        section: section,
      },
    }
  }
  
  // For other types (Supra, Id, Unknown), filter them out - they're citation references, not standalone citations
  // "Id." and "supra" are shorthand references to previously cited cases, not citations themselves
  if (citationType === 'SupraCitation' || citationType === 'IdCitation') {
    const normalizedText = citationText.trim().toLowerCase()
    // Filter out common citation references
    if (normalizedText === 'id.' || normalizedText === 'id' || normalizedText === 'supra' || normalizedText === 'infra') {
      logger.warn(`Filtering out citation reference (not a standalone citation): "${citationText}"`)
      return null
    }
    
    // If it's a Supra/Id citation but has resolved content, we might want to keep it
    // But for now, filter all Supra/Id citations as they're references, not citations
    logger.warn(`Filtering out Supra/Id citation reference: "${citationText}"`)
    return null
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
  // Ensure citationText is a string
  if (typeof citationText !== 'string') {
    console.warn('[findCitationPosition] citationText is not a string:', typeof citationText, citationText)
    citationText = String(citationText || '')
  }
  
  if (!citationText || citationText.length === 0) {
    return null
  }
  
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
    // Add safety limit to prevent infinite loops
    const maxIterations = text.length * 2
    let iterations = 0
    while (charCount < normalizedIndex && textIndex < text.length && iterations < maxIterations) {
      if (!/\s/.test(text[textIndex])) {
        charCount++
      }
      textIndex++
      iterations++
    }
    
    // Safety check: if we hit the limit, fall back to simple indexOf
    if (iterations >= maxIterations) {
      const simpleIndex = text.indexOf(citationText, startFrom)
      if (simpleIndex !== -1) {
        return {
          startIndex: simpleIndex,
          endIndex: simpleIndex + citationText.length,
        }
      }
      return null
    }
    
    // Now find the end position
    let endCount = 0
    let endIndex = textIndex
    const citationLength = normalizedCitation.length
    iterations = 0
    
    while (endCount < citationLength && endIndex < text.length && iterations < maxIterations) {
      if (!/\s/.test(text[endIndex])) {
        endCount++
      }
      endIndex++
      iterations++
    }
    
    // Safety check: if we hit the limit, use simple calculation
    if (iterations >= maxIterations) {
      endIndex = textIndex + citationText.length
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
  try {
    // Validate input
    if (!jsonData || !jsonData.document) {
      throw new Error('Invalid jsonData: missing document property')
    }
    
    const { document } = jsonData
    
    if (!document.content || !Array.isArray(document.content)) {
      throw new Error('Invalid document: missing or invalid content array')
    }
    
    // Create a new logger instance for this request
    const logger = new LogCollector()
    logger.log('Starting Eyecite citation identification')
    
    // Process each content paragraph to find citations
    const allCitations: Citation[] = []
    let citationCounter = 1
    
    // First pass: Collect all citation matches without adding markers yet
    interface CitationMatchWithPosition {
      match: CitationMatch
      eyecite: any
      paragraphId: string
      paragraphText: string
      startIndex: number
      endIndex: number
    }
    
    const allCitationMatches: CitationMatchWithPosition[] = []
    
    // Process content to find all citations
    document.content.forEach((paragraph: ContentParagraph) => {
      // Strip existing citation markers before processing to prevent nested markers
      const originalText = paragraph.text
      const text = stripCitationMarkers(originalText)
      
      if (originalText !== text) {
        logger.log(`Stripped citation markers from paragraph ${paragraph.id} (${originalText.length} -> ${text.length} chars)`)
      }
      
      // Run Eyecite on this paragraph
      let eyeciteCitations: any[] = []
      try {
        logger.log(`Processing paragraph: ${paragraph.id}`)
        logger.log(`Text length: ${text.length}`)
        logger.log(`Text preview: ${text.substring(0, 200)}`)
        
        // Check if getCitations is available
        if (typeof getCitations !== 'function') {
          throw new Error('getCitations is not a function. Eyecite may not be properly imported.')
        }
        
        eyeciteCitations = getCitations(text)
        
        // Ensure we got an array
        if (!Array.isArray(eyeciteCitations)) {
          logger.warn(`getCitations returned non-array: ${typeof eyeciteCitations}`)
          eyeciteCitations = []
        }
        
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
        return
      }
      
      // Convert Eyecite citations to our format and find positions
      const citationMatches: Array<{ match: CitationMatch; eyecite: any; startIndex: number; endIndex: number }> = []
      let searchStart = 0
      
      // Process Eyecite citations (case citations only)
      for (const eyeciteCitation of eyeciteCitations) {
        // Extract actual citation text (not toString() which is object representation)
        let citationText = extractCitationText(eyeciteCitation, text)
        
        // Ensure citationText is a string
        if (typeof citationText !== 'string') {
          logger.warn(`Citation text is not a string: ${typeof citationText}`, citationText)
          citationText = String(citationText || '')
        }
        
        if (!citationText || citationText.trim().length === 0) {
          logger.warn('Empty citation text extracted, skipping')
          continue
        }
        
        logger.log(`Extracted citation text: ${citationText}`)
        logger.log(`Citation text length: ${citationText.length}`)
        
        const position = findCitationPosition(text, citationText, searchStart)
        logger.log(`Position found:`, position)
        
        if (position) {
          const match = eyeciteToCitationMatch(eyeciteCitation, text, position.startIndex, position.endIndex, citationText, logger)
          logger.log(`Converted to CitationMatch:`, match)
          
          if (match) {
            citationMatches.push({ match, eyecite: eyeciteCitation, startIndex: position.startIndex, endIndex: position.endIndex })
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
            const match = eyeciteToCitationMatch(eyeciteCitation, text, fallbackPosition.startIndex, fallbackPosition.endIndex, citationText, logger)
            if (match) {
              citationMatches.push({ match, eyecite: eyeciteCitation, startIndex: fallbackPosition.startIndex, endIndex: fallbackPosition.endIndex })
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
          Math.abs(cm.startIndex - m.startIndex) < 10 && 
          cm.match.type === 'case'
        )
      )
      
      logger.log(`Adding ${nonCaseMatches.length} non-case citations from custom patterns`)
      nonCaseMatches.forEach(match => {
        citationMatches.push({ match, eyecite: null, startIndex: match.startIndex, endIndex: match.endIndex })
      })
      
      // Filter overlapping matches before adding to global list
      // Prefer longer/more complete matches over shorter ones
      const filteredCitationMatches: Array<{ match: CitationMatch; eyecite: any; startIndex: number; endIndex: number }> = []
      const sortedByStart = [...citationMatches].sort((a, b) => a.startIndex - b.startIndex)
      
      for (const current of sortedByStart) {
        let wasReplaced = false
        let shouldSkip = false
        
        // Check if this match overlaps with or is contained within any already filtered match
        for (let i = filteredCitationMatches.length - 1; i >= 0; i--) {
          const existing = filteredCitationMatches[i]
          
          // Check for overlap or containment by position
          const currentStart = current.startIndex
          const currentEnd = current.endIndex
          const existingStart = existing.startIndex
          const existingEnd = existing.endIndex
          
          // Check if ranges overlap or one contains the other
          const overlaps = !(currentEnd <= existingStart || currentStart >= existingEnd)
          const currentContainsExisting = currentStart <= existingStart && currentEnd >= existingEnd
          const existingContainsCurrent = existingStart <= currentStart && existingEnd >= currentEnd
          
          // Also check if citation text is a substring (handles cases like "8 U.S.C. § 1332" vs "28 U.S.C. § 1332(a)")
          const currentText = current.match.fullMatch.toLowerCase().replace(/\s+/g, ' ')
          const existingText = existing.match.fullMatch.toLowerCase().replace(/\s+/g, ' ')
          const currentIsSubstring = existingText.includes(currentText) && currentText !== existingText
          const existingIsSubstring = currentText.includes(existingText) && existingText !== currentText
          
          // Special check for cases where one citation starts within the other (e.g., "8" starting within "28")
          // This handles the "28 U.S.C. § 1332(a)" vs "8 U.S.C. § 1332" case
          const currentStartsWithinExisting = currentStart >= existingStart && currentStart < existingEnd
          const existingStartsWithinCurrent = existingStart >= currentStart && existingStart < currentEnd
          
          // Check for similar citations that differ only by leading digit (e.g., "8 U.S.C. § 1332" vs "28 U.S.C. § 1332(a)")
          // This happens when pattern matching finds overlapping matches
          // Check this even if positions don't overlap, as long as they're close (within 5 characters)
          let areSimilarCitations = false
          const positionClose = Math.abs(currentStart - existingStart) <= 5 || Math.abs(currentEnd - existingEnd) <= 5
          if ((overlaps || positionClose) && current.match.type === 'statute' && existing.match.type === 'statute') {
            const currentCode = current.match.components.code?.toLowerCase() || ''
            const existingCode = existing.match.components.code?.toLowerCase() || ''
            const currentSection = current.match.components.section?.toLowerCase() || ''
            const existingSection = existing.match.components.section?.toLowerCase() || ''
            const currentTitle = current.match.components.volume || ''
            const existingTitle = existing.match.components.volume || ''
            
            // If same code and section, they're similar citations (likely one is a partial match)
            if (currentCode === existingCode && currentSection === existingSection) {
              areSimilarCitations = true
            }
            // Also check if one section is a prefix of the other (e.g., "1332" vs "1332(a)")
            else if (currentCode === existingCode) {
              // Check if sections are related (one is a prefix of the other)
              const sectionsRelated = currentSection.startsWith(existingSection) || existingSection.startsWith(currentSection)
              
              // Check if titles are similar (one ends with the other, e.g., "28" ends with "8")
              // This catches cases where regex matches "8" from "28"
              const titlesRelated = currentTitle.endsWith(existingTitle) || existingTitle.endsWith(currentTitle)
              
              // If sections are related AND titles are related, they're similar citations
              if (sectionsRelated && titlesRelated) {
                areSimilarCitations = true
              }
              // Also check if titles differ by a single leading digit (e.g., "8" vs "28")
              // This handles cases where the regex matches overlapping patterns
              else if (titlesRelated && Math.abs(currentTitle.length - existingTitle.length) === 1) {
                // One title is a suffix of the other and differs by only one digit
                areSimilarCitations = true
              }
              // Also check if the full citation text is similar (one contains the other)
              // This is a catch-all for cases where positions might not overlap perfectly
              else if (currentText.includes(existingText) || existingText.includes(currentText)) {
                // If one citation text contains the other and they share the same code
                areSimilarCitations = true
              }
            }
          }
          
          if (overlaps || currentContainsExisting || existingContainsCurrent || currentIsSubstring || existingIsSubstring || areSimilarCitations || currentStartsWithinExisting || existingStartsWithinCurrent) {
            // Overlap, containment, substring, or similar citation relationship detected - keep the longer match
            const currentLength = currentEnd - currentStart
            const existingLength = existingEnd - existingStart
            
            // Prefer the longer text match if one is a substring of the other
            if (currentIsSubstring && !existingIsSubstring) {
              // Current is substring of existing, skip current
              shouldSkip = true
              break
            } else if (existingIsSubstring && !currentIsSubstring) {
              // Existing is substring of current, replace existing
              filteredCitationMatches[i] = current
              wasReplaced = true
              break
            } else if (areSimilarCitations) {
              // For similar citations, prefer the longer one (which likely includes subdivisions like "(a)")
              if (currentLength > existingLength) {
                filteredCitationMatches[i] = current
                wasReplaced = true
                break
              } else {
                shouldSkip = true
                break
              }
            } else if (currentLength > existingLength) {
              // Current is longer, replace existing
              filteredCitationMatches[i] = current
              wasReplaced = true
              break
            } else {
              // Existing is longer or same length, skip current
              shouldSkip = true
              break
            }
          }
        }
        
        // Only add if we didn't skip and didn't replace an existing match
        if (!shouldSkip && !wasReplaced) {
          filteredCitationMatches.push(current)
        }
      }
      
      logger.log(`Filtered ${citationMatches.length} matches to ${filteredCitationMatches.length} non-overlapping matches`)
      
      // Add filtered matches from this paragraph to the global list
      filteredCitationMatches.forEach(({ match, eyecite, startIndex, endIndex }) => {
        allCitationMatches.push({
          match,
          eyecite,
          paragraphId: paragraph.id,
          paragraphText: text,
          startIndex,
          endIndex,
        })
      })
    })
    
    // Now create citations from all matches
    logger.log(`Found ${allCitationMatches.length} total citation matches before deduplication`)
    
    for (const { match, eyecite } of allCitationMatches) {
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
      
      allCitations.push(citation)
    }
    
    // POST-PROCESSING: Filter, normalize, and deduplicate citations
    logger.log(`Pre-processing: Found ${allCitations.length} raw citations`)
    
    // Step 1: Filter out bad/unknown matches
    const validCitations = allCitations.filter(citation => {
      // Filter out empty or invalid citations
      if (!citation.citationText || citation.citationText.trim().length === 0) {
        logger.warn(`Filtering out citation with empty text: ${citation.id}`)
        return false
      }
      
      // Filter out single character citations (like "§")
      if (citation.citationText.trim().length <= 1) {
        logger.warn(`Filtering out single character citation: "${citation.citationText}"`)
        return false
      }
      
      // Filter out citation references (shorthand that refers to other citations)
      const normalizedText = citation.citationText.trim().toLowerCase()
      if (normalizedText === 'id.' || normalizedText === 'id' || normalizedText === 'supra' || normalizedText === 'infra') {
        logger.warn(`Filtering out citation reference (not a standalone citation): "${citation.citationText}"`)
        return false
      }
      
      // Filter out unknown citation types
      if (citation.citationType === 'unknown' || !citation.citationType) {
        logger.warn(`Filtering out unknown citation type: ${citation.id}`)
        return false
      }
      
      return true
    })
    
    logger.log(`After filtering: ${validCitations.length} valid citations`)
    
    // Step 2: Normalize citations to create stable keys for deduplication
    function normalizeCitationKey(citation: Citation): string {
      // Normalize the citation text: lowercase, remove extra whitespace, normalize punctuation
      let normalizedText = citation.citationText
        .toLowerCase()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\s*§\s*/g, ' § ') // Normalize section symbol spacing
        .replace(/\s*et\s+seq\.?/gi, ' et seq') // Normalize "et seq"
        .replace(/[.,;:()]/g, '') // Remove punctuation
        .trim()
      
      // For case citations, use volume, reporter, page as the key (more stable than party names)
      if (citation.citationType === 'case' && citation.extractedComponents) {
        // Case citations have: parties, reporter, page, court, year
        // Extract volume, reporter, page from citation text (e.g., "550 U.S. 544")
        const caseMatch = citation.citationText.match(/(\d+)\s+([A-Z][A-Za-z.]+)\s+(\d+)/)
        if (caseMatch) {
          const volume = caseMatch[1]
          const reporter = caseMatch[2].toLowerCase()
          const page = caseMatch[3]
          normalizedText = `${volume} ${reporter} ${page}`
        } else {
          // Fallback: use reporter and page from components
          const reporter = (citation.extractedComponents.reporter || '').toLowerCase()
          const page = citation.extractedComponents.page || ''
          if (reporter && page) {
            normalizedText = `${reporter} ${page}`
          }
        }
      }
      
      // For statutes/regulations, normalize title/code/section
      if ((citation.citationType === 'statute' || citation.citationType === 'regulation') && citation.extractedComponents) {
        const title = citation.extractedComponents.title || citation.extractedComponents.volume || ''
        const code = citation.extractedComponents.code || ''
        const section = citation.extractedComponents.section || ''
        if (title && code && section) {
          normalizedText = `${title} ${code} § ${section}`.toLowerCase().replace(/\s+/g, ' ')
        }
      }
      
      // Create key: type + normalized text
      return `${citation.citationType}:${normalizedText}`
    }
    
    // Step 3: Deduplicate by normalized key
    const citationMap = new Map<string, Citation>()
    const duplicateCount = { count: 0 }
    
    validCitations.forEach(citation => {
      const key = normalizeCitationKey(citation)
      
      if (citationMap.has(key)) {
        duplicateCount.count++
        const existing = citationMap.get(key)!
        logger.log(`Duplicate found: "${citation.citationText}" (keeping first occurrence: ${existing.id})`)
      } else {
        citationMap.set(key, citation)
      }
    })
    
    const deduplicatedCitations = Array.from(citationMap.values())
    
    logger.log(`After deduplication: ${deduplicatedCitations.length} unique citations (removed ${duplicateCount.count} duplicates)`)
    logger.log(`Identification complete. Found ${deduplicatedCitations.length} distinct citations`)
    
    // Step 4: Create mapping from old citation IDs to deduplicated citation IDs
    const citationIdMap = new Map<string, string>() // oldId -> newId
    const citationKeyToId = new Map<string, string>() // normalizedKey -> citationId
    
    // Build mapping: for each deduplicated citation, map all original citations that normalized to the same key
    deduplicatedCitations.forEach(citation => {
      const key = normalizeCitationKey(citation)
      citationKeyToId.set(key, citation.id)
    })
    
    // Map all original citations to their deduplicated IDs
    validCitations.forEach(citation => {
      const key = normalizeCitationKey(citation)
      const deduplicatedId = citationKeyToId.get(key)
      if (deduplicatedId) {
        citationIdMap.set(citation.id, deduplicatedId)
      }
    })
    
    logger.log(`Created citation ID mapping for ${citationIdMap.size} citations`)
    
    // Step 5: Now add inline markers to content using deduplicated citations
    // Group citation matches by paragraph
    const matchesByParagraph = new Map<string, CitationMatchWithPosition[]>()
    allCitationMatches.forEach((matchWithPos, index) => {
      if (!matchesByParagraph.has(matchWithPos.paragraphId)) {
        matchesByParagraph.set(matchWithPos.paragraphId, [])
      }
      matchesByParagraph.get(matchWithPos.paragraphId)!.push(matchWithPos)
    })
    
    // Create a map from citation text+position to deduplicated citation ID
    const citationTextToId = new Map<string, string>()
    deduplicatedCitations.forEach(citation => {
      const key = normalizeCitationKey(citation)
      citationTextToId.set(key, citation.id)
    })
    
    // Create a map of cleaned text for each paragraph (without citation markers)
    // The match indices are based on cleaned text, so we must use cleaned text when inserting markers
    const cleanedTextByParagraph = new Map<string, string>()
    document.content.forEach((paragraph: ContentParagraph) => {
      cleanedTextByParagraph.set(paragraph.id, stripCitationMarkers(paragraph.text))
    })
    
    // Process content and add inline markers using deduplicated citations
    const updatedContent = document.content.map((paragraph: ContentParagraph) => {
      const matches = matchesByParagraph.get(paragraph.id) || []
      
      if (matches.length === 0) {
        return paragraph
      }
      
      // Use cleaned text (without old markers) for inserting new markers
      // The match indices are based on cleaned text, so we must use cleaned text here
      let updatedText = cleanedTextByParagraph.get(paragraph.id) || paragraph.text
      
      // Filter out overlapping matches before inserting markers
      // Prefer longer/more complete matches over shorter ones
      const filteredMatches: CitationMatchWithPosition[] = []
      const sortedByStart = [...matches].sort((a, b) => a.startIndex - b.startIndex)
      
      for (const current of sortedByStart) {
        let wasReplaced = false
        let shouldSkip = false
        
        // Check if this match overlaps with or is contained within any already filtered match
        for (let i = filteredMatches.length - 1; i >= 0; i--) {
          const existing = filteredMatches[i]
          
          // Check for overlap or containment by position
          const currentStart = current.startIndex
          const currentEnd = current.endIndex
          const existingStart = existing.startIndex
          const existingEnd = existing.endIndex
          
          // Check if ranges overlap or one contains the other
          const overlaps = !(currentEnd <= existingStart || currentStart >= existingEnd)
          const currentContainsExisting = currentStart <= existingStart && currentEnd >= existingEnd
          const existingContainsCurrent = existingStart <= currentStart && existingEnd >= currentEnd
          
          // Also check if citation text is a substring (handles cases like "8 U.S.C. § 1332" vs "28 U.S.C. § 1332(a)")
          const currentText = current.match.fullMatch.toLowerCase().replace(/\s+/g, ' ')
          const existingText = existing.match.fullMatch.toLowerCase().replace(/\s+/g, ' ')
          const currentIsSubstring = existingText.includes(currentText) && currentText !== existingText
          const existingIsSubstring = currentText.includes(existingText) && existingText !== currentText
          
          // Special check for cases where one citation starts within the other (e.g., "8" starting within "28")
          // This handles the "28 U.S.C. § 1332(a)" vs "8 U.S.C. § 1332" case
          const currentStartsWithinExisting = currentStart >= existingStart && currentStart < existingEnd
          const existingStartsWithinCurrent = existingStart >= currentStart && existingStart < currentEnd
          
          // Check for similar citations that differ only by leading digit (e.g., "8 U.S.C. § 1332" vs "28 U.S.C. § 1332(a)")
          // This happens when pattern matching finds overlapping matches
          // Check this even if positions don't overlap, as long as they're close (within 5 characters)
          let areSimilarCitations = false
          const positionClose = Math.abs(currentStart - existingStart) <= 5 || Math.abs(currentEnd - existingEnd) <= 5
          if ((overlaps || positionClose) && current.match.type === 'statute' && existing.match.type === 'statute') {
            const currentCode = current.match.components.code?.toLowerCase() || ''
            const existingCode = existing.match.components.code?.toLowerCase() || ''
            const currentSection = current.match.components.section?.toLowerCase() || ''
            const existingSection = existing.match.components.section?.toLowerCase() || ''
            const currentTitle = current.match.components.volume || ''
            const existingTitle = existing.match.components.volume || ''
            
            // If same code and section, they're similar citations (likely one is a partial match)
            if (currentCode === existingCode && currentSection === existingSection) {
              areSimilarCitations = true
            }
            // Also check if one section is a prefix of the other (e.g., "1332" vs "1332(a)")
            else if (currentCode === existingCode) {
              // Check if sections are related (one is a prefix of the other)
              const sectionsRelated = currentSection.startsWith(existingSection) || existingSection.startsWith(currentSection)
              
              // Check if titles are similar (one ends with the other, e.g., "28" ends with "8")
              // This catches cases where regex matches "8" from "28"
              const titlesRelated = currentTitle.endsWith(existingTitle) || existingTitle.endsWith(currentTitle)
              
              // If sections are related AND titles are related, they're similar citations
              if (sectionsRelated && titlesRelated) {
                areSimilarCitations = true
              }
              // Also check if titles differ by a single leading digit (e.g., "8" vs "28")
              // This handles cases where the regex matches overlapping patterns
              else if (titlesRelated && Math.abs(currentTitle.length - existingTitle.length) === 1) {
                // One title is a suffix of the other and differs by only one digit
                areSimilarCitations = true
              }
              // Also check if the full citation text is similar (one contains the other)
              // This is a catch-all for cases where positions might not overlap perfectly
              else if (currentText.includes(existingText) || existingText.includes(currentText)) {
                // If one citation text contains the other and they share the same code
                areSimilarCitations = true
              }
            }
          }
          
          if (overlaps || currentContainsExisting || existingContainsCurrent || currentIsSubstring || existingIsSubstring || areSimilarCitations || currentStartsWithinExisting || existingStartsWithinCurrent) {
            // Overlap, containment, substring, or similar citation relationship detected - keep the longer match
            const currentLength = currentEnd - currentStart
            const existingLength = existingEnd - existingStart
            
            // Prefer the longer text match if one is a substring of the other
            if (currentIsSubstring && !existingIsSubstring) {
              // Current is substring of existing, skip current
              shouldSkip = true
              break
            } else if (existingIsSubstring && !currentIsSubstring) {
              // Existing is substring of current, replace existing
              filteredMatches[i] = current
              wasReplaced = true
              break
            } else if (areSimilarCitations) {
              // For similar citations, prefer the longer one (which likely includes subdivisions like "(a)")
              if (currentLength > existingLength) {
                filteredMatches[i] = current
                wasReplaced = true
                break
              } else {
                shouldSkip = true
                break
              }
            } else if (currentLength > existingLength) {
              // Current is longer, replace existing
              filteredMatches[i] = current
              wasReplaced = true
              break
            } else {
              // Existing is longer or same length, skip current
              shouldSkip = true
              break
            }
          }
        }
        
        // Only add if we didn't skip and didn't replace an existing match
        if (!shouldSkip && !wasReplaced) {
          filteredMatches.push(current)
        }
      }
      
      // Sort filtered matches by start index in reverse order to insert markers correctly
      const sortedMatches = [...filteredMatches].sort((a, b) => b.startIndex - a.startIndex)
      
      // Process matches in reverse order to maintain correct indices
      for (const matchWithPos of sortedMatches) {
        // Create a temporary citation object to normalize the key
        // This must match exactly how citations were normalized during deduplication
        let tempExtractedComponents: any = {}
        
        if (matchWithPos.match.type === 'case') {
          tempExtractedComponents = {
            reporter: matchWithPos.match.components.reporter,
            page: matchWithPos.match.components.page,
          }
        } else if (matchWithPos.match.type === 'statute' || matchWithPos.match.type === 'regulation') {
          tempExtractedComponents = {
            title: matchWithPos.match.components.volume,
            code: matchWithPos.match.components.code,
            section: matchWithPos.match.components.section,
          }
        }
        
        const tempCitation: Citation = {
          id: '',
          citationText: matchWithPos.match.fullMatch,
          citationType: matchWithPos.match.type,
          extractedComponents: tempExtractedComponents,
          tier_1: { status: 'VALID_FORMAT', confidence: 0 },
          tier_2: { evaluations: [], consensus: 'VALID', consensusConfidence: 0, escalated: false },
          tier_3: null,
          recommendations: null,
        }
        
        const key = normalizeCitationKey(tempCitation)
        const citationId = citationTextToId.get(key)
        
        if (citationId) {
          // Wrap citation text with markers
          const before = updatedText.substring(0, matchWithPos.startIndex)
          const citationText = updatedText.substring(matchWithPos.startIndex, matchWithPos.endIndex)
          const after = updatedText.substring(matchWithPos.endIndex)
          
          updatedText = `${before}[CITATION:${citationId}]${citationText}[/CITATION:${citationId}]${after}`
        } else {
          logger.warn(`Could not find citation ID for key: ${key}, citation: ${matchWithPos.match.fullMatch}`)
        }
      }
      
      return {
        ...paragraph,
        text: updatedText,
      }
    })
    
    // Step 6: Update document with deduplicated citations
    const updatedDocument: CitationDocument = {
      document: {
        ...document,
        content: updatedContent,
        citations: deduplicatedCitations,
        metadata: {
          ...document.metadata,
          totalCitations: deduplicatedCitations.length, // Use deduplicated count
          identificationMethod: 'eyecite',
        },
      },
    }
    
    return {
      document: updatedDocument,
      logs: logger.getLogs(),
    }
  } catch (error) {
    // Create a logger to capture the error
    const errorLogger = new LogCollector()
    errorLogger.error('Error in identifyCitationsEyecite', error)
    
    if (error instanceof Error) {
      errorLogger.error('Error details', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
    }
    
    // Re-throw the error so the API can handle it
    throw error
  }
}

