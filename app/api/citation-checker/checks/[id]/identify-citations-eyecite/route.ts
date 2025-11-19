import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { identifyCitationsEyecite } from "@/lib/citation-identification/eyecite-adapter"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    // Get the current CitationCheck (should be version 1 with json_generated status)
    const currentCheck = await prisma.citationCheck.findUnique({
      where: { id: params.id },
    })

    if (!currentCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    if (!currentCheck.jsonData) {
      return NextResponse.json(
        { error: "JSON data not found. Please generate JSON first." },
        { status: 400 }
      )
    }

    // Get the latest version for this fileUploadId to determine next version number
    const latestVersion = await prisma.citationCheck.findFirst({
      where: { fileUploadId: currentCheck.fileUploadId },
      orderBy: { version: "desc" },
    })

    const nextVersion = latestVersion ? latestVersion.version + 1 : 1

    // Create new version by copying jsonData from current version
    const newVersion = await prisma.citationCheck.create({
      data: {
        fileUploadId: currentCheck.fileUploadId,
        userId: user.id,
        version: nextVersion,
        status: "citations_identified",
        jsonData: currentCheck.jsonData as any, // Copy from current version
      },
    })

    // Process citations using Eyecite and update jsonData
    const jsonData = currentCheck.jsonData as any
    const updatedJsonData = identifyCitationsEyecite(jsonData)

    // Update version with citations
    const updated = await prisma.citationCheck.update({
      where: { id: newVersion.id },
      data: {
        jsonData: updatedJsonData as any,
        status: "citations_identified",
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error identifying citations with Eyecite:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to identify citations with Eyecite",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

