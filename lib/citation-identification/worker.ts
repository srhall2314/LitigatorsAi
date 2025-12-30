import { getNextQueueItem, markQueueItemProcessing, markQueueItemCompleted, markQueueItemFailed, checkJobCompletion } from "@/lib/citation-identification/queue"
import { validateCitationWithPanel, validateCitationTier3 } from "@/lib/citation-identification/validation"
import { extractDocumentContext } from "@/lib/citation-identification/context-extractor"
import { ANTHROPIC_API_KEY } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

/**
 * Process queue items directly (can be called from API routes or worker endpoint)
 */
export async function processQueueItems(maxItems: number = 5): Promise<{ processed: number; itemIds: string[]; hasMore: boolean; remainingPending: number }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key not configured")
  }

  logger.debug(`Processing up to ${maxItems} items`, { maxItems }, 'Worker')
  const processed: string[] = []

  for (let i = 0; i < maxItems; i++) {
    logger.debug(`Getting next queue item`, { iteration: i + 1, maxItems }, 'Worker')
    const queueItem = await getNextQueueItem()

    if (!queueItem) {
      logger.debug('No more queue items to process', undefined, 'Worker')
      break // No more items to process
    }

    logger.debug(`Found queue item`, { itemId: queueItem.id, jobId: queueItem.jobId, citationId: queueItem.citationId, tier: queueItem.tier }, 'Worker')

    try {
      logger.debug(`Marking queue item as processing`, { itemId: queueItem.id }, 'Worker')
      await markQueueItemProcessing(queueItem.id)

      const check = queueItem.job.check
      logger.debug(`Processing citation from check`, { citationId: queueItem.citationId, checkId: check.id }, 'Worker')

      if (!check.jsonData) {
        throw new Error(`CitationCheck ${check.id} has no jsonData`)
      }

      const jsonData = check.jsonData as any

      if (!jsonData || typeof jsonData !== 'object') {
        throw new Error(`Invalid jsonData structure in CitationCheck ${check.id}`)
      }

      if (!jsonData.document) {
        throw new Error(`Missing document in jsonData for CitationCheck ${check.id}`)
      }

      const citations = jsonData.document?.citations || []

      if (!Array.isArray(citations)) {
        throw new Error(`Invalid citations array in CitationCheck ${check.id}`)
      }

      const citation = citations[queueItem.citationIndex]

      if (!citation) {
        throw new Error(`Citation not found at index ${queueItem.citationIndex} in CitationCheck ${check.id} (total citations: ${citations.length})`)
      }

      if (!citation.id) {
        throw new Error(`Citation at index ${queueItem.citationIndex} is missing id field`)
      }

      const context = extractDocumentContext(citation.id, jsonData, true)

      if (queueItem.tier === 'tier2') {
        // Process Tier 2 validation
        logger.debug(`Starting Tier 2 validation for citation`, { citationId: queueItem.citationId }, 'Worker')
        const validation = await validateCitationWithPanel(
          citation,
          context,
          ANTHROPIC_API_KEY
        )

        logger.debug(`Tier 2 validation complete`, { citationId: queueItem.citationId, needsTier3: validation.consensus.tier_3_trigger }, 'Worker')
        const needsTier3 = validation.consensus.tier_3_trigger
        
        // markQueueItemCompleted now throws on failure, so we catch it here
        try {
          await markQueueItemCompleted(queueItem.id, validation, needsTier3)
          logger.debug(`Queue item marked as completed and verified`, { itemId: queueItem.id }, 'Worker')
          processed.push(queueItem.id)
        } catch (error) {
          // markQueueItemCompleted already marked it as failed, just log and continue
          logger.error(`Failed to complete queue item ${queueItem.id}`, error, 'Worker')
          // Don't add to processed list - it will be retried
          throw error // Re-throw to trigger outer catch block
        }

      } else if (queueItem.tier === 'tier3') {
        // Process Tier 3 validation
        // Need to get Tier 2 result first
        const tier2Item = await prisma.validationQueueItem.findFirst({
          where: {
            jobId: queueItem.jobId,
            citationId: queueItem.citationId,
            tier: 'tier2',
          },
        })

        if (!tier2Item?.result) {
          throw new Error('Tier 2 result not found')
        }

        const tier3Result = await validateCitationTier3(
          citation,
          context,
          tier2Item.result as any,
          ANTHROPIC_API_KEY
        )

        // markQueueItemCompleted now throws on failure, so we catch it here
        try {
          await markQueueItemCompleted(queueItem.id, tier3Result, false)
          logger.debug(`Queue item marked as completed and verified`, { itemId: queueItem.id }, 'Worker')
          processed.push(queueItem.id)
        } catch (error) {
          // markQueueItemCompleted already marked it as failed, just log and continue
          logger.error(`Failed to complete queue item ${queueItem.id}`, error, 'Worker')
          // Don't add to processed list - it will be retried
          throw error // Re-throw to trigger outer catch block
        }
      }

      logger.debug(`Processed item`, { itemId: queueItem.id, processedCount: processed.length, maxItems }, 'Worker')

      // Check if job is complete
      const isComplete = await checkJobCompletion(queueItem.jobId)
      if (isComplete) {
        logger.debug(`Job is now complete`, { jobId: queueItem.jobId }, 'Worker')
      }

    } catch (error) {
      logger.error(`Error processing queue item ${queueItem.id}`, error, 'Worker')
      await markQueueItemFailed(
        queueItem.id,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  logger.debug(`Worker completed`, { processedCount: processed.length, itemIds: processed }, 'Worker')
  
  // Check if there are more pending items to process
  const remainingPending = await prisma.validationQueueItem.count({
    where: {
      status: 'pending',
    },
  })
  
  logger.debug(`Remaining pending items`, { remainingPending }, 'Worker')
  
  return {
    processed: processed.length,
    itemIds: processed,
    hasMore: remainingPending > 0,
    remainingPending,
  }
}

