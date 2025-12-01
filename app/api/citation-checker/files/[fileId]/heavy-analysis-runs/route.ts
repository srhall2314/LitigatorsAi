import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { runHeavyAnalysis, DEFAULT_MODELS } from "@/lib/citation-identification/heavy-analysis"
import { CitationDocument } from "@/types/citation-json"
import { readFileSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"
import { OPENAI_API_KEY, GEMINI_API_KEY, GROK_API_KEY, ANTHROPIC_API_KEY } from "@/lib/env"
import { Provider } from "@/lib/citation-identification/token-tracking"

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all checks for this file
    const checks = await prisma.citationCheck.findMany({
      where: { fileUploadId: params.fileId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        jsonData: true,
      },
    })

    // Group checks by heavyAnalysisRunId
    const runsMap = new Map<string, {
      runId: string
      runTotal: number
      createdAt: Date
      updatedAt: Date
      runs: Array<{
        id: string
        version: number
        runNumber: number
        createdAt: Date
        updatedAt: Date
      }>
    }>()

    for (const check of checks) {
      const jsonData = check.jsonData as any
      const metadata = jsonData?.document?.metadata
      const runId = metadata?.heavyAnalysisRunId

      if (runId) {
        if (!runsMap.has(runId)) {
          runsMap.set(runId, {
            runId,
            runTotal: metadata?.heavyAnalysisRunTotal || 0,
            createdAt: check.createdAt,
            updatedAt: check.updatedAt,
            runs: [],
          })
        }

        const run = runsMap.get(runId)!
        run.runs.push({
          id: check.id,
          version: check.version,
          runNumber: metadata?.heavyAnalysisRunNumber || check.version,
          createdAt: check.createdAt,
          updatedAt: check.updatedAt,
        })

        if (check.updatedAt > run.updatedAt) {
          run.updatedAt = check.updatedAt
        }
      }
    }

    // Convert map to array and sort by updatedAt (newest first)
    const runs = Array.from(runsMap.values())
      .map(run => ({
        ...run,
        runs: run.runs.sort((a, b) => a.runNumber - b.runNumber),
        runsCompleted: run.runs.length,
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    return NextResponse.json({ runs })
  } catch (error) {
    console.error("Error fetching heavy analysis runs:", error)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { fileId: string } }
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

    // Get request body
    const body = await request.json()
    const numberOfRuns = parseInt(body.numberOfRuns)
    const provider = (body.provider as Provider) || 'anthropic'
    let model = body.model || DEFAULT_MODELS[provider]
    
    // Validate and fix deprecated Grok models
    if (provider === 'grok') {
      if (model === 'grok-beta' || !model.startsWith('grok-3')) {
        console.warn(`[heavy-analysis-runs] Invalid or deprecated Grok model '${model}', defaulting to 'grok-3-fast'`)
        model = 'grok-3-fast'
      }
    }
    
    console.log(`[heavy-analysis-runs] Request: provider=${provider}, model=${model}, numberOfRuns=${numberOfRuns}`)

    if (!numberOfRuns || numberOfRuns < 1 || numberOfRuns > 10) {
      return NextResponse.json(
        { error: "Number of runs must be between 1 and 10" },
        { status: 400 }
      )
    }

    // Get the latest CitationCheck with JSON (after T1)
    const latestCheck = await prisma.citationCheck.findFirst({
      where: { fileUploadId: params.fileId },
      orderBy: { version: "desc" },
    })

    if (!latestCheck || !latestCheck.jsonData) {
      return NextResponse.json(
        { error: "No JSON data found. Please run citation identification first." },
        { status: 400 }
      )
    }

    const jsonData = latestCheck.jsonData as unknown as CitationDocument
    
    // Verify T1 is complete
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

    // Load base prompt
    let basePrompt: string
    try {
      const promptPath = join(process.cwd(), 'heavyprmpt.md')
      basePrompt = readFileSync(promptPath, 'utf-8')
    } catch (error) {
      console.error('[heavy-analysis-runs] Failed to read prompt file:', error)
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

    // Generate run ID
    const runId = randomUUID()
    const latestVersion = latestCheck.version
    const checkIds: string[] = []

    console.log(`[heavy-analysis-runs] Creating ${numberOfRuns} heavy analysis runs using ${provider}/${model}`)

    // Create N runs sequentially
    for (let i = 1; i <= numberOfRuns; i++) {
      // Deep copy the JSON data
      const freshJsonData = JSON.parse(JSON.stringify(jsonData)) as CitationDocument
      
      // Clear heavy_analysis results from previous runs
      if (freshJsonData.document?.citations) {
        freshJsonData.document.citations = freshJsonData.document.citations.map((citation: any) => {
          const cleanCitation = { ...citation }
          delete cleanCitation.heavy_analysis
          return cleanCitation
        })
      }

      // Add run metadata
      if (freshJsonData.document?.metadata) {
        freshJsonData.document.metadata.heavyAnalysisRunId = runId
        freshJsonData.document.metadata.heavyAnalysisRunNumber = i
        freshJsonData.document.metadata.heavyAnalysisRunTotal = numberOfRuns
      }

      // Run heavy analysis
      let updatedJsonData: CitationDocument
      try {
        console.log(`[heavy-analysis-runs] Starting run ${i}/${numberOfRuns} with provider=${provider}, model=${model}`)
        updatedJsonData = await runHeavyAnalysis(freshJsonData, basePrompt, provider, model, apiKey)
        console.log(`[heavy-analysis-runs] Run ${i}/${numberOfRuns} completed successfully`)
      } catch (error) {
        console.error(`[heavy-analysis-runs] Run ${i} failed:`, error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorDetails = error instanceof Error && error.stack ? error.stack : undefined
        
        // Check for deprecated model errors
        if (errorMessage.includes('deprecated') || errorMessage.includes('grok-beta')) {
          return NextResponse.json(
            { 
              error: `Heavy analysis run ${i} failed: Model is deprecated`, 
              details: `The model '${model}' has been deprecated. Please use one of the Grok 3 models: grok-3-fast-beta, grok-3-fast, or grok-3-fast-latest`,
              suggestion: "Try selecting a different model from the dropdown"
            },
            { status: 400 }
          )
        }
        
        return NextResponse.json(
          { 
            error: `Heavy analysis run ${i} failed`, 
            details: errorMessage,
            stack: errorDetails
          },
          { status: 500 }
        )
      }

      // Create new CitationCheck version with heavy analysis results
      // Add retry logic for database operations in case of connection issues
      let newCheck
      let retries = 3
      while (retries > 0) {
        try {
          newCheck = await prisma.citationCheck.create({
            data: {
              fileUploadId: params.fileId,
              userId: user.id,
              version: latestVersion + i,
              status: "heavy_analysis_complete",
              jsonData: updatedJsonData as any,
            },
          })
          break
        } catch (dbError: any) {
          retries--
          if (dbError?.code === 'P1001' || dbError?.message?.includes('Closed') || dbError?.message?.includes('connection')) {
            console.warn(`[heavy-analysis-runs] Database connection error, retrying... (${retries} retries left)`)
            if (retries > 0) {
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 1000))
              // Try to reconnect
              try {
                await prisma.$connect()
              } catch (connectError) {
                console.error('[heavy-analysis-runs] Failed to reconnect:', connectError)
              }
              continue
            }
          }
          throw dbError
        }
      }
      
      if (!newCheck) {
        throw new Error('Failed to create citation check after retries')
      }

      checkIds.push(newCheck.id)
      console.log(`[heavy-analysis-runs] Completed run ${i}/${numberOfRuns}`)
    }

    return NextResponse.json({
      runId,
      numberOfRuns,
      checkIds,
      provider,
      model,
      message: `Created ${numberOfRuns} heavy analysis run(s).`,
    })
  } catch (error) {
    console.error("Error creating heavy analysis runs:", error)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}

