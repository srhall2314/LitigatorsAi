import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    // Check if JSON already exists
    const latestCheck = fileUpload.citationChecks[0]
    const hasJson = latestCheck && latestCheck.jsonData

    let citationCheck
    if (hasJson && latestCheck.status === "json_generated") {
      // Use existing check
      citationCheck = latestCheck
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

    // TODO: Implement actual JSON generation from file using parser
    // Parser will populate content array and citations array
    // For now, create structure matching citationjson.md specification
    const jsonData: any = {
      document: {
        metadata: {
          filename: fileUpload.originalName,
          uploadDate: fileUpload.createdAt.toISOString(),
          documentType: null, // Will be detected by parser
          totalCitations: 0, // Will be populated by parser
        },
        content: [], // Parser will extract paragraphs/sections with inline citations
        citations: [], // Parser will extract and populate citations array
      },
    }

    // Update citation check with JSON (stored as JsonB)
    const updated = await prisma.citationCheck.update({
      where: { id: citationCheck.id },
      data: {
        status: "json_generated",
        jsonData: jsonData as any, // Type will be defined when parser is built
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error generating JSON:", error)
    return NextResponse.json(
      { error: "Failed to generate JSON" },
      { status: 500 }
    )
  }
}

