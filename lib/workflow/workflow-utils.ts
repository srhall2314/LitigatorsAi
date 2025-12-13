/**
 * Workflow Utilities
 * 
 * Helper functions for working with the extended workflow system.
 * Provides backward compatibility with existing code.
 */

import { PrismaClient } from "@prisma/client";
import { CitationCheckWithWorkflow, WorkflowType, WorkflowStep } from "@/types/workflow";
import { CitationDocument } from "@/types/citation-json";
import { extractWorkflowFromJsonData } from "../migration/workflow-migration";

/**
 * Get workflow type from check (with fallback to jsonData)
 */
export function getWorkflowType(check: any): WorkflowType {
  if (check.workflowType) {
    return check.workflowType as WorkflowType;
  }
  
  // Fallback: extract from jsonData
  if (check.jsonData) {
    const metadata = check.jsonData?.document?.metadata;
    if (metadata?.testRunId) {
      return "test_run";
    }
    if (metadata?.heavyAnalysisRunId) {
      return "heavy_analysis";
    }
  }
  
  return "standard";
}

/**
 * Get workflow ID from check (with fallback to jsonData)
 */
export function getWorkflowId(check: any): string | null {
  if (check.workflowId) {
    return check.workflowId;
  }
  
  // Fallback: extract from jsonData
  if (check.jsonData) {
    const metadata = check.jsonData?.document?.metadata;
    return metadata?.testRunId || metadata?.heavyAnalysisRunId || check.id;
  }
  
  return check.id;
}

/**
 * Check if check is from normal workflow (not test run or heavy analysis)
 */
export function isNormalWorkflow(check: any): boolean {
  const workflowType = getWorkflowType(check);
  return workflowType === "standard";
}

/**
 * Check if check is from test run
 */
export function isTestRun(check: any): boolean {
  const workflowType = getWorkflowType(check);
  return workflowType === "test_run";
}

/**
 * Check if check is from heavy analysis
 */
export function isHeavyAnalysis(check: any): boolean {
  const workflowType = getWorkflowType(check);
  return workflowType === "heavy_analysis";
}

/**
 * Get all checks for a workflow group
 */
export async function getWorkflowChecks(
  prisma: PrismaClient,
  workflowId: string,
  workflowType?: WorkflowType
): Promise<any[]> {
  const where: any = {};
  
  if (workflowType) {
    where.workflowType = workflowType;
    where.workflowId = workflowId;
  } else {
    // Try to find by workflowId first, then fallback to checking jsonData
    where.OR = [
      { workflowId },
      {
        jsonData: {
          path: ["document", "metadata", "testRunId"],
          equals: workflowId,
        },
      },
      {
        jsonData: {
          path: ["document", "metadata", "heavyAnalysisRunId"],
          equals: workflowId,
        },
      },
    ];
  }
  
  return prisma.citationCheck.findMany({
    where,
    orderBy: { version: "asc" },
  });
}

/**
 * Update workflow fields when jsonData changes
 * Call this after updating jsonData to keep workflow fields in sync
 */
export async function syncWorkflowFields(
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

/**
 * Create a new check with workflow tracking
 */
export async function createWorkflowCheck(
  prisma: PrismaClient,
  data: {
    fileUploadId: string;
    userId: string;
    workflowType: WorkflowType;
    workflowId?: string;
    workflowMetadata?: any;
    jsonData?: CitationDocument;
  }
): Promise<any> {
  // Get next version
  const latestCheck = await prisma.citationCheck.findFirst({
    where: { fileUploadId: data.fileUploadId },
    orderBy: { version: "desc" },
  });
  
  const version = latestCheck ? latestCheck.version + 1 : 1;
  
  // Extract workflow data if jsonData provided
  let workflowData: any = {
    workflowType: data.workflowType,
    workflowId: data.workflowId || null,
    workflowMetadata: data.workflowMetadata || null,
  };
  
  if (data.jsonData) {
    const extracted = extractWorkflowFromJsonData(data.jsonData, "temp");
    workflowData = {
      ...workflowData,
      workflowId: data.workflowId || extracted.workflowId,
      workflowStep: extracted.workflowStep,
      documentMetadata: extracted.documentMetadata,
      citationCount: extracted.citationCount,
      identificationMethod: extracted.identificationMethod,
      completedSteps: extracted.completedSteps,
      currentStep: extracted.currentStep,
    };
  }
  
  return prisma.citationCheck.create({
    data: {
      fileUploadId: data.fileUploadId,
      userId: data.userId,
      version,
      status: "uploaded",
      jsonData: data.jsonData as any,
      ...workflowData,
    },
  });
}

/**
 * Mark a workflow step as completed
 */
export async function markStepCompleted(
  prisma: PrismaClient,
  checkId: string,
  step: WorkflowStep
): Promise<void> {
  const check = await prisma.citationCheck.findUnique({
    where: { id: checkId },
  });
  
  if (!check) {
    throw new Error(`CitationCheck not found: ${checkId}`);
  }
  
  const completedSteps = check.completedSteps || [];
  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }
  
  // Update current step to next step
  const workflowType = getWorkflowType(check);
  const { getWorkflowConfig } = await import("@/types/workflow");
  const config = getWorkflowConfig(workflowType);
  const currentIndex = config.steps.indexOf(step);
  const nextStep = currentIndex < config.steps.length - 1
    ? config.steps[currentIndex + 1]
    : null;
  
  await prisma.citationCheck.update({
    where: { id: checkId },
    data: {
      completedSteps,
      currentStep: nextStep,
    },
  });
}

/**
 * Find the latest normal workflow check for a file
 */
export async function findLatestNormalWorkflowCheck(
  prisma: PrismaClient,
  fileUploadId: string
): Promise<any | null> {
  // First try to find using workflowType field
  const checkWithWorkflowType = await prisma.citationCheck.findFirst({
    where: {
      fileUploadId,
      workflowType: "standard",
    },
    orderBy: { version: "desc" },
  });
  
  if (checkWithWorkflowType) {
    return checkWithWorkflowType;
  }
  
  // Fallback: find by checking jsonData
  const allChecks = await prisma.citationCheck.findMany({
    where: { fileUploadId },
    orderBy: { version: "desc" },
  });
  
  for (const check of allChecks) {
    if (isNormalWorkflow(check)) {
      return check;
    }
  }
  
  return null;
}

