/**
 * Workflow Migration Utilities
 * 
 * This module provides utilities to migrate existing CitationCheck records
 * to the new extended schema with workflow tracking fields.
 * 
 * All functions are non-destructive and can be run multiple times safely.
 */

import { PrismaClient } from "@prisma/client";
import { CitationDocument, CitationMetadata } from "@/types/citation-json";

export type WorkflowType = "standard" | "test_run" | "heavy_analysis" | "custom";

export interface WorkflowMetadata {
  // Test run metadata
  testRunNumber?: number;
  testRunTotal?: number;
  testConfiguration?: Record<string, any>;
  
  // Heavy analysis metadata
  runNumber?: number;
  runTotal?: number;
  model?: string;
  provider?: string;
  
  // Custom metadata
  [key: string]: any;
}

/**
 * Extract workflow information from existing jsonData
 */
export function extractWorkflowFromJsonData(
  jsonData: any,
  checkId: string
): {
  workflowType: WorkflowType;
  workflowId: string | null;
  workflowStep: string | null;
  workflowMetadata: WorkflowMetadata | null;
  documentMetadata: CitationMetadata | null;
  citationCount: number | null;
  identificationMethod: string | null;
  completedSteps: string[];
  currentStep: string | null;
} {
  const metadata = jsonData?.document?.metadata as CitationMetadata | undefined;
  
  // Determine workflow type
  let workflowType: WorkflowType = "standard";
  let workflowId: string | null = null;
  let workflowMetadata: WorkflowMetadata | null = null;
  
  if (metadata?.testRunId) {
    workflowType = "test_run";
    workflowId = metadata.testRunId;
    workflowMetadata = {
      testRunNumber: metadata.testRunNumber,
      testRunTotal: metadata.testRunTotal,
    };
  } else if (metadata?.heavyAnalysisRunId) {
    workflowType = "heavy_analysis";
    workflowId = metadata.heavyAnalysisRunId;
    workflowMetadata = {
      runNumber: metadata.heavyAnalysisRunNumber,
      runTotal: metadata.heavyAnalysisRunTotal,
    };
  } else {
    // Standard workflow - use check ID as workflow ID for grouping
    workflowId = checkId;
  }
  
  // Extract document metadata
  const documentMetadata = metadata || null;
  
  // Count citations
  const citationCount = jsonData?.document?.citations?.length || null;
  
  // Get identification method
  const identificationMethod = metadata?.identificationMethod || null;
  
  // Determine workflow step and completed steps from status and data
  const completedSteps: string[] = ["upload"];
  let currentStep: string | null = null;
  
  if (jsonData?.document) {
    completedSteps.push("generate-json");
    
    if (jsonData.document.citations && jsonData.document.citations.length > 0) {
      completedSteps.push("identify-citations");
      
      // Check if citations have validation data
      const hasValidation = jsonData.document.citations.some((c: any) => 
        c.validation || c.tier_2 || c.tier_3
      );
      
      if (hasValidation) {
        completedSteps.push("validate-citations");
        currentStep = "review-discrepancies";
      } else {
        currentStep = "validate-citations";
      }
    } else {
      currentStep = "identify-citations";
    }
  } else {
    currentStep = "generate-json";
  }
  
  return {
    workflowType,
    workflowId,
    workflowStep: currentStep,
    workflowMetadata,
    documentMetadata,
    citationCount,
    identificationMethod,
    completedSteps,
    currentStep,
  };
}

/**
 * Migrate a single CitationCheck record
 */
export async function migrateCitationCheck(
  prisma: PrismaClient,
  checkId: string
): Promise<{
  migrated: boolean;
  check: any;
}> {
  const check = await prisma.citationCheck.findUnique({
    where: { id: checkId },
  });
  
  if (!check) {
    throw new Error(`CitationCheck not found: ${checkId}`);
  }
  
  // Skip if already migrated (has workflowType)
  if (check.workflowType) {
    return { migrated: false, check };
  }
  
  // Skip if no jsonData
  if (!check.jsonData) {
    return { migrated: false, check };
  }
  
  // Extract workflow information
  const workflowData = extractWorkflowFromJsonData(check.jsonData, check.id);
  
  // Update the check with extracted data
  const updated = await prisma.citationCheck.update({
    where: { id: checkId },
    data: {
      workflowType: workflowData.workflowType,
      workflowId: workflowData.workflowId,
      workflowStep: workflowData.workflowStep,
      workflowMetadata: workflowData.workflowMetadata as any,
      documentMetadata: workflowData.documentMetadata as any,
      citationCount: workflowData.citationCount,
      identificationMethod: workflowData.identificationMethod,
      completedSteps: workflowData.completedSteps,
      currentStep: workflowData.currentStep,
    },
  });
  
  return { migrated: true, check: updated };
}

/**
 * Migrate all CitationCheck records for a specific file
 */
export async function migrateFileChecks(
  prisma: PrismaClient,
  fileUploadId: string
): Promise<{
  total: number;
  migrated: number;
  skipped: number;
}> {
  const checks = await prisma.citationCheck.findMany({
    where: { fileUploadId },
  });
  
  let migrated = 0;
  let skipped = 0;
  
  for (const check of checks) {
    try {
      const result = await migrateCitationCheck(prisma, check.id);
      if (result.migrated) {
        migrated++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`Error migrating check ${check.id}:`, error);
      skipped++;
    }
  }
  
  return {
    total: checks.length,
    migrated,
    skipped,
  };
}

/**
 * Migrate all CitationCheck records (use with caution in production)
 */
export async function migrateAllChecks(
  prisma: PrismaClient,
  batchSize: number = 100
): Promise<{
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
}> {
  let total = 0;
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  let cursor: string | undefined = undefined;
  
  while (true) {
    const checks: any[] = await prisma.citationCheck.findMany({
      take: batchSize,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { createdAt: "asc" },
    });
    
    if (checks.length === 0) {
      break;
    }
    
    for (const check of checks) {
      total++;
      try {
        const result = await migrateCitationCheck(prisma, check.id);
        if (result.migrated) {
          migrated++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error migrating check ${check.id}:`, error);
        errors++;
      }
    }
    
    cursor = checks[checks.length - 1].id;
    
    // Log progress
    console.log(`Migration progress: ${total} processed, ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
  }
  
  return {
    total,
    migrated,
    skipped,
    errors,
  };
}

/**
 * Sync workflow fields from jsonData (useful for keeping data in sync)
 */
export async function syncWorkflowFromJsonData(
  prisma: PrismaClient,
  checkId: string
): Promise<void> {
  const check = await prisma.citationCheck.findUnique({
    where: { id: checkId },
  });
  
  if (!check || !check.jsonData) {
    return;
  }
  
  const workflowData = extractWorkflowFromJsonData(check.jsonData, check.id);
  
  await prisma.citationCheck.update({
    where: { id: checkId },
    data: {
      workflowType: workflowData.workflowType,
      workflowId: workflowData.workflowId,
      workflowStep: workflowData.workflowStep,
      workflowMetadata: workflowData.workflowMetadata as any,
      documentMetadata: workflowData.documentMetadata as any,
      citationCount: workflowData.citationCount,
      identificationMethod: workflowData.identificationMethod,
      completedSteps: workflowData.completedSteps,
      currentStep: workflowData.currentStep,
    },
  });
}

