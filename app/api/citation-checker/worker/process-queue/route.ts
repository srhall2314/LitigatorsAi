import { NextRequest, NextResponse } from "next/server"
import { processQueueItems } from "@/lib/citation-identification/worker"

export const maxDuration = 300 // 5 minutes for Vercel Pro

export async function POST(request: NextRequest) {
  try {
    console.log('[worker] Worker endpoint called')
    
    // Process up to N items per call (configurable)
    const maxItems = parseInt(request.nextUrl.searchParams.get('maxItems') || '5')
    
    const result = await processQueueItems(maxItems)
    
    // Continue processing more batches if there are remaining items
    // Use a loop instead of fetch to avoid reliability issues
    let totalProcessed = result.processed
    let batchCount = 1
    const maxBatches = 20 // Safety limit to prevent infinite loops
    
    while (result.hasMore && batchCount < maxBatches && totalProcessed > 0) {
      console.log(`[worker] Continuing to batch ${batchCount + 1}, processing more items...`)
      const nextResult = await processQueueItems(maxItems)
      totalProcessed += nextResult.processed
      batchCount++
      
      if (nextResult.processed === 0 || !nextResult.hasMore) {
        console.log(`[worker] No more items to process or batch returned 0 items`)
        break
      }
    }
    
    console.log(`[worker] Completed ${batchCount} batches, total processed: ${totalProcessed}`)
    
    return NextResponse.json({
      ...result,
      totalProcessed,
      batches: batchCount,
    })
    
  } catch (error) {
    console.error("[worker] Error in worker endpoint:", error)
    return NextResponse.json(
      {
        error: "Worker error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

