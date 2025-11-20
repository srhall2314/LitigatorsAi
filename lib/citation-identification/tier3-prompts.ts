/**
 * Tier 3 Citation Investigation Specialist Prompt
 * Per tier3prompt.md specification
 */

import { Citation, CitationValidation, Tier3Verdict, Tier3Confidence } from '@/types/citation-json'

export interface ParsedTier3Response {
  verdict: Tier3Verdict
  reasoning: string
  key_evidence: string
  remaining_uncertainties?: string
  confidence: Tier3Confidence
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

export function getTier3InvestigationPrompt(
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

  return `You are a citation investigation specialist. You are examining a citation that 
received conflicting assessments from a panel of five validators.

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
Using everything you know about law, courts, reporters, statutes, case law, and 
legal practices, investigate this citation thoroughly. Your goal is to determine 
with high confidence whether this citation is real or fabricated.

Investigation Steps:

1. AUTHORITY VERIFICATION
   - Is this court/reporter/statute combination credible?
   - Would this authority realistically exist at this time?
   - Are there any red flags in the metadata?

2. EXISTENCE ASSESSMENT
   - Based on your knowledge, does this specific citation likely exist?
   - Have you encountered this citation or similar ones?
   - Is there any indication this is a known, real authority?

3. CONTEXT ANALYSIS
   - Does the citation fit the legal argument presented? (Note: A good fit is EXPECTED and POSITIVE - lawyers cite authorities that support their arguments. Do NOT treat a perfect fit as suspicious on its own.)
   - Would a lawyer realistically cite this authority for this proposition?
   - Only flag fabrication concerns if there are OTHER red flags (generic names, unknown case, fabrication markers, etc.) BEYOND just a good fit. A citation that "serves the exact legal proposition needed" is what legitimate citations do - this is not a red flag.

4. RECONCILE TIER 2 DISAGREEMENT
   - Where did the panel disagree?
   - Which agents were correct, and why?
   - What did they miss or misinterpret?

5. FABRICATION LIKELIHOOD
   - If this is fabricated, what would make it fabricated?
   - If this is real, what makes it credible despite uncertainty?
   - Are there specific hallucination markers present?

Provide Your Assessment:

Respond with EXACTLY one of:
- VERIFIED_REAL: Citation is real with high confidence
- LIKELY_REAL: Citation appears real but with some uncertainty
- LIKELY_FABRICATED: Citation appears fabricated with reasonable confidence
- NEEDS_HUMAN_REVIEW: Citation appears real or structurally valid, but contains issues, contradictions, or context mismatches that require a human editor to resolve

Use NEEDS_HUMAN_REVIEW when you detect:
- Temporal inconsistencies (e.g., 2023 WL citation with 2020 parenthetical date)
- Wrong parenthetical dates
- Wrong court or jurisdiction in parenthetical
- Case citation format used where a party brief is described
- WL/Lexis cite whose year conflicts with filing description
- Incomplete citations
- Any metadata that doesn't align
- Anything that is not fabricated, but not acceptable as-is

Then provide:
1. Your reasoning (2-3 sentences)
2. Key evidence supporting your assessment
3. Remaining uncertainties (if any)
4. Confidence level (high/medium/low)

Format your response as:
VERDICT: [one of the four verdicts above]
REASONING: [2-3 sentences]
KEY_EVIDENCE: [key evidence]
UNCERTAINTIES: [remaining uncertainties, or "None" if none]
CONFIDENCE: [high/medium/low]`
}

