import { NextRequest, NextResponse } from "next/server"
import { processQueueItems } from "@/lib/citation-identification/worker"
import { handleApiError } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"

export const maxDuration = 300 // 5 minutes for Vercel Pro

export async function POST(request: NextRequest) {
  try {
    logger.debug('Worker endpoint called', undefined, 'Worker')
    
    // Process up to N items per call (configurable)
    const maxItems = parseInt(request.nextUrl.searchParams.get('maxItems') || '5')
    
    const result = await processQueueItems(maxItems)
    
    // Continue processing more batches if there are remaining items
    // Use a loop instead of fetch to avoid reliability issues
    let totalProcessed = result.processed
    let batchCount = 1
    const maxBatches = 20 // Safety limit to prevent infinite loops
    
    while (result.hasMore && batchCount < maxBatches && totalProcessed > 0) {
      logger.debug(`Continuing to batch ${batchCount + 1}`, undefined, 'Worker')
      const nextResult = await processQueueItems(maxItems)
      totalProcessed += nextResult.processed
      batchCount++
      
      if (nextResult.processed === 0 || !nextResult.hasMore) {
        logger.debug(`No more items to process or batch returned 0 items`, undefined, 'Worker')
        break
      }
    }
    
    logger.info(`Completed batches`, { batches: batchCount, totalProcessed }, 'Worker')
    
    return NextResponse.json({
      ...result,
      totalProcessed,
      batches: batchCount,
    })
    
  } catch (error) {
    return handleApiError(error, 'Worker')
  }
}

