/**
 * Validation Prompt Templates
 * Prompt templates for Tier 2 validation agents per validationT2.md specification
 */

import { Citation, CaseComponents, StatuteComponents, RegulationComponents, RuleComponents } from '@/types/citation-json'

/**
 * Agent 1: Authority Specialist
 * Focus: Reporter/court/volume/page/year plausibility
 * Role: Detect structural publication impossibilities ONLY.
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

  return `You are an authority validator. Your ONLY job is to evaluate whether the
citation's metadata (court, reporter, volume, page, year) is plausible for
real-world legal publications.

You DO NOT evaluate doctrinal content, party names, argument fit,
"too perfect" support, or whether the case feels real.

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Components:
${componentsText}

Evaluate STRICTLY:
- Does this court publish in this reporter?
- Was this reporter active in this year?
- Is the volume plausible for this reporter/year?
- Is the page number within normal range?
- Did this court exist during that time?

If metadata is normal → VALID.
Only clear structural impossibilities → INVALID.
Anything unusual but not impossible → UNCERTAIN.

Respond EXACTLY with:
VALID
INVALID [reason_code]
UNCERTAIN [reason_code]

INVALID reason codes:
- reporter_court_mismatch
- volume_impossible
- page_unreasonable
- reporter_timing_wrong
- year_implausible

UNCERTAIN reason codes:
- unusual_volume_page
- reporter_edge_case
- timing_questionable`
}

/**
 * Agent 2: Ecology Specialist
 * Focus: Party configuration & litigation plausibility
 * Role: Evaluate whether the type of parties and type of case are realistic.
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

  return `You are a case ecology validator. You evaluate whether the party structure and
case-type characteristics are realistic.

You DO NOT:
- Penalize generic or boring names (e.g., Smith v. Jones is extremely common)
- Evaluate doctrinal content
- Judge "too perfect fit"
- Judge metadata or timeline

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Parties: ${partiesText}
Court: ${courtText}
Document Context: ${context}

Evaluate ONLY:
- Do the parties resemble real individuals, companies, or government entities?
- Does the party pairing make sense for the type of dispute?
- Does the case type (civil/criminal/admin) match the party roles?
- Are there entity-type mismatches (e.g., federal agency litigating a local eviction case)?

If party configuration is normal → VALID.
Generic names → VALID or UNCERTAIN (never INVALID).
INVALID only for clear mismatches.

Respond EXACTLY with:
VALID
INVALID [reason_code]
UNCERTAIN [reason_code]

INVALID reason codes:
- case_type_implausible
- characteristics_mismatch
- party_role_impossible
- entity_type_impossible

UNCERTAIN reason codes:
- names_generic_but_possible
- unusual_pairing
- characteristics_unclear`
}

/**
 * Agent 3: Temporal Specialist
 * Focus: Timeline & historical plausibility
 * Role: Detect temporal impossibilities ONLY.
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

  return `You are a temporal validator. Your ONLY job is to evaluate whether the
citation's year, court history, reporter sequence, and issue timing are
historically plausible.

You DO NOT evaluate:
- Generic names
- Argument fit
- Party structure
- Gestalt or pattern concerns

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Court: ${courtText}
Year: ${yearText}
Context: ${context}

Evaluate:
- Did this court exist in this year?
- Was this reporter active at the time?
- Was the legal issue relevant during that period?
- Is the age of the authority plausible for its cited use?

If historically normal → VALID.
INVALID only for clear anachronisms.
Ambiguous timeline → UNCERTAIN.

Respond EXACTLY with:
VALID
INVALID [reason_code]
UNCERTAIN [reason_code]

INVALID reason codes:
- temporal_impossibility
- anachronistic_issue
- historical_mismatch
- future_dated

UNCERTAIN reason codes:
- early_in_reporter_series
- edge_of_legal_development
- timing_unusual_but_possible`
}

/**
 * Agent 4: Knowledge Generalist
 * Focus: Broad doctrinal plausibility (NOT hallucination detection)
 * Role: Check whether the authority makes basic legal sense.
 */
export function getLegalKnowledgeValidatorPrompt(
  citation: Citation,
  context: string
): string {
  return `You are a broad legal knowledge validator. You evaluate general doctrinal and
subject-matter plausibility.

You DO NOT:
- Penalize generic names
- Treat "too perfect fit" as suspicious
- Use deep pattern analysis (Tier 3 does that)
- Perform structural or temporal checks

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Context: ${context}

Evaluate ONLY:
- Does this type of authority logically apply to this issue?
- Is this court an appropriate forum for this subject matter?
- Does the general legal rule described plausibly match the authority category?

If broadly consistent → VALID.
If clearly doctrinally impossible → INVALID.
If unfamiliar or unclear → UNCERTAIN (preferred).

Respond EXACTLY with:
VALID
INVALID [reason_code]
UNCERTAIN [reason_code]

INVALID reason codes:
- inconsistent_with_knowledge
- unknown_authority
- doctrine_impossible
- jurisdiction_mismatch

UNCERTAIN reason codes:
- unfamiliar_but_possible
- edge_case_authority
- weak_signals_both_ways`
}

/**
 * Agent 5: Reality Generalist
 * Focus: High-level cross-dimensional contradiction check
 * Role: Provide extremely light-touch anomaly sensing.
 */
export function getRealityAssessmentExpertPrompt(
  citation: Citation,
  context: string
): string {
  return `You are a broad-pattern reality checker. Your job is to detect ONLY clear
cross-dimensional contradictions.

You DO NOT:
- Treat "too perfect fit" as suspicious
- Penalize generic names
- Use intuition or vibes
- Perform hallucination detection (Tier 3 does this)
- Override specialists on metadata, timeline, or ecology

Citation: ${citation.citationText}
Citation Type: ${citation.citationType}
Context: ${context}

Evaluate ONLY:
- Are there contradictions between authority type, issue, and jurisdiction?
- Are there combinations that cannot coexist (e.g., criminal statute cited as civil precedent)?
- Is the formatting structurally incoherent in a way no specialist would handle?

If no contradictions → VALID.
If contradictions are clear → INVALID.
If merely unusual → UNCERTAIN.

Respond EXACTLY with:
VALID
INVALID [reason_code]
UNCERTAIN [reason_code]

INVALID reason codes:
- cross_dimension_contradiction
- structural_incoherence
- authority_category_mismatch
- impossible_combination

UNCERTAIN reason codes:
- mixed_signals
- insufficient_evidence
- unusual_but_not_invalid`
}

