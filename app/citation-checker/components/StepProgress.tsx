"use client"

import Link from "next/link"
import { WorkflowStep } from "../types"

interface StepProgressProps {
  currentStep: WorkflowStep
  completedSteps: Set<WorkflowStep>
  fileId?: string | null
}

// Simplified workflow steps - main user-facing steps
const mainSteps: Array<{ id: WorkflowStep; title: string; path: string }> = [
  { id: "upload", title: "Upload/Create Document", path: "/citation-checker" },
  { id: "validate-citations", title: "Validate Citations", path: "/citation-checker/[fileId]/run-citation-checker" }, // Using validate-citations as the consolidated step ID
  { id: "document-review", title: "Review Citations", path: "/citation-checker/[fileId]/document-review" },
  { id: "finalize-document", title: "Finalize Document", path: "/citation-checker/[fileId]/finalize-document" },
  { id: "citations-report", title: "Generate Report", path: "/citation-checker/[fileId]/report" },
]

// Legacy steps for backward compatibility (mapped to main steps)
const legacyStepMap: Record<WorkflowStep, WorkflowStep> = {
  "upload": "upload",
  "generate-json": "validate-citations", // Map to validate citations
  "identify-citations": "validate-citations", // Map to validate citations
  "validate-citations": "validate-citations",
  "review-discrepancies": "document-review", // Map to document review
  "finalize-document": "finalize-document",
  "citations-report": "citations-report",
  "full-analysis": "full-analysis",
  "document-review": "document-review",
}

// Use main steps for display
const steps = mainSteps

export function StepProgress({ currentStep, completedSteps, fileId }: StepProgressProps) {
  // Map legacy steps to main steps for display
  const mappedCurrentStep = legacyStepMap[currentStep] || currentStep
  
  const getStepPath = (step: WorkflowStep) => {
    if (step === "upload") return "/citation-checker"
    if (!fileId) return "#"
    const stepPathMap: Record<WorkflowStep, string> = {
      "upload": "/citation-checker",
      "generate-json": `/citation-checker/${fileId}/run-citation-checker`, // Redirect to unified page
      "identify-citations": `/citation-checker/${fileId}/run-citation-checker`, // Redirect to unified page
      "validate-citations": `/citation-checker/${fileId}/run-citation-checker`, // Unified pipeline page
      "review-discrepancies": `/citation-checker/${fileId}/document-review`, // Map to document review
      "finalize-document": `/citation-checker/${fileId}/finalize-document`,
      "citations-report": `/citation-checker/${fileId}/report`,
      "full-analysis": `/citation-checker/${fileId}/full-analysis`,
      "document-review": `/citation-checker/${fileId}/document-review`,
    }
    return stepPathMap[step] || "#"
  }

  // Map completed steps to main steps
  const mappedCompletedSteps = new Set<WorkflowStep>()
  completedSteps.forEach(step => {
    const mapped = legacyStepMap[step] || step
    mappedCompletedSteps.add(mapped)
    // Also mark legacy steps as completed if their mapped step is completed
    if (mapped !== step) {
      mappedCompletedSteps.add(step)
    }
  })

  // Find current step index (use mapped step)
  const currentIndex = steps.findIndex(step => step.id === mappedCurrentStep)
  
  // Calculate visible range: show 3 before, current, and 3 after
  const beforeCount = 3
  const afterCount = 3
  const startIndex = Math.max(0, currentIndex - beforeCount)
  const endIndex = Math.min(steps.length - 1, currentIndex + afterCount)
  const visibleSteps = steps.slice(startIndex, endIndex + 1)
  
  const hasStepsBefore = startIndex > 0
  const hasStepsAfter = endIndex < steps.length - 1

  const renderStep = (step: { id: WorkflowStep; title: string; path: string }, index: number, globalIndex: number) => {
    const isActive = step.id === mappedCurrentStep
    const isCompleted = mappedCompletedSteps.has(step.id)
    const isAccessible = globalIndex === 0 || mappedCompletedSteps.has(steps[globalIndex - 1].id)
    const stepPath = getStepPath(step.id)
    
    // Step number is based on position in mainSteps array (1-indexed)
    const stepNumber = globalIndex + 1

    const stepContent = (
      <div className="flex flex-col items-center flex-1 min-w-0">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium mb-2 flex-shrink-0 ${
            isCompleted
              ? "bg-green-600 text-white"
              : isActive
              ? "bg-indigo-600 text-white"
              : isAccessible
              ? "bg-gray-200 text-gray-600 hover:bg-gray-300"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isCompleted ? "✓" : stepNumber}
        </div>
        <div className="text-center">
          <div
            className={`text-xs font-medium truncate max-w-[100px] ${
              isActive ? "text-indigo-600" : "text-gray-500"
            }`}
            title={step.title}
          >
            {step.title}
          </div>
        </div>
      </div>
    )

    return (
      <div key={step.id} className="flex items-center flex-1 min-w-0">
        {isAccessible && stepPath !== "#" ? (
          <Link href={stepPath} className="flex flex-col items-center flex-1 min-w-0">
            {stepContent}
          </Link>
        ) : (
          <div className="flex flex-col items-center flex-1 min-w-0">
            {stepContent}
          </div>
        )}
        {index < visibleSteps.length - 1 && (
          <div
            className={`h-1 flex-1 mx-2 min-w-[20px] ${
              isCompleted ? "bg-green-600" : "bg-gray-200"
            }`}
          />
        )}
      </div>
    )
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {/* Show ellipsis if there are steps before */}
        {hasStepsBefore && (
          <>
            <div className="flex flex-col items-center flex-shrink-0 mr-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium mb-2 bg-gray-100 text-gray-400">
                ...
              </div>
              <div className="text-center">
                <div className="text-xs font-medium text-gray-400">
                  {startIndex} more
                </div>
              </div>
            </div>
            <div className="h-1 w-4 mx-2 bg-gray-200 flex-shrink-0" />
          </>
        )}

        {/* Render visible steps */}
        {visibleSteps.map((step, localIndex) => {
          const globalIndex = startIndex + localIndex
          return renderStep(step, localIndex, globalIndex)
        })}

        {/* Show ellipsis if there are steps after */}
        {hasStepsAfter && (
          <>
            <div className="h-1 w-4 mx-2 bg-gray-200 flex-shrink-0" />
            <div className="flex flex-col items-center flex-shrink-0 ml-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium mb-2 bg-gray-100 text-gray-400">
                ...
              </div>
              <div className="text-center">
                <div className="text-xs font-medium text-gray-400">
                  {steps.length - endIndex - 1} more
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

