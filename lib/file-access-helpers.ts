/**
 * File Access Helper Functions
 * Shared utilities for file access routes (shared-with-me, routed-to-me, routed-from-me)
 */

import { prisma } from "@/lib/prisma"

/**
 * Standard include structure for document shares with file uploads
 */
const documentShareInclude = {
  fileUpload: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      citationChecks: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          id: true,
          fileUploadId: true,
          version: true,
          status: true,
          workflowType: true,
          workflowStep: true,
          currentStep: true,
          completedSteps: true,
          assignedToId: true,
          assignedAt: true,
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  },
  sharedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  sharedWith: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  routedFrom: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const

/**
 * Format a document share into the response format used by file access routes
 */
export function formatFileShareResponse(share: any) {
  return {
    ...share.fileUpload,
    share: {
      id: share.id,
      permission: share.permission,
      routedFromId: share.routedFromId,
      routedAt: share.routedAt,
      createdAt: share.createdAt,
      sharedBy: share.sharedBy,
      sharedWith: share.sharedWith,
      routedFrom: share.routedFrom,
    },
    createdAt: share.fileUpload.createdAt.toISOString(),
    updatedAt: share.fileUpload.updatedAt.toISOString(),
    citationChecks: share.fileUpload.citationChecks.map((check: any) => ({
      ...check,
      createdAt: check.createdAt.toISOString(),
      updatedAt: check.updatedAt.toISOString(),
      assignedAt: check.assignedAt ? check.assignedAt.toISOString() : null,
      completedSteps: check.completedSteps || [],
    })),
  }
}

/**
 * Get files shared with a user (optionally filtered by permission)
 */
export async function getSharedWithMeFiles(userId: string, permissionFilter?: string | null) {
  const shares = await prisma.documentShare.findMany({
    where: {
      sharedWithId: userId,
      ...(permissionFilter && { permission: permissionFilter }),
    },
    include: documentShareInclude,
    orderBy: { createdAt: "desc" },
  })

  return shares.map(formatFileShareResponse)
}

/**
 * Get files routed to a user (where routedFromId is set)
 */
export async function getRoutedToMeFiles(userId: string) {
  const routedShares = await prisma.documentShare.findMany({
    where: {
      sharedWithId: userId,
      routedFromId: { not: null },
    },
    include: documentShareInclude,
    orderBy: { routedAt: "desc" },
  })

  // Also get checks directly assigned to user
  const assignedChecks = await prisma.citationCheck.findMany({
    where: {
      assignedToId: userId,
    },
    include: {
      fileUpload: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  })

  // Format routed shares
  const files = routedShares.map(formatFileShareResponse)

  // Add files from assigned checks that aren't already in shares
  const assignedFileIds = new Set(files.map((f: any) => f.id))
  for (const check of assignedChecks) {
    if (!assignedFileIds.has(check.fileUploadId)) {
      files.push({
        ...check.fileUpload,
        share: undefined as any,
        createdAt: check.fileUpload.createdAt.toISOString(),
        updatedAt: check.fileUpload.updatedAt.toISOString(),
        citationChecks: [{
          ...check,
          createdAt: check.createdAt.toISOString(),
          updatedAt: check.updatedAt.toISOString(),
          assignedAt: check.assignedAt ? check.assignedAt.toISOString() : null,
          completedSteps: check.completedSteps || [],
        }],
      })
    }
  }

  return files
}

/**
 * Get files routed from a user (where routedFromId matches userId)
 */
export async function getRoutedFromMeFiles(userId: string) {
  const routedShares = await prisma.documentShare.findMany({
    where: {
      routedFromId: userId,
    },
    include: documentShareInclude,
    orderBy: { routedAt: "desc" },
  })

  return routedShares.map(formatFileShareResponse)
}

