"use client"

import Link from "next/link"
import { WorkflowStep } from "../types"

interface StepProgressProps {
  currentStep: WorkflowStep
  completedSteps: Set<WorkflowStep>
  fileId?: string | null
}

const steps: Array<{ id: WorkflowStep; title: string; path: string }> = [
  { id: "upload", title: "Upload File", path: "/citation-checker" },
  { id: "generate-json", title: "Generate JSON", path: "/citation-checker/[fileId]/generate-json" },
  { id: "identify-citations", title: "Identify Citations", path: "/citation-checker/[fileId]/identify-citations" },
  { id: "validate-citations", title: "Validate Citations", path: "/citation-checker/[fileId]/validate-citations" },
  { id: "review-discrepancies", title: "Review Discrepancies", path: "/citation-checker/[fileId]/review-discrepancies" },
  { id: "citations-report", title: "Citations Report", path: "/citation-checker/[fileId]/report" },
  { id: "full-analysis", title: "Full Analysis", path: "/citation-checker/[fileId]/full-analysis" },
  { id: "document-review", title: "Document Review", path: "/citation-checker/[fileId]/document-review" },
]

export function StepProgress({ currentStep, completedSteps, fileId }: StepProgressProps) {
  const getStepPath = (step: WorkflowStep) => {
    if (step === "upload") return "/citation-checker"
    if (!fileId) return "#"
    const stepPathMap: Record<WorkflowStep, string> = {
      "upload": "/citation-checker",
      "generate-json": `/citation-checker/${fileId}/generate-json`,
      "identify-citations": `/citation-checker/${fileId}/identify-citations`,
      "validate-citations": `/citation-checker/${fileId}/validate-citations`,
      "review-discrepancies": `/citation-checker/${fileId}/review-discrepancies`,
      "citations-report": `/citation-checker/${fileId}/report`,
      "full-analysis": `/citation-checker/${fileId}/full-analysis`,
      "document-review": `/citation-checker/${fileId}/document-review`,
    }
    return stepPathMap[step] || "#"
  }

  // Find current step index
  const currentIndex = steps.findIndex(step => step.id === currentStep)
  
  // Calculate visible range: show 3 before, current, and 3 after
  const beforeCount = 3
  const afterCount = 3
  const startIndex = Math.max(0, currentIndex - beforeCount)
  const endIndex = Math.min(steps.length - 1, currentIndex + afterCount)
  const visibleSteps = steps.slice(startIndex, endIndex + 1)
  
  const hasStepsBefore = startIndex > 0
  const hasStepsAfter = endIndex < steps.length - 1

  const renderStep = (step: { id: WorkflowStep; title: string; path: string }, index: number, globalIndex: number) => {
    const isActive = step.id === currentStep
    const isCompleted = completedSteps.has(step.id)
    const isAccessible = globalIndex === 0 || completedSteps.has(steps[globalIndex - 1].id)
    const stepPath = getStepPath(step.id)

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
          {isCompleted ? "✓" : globalIndex + 1}
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

