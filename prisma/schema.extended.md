# Extended Schema Design - Non-Destructive Migration

This document describes the extended schema design that adds workflow tracking capabilities while maintaining full backward compatibility with existing data.

## Design Principles

1. **Non-Destructive**: All new fields are optional and nullable
2. **Backward Compatible**: Existing code continues to work unchanged
3. **Gradual Migration**: Data can be migrated incrementally
4. **Queryable**: New fields enable efficient querying without parsing JSON

## Extended CitationCheck Model

```prisma
model CitationCheck {
  // Existing fields (unchanged)
  id            String   @id @default(uuid())
  fileUploadId  String
  userId        String
  version       Int      @default(1)
  status        String   @default("uploaded")
  jsonData      Json?    @db.JsonB
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // NEW: Workflow tracking fields (all optional for backward compatibility)
  workflowType      String?   // "standard" | "test_run" | "heavy_analysis" | "custom"
  workflowId        String?   // UUID to group related checks (e.g., test runs, heavy analysis runs)
  workflowStep      String?   // Current step in workflow
  workflowMetadata  Json?     @db.JsonB // Additional workflow-specific metadata
  
  // NEW: Extracted metadata (for querying without parsing JSON)
  documentMetadata  Json?     @db.JsonB // Extracted from jsonData.document.metadata
  citationCount     Int?      // Total citations count
  identificationMethod String? // "custom" | "eyecite"
  
  // NEW: Workflow state tracking
  completedSteps    String[]  @default([]) // Array of completed step IDs
  currentStep       String?   // Current active step
  
  // Relations (unchanged)
  fileUpload    FileUpload @relation(fields: [fileUploadId], references: [id], onDelete: Cascade)
  user          User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  validationJob ValidationJob?
  
  // Indexes
  @@unique([fileUploadId, version])
  @@index([userId])
  @@index([fileUploadId])
  @@index([workflowType, workflowId]) // For querying workflow groups
  @@index([workflowType]) // For filtering by workflow type
}
```

## Workflow Types

### 1. Standard Workflow
- `workflowType`: "standard"
- `workflowId`: null (or check ID itself)
- Steps: upload → generate-json → identify-citations → validate-citations → review-discrepancies → citations-report

### 2. Test Run Workflow
- `workflowType`: "test_run"
- `workflowId`: UUID shared across all runs in the test
- `workflowMetadata`: { testRunNumber, testRunTotal, configuration }
- Steps: Same as standard, but with test-specific tracking

### 3. Heavy Analysis Workflow
- `workflowType`: "heavy_analysis"
- `workflowId`: UUID shared across all runs in the analysis
- `workflowMetadata`: { runNumber, runTotal, model, provider }
- Steps: generate-json → identify-citations → heavy-analysis

### 4. Custom Workflows
- `workflowType`: "custom"
- `workflowId`: Custom grouping identifier
- `workflowMetadata`: Custom structure

## Migration Strategy

1. **Phase 1**: Add new fields to schema (all nullable)
2. **Phase 2**: Create migration script to populate new fields from existing jsonData
3. **Phase 3**: Update code to use new fields when available, fallback to jsonData
4. **Phase 4**: Gradually migrate all records
5. **Phase 5**: Make new fields required for new records (optional)

## Benefits

1. **Query Efficiency**: Can query by workflowType/workflowId without parsing JSON
2. **Workflow Tracking**: Clear separation of workflow state from document data
3. **Multiple Workflows**: Support parallel workflows on same file
4. **History**: Track workflow progression over time
5. **Backward Compatible**: Existing records work without migration

