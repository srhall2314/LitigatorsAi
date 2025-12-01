import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { compareHeavyAnalysisRuns, HeavyAnalysisRun } from "@/lib/citation-identification/heavy-analysis"
import { CitationDocument } from "@/types/citation-json"

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string; runId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all checks for this file
    const checks = await prisma.citationCheck.findMany({
      where: { fileUploadId: params.fileId },
      orderBy: { version: "asc" },
      select: {
        id: true,
        version: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        jsonData: true,
      },
    })

    // Filter checks that belong to this heavy analysis run
    const runChecks = checks
      .map(check => {
        const jsonData = check.jsonData as any
        const metadata = jsonData?.document?.metadata
        const matches = metadata?.heavyAnalysisRunId === params.runId
        
        if (matches) {
          // Check if any citations have heavy_analysis
          const citations = jsonData?.document?.citations || []
          const hasHeavyAnalysis = citations.some((c: any) => c.heavy_analysis)
          
          if (hasHeavyAnalysis) {
            return {
              checkId: check.id,
              version: check.version,
              runNumber: metadata?.heavyAnalysisRunNumber || check.version,
              status: check.status,
              createdAt: check.createdAt,
              updatedAt: check.updatedAt,
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
          message: "The runs may still be processing. Please wait and refresh."
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

    // Calculate total cost across all runs
    const totalCost = runChecks.reduce((sum, check) => {
      const citations = check.jsonData.document.citations || []
      const runCost = citations.reduce((citationSum: number, c: any) => {
        return citationSum + (c.heavy_analysis?.cost?.total_cost || 0)
      }, 0)
      return sum + runCost
    }, 0)

    return NextResponse.json({
      runId: params.runId,
      fileId: params.fileId,
      totalRuns: runChecks.length,
      runs: runChecks.map(check => ({
        checkId: check.checkId,
        version: check.version,
        runNumber: check.runNumber,
        status: check.status,
        createdAt: check.createdAt,
        updatedAt: check.updatedAt,
      })),
      comparisons,
      statistics: {
        totalCitations,
        citationsWithFullAgreement,
        citationsWithFullAgreementRate: totalCitations > 0 ? citationsWithFullAgreement / totalCitations : 0,
        citationsWithLinkConsistency,
        citationsWithLinkConsistencyRate: totalCitations > 0 ? citationsWithLinkConsistency / totalCitations : 0,
        averageAgreementRate: averageAgreement,
        overallRiskDistribution,
        totalCost: totalCost.toFixed(4),
      },
    })
  } catch (error) {
    console.error("Error fetching heavy analysis run:", error)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}

