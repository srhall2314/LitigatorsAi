import { prisma } from "@/lib/prisma"
import { CitationDocument } from "@/types/citation-json"

/**
 * Create a validation job and queue items for all citations
 */
export async function createValidationJob(
  checkId: string,
  jsonData: CitationDocument
): Promise<string> {
  const citations = jsonData.document?.citations || []
  
  // Create job
  const job = await prisma.validationJob.create({
    data: {
      checkId,
      status: 'pending',
      tier2Total: citations.length,
      tier2Completed: 0,
      tier3Total: 0,
      tier3Completed: 0,
    },
  })
  
  // Create queue items for Tier 2 validation
  const queueItems = citations.map((citation, index) => ({
    jobId: job.id,
    citationId: citation.id,
    citationIndex: index,
    tier: 'tier2',
    status: 'pending' as const,
  }))
  
  await prisma.validationQueueItem.createMany({
    data: queueItems,
  })
  
  return job.id
}

/**
 * Get next pending queue item to process
 */
export async function getNextQueueItem() {
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
  
  if (!item) return
  
  // Update queue item
  await prisma.validationQueueItem.update({
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
      await prisma.validationQueueItem.create({
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
    await prisma.validationJob.update({
      where: { id: item.jobId },
      data: updateData,
    })
  }
  
  // Update CitationCheck jsonData with result
  await updateCitationInCheck(item.job.checkId, item.citationIndex, result, item.tier)
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
 */
async function updateCitationInCheck(
  checkId: string,
  citationIndex: number,
  result: any,
  tier: string
): Promise<void> {
  const check = await prisma.citationCheck.findUnique({
    where: { id: checkId },
  })
  
  if (!check?.jsonData) return
  
  const jsonData = check.jsonData as any
  const citations = jsonData.document?.citations || []
  
  if (citations[citationIndex]) {
    if (tier === 'tier2') {
      citations[citationIndex].validation = result
    } else if (tier === 'tier3') {
      citations[citationIndex].tier_3 = result
    }
    
    await prisma.citationCheck.update({
      where: { id: checkId },
      data: {
        jsonData: jsonData as any,
      },
    })
  }
}

/**
 * Check if job is complete and update status
 */
export async function checkJobCompletion(jobId: string): Promise<boolean> {
  const job = await prisma.validationJob.findUnique({
    where: { id: jobId },
    include: {
      queueItems: true,
    },
  })
  
  if (!job) return false
  
  const pendingItems = job.queueItems.filter(item => 
    item.status === 'pending' || item.status === 'processing'
  )
  
  if (pendingItems.length === 0) {
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
    
    return true
  }
  
  return false
}

