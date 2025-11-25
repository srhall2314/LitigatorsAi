import { NextRequest, NextResponse } from "next/server"
import { getNextQueueItem, markQueueItemProcessing, markQueueItemCompleted, markQueueItemFailed, checkJobCompletion } from "@/lib/citation-identification/queue"
import { validateCitationWithPanel, validateCitationTier3 } from "@/lib/citation-identification/validation"
import { extractDocumentContext } from "@/lib/citation-identification/context-extractor"
import { ANTHROPIC_API_KEY } from "@/lib/env"
import { prisma } from "@/lib/prisma"

export const maxDuration = 300 // 5 minutes for Vercel Pro

export async function POST(request: NextRequest) {
  try {
    // Optional: Add auth check for worker endpoint
    // For now, allow unauthenticated (can secure later with API key)
    
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      )
    }
    
    // Process up to N items per call (configurable)
    const maxItems = parseInt(request.nextUrl.searchParams.get('maxItems') || '5')
    const processed: string[] = []
    
    for (let i = 0; i < maxItems; i++) {
      const queueItem = await getNextQueueItem()
      
      if (!queueItem) {
        break // No more items to process
      }
      
      try {
        await markQueueItemProcessing(queueItem.id)
        
        const check = queueItem.job.check
        const jsonData = check.jsonData as any
        const citations = jsonData.document?.citations || []
        const citation = citations[queueItem.citationIndex]
        
        if (!citation) {
          throw new Error(`Citation not found at index ${queueItem.citationIndex}`)
        }
        
        const context = extractDocumentContext(citation.id, jsonData, true)
        
        if (queueItem.tier === 'tier2') {
          // Process Tier 2 validation
          const validation = await validateCitationWithPanel(
            citation,
            context,
            ANTHROPIC_API_KEY
          )
          
          const needsTier3 = validation.consensus.tier_3_trigger
          await markQueueItemCompleted(queueItem.id, validation, needsTier3)
          
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
          
          await markQueueItemCompleted(queueItem.id, tier3Result, false)
        }
        
        processed.push(queueItem.id)
        
        // Check if job is complete
        await checkJobCompletion(queueItem.jobId)
        
        // Trigger next batch if there are more items (self-triggering)
        if (i < maxItems - 1) {
          // Continue processing in this call
        } else {
          // Last item in batch, trigger next batch asynchronously
          const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
          fetch(`${baseUrl}/api/citation-checker/worker/process-queue?maxItems=${maxItems}`, {
            method: 'POST',
          }).catch(console.error)
        }
        
      } catch (error) {
        console.error(`Error processing queue item ${queueItem.id}:`, error)
        await markQueueItemFailed(
          queueItem.id,
          error instanceof Error ? error.message : String(error)
        )
      }
    }
    
    return NextResponse.json({
      processed: processed.length,
      itemIds: processed,
    })
    
  } catch (error) {
    console.error("Error in worker:", error)
    return NextResponse.json(
      {
        error: "Worker error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

