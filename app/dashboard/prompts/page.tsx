import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import {
  getCitationAuthorityValidatorPrompt,
  getCaseEcologyValidatorPrompt,
  getTemporalRealityValidatorPrompt,
  getLegalKnowledgeValidatorPrompt,
  getRealityAssessmentExpertPrompt
} from "@/lib/citation-identification/validation-prompts"
import { 
  getRigorousLegalInvestigatorPrompt,
  getHolisticLegalAnalystPrompt,
  getPatternRecognitionExpertPrompt
} from "@/lib/citation-identification/tier3-prompts"
import { Citation, CitationValidation } from "@/types/citation-json"

export default async function PromptsPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  // Create example citation and context to generate actual prompts
  const exampleCitation: Citation = {
    id: "cit_001",
    citationText: "Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020)",
    citationType: "case",
    extractedComponents: {
      parties: ["Smith", "Jones"],
      reporter: "F.3d",
      page: "456",
      court: "D.C. Cir.",
      year: 2020
    },
    tier_1: { status: "VALID_FORMAT", confidence: 1.0 },
    tier_2: {
      evaluations: [],
      consensus: "VALID",
      consensusConfidence: 1.0,
      escalated: false
    },
    tier_3: null,
    recommendations: null
  }

  const exampleContext = "In Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020), the court held that the plaintiff's claim was without merit. The decision established important precedent for future cases involving similar facts."

  // Generate Tier 2 prompts
  const tier2Prompts = [
    {
      name: "Agent 1: Citation Authority Validator",
      focus: "Court/reporter/year alignment and publication plausibility",
      prompt: getCitationAuthorityValidatorPrompt(exampleCitation, exampleContext)
    },
    {
      name: "Agent 2: Case Ecology Validator",
      focus: "Party names, case characteristics, and litigation plausibility",
      prompt: getCaseEcologyValidatorPrompt(exampleCitation, exampleContext)
    },
    {
      name: "Agent 3: Temporal Reality Validator",
      focus: "Timeline consistency and historical plausibility",
      prompt: getTemporalRealityValidatorPrompt(exampleCitation, exampleContext)
    },
    {
      name: "Agent 4: Legal Knowledge Validator",
      focus: "Broad application of legal knowledge and awareness",
      prompt: getLegalKnowledgeValidatorPrompt(exampleCitation, exampleContext)
    },
    {
      name: "Agent 5: Reality Assessment Expert",
      focus: "Synthesis and overall reality assessment",
      prompt: getRealityAssessmentExpertPrompt(exampleCitation, exampleContext)
    }
  ]

  // Generate Tier 3 prompt (needs example Tier 2 results)
  const exampleTier2Results: CitationValidation = {
    panel_evaluation: [
      {
        agent: "citation_authority_validator_v1",
        verdict: "VALID",
        timestamp: new Date().toISOString(),
        model: "claude-haiku-4-5-20251001"
      },
      {
        agent: "case_ecology_validator_v1",
        verdict: "VALID",
        timestamp: new Date().toISOString(),
        model: "claude-haiku-4-5-20251001"
      },
      {
        agent: "temporal_reality_validator_v1",
        verdict: "INVALID",
        invalid_reason: "temporal_impossibility",
        timestamp: new Date().toISOString(),
        model: "claude-haiku-4-5-20251001"
      },
      {
        agent: "legal_knowledge_validator_v1",
        verdict: "VALID",
        timestamp: new Date().toISOString(),
        model: "claude-haiku-4-5-20251001"
      },
      {
        agent: "reality_assessment_expert_v1",
        verdict: "UNCERTAIN",
        uncertain_reason: "mixed_signals",
        timestamp: new Date().toISOString(),
        model: "claude-haiku-4-5-20251001"
      }
    ],
    consensus: {
      agreement_level: "split",
      verdict_counts: {
        VALID: 3,
        INVALID: 1,
        UNCERTAIN: 1
      },
      confidence_score: 0.36,
      recommendation: "CITATION_UNCERTAIN",
      reasoning: "Panel split. Temporal validator flags future year as impossible. Others see plausibility.",
      tier_3_trigger: true
    }
  }

  // Generate Tier 3 prompts (all 3 agents)
  const tier3Prompts = [
    {
      name: "Agent 1: Rigorous Legal Investigator",
      style: "Conservative, detail-oriented investigator with deep knowledge of legal citation systems",
      prompt: getRigorousLegalInvestigatorPrompt(exampleCitation, exampleContext, exampleTier2Results)
    },
    {
      name: "Agent 2: Holistic Legal Analyst",
      style: "Big-picture thinker who synthesizes multiple signals and considers Tier 2 panel context",
      prompt: getHolisticLegalAnalystPrompt(exampleCitation, exampleContext, exampleTier2Results)
    },
    {
      name: "Agent 3: Pattern Recognition Expert",
      style: "Expert at detecting fabrication patterns and authenticity markers",
      prompt: getPatternRecognitionExpertPrompt(exampleCitation, exampleContext, exampleTier2Results)
    }
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-black mb-4">
              AI Prompts Reference
            </h1>
            <p className="text-black text-lg mb-4">
              Current prompts used by each validation agent. These are the actual prompts from the codebase.
            </p>
            <div className="mb-6">
              <a
                href="/dashboard"
                className="text-black underline hover:no-underline"
              >
                ← Back to Dashboard
              </a>
            </div>
          </div>

          {/* Tier 2 Prompts */}
          <div className="mb-12">
            <h2 className="text-3xl font-semibold text-black mb-6 border-b border-gray-300 pb-2">
              Tier 2 Validation Prompts
            </h2>
            <p className="text-black mb-6">
              <strong>Model:</strong> Claude Haiku 4.5 (<code className="bg-gray-100 px-2 py-1 rounded">claude-haiku-4-5-20251001</code>)
            </p>
            <p className="text-black mb-6">
              These 5 agents evaluate citations in parallel. Each focuses on a specific dimension of validation.
            </p>

            <div className="space-y-8">
              {tier2Prompts.map((agent, index) => (
                <div key={index} className="border border-gray-300 rounded-lg p-6 bg-white">
                  <div className="mb-4">
                    <h3 className="text-2xl font-semibold text-black mb-2">
                      {agent.name}
                    </h3>
                    <p className="text-gray-700 italic">
                      <strong>Focus:</strong> {agent.focus}
                    </p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded p-4 overflow-x-auto">
                    <pre className="whitespace-pre-wrap text-sm text-black font-mono">
                      {agent.prompt}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tier 3 Prompts */}
          <div className="mb-12">
            <h2 className="text-3xl font-semibold text-black mb-6 border-b border-gray-300 pb-2">
              Tier 3 Investigation Prompts
            </h2>
            <p className="text-black mb-6">
              <strong>Model:</strong> Claude Sonnet 4.5 (<code className="bg-gray-100 px-2 py-1 rounded">claude-sonnet-4-5-20250929</code>)
            </p>
            <p className="text-black mb-6">
              These 3 agents investigate citations comprehensively in parallel. Unlike Tier 2 (where agents focus on specific dimensions), 
              Tier 3 agents all investigate the FULL citation but with different analytical backgrounds/styles. Used for citations that 
              receive split decisions (3/2 or worse) from the Tier 2 panel.
            </p>

            <div className="space-y-8">
              {tier3Prompts.map((agent, index) => (
                <div key={index} className="border border-gray-300 rounded-lg p-6 bg-white">
                  <div className="mb-4">
                    <h3 className="text-2xl font-semibold text-black mb-2">
                      {agent.name}
                    </h3>
                    <p className="text-gray-700 italic">
                      <strong>Analytical Style:</strong> {agent.style}
                    </p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded p-4 overflow-x-auto">
                    <pre className="whitespace-pre-wrap text-sm text-black font-mono">
                      {agent.prompt}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Note about example data */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <p className="text-black text-sm">
              <strong>Note:</strong> The prompts above are generated using example citation data. 
              In actual use, the prompts are dynamically generated with the specific citation and context 
              from the document being validated. The structure and instructions remain the same.
            </p>
          </div>

          {/* Link back */}
          <div className="mt-8">
            <a
              href="/dashboard"
              className="text-black underline hover:no-underline"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

