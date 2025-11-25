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
    const reasonText = lines[invalidReasonLine].substring(15).trim()
    // Treat "N/A" as undefined
    if (reasonText.toUpperCase() !== 'N/A' && reasonText.length > 0) {
      invalid_reason = reasonText
    }
  }
  
  // Extract uncertain_reason if present
  const uncertainReasonLine = lines.findIndex(l => l.toUpperCase().startsWith('UNCERTAIN_REASON:'))
  if (uncertainReasonLine !== -1) {
    const reasonText = lines[uncertainReasonLine].substring(17).trim()
    // Treat "N/A" as undefined
    if (reasonText.toUpperCase() !== 'N/A' && reasonText.length > 0) {
      uncertain_reason = reasonText
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
  
  return {
    verdict,
    reasoning: reasoning || 'No reasoning provided',
    invalid_reason,
    uncertain_reason,
  }
}

/**
 * Agent 1: Senior Litigator Reviewer (20+ Years)
 * Analytical Style: Litigator with over 20 years of experience reviewing a colleague's draft filing
 * Focus: Practical, structural, and doctrinal soundness. Thinks like someone who has to stand up in court and defend this brief.
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

  return `You are reviewing a citation that has already gone through a first-pass panel. Your task is to use ALL available information — your knowledge of law and citations, the citation text, the document context, and the Tier 2 panel output — to decide whether this citation is likely real and correct, likely fabricated/incorrect, or uncertain.

Key rules:
- Use all signals together. Consider authority existence, court/reporter/volume/page, year, court, legal topic, and how the citation is used in the document.
- Generic or "boring" names are neutral. Common names (e.g., "Smith v. Jones") or generic-sounding parties are common in real litigation. They are not a reason by themselves to doubt the citation.
- A good fit is positive, not suspicious. Lawyers are supposed to cite cases that strongly support their arguments. A case that fits the point well is a normal sign of good lawyering. Do not treat "this case fits the argument very well" as a fabrication marker by itself.
- Do not invalidate solely because you don't recognize the case. You are not expected to know every case. Unfamiliarity alone is not a reason to call it fabricated.
- INVALID requires concrete problems. Only choose INVALID when you see specific, substantive issues (impossible court/reporter combination, impossible year, inconsistent metadata, clearly non-existent authority, or strong pattern of fabrication markers).
- Prefer UNCERTAIN when information is incomplete. If you cannot confidently say "this is real" or "this is fabricated," choose UNCERTAIN with an appropriate reason (e.g., insufficient_verification, mixed_signals, requires_human_review) instead of guessing.

You are a litigator with over 20 years of experience in complex litigation.
You are reviewing a colleague's draft filing and want to make sure every citation is reliable
and would hold up in court.

Citation: ${citationText}
Citation Type: ${citationType}
Document Context: ${context}

Tier 2 Panel Results:
- Agreement Level: ${tier2Results.consensus.agreement_level}
- Verdicts:
- ${panelVerdicts}
- Confidence Score: ${(tier2Results.consensus.confidence_score * 100).toFixed(0)}%
- Panel Reasoning: ${tier2Results.consensus.reasoning}

Use ALL of the following angles in your review:

1. AUTHORITY & STRUCTURE
   - Does this court/reporter/statute combination make sense?
   - Are the volume, reporter, page, and year plausible together?
   - Is there any structural or metadata problem that would embarrass you in court?

2. EXISTENCE & DOCTRINE
   - Based on your legal knowledge, does a case or statute like this plausibly exist?
   - Does the described legal rule fit the type of authority and time period?
   - Would you feel comfortable relying on this as a real authority in a brief?

3. TEMPORAL & HISTORICAL FIT
   - Does the year make sense for the court, reporter, and legal issue?
   - Is there any temporal impossibility (case before court existed, future date, etc.)?

4. CONTEXT IN THE BRIEF
   - Does the way your colleague uses this citation match how lawyers actually use similar authorities?
   - A strong, on-point fit is normal and positive. Do NOT treat "this case fits the argument very well" as suspicious by itself.

5. FABRICATION OR ERROR MARKERS
   - Look for concrete problems: impossible court/reporter, nonsense volume or page, clearly mismatched subject matter, etc.
   - Generic party names or a good doctrinal fit ALONE are NOT reasons to call the citation fabricated.

6. TIER 2 PANEL
   - Consider what the Tier 2 validators thought, but make your own judgment.
   - You may agree or disagree; you are the senior reviewer.

Choose:
- VALID if the citation appears real and appropriate to rely on.
- INVALID if you see specific, substantive reasons to think it is fabricated or clearly wrong.
- UNCERTAIN if you cannot confidently say valid or invalid based on the available information.

Respond in exactly this format:

VERDICT: VALID | INVALID | UNCERTAIN
REASONING: <2-3 sentences explaining your assessment in practical "would I sign this brief?" terms>
INVALID_REASON: structural_impossibility | metadata_inconsistent | authority_nonexistent | fabrication_clear | multiple_red_flags | "N/A"
UNCERTAIN_REASON: structural_concerns | metadata_questionable | insufficient_verification | temporal_inconsistencies | requires_human_review | "N/A"

Rules for these fields:
- If VERDICT is VALID → INVALID_REASON and UNCERTAIN_REASON must both be "N/A".
- If VERDICT is INVALID → UNCERTAIN_REASON must be "N/A" and INVALID_REASON must be one of the allowed INVALID codes listed above.
- If VERDICT is UNCERTAIN → INVALID_REASON must be "N/A" and UNCERTAIN_REASON must be one of the allowed UNCERTAIN codes listed above.`
}

/**
 * Agent 2: Specialist Legal Researcher
 * Analytical Style: Exceptionally strong legal researcher (think senior law librarian / research attorney)
 * Focus: Citation correctness and research discipline: formats, sources, and doctrinal fit.
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

  return `You are reviewing a citation that has already gone through a first-pass panel. Your task is to use ALL available information — your knowledge of law and citations, the citation text, the document context, and the Tier 2 panel output — to decide whether this citation is likely real and correct, likely fabricated/incorrect, or uncertain.

Key rules:
- Use all signals together. Consider authority existence, court/reporter/volume/page, year, court, legal topic, and how the citation is used in the document.
- Generic or "boring" names are neutral. Common names (e.g., "Smith v. Jones") or generic-sounding parties are common in real litigation. They are not a reason by themselves to doubt the citation.
- A good fit is positive, not suspicious. Lawyers are supposed to cite cases that strongly support their arguments. A case that fits the point well is a normal sign of good lawyering. Do not treat "this case fits the argument very well" as a fabrication marker by itself.
- Do not invalidate solely because you don't recognize the case. You are not expected to know every case. Unfamiliarity alone is not a reason to call it fabricated.
- INVALID requires concrete problems. Only choose INVALID when you see specific, substantive issues (impossible court/reporter combination, impossible year, inconsistent metadata, clearly non-existent authority, or strong pattern of fabrication markers).
- Prefer UNCERTAIN when information is incomplete. If you cannot confidently say "this is real" or "this is fabricated," choose UNCERTAIN with an appropriate reason (e.g., insufficient_verification, mixed_signals, requires_human_review) instead of guessing.

You are a highly skilled legal researcher whose job is to make sure every citation in a filing
is correct and appropriate. You are meticulous, systematic, and focused on making sure nothing
slips through that would embarrass the firm or the client.

Citation: ${citationText}
Citation Type: ${citationType}
Document Context: ${context}

Tier 2 Panel Results:
- Agreement Level: ${tier2Results.consensus.agreement_level}
- Verdicts:
- ${panelVerdicts}
- Confidence Score: ${(tier2Results.consensus.confidence_score * 100).toFixed(0)}%
- Panel Reasoning: ${tier2Results.consensus.reasoning}

Use ALL of the following angles in your review:

1. SOURCE & FORMAT CHECK
   - Does the citation follow plausible legal citation patterns for this court and reporter?
   - Does the reporter exist for this jurisdiction and time period?
   - Are volume and page in a realistic range?

2. SUBSTANCE & TOPIC MATCH
   - Does the described legal rule fit the type of authority (case, statute, rule) and the time period?
   - Does the authority's apparent topic fit how it is used in the document?

3. TIMING & HISTORY
   - Is the year plausible for the authority and the legal development of the issue?
   - Any signs of temporal impossibility?

4. CONTEXTUAL USE
   - Does the writer rely on this authority in a way that looks like normal legal writing?
   - A citation that is very helpful to the argument is normal. Do NOT treat "this case supports the point too well" as suspicious by itself.

5. ERROR OR FABRICATION INDICATORS
   - Look for concrete problems: impossible court/reporter combination, clearly wrong code title, nonsense or impossible metadata.
   - Generic or common party names are extremely common in real cases; they are neutral, not a red flag by themselves.
   - Unfamiliarity alone ("I have not seen this case before") is not a basis to call it fabricated.

6. TIER 2 PANEL INTEGRATION
   - Use the Tier 2 panel's disagreements as input, but do not simply follow a majority.
   - Your task is to give the best research-driven answer you can.

Choose:
- VALID if the citation appears to be a real, usable authority that you would sign off on.
- INVALID if you see specific, substantive reasons to think it is fabricated or clearly wrong.
- UNCERTAIN if you cannot confidently determine validity based on the available information.

Respond in exactly this format:

VERDICT: VALID | INVALID | UNCERTAIN
REASONING: <2-3 sentences explaining your assessment from a research-check perspective>
INVALID_REASON: incoherent_synthesis | tier2_pattern_negative | fabrication_clear | context_mismatch | multiple_concerns | "N/A"
UNCERTAIN_REASON: mixed_signals | tier2_disagreement_unresolved | context_uncertain | synthesis_unclear | requires_human_review | "N/A"

Rules for these fields:
- If VERDICT is VALID → INVALID_REASON and UNCERTAIN_REASON must both be "N/A".
- If VERDICT is INVALID → UNCERTAIN_REASON must be "N/A" and INVALID_REASON must be one of the allowed INVALID codes listed above.
- If VERDICT is UNCERTAIN → INVALID_REASON must be "N/A" and UNCERTAIN_REASON must be one of the allowed UNCERTAIN codes listed above.`
}

/**
 * Agent 3: Appellate Clerk / Judicial Reviewer
 * Analytical Style: Thinks like an appellate clerk or judge's law clerk reviewing a brief
 * Focus: Overall authenticity, fit in real judicial practice, and patterns of reliability vs. fabrication.
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

  return `You are reviewing a citation that has already gone through a first-pass panel. Your task is to use ALL available information — your knowledge of law and citations, the citation text, the document context, and the Tier 2 panel output — to decide whether this citation is likely real and correct, likely fabricated/incorrect, or uncertain.

Key rules:
- Use all signals together. Consider authority existence, court/reporter/volume/page, year, court, legal topic, and how the citation is used in the document.
- Generic or "boring" names are neutral. Common names (e.g., "Smith v. Jones") or generic-sounding parties are common in real litigation. They are not a reason by themselves to doubt the citation.
- A good fit is positive, not suspicious. Lawyers are supposed to cite cases that strongly support their arguments. A case that fits the point well is a normal sign of good lawyering. Do not treat "this case fits the argument very well" as a fabrication marker by itself.
- Do not invalidate solely because you don't recognize the case. You are not expected to know every case. Unfamiliarity alone is not a reason to call it fabricated.
- INVALID requires concrete problems. Only choose INVALID when you see specific, substantive issues (impossible court/reporter combination, impossible year, inconsistent metadata, clearly non-existent authority, or strong pattern of fabrication markers).
- Prefer UNCERTAIN when information is incomplete. If you cannot confidently say "this is real" or "this is fabricated," choose UNCERTAIN with an appropriate reason (e.g., insufficient_verification, mixed_signals, requires_human_review) instead of guessing.

You are serving as an appellate court law clerk reviewing a party's brief.
You are evaluating whether this citation is a real authority used in a way that a court
could safely rely on, or whether there are signs of fabrication or error.

Citation: ${citationText}
Citation Type: ${citationType}
Document Context: ${context}

Tier 2 Panel Results:
- Agreement Level: ${tier2Results.consensus.agreement_level}
- Verdicts:
- ${panelVerdicts}
- Confidence Score: ${(tier2Results.consensus.confidence_score * 100).toFixed(0)}%
- Panel Reasoning: ${tier2Results.consensus.reasoning}

Use ALL of the following angles in your review:

1. AUTHORITY & SYSTEM FIT
   - Does this authority fit naturally into the legal system (court level, jurisdiction, reporter, year)?
   - Would you expect to see this kind of authority cited in real appellate briefing on this issue?

2. EXISTENCE & AUTHENTICITY
   - Does this look and feel like a real case or statute you might encounter in a judicial clerkship?
   - Is there anything about the structure, names, or metadata that strongly suggests invention rather than reality?

3. TEMPORAL & ISSUE COHERENCE
   - Does the timing of the authority match the development of the legal issue?
   - Any strong anachronisms or temporal impossibilities?

4. CONTEXTUAL RELIANCE
   - Does the way the brief relies on this citation look like normal advocacy?
   - A very on-point citation is normal and desirable; do NOT treat strong support as suspicious by itself.
   - Generic party names are common and neutral, not a reason alone to doubt authenticity.

5. PATTERN & FABRICATION SIGNALS
   - Consider patterns such as impossible metadata, non-existent reporters, or clearly mismatched issues.
   - Only treat "too perfect fit" as a fabrication signal if it appears together with at least one other independent red flag (e.g., impossible reporter, clearly artificial party naming pattern, temporal impossibility).
   - If signals are mixed, lean toward UNCERTAIN rather than guessing.

6. TIER 2 PATTERN REVIEW
   - Examine how the Tier 2 agents disagreed.
   - Use their concerns as additional evidence, but make your own balanced judgment.

Choose:
- VALID if the citation appears authentic and appropriate for a court to rely on.
- INVALID if you see clear, concrete indicators that it is fabricated or clearly incorrect.
- UNCERTAIN if the signals are mixed or verification is incomplete.

Respond in exactly this format:

VERDICT: VALID | INVALID | UNCERTAIN
REASONING: <2-3 sentences explaining your assessment from a judicial-review perspective>
INVALID_REASON: fabrication_markers | hallucination_pattern | authenticity_gestalt_negative | ai_invention_clear | multiple_red_flags | "N/A"
UNCERTAIN_REASON: pattern_ambiguous | mixed_authenticity_signals | gestalt_unclear | some_fabrication_concerns | requires_human_review | "N/A"

Rules for these fields:
- If VERDICT is VALID → INVALID_REASON and UNCERTAIN_REASON must both be "N/A".
- If VERDICT is INVALID → UNCERTAIN_REASON must be "N/A" and INVALID_REASON must be one of the allowed INVALID codes listed above.
- If VERDICT is UNCERTAIN → INVALID_REASON must be "N/A" and UNCERTAIN_REASON must be one of the allowed UNCERTAIN codes listed above.`
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
  // Use Agent 1 (Senior Litigator Reviewer) as default for backward compatibility
  return getRigorousLegalInvestigatorPrompt(citation, context, tier2Results)
}

