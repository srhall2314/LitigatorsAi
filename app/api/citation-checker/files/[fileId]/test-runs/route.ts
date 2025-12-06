import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createValidationJob, retryUnvalidatedCitations, checkJobCompletion } from "@/lib/citation-identification/queue"
import { CitationDocument } from "@/types/citation-json"
import { randomUUID } from "crypto"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
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

    // Get all citation checks for this file
    const checks = await prisma.citationCheck.findMany({
      where: { fileUploadId: fileId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        jsonData: true,
      },
    })

    // Group checks by testRunId
    const testRunsMap = new Map<string, {
      testRunId: string
      testRunTotal: number
      createdAt: Date
      updatedAt: Date
      runs: Array<{
        id: string
        version: number
        runNumber: number
        createdAt: Date
        updatedAt: Date
      }>
    }>()

    for (const check of checks) {
      const jsonData = check.jsonData as any
      const metadata = jsonData?.document?.metadata
      const testRunId = metadata?.testRunId

      if (testRunId) {
        if (!testRunsMap.has(testRunId)) {
          testRunsMap.set(testRunId, {
            testRunId,
            testRunTotal: metadata?.testRunTotal || 0,
            createdAt: check.createdAt,
            updatedAt: check.updatedAt,
            runs: [],
          })
        }

        const testRun = testRunsMap.get(testRunId)!
        testRun.runs.push({
          id: check.id,
          version: check.version,
          runNumber: metadata?.testRunNumber || check.version,
          createdAt: check.createdAt,
          updatedAt: check.updatedAt,
        })

        // Update updatedAt to the latest
        if (check.updatedAt > testRun.updatedAt) {
          testRun.updatedAt = check.updatedAt
        }
      }
    }

    // Convert map to array and sort by updatedAt (newest first)
    const testRuns = Array.from(testRunsMap.values())
      .map(testRun => ({
        ...testRun,
        runs: testRun.runs.sort((a, b) => a.runNumber - b.runNumber),
        runsCompleted: testRun.runs.length,
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    return NextResponse.json({ testRuns })
  } catch (error) {
    console.error("Error fetching test runs:", error)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
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

    // Get request body
    const body = await request.json()
    const numberOfRuns = parseInt(body.numberOfRuns)

    if (!numberOfRuns || numberOfRuns < 1 || numberOfRuns > 10) {
      return NextResponse.json(
        { error: "Number of runs must be between 1 and 10" },
        { status: 400 }
      )
    }

    // Get the file upload
    const fileUpload = await prisma.fileUpload.findUnique({
      where: { id: fileId },
    })

    if (!fileUpload) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Get the latest CitationCheck with JSON
    const latestCheck = await prisma.citationCheck.findFirst({
      where: { fileUploadId: fileId },
      orderBy: { version: "desc" },
    })

    if (!latestCheck || !latestCheck.jsonData) {
      return NextResponse.json(
        { error: "No JSON data found for this file. Please generate JSON first." },
        { status: 400 }
      )
    }

    // Generate test run ID
    const testRunId = randomUUID()

    // Get the latest version number to start from
    const latestVersion = latestCheck.version

    // Cast jsonData
    const sourceJsonData = latestCheck.jsonData as unknown as CitationDocument

    // Create N CitationCheck versions, each with test run metadata
    const checkIds: string[] = []
    
    for (let i = 1; i <= numberOfRuns; i++) {
      // Deep copy the JSON data
      const freshJsonData = JSON.parse(JSON.stringify(sourceJsonData)) as CitationDocument
      
      // Clear ALL validation results - start with clean Tier 1 citation data only
      if (freshJsonData.document?.citations) {
        freshJsonData.document.citations = freshJsonData.document.citations.map((citation: any) => {
          // Create clean citation object with only Tier 1 fields
          const cleanCitation: any = {
            id: citation.id,
            citationText: citation.citationText,
            citationType: citation.citationType,
            extractedComponents: citation.extractedComponents,
            paragraphId: citation.paragraphId,
            paragraphText: citation.paragraphText,
          }
          // Preserve any other Tier 1 fields that might exist
          if (citation.tier_1) {
            cleanCitation.tier_1 = citation.tier_1
          }
          return cleanCitation
        })
      }

      // Add test run metadata
      if (freshJsonData.document?.metadata) {
        freshJsonData.document.metadata.testRunId = testRunId
        freshJsonData.document.metadata.testRunNumber = i
        freshJsonData.document.metadata.testRunTotal = numberOfRuns
      }

      // Create new CitationCheck version
      const newCheck = await prisma.citationCheck.create({
        data: {
          fileUploadId: fileId,
          userId: user.id,
          version: latestVersion + i,
          status: "citations_validated",
          jsonData: freshJsonData as any,
        },
      })

      checkIds.push(newCheck.id)

      // Create validation job for this check (uses existing queue system)
      try {
        const jobId = await createValidationJob(newCheck.id, freshJsonData)
        console.log(`[test-runs] Created validation job ${jobId} for check ${newCheck.id} (run ${i}/${numberOfRuns})`)
        
        // Trigger worker to start processing (similar to validate-citations route)
        try {
          const { processQueueItems } = await import("@/lib/citation-identification/worker")
          console.log(`[test-runs] Starting worker processing for run ${i}`)
          
          // Process first batch asynchronously (don't await to avoid blocking)
          processQueueItems(5)
            .then((result) => {
              console.log(`[test-runs] Worker processed ${result.processed} items for run ${i}`)
              // Continue processing more items asynchronously if needed
              if (result.processed > 0 && result.hasMore) {
                const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
                fetch(`${baseUrl}/api/citation-checker/worker/process-queue?maxItems=5`, {
                  method: 'POST',
                })
                  .then((res) => {
                    console.log(`[test-runs] Continuation batch triggered for run ${i}: ${res.status}`)
                  })
                  .catch((err) => {
                    console.error(`[test-runs] Error triggering continuation for run ${i}:`, err)
                  })
              }
            })
            .catch((err) => {
              console.error(`[test-runs] Error in worker processing for run ${i}:`, err)
            })
        } catch (workerError) {
          console.error(`[test-runs] Failed to trigger worker for run ${i}:`, workerError)
          // Don't fail the request if worker trigger fails - jobs are still queued
        }
      } catch (error) {
        console.error(`[test-runs] Failed to create validation job for check ${newCheck.id}:`, error)
        // Continue with other runs even if one fails
      }
    }

    return NextResponse.json({
      testRunId,
      numberOfRuns,
      checkIds,
      message: `Created ${numberOfRuns} test run(s). Validation jobs have been queued.`,
    })
  } catch (error) {
    console.error("Error creating test run:", error)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}
