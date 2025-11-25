import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createValidationJob } from "@/lib/citation-identification/queue"
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

    // Get the current CitationCheck
    const currentCheck = await prisma.citationCheck.findUnique({
      where: { id: params.id },
    })

    if (!currentCheck) {
      return NextResponse.json({ error: "Citation check not found" }, { status: 404 })
    }

    if (!currentCheck.jsonData) {
      return NextResponse.json(
        { error: "JSON data not found" },
        { status: 400 }
      )
    }

    const jsonData = currentCheck.jsonData as any

    if (!jsonData.document?.citations || jsonData.document.citations.length === 0) {
      return NextResponse.json(
        { error: "No citations found" },
        { status: 400 }
      )
    }

    // Check if job already exists
    const existingJob = await prisma.validationJob.findUnique({
      where: { checkId: params.id },
    })

    if (existingJob) {
      return NextResponse.json({
        jobId: existingJob.id,
        status: existingJob.status,
        message: "Job already exists",
      })
    }

    // Create validation job and queue items
    const jobId = await createValidationJob(params.id, jsonData)

    // Trigger worker to start processing (fire and forget)
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    fetch(`${baseUrl}/api/citation-checker/worker/process-queue?maxItems=5`, {
      method: 'POST',
    }).catch(console.error)

    return NextResponse.json({
      jobId,
      status: 'pending',
      message: 'Validation job created and processing started',
    })
  } catch (error) {
    console.error("Error creating validation job:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to create validation job",
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
      let isClosed = false
      
      const sendProgress = (data: any) => {
        if (isClosed) return
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (error) {
          console.error("Error sending progress:", error)
          isClosed = true
        }
      }
      
      const closeStream = () => {
        if (!isClosed) {
          isClosed = true
          try {
            controller.close()
          } catch (error) {
            // Stream may already be closed, ignore
          }
        }
      }

      try {
        const session = await getServerSession(authOptions)
        
        if (!session?.user?.email) {
          sendProgress({ type: "error", error: "Unauthorized" })
          closeStream()
          return
        }

        if (!ANTHROPIC_API_KEY) {
          sendProgress({ type: "error", error: "Anthropic API key not configured" })
          closeStream()
          return
        }

        const user = await prisma.user.findUnique({
          where: { email: session.user.email },
        })

        if (!user) {
          sendProgress({ type: "error", error: "User not found" })
          closeStream()
          return
        }

        // Get the current CitationCheck
        const currentCheck = await prisma.citationCheck.findUnique({
          where: { id: params.id },
        })

        if (!currentCheck) {
          sendProgress({ type: "error", error: "Citation check not found" })
          closeStream()
          return
        }

        if (!currentCheck.jsonData) {
          sendProgress({ type: "error", error: "JSON data not found" })
          closeStream()
          return
        }

        const jsonData = currentCheck.jsonData as any
        
        if (!jsonData.document?.citations || jsonData.document.citations.length === 0) {
          sendProgress({ type: "error", error: "No citations found" })
          closeStream()
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

        closeStream()
      } catch (error) {
        console.error("Error in streaming validation:", error)
        if (!isClosed) {
          sendProgress({
            type: "error",
            error: error instanceof Error ? error.message : String(error)
          })
        }
        closeStream()
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

