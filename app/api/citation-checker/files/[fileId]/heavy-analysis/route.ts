import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { runHeavyAnalysis, getProviderFromModel, DEFAULT_MODELS } from "@/lib/citation-identification/heavy-analysis"
import { CitationDocument } from "@/types/citation-json"
import { readFileSync } from "fs"
import { join } from "path"
import { OPENAI_API_KEY, GEMINI_API_KEY, GROK_API_KEY, ANTHROPIC_API_KEY } from "@/lib/env"
import { Provider } from "@/lib/citation-identification/token-tracking"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
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

    // Get the latest CitationCheck with JSON (after T1)
    const latestCheck = await prisma.citationCheck.findFirst({
      where: { fileUploadId: fileId },
      orderBy: { version: "desc" },
    })

    if (!latestCheck || !latestCheck.jsonData) {
      return NextResponse.json(
        { error: "No JSON data found. Please run citation identification first." },
        { status: 400 }
      )
    }

    const jsonData = latestCheck.jsonData as unknown as CitationDocument
    
    // Verify T1 is complete (citations have tier_1)
    const hasT1Citations = jsonData.document.citations?.some(c => c.tier_1)
    if (!hasT1Citations) {
      return NextResponse.json(
        { error: "Tier 1 citation identification must be completed first." },
        { status: 400 }
      )
    }

    const citations = jsonData.document.citations || []
    if (citations.length === 0) {
      return NextResponse.json(
        { error: "No citations found in document." },
        { status: 400 }
      )
    }

    // Get request body for provider/model selection
    const body = await request.json().catch(() => ({}))
    const provider = (body.provider as Provider) || 'anthropic'
    const model = body.model || DEFAULT_MODELS[provider]

    // Load base prompt from heavyprmpt.md
    let basePrompt: string
    try {
      const promptPath = join(process.cwd(), 'heavyprmpt.md')
      basePrompt = readFileSync(promptPath, 'utf-8')
    } catch (error) {
      console.error('[heavy-analysis] Failed to read prompt file:', error)
      return NextResponse.json(
        { error: "Failed to load analysis prompt" },
        { status: 500 }
      )
    }

    // Get API key based on provider
    let apiKey: string
    if (provider === 'anthropic') {
      apiKey = ANTHROPIC_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: "ANTHROPIC_API_KEY not configured" },
          { status: 500 }
        )
      }
    } else if (provider === 'openai') {
      apiKey = OPENAI_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: "OPENAI_API_KEY not configured" },
          { status: 500 }
        )
      }
    } else if (provider === 'grok') {
      apiKey = GROK_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: "GROK_API_KEY not configured" },
          { status: 500 }
        )
      }
    } else if (provider === 'gemini') {
      apiKey = GEMINI_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY not configured" },
          { status: 500 }
        )
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 }
      )
    }

    console.log(`[heavy-analysis] Starting heavy analysis for ${citations.length} citations using ${provider}/${model}`)

    // Run heavy analysis
    let updatedJsonData: CitationDocument
    try {
      updatedJsonData = await runHeavyAnalysis(jsonData, basePrompt, provider, model, apiKey)
    } catch (error) {
      console.error('[heavy-analysis] Analysis failed:', error)
      return NextResponse.json(
        { 
          error: "Heavy analysis failed", 
          details: error instanceof Error ? error.message : String(error) 
        },
        { status: 500 }
      )
    }

    // Create new CitationCheck version with heavy analysis results
    const newCheck = await prisma.citationCheck.create({
      data: {
        fileUploadId: fileId,
        userId: user.id,
        version: latestCheck.version + 1,
        status: "heavy_analysis_complete",
        jsonData: updatedJsonData as any,
      },
    })

    // Count results by risk level
    const riskLevelCounts = {
      'Low Risk': updatedJsonData.document.citations?.filter(c => c.heavy_analysis?.riskLevel === 'Low Risk').length || 0,
      'Medium Risk': updatedJsonData.document.citations?.filter(c => c.heavy_analysis?.riskLevel === 'Medium Risk').length || 0,
      'human review': updatedJsonData.document.citations?.filter(c => c.heavy_analysis?.riskLevel === 'human review').length || 0,
    }

    // Calculate total cost
    const totalCost = updatedJsonData.document.citations?.reduce((sum, c) => {
      return sum + (c.heavy_analysis?.cost?.total_cost || 0)
    }, 0) || 0

    return NextResponse.json({
      checkId: newCheck.id,
      version: newCheck.version,
      citationsAnalyzed: citations.length,
      riskLevelCounts,
      totalCost: totalCost.toFixed(4),
      message: "Heavy analysis completed successfully",
    })
  } catch (error) {
    console.error("Error running heavy analysis:", error)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}

