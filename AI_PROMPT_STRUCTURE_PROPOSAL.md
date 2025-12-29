# AI Prompt Structure Proposal for Document Generation

## Overview

This document proposes an enhanced AI prompt structure for the Document Creation Wizard at `/citation-checker/create-document`. The proposal improves upon the current implementation by providing more structured, comprehensive prompts that better guide the AI to generate high-quality legal documents with proper citation formatting.

## Current State Analysis

### Current Wizard Fields
The `DocumentWizard` component collects:
- **Required**: `documentType`, `court`, `caseName`
- **Conditional**: `motionType` (for motions/oppositions)
- **Parties**: `plaintiff`/`defendant` OR `movant`/`respondent` (context-dependent)
- **Optional**: `caseNumber`, `filingDate`, `keyIssues`, `additionalContext`

### Current Prompt Structure
The existing `buildWizardPrompt()` function creates a basic prompt that:
- Lists the provided information
- Requests a complete document
- Mentions Bluebook citation format
- Asks for proper formatting

### Current System Prompt
The `DEFAULT_EDIT_SYSTEM_PROMPT` provides general guidance but could be more specific about:
- Document structure requirements
- Citation standards and examples
- Legal writing style
- Document type-specific requirements

## Proposed Enhanced Prompt Structure

### 1. Enhanced System Prompt

The system prompt should be more comprehensive and structured:

```typescript
const ENHANCED_SYSTEM_PROMPT = `You are an expert legal document writing assistant specializing in creating professional legal filings including briefs, motions, memoranda, and other court documents.

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

### 4. Document Type-Specific Requirements

**Briefs:**
- Include: Table of Contents, Table of Authorities, Statement of Facts, Argument sections
- Organize arguments with clear headings and subheadings
- Include conclusion section

**Motions:**
- Include: Caption, Title, Introduction, Statement of Facts, Legal Argument, Prayer for Relief
- Clearly state the relief requested
- Support arguments with legal authority

**Memoranda of Law:**
- Include: Question Presented, Brief Answer, Statement of Facts, Discussion, Conclusion
- Provide thorough legal analysis
- Cite relevant authority extensively

**Responses/Replies:**
- Address the opposing party's arguments directly
- Reference the original motion/brief appropriately
- Provide counter-arguments with supporting authority

**Opposition Briefs:**
- Clearly identify what is being opposed
- Provide substantive legal arguments against the motion
- Include supporting citations

### 5. Response Format
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
- The "explanation" field should briefly describe what was created (e.g., "Generated a Motion for Summary Judgment with proper caption, statement of facts, and legal arguments")
- When editing existing documents, preserve ALL existing content unless explicitly asked to remove or replace it
- When creating new documents, generate the complete document ready for filing

### 6. Content Quality
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
```

### 2. Enhanced Wizard Prompt Builder

The wizard prompt should be more structured and comprehensive:

```typescript
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

  // Document type mapping with descriptions
  const documentTypeLabels: Record<string, string> = {
    brief: "Brief",
    motion: "Motion",
    memorandum: "Memorandum of Law",
    response: "Response/Reply Brief",
    opposition: "Opposition Brief",
    other: "Legal Document",
  }

  const motionTypeLabels: Record<string, string> = {
    "summary-judgment": "Motion for Summary Judgment",
    "dismiss": "Motion to Dismiss",
    "compel": "Motion to Compel",
    "strike": "Motion to Strike",
    "protect": "Motion for Protective Order",
    "default": "Motion for Default Judgment",
    "preliminary-injunction": "Motion for Preliminary Injunction",
    "other": "Motion",
  }

  // Build structured prompt
  let prompt = `Create a complete, professionally formatted ${documentTypeLabels[documentType] || documentType}`

  // Add motion type if applicable
  if (motionType && (documentType === "motion" || documentType === "opposition")) {
    prompt += ` - ${motionTypeLabels[motionType] || motionType}`
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
    // Format date nicely
    const date = new Date(filingDate)
    const formattedDate = date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
    prompt += `Filing Date: ${formattedDate}\n`
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
  prompt += `## DOCUMENT REQUIREMENTS\n`
  
  if (documentType === "brief") {
    prompt += `This brief should include:\n`
    prompt += `- Proper caption with all case information\n`
    prompt += `- Table of Contents (if document is lengthy)\n`
    prompt += `- Table of Authorities (if citations are included)\n`
    prompt += `- Statement of Facts\n`
    prompt += `- Argument sections with clear headings\n`
    prompt += `- Conclusion\n`
  } else if (documentType === "motion" || documentType === "opposition") {
    prompt += `This motion should include:\n`
    prompt += `- Proper caption with all case information\n`
    prompt += `- Clear title indicating the type of motion\n`
    prompt += `- Introduction/Background\n`
    prompt += `- Statement of Facts\n`
    prompt += `- Legal Argument with supporting citations\n`
    prompt += `- Prayer for Relief (clearly stating what is requested)\n`
  } else if (documentType === "memorandum") {
    prompt += `This memorandum should include:\n`
    prompt += `- Proper caption\n`
    prompt += `- Question Presented\n`
    prompt += `- Brief Answer\n`
    prompt += `- Statement of Facts\n`
    prompt += `- Discussion/Analysis with thorough legal reasoning\n`
    prompt += `- Conclusion\n`
  } else if (documentType === "response" || documentType === "reply") {
    prompt += `This response/reply should include:\n`
    prompt += `- Proper caption\n`
    prompt += `- Reference to the motion/brief being responded to\n`
    prompt += `- Point-by-point response to opposing arguments\n`
    prompt += `- Supporting legal authority\n`
    prompt += `- Conclusion\n`
  }
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

  // SECTION 6: Citation Requirements
  prompt += `## CITATION REQUIREMENTS (CRITICAL)\n`
  prompt += `- Use Bluebook citation format exclusively\n`
  prompt += `- Case citations: "Party v. Party, Volume Reporter Page (Court Year)"\n`
  prompt += `- Statute citations: "Title Code § Section"\n`
  prompt += `- Regulation citations: "Volume C.F.R. § Section (Year)"\n`
  prompt += `- DO NOT create fictional or placeholder citations\n`
  prompt += `- If you need to reference authority but don't have exact citation, use descriptive text without citation\n`
  prompt += `- Integrate citations naturally into the text\n`
  prompt += `\n`

  // SECTION 7: Final Instructions
  prompt += `## FINAL INSTRUCTIONS\n`
  prompt += `Generate the complete document with:\n`
  prompt += `1. All required sections for this document type\n`
  prompt += `2. Professional legal writing style\n`
  prompt += `3. Proper Bluebook citations (if any legal authority is referenced)\n`
  prompt += `4. Clear organization and formatting\n`
  prompt += `5. Complete content ready for filing\n`
  prompt += `\n`
  prompt += `The document should be comprehensive, well-reasoned, and professionally formatted.`

  return prompt
}
```

### 2a. Example Wizard Prompt with Variable Placeholders

Here's what the actual wizard prompt looks like with `[variable]` placeholders showing where form data is inserted:

#### Example 1: Motion for Summary Judgment

```
Create a complete, professionally formatted Motion - Motion for Summary Judgment with the following specifications:

## COURT AND CASE INFORMATION
Court: [court]
Case Name: [caseName]
Case Number: [caseNumber] (if provided)
Filing Date: [formatted filingDate] (if provided, e.g., "January 15, 2024")

## PARTIES
Movant (Party Filing Motion): [movant] (if provided)
Respondent (Opposing Party): [respondent] (if provided)

## DOCUMENT REQUIREMENTS
This motion should include:
- Proper caption with all case information
- Clear title indicating the type of motion
- Introduction/Background
- Statement of Facts
- Legal Argument with supporting citations
- Prayer for Relief (clearly stating what is requested)

Style Notes: Motions should clearly state what relief is requested and provide a strong legal basis for the request. Be concise but thorough in legal arguments.

## KEY ISSUES AND TOPICS TO ADDRESS
[keyIssues]

Please ensure the document thoroughly addresses these issues with appropriate legal analysis and supporting authority.

## ADDITIONAL CONTEXT
[additionalContext]

## CITATION REQUIREMENTS (CRITICAL)
Since this document will be processed by a citation validation system, you MUST:

1. **Format Accuracy**: Use Bluebook citation format exclusively
   - Case citations: "Party v. Party, Volume Reporter Page (Court Year)"
     Example: "Smith v. Jones, 123 F.3d 456 (2d Cir. 2020)"
     Example: "Doe v. Roe, 456 U.S. 789 (1982)"
   - Statute citations: "Title Code § Section"
     Example: "28 U.S.C. § 1331"
     Example: "Fed. R. Civ. P. 12(b)(6)"
   - Regulation citations: "Volume C.F.R. § Section (Year)"
     Example: "29 C.F.R. § 1630.2(g) (2023)"

2. **Citation Integrity**:
   - DO NOT create fictional or hallucinated citations
   - DO NOT use placeholder text like "[CITATION NEEDED]" or "[CITE]"
   - DO NOT make up case names, volumes, page numbers, or dates
   - If you reference a real case but don't have the exact citation, describe it without a citation
     Example: "the Supreme Court's decision in Brown v. Board of Education" (without citation)

3. **Citation Integration**:
   - Integrate citations naturally into sentences
   - Use proper citation placement (typically at end of sentence or clause)
   - Include pinpoint citations when referencing specific pages
   - Motions should cite relevant rules (e.g., Fed. R. Civ. P.), statutes, and case law supporting the requested relief. Include citations for all legal standards and precedents referenced.

4. **When to Cite**:
   - Cite when stating legal propositions or rules
   - Cite when referencing specific cases, statutes, or regulations
   - Cite when quoting or paraphrasing legal authority
   - Do not cite for general legal principles that are universally known

## FINAL INSTRUCTIONS
Generate the complete document with:
1. All required sections listed above
2. Professional legal writing style
3. Proper Bluebook citations for any legal authority referenced
4. Clear organization with appropriate headings and formatting
5. Complete content ready for filing
6. All information from the sections above properly incorporated

The document should be comprehensive, well-reasoned, professionally formatted, and ready for use. Remember that citation accuracy is critical as this document will be validated by an automated citation checker.
```

#### Example 2: Brief (with all fields)

```
Create a complete, professionally formatted Brief with the following specifications:

## COURT AND CASE INFORMATION
Court: [court]
Case Name: [caseName]
Case Number: [caseNumber]
Filing Date: [formatted filingDate]

## PARTIES
Plaintiff: [plaintiff]
Defendant: [defendant]

## DOCUMENT REQUIREMENTS
This Brief should include:
1. Proper caption with all case information
2. Table of Contents (if document is lengthy)
3. Table of Authorities (if citations are included)
4. Statement of Facts
5. Argument sections with clear headings and subheadings
6. Conclusion

Style Notes: Briefs should present arguments persuasively with clear reasoning and supporting authority. Use active voice where appropriate and maintain a professional, objective tone.

## KEY ISSUES AND TOPICS TO ADDRESS
[keyIssues]

Please ensure the document thoroughly addresses these issues with appropriate legal analysis and supporting authority.

## ADDITIONAL CONTEXT
[additionalContext]

## CITATION REQUIREMENTS (CRITICAL)
Since this document will be processed by a citation validation system, you MUST:

1. **Format Accuracy**: Use Bluebook citation format exclusively
   - Case citations: "Party v. Party, Volume Reporter Page (Court Year)"
     Example: "Smith v. Jones, 123 F.3d 456 (2d Cir. 2020)"
     Example: "Doe v. Roe, 456 U.S. 789 (1982)"
   - Statute citations: "Title Code § Section"
     Example: "28 U.S.C. § 1331"
     Example: "Fed. R. Civ. P. 12(b)(6)"
   - Regulation citations: "Volume C.F.R. § Section (Year)"
     Example: "29 C.F.R. § 1630.2(g) (2023)"

2. **Citation Integrity**:
   - DO NOT create fictional or hallucinated citations
   - DO NOT use placeholder text like "[CITATION NEEDED]" or "[CITE]"
   - DO NOT make up case names, volumes, page numbers, or dates
   - If you reference a real case but don't have the exact citation, describe it without a citation
     Example: "the Supreme Court's decision in Brown v. Board of Education" (without citation)

3. **Citation Integration**:
   - Integrate citations naturally into sentences
   - Use proper citation placement (typically at end of sentence or clause)
   - Include pinpoint citations when referencing specific pages
   - Briefs typically include extensive citations. Use proper Bluebook format for all case law, statutes, and regulations. Cite authority for all legal propositions.

4. **When to Cite**:
   - Cite when stating legal propositions or rules
   - Cite when referencing specific cases, statutes, or regulations
   - Cite when quoting or paraphrasing legal authority
   - Do not cite for general legal principles that are universally known

## FINAL INSTRUCTIONS
Generate the complete document with:
1. All required sections listed above
2. Professional legal writing style
3. Proper Bluebook citations for any legal authority referenced
4. Clear organization with appropriate headings and formatting
5. Complete content ready for filing
6. All information from the sections above properly incorporated

The document should be comprehensive, well-reasoned, professionally formatted, and ready for use. Remember that citation accuracy is critical as this document will be validated by an automated citation checker.
```

#### Example 3: Memorandum (minimal fields - only required)

```
Create a complete, professionally formatted Memorandum of Law with the following specifications:

## COURT AND CASE INFORMATION
Court: [court]
Case Name: [caseName]

## PARTIES
Plaintiff: [plaintiff] (if provided)
Defendant: [defendant] (if provided)

## DOCUMENT REQUIREMENTS
This Memorandum of Law should include:
1. Proper caption
2. Question Presented
3. Brief Answer
4. Statement of Facts
5. Discussion/Analysis with thorough legal reasoning
6. Conclusion

Style Notes: Memoranda should provide comprehensive legal analysis with extensive citation support. Use clear headings to organize complex legal arguments.

## CITATION REQUIREMENTS (CRITICAL)
Since this document will be processed by a citation validation system, you MUST:

1. **Format Accuracy**: Use Bluebook citation format exclusively
   - Case citations: "Party v. Party, Volume Reporter Page (Court Year)"
     Example: "Smith v. Jones, 123 F.3d 456 (2d Cir. 2020)"
     Example: "Doe v. Roe, 456 U.S. 789 (1982)"
   - Statute citations: "Title Code § Section"
     Example: "28 U.S.C. § 1331"
     Example: "Fed. R. Civ. P. 12(b)(6)"
   - Regulation citations: "Volume C.F.R. § Section (Year)"
     Example: "29 C.F.R. § 1630.2(g) (2023)"

2. **Citation Integrity**:
   - DO NOT create fictional or hallucinated citations
   - DO NOT use placeholder text like "[CITATION NEEDED]" or "[CITE]"
   - DO NOT make up case names, volumes, page numbers, or dates
   - If you reference a real case but don't have the exact citation, describe it without a citation
     Example: "the Supreme Court's decision in Brown v. Board of Education" (without citation)

3. **Citation Integration**:
   - Integrate citations naturally into sentences
   - Use proper citation placement (typically at end of sentence or clause)
   - Include pinpoint citations when referencing specific pages
   - Memoranda should include thorough citation of relevant authority with detailed analysis. Cite all cases, statutes, regulations, and secondary sources referenced.

4. **When to Cite**:
   - Cite when stating legal propositions or rules
   - Cite when referencing specific cases, statutes, or regulations
   - Cite when quoting or paraphrasing legal authority
   - Do not cite for general legal principles that are universally known

## FINAL INSTRUCTIONS
Generate the complete document with:
1. All required sections listed above
2. Professional legal writing style
3. Proper Bluebook citations for any legal authority referenced
4. Clear organization with appropriate headings and formatting
5. Complete content ready for filing
6. All information from the sections above properly incorporated

The document should be comprehensive, well-reasoned, professionally formatted, and ready for use. Remember that citation accuracy is critical as this document will be validated by an automated citation checker.
```

**Note**: Sections like "KEY ISSUES AND TOPICS TO ADDRESS" and "ADDITIONAL CONTEXT" are only included if those fields are provided in the form. Optional fields are conditionally included based on whether they have values.

#### Variable Mapping Reference

| Form Field | Variable Placeholder | Required? | Notes |
|------------|---------------------|-----------|-------|
| `documentType` | Used in document type label | ✅ Yes | Maps to: "Brief", "Motion", "Memorandum of Law", etc. |
| `motionType` | Used in document title | ❌ No | Only shown if `documentType` is "motion" or "opposition" |
| `court` | `[court]` | ✅ Yes | Full court name |
| `caseName` | `[caseName]` | ✅ Yes | Case name (e.g., "Smith v. Jones") |
| `caseNumber` | `[caseNumber]` | ❌ No | Case number (e.g., "1:23-cv-12345") |
| `filingDate` | `[formatted filingDate]` | ❌ No | Formatted as "January 15, 2024" |
| `plaintiff` | `[plaintiff]` | ❌ No* | *Required if not a motion |
| `defendant` | `[defendant]` | ❌ No* | *Required if not a motion |
| `movant` | `[movant]` | ❌ No* | *Shown if motion/opposition |
| `respondent` | `[respondent]` | ❌ No* | *Shown if motion/opposition |
| `keyIssues` | `[keyIssues]` | ❌ No | Entire section omitted if empty |
| `additionalContext` | `[additionalContext]` | ❌ No | Entire section omitted if empty |

**Conditional Logic:**
- If `documentType` is "motion" or "opposition": Shows `movant`/`respondent` fields
- Otherwise: Shows `plaintiff`/`defendant` fields
- If `motionType` is provided AND document is a motion: Adds motion type to title
- If `keyIssues` is empty: Entire "KEY ISSUES AND TOPICS TO ADDRESS" section is omitted
- If `additionalContext` is empty: Entire "ADDITIONAL CONTEXT" section is omitted
- If `caseNumber` is empty: Case Number line is omitted
- If `filingDate` is empty: Filing Date line is omitted

### 3. Document Type-Specific Prompt Templates

For different document types, we can create specialized prompt templates:

```typescript
interface DocumentTypeTemplate {
  requiredSections: string[]
  citationGuidance: string
  styleNotes: string
}

const DOCUMENT_TYPE_TEMPLATES: Record<string, DocumentTypeTemplate> = {
  brief: {
    requiredSections: [
      "Caption",
      "Table of Contents (if lengthy)",
      "Table of Authorities",
      "Statement of Facts",
      "Argument (with subheadings)",
      "Conclusion"
    ],
    citationGuidance: "Briefs typically include extensive citations. Use proper Bluebook format for all case law, statutes, and regulations.",
    styleNotes: "Briefs should present arguments persuasively with clear reasoning and supporting authority."
  },
  motion: {
    requiredSections: [
      "Caption",
      "Title",
      "Introduction",
      "Statement of Facts",
      "Legal Argument",
      "Prayer for Relief"
    ],
    citationGuidance: "Motions should cite relevant rules, statutes, and case law supporting the requested relief.",
    styleNotes: "Motions should clearly state what relief is requested and provide legal basis for the request."
  },
  memorandum: {
    requiredSections: [
      "Caption",
      "Question Presented",
      "Brief Answer",
      "Statement of Facts",
      "Discussion/Analysis",
      "Conclusion"
    ],
    citationGuidance: "Memoranda should include thorough citation of relevant authority with detailed analysis.",
    styleNotes: "Memoranda should provide comprehensive legal analysis with extensive citation support."
  },
  // ... other types
}
```

### 4. Citation-Specific Guidance

Since this is a citation checker tool, we should emphasize citation quality:

```typescript
const CITATION_GUIDANCE_PROMPT = `
## CRITICAL CITATION INSTRUCTIONS

This document will be processed by an automated citation validation system. Therefore:

1. **Format Accuracy**: All citations MUST follow Bluebook format exactly
   - Case: "Smith v. Jones, 123 F.3d 456 (2d Cir. 2020)"
   - Statute: "28 U.S.C. § 1331"
   - Rule: "Fed. R. Civ. P. 12(b)(6)"
   - Regulation: "29 C.F.R. § 1630.2(g) (2023)"

2. **Citation Integrity**: 
   - DO NOT create fictional citations
   - DO NOT use placeholder text like "[CITATION NEEDED]"
   - DO NOT make up case names, volumes, or page numbers
   - If you reference a real case but don't have the exact citation, describe it without a citation

3. **Citation Integration**:
   - Integrate citations naturally into sentences
   - Use proper citation placement (typically at end of sentence or clause)
   - Include pinpoint citations when referencing specific pages

4. **Citation Types**:
   - Primary authority (cases, statutes, regulations) should be cited
   - Secondary authority (treatises, law review articles) may be cited
   - All citations must be verifiable and properly formatted

5. **When to Cite**:
   - Cite when stating legal propositions
   - Cite when referencing specific cases or statutes
   - Cite when quoting or paraphrasing legal authority
   - Do not cite for general legal principles that are well-established
`
```

## Implementation Recommendations

### Phase 1: Enhanced System Prompt
1. Replace `DEFAULT_EDIT_SYSTEM_PROMPT` with the enhanced version
2. Test with various document types
3. Verify JSON response format is maintained

### Phase 2: Enhanced Wizard Prompt
1. Replace `buildWizardPrompt()` with `buildEnhancedWizardPrompt()`
2. Add date formatting for filing dates
3. Add document type-specific section guidance
4. Test with all document types and motion types

### Phase 3: Document Type Templates
1. Implement `DOCUMENT_TYPE_TEMPLATES` structure
2. Integrate templates into prompt building
3. Allow for customization per document type

### Phase 4: Citation Quality Enhancement
1. Add citation-specific guidance to system prompt
2. Create citation examples in prompts
3. Add validation hints in prompts

## Benefits of Enhanced Structure

1. **Better Document Quality**: More specific guidance leads to better-structured documents
2. **Citation Accuracy**: Emphasis on proper citation format reduces validation errors
3. **Consistency**: Structured prompts ensure consistent output across document types
4. **Completeness**: Section requirements ensure all necessary parts are included
5. **Maintainability**: Modular structure makes it easier to update and improve prompts

## Testing Considerations

1. **Test each document type** with various combinations of fields
2. **Verify citation format** in generated documents
3. **Check document structure** matches requirements
4. **Validate JSON response format** is maintained
5. **Test edge cases** (missing optional fields, minimal input, etc.)

## Future Enhancements

1. **User-customizable prompts**: Allow users to save and modify prompts
2. **Citation library integration**: Reference a library of common citations
3. **Template system**: Pre-built templates for common document types
4. **Multi-language support**: Prompts for documents in different languages
5. **Jurisdiction-specific guidance**: Different citation rules for different jurisdictions

