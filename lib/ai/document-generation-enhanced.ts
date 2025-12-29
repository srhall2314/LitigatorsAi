/**
 * Enhanced AI Document Generation Utilities
 * Improved prompt structure for better document generation
 */

import { WizardData } from './document-generation'

/**
 * Document type labels for user-friendly display
 */
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  brief: "Brief",
  motion: "Motion",
  memorandum: "Memorandum of Law",
  response: "Response/Reply Brief",
  opposition: "Opposition Brief",
  other: "Legal Document",
}

/**
 * Motion type labels
 */
const MOTION_TYPE_LABELS: Record<string, string> = {
  "summary-judgment": "Motion for Summary Judgment",
  "dismiss": "Motion to Dismiss",
  "compel": "Motion to Compel",
  "strike": "Motion to Strike",
  "protect": "Motion for Protective Order",
  "default": "Motion for Default Judgment",
  "preliminary-injunction": "Motion for Preliminary Injunction",
  "other": "Motion",
}

/**
 * Document type-specific requirements
 */
interface DocumentRequirements {
  requiredSections: string[]
  citationGuidance: string
  styleNotes: string
}

const DOCUMENT_REQUIREMENTS: Record<string, DocumentRequirements> = {
  brief: {
    requiredSections: [
      "Proper caption with all case information",
      "Table of Contents (if document is lengthy)",
      "Table of Authorities (if citations are included)",
      "Statement of Facts",
      "Argument sections with clear headings and subheadings",
      "Conclusion",
    ],
    citationGuidance: "Briefs typically include extensive citations. Use proper Bluebook format for all case law, statutes, and regulations. Cite authority for all legal propositions.",
    styleNotes: "Briefs should present arguments persuasively with clear reasoning and supporting authority. Use active voice where appropriate and maintain a professional, objective tone.",
  },
  motion: {
    requiredSections: [
      "Proper caption with all case information",
      "Clear title indicating the type of motion",
      "Introduction/Background",
      "Statement of Facts",
      "Legal Argument with supporting citations",
      "Prayer for Relief (clearly stating what is requested)",
    ],
    citationGuidance: "Motions should cite relevant rules (e.g., Fed. R. Civ. P.), statutes, and case law supporting the requested relief. Include citations for all legal standards and precedents referenced.",
    styleNotes: "Motions should clearly state what relief is requested and provide a strong legal basis for the request. Be concise but thorough in legal arguments.",
  },
  memorandum: {
    requiredSections: [
      "Proper caption",
      "Question Presented",
      "Brief Answer",
      "Statement of Facts",
      "Discussion/Analysis with thorough legal reasoning",
      "Conclusion",
    ],
    citationGuidance: "Memoranda should include thorough citation of relevant authority with detailed analysis. Cite all cases, statutes, regulations, and secondary sources referenced.",
    styleNotes: "Memoranda should provide comprehensive legal analysis with extensive citation support. Use clear headings to organize complex legal arguments.",
  },
  response: {
    requiredSections: [
      "Proper caption",
      "Reference to the motion/brief being responded to",
      "Point-by-point response to opposing arguments",
      "Supporting legal authority with citations",
      "Conclusion",
    ],
    citationGuidance: "Responses should cite authority that supports your counter-arguments. Reference and distinguish cases cited by the opposing party when appropriate.",
    styleNotes: "Responses should directly address the opposing party's arguments. Be respectful but firm in presenting counter-arguments.",
  },
  opposition: {
    requiredSections: [
      "Proper caption",
      "Clear identification of what is being opposed",
      "Statement of Facts (if different from motion)",
      "Substantive legal arguments against the motion",
      "Supporting citations",
      "Conclusion requesting denial of the motion",
    ],
    citationGuidance: "Opposition briefs should cite authority that supports your position against the motion. Distinguish or counter cases cited by the movant.",
    styleNotes: "Opposition briefs should clearly articulate why the motion should be denied. Present strong legal arguments with supporting authority.",
  },
  other: {
    requiredSections: [
      "Proper caption",
      "Appropriate sections based on document purpose",
      "Clear organization",
      "Professional formatting",
    ],
    citationGuidance: "Use proper Bluebook citation format for all legal authority referenced.",
    styleNotes: "Maintain professional legal writing style appropriate for the document type.",
  },
}

/**
 * Format a date string for display in prompts
 */
function formatDateForPrompt(dateString: string): string {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString // Return original if invalid
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateString
  }
}

/**
 * Build an enhanced, structured prompt from wizard form data
 * This version provides more detailed guidance for better document generation
 */
export function buildEnhancedWizardPrompt(wizardData: WizardData): string {
  const {
    documentType,
    court,
    caseName,
    plaintiff,
    defendant,
    movant,
    respondent,
    caseNumber,
    filingDate,
    motionType,
    keyIssues,
    additionalContext,
  } = wizardData

  // Start building the prompt
  let prompt = `Create a complete, professionally formatted ${DOCUMENT_TYPE_LABELS[documentType] || documentType}`

  // Add motion type if applicable
  if (motionType && (documentType === "motion" || documentType === "opposition")) {
    prompt += ` - ${MOTION_TYPE_LABELS[motionType] || motionType}`
  }

  prompt += ` with the following specifications:\n\n`

  // SECTION 1: Court and Case Information
  prompt += `## COURT AND CASE INFORMATION\n`
  prompt += `Court: ${court}\n`
  prompt += `Case Name: ${caseName}\n`
  
  if (caseNumber) {
    prompt += `Case Number: ${caseNumber}\n`
  }
  
  if (filingDate) {
    prompt += `Filing Date: ${formatDateForPrompt(filingDate)}\n`
  }
  prompt += `\n`

  // SECTION 2: Parties
  prompt += `## PARTIES\n`
  if (movant || respondent) {
    // Motion context
    if (movant) {
      prompt += `Movant (Party Filing Motion): ${movant}\n`
    }
    if (respondent) {
      prompt += `Respondent (Opposing Party): ${respondent}\n`
    }
  } else {
    // Standard case context
    if (plaintiff) {
      prompt += `Plaintiff: ${plaintiff}\n`
    }
    if (defendant) {
      prompt += `Defendant: ${defendant}\n`
    }
  }
  prompt += `\n`

  // SECTION 3: Document-Specific Requirements
  const requirements = DOCUMENT_REQUIREMENTS[documentType] || DOCUMENT_REQUIREMENTS.other
  
  prompt += `## DOCUMENT REQUIREMENTS\n`
  prompt += `This ${DOCUMENT_TYPE_LABELS[documentType] || documentType} should include:\n`
  requirements.requiredSections.forEach((section, index) => {
    prompt += `${index + 1}. ${section}\n`
  })
  prompt += `\n`
  prompt += `Style Notes: ${requirements.styleNotes}\n`
  prompt += `\n`

  // SECTION 4: Key Issues and Topics
  if (keyIssues && keyIssues.trim()) {
    prompt += `## KEY ISSUES AND TOPICS TO ADDRESS\n`
    prompt += `${keyIssues}\n`
    prompt += `\n`
    prompt += `Please ensure the document thoroughly addresses these issues with appropriate legal analysis and supporting authority.\n`
    prompt += `\n`
  }

  // SECTION 5: Additional Context
  if (additionalContext && additionalContext.trim()) {
    prompt += `## ADDITIONAL CONTEXT\n`
    prompt += `${additionalContext}\n`
    prompt += `\n`
  }

  // SECTION 6: Citation Requirements (Critical for citation checker)
  prompt += `## CITATION REQUIREMENTS (CRITICAL)\n`
  prompt += `Since this document will be processed by a citation validation system, you MUST:\n`
  prompt += `\n`
  prompt += `1. **Format Accuracy**: Use Bluebook citation format exclusively\n`
  prompt += `   - Case citations: "Party v. Party, Volume Reporter Page (Court Year)"\n`
  prompt += `     Example: "Smith v. Jones, 123 F.3d 456 (2d Cir. 2020)"\n`
  prompt += `     Example: "Doe v. Roe, 456 U.S. 789 (1982)"\n`
  prompt += `   - Statute citations: "Title Code § Section"\n`
  prompt += `     Example: "28 U.S.C. § 1331"\n`
  prompt += `     Example: "Fed. R. Civ. P. 12(b)(6)"\n`
  prompt += `   - Regulation citations: "Volume C.F.R. § Section (Year)"\n`
  prompt += `     Example: "29 C.F.R. § 1630.2(g) (2023)"\n`
  prompt += `\n`
  prompt += `2. **Citation Integrity**:\n`
  prompt += `   - DO NOT create fictional or hallucinated citations\n`
  prompt += `   - DO NOT use placeholder text like "[CITATION NEEDED]" or "[CITE]"\n`
  prompt += `   - DO NOT make up case names, volumes, page numbers, or dates\n`
  prompt += `   - If you reference a real case but don't have the exact citation, describe it without a citation\n`
  prompt += `     Example: "the Supreme Court's decision in Brown v. Board of Education" (without citation)\n`
  prompt += `\n`
  prompt += `3. **Citation Integration**:\n`
  prompt += `   - Integrate citations naturally into sentences\n`
  prompt += `   - Use proper citation placement (typically at end of sentence or clause)\n`
  prompt += `   - Include pinpoint citations when referencing specific pages\n`
  prompt += `   - ${requirements.citationGuidance}\n`
  prompt += `\n`
  prompt += `4. **When to Cite**:\n`
  prompt += `   - Cite when stating legal propositions or rules\n`
  prompt += `   - Cite when referencing specific cases, statutes, or regulations\n`
  prompt += `   - Cite when quoting or paraphrasing legal authority\n`
  prompt += `   - Do not cite for general legal principles that are universally known\n`
  prompt += `\n`

  // SECTION 7: Final Instructions
  prompt += `## FINAL INSTRUCTIONS\n`
  prompt += `Generate the complete document with:\n`
  prompt += `1. All required sections listed above\n`
  prompt += `2. Professional legal writing style\n`
  prompt += `3. Proper Bluebook citations for any legal authority referenced\n`
  prompt += `4. Clear organization with appropriate headings and formatting\n`
  prompt += `5. Complete content ready for filing\n`
  prompt += `6. All information from the sections above properly incorporated\n`
  prompt += `\n`
  prompt += `The document should be comprehensive, well-reasoned, professionally formatted, and ready for use.`
  prompt += ` Remember that citation accuracy is critical as this document will be validated by an automated citation checker.`

  return prompt
}

/**
 * Enhanced system prompt with more detailed guidance
 * This can replace or supplement the existing DEFAULT_EDIT_SYSTEM_PROMPT
 */
export const ENHANCED_EDIT_SYSTEM_PROMPT = `You are an expert legal document writing assistant specializing in creating professional legal filings including briefs, motions, memoranda, and other court documents.

## Your Role
Generate well-structured, professionally formatted legal documents that are ready for filing. Your documents must be accurate, properly cited, and follow standard legal writing conventions.

## Critical Requirements

### 1. Document Structure
- **Caption**: Include proper court caption with:
  - Full court name
  - Case name (e.g., "Smith v. Jones")
  - Case number (if provided)
  - Parties listed correctly
  - Filing date (if provided)
- **Title**: Clear, descriptive document title
- **Sections**: Well-organized sections with clear headings
- **Formatting**: Professional legal document formatting with proper spacing and indentation

### 2. Citation Standards (CRITICAL)
Since this document will be processed by a citation validation system, you MUST:
- Use **Bluebook citation format** exclusively
- Format case citations as: "Party v. Party, Volume Reporter Page (Court Year)"
  - Example: "Smith v. Jones, 123 F.3d 456 (2d Cir. 2020)"
  - Example: "Doe v. Roe, 456 U.S. 789 (1982)"
- Format statutes as: "Title Code § Section"
  - Example: "28 U.S.C. § 1331"
  - Example: "Fed. R. Civ. P. 12(b)(6)"
- Format regulations as: "Volume C.F.R. § Section (Year)"
  - Example: "29 C.F.R. § 1630.2(g) (2023)"
- **DO NOT** create fictional or hallucinated citations
- **DO NOT** use placeholder citations like "[CITATION NEEDED]"
- If you need to reference a case but don't have the exact citation, use a descriptive reference like "the Supreme Court's decision in [Case Name]" without a citation
- Citations should be integrated naturally into the text

### 3. Legal Writing Style
- Use formal, professional legal language
- Write in third person
- Use active voice where appropriate
- Maintain objective, analytical tone
- Structure arguments logically with clear reasoning
- Include appropriate legal terminology

### 4. Response Format
You MUST respond with valid JSON only, in this exact format:
\`\`\`json
{
  "explanation": "Brief explanation of what was generated or changed",
  "document": "The complete document text with all content"
}
\`\`\`

**Critical Rules:**
- The "document" field must contain the COMPLETE document text
- No explanatory text, comments, or meta-commentary in the document field
- The "explanation" field should briefly describe what was created
- When editing existing documents, preserve ALL existing content unless explicitly asked to remove or replace it
- When creating new documents, generate the complete document ready for filing

### 5. Content Quality
- Ensure all legal arguments are logically sound
- Use appropriate legal precedents and authority
- Maintain consistency in terminology and style
- Check that all sections are complete and properly formatted
- Verify that citations follow Bluebook format exactly

## Document Generation Process

When generating a document:
1. Start with the caption (court, case name, parties, case number, filing date)
2. Add the document title
3. Create appropriate sections based on document type
4. Develop substantive content addressing the key issues provided
5. Integrate citations naturally using proper Bluebook format
6. Conclude appropriately for the document type
7. Ensure the document is complete and ready for filing

Remember: This document will be processed by a citation validation system, so citation accuracy and proper formatting are critical.`

