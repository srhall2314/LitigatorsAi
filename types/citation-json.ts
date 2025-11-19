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
  analysis: string; // Plain English explanation
  severity: Tier3Severity;
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
}

export interface CitationDocument {
  document: {
    metadata: CitationMetadata;
    content: ContentParagraph[];
    citations: Citation[];
  };
}

