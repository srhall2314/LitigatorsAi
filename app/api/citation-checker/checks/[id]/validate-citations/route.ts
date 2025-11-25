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

// GET endpoint - check for existing job or return error
export async function GET(
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

    // Check if a validation job exists for this check
    const job = await prisma.validationJob.findUnique({
      where: { checkId: params.id },
    })

    if (job) {
      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        message: "Use POST to create a new validation job, or check job status at /api/citation-checker/jobs/[jobId]",
      })
    }

    return NextResponse.json({
      message: "No validation job found. Use POST to create a validation job.",
    })
  } catch (error) {
    console.error("Error in GET validation endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

