export type WorkflowStep = 
  | "upload"
  | "generate-json"
  | "identify-citations"
  | "validate-citations"
  | "review-discrepancies"
  | "citations-report"

export interface FileUpload {
  id: string
  filename: string
  originalName: string
  fileSize: number
  mimeType: string
  blobUrl: string | null
  createdAt: string
  citationChecks: CitationCheck[]
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
}

