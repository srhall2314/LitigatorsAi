import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { retryUnvalidatedCitations, checkJobCompletion } from "@/lib/citation-identification/queue"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { canModifyWorkflow } from "@/lib/access-control"
import { logger } from "@/lib/logger"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    const job = await prisma.validationJob.findUnique({
      where: { id: jobId },
      include: {
        queueItems: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Verify user has access to this job's check
    const check = await prisma.citationCheck.findUnique({
      where: { id: job.checkId },
    })

    if (!check) {
      return NextResponse.json({ error: 'Citation check not found' }, { status: 404 })
    }

    // Check if user can modify workflow (owner, admin, or has edit/route permission)
    const canModify = await canModifyWorkflow(user.id, job.checkId)
    if (!canModify) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tier2Items = job.queueItems.filter(item => item.tier === 'tier2')
    const tier3Items = job.queueItems.filter(item => item.tier === 'tier3')

    // Check for unvalidated citations and retry them if job appears complete
    if (job.status === 'completed' || (tier2Items.filter(i => i.status === 'pending' || i.status === 'processing').length === 0)) {
      const retriedCount = await retryUnvalidatedCitations(job.id)
      if (retriedCount > 0) {
        // Re-check job completion after retries
        await checkJobCompletion(job.id)
        // Re-fetch job to get updated status
        const updatedJob = await prisma.validationJob.findUnique({
          where: { id: jobId },
          include: {
            queueItems: {
              orderBy: { createdAt: 'asc' },
            },
          },
        })
        if (updatedJob) {
          const updatedTier2Items = updatedJob.queueItems.filter(item => item.tier === 'tier2')
          const updatedTier3Items = updatedJob.queueItems.filter(item => item.tier === 'tier3')
          return NextResponse.json({
            id: updatedJob.id,
            status: updatedJob.status,
            tier2Progress: {
              current: updatedJob.tier2Completed,
              total: updatedJob.tier2Total,
              percentage: updatedJob.tier2Total > 0 
                ? Math.round((updatedJob.tier2Completed / updatedJob.tier2Total) * 100) 
                : 0,
              pending: updatedTier2Items.filter(i => i.status === 'pending').length,
              processing: updatedTier2Items.filter(i => i.status === 'processing').length,
              completed: updatedTier2Items.filter(i => i.status === 'completed').length,
              failed: updatedTier2Items.filter(i => i.status === 'failed').length,
            },
            tier3Progress: {
              current: updatedJob.tier3Completed,
              total: updatedJob.tier3Total,
              percentage: updatedJob.tier3Total > 0 
                ? Math.round((updatedJob.tier3Completed / updatedJob.tier3Total) * 100) 
                : 0,
              pending: updatedTier3Items.filter(i => i.status === 'pending').length,
              processing: updatedTier3Items.filter(i => i.status === 'processing').length,
              completed: updatedTier3Items.filter(i => i.status === 'completed').length,
              failed: updatedTier3Items.filter(i => i.status === 'failed').length,
            },
            error: updatedJob.error,
            checkId: updatedJob.checkId,
            retriedCitations: retriedCount,
          })
        }
      }
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      tier2Progress: {
        current: job.tier2Completed,
        total: job.tier2Total,
        percentage: job.tier2Total > 0 
          ? Math.round((job.tier2Completed / job.tier2Total) * 100) 
          : 0,
        pending: tier2Items.filter(i => i.status === 'pending').length,
        processing: tier2Items.filter(i => i.status === 'processing').length,
        completed: tier2Items.filter(i => i.status === 'completed').length,
        failed: tier2Items.filter(i => i.status === 'failed').length,
      },
      tier3Progress: {
        current: job.tier3Completed,
        total: job.tier3Total,
        percentage: job.tier3Total > 0 
          ? Math.round((job.tier3Completed / job.tier3Total) * 100) 
          : 0,
        pending: tier3Items.filter(i => i.status === 'pending').length,
        processing: tier3Items.filter(i => i.status === 'processing').length,
        completed: tier3Items.filter(i => i.status === 'completed').length,
        failed: tier3Items.filter(i => i.status === 'failed').length,
      },
      error: job.error,
      checkId: job.checkId,
    })
  } catch (error) {
    return handleApiError(error, 'GetJobStatus')
  }
}

