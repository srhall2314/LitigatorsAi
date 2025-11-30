import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createValidationJob, retryUnvalidatedCitations, checkJobCompletion } from "@/lib/citation-identification/queue"
import { ANTHROPIC_API_KEY } from "@/lib/env"
import { CitationDocument } from "@/types/citation-json"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log(`[validate-citations] POST request received for checkId: ${params?.id}`)
  try {
    // Validate params
    if (!params || !params.id) {
      console.error("[validate-citations] Missing params.id:", params)
      return NextResponse.json(
        { error: "Missing check ID in request" },
        { status: 400 }
      )
    }
    
    console.log(`[validate-citations] Processing validation job creation for checkId: ${params.id}`)

    // Validate prisma is initialized
    if (!prisma) {
      console.error("[validate-citations] Prisma client is not initialized")
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      )
    }

    // Debug: Check if validationJob model exists
    if (!prisma.validationJob) {
      console.error("[validate-citations] prisma.validationJob is undefined")
      console.error("[validate-citations] Available models:", Object.keys(prisma).filter(key => !key.startsWith('$') && !key.startsWith('_')))
      return NextResponse.json(
        { error: "Database model not available. Please restart the server." },
        { status: 500 }
      )
    }

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

    // Cast jsonData to CitationDocument type
    let jsonData: CitationDocument
    try {
      jsonData = currentCheck.jsonData as unknown as CitationDocument
    } catch (error) {
      console.error("Error casting jsonData:", error)
      return NextResponse.json(
        { error: "Invalid JSON data format" },
        { status: 400 }
      )
    }

    // Validate jsonData structure
    if (!jsonData || typeof jsonData !== 'object') {
      console.error("Invalid jsonData structure:", typeof jsonData, jsonData)
      return NextResponse.json(
        { error: "Invalid JSON data structure" },
        { status: 400 }
      )
    }

    if (!jsonData.document) {
      console.error("Missing document in jsonData:", Object.keys(jsonData))
      return NextResponse.json(
        { error: "JSON data missing document structure" },
        { status: 400 }
      )
    }

    if (!jsonData.document.citations || !Array.isArray(jsonData.document.citations)) {
      console.error("Invalid citations array:", jsonData.document.citations)
      return NextResponse.json(
        { error: "Invalid citations array in JSON data" },
        { status: 400 }
      )
    }

    if (jsonData.document.citations.length === 0) {
      return NextResponse.json(
        { error: "No citations found" },
        { status: 400 }
      )
    }

    // Check for force/rerun parameter
    const { searchParams } = new URL(request.url)
    const forceRerun = searchParams.get('force') === 'true' || searchParams.get('rerun') === 'true'
    
    // Check if job already exists
    console.log(`[validate-citations] Checking for existing job for checkId: ${params.id}, forceRerun: ${forceRerun}`)
    const existingJob = await prisma.validationJob.findUnique({
      where: { checkId: params.id },
    })

    let checkIdToUse = params.id
    let jsonDataToUse = jsonData

    if (existingJob) {
      if (forceRerun) {
        // Create a new CitationCheck version for rerun (to preserve history)
        console.log(`[validate-citations] Force rerun requested, creating new CitationCheck version`)
        
        // Get the latest version for this fileUploadId to determine next version number
        const latestVersion = await prisma.citationCheck.findFirst({
          where: { fileUploadId: currentCheck.fileUploadId },
          orderBy: { version: "desc" },
        })

        const nextVersion = latestVersion ? latestVersion.version + 1 : 1

        // Copy jsonData but clear ALL validation results for fresh validation
        // Start with clean Tier 1 citation data only
        const freshJsonData = JSON.parse(JSON.stringify(jsonData)) as CitationDocument
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

        // Create new CitationCheck version
        const newCheck = await prisma.citationCheck.create({
          data: {
            fileUploadId: currentCheck.fileUploadId,
            userId: user.id,
            version: nextVersion,
            status: "citations_validated",
            jsonData: freshJsonData as any,
          },
        })

        console.log(`[validate-citations] Created new CitationCheck version: ${newCheck.id} (version ${nextVersion})`)
        checkIdToUse = newCheck.id
        jsonDataToUse = freshJsonData

        // Delete existing job and all its queue items
        console.log(`[validate-citations] Deleting existing job: ${existingJob.id}`)
        await prisma.validationQueueItem.deleteMany({
          where: { jobId: existingJob.id },
        })
        await prisma.validationJob.delete({
          where: { id: existingJob.id },
        })
        console.log(`[validate-citations] Existing job deleted, will create new one for new check`)
      } else {
        // Return existing job (original behavior)
        console.log(`[validate-citations] Existing job found: ${existingJob.id}, status: ${existingJob.status}`)
        
        // Check for unvalidated citations and retry them (up to 3 times)
        const retriedCount = await retryUnvalidatedCitations(existingJob.id)
        if (retriedCount > 0) {
          console.log(`[validate-citations] Retried ${retriedCount} unvalidated citations for job ${existingJob.id}`)
          // Re-check job completion after retries
          await checkJobCompletion(existingJob.id)
        }
        
        // Check if there are pending queue items that need processing
        const pendingItems = await prisma.validationQueueItem.count({
          where: {
            jobId: existingJob.id,
            status: 'pending',
          },
        })
        
        console.log(`[validate-citations] Pending queue items: ${pendingItems}`)
        
        // If there are pending items, trigger worker to process them
        if (pendingItems > 0) {
          console.log(`[validate-citations] Triggering worker to process ${pendingItems} pending items`)
          try {
            const { processQueueItems } = await import("@/lib/citation-identification/worker")
            processQueueItems(5)
              .then((result) => {
                console.log(`[validate-citations] Worker processed ${result.processed} items for existing job`)
              })
              .catch((err) => {
                console.error("[validate-citations] Error processing existing job:", err)
              })
          } catch (err) {
            console.error("[validate-citations] Error starting worker for existing job:", err)
          }
        }
        
        return NextResponse.json({
          jobId: existingJob.id,
          checkId: checkIdToUse, // Return the checkId being used (may be new version)
          status: existingJob.status,
          message: pendingItems > 0 ? "Job already exists, processing pending items" : "Job already exists",
        })
      }
    }
    
    console.log(`[validate-citations] No existing job found, creating new one`)

    // Create validation job and queue items
    let jobId: string
    try {
      console.log(`[validate-citations] Creating validation job for checkId: ${checkIdToUse}`)
      console.log(`[validate-citations] Citations count: ${jsonDataToUse.document.citations.length}`)
      
      jobId = await createValidationJob(checkIdToUse, jsonDataToUse)
      
      if (!jobId) {
        throw new Error("createValidationJob returned undefined jobId")
      }
      
      console.log(`[validate-citations] Successfully created job: ${jobId}`)
    } catch (error) {
      console.error("[validate-citations] Error in createValidationJob:", error)
      if (error instanceof Error) {
        console.error("[validate-citations] Error message:", error.message)
        console.error("[validate-citations] Error stack:", error.stack)
        // Check if it's a unique constraint violation
        if (error.message.includes('Unique constraint') || error.message.includes('duplicate') || (error as any)?.code === 'P2002') {
          // Job might have been created between check and creation
          console.log("[validate-citations] Checking for existing job after constraint error")
          const existingJobAfterError = await prisma.validationJob.findUnique({
            where: { checkId: params.id },
          })
          if (existingJobAfterError) {
            console.log(`[validate-citations] Found existing job: ${existingJobAfterError.id}`)
            return NextResponse.json({
              jobId: existingJobAfterError.id,
              checkId: checkIdToUse,
              status: existingJobAfterError.status,
              message: "Job already exists",
            })
          }
        }
      }
      throw error // Re-throw to be caught by outer catch
    }

    // Trigger worker to start processing (call directly instead of fetch)
    try {
      console.log(`[validate-citations] Starting worker processing directly`)
      // Import worker function directly
      const { processQueueItems } = await import("@/lib/citation-identification/worker")
      console.log(`[validate-citations] Worker function imported successfully`)
      
      // Process first batch asynchronously (don't await to avoid blocking response)
      processQueueItems(5)
        .then((result) => {
          console.log(`[validate-citations] Worker processed ${result.processed} items:`, result.itemIds)
          // Continue processing more items asynchronously if needed
          if (result.processed > 0) {
            const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
            console.log(`[validate-citations] Triggering continuation batch`)
            fetch(`${baseUrl}/api/citation-checker/worker/process-queue?maxItems=5`, {
              method: 'POST',
            })
              .then((res) => {
                console.log(`[validate-citations] Continuation batch triggered: ${res.status}`)
              })
              .catch((err) => {
                console.error(`[validate-citations] Error triggering continuation:`, err)
              })
          } else {
            console.log(`[validate-citations] No items processed, not triggering continuation`)
          }
        })
        .catch((err) => {
          console.error("[validate-citations] Error in worker processing:", err)
          if (err instanceof Error) {
            console.error("[validate-citations] Worker error details:", err.message, err.stack)
          }
        })
      console.log(`[validate-citations] Worker processing started (async)`)
    } catch (workerError) {
      // Don't fail the request if worker trigger fails
      console.error("[validate-citations] Error starting worker:", workerError)
      if (workerError instanceof Error) {
        console.error("[validate-citations] Worker start error details:", workerError.message, workerError.stack)
      }
    }
    
    console.log(`[validate-citations] Returning success response with jobId: ${jobId}`)

    return NextResponse.json({
      jobId,
      checkId: checkIdToUse, // Return the checkId being used (may be new version if force=true)
      status: 'pending',
      message: 'Validation job created and processing started',
    })
  } catch (error) {
    console.error("[validate-citations] Top-level error caught:", error)
    if (error instanceof Error) {
      console.error("[validate-citations] Error name:", error.name)
      console.error("[validate-citations] Error message:", error.message)
      console.error("[validate-citations] Error stack:", error.stack)
      
      // Check for Prisma errors
      if ((error as any).code) {
        console.error("[validate-citations] Prisma error code:", (error as any).code)
      }
      if ((error as any).meta) {
        console.error("[validate-citations] Prisma error meta:", (error as any).meta)
      }
    } else {
      console.error("[validate-citations] Non-Error object:", JSON.stringify(error, null, 2))
    }
    
    return NextResponse.json(
      { 
        error: "Failed to create validation job",
        details: error instanceof Error ? error.message : String(error),
        ...(process.env.NODE_ENV === 'development' && error instanceof Error && {
          stack: error.stack,
          name: error.name,
        })
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

