import { prisma } from "./prisma"

export type AccessLevel = 'owner' | 'edit' | 'view' | 'route' | null

/**
 * Check if user can access a file with the required permission level
 * Permission hierarchy: view < edit < route
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
    include: { 
      case: { 
        include: { 
          members: true,
          owner: true
        } 
      } 
    },
  })
  
  if (!file) return false
  
  // Owner has full access
  if (file.userId === userId) return true
  
  // NEW: Check case-level access
  if (file.caseId && file.case) {
    // Case owner has full access
    if (file.case.ownerId === userId) return true
    
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
  
  // Check for explicit share
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
 * Check if user can modify workflow (complete steps, update check)
 */
export async function canModifyWorkflow(
  userId: string,
  checkId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  
  // Admin can modify any workflow
  if (user?.role === 'admin') return true
  
  const check = await prisma.citationCheck.findUnique({
    where: { id: checkId },
    include: { 
      fileUpload: {
        include: {
          case: {
            include: {
              members: true,
              owner: true
            }
          }
        }
      }
    },
  })
  
  if (!check) return false
  
  // Owner can always modify
  if (check.userId === userId || check.fileUpload.userId === userId) return true
  
  // NEW: Check case-level permissions
  if (check.fileUpload.caseId && check.fileUpload.case) {
    // Case owner can modify
    if (check.fileUpload.case.ownerId === userId) return true
    
    const caseMember = check.fileUpload.case.members.find(m => m.userId === userId)
    if (caseMember && ['owner', 'editor'].includes(caseMember.role)) {
      return true
    }
  }
  
  // Check for edit/route permission via share
  const share = await prisma.documentShare.findFirst({
    where: {
      fileUploadId: check.fileUploadId,
      sharedWithId: userId,
      permission: { in: ['edit', 'route'] },
    },
  })
  
  return !!share
}

/**
 * Get Prisma where clause for accessible files
 * Returns files that user owns OR has been shared with OR admin (all files)
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
      // NEW: Files in cases owned by user
      {
        case: {
          ownerId: userId,
        },
      },
    ],
  }
}

/**
 * Get the highest access level for a user on a file
 */
export async function getFileAccessLevel(
  userId: string,
  fileId: string
): Promise<AccessLevel> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  
  // Admin has owner-level access
  if (user?.role === 'admin') return 'owner'
  
  const file = await prisma.fileUpload.findUnique({
    where: { id: fileId },
    include: {
      case: {
        include: {
          members: true,
          owner: true
        }
      }
    },
  })
  
  if (!file) return null
  
  // Owner
  if (file.userId === userId) return 'owner'
  
  // NEW: Check case-level access
  if (file.caseId && file.case) {
    // Case owner has owner-level access
    if (file.case.ownerId === userId) return 'owner'
    
    const caseMember = file.case.members.find(m => m.userId === userId)
    if (caseMember) {
      // Map case roles to document access levels
      if (caseMember.role === 'owner') return 'owner'
      if (caseMember.role === 'editor') return 'edit'
      if (['viewer', 'member'].includes(caseMember.role)) return 'view'
    }
  }
  
  // Check for share
  const share = await prisma.documentShare.findUnique({
    where: {
      fileUploadId_sharedWithId: {
        fileUploadId: fileId,
        sharedWithId: userId,
      },
    },
  })
  
  if (!share) return null
  
  // Return permission level from share
  return share.permission as AccessLevel
}

/**
 * Check if user can access a case with the required permission level
 */
export async function canAccessCase(
  userId: string,
  caseId: string,
  requiredPermission: 'view' | 'edit' | 'route' = 'view'
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  
  // Admin has full access
  if (user?.role === 'admin') return true
  
  const case_ = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      members: true,
      owner: true
    },
  })
  
  if (!case_) return false
  
  // Case owner has full access
  if (case_.ownerId === userId) return true
  
  // Check if user is a member
  const caseMember = case_.members.find(m => m.userId === userId)
  if (!caseMember) return false
  
  // Map case roles to permissions
  const casePermission = caseMember.role
  if (requiredPermission === 'view') return true
  if (requiredPermission === 'edit' && ['owner', 'editor'].includes(casePermission)) return true
  if (requiredPermission === 'route' && casePermission === 'owner') return true
  
  return false
}

