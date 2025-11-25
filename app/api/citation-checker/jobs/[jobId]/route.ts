import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
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

    const job = await prisma.validationJob.findUnique({
      where: { id: params.jobId },
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

    if (check.userId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tier2Items = job.queueItems.filter(item => item.tier === 'tier2')
    const tier3Items = job.queueItems.filter(item => item.tier === 'tier3')

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
    console.error("Error fetching job status:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

