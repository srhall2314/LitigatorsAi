/**
 * Examples of using the extended workflow system
 * 
 * These examples show how to integrate the new workflow tracking
 * into existing code while maintaining backward compatibility.
 */

import { PrismaClient } from "@prisma/client";
import { createWorkflowCheck, syncWorkflowFields, findLatestNormalWorkflowCheck } from "./workflow-utils";
import { CitationDocument } from "@/types/citation-json";

/**
 * Example 1: Creating a new check with workflow tracking
 * 
 * Replace existing CitationCheck.create() calls with createWorkflowCheck()
 * to automatically populate workflow fields.
 */
export async function exampleCreateCheck(
  prisma: PrismaClient,
  fileUploadId: string,
  userId: string,
  jsonData: CitationDocument
) {
  // Old way (still works):
  // const check = await prisma.citationCheck.create({ ... });
  
  // New way (automatically populates workflow fields):
  const check = await createWorkflowCheck(prisma, {
    fileUploadId,
    userId,
    workflowType: "standard",
    jsonData,
  });
  
  return check;
}

/**
 * Example 2: Updating jsonData and syncing workflow fields
 * 
 * After updating jsonData, optionally sync workflow fields to keep them in sync.
 */
export async function exampleUpdateJsonData(
  prisma: PrismaClient,
  checkId: string,
  updatedJsonData: CitationDocument
) {
  // Update jsonData
  await prisma.citationCheck.update({
    where: { id: checkId },
    data: { jsonData: updatedJsonData as any },
  });
  
  // Sync workflow fields (optional but recommended)
  await syncWorkflowFields(prisma, checkId);
}

/**
 * Example 3: Finding normal workflow checks
 * 
 * Use findLatestNormalWorkflowCheck() to get the latest check
 * from the standard workflow (not test runs or heavy analysis).
 */
export async function exampleFindNormalCheck(
  prisma: PrismaClient,
  fileUploadId: string
) {
  // This function works with both migrated and non-migrated records
  const check = await findLatestNormalWorkflowCheck(prisma, fileUploadId);
  
  if (check) {
    console.log("Found check:", check.id);
    console.log("Workflow type:", check.workflowType || "standard (from jsonData)");
    console.log("Citation count:", check.citationCount || check.jsonData?.document?.citations?.length);
  }
  
  return check;
}

/**
 * Example 4: Querying by workflow type
 * 
 * Use the new workflowType field for efficient queries.
 */
export async function exampleQueryByWorkflowType(
  prisma: PrismaClient,
  fileUploadId: string
) {
  // Find all test runs
  const testRuns = await prisma.citationCheck.findMany({
    where: {
      fileUploadId,
      workflowType: "test_run",
    },
    orderBy: { version: "asc" },
  });
  
  // Find all heavy analysis runs
  const heavyAnalysisRuns = await prisma.citationCheck.findMany({
    where: {
      fileUploadId,
      workflowType: "heavy_analysis",
    },
    orderBy: { version: "asc" },
  });
  
  return { testRuns, heavyAnalysisRuns };
}

/**
 * Example 5: Checking workflow state
 * 
 * Use workflow utilities to check workflow state.
 */
export async function exampleCheckWorkflowState(
  prisma: PrismaClient,
  checkId: string
) {
  const check = await prisma.citationCheck.findUnique({
    where: { id: checkId },
  });
  
  if (!check) return null;
  
  // Import workflow utilities
  const { getWorkflowType, isNormalWorkflow } = await import("./workflow-utils");
  const { isStepCompleted, getNextStep, isWorkflowComplete } = await import("@/types/workflow");
  
  const workflowType = getWorkflowType(check);
  const isNormal = isNormalWorkflow(check);
  const completed = check.completedSteps || [];
  const nextStep = getNextStep(check as any);
  const isComplete = isWorkflowComplete(check as any);
  
  return {
    workflowType,
    isNormal,
    completedSteps: completed,
    currentStep: check.currentStep,
    nextStep,
    isComplete,
  };
}

