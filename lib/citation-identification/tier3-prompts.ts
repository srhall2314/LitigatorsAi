/**
 * Tier 3 Citation Investigation Specialist Prompt
 * Per tier3prompt.md specification
 */

import { Citation, CitationValidation, Tier3Verdict, Tier3Confidence, Tier3AgentVerdictType } from '@/types/citation-json'

export interface ParsedTier3Response {
  verdict: Tier3Verdict
  reasoning: string
  key_evidence: string
  remaining_uncertainties?: string
  confidence: Tier3Confidence
}

// New interface for panel agent responses
export interface ParsedTier3AgentResponse {
  verdict: Tier3AgentVerdictType // VALID, INVALID, or UNCERTAIN
  reasoning: string
  invalid_reason?: string
  uncertain_reason?: string
}

/**
 * Parse Tier 3 agent response
 */
export function parseTier3Response(responseText: string): ParsedTier3Response {
  const lines = responseText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  let verdict: Tier3Verdict = 'NEEDS_HUMAN_REVIEW'
  let reasoning = ''
  let key_evidence = ''
  let remaining_uncertainties: string | undefined
  let confidence: Tier3Confidence = 'medium'
  
  // Extract verdict
  const verdictLine = lines.find(l => l.toUpperCase().startsWith('VERDICT:'))
  if (verdictLine) {
    const verdictText = verdictLine.substring(8).trim().toUpperCase()
    if (verdictText.includes('VERIFIED_REAL')) {
      verdict = 'VERIFIED_REAL'
    } else if (verdictText.includes('LIKELY_REAL')) {
      verdict = 'LIKELY_REAL'
    } else if (verdictText.includes('LIKELY_FABRICATED')) {
      verdict = 'LIKELY_FABRICATED'
    } else if (verdictText.includes('NEEDS_HUMAN_REVIEW') || verdictText.includes('HUMAN_REVIEW')) {
      verdict = 'NEEDS_HUMAN_REVIEW'
    } else if (verdictText.includes('UNCERTAIN_REQUIRES_MANUAL_RESEARCH') || verdictText.includes('UNCERTAIN')) {
      // Legacy support: map old verdict to new one
      verdict = 'NEEDS_HUMAN_REVIEW'
    }
  } else {
    // Try to find verdict without label
    const upperText = responseText.toUpperCase()
    if (upperText.includes('VERIFIED_REAL')) {
      verdict = 'VERIFIED_REAL'
    } else if (upperText.includes('LIKELY_REAL')) {
      verdict = 'LIKELY_REAL'
    } else if (upperText.includes('LIKELY_FABRICATED')) {
      verdict = 'LIKELY_FABRICATED'
    } else if (upperText.includes('NEEDS_HUMAN_REVIEW') || upperText.includes('HUMAN_REVIEW')) {
      verdict = 'NEEDS_HUMAN_REVIEW'
    } else if (upperText.includes('UNCERTAIN_REQUIRES_MANUAL_RESEARCH') || upperText.includes('UNCERTAIN')) {
      // Legacy support: map old verdict to new one
      verdict = 'NEEDS_HUMAN_REVIEW'
    }
  }
  
  // Extract reasoning
  const reasoningLine = lines.findIndex(l => l.toUpperCase().startsWith('REASONING:'))
  if (reasoningLine !== -1) {
    reasoning = lines[reasoningLine].substring(11).trim()
    // Try to get multi-line reasoning
    let nextLine = reasoningLine + 1
    while (nextLine < lines.length && !lines[nextLine].toUpperCase().startsWith('KEY_EVIDENCE:')) {
      reasoning += ' ' + lines[nextLine]
      nextLine++
    }
  }
  
  // Extract key evidence
  const evidenceLine = lines.findIndex(l => l.toUpperCase().startsWith('KEY_EVIDENCE:'))
  if (evidenceLine !== -1) {
    key_evidence = lines[evidenceLine].substring(13).trim()
    // Try to get multi-line evidence
    let nextLine = evidenceLine + 1
    while (nextLine < lines.length && !lines[nextLine].toUpperCase().startsWith('UNCERTAINTIES:') && 
           !lines[nextLine].toUpperCase().startsWith('CONFIDENCE:')) {
      key_evidence += ' ' + lines[nextLine]
      nextLine++
    }
  }
  
  // Extract uncertainties
  const uncertaintiesLine = lines.findIndex(l => l.toUpperCase().startsWith('UNCERTAINTIES:'))
  if (uncertaintiesLine !== -1) {
    const uncertaintiesText = lines[uncertaintiesLine].substring(14).trim().toUpperCase()
    if (uncertaintiesText !== 'NONE' && uncertaintiesText.length > 0) {
      remaining_uncertainties = lines[uncertaintiesLine].substring(14).trim()
      // Try to get multi-line uncertainties
      let nextLine = uncertaintiesLine + 1
      while (nextLine < lines.length && !lines[nextLine].toUpperCase().startsWith('CONFIDENCE:')) {
        remaining_uncertainties += ' ' + lines[nextLine]
        nextLine++
      }
    }
  }
  
  // Extract confidence
  const confidenceLine = lines.find(l => l.toUpperCase().startsWith('CONFIDENCE:'))
  if (confidenceLine) {
    const confidenceText = confidenceLine.substring(11).trim().toLowerCase()
    if (confidenceText.includes('high')) {
      confidence = 'high'
    } else if (confidenceText.includes('low')) {
      confidence = 'low'
    } else {
      confidence = 'medium'
    }
  }
  
  // Fallback: if we couldn't extract structured data, try to infer from the text
  if (!reasoning && responseText.length > 0) {
    // Try to extract reasoning from the first paragraph
    const paragraphs = responseText.split(/\n\s*\n/).filter(p => p.trim().length > 0)
    if (paragraphs.length > 0) {
      reasoning = paragraphs[0].trim()
    }
  }
  
  if (!key_evidence && responseText.length > 0) {
    // Try to extract evidence from second paragraph
    const paragraphs = responseText.split(/\n\s*\n/).filter(p => p.trim().length > 0)
    if (paragraphs.length > 1) {
      key_evidence = paragraphs[1].trim()
    }
  }
  
  return {
    verdict,
    reasoning: reasoning || 'No reasoning provided',
    key_evidence: key_evidence || 'No evidence provided',
    remaining_uncertainties,
    confidence,
  }
}

/**
 * Parse Tier 3 agent response for panel system (returns VALID/INVALID/UNCERTAIN)
 */
export function parseTier3AgentResponse(responseText: string, agentName: string): ParsedTier3AgentResponse {
  const lines = responseText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  let verdict: Tier3AgentVerdictType = 'UNCERTAIN'
  let reasoning = ''
  let invalid_reason: string | undefined
  let uncertain_reason: string | undefined
  
  // Extract verdict - look for VALID, INVALID, or UNCERTAIN
  const verdictLine = lines.find(l => l.toUpperCase().startsWith('VERDICT:'))
  if (verdictLine) {
    const verdictText = verdictLine.substring(8).trim().toUpperCase()
    if (verdictText.includes('VALID') && !verdictText.includes('INVALID')) {
      verdict = 'VALID'
    } else if (verdictText.includes('INVALID')) {
      verdict = 'INVALID'
    } else {
      verdict = 'UNCERTAIN'
    }
  } else {
    // Try to find verdict without label
    const upperText = responseText.toUpperCase()
    if (upperText.includes('VALID') && !upperText.includes('INVALID')) {
      verdict = 'VALID'
    } else if (upperText.includes('INVALID')) {
      verdict = 'INVALID'
    } else {
      verdict = 'UNCERTAIN'
    }
  }
  
  // Extract reasoning
  const reasoningLine = lines.findIndex(l => l.toUpperCase().startsWith('REASONING:'))
  if (reasoningLine !== -1) {
    reasoning = lines[reasoningLine].substring(11).trim()
    // Try to get multi-line reasoning
    let nextLine = reasoningLine + 1
    while (nextLine < lines.length && 
           !lines[nextLine].toUpperCase().startsWith('INVALID_REASON:') &&
           !lines[nextLine].toUpperCase().startsWith('UNCERTAIN_REASON:')) {
      reasoning += ' ' + lines[nextLine]
      nextLine++
    }
  }
  
  // Extract invalid_reason if present
  const invalidReasonLine = lines.findIndex(l => l.toUpperCase().startsWith('INVALID_REASON:'))
  if (invalidReasonLine !== -1) {
    invalid_reason = lines[invalidReasonLine].substring(15).trim()
  }
  
  // Extract uncertain_reason if present
  const uncertainReasonLine = lines.findIndex(l => l.toUpperCase().startsWith('UNCERTAIN_REASON:'))
  if (uncertainReasonLine !== -1) {
    uncertain_reason = lines[uncertainReasonLine].substring(17).trim()
  }
  
  // Fallback: if we couldn't extract structured data, try to infer from the text
  if (!reasoning && responseText.length > 0) {
    // Try to extract reasoning from the first paragraph
    const paragraphs = responseText.split(/\n\s*\n/).filter(p => p.trim().length > 0)
    if (paragraphs.length > 0) {
      reasoning = paragraphs[0].trim()
    }
  }
  
  return {
    verdict,
    reasoning: reasoning || 'No reasoning provided',
    invalid_reason,
    uncertain_reason,
  }
}

/**
 * Agent 1: Rigorous Legal Investigator
 * Analytical Style: Conservative, detail-oriented investigator with deep knowledge of legal citation systems
 * All agents investigate the FULL citation comprehensively - this agent emphasizes structural accuracy and methodical verification
 */
export function getRigorousLegalInvestigatorPrompt(
  citation: Citation,
  context: string,
  tier2Results: CitationValidation
): string {
  const citationText = citation.citationText || ''
  const citationType = citation.citationType || 'unknown'
  
  // Format Tier 2 panel results
  const panelVerdicts = tier2Results.panel_evaluation.map(agent => {
    let verdictStr = `${agent.agent}: ${agent.verdict}`
    if (agent.invalid_reason) {
      verdictStr += ` (${agent.invalid_reason})`
    }
    if (agent.uncertain_reason) {
      verdictStr += ` (${agent.uncertain_reason})`
    }
    return verdictStr
  }).join('\n- ')

  return `You are a rigorous legal investigator with deep knowledge of legal citation systems. 
You approach investigations conservatively and methodically, emphasizing structural accuracy 
and thorough verification. You are examining a citation that received conflicting assessments 
from a panel of five validators.

Citation: ${citationText}
Citation Type: ${citationType}
Document Context: ${context}

Tier 2 Panel Results:
- Agreement Level: ${tier2Results.consensus.agreement_level}
- Verdicts: 
- ${panelVerdicts}
- Confidence Score: ${(tier2Results.consensus.confidence_score * 100).toFixed(0)}%
- Panel Reasoning: ${tier2Results.consensus.reasoning}

Your Task:
Investigate this citation comprehensively and thoroughly. As a rigorous investigator, you 
examine ALL aspects methodically: authority existence, metadata accuracy, temporal consistency, 
context fit, and fabrication markers. You are cautious and detail-oriented, checking every 
element carefully before making your assessment.

Investigate ALL of these areas thoroughly:

1. AUTHORITY VERIFICATION
   - Is this court/reporter/statute combination credible?
   - Would this authority realistically exist at this time?
   - Are there any red flags in the metadata (volumes, pages, years)?

2. EXISTENCE ASSESSMENT
   - Based on your knowledge, does this specific citation likely exist?
   - Have you encountered this citation or similar ones?
   - Is there any indication this is a known, real authority?

3. TEMPORAL CONSISTENCY
   - Do the dates and timeline make sense?
   - Would this citation exist at this point in legal history?
   - Are there temporal inconsistencies?

4. CONTEXT ANALYSIS
   - Does the citation fit the legal argument presented? (Note: A good fit is EXPECTED and POSITIVE - lawyers cite authorities that support their arguments. Do NOT treat a perfect fit as suspicious on its own.)
   - Would a lawyer realistically cite this authority for this proposition?
   - Only flag fabrication concerns if there are OTHER red flags BEYOND just a good fit.

5. FABRICATION MARKERS
   - Are there patterns suggesting AI invention?
   - Do you see suspiciously convenient details?
   - Are there markers of fabrication vs. real citations?

6. TIER 2 RECONCILIATION
   - Where did the Tier 2 panel disagree?
   - Which agents were correct, and why?
   - What did they miss or misinterpret?

Your analytical style emphasizes methodical verification and structural accuracy. Be thorough 
and conservative in your assessment.

Respond with EXACTLY one of:
- VALID: Citation appears to be real and legitimate. No significant issues detected.
- INVALID: Citation appears to be fabricated or hallucinated. Clear evidence of fabrication.
- UNCERTAIN: Citation may be real but has issues requiring review, or insufficient information to determine validity.

If INVALID, you MUST use one of these exact reason codes:
- structural_impossibility
- metadata_inconsistent
- authority_nonexistent
- fabrication_clear
- multiple_red_flags

If UNCERTAIN, you MUST use one of these exact reason codes:
- structural_concerns
- metadata_questionable
- insufficient_verification
- temporal_inconsistencies
- requires_human_review

Format your response as:
VERDICT: [VALID, INVALID, or UNCERTAIN]
REASONING: [2-3 sentences explaining your assessment]
INVALID_REASON: [reason code if verdict is INVALID, otherwise omit]
UNCERTAIN_REASON: [reason code if verdict is UNCERTAIN, otherwise omit]`
}

/**
 * Agent 2: Holistic Legal Analyst
 * Analytical Style: Big-picture thinker who synthesizes multiple signals and considers Tier 2 panel context
 * All agents investigate the FULL citation comprehensively - this agent emphasizes overall coherence and synthesis
 */
export function getHolisticLegalAnalystPrompt(
  citation: Citation,
  context: string,
  tier2Results: CitationValidation
): string {
  const citationText = citation.citationText || ''
  const citationType = citation.citationType || 'unknown'
  
  // Format Tier 2 panel results
  const panelVerdicts = tier2Results.panel_evaluation.map(agent => {
    let verdictStr = `${agent.agent}: ${agent.verdict}`
    if (agent.invalid_reason) {
      verdictStr += ` (${agent.invalid_reason})`
    }
    if (agent.uncertain_reason) {
      verdictStr += ` (${agent.uncertain_reason})`
    }
    return verdictStr
  }).join('\n- ')

  return `You are a holistic legal analyst who synthesizes multiple signals and considers 
the broader context. You approach investigations by looking at the big picture and how 
different elements fit together. You are examining a citation that received conflicting 
assessments from a panel of five validators.

Citation: ${citationText}
Citation Type: ${citationType}
Document Context: ${context}

Tier 2 Panel Results:
- Agreement Level: ${tier2Results.consensus.agreement_level}
- Verdicts: 
- ${panelVerdicts}
- Confidence Score: ${(tier2Results.consensus.confidence_score * 100).toFixed(0)}%
- Panel Reasoning: ${tier2Results.consensus.reasoning}

Your Task:
Investigate this citation comprehensively and holistically. As a holistic analyst, you examine 
ALL aspects: authority existence, metadata accuracy, temporal consistency, context fit, and 
fabrication markers. You synthesize these signals together, consider the Tier 2 panel's 
disagreements, and assess overall coherence.

Investigate ALL of these areas comprehensively:

1. AUTHORITY VERIFICATION
   - Is this court/reporter/statute combination credible?
   - Would this authority realistically exist at this time?
   - Are there any red flags in the metadata (volumes, pages, years)?

2. EXISTENCE ASSESSMENT
   - Based on your knowledge, does this specific citation likely exist?
   - Have you encountered this citation or similar ones?
   - Is there any indication this is a known, real authority?

3. TEMPORAL CONSISTENCY
   - Do the dates and timeline make sense?
   - Would this citation exist at this point in legal history?
   - Are there temporal inconsistencies?

4. CONTEXT ANALYSIS
   - Does the citation fit the legal argument presented? (Note: A good fit is EXPECTED and POSITIVE - lawyers cite authorities that support their arguments. Do NOT treat a perfect fit as suspicious on its own.)
   - Would a lawyer realistically cite this authority for this proposition?
   - How does this citation fit within the broader document context?

5. FABRICATION MARKERS
   - Are there patterns suggesting AI invention?
   - Do you see suspiciously convenient details?
   - Are there markers of fabrication vs. real citations?

6. TIER 2 SYNTHESIS
   - Where did the Tier 2 panel disagree and why?
   - Which agents were correct, and which missed important signals?
   - How do the different Tier 2 perspectives synthesize into an overall assessment?
   - What does the pattern of disagreement tell you about this citation?

Your analytical style emphasizes synthesis and overall coherence. Consider how all the signals 
fit together and what the Tier 2 panel's disagreement reveals about the citation.

Respond with EXACTLY one of:
- VALID: Citation appears to be real and legitimate. No significant issues detected.
- INVALID: Citation appears to be fabricated or hallucinated. Clear evidence of fabrication.
- UNCERTAIN: Citation may be real but has issues requiring review, or insufficient information to determine validity.

If INVALID, you MUST use one of these exact reason codes:
- incoherent_synthesis
- tier2_pattern_negative
- fabrication_clear
- context_mismatch
- multiple_concerns

If UNCERTAIN, you MUST use one of these exact reason codes:
- mixed_signals
- tier2_disagreement_unresolved
- context_uncertain
- synthesis_unclear
- requires_human_review

Format your response as:
VERDICT: [VALID, INVALID, or UNCERTAIN]
REASONING: [2-3 sentences explaining your assessment]
INVALID_REASON: [reason code if verdict is INVALID, otherwise omit]
UNCERTAIN_REASON: [reason code if verdict is UNCERTAIN, otherwise omit]`
}

/**
 * Agent 3: Pattern Recognition Expert
 * Analytical Style: Expert at detecting fabrication patterns and authenticity markers
 * All agents investigate the FULL citation comprehensively - this agent emphasizes pattern recognition and detecting AI hallucinations
 */
export function getPatternRecognitionExpertPrompt(
  citation: Citation,
  context: string,
  tier2Results: CitationValidation
): string {
  const citationText = citation.citationText || ''
  const citationType = citation.citationType || 'unknown'
  
  // Format Tier 2 panel results
  const panelVerdicts = tier2Results.panel_evaluation.map(agent => {
    let verdictStr = `${agent.agent}: ${agent.verdict}`
    if (agent.invalid_reason) {
      verdictStr += ` (${agent.invalid_reason})`
    }
    if (agent.uncertain_reason) {
      verdictStr += ` (${agent.uncertain_reason})`
    }
    return verdictStr
  }).join('\n- ')

  return `You are a pattern recognition expert specializing in detecting fabrication patterns 
and authenticity markers in legal citations. You have deep expertise in recognizing the 
characteristics of AI-generated citations versus real legal authority. You are examining 
a citation that received conflicting assessments from a panel of five validators.

Citation: ${citationText}
Citation Type: ${citationType}
Document Context: ${context}

Tier 2 Panel Results:
- Agreement Level: ${tier2Results.consensus.agreement_level}
- Verdicts: 
- ${panelVerdicts}
- Confidence Score: ${(tier2Results.consensus.confidence_score * 100).toFixed(0)}%
- Panel Reasoning: ${tier2Results.consensus.reasoning}

Your Task:
Investigate this citation comprehensively with emphasis on pattern recognition. As a pattern 
recognition expert, you examine ALL aspects: authority existence, metadata accuracy, temporal 
consistency, context fit, and fabrication markers. You are particularly attuned to detecting 
AI hallucination patterns and assessing overall authenticity gestalt.

Investigate ALL of these areas comprehensively:

1. AUTHORITY VERIFICATION
   - Is this court/reporter/statute combination credible?
   - Would this authority realistically exist at this time?
   - Are there any red flags in the metadata (volumes, pages, years)?

2. EXISTENCE ASSESSMENT
   - Based on your knowledge, does this specific citation likely exist?
   - Have you encountered this citation or similar ones?
   - Is there any indication this is a known, real authority?

3. TEMPORAL CONSISTENCY
   - Do the dates and timeline make sense?
   - Would this citation exist at this point in legal history?
   - Are there temporal inconsistencies?

4. CONTEXT ANALYSIS
   - Does the citation fit the legal argument presented? (Note: A good fit is EXPECTED and POSITIVE - lawyers cite authorities that support their arguments. Do NOT treat a perfect fit as suspicious on its own.)
   - Would a lawyer realistically cite this authority for this proposition?
   - Does the citation feel embedded in real discourse or inserted artificially?

5. FABRICATION PATTERN DETECTION
   - Are there patterns suggesting AI invention? (e.g., suspiciously convenient page numbers, "too perfect" fits, generic party names)
   - Do you see markers of AI hallucination vs. real citations?
   - Does the citation have the "gestalt" of authenticity or fabrication?
   - Are there patterns that feel constructed rather than organic?

Common fabrication markers:
- Suspiciously convenient page numbers (always starting at round numbers)
- Party names that feel like examples rather than real parties
- Citations that perfectly support arguments in ways that feel constructed
- Unusual specificity (pin-cites that seem tailored)
- Combinations that technically work but feel "too perfect"

Real citations often:
- Have messier specifics
- May have unusual party names
- Sometimes have odd page number progressions
- Feel embedded in actual discourse rather than inserted

6. TIER 2 PATTERN ANALYSIS
   - What patterns do you see in the Tier 2 panel's disagreement?
   - Do the Tier 2 concerns align with known fabrication markers?
   - What does the pattern of Tier 2 verdicts suggest about authenticity?

Your analytical style emphasizes pattern recognition and detecting fabrication markers. Assess 
the overall "gestalt" - does this citation feel real or fabricated?

Respond with EXACTLY one of:
- VALID: Citation appears to be real and legitimate. No significant issues detected.
- INVALID: Citation appears to be fabricated or hallucinated. Clear evidence of fabrication.
- UNCERTAIN: Citation may be real but has issues requiring review, or insufficient information to determine validity.

If INVALID, you MUST use one of these exact reason codes:
- fabrication_markers
- hallucination_pattern
- too_perfect_fit
- authenticity_gestalt_negative
- ai_invention_clear

If UNCERTAIN, you MUST use one of these exact reason codes:
- pattern_ambiguous
- mixed_authenticity_signals
- gestalt_unclear
- some_fabrication_concerns
- requires_human_review

Format your response as:
VERDICT: [VALID, INVALID, or UNCERTAIN]
REASONING: [2-3 sentences explaining your assessment]
INVALID_REASON: [reason code if verdict is INVALID, otherwise omit]
UNCERTAIN_REASON: [reason code if verdict is UNCERTAIN, otherwise omit]`
}

/**
 * @deprecated Use getRigorousLegalInvestigatorPrompt, getHolisticLegalAnalystPrompt, or getPatternRecognitionExpertPrompt instead
 * Legacy function kept for backward compatibility
 */
export function getTier3InvestigationPrompt(
  citation: Citation,
  context: string,
  tier2Results: CitationValidation
): string {
  // Use Agent 1 (Rigorous Legal Investigator) as default for backward compatibility
  return getRigorousLegalInvestigatorPrompt(citation, context, tier2Results)
}

