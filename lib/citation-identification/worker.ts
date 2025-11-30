import { getNextQueueItem, markQueueItemProcessing, markQueueItemCompleted, markQueueItemFailed, checkJobCompletion } from "@/lib/citation-identification/queue"
import { validateCitationWithPanel, validateCitationTier3 } from "@/lib/citation-identification/validation"
import { extractDocumentContext } from "@/lib/citation-identification/context-extractor"
import { ANTHROPIC_API_KEY } from "@/lib/env"
import { prisma } from "@/lib/prisma"

/**
 * Process queue items directly (can be called from API routes or worker endpoint)
 */
export async function processQueueItems(maxItems: number = 5): Promise<{ processed: number; itemIds: string[]; hasMore: boolean; remainingPending: number }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key not configured")
  }

  console.log(`[worker] Processing up to ${maxItems} items`)
  const processed: string[] = []

  for (let i = 0; i < maxItems; i++) {
    console.log(`[worker] Getting next queue item (iteration ${i + 1}/${maxItems})`)
    const queueItem = await getNextQueueItem()

    if (!queueItem) {
      console.log('[worker] No more queue items to process')
      break // No more items to process
    }

    console.log(`[worker] Found queue item: ${queueItem.id} (job: ${queueItem.jobId}, citation: ${queueItem.citationId}, tier: ${queueItem.tier})`)

    try {
      console.log(`[worker] Marking queue item ${queueItem.id} as processing`)
      await markQueueItemProcessing(queueItem.id)

      const check = queueItem.job.check
      console.log(`[worker] Processing citation ${queueItem.citationId} from check ${check.id}`)

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
        console.log(`[worker] Starting Tier 2 validation for citation ${queueItem.citationId}`)
        const validation = await validateCitationWithPanel(
          citation,
          context,
          ANTHROPIC_API_KEY
        )

        console.log(`[worker] Tier 2 validation complete. Needs Tier 3: ${validation.consensus.tier_3_trigger}`)
        const needsTier3 = validation.consensus.tier_3_trigger
        
        // markQueueItemCompleted now throws on failure, so we catch it here
        try {
          await markQueueItemCompleted(queueItem.id, validation, needsTier3)
          console.log(`[worker] Queue item ${queueItem.id} marked as completed and verified`)
          processed.push(queueItem.id)
        } catch (error) {
          // markQueueItemCompleted already marked it as failed, just log and continue
          console.error(`[worker] Failed to complete queue item ${queueItem.id}:`, error)
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
          console.log(`[worker] Queue item ${queueItem.id} marked as completed and verified`)
          processed.push(queueItem.id)
        } catch (error) {
          // markQueueItemCompleted already marked it as failed, just log and continue
          console.error(`[worker] Failed to complete queue item ${queueItem.id}:`, error)
          // Don't add to processed list - it will be retried
          throw error // Re-throw to trigger outer catch block
        }
      }

      console.log(`[worker] Processed item ${queueItem.id} (${processed.length}/${maxItems} in this batch)`)

      // Check if job is complete
      const isComplete = await checkJobCompletion(queueItem.jobId)
      if (isComplete) {
        console.log(`[worker] Job ${queueItem.jobId} is now complete`)
      }

    } catch (error) {
      console.error(`[worker] Error processing queue item ${queueItem.id}:`, error)
      if (error instanceof Error) {
        console.error(`[worker] Error details:`, error.message, error.stack)
      }
      await markQueueItemFailed(
        queueItem.id,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  console.log(`[worker] Worker completed. Processed ${processed.length} items:`, processed)
  
  // Check if there are more pending items to process
  const remainingPending = await prisma.validationQueueItem.count({
    where: {
      status: 'pending',
    },
  })
  
  console.log(`[worker] Remaining pending items: ${remainingPending}`)
  
  return {
    processed: processed.length,
    itemIds: processed,
    hasMore: remainingPending > 0,
    remainingPending,
  }
}

