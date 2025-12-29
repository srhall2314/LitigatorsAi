import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    const citationCheck = await prisma.citationCheck.findUnique({
      where: { id },
      include: {
        fileUpload: true,
      },
    })

    if (!citationCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    // Check access control - user must own the file or have edit/route permission
    if (citationCheck.fileUpload.userId !== user.id && user.role !== "admin") {
      // Check for share permissions
      const share = await prisma.documentShare.findUnique({
        where: {
          fileUploadId_sharedWithId: {
            fileUploadId: citationCheck.fileUploadId,
            sharedWithId: user.id,
          },
        },
      })

      if (!share || (share.permission !== "edit" && share.permission !== "route")) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
      }
    }

    // Update status to finalized and mark finalize-document as completed
    const completedSteps = citationCheck.completedSteps || []
    if (!completedSteps.includes("finalize-document")) {
      completedSteps.push("finalize-document")
    }
    
    const updated = await prisma.citationCheck.update({
      where: { id },
      data: {
        status: "finalized",
        currentStep: "citations-report",
        completedSteps: completedSteps,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error finalizing document:", error)
    return NextResponse.json(
      { error: "Failed to finalize document", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

