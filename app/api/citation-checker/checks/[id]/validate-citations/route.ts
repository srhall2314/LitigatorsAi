import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createValidationJob, retryUnvalidatedCitations, checkJobCompletion } from "@/lib/citation-identification/queue"
import { ANTHROPIC_API_KEY } from "@/lib/env"
import { CitationDocument } from "@/types/citation-json"
import { canModifyWorkflow } from "@/lib/access-control"
import { requireAuth, handleApiError, getNextVersionNumber } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"
import { deepClone } from "@/lib/utils"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    logger.debug(`POST request received for checkId`, { checkId: id }, 'ValidateCitations')
    logger.debug(`Processing validation job creation`, { checkId: id }, 'ValidateCitations')

    // Validate prisma is initialized
    if (!prisma) {
      logger.error("Prisma client is not initialized", undefined, 'ValidateCitations')
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      )
    }

    // Debug: Check if validationJob model exists
    if (!prisma.validationJob) {
      logger.error("prisma.validationJob is undefined", undefined, 'ValidateCitations')
      logger.error("Available models", { models: Object.keys(prisma).filter(key => !key.startsWith('$') && !key.startsWith('_')) }, 'ValidateCitations')
      return NextResponse.json(
        { error: "Database model not available. Please restart the server." },
        { status: 500 }
      )
    }

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      )
    }

    // Get the current CitationCheck
    const currentCheck = await prisma.citationCheck.findUnique({
      where: { id },
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

    // Check if user can modify workflow
    const canModify = await canModifyWorkflow(user.id, id)
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Cast jsonData to CitationDocument type
    let jsonData: CitationDocument
    try {
      jsonData = currentCheck.jsonData as unknown as CitationDocument
    } catch (error) {
      logger.error("Error casting jsonData", error, 'ValidateCitations')
      return NextResponse.json(
        { error: "Invalid JSON data format" },
        { status: 400 }
      )
    }

    // Validate jsonData structure
    if (!jsonData || typeof jsonData !== 'object') {
      logger.error("Invalid jsonData structure", { type: typeof jsonData, data: jsonData }, 'ValidateCitations')
      return NextResponse.json(
        { error: "Invalid JSON data structure" },
        { status: 400 }
      )
    }

    if (!jsonData.document) {
      logger.error("Missing document in jsonData", { keys: Object.keys(jsonData) }, 'ValidateCitations')
      return NextResponse.json(
        { error: "JSON data missing document structure" },
        { status: 400 }
      )
    }

    if (!jsonData.document.citations || !Array.isArray(jsonData.document.citations)) {
      logger.error("Invalid citations array", { citations: jsonData.document.citations }, 'ValidateCitations')
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
    logger.debug(`Checking for existing job`, { checkId: id, forceRerun }, 'ValidateCitations')
    const existingJob = await prisma.validationJob.findUnique({
      where: { checkId: id },
    })

    let checkIdToUse = id
    let jsonDataToUse = jsonData

    if (existingJob) {
      if (forceRerun) {
        // Create a new CitationCheck version for rerun (to preserve history)
        logger.debug(`Force rerun requested, creating new CitationCheck version`, undefined, 'ValidateCitations')
        
        // Get the latest version for this fileUploadId to determine next version number
        const nextVersion = await getNextVersionNumber(currentCheck.fileUploadId)

        // Copy jsonData but clear ALL validation results for fresh validation
        // Start with clean Tier 1 citation data only
        const freshJsonData = deepClone(jsonData)
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

        logger.debug(`Created new CitationCheck version`, { checkId: newCheck.id, version: nextVersion }, 'ValidateCitations')
        checkIdToUse = newCheck.id
        jsonDataToUse = freshJsonData

        // Delete existing job and all its queue items
        logger.debug(`Deleting existing job`, { jobId: existingJob.id }, 'ValidateCitations')
        await prisma.validationQueueItem.deleteMany({
          where: { jobId: existingJob.id },
        })
        await prisma.validationJob.delete({
          where: { id: existingJob.id },
        })
        logger.debug(`Existing job deleted, will create new one for new check`, undefined, 'ValidateCitations')
      } else {
        // Return existing job (original behavior)
        logger.debug(`Existing job found`, { jobId: existingJob.id, status: existingJob.status }, 'ValidateCitations')
        
        // Check for unvalidated citations and retry them (up to 3 times)
        const retriedCount = await retryUnvalidatedCitations(existingJob.id)
        if (retriedCount > 0) {
          logger.info(`Retried unvalidated citations`, { count: retriedCount, jobId: existingJob.id }, 'ValidateCitations')
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
        
        logger.debug(`Pending queue items`, { count: pendingItems }, 'ValidateCitations')
        
        // If there are pending items, trigger worker to process them
        if (pendingItems > 0) {
          logger.debug(`Triggering worker to process pending items`, { count: pendingItems }, 'ValidateCitations')
          try {
            const { processQueueItems } = await import("@/lib/citation-identification/worker")
            processQueueItems(5)
              .then((result) => {
                logger.debug(`Worker processed items for existing job`, { processed: result.processed }, 'ValidateCitations')
              })
              .catch((err) => {
                logger.error("Error processing existing job", err, 'ValidateCitations')
              })
          } catch (err) {
            logger.error("Error starting worker for existing job", err, 'ValidateCitations')
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
    
    logger.debug(`No existing job found, creating new one`, undefined, 'ValidateCitations')

    // Create validation job and queue items
    let jobId: string
    try {
      logger.debug(`Creating validation job`, { checkId: checkIdToUse, citationsCount: jsonDataToUse.document.citations.length }, 'ValidateCitations')
      
      jobId = await createValidationJob(checkIdToUse, jsonDataToUse)
      
      if (!jobId) {
        throw new Error("createValidationJob returned undefined jobId")
      }
      
      logger.info(`Successfully created job`, { jobId }, 'ValidateCitations')
    } catch (error) {
      logger.error("Error in createValidationJob", error, 'ValidateCitations')
      if (error instanceof Error) {
        // Check if it's a unique constraint violation
        if (error.message.includes('Unique constraint') || error.message.includes('duplicate') || (error as any)?.code === 'P2002') {
          // Job might have been created between check and creation
          logger.debug("Checking for existing job after constraint error", undefined, 'ValidateCitations')
          const existingJobAfterError = await prisma.validationJob.findUnique({
            where: { checkId: id },
          })
          if (existingJobAfterError) {
            logger.debug(`Found existing job`, { jobId: existingJobAfterError.id }, 'ValidateCitations')
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
      logger.debug(`Starting worker processing directly`, undefined, 'ValidateCitations')
      // Import worker function directly
      const { processQueueItems } = await import("@/lib/citation-identification/worker")
      logger.debug(`Worker function imported successfully`, undefined, 'ValidateCitations')
      
      // Process first batch asynchronously (don't await to avoid blocking response)
      processQueueItems(5)
        .then((result) => {
          logger.debug(`Worker processed items`, { processed: result.processed, itemIds: result.itemIds }, 'ValidateCitations')
          // Continue processing more items asynchronously if needed
          if (result.processed > 0) {
            const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
            logger.debug(`Triggering continuation batch`, undefined, 'ValidateCitations')
            fetch(`${baseUrl}/api/citation-checker/worker/process-queue?maxItems=5`, {
              method: 'POST',
            })
              .then((res) => {
                logger.debug(`Continuation batch triggered`, { status: res.status }, 'ValidateCitations')
              })
              .catch((err) => {
                logger.error(`Error triggering continuation`, err, 'ValidateCitations')
              })
          } else {
            logger.debug(`No items processed, not triggering continuation`, undefined, 'ValidateCitations')
          }
        })
        .catch((err) => {
          logger.error("Error in worker processing", err, 'ValidateCitations')
        })
      logger.debug(`Worker processing started (async)`, undefined, 'ValidateCitations')
    } catch (workerError) {
      // Don't fail the request if worker trigger fails
      logger.error("Error starting worker", workerError, 'ValidateCitations')
    }
    
    logger.debug(`Returning success response`, { jobId }, 'ValidateCitations')

    return NextResponse.json({
      jobId,
      checkId: checkIdToUse, // Return the checkId being used (may be new version if force=true)
      status: 'pending',
      message: 'Validation job created and processing started',
    })
  } catch (error) {
    return handleApiError(error, 'ValidateCitations')
  }
}

// GET endpoint - check for existing job or return error
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if a validation job exists for this check
    const job = await prisma.validationJob.findUnique({
      where: { checkId: id },
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
    return handleApiError(error, 'GetValidationStatus')
  }
}

