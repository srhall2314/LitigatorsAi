# AI Prompt Implementation Guide

## Quick Start

This guide explains how to implement the enhanced AI prompt structure for document generation.

## Files Created

1. **`AI_PROMPT_STRUCTURE_PROPOSAL.md`** - Comprehensive proposal document with detailed explanations
2. **`lib/ai/document-generation-enhanced.ts`** - Enhanced implementation with improved prompt building

## Key Improvements

### 1. Enhanced System Prompt
- More detailed guidance on document structure
- Stronger emphasis on citation accuracy (critical for citation checker)
- Document type-specific requirements
- Better formatting instructions

### 2. Enhanced Wizard Prompt
- Structured sections for better organization
- Document type-specific requirements
- Better date formatting
- More comprehensive citation guidance
- Clearer instructions for the AI

### 3. Document Type Templates
- Pre-defined requirements for each document type
- Citation guidance tailored to document type
- Style notes for each type

## Implementation Steps

### Option A: Gradual Migration (Recommended)

1. **Test the enhanced prompts alongside existing ones:**
   ```typescript
   // In CreateDocumentPage.tsx or wherever buildWizardPrompt is called
   import { buildEnhancedWizardPrompt } from '@/lib/ai/document-generation-enhanced'
   
   // Use enhanced version
   const wizardPrompt = buildEnhancedWizardPrompt(wizardData)
   ```

2. **Compare outputs** between old and new prompts

3. **Update system prompt** in `document-generation.ts`:
   ```typescript
   import { ENHANCED_EDIT_SYSTEM_PROMPT } from './document-generation-enhanced'
   
   // Replace DEFAULT_EDIT_SYSTEM_PROMPT with ENHANCED_EDIT_SYSTEM_PROMPT
   ```

### Option B: Direct Replacement

1. **Replace `buildWizardPrompt` function:**
   ```typescript
   // In lib/ai/document-generation.ts
   export { buildEnhancedWizardPrompt as buildWizardPrompt } from './document-generation-enhanced'
   ```

2. **Update system prompt:**
   ```typescript
   // In lib/ai/document-generation.ts
   import { ENHANCED_EDIT_SYSTEM_PROMPT } from './document-generation-enhanced'
   
   const DEFAULT_EDIT_SYSTEM_PROMPT = ENHANCED_EDIT_SYSTEM_PROMPT
   ```

## Testing Checklist

- [ ] Test each document type (brief, motion, memorandum, response, opposition)
- [ ] Test with all motion types
- [ ] Test with minimal fields (only required)
- [ ] Test with all fields filled
- [ ] Verify JSON response format is maintained
- [ ] Check citation format in generated documents
- [ ] Verify document structure matches requirements
- [ ] Test with various key issues and additional context

## Key Features

### Structured Sections
The enhanced prompt organizes information into clear sections:
- Court and Case Information
- Parties
- Document Requirements
- Key Issues and Topics
- Additional Context
- Citation Requirements (Critical)
- Final Instructions

### Citation Emphasis
Since this is a citation checker tool, the prompts strongly emphasize:
- Proper Bluebook format
- No fictional citations
- No placeholders
- Accurate citation formatting

### Document Type Awareness
Each document type has specific requirements:
- Required sections
- Citation guidance
- Style notes

## Customization

### Adding New Document Types

Edit `DOCUMENT_REQUIREMENTS` in `document-generation-enhanced.ts`:

```typescript
const DOCUMENT_REQUIREMENTS: Record<string, DocumentRequirements> = {
  // ... existing types
  'new-type': {
    requiredSections: ['Section 1', 'Section 2'],
    citationGuidance: 'Guidance for this type',
    styleNotes: 'Style notes for this type',
  },
}
```

### Modifying Citation Guidance

Edit the citation requirements section in `buildEnhancedWizardPrompt()` to adjust citation instructions.

### Customizing System Prompt

Modify `ENHANCED_EDIT_SYSTEM_PROMPT` in `document-generation-enhanced.ts` to adjust overall AI behavior.

## Benefits

1. **Better Document Quality**: More specific guidance leads to better-structured documents
2. **Citation Accuracy**: Strong emphasis on proper citation format reduces validation errors
3. **Consistency**: Structured prompts ensure consistent output
4. **Completeness**: Section requirements ensure all necessary parts are included
5. **Maintainability**: Modular structure makes updates easier

## Next Steps

1. Review the proposal document (`AI_PROMPT_STRUCTURE_PROPOSAL.md`)
2. Test the enhanced prompts with sample data
3. Compare outputs with existing prompts
4. Gradually migrate or replace based on results
5. Monitor citation validation results to ensure improvements

## Questions or Issues

If you encounter issues or want to customize further:
1. Review the detailed proposal document
2. Check the implementation in `document-generation-enhanced.ts`
3. Test with various document types and field combinations
4. Adjust prompts based on actual output quality

