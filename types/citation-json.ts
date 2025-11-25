/**
 * TypeScript types for Citation Checker JSON structure
 * Based on citationjson.md specification
 */

export type CitationType = "case" | "statute" | "regulation" | "rule" | "secondary";

export type ContentType = "paragraph" | "heading" | "section";

export type Tier1Status = "VALID_FORMAT" | "INVALID_FORMAT" | "AMBIGUOUS_FORMAT";

export type Tier2Verdict = "PLAUSIBLE" | "SUSPICIOUS";

export type Tier2Consensus = "VALID" | "FLAG_FOR_REVIEW";

export type Tier3Severity = "LOW" | "MEDIUM" | "HIGH";

// Tier 3 Validation Types (per tier3prompt.md)
// Legacy verdicts - kept for backward compatibility
export type Tier3Verdict = 
  | "VERIFIED_REAL" 
  | "LIKELY_REAL" 
  | "LIKELY_FABRICATED" 
  | "NEEDS_HUMAN_REVIEW";

export type Tier3Confidence = "high" | "medium" | "low";

// Tier 3 Panel Types (new 3-call panel system)
export type Tier3AgentVerdictType = "VALID" | "INVALID" | "UNCERTAIN";

export type Tier3FinalStatus = "VALID" | "WARN" | "FAIL";

export type Tier3AgreementLevel = "unanimous" | "majority" | "split";

export interface Tier3AgentVerdict {
  agent: string; // e.g., "tier3_agent_1", "tier3_agent_2", "tier3_agent_3"
  verdict: Tier3AgentVerdictType;
  reasoning?: string; // Optional reasoning from the agent
  invalid_reason?: string; // Reason code if verdict is INVALID
  uncertain_reason?: string; // Reason code if verdict is UNCERTAIN
  timestamp: string; // ISO 8601 timestamp
  model: string; // e.g., "claude-sonnet-4-5-20250929"
}

export interface Tier3Consensus {
  agreement_level: Tier3AgreementLevel;
  verdict_counts: {
    VALID: number;
    INVALID: number;
    UNCERTAIN: number;
  };
  final_status: Tier3FinalStatus; // VALID (3/3), WARN (2/3), or FAIL (<2/3)
  confidence_score: number; // 0.0-1.0
  reasoning: string;
}

// Tier 2 Validation Types (per validationT2.md)
export type ValidationVerdict = "VALID" | "INVALID" | "UNCERTAIN";

export type AgreementLevel = "unanimous" | "strong" | "split";

export type CitationRecommendationType = 
  | "CITATION_LIKELY_VALID" 
  | "CITATION_UNCERTAIN" 
  | "CITATION_LIKELY_HALLUCINATED";

export interface AgentVerdict {
  agent: string; // e.g., "citation_authority_validator_v1"
  verdict: ValidationVerdict;
  invalid_reason?: string; // Reason code if verdict is INVALID
  uncertain_reason?: string; // Reason code if verdict is UNCERTAIN
  timestamp: string; // ISO 8601 timestamp
  model: string; // e.g., "claude-haiku-4-5-20251001"
}

export interface Consensus {
  agreement_level: AgreementLevel;
  verdict_counts: {
    VALID: number;
    INVALID: number;
    UNCERTAIN: number;
  };
  confidence_score: number; // 0.0-1.0
  recommendation: CitationRecommendationType;
  reasoning: string;
  tier_3_trigger: boolean;
}

export interface CitationValidation {
  panel_evaluation: AgentVerdict[];
  consensus: Consensus;
}

export interface CitationMetadata {
  filename: string;
  uploadDate: string; // ISO 8601
  documentType?: string; // motion, brief, memo, etc.
  totalCitations: number;
  identificationMethod?: 'custom' | 'eyecite'; // Method used to identify citations
}

export interface ContentParagraph {
  type: ContentType;
  id: string; // para_001, heading_001, etc.
  level?: number; // For headings, 1-6
  text: string; // Text with inline citations marked as [CITATION:cit_001]...[/CITATION:cit_001]
}

export interface CaseComponents {
  parties: string[];
  reporter: string;
  page: string;
  court: string;
  year: number;
}

export interface StatuteComponents {
  title: string;
  code: string; // U.S.C., etc.
  section: string;
  subdivision?: string | null;
}

export interface RegulationComponents {
  title: string;
  code: string; // C.F.R., etc.
  section: string;
}

export interface RuleComponents {
  ruleSet: string; // "Federal Rules of Civil Procedure"
  rule: string;
  subdivision?: string | null;
}

export type ExtractedComponents = 
  | CaseComponents 
  | StatuteComponents 
  | RegulationComponents 
  | RuleComponents;

export interface Tier1Result {
  status: Tier1Status;
  confidence: number; // 0-1
}

export interface Tier2Evaluation {
  evaluatorName: string;
  verdict: Tier2Verdict;
  confidence: number; // 0-1
}

export interface Tier2Result {
  evaluations: Tier2Evaluation[];
  consensus: Tier2Consensus;
  consensusConfidence: number; // 0-1
  escalated: boolean;
}

export interface Tier3Result {
  // New panel-based structure
  panel_evaluation: Tier3AgentVerdict[]; // 3 agent verdicts
  consensus: Tier3Consensus;
  
  // Legacy fields - kept for backward compatibility
  // These will be populated from panel_evaluation for old format compatibility
  verdict?: Tier3Verdict; // Deprecated - use consensus.final_status instead
  reasoning?: string; // Aggregated from panel or single agent
  key_evidence?: string; // Aggregated from panel
  remaining_uncertainties?: string;
  confidence?: Tier3Confidence; // Deprecated - use consensus.confidence_score instead
  
  timestamp: string; // ISO 8601 timestamp
  model: string; // e.g., "claude-sonnet-4-5-20250929"
}

export interface CitationRecommendation {
  citationText: string;
  reason: string;
}

export interface Citation {
  id: string; // cit_001, cit_002, etc.
  citationText: string; // Exact citation as it appears in document
  citationType: CitationType;
  extractedComponents: ExtractedComponents;
  tier_1: Tier1Result;
  tier_2: Tier2Result;
  tier_3: Tier3Result | null; // null if not escalated
  recommendations: CitationRecommendation[] | null; // null until Phase 2
  validation?: CitationValidation; // Tier 2 validation results (per validationT2.md)
}

export interface CitationDocument {
  document: {
    metadata: CitationMetadata;
    content: ContentParagraph[];
    citations: Citation[];
  };
}

// Analysis Statistics Types
export interface AnalysisStatistics {
  completion: {
    total: number;
    tier1Only: number;
    tier1And2: number;
    allThreeTiers: number;
    completionRates: {
      tier1: number;
      tier2: number;
      tier3: number;
    };
  };
  tier2Voting: {
    validVotes: Record<0 | 1 | 2 | 3 | 4 | 5, number>;
    invalidVotes: Record<0 | 1 | 2 | 3 | 4 | 5, number>;
    uncertainVotes: Record<0 | 1 | 2 | 3 | 4 | 5, number>;
    agreementLevels: {
      unanimous: number;
      strong: number;
      split: number;
    };
  };
  tier3Validation: {
    escalated: number;
    analyzed: number;
    escalationRate: number;
    tier3WithUnanimousTier2: number;
    tier3WithUnanimousTier2Rate: number;
    verdicts: Record<Tier3FinalStatus, number>; // VALID, WARN, FAIL
    // Legacy verdicts kept for backward compatibility
    legacyVerdicts?: Record<Tier3Verdict, number>;
  };
  agentAgreement: {
    pairwiseMatrix: Record<string, Record<string, number>>;
    agentStats: Record<string, {
      valid: number;
      invalid: number;
      uncertain: number;
    }>;
  };
  efficiency: {
    unanimousDecisions: number;
    unanimousRate: number;
    escalationRate: number;
    averageConfidence: {
      tier2: number;
      tier3: number;
    };
  };
  documentsThroughAllThree: {
    documentRuns: number;
    totalCitations: number;
    invalidCitations: number;
    invalidPercentage: number;
    tier2Unanimous5of5Count: number;
    tier2Unanimous5of5Percentage: number;
    tier2Validated: number;
    tier3Runs: number;
    tier3Validated: number;
    tier2ValidVoteDistribution: Record<0 | 1 | 2 | 3 | 4 | 5, number>;
  };
}

