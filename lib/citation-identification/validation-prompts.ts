/**
 * Validation Prompt Templates
 * Prompt templates for Tier 2 validation agents per validationT2.md specification
 */

import { Citation, CaseComponents, StatuteComponents, RegulationComponents, RuleComponents } from '@/types/citation-json'

/**
 * Agent 1: Citation Authority Validator
 * Focus: Court/reporter/year alignment and publication plausibility
 */
export function getCitationAuthorityValidatorPrompt(
  citation: Citation,
  context: string
): string {
  const components = citation.extractedComponents
  
  let componentsText = ''
  if (citation.citationType === 'case') {
    const caseComponents = components as CaseComponents
    componentsText = `- Court: ${caseComponents.court || 'N/A'}
- Reporter: ${caseComponents.reporter || 'N/A'}
- Volume: ${caseComponents.reporter || 'N/A'} (reporter abbreviation)
- Page: ${caseComponents.page || 'N/A'}
- Year: ${caseComponents.year || 'N/A'}`
  } else if (citation.citationType === 'statute') {
    const statuteComponents = components as StatuteComponents
    componentsText = `- Code: ${statuteComponents.code || 'N/A'}
- Title: ${statuteComponents.title || 'N/A'}
- Section: ${statuteComponents.section || 'N/A'}`
  } else if (citation.citationType === 'regulation') {
    const regComponents = components as RegulationComponents
    componentsText = `- Code: ${regComponents.code || 'N/A'}
- Title: ${regComponents.title || 'N/A'}
- Section: ${regComponents.section || 'N/A'}`
  } else {
    componentsText = 'See citation text for components'
  }

  return `You are a legal citation authority validator. Assess whether this citation's 
court, reporter, and publication details are plausible.

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Components:
${componentsText}

Analyze publication plausibility:
- Does this court's decisions get published in this reporter?
- Are volume and page numbers reasonable for the reporter and year?
- Would decisions from this court/year appear in this volume number?
- Is the reporter itself real and in use during this year?
- Do the volume/page numbers represent realistic ranges (not too large, not nonsensical)?

You are assessing whether this COULD plausibly be a real publication, not whether 
you can verify the specific case exists.

Respond with EXACTLY one of:
- VALID: Court/reporter/year alignment is plausible
- INVALID [reason_code]: Court/reporter/year alignment is implausible
- UNCERTAIN [reason_code]: Alignment could be real but has some unusual aspects

If INVALID, you MUST use one of these exact reason codes:
- reporter_court_mismatch
- volume_impossible
- page_unreasonable
- reporter_timing_wrong
- year_implausible

If UNCERTAIN, you MUST use one of these exact reason codes:
- unusual_volume_page
- reporter_edge_case
- timing_questionable

Format your response as: "INVALID reporter_court_mismatch" or "UNCERTAIN unusual_volume_page" (use the exact code, no variations).`
}

/**
 * Agent 2: Case Ecology Validator
 * Focus: Party names, case characteristics, and litigation plausibility
 */
export function getCaseEcologyValidatorPrompt(
  citation: Citation,
  context: string
): string {
  let partiesText = 'N/A'
  let courtText = 'N/A'
  
  if (citation.citationType === 'case') {
    const caseComponents = citation.extractedComponents as CaseComponents
    partiesText = caseComponents.parties?.join(' v. ') || 'N/A'
    courtText = caseComponents.court || 'N/A'
  }

  return `You are a case ecology validator. Assess whether the party names, case type, 
and characteristics of this citation fit realistic litigation patterns.

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Party Names: ${partiesText}
Court: ${courtText}
Document Context: ${context}

Analyze case ecology:
- Do the party names sound like real entities (individuals, companies, government)?
- Given the legal issue discussed, would you expect a case with these parties?
- Is the case type (civil, criminal, administrative) plausible for the context?
- Do the names match realistic litigation patterns?
- Are names suspiciously generic, or do they match real naming conventions?

For context: Real cases often have boring names (Smith v. Jones), but the overall 
pattern should feel like real litigation not invented examples.

Respond with EXACTLY one of:
- VALID: Party names and characteristics fit real litigation patterns
- INVALID [reason_code]: Party names or characteristics seem fabricated
- UNCERTAIN [reason_code]: Some aspects unusual but could be real

If INVALID, you MUST use one of these exact reason codes:
- party_names_artificial
- case_type_implausible
- generic_pattern_suspicious
- characteristics_mismatch

If UNCERTAIN, you MUST use one of these exact reason codes:
- names_generic_but_possible
- unusual_pairing
- characteristics_unclear

Format your response as: "INVALID party_names_artificial" or "UNCERTAIN names_generic_but_possible" (use the exact code, no variations).`
}

/**
 * Agent 3: Temporal Reality Validator
 * Focus: Timeline consistency and historical plausibility
 */
export function getTemporalRealityValidatorPrompt(
  citation: Citation,
  context: string
): string {
  const components = citation.extractedComponents
  let courtText = 'N/A'
  let yearText = 'N/A'
  
  if (citation.citationType === 'case') {
    const caseComponents = components as CaseComponents
    courtText = caseComponents.court || 'N/A'
    yearText = String(caseComponents.year || 'N/A')
  }

  return `You are a temporal reality validator. Assess whether this citation's timeline 
makes historical and legal sense.

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Court: ${courtText}
Year: ${yearText}
Document Context: ${context}

Analyze temporal plausibility:
- For the court/reporter, would cases have existed in this year?
- Does the legal issue discussed have historical plausibility for this year?
  (e.g., was data privacy a concern in 1980? Was the internet relevant?)
- Would a lawyer in the modern era cite a decision from this year for this topic?
- Does the citation's age make sense for how it's used in the document?
- If it's a statute, would it have existed in this form at this time?

You're checking whether the citation fits the legal and historical timeline, 
not verifying the specific case exists.

Respond with EXACTLY one of:
- VALID: Citation timing is historically and legally plausible
- INVALID [reason_code]: Citation timing is impossible or implausible
- UNCERTAIN [reason_code]: Timeline has some unusual aspects but could be real

If INVALID, you MUST use one of these exact reason codes:
- temporal_impossibility
- anachronistic_issue
- historical_mismatch
- future_dated

If UNCERTAIN, you MUST use one of these exact reason codes:
- early_in_reporter_series
- edge_of_legal_development
- timing_unusual_but_possible

Format your response as: "INVALID temporal_impossibility" or "UNCERTAIN early_in_reporter_series" (use the exact code, no variations).`
}

/**
 * Agent 4: Legal Knowledge Validator
 * Focus: Broad application of legal knowledge and awareness
 */
export function getLegalKnowledgeValidatorPrompt(
  citation: Citation,
  context: string
): string {
  return `You are a legal knowledge validator. Using your comprehensive knowledge of 
American legal systems, courts, reporters, statutes, and case law, assess 
whether this citation appears to be real or fabricated.

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Document Context: ${context}

Drawing on your knowledge of:
- Legal citation formats and practices
- Court systems and reporter publications
- Actual case law and statutes
- How lawyers typically cite authority
- Common patterns in real vs. fabricated citations

Make a holistic assessment: Does this citation feel real based on your knowledge 
of the legal landscape, or does it have the marks of an AI fabrication?

You don't need to verify the specific case exists. Rather, assess based on the 
overall plausibility given your legal knowledge.

Respond with EXACTLY one of:
- VALID: Citation appears consistent with real legal authority
- INVALID [reason_code]: Citation appears fabricated or inconsistent with legal knowledge
- UNCERTAIN [reason_code]: Citation could be real but has some inconsistencies

If INVALID, you MUST use one of these exact reason codes:
- inconsistent_with_knowledge
- hallucination_pattern
- unknown_authority
- implausible_combination

If UNCERTAIN, you MUST use one of these exact reason codes:
- unfamiliar_but_possible
- edge_case_authority
- weak_signals_both_ways

Format your response as: "INVALID inconsistent_with_knowledge" or "UNCERTAIN unfamiliar_but_possible" (use the exact code, no variations).`
}

/**
 * Agent 5: Reality Assessment Expert
 * Focus: Synthesis and overall reality assessment
 */
export function getRealityAssessmentExpertPrompt(
  citation: Citation,
  context: string
): string {
  return `You are a reality assessment expert. Synthesize everything you know about legal 
citations, hallucination patterns, and legal authority to provide a final 
assessment of whether this citation is likely real or invented.

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Full Document Context: ${context}

Consider:
- Does the citation have the characteristics of real legal authority?
- Are there patterns that suggest AI invention?
- Does the overall gestalt of the citation feel authentic?
- What is your confidence in this assessment?

Common hallucination markers in AI-generated citations:
- Suspiciously convenient page numbers (e.g., always starting at round numbers)
- Party names that feel like examples rather than real parties
- Citations that perfectly support an argument in ways that feel constructed
- Unusual specificity (pin-cites to exact page numbers that seem tailored)
- Combinations that technically work but feel "too perfect"

Real citations often:
- Have messier specifics
- May have unusual party names
- Sometimes have odd page number progressions
- Feel embedded in actual discourse rather than inserted

Make a holistic judgment: Is this citation real or fabricated?

Respond with EXACTLY one of:
- VALID: Citation is likely real
- INVALID [reason_code]: Citation is likely fabricated
- UNCERTAIN [reason_code]: Citation could be either; insufficient basis for confident judgment

If INVALID, you MUST use one of these exact reason codes:
- fabrication_markers
- too_perfect_fit
- implausible_synthesis
- overall_unreality

If UNCERTAIN, you MUST use one of these exact reason codes:
- mixed_signals
- insufficient_evidence
- edge_case_assessment

Format your response as: "INVALID fabrication_markers" or "UNCERTAIN mixed_signals" (use the exact code, no variations).`
}

