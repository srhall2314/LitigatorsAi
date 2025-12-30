/**
 * API Helper Functions
 * Centralized utilities for API route handlers to reduce duplication
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { User } from "@prisma/client"
import { logger } from "@/lib/logger"

/**
 * Require authentication and return the authenticated user
 * Returns an error response if authentication fails
 */
export async function requireAuth(request: NextRequest): Promise<
  | { user: User; error?: never }
  | { user?: never; error: NextResponse }
> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) }
  }

  return { user }
}

/**
 * Handle API errors consistently
 */
export function handleApiError(error: unknown, context: string): NextResponse {
  logger.error(`Error in ${context}`, error, context)
  
  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  )
}

/**
 * Get the latest CitationCheck for a file
 */
export async function getLatestCheck(fileUploadId: string) {
  return prisma.citationCheck.findFirst({
    where: { fileUploadId },
    orderBy: { version: "desc" },
  })
}

/**
 * Get the next version number for a file
 */
export async function getNextVersionNumber(fileUploadId: string): Promise<number> {
  const latest = await getLatestCheck(fileUploadId)
  return latest ? latest.version + 1 : 1
}

