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
    }
    return stepPathMap[step] || "#"
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = step.id === currentStep
          const isCompleted = completedSteps.has(step.id)
          const isAccessible = index === 0 || completedSteps.has(steps[index - 1].id)
          const stepPath = getStepPath(step.id)

          const stepContent = (
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium mb-2 ${
                  isCompleted
                    ? "bg-green-600 text-white"
                    : isActive
                    ? "bg-indigo-600 text-white"
                    : isAccessible
                    ? "bg-gray-200 text-gray-600 hover:bg-gray-300"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isCompleted ? "✓" : index + 1}
              </div>
              <div className="text-center">
                <div
                  className={`text-xs font-medium ${
                    isActive ? "text-indigo-600" : "text-gray-500"
                  }`}
                >
                  {step.title}
                </div>
              </div>
            </div>
          )

          return (
            <div key={step.id} className="flex items-center flex-1">
              {isAccessible && stepPath !== "#" ? (
                <Link href={stepPath} className="flex flex-col items-center flex-1">
                  {stepContent}
                </Link>
              ) : (
                <div className="flex flex-col items-center flex-1">
                  {stepContent}
                </div>
              )}
              {index < steps.length - 1 && (
                <div
                  className={`h-1 flex-1 mx-2 ${
                    isCompleted ? "bg-green-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

