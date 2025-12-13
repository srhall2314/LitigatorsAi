# Workflow Migration Guide

This document describes the non-destructive migration to the extended workflow tracking system.

## Overview

The extended schema adds workflow tracking fields to the `CitationCheck` model while maintaining full backward compatibility with existing data and code.

## New Fields

All new fields are **optional** and **nullable**, ensuring existing records continue to work:

- `workflowType`: Type of workflow ("standard" | "test_run" | "heavy_analysis" | "custom")
- `workflowId`: UUID to group related checks
- `workflowStep`: Current step in workflow
- `workflowMetadata`: Workflow-specific metadata
- `documentMetadata`: Extracted document metadata (for querying)
- `citationCount`: Total citations count
- `identificationMethod`: Method used ("custom" | "eyecite")
- `completedSteps`: Array of completed step IDs
- `currentStep`: Current active step

## Migration Strategy

### Phase 1: Schema Update (✅ Done)

The Prisma schema has been extended with new optional fields. Run:

```bash
npx prisma migrate dev --name add_workflow_tracking
```

### Phase 2: Gradual Migration

Migrate records incrementally:

```bash
# Migrate a specific check
npx ts-node scripts/migrate-workflows.ts --check-id <check-id>

# Migrate all checks for a file
npx ts-node scripts/migrate-workflows.ts --file-id <file-id>

# Dry run to see what would be migrated
npx ts-node scripts/migrate-workflows.ts --file-id <file-id> --dry-run
```

### Phase 3: Update Code

The utility functions in `lib/workflow/workflow-utils.ts` provide backward compatibility:

```typescript
import { getWorkflowType, isNormalWorkflow } from "@/lib/workflow/workflow-utils";

// Works with both old and new records
const workflowType = getWorkflowType(check);
const isNormal = isNormalWorkflow(check);
```

### Phase 4: Auto-Sync (Optional)

For new records, use `createWorkflowCheck` which automatically populates workflow fields:

```typescript
import { createWorkflowCheck } from "@/lib/workflow/workflow-utils";

const check = await createWorkflowCheck(prisma, {
  fileUploadId: "...",
  userId: "...",
  workflowType: "standard",
  jsonData: citationDocument,
});
```

## Backward Compatibility

### Reading Data

All existing code continues to work. The utility functions provide fallbacks:

- `getWorkflowType()`: Checks `workflowType` field first, then extracts from `jsonData`
- `isNormalWorkflow()`: Uses workflow type to determine if it's a normal workflow
- `findLatestNormalWorkflowCheck()`: Finds normal workflow checks using new fields or fallback to jsonData

### Writing Data

When updating `jsonData`, optionally sync workflow fields:

```typescript
import { syncWorkflowFields } from "@/lib/workflow/workflow-utils";

// After updating jsonData
await prisma.citationCheck.update({
  where: { id: checkId },
  data: { jsonData: updatedJsonData },
});

// Sync workflow fields (optional but recommended)
await syncWorkflowFields(prisma, checkId);
```

## Benefits

1. **Query Efficiency**: Can query by `workflowType` and `workflowId` without parsing JSON
2. **Workflow Tracking**: Clear separation of workflow state from document data
3. **Multiple Workflows**: Support parallel workflows on same file
4. **History**: Track workflow progression over time
5. **Backward Compatible**: Existing records work without migration

## Example Queries

### Find all test runs for a file

```typescript
const testRuns = await prisma.citationCheck.findMany({
  where: {
    fileUploadId: fileId,
    workflowType: "test_run",
  },
  orderBy: { version: "asc" },
});
```

### Find latest normal workflow check

```typescript
import { findLatestNormalWorkflowCheck } from "@/lib/workflow/workflow-utils";

const check = await findLatestNormalWorkflowCheck(prisma, fileId);
```

### Get all checks in a workflow group

```typescript
import { getWorkflowChecks } from "@/lib/workflow/workflow-utils";

const checks = await getWorkflowChecks(prisma, workflowId, "test_run");
```

## Migration Checklist

- [ ] Run Prisma migration: `npx prisma migrate dev`
- [ ] Test migration script on a single check: `--check-id <id> --dry-run`
- [ ] Migrate a test file: `--file-id <id>`
- [ ] Update code to use workflow utilities where beneficial
- [ ] Gradually migrate all records (or migrate on-demand)
- [ ] Monitor for any issues

## Rollback

If needed, the new fields can be ignored and the system will continue to work using the old approach (extracting from jsonData). No data is lost or modified in the migration.

