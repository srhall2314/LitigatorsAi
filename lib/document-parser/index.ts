/**
 * Word Document Parser
 * Converts Word documents to JSON structure matching citationjson.md specification
 */

import mammoth from 'mammoth'
import { ContentParagraph, CitationDocument, CitationMetadata } from '@/types/citation-json'

/**
 * Parse Word document buffer to JSON structure
 */
export async function parseWordDocument(
  buffer: ArrayBuffer,
  filename: string,
  uploadDate: string
): Promise<CitationDocument> {
  // Convert Word document to HTML
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  const html = result.value

  // Parse HTML to extract paragraphs and headings
  const content: ContentParagraph[] = []
  let paraCounter = 1
  let headingCounter = 1

  // Split HTML by block-level elements (p, h1-h6, div)
  // This is a simplified parser - in production, you'd want a more robust HTML parser
  const blockRegex = /<(p|h[1-6]|div)[^>]*>([\s\S]*?)<\/\1>/gi
  let match

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1]
    const innerHtml = match[2]
    
    // Extract text content (strip HTML tags)
    const textContent = innerHtml
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .trim()

    // Skip empty blocks
    if (!textContent) continue

    if (tag.startsWith('h')) {
      // Heading
      const level = parseInt(tag.charAt(1))
      content.push({
        type: 'heading',
        id: `heading_${String(headingCounter).padStart(3, '0')}`,
        level,
        text: textContent,
      })
      headingCounter++
    } else {
      // Paragraph
      content.push({
        type: 'paragraph',
        id: `para_${String(paraCounter).padStart(3, '0')}`,
        text: textContent,
      })
      paraCounter++
    }
  }

  // If no blocks found, try to extract plain text
  if (content.length === 0) {
    const plainText = await mammoth.extractRawText({ arrayBuffer: buffer })
    const paragraphs = plainText.value
      .split(/\n\s*\n/) // Split by double newlines
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    paragraphs.forEach((para, index) => {
      content.push({
        type: 'paragraph',
        id: `para_${String(index + 1).padStart(3, '0')}`,
        text: para,
      })
    })
  }

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

  return document
}

