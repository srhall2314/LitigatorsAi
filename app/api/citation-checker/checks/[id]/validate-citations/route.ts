import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validateAllCitations } from "@/lib/citation-identification/validation"
import { ANTHROPIC_API_KEY } from "@/lib/env"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get the current CitationCheck (should have citations_identified status)
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

    const jsonData = currentCheck.jsonData as any
    
    // Verify citations exist
    if (!jsonData.document?.citations || jsonData.document.citations.length === 0) {
      return NextResponse.json(
        { error: "No citations found. Please identify citations first." },
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
        status: "citations_validated",
        jsonData: jsonData as any, // Copy from current version
      },
    })

    // Validate all citations
    const updatedJsonData = await validateAllCitations(
      jsonData,
      ANTHROPIC_API_KEY,
      (current, total) => {
        console.log(`[ValidateCitations] Progress: ${current}/${total}`)
      }
    )

    // Update version with validation results
    const updated = await prisma.citationCheck.update({
      where: { id: newVersion.id },
      data: {
        jsonData: updatedJsonData as any,
        status: "citations_validated",
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error validating citations:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to validate citations",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

// Streaming endpoint for progress updates (GET with ?stream=true)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url)
  const shouldStream = searchParams.get('stream') === 'true'
  
  if (!shouldStream) {
    return NextResponse.json({ error: "Use POST for validation or GET with ?stream=true for progress" }, { status: 400 })
  }
  const encoder = new TextEncoder()
  
  // Create a readable stream
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      }

      try {
        const session = await getServerSession(authOptions)
        
        if (!session?.user?.email) {
          sendProgress({ error: "Unauthorized" })
          controller.close()
          return
        }

        if (!ANTHROPIC_API_KEY) {
          sendProgress({ error: "Anthropic API key not configured" })
          controller.close()
          return
        }

        const user = await prisma.user.findUnique({
          where: { email: session.user.email },
        })

        if (!user) {
          sendProgress({ error: "User not found" })
          controller.close()
          return
        }

        // Get the current CitationCheck
        const currentCheck = await prisma.citationCheck.findUnique({
          where: { id: params.id },
        })

        if (!currentCheck) {
          sendProgress({ error: "Citation check not found" })
          controller.close()
          return
        }

        if (!currentCheck.jsonData) {
          sendProgress({ error: "JSON data not found" })
          controller.close()
          return
        }

        const jsonData = currentCheck.jsonData as any
        
        if (!jsonData.document?.citations || jsonData.document.citations.length === 0) {
          sendProgress({ error: "No citations found" })
          controller.close()
          return
        }

        const totalCitations = jsonData.document.citations.length
        let tier3Count = 0

        // Get the latest version
        const latestVersion = await prisma.citationCheck.findFirst({
          where: { fileUploadId: currentCheck.fileUploadId },
          orderBy: { version: "desc" },
        })

        const nextVersion = latestVersion ? latestVersion.version + 1 : 1

        // Create new version
        const newVersion = await prisma.citationCheck.create({
          data: {
            fileUploadId: currentCheck.fileUploadId,
            userId: user.id,
            version: nextVersion,
            status: "citations_validated",
            jsonData: jsonData as any,
          },
        })

        sendProgress({ 
          type: "start",
          tier2Total: totalCitations,
          tier3Total: 0 
        })

        // Validate all citations with progress updates
        const updatedJsonData = await validateAllCitations(
          jsonData,
          ANTHROPIC_API_KEY,
          (tier2Current, tier2Total, tier3Current, tier3Total) => {
            // Always send progress updates
            if (tier3Total > 0) {
              // Tier 3 is in progress
              const progressData = {
                type: "tier3_progress",
                tier2Current: tier2Total,
                tier2Total: tier2Total,
                tier3Current,
                tier3Total,
                tier3Percentage: Math.round((tier3Current / tier3Total) * 100)
              }
              console.log(`[Progress] Tier 3: ${tier3Current}/${tier3Total}`)
              sendProgress(progressData)
            } else {
              // Still in Tier 2
              const progressData = {
                type: "tier2_progress",
                tier2Current,
                tier2Total,
                tier2Percentage: Math.round((tier2Current / tier2Total) * 100)
              }
              console.log(`[Progress] Tier 2: ${tier2Current}/${tier2Total}`)
              sendProgress(progressData)
            }
          }
        )

        // Count citations that actually got Tier 3 results
        tier3Count = updatedJsonData.document.citations.filter(
          c => c.tier_3 !== null && c.tier_3 !== undefined
        ).length

        sendProgress({
          type: "tier2_complete",
          tier3Count,
          tier3Total: tier3Count
        })

        // Update version with validation results
        const updated = await prisma.citationCheck.update({
          where: { id: newVersion.id },
          data: {
            jsonData: updatedJsonData as any,
            status: "citations_validated",
          },
        })

        sendProgress({
          type: "complete",
          checkId: updated.id,
          jsonData: updatedJsonData
        })

        controller.close()
      } catch (error) {
        console.error("Error in streaming validation:", error)
        sendProgress({
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Transfer-Encoding': 'chunked',
    },
  })
}

