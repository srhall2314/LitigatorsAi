import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseWordDocument } from "@/lib/document-parser"

export async function POST(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
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

    const fileUpload = await prisma.fileUpload.findUnique({
      where: { id: params.fileId },
      include: {
        citationChecks: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    })

    if (!fileUpload) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    if (!fileUpload.blobUrl) {
      return NextResponse.json(
        { error: "File URL not found" },
        { status: 400 }
      )
    }

    // Check if JSON already exists
    const latestCheck = fileUpload.citationChecks[0]
    const hasJson = latestCheck && latestCheck.jsonData
    
    // Check for force regeneration parameter
    const { searchParams } = new URL(request.url)
    const forceRegenerate = searchParams.get("force") === "true"

    let citationCheck
    // Return existing JSON if it exists and we're not forcing regeneration
    // Don't check status - just check if jsonData exists
    if (hasJson && latestCheck && !forceRegenerate) {
      // Use existing check (unless forcing regeneration)
      citationCheck = latestCheck
      return NextResponse.json(citationCheck)
    } else {
      // Create new version or update existing
      const version = latestCheck ? latestCheck.version + 1 : 1
      
      // In test system: any user can create citation checks for any file
      citationCheck = await prisma.citationCheck.create({
        data: {
          fileUploadId: fileUpload.id,
          userId: user.id, // Track who created this check, but file is accessible to all
          version,
          status: "uploaded",
        },
      })
    }

    // Download file from Vercel Blob Storage
    let fileBuffer: ArrayBuffer
    try {
      console.log('[generate-json] Downloading file from:', fileUpload.blobUrl)
      console.log('[generate-json] File details:', {
        filename: fileUpload.originalName,
        mimeType: fileUpload.mimeType,
        fileSize: fileUpload.fileSize,
      })
      
      const fileResponse = await fetch(fileUpload.blobUrl)
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.statusText}`)
      }
      fileBuffer = await fileResponse.arrayBuffer()
      console.log('[generate-json] File downloaded successfully, buffer size:', fileBuffer.byteLength)
    } catch (error) {
      console.error("[generate-json] Error downloading file:", error)
      if (error instanceof Error) {
        console.error("[generate-json] Download error details:", error.message, error.stack)
      }
      return NextResponse.json(
        { 
          error: "Failed to download file from storage",
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      )
    }

    // Parse Word document to JSON structure
    let jsonData: any
    try {
      console.log('[generate-json] Starting document parse...')
      jsonData = await parseWordDocument(
        fileBuffer,
        fileUpload.originalName,
        fileUpload.createdAt.toISOString()
      )
      console.log('[generate-json] Document parsed successfully, content blocks:', jsonData?.document?.content?.length || 0)
    } catch (error) {
      console.error("Error parsing document:", error)
      return NextResponse.json(
        { 
          error: "Failed to parse document",
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      )
    }

    // Update citation check with JSON (stored as JsonB)
    const updated = await prisma.citationCheck.update({
      where: { id: citationCheck.id },
      data: {
        status: "json_generated",
        jsonData: jsonData as any,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error generating JSON:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to generate JSON",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

