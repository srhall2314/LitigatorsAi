# Data Structure Extension Summary

## Problem Statement

The current data structure stores everything in a single `jsonData` JsonB field, which:
- Makes it difficult to query efficiently
- Doesn't support multiple parallel workflows
- Embeds workflow state in document metadata
- Makes it hard to track workflow history and progression
- Limits extensibility for advanced workflows

## Solution Overview

A **non-destructive extension** to the data structure that:
1. ✅ Adds optional workflow tracking fields to the database schema
2. ✅ Provides migration utilities to parse existing records
3. ✅ Maintains full backward compatibility with existing code
4. ✅ Enables efficient querying without parsing JSON
5. ✅ Supports multiple workflow types (standard, test runs, heavy analysis, custom)

## What Was Created

### 1. Extended Prisma Schema (`prisma/schema.prisma`)

Added optional fields to `CitationCheck` model:
- `workflowType`: Type of workflow ("standard" | "test_run" | "heavy_analysis" | "custom")
- `workflowId`: UUID to group related checks
- `workflowStep`: Current step in workflow
- `workflowMetadata`: Workflow-specific metadata
- `documentMetadata`: Extracted document metadata (for querying)
- `citationCount`: Total citations count
- `identificationMethod`: Method used ("custom" | "eyecite")
- `completedSteps`: Array of completed step IDs
- `currentStep`: Current active step

**All fields are optional and nullable** - existing records continue to work unchanged.

### 2. Migration Utilities (`lib/migration/workflow-migration.ts`)

Functions to migrate existing records:
- `extractWorkflowFromJsonData()`: Extracts workflow info from existing jsonData
- `migrateCitationCheck()`: Migrates a single check
- `migrateFileChecks()`: Migrates all checks for a file
- `migrateAllChecks()`: Migrates all checks (batch processing)
- `syncWorkflowFromJsonData()`: Keeps workflow fields in sync with jsonData

### 3. Workflow Utilities (`lib/workflow/workflow-utils.ts`)

Helper functions with backward compatibility:
- `getWorkflowType()`: Gets workflow type (checks new field or extracts from jsonData)
- `isNormalWorkflow()`: Checks if check is from normal workflow
- `getWorkflowChecks()`: Gets all checks in a workflow group
- `syncWorkflowFields()`: Syncs workflow fields after jsonData updates
- `createWorkflowCheck()`: Creates new check with workflow tracking
- `findLatestNormalWorkflowCheck()`: Finds latest normal workflow check

### 4. Type Definitions (`types/workflow.ts`)

TypeScript types for the extended workflow system:
- `WorkflowType`: Union type for workflow types
- `WorkflowStep`: Union type for workflow steps
- `WorkflowMetadata`: Interface for workflow metadata
- `CitationCheckWithWorkflow`: Extended CitationCheck interface
- Helper functions: `isStepCompleted()`, `getNextStep()`, `isWorkflowComplete()`

### 5. Migration Script (`scripts/migrate-workflows.ts`)

CLI script to migrate records:
```bash
# Migrate a specific check
npx ts-node scripts/migrate-workflows.ts --check-id <id>

# Migrate all checks for a file
npx ts-node scripts/migrate-workflows.ts --file-id <id>

# Migrate all checks (use with caution)
npx ts-node scripts/migrate-workflows.ts --all

# Dry run to see what would be migrated
npx ts-node scripts/migrate-workflows.ts --file-id <id> --dry-run
```

### 6. Documentation

- `WORKFLOW_MIGRATION.md`: Complete migration guide
- `prisma/schema.extended.md`: Schema design documentation
- `lib/workflow/examples.ts`: Usage examples

## How It Works

### Backward Compatibility

All existing code continues to work because:
1. New fields are optional - existing records have `null` values
2. Utility functions check new fields first, then fallback to extracting from `jsonData`
3. No breaking changes to existing API endpoints or data structures

### Migration Process

1. **Run Prisma migration** to add new fields:
   ```bash
   npx prisma migrate dev --name add_workflow_tracking
   ```

2. **Migrate records incrementally** (or on-demand):
   ```bash
   npx ts-node scripts/migrate-workflows.ts --file-id <id>
   ```

3. **Update code gradually** to use new utilities where beneficial

4. **New records** automatically populate workflow fields when using `createWorkflowCheck()`

### Example Usage

```typescript
import { findLatestNormalWorkflowCheck } from "@/lib/workflow/workflow-utils";

// Works with both migrated and non-migrated records
const check = await findLatestNormalWorkflowCheck(prisma, fileId);

// Query by workflow type (efficient, no JSON parsing)
const testRuns = await prisma.citationCheck.findMany({
  where: {
    fileUploadId: fileId,
    workflowType: "test_run",
  },
});
```

## Benefits

1. **Query Efficiency**: Can query by `workflowType` and `workflowId` without parsing JSON
2. **Workflow Tracking**: Clear separation of workflow state from document data
3. **Multiple Workflows**: Support parallel workflows on same file (test runs + heavy analysis)
4. **History**: Track workflow progression over time
5. **Backward Compatible**: Existing records work without migration
6. **Non-Destructive**: No data is lost or modified, only extended
7. **Gradual Migration**: Can migrate incrementally or on-demand

## Next Steps

1. **Run Prisma migration**:
   ```bash
   npx prisma migrate dev --name add_workflow_tracking
   ```

2. **Test migration** on a single check:
   ```bash
   npx ts-node scripts/migrate-workflows.ts --check-id <id> --dry-run
   ```

3. **Migrate a test file**:
   ```bash
   npx ts-node scripts/migrate-workflows.ts --file-id <id>
   ```

4. **Update code** to use workflow utilities where beneficial (see `lib/workflow/examples.ts`)

5. **Gradually migrate** all records (or migrate on-demand as needed)

## Files Created/Modified

### Created:
- `prisma/schema.extended.md` - Schema design documentation
- `lib/migration/workflow-migration.ts` - Migration utilities
- `lib/workflow/workflow-utils.ts` - Workflow helper functions
- `lib/workflow/examples.ts` - Usage examples
- `types/workflow.ts` - Type definitions
- `scripts/migrate-workflows.ts` - Migration script
- `WORKFLOW_MIGRATION.md` - Migration guide
- `DATA_STRUCTURE_EXTENSION_SUMMARY.md` - This file

### Modified:
- `prisma/schema.prisma` - Added optional workflow tracking fields

## Rollback Plan

If needed, the new fields can be ignored and the system will continue to work using the old approach (extracting from jsonData). No data is lost or modified in the migration - it's purely additive.

