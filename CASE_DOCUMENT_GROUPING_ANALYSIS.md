# Case/Document Grouping Analysis

## Executive Summary

This document analyzes options for implementing a "case" concept to group multiple documents together into a unified dataset. The analysis considers the current data structure, query patterns, access control, and scalability requirements.

## Current Data Structure

### Core Models

1. **FileUpload** - Represents a single document file
   - Owned by a User (`userId`)
   - Has multiple `CitationCheck` versions
   - Can be shared via `DocumentShare`
   - Currently no grouping mechanism at the file level

2. **CitationCheck** - Represents a version/run of citation checking
   - Belongs to a `FileUpload`
   - Has workflow grouping via `workflowId` and `workflowType`
   - Workflow grouping is at the **check level**, not the **file level**

3. **DocumentShare** - Handles sharing/routing between users
   - File-level sharing permissions
   - Supports routing workflows

### Current Grouping Mechanisms

- **Workflow Grouping** (CitationCheck level):
  - `workflowId`: Groups related checks (e.g., test runs, heavy analysis runs)
  - `workflowType`: "standard" | "test_run" | "heavy_analysis" | "custom"
  - This groups **checks**, not **files**

- **User Ownership** (FileUpload level):
  - Files belong to a single user
  - Sharing allows multi-user access

## Requirements Analysis

### Functional Requirements

1. **Case Creation**: Users should be able to create cases
2. **Document Assignment**: Documents (FileUploads) should be assignable to cases
3. **Case-Level Queries**: Query all documents in a case as a unified dataset *(Future - not needed now)*
4. **Case Metadata**: Cases should have metadata (name, description, status, etc.)
5. **Case Ownership**: Cases should have owners/managers
6. **Case Member Assignment**: People can be assigned to cases (enables case-level permissions)

### Non-Functional Requirements

1. **Access Control**: Case-level permissions via case membership
2. **Query Performance**: Efficient queries for case documents *(Future)*
3. **Backward Compatibility**: Existing documents should continue to work - **system must support documents with no case assigned**
4. **Scalability**: Support for cases with many documents
5. **Flexibility**: Consider if documents can belong to multiple cases

## Design Options

### Option 1: Simple Case Table (One-to-Many)

**Structure:**
```prisma
model Case {
  id          String   @id @default(uuid())
  name        String
  description String?
  ownerId     String   // User who created/owns the case
  status      String?  // "active" | "closed" | "archived"
  metadata    Json?    @db.JsonB // Additional case metadata
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  owner       User     @relation(fields: [ownerId], references: [id])
  documents   FileUpload[]
  
  @@index([ownerId])
  @@index([status])
}

model FileUpload {
  // ... existing fields ...
  caseId      String?  // Optional foreign key to Case
  case        Case?    @relation(fields: [caseId], references: [id], onDelete: SetNull)
  
  @@index([caseId])
}
```

**Pros:**
- ✅ Simple and straightforward
- ✅ Easy to query: `WHERE caseId = ?`
- ✅ Clear ownership model
- ✅ Minimal schema changes
- ✅ Documents can exist without a case (nullable)
- ✅ Efficient joins for case document queries

**Cons:**
- ❌ Documents can only belong to one case
- ❌ No case-level permissions (inherits from document ownership) - *Can be added with CaseMember model*
- ❌ Case deletion requires handling document reassignment

**Query Patterns:**
```typescript
// Get all documents in a case
const documents = await prisma.fileUpload.findMany({
  where: { caseId: caseId }
})

// Get case with all documents
const case = await prisma.case.findUnique({
  where: { id: caseId },
  include: { documents: true }
})
```

---

### Option 2: Many-to-Many with Junction Table

**Structure:**
```prisma
model Case {
  id          String   @id @default(uuid())
  name        String
  description String?
  ownerId     String
  status      String?
  metadata    Json?    @db.JsonB
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  owner       User     @relation(fields: [ownerId], references: [id])
  caseFiles   CaseFile[]
  
  @@index([ownerId])
  @@index([status])
}

model CaseFile {
  id          String   @id @default(uuid())
  caseId      String
  fileUploadId String
  addedById   String   // User who added document to case
  addedAt     DateTime @default(now())
  notes       String?  // Optional notes about this document in this case
  order       Int?     // Optional ordering within case
  
  case        Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  fileUpload  FileUpload @relation(fields: [fileUploadId], references: [id], onDelete: Cascade)
  addedBy     User     @relation(fields: [addedById], references: [id])
  
  @@unique([caseId, fileUploadId])
  @@index([caseId])
  @@index([fileUploadId])
}

model FileUpload {
  // ... existing fields ...
  caseFiles   CaseFile[]
}
```

**Pros:**
- ✅ Documents can belong to multiple cases
- ✅ Rich metadata at the relationship level (addedBy, addedAt, notes, order)
- ✅ Case deletion doesn't affect documents (cascade only on junction)
- ✅ Supports document ordering within cases
- ✅ Tracks who added documents to cases

**Cons:**
- ❌ More complex queries (requires join)
- ❌ Slightly more complex schema
- ❌ More storage overhead (junction table)
- ❌ Potential for duplicate document references

**Query Patterns:**
```typescript
// Get all documents in a case
const caseFiles = await prisma.caseFile.findMany({
  where: { caseId: caseId },
  include: { fileUpload: true },
  orderBy: { order: 'asc' }
})

// Get case with all documents
const case = await prisma.case.findUnique({
  where: { id: caseId },
  include: {
    caseFiles: {
      include: { fileUpload: true },
      orderBy: { order: 'asc' }
    }
  }
})
```

---

### Option 3: Case with Access Control

**Structure:**
```prisma
model Case {
  id          String   @id @default(uuid())
  name        String
  description String?
  ownerId     String
  status      String?
  metadata    Json?    @db.JsonB
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  owner       User     @relation("CaseOwner", fields: [ownerId], references: [id])
  documents   FileUpload[]
  members     CaseMember[]  // Case-level access control
  shares      CaseShare[]   // Case-level sharing
  
  @@index([ownerId])
  @@index([status])
}

model CaseMember {
  id          String   @id @default(uuid())
  caseId      String
  userId      String
  role        String   // "owner" | "editor" | "viewer"
  addedAt     DateTime @default(now())
  
  case        Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([caseId, userId])
  @@index([caseId])
  @@index([userId])
}

model CaseShare {
  id          String   @id @default(uuid())
  caseId      String
  sharedWithId String
  sharedById  String
  permission  String   // "view" | "edit"
  createdAt   DateTime @default(now())
  
  case        Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  sharedWith  User     @relation("CaseSharedWith", fields: [sharedWithId], references: [id], onDelete: Cascade)
  sharedBy    User     @relation("CaseSharedBy", fields: [sharedById], references: [id], onDelete: Cascade)
  
  @@unique([caseId, sharedWithId])
  @@index([caseId])
  @@index([sharedWithId])
}

model FileUpload {
  // ... existing fields ...
  caseId      String?
  case        Case?    @relation(fields: [caseId], references: [id], onDelete: SetNull)
}
```

**Pros:**
- ✅ Case-level access control independent of document ownership
- ✅ Team collaboration on cases
- ✅ Case sharing separate from document sharing
- ✅ Supports case-level permissions

**Cons:**
- ❌ Most complex option
- ❌ Need to reconcile case permissions with document permissions
- ❌ More tables to maintain
- ❌ Potential for permission conflicts

**Query Patterns:**
```typescript
// Get accessible cases for user
const cases = await prisma.case.findMany({
  where: {
    OR: [
      { ownerId: userId },
      { members: { some: { userId } } },
      { shares: { some: { sharedWithId: userId } } }
    ]
  }
})
```

---

### Option 4: Leverage Existing Workflow Structure (Not Recommended)

**Approach:** Use `workflowId` at the FileUpload level

**Analysis:**
- ❌ `workflowId` is semantically for grouping **checks**, not **files**
- ❌ Would require significant refactoring
- ❌ Doesn't align with case concept (cases are persistent, workflows are transient)
- ❌ Would break existing workflow grouping logic

**Verdict:** Not suitable for case/document grouping

---

## Comparison Matrix

| Feature | Option 1: Simple | Option 2: Many-to-Many | Option 3: With Access Control |
|---------|------------------|------------------------|-------------------------------|
| **Complexity** | Low | Medium | High |
| **Multi-case documents** | ❌ | ✅ | ✅ (if using M:M) |
| **Query simplicity** | ✅ | Medium | Medium |
| **Relationship metadata** | ❌ | ✅ | ✅ |
| **Case-level permissions** | ❌ | ❌ | ✅ |
| **Backward compatibility** | ✅ | ✅ | ✅ |
| **Storage overhead** | Low | Medium | High |
| **Implementation effort** | Low | Medium | High |

## Recommendations

### Primary Recommendation: **Option 1 (Simple Case Table)**

**Rationale:**
1. **Simplicity**: Easiest to implement and maintain
2. **Performance**: Direct foreign key relationship enables efficient queries
3. **Sufficient**: Most use cases don't require documents in multiple cases
4. **Backward Compatible**: Nullable `caseId` means existing documents work unchanged
5. **Extensible**: Can evolve to Option 2 or 3 if needed later

**When to Consider Option 2:**
- If documents truly need to belong to multiple cases
- If you need relationship-level metadata (who added, when, notes)
- If document ordering within cases is important

**When to Consider Option 3:**
- If case-level collaboration is a primary requirement
- If case permissions need to be independent of document ownership
- If cases are shared entities managed by teams

### Implementation Considerations

#### For Option 1 (Recommended):

1. **Case Metadata Fields:**
   ```prisma
   model Case {
     id          String   @id @default(uuid())
     name        String
     description String?
     ownerId     String
     status      String?  @default("active") // "active" | "closed" | "archived"
     metadata    Json?    @db.JsonB // Flexible metadata storage
     createdAt   DateTime @default(now())
     updatedAt   DateTime @updatedAt
   }
   ```

2. **Migration Strategy:**
   - Add `caseId` as nullable to `FileUpload`
   - Create `Case` table
   - Existing documents remain unassigned (caseId = null)
   - No data migration required

3. **Query Patterns:**
   ```typescript
   // Get all documents in a case with their checks
   const caseWithDocuments = await prisma.case.findUnique({
     where: { id: caseId },
     include: {
       documents: {
         include: {
           citationChecks: {
             where: { workflowType: "standard" },
             orderBy: { version: "desc" },
             take: 1
           }
         }
       }
     }
   })
   
   // Get all cases for a user
   const userCases = await prisma.case.findMany({
     where: { ownerId: userId },
     include: {
       _count: { select: { documents: true } }
     }
   })
   ```

4. **Access Control:**
   - Case ownership inherits from document ownership
   - Users can only add documents they own to cases
   - Case owner can see all documents in case (if they have access to documents)
   - Consider: Should case owner get access to all documents, or only documents they already have access to?

5. **Case Deletion:**
   - Use `onDelete: SetNull` so documents remain but are unassigned
   - Or use `onDelete: Restrict` to prevent deletion if case has documents
   - Consider soft delete with status field

#### Future Enhancements (if needed):

1. **Case Members** (evolve to Option 3):
   - Add `CaseMember` table later
   - Allows case-level collaboration

2. **Case Sharing**:
   - Add `CaseShare` table similar to `DocumentShare`
   - Enables sharing entire cases

3. **Case Templates**:
   - Add `templateId` to Case
   - Pre-populate case structure

## Integration with Existing Systems

### Workflow System
- Cases are **orthogonal** to workflows
- A case contains documents
- Each document can have multiple checks with different workflows
- Case-level analysis could aggregate across all documents in a case

### Sharing System
- Document sharing (`DocumentShare`) remains unchanged
- Cases don't automatically share documents
- Consider: Should case sharing grant access to all documents in the case?

### Access Control
- Current access control is at the document level
- Cases add a grouping layer but don't change document permissions
- Recommendation: Keep document-level permissions, cases are organizational only

## Performance Considerations

### Option 1 (Simple):
- **Indexes needed:**
  - `FileUpload.caseId` (for case document queries)
  - `Case.ownerId` (for user case queries)
  - `Case.status` (if filtering by status)

- **Query performance:**
  - Direct foreign key = efficient joins
  - Single table query for case documents
  - No junction table overhead

### Option 2 (Many-to-Many):
- **Indexes needed:**
  - `CaseFile.caseId` and `CaseFile.fileUploadId`
  - Composite index on `[caseId, fileUploadId]`

- **Query performance:**
  - Requires join through junction table
  - Slightly more complex but still efficient with proper indexes

## Conclusion

**Recommended Approach: Option 1 (Simple Case Table)**

This provides the best balance of simplicity, performance, and functionality for most use cases. It can be extended later if requirements evolve (e.g., to Option 2 for multi-case documents or Option 3 for case-level permissions).

The key design decision is whether documents can belong to multiple cases. If the answer is "no" or "not initially," Option 1 is the clear winner. If multi-case membership is a core requirement, Option 2 is appropriate.

---

## Implementation Plan: Case Schema with Future-Proofing

### Enhanced Case Schema Design

Based on the requirement to support future informational documents (not just uploaded files), here's the recommended schema:

```prisma
model Case {
  id          String   @id @default(uuid())
  name        String
  description String?
  ownerId     String
  status      String?  @default("active") // "active" | "closed" | "archived"
  
  // Case metadata for future AI context
  metadata    Json?    @db.JsonB // Flexible metadata storage
  // Example metadata structure:
  // {
  //   "caseNumber": "2024-CV-001",
  //   "clientName": "Acme Corp",
  //   "jurisdiction": "Federal",
  //   "caseType": "Civil",
  //   "tags": ["contract", "breach"],
  //   "notes": "Initial filing"
  // }
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  owner       User     @relation("CaseOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  documents   FileUpload[]  // Documents created/uploaded in system
  infoDocuments CaseInfoDocument[]  // Future: Informational documents not in system
  
  @@index([ownerId])
  @@index([status])
}

model FileUpload {
  // ... existing fields ...
  caseId      String?  // Optional foreign key to Case (nullable for backward compatibility)
  case        Case?    @relation(fields: [caseId], references: [id], onDelete: SetNull)
  
  // Additional fields for case context
  legalDocumentType String? // Legal document type: "motion" | "brief" | "memo" | "pleading" | "complaint" | "answer" | etc.
  filedByOrganization String? // Organization that filed the document
  
  @@index([caseId])
  @@index([legalDocumentType])
}

// Future: Informational documents that exist outside the system
// These could be references to external documents, URLs, or metadata-only entries
model CaseInfoDocument {
  id          String   @id @default(uuid())
  caseId      String
  name        String   // Document name/title
  description String?  // Description of the document
  source      String?  // "external" | "url" | "reference"
  url         String?  // If source is "url", the URL
  reference   String?  // Reference number, case cite, etc.
  documentType String? // Type of document
  metadata    Json?    @db.JsonB // Additional metadata
  addedById   String   // User who added this reference
  addedAt     DateTime @default(now())
  
  case        Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  addedBy     User     @relation(fields: [addedById], references: [id], onDelete: Cascade)
  
  @@index([caseId])
  @@index([addedById])
}

model User {
  // ... existing fields ...
  ownedCases        Case[]         @relation("CaseOwner")
  caseMemberships   CaseMember[]   @relation("CaseMembers")
  addedCaseMembers  CaseMember[]   @relation("CaseMemberAddedBy")
  addedInfoDocuments CaseInfoDocument[]
}
```

## Case-Level Permissions: Implementation Difficulty Analysis

### Overview

By assigning both **documents** and **people** to cases, we can create a foundation for case-level permissions. This is **moderately easy** to implement because:

1. **Similar Pattern Exists**: The current `DocumentShare` model already implements user-document relationships
2. **Simple Extension**: `CaseMember` follows the same pattern as `DocumentShare`
3. **Access Control Logic**: Can extend existing access control functions

### Implementation Approach

#### 1. Schema Addition (Easy)

Add `CaseMember` model (shown in schema above) - this is straightforward and follows existing patterns.

#### 2. Access Control Updates (Moderate)

Update access control functions to check case membership:

```typescript
// lib/access-control.ts - Extended version

/**
 * Check if user can access a file (updated to include case-level permissions)
 */
export async function canAccessFile(
  userId: string,
  fileId: string,
  requiredPermission: 'view' | 'edit' | 'route' = 'view'
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  
  // Admin has full access
  if (user?.role === 'admin') return true
  
  const file = await prisma.fileUpload.findUnique({
    where: { id: fileId },
    include: { case: { include: { members: true } } },
  })
  
  if (!file) return false
  
  // Owner has full access
  if (file.userId === userId) return true
  
  // NEW: Check case-level access
  if (file.caseId && file.case) {
    const caseMember = file.case.members.find(m => m.userId === userId)
    if (caseMember) {
      // User is a member of the case
      const casePermission = caseMember.role
      // Map case roles to document permissions
      // "owner" or "editor" -> can edit
      // "viewer" or "member" -> can view
      if (requiredPermission === 'view') return true
      if (requiredPermission === 'edit' && ['owner', 'editor'].includes(casePermission)) return true
      if (requiredPermission === 'route' && casePermission === 'owner') return true
    }
  }
  
  // Check for explicit document share (existing logic)
  const share = await prisma.documentShare.findUnique({
    where: {
      fileUploadId_sharedWithId: {
        fileUploadId: fileId,
        sharedWithId: userId,
      },
    },
  })
  
  if (!share) return false
  
  // Check permission level hierarchy
  const permissionHierarchy = { view: 1, edit: 2, route: 3 }
  const userPermission = permissionHierarchy[share.permission as keyof typeof permissionHierarchy] || 0
  const required = permissionHierarchy[requiredPermission]
  
  return userPermission >= required
}

/**
 * Get accessible files including case-based access
 */
export function getAccessibleFilesWhere(userId: string, userRole?: string) {
  // Admin sees all files
  if (userRole === 'admin') {
    return {}
  }
  
  return {
    OR: [
      { userId }, // Own files
      {
        shares: {
          some: { sharedWithId: userId },
        },
      }, // Shared files
      // NEW: Files in cases where user is a member
      {
        case: {
          members: {
            some: { userId },
          },
        },
      },
    ],
  }
}
```

#### 3. UI Components (Easy to Moderate)

- **Case Member Management**: Similar to document sharing UI
- **Case Assignment UI**: Dropdown/selector when creating/editing documents
- **Permission Indicators**: Show case membership in file listings

### Difficulty Assessment

| Component | Difficulty | Effort | Notes |
|-----------|-----------|--------|-------|
| **Schema (CaseMember)** | Easy | 1-2 hours | Follows existing patterns |
| **Access Control Logic** | Moderate | 4-6 hours | Need to update multiple functions, test edge cases |
| **API Endpoints** | Easy | 2-3 hours | CRUD for case members, case assignment |
| **UI Components** | Moderate | 6-8 hours | Case member management, assignment UI |
| **Testing** | Moderate | 4-6 hours | Test permission inheritance, edge cases |
| **Total** | **Moderate** | **17-25 hours** | Well-scoped, follows existing patterns |

### Key Considerations

1. **Permission Inheritance**: 
   - Case members get access to all documents in case
   - Document-level shares still work (more specific permissions override case permissions)
   - Case owner has full access to all case documents

2. **Permission Hierarchy**:
   ```
   Document Owner > Case Owner > Document Share > Case Member
   ```

3. **Backward Compatibility**:
   - Documents without cases work exactly as before
   - Existing document shares continue to work
   - No breaking changes to existing access control

4. **Edge Cases to Handle**:
   - User removed from case → lose access to case documents
   - Document moved to different case → update permissions
   - Document removed from case → fall back to document-level permissions

### Recommendation

**This is moderately easy to implement** because:
- ✅ Follows existing `DocumentShare` pattern
- ✅ Extends rather than replaces current access control
- ✅ Backward compatible
- ✅ Well-scoped feature

**Suggested Phased Approach**:
1. **Phase 1**: Schema + basic case assignment (documents to cases)
2. **Phase 2**: Case member assignment + access control updates
3. **Phase 3**: UI for case member management
4. **Phase 4**: Advanced features (case-level sharing, bulk operations)

---

### Future AI Context Integration

The `Case` model is designed to support future AI features where all case documents (both `FileUpload` and `CaseInfoDocument`) can be used as context for answering questions:

```typescript
// Future: Get all case context for AI
async function getCaseContext(caseId: string) {
  const case = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      documents: {
        include: {
          citationChecks: {
            where: { workflowType: "standard" },
            orderBy: { version: "desc" },
            take: 1,
            select: { jsonData: true }
          }
        }
      },
      infoDocuments: true
    }
  })
  
  // Combine all documents for AI context
  return {
    caseMetadata: case.metadata,
    uploadedDocuments: case.documents.map(doc => ({
      name: doc.originalName,
      legalDocumentType: doc.legalDocumentType,
      filedByOrganization: doc.filedByOrganization,
      content: doc.citationChecks[0]?.jsonData
    })),
    infoDocuments: case.infoDocuments.map(info => ({
      name: info.name,
      description: info.description,
      url: info.url,
      reference: info.reference
    }))
  }
}
```

---

## UI/UX Restructuring: Files View vs Document Creation

### Current State

Currently, `/citation-checker/page.tsx` combines:
1. **File Upload Section** (lines 236-259 in UploadPage.tsx)
2. **File Listing** (lines 261-564 in UploadPage.tsx)
3. **Document Creation Option** (in page.tsx, links to `/citation-checker/create-document`)

### Proposed Structure

#### 1. New Files View Page

**Route**: `/citation-checker/files` (or keep `/citation-checker` as files view)

**Purpose**: Dedicated file management interface

**Components**:
- File listing (existing UploadPage file list functionality)
- Filter/search capabilities
- Case assignment (when cases are implemented)
- File actions (share, route, delete, rename)

**Layout**:
```
┌─────────────────────────────────────────┐
│  Files                                  │
│  [New File] [Upload] [Filter: All ▼]   │
├─────────────────────────────────────────┤
│  File 1 | Status | Actions              │
│  File 2 | Status | Actions              │
│  ...                                    │
└─────────────────────────────────────────┘
```

#### 2. Separate Upload Component

**Component**: `FileUploadSection.tsx` (extracted from UploadPage)

**Purpose**: Standalone file upload functionality

**Usage**: 
- Can be used in Files view
- Can be used in modals/dialogs
- Reusable across the application

#### 3. New File Button → Create Document

**Flow**:
1. User clicks "New File" button in Files view
2. Navigates to `/citation-checker/create-document`
3. **No upload section** - just the AI document creation interface
4. After saving, returns to Files view with new document

**Updated Create Document Page**:
- Remove any upload-related UI
- Focus solely on AI document creation/editing
- Clear "Save" action that creates FileUpload record

### Recommended File Structure

```
app/citation-checker/
├── page.tsx                    # Files view (main landing)
├── files/
│   └── page.tsx               # Alternative: dedicated files page
├── create-document/
│   └── page.tsx               # AI document creation (no upload UI)
├── components/
│   ├── FilesView.tsx          # New: Main files listing component
│   ├── FileUploadSection.tsx  # New: Extracted upload component
│   ├── UploadPage.tsx         # Refactor: Remove upload, keep listing
│   └── CreateDocumentPage.tsx # Existing: AI document creation
```

### Implementation Steps

1. **Extract Upload Component**:
   - Create `FileUploadSection.tsx` from UploadPage upload section
   - Make it reusable with props for callbacks

2. **Refactor UploadPage → FilesView**:
   - Remove upload section from UploadPage
   - Rename to `FilesView.tsx` or keep as `UploadPage.tsx` but remove upload
   - Add "New File" button that links to create-document
   - Add "Upload" button that shows upload section (modal or inline)

3. **Update Create Document Page**:
   - Remove any references to file upload
   - Ensure it's focused on AI document creation only
   - After save, redirect to files view

4. **Update Main Route**:
   - `/citation-checker/page.tsx` should render FilesView
   - Optionally show upload section as a modal or separate section

### Example: Files View Component Structure

```typescript
// app/citation-checker/components/FilesView.tsx
export function FilesView() {
  const [showUploadModal, setShowUploadModal] = useState(false)
  
  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Files</h2>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/citation-checker/create-document')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md"
          >
            New File
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded-md"
          >
            Upload
          </button>
        </div>
      </div>
      
      {/* File Listing (existing UploadPage listing logic) */}
      <FileList files={files} />
      
      {/* Upload Modal */}
      {showUploadModal && (
        <Modal onClose={() => setShowUploadModal(false)}>
          <FileUploadSection 
            onUploadComplete={(fileId) => {
              setShowUploadModal(false)
              router.push(`/citation-checker/${fileId}/run-citation-checker`)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
```

### Benefits of This Structure

1. **Clear Separation**: File management vs document creation
2. **Better UX**: Users can easily see all files and create new ones
3. **Scalability**: Easy to add case assignment, bulk actions, etc.
4. **Consistency**: "New File" clearly indicates document creation
5. **Flexibility**: Upload can be modal, inline, or separate page

---

## Summary

### Schema Design
- ✅ **Option 1 (Simple Case Table)** with enhanced fields
- ✅ `Case` model with metadata for future AI context
- ✅ `CaseMember` model for case-level permissions (people assigned to cases)
- ✅ `CaseInfoDocument` model for future informational documents
- ✅ `FileUpload` extended with:
  - `caseId` (nullable for backward compatibility)
  - `legalDocumentType` (legal document type field)
  - `filedByOrganization` (organization that filed the document)

### UI/UX Structure
- ✅ **Files View**: Main landing page for file management
- ✅ **New File Button**: Links to create-document (no upload UI)
- ✅ **Upload Separated**: Standalone component, can be modal/inline
- ✅ **Clear Flow**: Files → New File → Create → Back to Files

### Case-Level Permissions
- ✅ **Moderately Easy** to implement (17-25 hours estimated)
- ✅ Follows existing `DocumentShare` pattern
- ✅ `CaseMember` model enables people assignment to cases
- ✅ Access control can be extended to check case membership
- ✅ Backward compatible - documents work without cases

### Future-Proofing
- ✅ Case metadata structure supports AI context queries *(Future - not needed now)*
- ✅ `CaseInfoDocument` model ready for external document references
- ✅ Schema can evolve to Option 2 or 3 if needed
- ✅ Document metadata fields (`legalDocumentType`, `filedByOrganization`) support case-level analysis
- ✅ **Backward Compatibility**: System fully supports documents with no case assigned

