import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { identifyCitationsEyecite } from "@/lib/citation-identification/eyecite-adapter"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get the current CitationCheck
    const currentCheck = await prisma.citationCheck.findUnique({
      where: { id },
    })

    if (!currentCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    // Find the base version (version 1 with json_generated status) that has the original unprocessed JSON
    // This ensures we always regenerate from clean, unmarked text
    const baseCheck = await prisma.citationCheck.findFirst({
      where: { 
        fileUploadId: currentCheck.fileUploadId,
        status: "json_generated",
      },
      orderBy: { version: "asc" }, // Get the earliest version with json_generated status
    })

    // Fallback to version 1 if no json_generated status found
    const sourceCheck = baseCheck || await prisma.citationCheck.findFirst({
      where: { 
        fileUploadId: currentCheck.fileUploadId,
        version: 1,
      },
    })

    if (!sourceCheck || !sourceCheck.jsonData) {
      return NextResponse.json(
        { error: "Base JSON data not found. Please generate JSON first." },
        { status: 400 }
      )
    }

    // Get the latest version for this fileUploadId to determine next version number
    const latestVersion = await prisma.citationCheck.findFirst({
      where: { fileUploadId: currentCheck.fileUploadId },
      orderBy: { version: "desc" },
    })

    const nextVersion = latestVersion ? latestVersion.version + 1 : 1

    // Create new version by copying jsonData from base version (unprocessed JSON)
    const newVersion = await prisma.citationCheck.create({
      data: {
        fileUploadId: currentCheck.fileUploadId,
        userId: user.id,
        version: nextVersion,
        status: "citations_identified",
        jsonData: sourceCheck.jsonData as any, // Copy from base version (unprocessed)
      },
    })

    // Process citations using Eyecite and update jsonData
    // Use the base version's jsonData which should have no citation markers
    const jsonData = sourceCheck.jsonData as any
    console.log('[Eyecite API] Input jsonData structure:', {
      hasDocument: !!jsonData?.document,
      hasContent: !!jsonData?.document?.content,
      contentLength: jsonData?.document?.content?.length,
    })
    
    let result
    try {
      result = identifyCitationsEyecite(jsonData)
      console.log('[Eyecite API] Result structure:', {
        hasDocument: !!result?.document,
        hasLogs: Array.isArray(result?.logs),
        logsLength: result?.logs?.length,
      })
    } catch (error) {
      console.error('[Eyecite API] Error in identifyCitationsEyecite:', error)
      if (error instanceof Error) {
        console.error('[Eyecite API] Error stack:', error.stack)
      }
      throw error
    }
    
    const { document: updatedJsonData, logs } = result
    
    // updatedJsonData is a CitationDocument, which has a document property
    // We need to store the full CitationDocument structure
    console.log('[Eyecite API] updatedJsonData type:', typeof updatedJsonData)
    console.log('[Eyecite API] updatedJsonData has document property:', 'document' in updatedJsonData)

    // Update version with citations
    const updated = await prisma.citationCheck.update({
      where: { id: newVersion.id },
      data: {
        jsonData: updatedJsonData as any, // This is the full CitationDocument
        status: "citations_identified",
      },
    })

    // Return updated check with logs for browser console
    return NextResponse.json({
      ...updated,
      logs, // Include logs for browser console
    })
  } catch (error) {
    console.error("[Eyecite API] Error identifying citations with Eyecite:", error)
    if (error instanceof Error) {
      console.error("[Eyecite API] Error name:", error.name)
      console.error("[Eyecite API] Error message:", error.message)
      console.error("[Eyecite API] Error stack:", error.stack)
    } else {
      console.error("[Eyecite API] Non-Error object:", JSON.stringify(error, null, 2))
    }
    
    const errorMessage = error instanceof Error 
      ? `${error.name}: ${error.message}` 
      : String(error)
    
    return NextResponse.json(
      { 
        error: "Failed to identify citations with Eyecite",
        details: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

