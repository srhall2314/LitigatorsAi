# AI Document Creation Feature - Analysis

## Overview

This document analyzes the requirements for adding an alternate workflow to Step 1 of the Citation Checker that allows users to create documents using AI instead of uploading files.

## Current Architecture

### Step 1: Upload File (Current)
- **Location**: `/app/citation-checker/page.tsx` renders `UploadPage` component
- **Flow**:
  1. User uploads Word document (.doc/.docx)
  2. File uploaded to Vercel Blob Storage via `POST /api/citation-checker/files`
  3. `FileUpload` record created in database
  4. `CitationCheck` record created with status "uploaded"
  5. User proceeds to "generate-json" step

### Document Processing Pipeline
- **Parser**: `lib/document-parser/index.ts` - `parseWordDocument()` function
- **Current Input**: Word document buffer (ArrayBuffer)
- **Processing**:
  - Uses `mammoth` library to convert Word to HTML/text
  - Extracts paragraphs and headings
  - Creates `CitationDocument` JSON structure matching `citationjson.md`
- **Output**: JSON structure with:
  - `document.metadata` (filename, uploadDate, totalCitations)
  - `document.content` (array of paragraphs/headings)
  - `document.citations` (initially empty, populated later)

## Requirements Analysis

### New Feature: AI Document Creation

**User Flow**:
1. On Step 1 page, user sees two options:
   - "Upload File" (existing)
   - "Create with AI" (new)
2. Clicking "Create with AI" navigates to a new page: `/citation-checker/create-document`
3. On the create document page:
   - **Left Panel**: Editable text area showing the document being created
   - **Right Panel**: Chat interface for AI interaction
   - **Saved Prompts**: UI for selecting/using pre-defined prompts
   - Chat updates the text area in real-time
4. Once document is complete, user can:
   - Continue editing manually
   - Save/export to proceed with citation checker workflow

### Key Components Needed

#### 1. New Route: Create Document Page
- **Path**: `/app/citation-checker/create-document/page.tsx`
- **Component**: `CreateDocumentPage` (new component)
- **Layout**: Side-by-side (flexbox or grid)
  - Left: Text editor (textarea or rich text editor)
  - Right: Chat interface

#### 2. API Endpoints

**A. Chat API Endpoint**
- **Path**: `/app/api/citation-checker/create-document/chat/route.ts`
- **Purpose**: Handle AI chat interactions
- **Method**: POST
- **Request Body**:
  ```typescript
  {
    message: string,        // User's chat message
    conversationHistory?: Array<{role: string, content: string}>, // Optional history
    currentDocument?: string, // Current document text for context
    systemPrompt?: string   // System prompt override (from saved prompts)
  }
  ```
- **Response**:
  ```typescript
  {
    response: string,       // AI-generated text/content
    updatedDocument?: string, // Full document text if AI replaces/updates it
    tokenUsage?: TokenUsage // Optional token tracking
  }
  ```

**B. Save Document API Endpoint**
- **Path**: `/app/api/citation-checker/create-document/save/route.ts`
- **Purpose**: Convert text document to FileUpload and merge with workflow
- **Method**: POST
- **Request Body**:
  ```typescript
  {
    documentText: string,
    filename?: string       // Optional filename (default: "ai-generated-document-{timestamp}.txt")
  }
  ```
- **Response**: Same as current file upload response:
  ```typescript
  {
    fileUpload: FileUpload,
    citationCheck: CitationCheck
  }
  ```

**C. Saved Prompts Management (Optional)**
- Could store in database (new `SavedPrompt` model) or config file
- **Path**: `/app/api/citation-checker/create-document/prompts/route.ts`
- Methods: GET (list prompts), POST (save new prompt)

#### 3. Text Document Parser

**New Function Needed**: `lib/document-parser/index.ts`
- **Function**: `parseTextDocument(text: string, filename: string, uploadDate: string): Promise<CitationDocument>`
- **Purpose**: Convert plain text to the same `CitationDocument` structure
- **Logic**:
  - Split text into paragraphs (by double newlines or single newlines)
  - Detect headings (short lines, all caps, numbered patterns)
  - Create content array similar to Word parser
  - Return same structure as `parseWordDocument()`

#### 4. Integration with Generate JSON Step

**Modification Needed**: `app/api/citation-checker/files/[fileId]/generate-json/route.ts`
- Currently expects Word document from blob storage
- Need to handle text files (.txt) differently:
  ```typescript
  // Pseudocode
  if (fileUpload.mimeType === 'text/plain') {
    // Read text from blob
    const text = await fetch(fileUpload.blobUrl).then(r => r.text())
    // Parse as text document
    jsonData = await parseTextDocument(text, fileUpload.originalName, fileUpload.createdAt.toISOString())
  } else {
    // Existing Word document parsing
    jsonData = await parseWordDocument(fileBuffer, ...)
  }
  ```

## Technical Considerations

### 1. AI Provider Integration

**Current AI Usage**:
- System uses multiple providers (Anthropic, OpenAI, Grok, Gemini)
- Pattern: `lib/citation-identification/heavy-analysis.ts` shows how to call different providers
- API keys stored in `lib/env.ts`

**For Chat Interface**:
- Need to decide on default provider/model for document generation
- Could use streaming API for better UX (real-time updates)
- Consider cost implications (likely cheaper models like Claude Haiku or GPT-4o-mini)

**Recommended**: Create a new utility function:
- `lib/ai/document-generation.ts`
- Functions: `generateDocument(prompt: string, options)` and `streamGenerateDocument(...)`

### 2. System Prompt

**Location**: TBD (could be in config file or database)
**Structure**:
- Base system prompt for document generation
- Should instruct AI to generate legal documents with proper citation formatting
- Should emphasize Bluebook citation standards
- Could include examples

**Saved Prompts**:
- Allow users to save/select different prompts for different document types
- Examples:
  - "Legal Brief"
  - "Motion for Summary Judgment"
  - "Memorandum of Law"
- Each could have different system prompts and examples

### 3. Text Editor Component

**Options**:
1. **Simple textarea** (simplest)
   - Pros: Native, lightweight, fast
   - Cons: No formatting, basic UX
2. **Rich text editor** (e.g., Lexical, TipTap, or React Quill)
   - Pros: Better UX, formatting options
   - Cons: More complex, may need to strip formatting for text parser
3. **Code editor** (e.g., Monaco Editor via `@monaco-editor/react`)
   - Pros: Syntax highlighting, better for long documents
   - Cons: Code editor styling may not fit legal document context

**Recommendation**: Start with a simple textarea, can upgrade later if needed.

### 4. Chat Interface Component

**Features Needed**:
- Message history display
- Input field
- Send button
- Loading state during AI response
- Option to stream responses (real-time updates)

**State Management**:
- Conversation history (array of messages)
- Current document text (string)
- Loading state (boolean)

### 5. Document Storage Strategy

**Option A: Store as .txt file in blob storage** (Recommended)
- Convert text to Blob/File
- Upload to Vercel Blob Storage (same as Word docs)
- Create FileUpload record with mimeType: "text/plain"
- Pros: Consistent with existing architecture
- Cons: Need to handle .txt parsing

**Option B: Store text directly in database**
- Store in FileUpload.originalContent or new field
- Pros: Faster access, no blob fetch needed
- Cons: Not consistent with current architecture, larger DB records

**Option C: Hybrid**
- Store text in blob as .txt file (for consistency)
- Optionally cache in database for faster access

### 6. Workflow Integration

**Current Flow After Upload**:
1. Upload → FileUpload created
2. Generate JSON → CitationCheck with jsonData
3. Identify Citations → CitationCheck updated
4. Validate Citations → CitationCheck updated
5. Review & Report

**New Flow After AI Creation**:
1. Create Document → Text generated/edited
2. Save Document → FileUpload created (same as upload)
3. Generate JSON → CitationCheck with jsonData (uses text parser)
4. Rest of workflow identical

**Key Insight**: Once saved as FileUpload, the rest of the workflow is identical. The only difference is the parsing step.

## Implementation Recommendations

### Phase 1: Basic Implementation

1. **Create Document Page**
   - Simple side-by-side layout
   - Textarea on left, basic chat on right
   - No saved prompts initially (hardcode system prompt)

2. **Chat API**
   - Single endpoint for chat
   - Use default AI provider (e.g., Anthropic Claude)
   - Simple request/response (no streaming initially)

3. **Text Parser**
   - Add `parseTextDocument()` function
   - Simple paragraph splitting
   - Basic heading detection

4. **Save Document API**
   - Convert text to .txt file
   - Upload to blob storage
   - Create FileUpload record
   - Redirect to generate-json step

5. **Update Generate JSON Route**
   - Add handling for text/plain mimeType
   - Use parseTextDocument() for .txt files

### Phase 2: Enhancements

1. **Saved Prompts**
   - Database model for SavedPrompt
   - UI for managing prompts
   - API endpoints for CRUD operations

2. **Better Text Editor**
   - Upgrade to rich text editor or code editor
   - Better formatting options

3. **Streaming Chat**
   - Implement streaming API responses
   - Real-time text updates in editor

4. **Document Templates**
   - Pre-defined document templates
   - Quick start options

### Database Schema Considerations

**New Model (Optional - for saved prompts)**:
```prisma
model SavedPrompt {
  id          String   @id @default(uuid())
  userId      String
  name        String   // User-friendly name
  description String?  // Optional description
  systemPrompt String  // The actual prompt
  documentType String? // e.g., "brief", "motion", etc.
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
}
```

## File Structure

```
app/
  citation-checker/
    create-document/
      page.tsx                    # New: Create document page
    components/
      CreateDocumentPage.tsx      # New: Main component
      DocumentEditor.tsx          # New: Left panel text editor
      DocumentChat.tsx            # New: Right panel chat interface
      SavedPromptsPanel.tsx       # New: Saved prompts UI (Phase 2)
    page.tsx                      # Modified: Add "Create with AI" option

app/api/citation-checker/
  create-document/
    chat/
      route.ts                    # New: Chat API endpoint
    save/
      route.ts                    # New: Save document API endpoint
    prompts/
      route.ts                    # New: Saved prompts API (Phase 2)

lib/
  document-parser/
    index.ts                      # Modified: Add parseTextDocument()
  ai/
    document-generation.ts        # New: AI document generation utilities
```

## UI/UX Considerations

### Step 1 Page Modification

Add a choice between upload and create:
```
┌─────────────────────────────────────────┐
│  Step 1: Upload File or Create Document │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐  ┌──────────────┐   │
│  │  Upload File │  │ Create with  │   │
│  │              │  │     AI       │   │
│  │ [File Input] │  │ [Create Btn] │   │
│  └──────────────┘  └──────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Create Document Page Layout

```
┌──────────────────────────────────────────────────────┐
│  Create Document with AI                             │
├──────────────────┬───────────────────────────────────┤
│                  │                                   │
│  Document Editor │        Chat Interface             │
│  (Editable)      │                                   │
│                  │  ┌─────────────────────────────┐ │
│  [Text Area]     │  │ Message History             │ │
│                  │  │                             │ │
│                  │  │                             │ │
│                  │  └─────────────────────────────┘ │
│                  │                                   │
│                  │  [Input Field] [Send]            │
│                  │                                   │
│                  │  Saved Prompts:                  │
│                  │  [Prompt 1] [Prompt 2] ...       │
│                  │                                   │
│  [Save & Continue]                                   │
└──────────────────┴───────────────────────────────────┘
```

## Open Questions

1. **System Prompt**: What should the default system prompt be? Should it be stored in a config file or database?

2. **AI Model Selection**: Which provider/model should be used by default? Should users be able to choose?

3. **Document Format**: Should the AI generate plain text only, or should it support Markdown/rich text?

4. **Citation Format**: Should the system prompt instruct AI to use specific citation formats, or let it be free-form?

5. **Saved Prompts**: Should prompts be user-specific or shared across all users?

6. **Error Handling**: How should we handle AI generation errors or timeouts?

7. **Cost Tracking**: Should we track token usage/costs for document generation separately?

## Security Considerations

1. **Input Validation**: Validate user input in chat API (prevent prompt injection)
2. **Rate Limiting**: Consider rate limiting on chat endpoint to prevent abuse
3. **Content Filtering**: May want to filter inappropriate content in generated documents
4. **User Authentication**: Ensure all endpoints require authentication (consistent with existing pattern)

## Testing Considerations

1. **Unit Tests**:
   - Text document parser
   - AI document generation utilities
   - Chat API endpoint

2. **Integration Tests**:
   - End-to-end flow: create document → save → generate JSON → identify citations
   - Verify text documents work with entire workflow

3. **UI Tests**:
   - Chat interface interactions
   - Document editor functionality
   - Save and continue flow

## Summary

The implementation requires:
- ✅ New page component with side-by-side layout
- ✅ Chat API endpoint for AI interaction
- ✅ Save document API endpoint to merge with workflow
- ✅ Text document parser (similar to Word parser)
- ✅ Modification to generate-json route to handle text files
- ✅ Optional: Saved prompts system
- ✅ Optional: Streaming chat responses

The key insight is that once a text document is saved as a FileUpload, it follows the exact same workflow as uploaded Word documents. The main differences are:
1. The document creation step (AI chat vs file upload)
2. The parsing step (text parser vs Word parser)

All other steps (generate JSON, identify citations, validate, etc.) remain identical.

