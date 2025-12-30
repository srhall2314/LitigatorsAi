import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { runHeavyAnalysis, DEFAULT_MODELS } from "@/lib/citation-identification/heavy-analysis"
import { CitationDocument } from "@/types/citation-json"
import { readFileSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"
import { OPENAI_API_KEY, GEMINI_API_KEY, GROK_API_KEY, ANTHROPIC_API_KEY } from "@/lib/env"
import { Provider } from "@/lib/citation-identification/token-tracking"
import { requireAuth, handleApiError, getLatestCheck, getNextVersionNumber } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"
import { deepClone } from "@/lib/utils"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error

    // Get all checks for this file that are heavy analysis runs
    // Use workflowType field if available, fallback to checking jsonData
    const checks = await prisma.citationCheck.findMany({
      where: { 
        fileUploadId: fileId,
        OR: [
          { workflowType: "heavy_analysis" },
          // Fallback for non-migrated records
          {
            workflowType: null,
            jsonData: {
              path: ["document", "metadata", "heavyAnalysisRunId"],
              not: Prisma.JsonNull,
            },
          },
        ],
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        workflowType: true,
        workflowId: true,
        workflowMetadata: true,
        jsonData: true,
      },
    })

    // Group checks by workflowId (heavyAnalysisRunId)
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
      // Use workflowId from database if available, fallback to jsonData
      let runId: string | null = null
      let runNumber: number | null = null
      let runTotal: number | null = null

      if (check.workflowType === "heavy_analysis" && check.workflowId) {
        // Use database fields
        runId = check.workflowId
        const metadata = check.workflowMetadata as any
        runNumber = metadata?.runNumber || null
        runTotal = metadata?.runTotal || null
      } else {
        // Fallback: extract from jsonData for non-migrated records
        const jsonData = check.jsonData as any
        const metadata = jsonData?.document?.metadata
        runId = metadata?.heavyAnalysisRunId
        runNumber = metadata?.heavyAnalysisRunNumber
        runTotal = metadata?.heavyAnalysisRunTotal
      }

      if (runId) {
        if (!runsMap.has(runId)) {
          runsMap.set(runId, {
            runId,
            runTotal: runTotal || 0,
            createdAt: check.createdAt,
            updatedAt: check.updatedAt,
            runs: [],
          })
        }

        const run = runsMap.get(runId)!
        run.runs.push({
          id: check.id,
          version: check.version,
          runNumber: runNumber || check.version,
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
    return handleApiError(error, 'GetHeavyAnalysisRuns')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Get request body
    const body = await request.json()
    const numberOfRuns = parseInt(body.numberOfRuns)
    const provider = (body.provider as Provider) || 'anthropic'
    let model = body.model || DEFAULT_MODELS[provider]
    
    // Validate and fix deprecated Grok models
    if (provider === 'grok') {
      if (model === 'grok-beta' || !model.startsWith('grok-3')) {
        logger.warn(`Invalid or deprecated Grok model, defaulting to grok-3-fast`, { model }, 'HeavyAnalysisRuns')
        model = 'grok-3-fast'
      }
    }
    
    logger.info(`Request received`, { provider, model, numberOfRuns }, 'HeavyAnalysisRuns')

    if (!numberOfRuns || numberOfRuns < 1 || numberOfRuns > 10) {
      return NextResponse.json(
        { error: "Number of runs must be between 1 and 10" },
        { status: 400 }
      )
    }

    // Get the latest CitationCheck with JSON (after T1)
    const latestCheck = await getLatestCheck(fileId)

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
      logger.error('Failed to read prompt file', error, 'HeavyAnalysisRuns')
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

    logger.info(`Creating heavy analysis runs`, { numberOfRuns, provider, model }, 'HeavyAnalysisRuns')

    // Create N runs sequentially
    for (let i = 1; i <= numberOfRuns; i++) {
      // Deep copy the JSON data
      const freshJsonData = deepClone(jsonData)
      
      // Clear heavy_analysis results from previous runs
      if (freshJsonData.document?.citations) {
        freshJsonData.document.citations = freshJsonData.document.citations.map((citation: any) => {
          const cleanCitation = { ...citation }
          delete cleanCitation.heavy_analysis
          return cleanCitation
        })
      }

      // Add run metadata to jsonData (for backward compatibility)
      if (freshJsonData.document?.metadata) {
        freshJsonData.document.metadata.heavyAnalysisRunId = runId
        freshJsonData.document.metadata.heavyAnalysisRunNumber = i
        freshJsonData.document.metadata.heavyAnalysisRunTotal = numberOfRuns
      }

      // Run heavy analysis
      let updatedJsonData: CitationDocument
      try {
        logger.debug(`Starting run`, { runNumber: i, totalRuns: numberOfRuns, provider, model }, 'HeavyAnalysisRuns')
        updatedJsonData = await runHeavyAnalysis(freshJsonData, basePrompt, provider, model, apiKey)
        logger.debug(`Run completed successfully`, { runNumber: i, totalRuns: numberOfRuns }, 'HeavyAnalysisRuns')
      } catch (error) {
        logger.error(`Run failed`, error, 'HeavyAnalysisRuns')
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
              fileUploadId: fileId,
              userId: user.id,
              version: latestVersion + i,
              status: "heavy_analysis_complete",
              jsonData: updatedJsonData as any,
              // Populate workflow fields
              workflowType: "heavy_analysis",
              workflowId: runId,
              workflowMetadata: {
                runNumber: i,
                runTotal: numberOfRuns,
                model,
                provider,
              } as any,
              documentMetadata: updatedJsonData.document?.metadata as any,
              citationCount: updatedJsonData.document?.citations?.length || null,
              identificationMethod: updatedJsonData.document?.metadata?.identificationMethod || null,
              completedSteps: ["upload", "generate-json", "identify-citations", "heavy-analysis"],
              currentStep: "heavy-analysis",
            },
          })
          break
        } catch (dbError: any) {
          retries--
          if (dbError?.code === 'P1001' || dbError?.message?.includes('Closed') || dbError?.message?.includes('connection')) {
            logger.warn(`Database connection error, retrying`, { retriesLeft: retries }, 'HeavyAnalysisRuns')
            if (retries > 0) {
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 1000))
              // Try to reconnect
              try {
                await prisma.$connect()
              } catch (connectError) {
                logger.error('Failed to reconnect', connectError, 'HeavyAnalysisRuns')
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
      logger.debug(`Completed run`, { runNumber: i, totalRuns: numberOfRuns }, 'HeavyAnalysisRuns')
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
    return handleApiError(error, 'HeavyAnalysisRuns')
  }
}

