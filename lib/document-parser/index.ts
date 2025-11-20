/**
 * Word Document Parser
 * Converts Word documents to JSON structure matching citationjson.md specification
 */

import mammoth from 'mammoth'
import { ContentParagraph, CitationDocument, CitationMetadata } from '@/types/citation-json'

// Helper to convert ArrayBuffer to Buffer if needed (for Node.js runtime)
function toMammothBuffer(buffer: ArrayBuffer): { arrayBuffer?: ArrayBuffer; buffer?: Buffer } {
  // Try to use Buffer if available (Node.js runtime)
  try {
    // eslint-disable-next-line
    const Buffer = require('buffer').Buffer
    if (Buffer && typeof Buffer.from === 'function') {
      return { buffer: Buffer.from(buffer) }
    }
  } catch {
    // Buffer not available, use arrayBuffer (Edge runtime)
  }
  return { arrayBuffer: buffer }
}

/**
 * Parse Word document buffer to JSON structure
 */
export async function parseWordDocument(
  buffer: ArrayBuffer,
  filename: string,
  uploadDate: string
): Promise<CitationDocument> {
  console.log('[parseWordDocument] Starting parse:', {
    filename,
    bufferSize: buffer.byteLength,
    bufferType: buffer.constructor.name,
  })

  // Convert Word document to HTML
  // Mammoth can accept arrayBuffer or buffer - try both formats
  let result
  try {
    console.log('[parseWordDocument] Calling mammoth.convertToHtml')
    console.log('[parseWordDocument] Buffer details:', {
      isArrayBuffer: buffer instanceof ArrayBuffer,
      byteLength: buffer.byteLength,
      constructor: buffer.constructor.name,
    })
    
    // Convert buffer to format mammoth expects (arrayBuffer or Buffer)
    const mammothOptions = toMammothBuffer(buffer)
    console.log('[parseWordDocument] Mammoth options:', Object.keys(mammothOptions))
    result = await mammoth.convertToHtml(mammothOptions)
    console.log('[parseWordDocument] Mammoth conversion successful, HTML length:', result.value?.length || 0)
  } catch (error) {
    console.error('[parseWordDocument] Mammoth conversion error:', error)
    if (error instanceof Error) {
      console.error('[parseWordDocument] Error details:', error.message, error.stack)
    }
    throw new Error(`Failed to convert Word document to HTML: ${error instanceof Error ? error.message : String(error)}`)
  }

  const html = result.value
  console.log('[parseWordDocument] Extracted HTML, length:', html?.length || 0)
  console.log('[parseWordDocument] HTML preview (first 500 chars):', html?.substring(0, 500))

  // Parse HTML to extract paragraphs and headings
  const content: ContentParagraph[] = []
  let paraCounter = 1
  let headingCounter = 1

  // PRIMARY METHOD: Use extractRawText first - it's more reliable for getting all text
  console.log('[parseWordDocument] PRIMARY: Using extractRawText to get all document text')
  try {
    const mammothOptions = toMammothBuffer(buffer)
    const plainTextResult = await mammoth.extractRawText(mammothOptions)
    const plainText = plainTextResult.value
    
    console.log('[parseWordDocument] Raw text length:', plainText.length)
    console.log('[parseWordDocument] Raw text preview (first 500 chars):', plainText.substring(0, 500))
    console.log('[parseWordDocument] Raw text preview (last 500 chars):', plainText.substring(Math.max(0, plainText.length - 500)))
    
    if (plainText && plainText.trim().length > 0) {
      // IMPORTANT: Preserve ALL text - split carefully to not lose any content
      // First, normalize line breaks but preserve structure
      const normalizedText = plainText
        .replace(/\r\n/g, '\n') // Normalize Windows line breaks
        .replace(/\r/g, '\n')   // Normalize Mac line breaks
      
      // Split by double newlines (paragraph breaks), but preserve single newlines within paragraphs
      let paragraphs = normalizedText
        .split(/\n\s*\n+/) // Split by double or more newlines
        .map((p) => p.replace(/\n/g, ' ').trim()) // Replace single newlines with spaces within paragraphs
        .filter((p) => p.length > 0) // Remove empty paragraphs

      // If we got very few paragraphs or one huge paragraph, try a different approach
      if (paragraphs.length === 0) {
        // No double newlines - split by single newlines
        console.log('[parseWordDocument] No double newlines found, splitting by single newlines')
        paragraphs = normalizedText
          .split(/\n/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      } else if (paragraphs.length === 1 && paragraphs[0].length > 2000) {
        // One huge paragraph - try splitting by single newlines
        console.log('[parseWordDocument] Single large paragraph detected, trying single newline split')
        paragraphs = normalizedText
          .split(/\n/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      }

      // Final safety: if still no paragraphs but we have text, treat entire text as one paragraph
      if (paragraphs.length === 0 && plainText.trim().length > 0) {
        console.log('[parseWordDocument] Treating entire text as single paragraph')
        paragraphs = [plainText.trim()]
      }

      console.log('[parseWordDocument] Extracted', paragraphs.length, 'paragraphs from raw text')
      console.log('[parseWordDocument] Total characters in paragraphs:', paragraphs.reduce((sum, p) => sum + p.length, 0))
      console.log('[parseWordDocument] Original text length:', plainText.length)

      // Process each paragraph/line
      paragraphs.forEach((para, index) => {
        // Try to detect headings (lines that are short and might be headings)
        const isLikelyHeading = para.length < 150 && 
          (para.match(/^[IVX]+\.?\s+[A-Z]/) || // Roman numerals (I., II., III., etc.)
           para.match(/^[A-Z][A-Z\s]{0,120}$/) || // All caps short line
           para.match(/^[0-9]+\.\s+[A-Z]/) || // Numbered heading (1., 2., etc.)
           para.match(/^[A-Z]\.\s+[A-Z]/)) // Letter heading (A., B., etc.)

        if (isLikelyHeading) {
          content.push({
            type: 'heading',
            id: `heading_${String(headingCounter).padStart(3, '0')}`,
            level: 1, // Default to level 1, could be improved
            text: para,
          })
          headingCounter++
        } else {
          content.push({
            type: 'paragraph',
            id: `para_${String(paraCounter).padStart(3, '0')}`,
            text: para,
          })
          paraCounter++
        }
      })
      
      // Verify we captured all text
      const totalExtractedChars = content.reduce((sum, item) => sum + item.text.length, 0)
      const originalChars = plainText.replace(/\s+/g, ' ').trim().length
      const extractedChars = content.reduce((sum, item) => sum + item.text.replace(/\s+/g, ' ').length, 0)
      
      console.log('[parseWordDocument] Text extraction verification:')
      console.log('[parseWordDocument]   Original (normalized):', originalChars, 'chars')
      console.log('[parseWordDocument]   Extracted (normalized):', extractedChars, 'chars')
      console.log('[parseWordDocument]   Coverage:', ((extractedChars / originalChars) * 100).toFixed(1) + '%')
      
      if (extractedChars < originalChars * 0.8) {
        console.warn('[parseWordDocument] WARNING: May have lost content during extraction!')
      }
    }
  } catch (error) {
    console.error('[parseWordDocument] extractRawText error:', error)
    // Fall through to HTML parsing
  }

  // FALLBACK: If extractRawText didn't work, parse HTML
  if (content.length === 0) {
    console.log('[parseWordDocument] FALLBACK: Parsing HTML structure')
    
    // Helper function to extract text from HTML, preserving structure
    function extractTextFromHtml(html: string): string {
      return html
        .replace(/<br\s*\/?>/gi, '\n') // Convert <br> to newlines
        .replace(/<\/p>/gi, '\n\n') // Convert </p> to double newlines
        .replace(/<\/div>/gi, '\n\n') // Convert </div> to double newlines
        .replace(/<\/h[1-6]>/gi, '\n\n') // Convert </h> to double newlines
        .replace(/<[^>]+>/g, '') // Remove all remaining HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/&amp;/g, '&') // Replace &amp; with &
        .replace(/&lt;/g, '<') // Replace &lt; with <
        .replace(/&gt;/g, '>') // Replace &gt; with >
        .replace(/&quot;/g, '"') // Replace &quot; with "
        .replace(/&#39;/g, "'") // Replace &#39; with '
        .replace(/&#160;/g, ' ') // Replace &#160; with space
        .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
        .trim()
    }

    // Try to parse structured HTML blocks
    const blockRegex = /<(p|h[1-6]|div|li)[^>]*>([\s\S]*?)<\/\1>/gi
    let match
    const processedBlocks = new Set<string>()

    while ((match = blockRegex.exec(html)) !== null) {
      const fullMatch = match[0]
      const tag = match[1].toLowerCase()
      const innerHtml = match[2]
      
      // Skip if we've already processed this block
      if (processedBlocks.has(fullMatch)) continue
      processedBlocks.add(fullMatch)
      
      // Extract text content
      const textContent = extractTextFromHtml(innerHtml).trim()

      // Skip empty blocks
      if (!textContent || textContent.length === 0) continue

      if (tag.startsWith('h')) {
        // Heading
        const level = parseInt(tag.charAt(1))
        if (level >= 1 && level <= 6) {
          content.push({
            type: 'heading',
            id: `heading_${String(headingCounter).padStart(3, '0')}`,
            level,
            text: textContent,
          })
          headingCounter++
        }
      } else {
        // Paragraph, div, or list item
        content.push({
          type: 'paragraph',
          id: `para_${String(paraCounter).padStart(3, '0')}`,
          text: textContent,
        })
        paraCounter++
      }
    }

    console.log('[parseWordDocument] Extracted', content.length, 'blocks from HTML parsing')

    // Final fallback: extract all text from HTML
    if (content.length === 0 && html) {
      console.log('[parseWordDocument] FINAL FALLBACK: Extracting all text from HTML')
      const allText = extractTextFromHtml(html)
      if (allText && allText.trim().length > 0) {
        // Split into paragraphs
        const paragraphs = allText
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
        
        paragraphs.forEach((para, index) => {
          content.push({
            type: 'paragraph',
            id: `para_${String(index + 1).padStart(3, '0')}`,
            text: para,
          })
        })
        console.log('[parseWordDocument] Extracted', paragraphs.length, 'paragraphs from HTML text fallback')
      }
    }
  }

  console.log('[parseWordDocument] Parsed', content.length, 'content blocks')
  
  // Validate that we have content
  if (content.length === 0) {
    console.error('[parseWordDocument] ERROR: No content extracted from document!')
    console.error('[parseWordDocument] HTML length:', html?.length || 0)
    console.error('[parseWordDocument] HTML sample:', html?.substring(0, 1000))
    throw new Error('Failed to extract any content from the document. The document may be empty or in an unsupported format.')
  }

  // Log sample of extracted content for debugging
  console.log('[parseWordDocument] Sample content (first 3 blocks):')
  content.slice(0, 3).forEach((block, idx) => {
    console.log(`  [${idx}] ${block.type} (${block.id}): ${block.text.substring(0, 100)}...`)
  })

  // Create metadata
  const metadata: CitationMetadata = {
    filename,
    uploadDate,
    // documentType is optional, will be detected later if needed
    totalCitations: 0, // Will be populated by citation identification
  }

  // Create document structure
  const document: CitationDocument = {
    document: {
      metadata,
      content,
      citations: [], // Will be populated by citation identification
    },
  }

  console.log('[parseWordDocument] Document structure created successfully')
  return document
}

