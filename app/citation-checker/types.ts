export type WorkflowStep = 
  | "upload"
  | "generate-json"
  | "identify-citations"
  | "validate-citations"
  | "review-discrepancies"
  | "finalize-document"
  | "citations-report"
  | "full-analysis"
  | "document-review"

export type AccessLevel = 'owner' | 'edit' | 'view' | 'route' | null

export interface DocumentShare {
  id: string
  fileUploadId: string
  sharedWithId: string
  sharedById: string
  permission: 'view' | 'edit' | 'route'
  routedFromId?: string | null
  routedAt?: string | null
  createdAt: string
  sharedWith?: {
    id: string
    name: string | null
    email: string
  }
  sharedBy?: {
    id: string
    name: string | null
    email: string
  }
  routedFrom?: {
    id: string
    name: string | null
    email: string
  } | null
}

export interface FileUpload {
  id: string
  filename: string
  originalName: string
  fileSize: number
  mimeType: string
  blobUrl: string | null
  createdAt: string
  // Case assignment fields (optional for backward compatibility)
  caseId?: string | null
  legalDocumentType?: string | null
  filedByOrganization?: string | null
  citationChecks: CitationCheck[]
  standardWorkflowCheck?: CitationCheck | null // Latest standard workflow check with validation
  accessLevel?: AccessLevel // User's access level for this file
  shares?: DocumentShare[] // Shares for this file (if user has access)
  case?: Case | null
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
  // Assignment tracking for soft routing
  assignedToId?: string | null
  assignedAt?: string | null
  assignedTo?: {
    id: string
    name: string | null
    email: string
  } | null
}

export interface Case {
  id: string
  name: string
  description: string | null
  ownerId: string
  status: string | null
  metadata: any | null
  createdAt: string
  updatedAt: string
  owner?: {
    id: string
    name: string | null
    email: string
  }
  documents?: FileUpload[]
  members?: CaseMember[]
  _count?: {
    documents: number
    members: number
  }
}

export interface CaseMember {
  id: string
  caseId: string
  userId: string
  role: string
  addedAt: string
  addedById: string | null
  user?: {
    id: string
    name: string | null
    email: string
  }
  addedBy?: {
    id: string
    name: string | null
    email: string
  } | null
}

