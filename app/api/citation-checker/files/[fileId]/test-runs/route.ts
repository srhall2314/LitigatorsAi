import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { createValidationJob, retryUnvalidatedCitations, checkJobCompletion } from "@/lib/citation-identification/queue"
import { CitationDocument } from "@/types/citation-json"
import { randomUUID } from "crypto"
import { requireAuth, handleApiError, getLatestCheck } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"
import { deepClone } from "@/lib/utils"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Get all citation checks for this file that are test runs
    // Use workflowType field if available, fallback to checking jsonData
    const checks = await prisma.citationCheck.findMany({
      where: { 
        fileUploadId: fileId,
        OR: [
          { workflowType: "test_run" },
          // Fallback for non-migrated records
          {
            workflowType: null,
            jsonData: {
              path: ["document", "metadata", "testRunId"],
              not: Prisma.JsonNull,
            },
          },
        ],
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        workflowType: true,
        workflowId: true,
        workflowMetadata: true,
        jsonData: true,
      },
    })

    // Group checks by workflowId (testRunId)
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
      // Use workflowId from database if available, fallback to jsonData
      let testRunId: string | null = null
      let testRunNumber: number | null = null
      let testRunTotal: number | null = null

      if (check.workflowType === "test_run" && check.workflowId) {
        // Use database fields
        testRunId = check.workflowId
        const metadata = check.workflowMetadata as any
        testRunNumber = metadata?.testRunNumber || null
        testRunTotal = metadata?.testRunTotal || null
      } else {
        // Fallback: extract from jsonData for non-migrated records
        const jsonData = check.jsonData as any
        const metadata = jsonData?.document?.metadata
        testRunId = metadata?.testRunId
        testRunNumber = metadata?.testRunNumber
        testRunTotal = metadata?.testRunTotal
      }

      if (testRunId) {
        if (!testRunsMap.has(testRunId)) {
          testRunsMap.set(testRunId, {
            testRunId,
            testRunTotal: testRunTotal || 0,
            createdAt: check.createdAt,
            updatedAt: check.updatedAt,
            runs: [],
          })
        }

        const testRun = testRunsMap.get(testRunId)!
        testRun.runs.push({
          id: check.id,
          version: check.version,
          runNumber: testRunNumber || check.version,
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
    return handleApiError(error, 'GetTestRuns')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

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
    const latestCheck = await getLatestCheck(fileId)

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
      const freshJsonData = deepClone(sourceJsonData)
      
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

      // Add test run metadata to jsonData (for backward compatibility)
      if (freshJsonData.document?.metadata) {
        freshJsonData.document.metadata.testRunId = testRunId
        freshJsonData.document.metadata.testRunNumber = i
        freshJsonData.document.metadata.testRunTotal = numberOfRuns
      }

      // Create new CitationCheck version with workflow tracking
      const newCheck = await prisma.citationCheck.create({
        data: {
          fileUploadId: fileId,
          userId: user.id,
          version: latestVersion + i,
          status: "citations_validated",
          jsonData: freshJsonData as any,
          // Populate workflow fields
          workflowType: "test_run",
          workflowId: testRunId,
          workflowMetadata: {
            testRunNumber: i,
            testRunTotal: numberOfRuns,
          } as any,
          documentMetadata: freshJsonData.document?.metadata as any,
          citationCount: freshJsonData.document?.citations?.length || null,
          identificationMethod: freshJsonData.document?.metadata?.identificationMethod || null,
          completedSteps: ["upload", "generate-json", "identify-citations"],
          currentStep: "validate-citations",
        },
      })

      checkIds.push(newCheck.id)

      // Create validation job for this check (uses existing queue system)
      try {
        const jobId = await createValidationJob(newCheck.id, freshJsonData)
        logger.debug(`Created validation job`, { jobId, checkId: newCheck.id, runNumber: i, totalRuns: numberOfRuns }, 'TestRuns')
        
        // Trigger worker to start processing (similar to validate-citations route)
        try {
          const { processQueueItems } = await import("@/lib/citation-identification/worker")
          logger.debug(`Starting worker processing`, { runNumber: i }, 'TestRuns')
          
          // Process first batch asynchronously (don't await to avoid blocking)
          processQueueItems(5)
            .then((result) => {
              logger.debug(`Worker processed items`, { processed: result.processed, runNumber: i }, 'TestRuns')
              // Continue processing more items asynchronously if needed
              if (result.processed > 0 && result.hasMore) {
                const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
                fetch(`${baseUrl}/api/citation-checker/worker/process-queue?maxItems=5`, {
                  method: 'POST',
                })
                  .then((res) => {
                    logger.debug(`Continuation batch triggered`, { status: res.status, runNumber: i }, 'TestRuns')
                  })
                  .catch((err) => {
                    logger.error(`Error triggering continuation`, err, 'TestRuns')
                  })
              }
            })
            .catch((err) => {
              logger.error(`Error in worker processing`, err, 'TestRuns')
            })
        } catch (workerError) {
          logger.error(`Failed to trigger worker`, workerError, 'TestRuns')
          // Don't fail the request if worker trigger fails - jobs are still queued
        }
      } catch (error) {
        logger.error(`Failed to create validation job`, error, 'TestRuns')
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
    return handleApiError(error, 'TestRuns')
  }
}
