import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { compareHeavyAnalysisRuns, HeavyAnalysisRun } from "@/lib/citation-identification/heavy-analysis"
import { CitationDocument } from "@/types/citation-json"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const runId = searchParams.get('runId') || searchParams.get('testRunId') // Support both for backward compatibility
    
    if (!runId) {
      return NextResponse.json(
        { error: "runId query parameter required" },
        { status: 400 }
      )
    }

    // Get all checks for this file
    const checks = await prisma.citationCheck.findMany({
      where: { fileUploadId: fileId },
      orderBy: { version: "asc" },
      select: {
        id: true,
        version: true,
        jsonData: true,
      },
    })

    // Filter checks that belong to this run and have heavy_analysis
    const runChecks = checks
      .map(check => {
        const jsonData = check.jsonData as any
        const metadata = jsonData?.document?.metadata
        // Support both heavyAnalysisRunId and testRunId (for backward compatibility)
        const matches = metadata?.heavyAnalysisRunId === runId || metadata?.testRunId === runId
        
        if (matches) {
          // Check if any citations have heavy_analysis
          const citations = jsonData?.document?.citations || []
          const hasHeavyAnalysis = citations.some((c: any) => c.heavy_analysis)
          
          if (hasHeavyAnalysis) {
            return {
              checkId: check.id,
              version: check.version,
              runNumber: metadata?.heavyAnalysisRunNumber || metadata?.testRunNumber || check.version,
              jsonData: jsonData as CitationDocument,
            }
          }
        }
        return null
      })
      .filter((check): check is NonNullable<typeof check> => check !== null)
      .sort((a, b) => a.runNumber - b.runNumber)

    if (runChecks.length === 0) {
      return NextResponse.json(
        { 
          error: "No heavy analysis results found for this run",
          message: "Please run heavy analysis first"
        },
        { status: 404 }
      )
    }

    // Prepare runs for comparison
    const runs: HeavyAnalysisRun[] = runChecks.map(check => ({
      runNumber: check.runNumber,
      jsonData: check.jsonData,
    }))

    // Compare results
    const comparisons = compareHeavyAnalysisRuns(runs)

    // Calculate overall statistics
    const totalCitations = comparisons.length
    const citationsWithFullAgreement = comparisons.filter(
      c => c.consistency.riskLevelAgreement === 1.0
    ).length
    const citationsWithLinkConsistency = comparisons.filter(
      c => c.consistency.caseLinkConsistency
    ).length

    // Risk level distribution across all runs
    const overallRiskDistribution = {
      'Low Risk': 0,
      'Medium Risk': 0,
      'human review': 0,
    }
    
    for (const comparison of comparisons) {
      const mostCommon = comparison.consistency.mostCommonRiskLevel
      overallRiskDistribution[mostCommon]++
    }

    // Average agreement rate
    const averageAgreement = comparisons.length > 0
      ? comparisons.reduce((sum, c) => sum + c.consistency.riskLevelAgreement, 0) / comparisons.length
      : 0

    return NextResponse.json({
      runId,
      totalRuns: runChecks.length,
      totalCitations,
      comparisons,
      statistics: {
        citationsWithFullAgreement,
        citationsWithFullAgreementRate: totalCitations > 0 ? citationsWithFullAgreement / totalCitations : 0,
        citationsWithLinkConsistency,
        citationsWithLinkConsistencyRate: totalCitations > 0 ? citationsWithLinkConsistency / totalCitations : 0,
        averageAgreementRate: averageAgreement,
        overallRiskDistribution,
      },
    })
  } catch (error) {
    console.error("Error comparing heavy analysis runs:", error)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}

