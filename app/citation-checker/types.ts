export type WorkflowStep = 
  | "upload"
  | "generate-json"
  | "identify-citations"
  | "validate-citations"
  | "review-discrepancies"
  | "citations-report"
  | "full-analysis"
  | "document-review"

export interface FileUpload {
  id: string
  filename: string
  originalName: string
  fileSize: number
  mimeType: string
  blobUrl: string | null
  createdAt: string
  citationChecks: CitationCheck[]
  standardWorkflowCheck?: CitationCheck | null // Latest standard workflow check with validation
  user?: {
    id: string
    name: string | null
    email: string
  }
}

export interface CitationCheck {
  id: string
  fileUploadId: string
  version: number
  status: string
  jsonData: any | null
  // Workflow tracking fields (optional for backward compatibility)
  workflowType?: string | null
  workflowId?: string | null
  workflowStep?: string | null
  workflowMetadata?: any | null
  documentMetadata?: any | null
  citationCount?: number | null
  identificationMethod?: string | null
  completedSteps?: string[]
  currentStep?: string | null
}

