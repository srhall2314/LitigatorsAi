/**
 * Workflow Type Definitions
 * 
 * Extended type definitions for the new workflow tracking system
 */

import { CitationCheck } from "@prisma/client";
import { CitationDocument } from "./citation-json";

export type WorkflowType = "standard" | "test_run" | "heavy_analysis" | "custom";

export type WorkflowStep = 
  | "upload"
  | "generate-json"
  | "identify-citations"
  | "validate-citations"
  | "review-discrepancies"
  | "citations-report"
  | "full-analysis"
  | "document-review"
  | "heavy-analysis"
  | "test-run";

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
 * Extended CitationCheck with workflow tracking
 */
export interface CitationCheckWithWorkflow extends CitationCheck {
  workflowType: WorkflowType | null;
  workflowId: string | null;
  workflowStep: string | null;
  workflowMetadata: WorkflowMetadata | null;
  documentMetadata: any | null;
  citationCount: number | null;
  identificationMethod: string | null;
  completedSteps: string[];
  currentStep: string | null;
}

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  type: WorkflowType;
  steps: WorkflowStep[];
  metadata?: WorkflowMetadata;
}

/**
 * Standard workflow configuration
 */
export const STANDARD_WORKFLOW: WorkflowConfig = {
  type: "standard",
  steps: [
    "upload",
    "generate-json",
    "identify-citations",
    "validate-citations",
    "review-discrepancies",
    "citations-report",
    "full-analysis",
    "document-review",
  ],
};

/**
 * Test run workflow configuration
 */
export const TEST_RUN_WORKFLOW: WorkflowConfig = {
  type: "test_run",
  steps: [
    "upload",
    "generate-json",
    "identify-citations",
    "validate-citations",
    "test-run",
  ],
};

/**
 * Heavy analysis workflow configuration
 */
export const HEAVY_ANALYSIS_WORKFLOW: WorkflowConfig = {
  type: "heavy_analysis",
  steps: [
    "upload",
    "generate-json",
    "identify-citations",
    "heavy-analysis",
  ],
};

/**
 * Get workflow configuration by type
 */
export function getWorkflowConfig(type: WorkflowType): WorkflowConfig {
  switch (type) {
    case "standard":
      return STANDARD_WORKFLOW;
    case "test_run":
      return TEST_RUN_WORKFLOW;
    case "heavy_analysis":
      return HEAVY_ANALYSIS_WORKFLOW;
    default:
      return STANDARD_WORKFLOW;
  }
}

/**
 * Check if a step is completed
 */
export function isStepCompleted(
  check: CitationCheckWithWorkflow,
  step: WorkflowStep
): boolean {
  return check.completedSteps.includes(step);
}

/**
 * Get next step in workflow
 */
export function getNextStep(
  check: CitationCheckWithWorkflow
): WorkflowStep | null {
  if (!check.workflowType) {
    return null;
  }
  
  const config = getWorkflowConfig(check.workflowType);
  const currentIndex = check.currentStep
    ? config.steps.indexOf(check.currentStep as WorkflowStep)
    : -1;
  
  if (currentIndex < 0 || currentIndex >= config.steps.length - 1) {
    return null;
  }
  
  return config.steps[currentIndex + 1];
}

/**
 * Check if workflow is complete
 */
export function isWorkflowComplete(
  check: CitationCheckWithWorkflow
): boolean {
  if (!check.workflowType) {
    return false;
  }
  
  const config = getWorkflowConfig(check.workflowType);
  return config.steps.every(step => isStepCompleted(check, step));
}

