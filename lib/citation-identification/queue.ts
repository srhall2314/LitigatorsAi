import { prisma } from "@/lib/prisma"
import { CitationDocument } from "@/types/citation-json"
import { logger } from "@/lib/logger"

/**
 * Create a validation job and queue items for all citations
 */
export async function createValidationJob(
  checkId: string,
  jsonData: CitationDocument
): Promise<string> {
  // Validate prisma is initialized
  if (!prisma) {
    throw new Error("Prisma client is not initialized")
  }

  // Validate input
  if (!jsonData || !jsonData.document) {
    throw new Error("Invalid jsonData: missing document structure")
  }

  const citations = jsonData.document?.citations || []
  
  if (!Array.isArray(citations)) {
    throw new Error(`Invalid citations: expected array, got ${typeof citations}`)
  }

  if (citations.length === 0) {
    throw new Error("No citations found in document")
  }

  // Validate citation structure
  for (let i = 0; i < citations.length; i++) {
    const citation = citations[i]
    if (!citation || typeof citation !== 'object') {
      throw new Error(`Invalid citation at index ${i}: not an object`)
    }
    if (!citation.id || typeof citation.id !== 'string') {
      throw new Error(`Invalid citation at index ${i}: missing or invalid id field`)
    }
  }
  
  // Create job
  let job
  try {
    job = await prisma.validationJob.create({
      data: {
        checkId,
        status: 'pending',
        tier2Total: citations.length,
        tier2Completed: 0,
        tier3Total: 0,
        tier3Completed: 0,
      },
    })
  } catch (error: any) {
    // Check if it's a unique constraint violation
    if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
      // Job already exists - this shouldn't happen if route checks first, but handle gracefully
      const existingJob = await prisma.validationJob.findUnique({
        where: { checkId },
      })
      if (existingJob) {
        return existingJob.id
      }
    }
    throw error
  }
  
  // Create queue items for Tier 2 validation
  const queueItems = citations.map((citation, index) => ({
    jobId: job.id,
    citationId: citation.id,
    citationIndex: index,
    tier: 'tier2',
    status: 'pending' as const,
  }))
  
  try {
    await prisma.validationQueueItem.createMany({
      data: queueItems,
    })
  } catch (error: any) {
    // If queue item creation fails, clean up the job
    await prisma.validationJob.delete({
      where: { id: job.id },
    }).catch(() => {
      // Ignore cleanup errors
    })
    throw new Error(`Failed to create queue items: ${error.message || String(error)}`)
  }
  
  return job.id
}

// Processing timeout: reset items stuck in "processing" status for more than 10 minutes
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Reset queue items stuck in "processing" status
 */
export async function resetStuckProcessingItems(): Promise<number> {
  const timeoutDate = new Date(Date.now() - PROCESSING_TIMEOUT_MS)
  
  const result = await prisma.validationQueueItem.updateMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: timeoutDate,
      },
    },
    data: {
      status: 'pending',
      error: 'Reset due to processing timeout',
    },
  })
  
  if (result.count > 0) {
    logger.debug(`Reset ${result.count} stuck processing items`, { count: result.count }, 'Queue')
  }
  
  return result.count
}

/**
 * Get next pending queue item to process
 * Automatically resets stuck processing items before fetching
 */
export async function getNextQueueItem() {
  // Reset stuck items first
  await resetStuckProcessingItems()
  
  return await prisma.validationQueueItem.findFirst({
    where: {
      status: 'pending',
    },
    include: {
      job: {
        include: {
          check: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

/**
 * Mark queue item as processing
 */
export async function markQueueItemProcessing(itemId: string): Promise<void> {
  await prisma.validationQueueItem.update({
    where: { id: itemId },
    data: {
      status: 'processing',
      updatedAt: new Date(),
    },
  })
}

/**
 * Mark queue item as completed with result
 * Uses transaction to ensure atomicity and includes error handling
 */
export async function markQueueItemCompleted(
  itemId: string,
  result: any,
  needsTier3: boolean
): Promise<void> {
  const item = await prisma.validationQueueItem.findUnique({
    where: { id: itemId },
    include: { job: true },
  })
  
  if (!item) {
    logger.error(`Queue item ${itemId} not found`, undefined, 'Queue')
    return
  }
  
  try {
    // Use transaction to ensure all operations succeed or fail together
    await prisma.$transaction(async (tx) => {
      // Update queue item
      await tx.validationQueueItem.update({
        where: { id: itemId },
        data: {
          status: 'completed',
          result: result as any,
          processedAt: new Date(),
        },
      })
      
      // Update job progress
      const updateData: any = {}
      
      if (item.tier === 'tier2') {
        updateData.tier2Completed = { increment: 1 }
        
        if (needsTier3) {
          updateData.tier3Total = { increment: 1 }
          // Create Tier 3 queue item
          await tx.validationQueueItem.create({
            data: {
              jobId: item.jobId,
              citationId: item.citationId,
              citationIndex: item.citationIndex,
              tier: 'tier3',
              status: 'pending',
            },
          })
        }
      } else if (item.tier === 'tier3') {
        updateData.tier3Completed = { increment: 1 }
      }
      
      // Update job with progress
      if (Object.keys(updateData).length > 0) {
        await tx.validationJob.update({
          where: { id: item.jobId },
          data: updateData,
        })
      }
    })
    
    // Update CitationCheck jsonData with result (outside transaction to avoid long locks)
    // Use citationId instead of citationIndex to avoid mismatches
    const updateSucceeded = await updateCitationInCheck(
      item.job.checkId,
      item.citationId,
      result,
      item.tier
    )
    
    if (!updateSucceeded) {
      // Citation update failed - mark queue item as failed for retry
      logger.error(`Failed to update citation ${item.citationId}, marking queue item as failed`, undefined, 'Queue')
      await markQueueItemFailed(
        itemId,
        `Failed to update citation in jsonData: citation update returned false`
      )
      throw new Error(`Failed to update citation ${item.citationId} in check ${item.job.checkId}`)
    }
    
    // Verify citation was actually updated (Fix 3: Verification Step)
    const verificationSucceeded = await verifyCitationUpdate(
      item.job.checkId,
      item.citationId,
      item.tier
    )
    
    if (!verificationSucceeded) {
      // Verification failed - mark queue item as failed for retry
      logger.error(`Verification failed for citation ${item.citationId}, marking queue item as failed`, undefined, 'Queue')
      await markQueueItemFailed(
        itemId,
        `Verification failed: citation does not have ${item.tier} validation after update`
      )
      throw new Error(`Verification failed for citation ${item.citationId}`)
    }
    
    logger.debug(`Successfully completed queue item ${itemId} for citation ${item.citationId}`, { itemId, citationId: item.citationId }, 'Queue')
  } catch (error) {
    // If any step fails, mark as failed for retry
    logger.error(`Error completing queue item ${itemId}`, error, 'Queue')
    await markQueueItemFailed(
      itemId,
      error instanceof Error ? error.message : String(error)
    )
    throw error // Re-throw to let caller know it failed
  }
}

/**
 * Mark queue item as failed
 */
export async function markQueueItemFailed(
  itemId: string,
  error: string
): Promise<void> {
  const item = await prisma.validationQueueItem.findUnique({
    where: { id: itemId },
  })
  
  if (!item) return
  
  await prisma.validationQueueItem.update({
    where: { id: itemId },
    data: {
      status: 'failed',
      error,
      retryCount: { increment: 1 },
    },
  })
  
  // Update job status if too many failures
  const updatedItem = await prisma.validationQueueItem.findUnique({
    where: { id: itemId },
  })
  
  if (updatedItem && updatedItem.retryCount >= 3) {
    await prisma.validationJob.update({
      where: { id: item.jobId },
      data: {
        status: 'failed',
        error: `Too many failures for citation ${item.citationId}`,
      },
    })
  }
}

/**
 * Update citation result in CitationCheck jsonData
 * Uses citationId instead of citationIndex to avoid index mismatches
 * Returns true if update succeeded, false otherwise
 */
async function updateCitationInCheck(
  checkId: string,
  citationId: string,
  result: any,
  tier: string
): Promise<boolean> {
  try {
    // Use transaction to prevent race conditions
    return await prisma.$transaction(async (tx) => {
      const check = await tx.citationCheck.findUnique({
        where: { id: checkId },
      })
      
      if (!check?.jsonData) {
        logger.error(`Check ${checkId} has no jsonData`, undefined, 'Queue')
        return false
      }
      
      const jsonData = check.jsonData as any
      const citations = jsonData.document?.citations || []
      
      // Find citation by ID instead of index to avoid mismatches
      const citationIndex = citations.findIndex((c: any) => c.id === citationId)
      
      if (citationIndex === -1) {
        logger.error(`Citation ${citationId} not found in check ${checkId}`, { citationId, checkId }, 'Queue')
        return false
      }
      
      const citation = citations[citationIndex]
      
      // Idempotency check: if citation already has validation for this tier, skip update
      if (tier === 'tier2' && citation.validation) {
        logger.warn(`Citation ${citationId} already has validation, skipping update`, { citationId, tier }, 'Queue')
        return true // Consider it successful since validation already exists
      }
      if (tier === 'tier3' && citation.tier_3) {
        logger.warn(`Citation ${citationId} already has tier_3, skipping update`, { citationId, tier }, 'Queue')
        return true // Consider it successful since tier_3 already exists
      }
      
      // Update citation
      if (tier === 'tier2') {
        citations[citationIndex].validation = result
        // Clear Tier 3 if it's no longer needed (when tier_3_trigger becomes false)
        if (!result?.consensus?.tier_3_trigger) {
          citations[citationIndex].tier_3 = null
        }
      } else if (tier === 'tier3') {
        citations[citationIndex].tier_3 = result
      }
      
      // Update with transaction to ensure atomicity
      await tx.citationCheck.update({
        where: { id: checkId },
        data: {
          jsonData: jsonData as any,
        },
      })
      
      logger.debug(`Successfully updated citation ${citationId}`, { citationId, tier, checkId }, 'Queue')
      return true
    })
  } catch (error) {
    logger.error(`Error updating citation ${citationId} in check ${checkId}`, error, 'Queue')
    return false
  }
}

/**
 * Verify that citation has validation data after update
 */
async function verifyCitationUpdate(
  checkId: string,
  citationId: string,
  tier: string
): Promise<boolean> {
  try {
    const check = await prisma.citationCheck.findUnique({
      where: { id: checkId },
    })
    
    if (!check?.jsonData) return false
    
    const jsonData = check.jsonData as any
    const citations = jsonData.document?.citations || []
    const citation = citations.find((c: any) => c.id === citationId)
    
    if (!citation) return false
    
    if (tier === 'tier2') {
      return !!citation.validation
    } else if (tier === 'tier3') {
      return !!citation.tier_3
    }
    
    return false
  } catch (error) {
    logger.error(`Error verifying citation ${citationId}`, error, 'Queue')
    return false
  }
}

/**
 * Retry unvalidated citations up to 3 times
 * Enhanced to handle both Tier 2 and Tier 3 citations
 */
export async function retryUnvalidatedCitations(jobId: string): Promise<number> {
  const job = await prisma.validationJob.findUnique({
    where: { id: jobId },
    include: {
      check: true,
      queueItems: true,
    },
  })
  
  if (!job || !job.check?.jsonData) return 0
  
  const jsonData = job.check.jsonData as any
  const citations = jsonData.document?.citations || []
  
  let retryCount = 0
  
  // Check each citation for missing validation
  for (let i = 0; i < citations.length; i++) {
    const citation = citations[i]
    const citationId = citation.id
    
    // ===== TIER 2 VALIDATION CHECKS =====
    const tier2Item = job.queueItems.find(
      item => item.citationId === citationId && item.tier === 'tier2'
    )
    
    const hasTier2Validation = !!citation.validation
    
    // Skip if citation already has validation and queue item is completed
    if (hasTier2Validation && tier2Item?.status === 'completed') {
      // Check if Tier 3 is needed
      const needsTier3 = citation.validation?.consensus?.tier_3_trigger === true
      const hasTier3 = !!citation.tier_3
      
      if (needsTier3 && !hasTier3) {
        // Citation needs Tier 3 but doesn't have it - check Tier 3 queue item
        const tier3Item = job.queueItems.find(
          item => item.citationId === citationId && item.tier === 'tier3'
        )
        
        // If no Tier 3 item exists, create one
        if (!tier3Item) {
          await prisma.validationQueueItem.create({
            data: {
              jobId: job.id,
              citationId: citationId,
              citationIndex: i,
              tier: 'tier3',
              status: 'pending',
              retryCount: 0,
            },
          })
          retryCount++
          logger.debug(`Creating Tier 3 queue item for citation ${citationId}`, { citationId }, 'Queue')
          continue
        }
        
        // If Tier 3 item exists but is failed/stuck, retry it
        if (tier3Item.status === 'failed' && tier3Item.retryCount < 3) {
          await prisma.validationQueueItem.update({
            where: { id: tier3Item.id },
            data: {
              status: 'pending',
              error: null,
              updatedAt: new Date(),
            },
          })
          retryCount++
          logger.debug(`Retrying Tier 3 for citation ${citationId}`, { citationId, attempt: tier3Item.retryCount + 1 }, 'Queue')
          continue
        }
        
        // If Tier 3 item is stuck in processing
        if (tier3Item.status === 'processing') {
          const processingTime = Date.now() - tier3Item.updatedAt.getTime()
          if (processingTime > PROCESSING_TIMEOUT_MS) {
            await prisma.validationQueueItem.update({
              where: { id: tier3Item.id },
              data: {
                status: 'pending',
                error: 'Reset due to processing timeout',
                updatedAt: new Date(),
              },
            })
            retryCount++
            logger.debug(`Resetting stuck Tier 3 item for citation ${citationId}`, { citationId }, 'Queue')
            continue
          }
        }
        
        // If Tier 3 item is completed but citation has no tier_3, retry it
        if (tier3Item.status === 'completed' && !hasTier3) {
          await prisma.validationQueueItem.update({
            where: { id: tier3Item.id },
            data: {
              status: 'pending',
              error: 'Citation missing Tier 3 despite completed status',
              retryCount: 0, // Reset retry count
              updatedAt: new Date(),
            },
          })
          retryCount++
          logger.debug(`Retrying Tier 3 for citation ${citationId} - missing result`, { citationId }, 'Queue')
          continue
        }
      }
      
      continue // Tier 2 is complete, move to next citation
    }
    
    // CRITICAL: If queue item is "completed" but citation has no validation, retry it
    if (!hasTier2Validation && tier2Item?.status === 'completed') {
      logger.warn(`Found completed queue item for citation ${citationId} but citation has no validation - resetting for retry`, { citationId }, 'Queue')
      await prisma.validationQueueItem.update({
        where: { id: tier2Item.id },
        data: {
          status: 'pending',
          error: 'Citation missing validation despite completed status',
          retryCount: 0, // RESET retry count
          updatedAt: new Date(),
        },
      })
      retryCount++
      continue
    }
    
    // If item failed and retryCount < 3, reset to pending
    if (tier2Item?.status === 'failed' && tier2Item.retryCount < 3) {
      await prisma.validationQueueItem.update({
        where: { id: tier2Item.id },
        data: {
          status: 'pending',
          error: null,
          updatedAt: new Date(),
        },
      })
      retryCount++
      logger.debug(`Retrying failed citation ${citationId}`, { citationId, attempt: tier2Item.retryCount + 1 }, 'Queue')
      continue
    }
    
    // If item is stuck in processing, reset it
    if (tier2Item?.status === 'processing') {
      const processingTime = Date.now() - tier2Item.updatedAt.getTime()
      if (processingTime > PROCESSING_TIMEOUT_MS) {
        logger.warn(`Found stuck processing item for citation ${citationId} - resetting`, { citationId, processingTime }, 'Queue')
        await prisma.validationQueueItem.update({
          where: { id: tier2Item.id },
          data: {
            status: 'pending',
            error: 'Reset due to processing timeout',
            updatedAt: new Date(),
          },
        })
        retryCount++
        continue
      }
    }
    
    // If citation has no validation and no queue item exists, create one
    if (!hasTier2Validation && !tier2Item) {
      await prisma.validationQueueItem.create({
        data: {
          jobId: job.id,
          citationId: citationId,
          citationIndex: i,
          tier: 'tier2',
          status: 'pending',
          retryCount: 0,
        },
      })
      retryCount++
      logger.debug(`Creating new queue item for unvalidated citation ${citationId}`, { citationId }, 'Queue')
    }
  }
  
  if (retryCount > 0) {
    logger.debug(`Retrying ${retryCount} unvalidated citations for job ${jobId}`, { retryCount, jobId }, 'Queue')
  }
  
  return retryCount
}

/**
 * Check if job is complete and update status
 * Also retries unvalidated citations if job appears complete
 * Enhanced to prevent completion with unvalidated citations
 */
export async function checkJobCompletion(jobId: string): Promise<boolean> {
  // Reset stuck processing items first
  await resetStuckProcessingItems()
  
  const job = await prisma.validationJob.findUnique({
    where: { id: jobId },
    include: {
      check: true,
      queueItems: true,
    },
  })
  
  if (!job) return false
  
  // Refresh queue items after reset
  const refreshedQueueItems = await prisma.validationQueueItem.findMany({
    where: { jobId: jobId },
  })
  
  const pendingItems = refreshedQueueItems.filter(item => 
    item.status === 'pending' || item.status === 'processing'
  )
  
  if (pendingItems.length === 0) {
    // Check for unvalidated citations and retry them (up to 3 times)
    const retriedCount = await retryUnvalidatedCitations(jobId)
    
    if (retriedCount > 0) {
      // Job is not complete - citations are being retried
      logger.debug(`Job ${jobId} has ${retriedCount} citations being retried`, { jobId, retriedCount }, 'Queue')
      return false
    }
    
    // Verify all citations are actually validated
    if (job.check?.jsonData) {
      const jsonData = job.check.jsonData as any
      const citations = jsonData.document?.citations || []
      
      // Check for missing Tier 2 validation
      const unvalidatedTier2 = citations.filter((c: any) => !c.validation).length
      
      // Check for missing Tier 3 when needed
      const unvalidatedTier3 = citations.filter((c: any) => 
        c.validation?.consensus?.tier_3_trigger === true && !c.tier_3
      ).length
      
      const totalUnvalidated = unvalidatedTier2 + unvalidatedTier3
      
      if (totalUnvalidated > 0) {
        logger.warn(`Job ${jobId} appears complete but ${totalUnvalidated} citations are missing validation`, { jobId, totalUnvalidated, unvalidatedTier2, unvalidatedTier3 }, 'Queue')
        
        // DON'T mark as complete - return false to allow more retries
        // Only mark as complete if we've exhausted all retry attempts
        // Check if there are any failed items that haven't reached max retries
        const hasRetriesAvailable = refreshedQueueItems.some(item => 
          item.status === 'failed' && item.retryCount < 3
        )
        
        if (hasRetriesAvailable) {
          return false // Still have retries available
        }
        
        // Max retries reached - mark as failed instead of complete
        await prisma.validationJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            error: `${totalUnvalidated} citations could not be validated after max retries (Tier 2: ${unvalidatedTier2}, Tier 3: ${unvalidatedTier3})`,
          },
        })
        return false
      }
    }
    
    // All citations validated
    await prisma.validationJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
      },
    })
    
    await prisma.citationCheck.update({
      where: { id: job.checkId },
      data: {
        status: 'citations_validated',
      },
    })
    
    logger.debug(`Job ${jobId} marked as completed`, { jobId }, 'Queue')
    return true
  }
  
  return false
}

