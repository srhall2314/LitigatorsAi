import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { canAccessFile, canModifyWorkflow } from "@/lib/access-control"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Use centralized auth helper
    const authResult = await requireAuth(request)
    if (authResult.error) {
      return authResult.error
    }
    const { user } = authResult

    const citationCheck = await prisma.citationCheck.findUnique({
      where: { id },
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
    })

    if (!citationCheck) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Check access to the file
    const hasAccess = await canAccessFile(user.id, citationCheck.fileUploadId, 'view')
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json(citationCheck)
  } catch (error) {
    return handleApiError(error, 'GetCitationCheck')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Use centralized auth helper
    const authResult = await requireAuth(request)
    if (authResult.error) {
      return authResult.error
    }
    const { user } = authResult

    const citationCheck = await prisma.citationCheck.findUnique({
      where: { id },
    })

    if (!citationCheck) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Check if user can modify workflow
    const canModify = await canModifyWorkflow(user.id, id)
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { status, jsonData } = body

    // jsonData is the complete JSON blob structure (format TBD by parser)
    // All citation data, validation results, etc. will be stored within jsonData
    const updated = await prisma.citationCheck.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(jsonData !== undefined && { jsonData: jsonData as any }), // Type will be defined when parser is built
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error, 'UpdateCitationCheck')
  }
}

