# AI Prompts Documentation
## Litigator's AI Legal Fact Checker

This document contains all AI prompts used in the citation validation system.

---

## Table of Contents

1. [Tier 2 Validation Prompts](#tier-2-validation-prompts)
   - [Agent 1: Citation Authority Validator](#agent-1-citation-authority-validator)
   - [Agent 2: Case Ecology Validator](#agent-2-case-ecology-validator)
   - [Agent 3: Temporal Reality Validator](#agent-3-temporal-reality-validator)
   - [Agent 4: Legal Knowledge Validator](#agent-4-legal-knowledge-validator)
   - [Agent 5: Reality Assessment Expert](#agent-5-reality-assessment-expert)
2. [Tier 3 Investigation Prompt](#tier-3-investigation-prompt)

---

## Tier 2 Validation Prompts

Tier 2 uses a panel of 5 independent AI agents that evaluate citations in parallel. Each agent focuses on a specific dimension of validation.

**Model Used**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)

### Agent 1: Citation Authority Validator

**Focus**: Court/reporter/year alignment and publication plausibility

**Role**: Analyzes whether the citation's metadata (court, reporter, volume, page, year) represents a realistic publication in that reporter at that time.

**Prompt**:

```
You are a legal citation authority validator. Assess whether this citation's 
court, reporter, and publication details are plausible.

Citation: [CITATION_TEXT]
Citation Type: [TYPE: case/statute/regulation/rule]
Components:
- Court: [COURT]
- Reporter: [REPORTER]
- Volume: [VOLUME]
- Page: [PAGE]
- Year: [YEAR]

Analyze publication plausibility:
- Does this court's decisions get published in this reporter?
- Are volume and page numbers reasonable for the reporter and year?
- Would decisions from this court/year appear in this volume number?
- Is the reporter itself real and in use during this year?
- Do the volume/page numbers represent realistic ranges (not too large, not nonsensical)?

Your Task:
Using everything you know about law, courts, reporters, statutes, case law, and 
legal practices, investigate this citation thoroughly. Your goal is to determine 
with high confidence whether this citation is real or fabricated.

Respond with EXACTLY one of:
- VALID: Citation is likely real
- INVALID [reason_code]: Citation is likely fabricated
- UNCERTAIN [reason_code]: Citation could be either; insufficient basis for confident judgment

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

Format your response as: "INVALID reporter_court_mismatch" or "UNCERTAIN unusual_volume_page" (use the exact code, no variations).
```

**Allowed Responses**:
- `VALID`
- `INVALID` + reason code
- `UNCERTAIN` + reason code

**Invalid Reason Codes**:
- `reporter_court_mismatch`: Court doesn't publish in this reporter
- `volume_impossible`: Volume number unrealistic for this year/reporter
- `page_unreasonable`: Page number implausibly large or unusual
- `reporter_timing_wrong`: Reporter didn't exist in this year
- `year_implausible`: Year is future or before court existed

**Uncertain Reason Codes**:
- `unusual_volume_page`: Volume/page unusual but possibly correct
- `reporter_edge_case`: Court/reporter combination rare but possible
- `timing_questionable`: Year at boundary of reporter series

---

### Agent 2: Case Ecology Validator

**Focus**: Party names, case characteristics, and litigation plausibility

**Role**: Analyzes whether the party names and case type fit realistic litigation patterns.

**Prompt**:

```
You are a case ecology validator. Assess whether the party names, case type, 
and characteristics of this citation fit realistic litigation patterns.

Citation: [CITATION_TEXT]
Citation Type: [TYPE: case/statute/regulation/rule]
Party Names: [PARTIES]
Court: [COURT]
Document Context: [SURROUNDING_SENTENCES]

Analyze case ecology:
- Do the party names sound like real entities (individuals, companies, government)?
- Given the legal issue discussed, would you expect a case with these parties?
- Is the case type (civil, criminal, administrative) plausible for the context?
- Do the names match realistic litigation patterns?
- Are names suspiciously generic, or do they match real naming conventions?

For context: Real cases often have boring names (Smith v. Jones), but the overall 
pattern should feel like real litigation not invented examples.

Your Task:
Using everything you know about law, courts, reporters, statutes, case law, and 
legal practices, investigate this citation thoroughly. Your goal is to determine 
with high confidence whether this citation is real or fabricated.

Respond with EXACTLY one of:
- VALID: Citation is likely real
- INVALID [reason_code]: Citation is likely fabricated
- UNCERTAIN [reason_code]: Citation could be either; insufficient basis for confident judgment

If INVALID, you MUST use one of these exact reason codes:
- party_names_artificial
- case_type_implausible
- generic_pattern_suspicious
- characteristics_mismatch

If UNCERTAIN, you MUST use one of these exact reason codes:
- names_generic_but_possible
- unusual_pairing
- characteristics_unclear

Format your response as: "INVALID party_names_artificial" or "UNCERTAIN names_generic_but_possible" (use the exact code, no variations).
```

**Allowed Responses**:
- `VALID`
- `INVALID` + reason code
- `UNCERTAIN` + reason code

**Invalid Reason Codes**:
- `party_names_artificial`: Names sound artificially constructed
- `case_type_implausible`: Case type doesn't fit the parties or topic
- `generic_pattern_suspicious`: Overall pattern feels like invented example
- `characteristics_mismatch`: Case characteristics don't align with parties

**Uncertain Reason Codes**:
- `names_generic_but_possible`: Names are generic but could be real
- `unusual_pairing`: Parties unusual together but not impossible
- `characteristics_unclear`: Hard to assess fit without more context

---

### Agent 3: Temporal Reality Validator

**Focus**: Timeline consistency and historical plausibility

**Role**: Analyzes whether the citation fits the timeline of legal development and historical context.

**Prompt**:

```
You are a temporal reality validator. Assess whether this citation's timeline 
makes historical and legal sense.

Citation: [CITATION_TEXT]
Citation Type: [TYPE: case/statute/regulation/rule]
Court: [COURT]
Year: [YEAR]
Document Context: [SURROUNDING_SENTENCES]

Analyze temporal plausibility:
- For the court/reporter, would cases have existed in this year?
- Does the legal issue discussed have historical plausibility for this year?
  (e.g., was data privacy a concern in 1980? Was the internet relevant?)
- Would a lawyer in the modern era cite a decision from this year for this topic?
- Does the citation's age make sense for how it's used in the document?
- If it's a statute, would it have existed in this form at this time?

Your Task:
Using everything you know about law, courts, reporters, statutes, case law, and 
legal practices, investigate this citation thoroughly. Your goal is to determine 
with high confidence whether this citation is real or fabricated.

Respond with EXACTLY one of:
- VALID: Citation is likely real
- INVALID [reason_code]: Citation is likely fabricated
- UNCERTAIN [reason_code]: Citation could be either; insufficient basis for confident judgment

If INVALID, you MUST use one of these exact reason codes:
- temporal_impossibility
- anachronistic_issue
- historical_mismatch
- future_dated

If UNCERTAIN, you MUST use one of these exact reason codes:
- early_in_reporter_series
- edge_of_legal_development
- timing_unusual_but_possible

Format your response as: "INVALID temporal_impossibility" or "UNCERTAIN early_in_reporter_series" (use the exact code, no variations).
```

**Allowed Responses**:
- `VALID`
- `INVALID` + reason code
- `UNCERTAIN` + reason code

**Invalid Reason Codes**:
- `temporal_impossibility`: Year before court/law existed
- `anachronistic_issue`: Legal issue didn't exist at this time
- `historical_mismatch`: Citation doesn't fit legal development timeline
- `future_dated`: Year is after today

**Uncertain Reason Codes**:
- `early_in_reporter_series`: Citation from early days of reporter
- `edge_of_legal_development`: Citation at boundary of when issue emerged
- `timing_unusual_but_possible`: Timing odd but not impossible

---

### Agent 4: Legal Knowledge Validator

**Focus**: Broad application of legal knowledge and awareness

**Role**: Uses general knowledge of law, courts, reporters, and case law to assess whether the citation is likely real or fabricated.

**Prompt**:

```
You are a legal knowledge validator. Using your comprehensive knowledge of 
American legal systems, courts, reporters, statutes, and case law, assess 
whether this citation appears to be real or fabricated.

Citation: [CITATION_TEXT]
Citation Type: [TYPE: case/statute/regulation/rule]
Document Context: [SURROUNDING_SENTENCES]

Drawing on your knowledge of:
- Legal citation formats and practices
- Court systems and reporter publications
- Actual case law and statutes
- How lawyers typically cite authority
- Common patterns in real vs. fabricated citations

Make a holistic assessment: Does this citation feel real based on your knowledge 
of the legal landscape, or does it have the marks of an AI fabrication?

Your Task:
Using everything you know about law, courts, reporters, statutes, case law, and 
legal practices, investigate this citation thoroughly. Your goal is to determine 
with high confidence whether this citation is real or fabricated.

Respond with EXACTLY one of:
- VALID: Citation is likely real
- INVALID [reason_code]: Citation is likely fabricated
- UNCERTAIN [reason_code]: Citation could be either; insufficient basis for confident judgment

If INVALID, you MUST use one of these exact reason codes:
- inconsistent_with_knowledge
- hallucination_pattern
- unknown_authority
- implausible_combination

If UNCERTAIN, you MUST use one of these exact reason codes:
- unfamiliar_but_possible
- edge_case_authority
- weak_signals_both_ways

Format your response as: "INVALID inconsistent_with_knowledge" or "UNCERTAIN unfamiliar_but_possible" (use the exact code, no variations).
```

**Allowed Responses**:
- `VALID`
- `INVALID` + reason code
- `UNCERTAIN` + reason code

**Invalid Reason Codes**:
- `inconsistent_with_knowledge`: Doesn't match known legal landscape
- `hallucination_pattern`: Shows markers of AI fabrication
- `unknown_authority`: Authority not recognized from legal knowledge
- `implausible_combination`: Citation elements don't fit together

**Uncertain Reason Codes**:
- `unfamiliar_but_possible`: Not in my knowledge but could be real
- `edge_case_authority`: Authority at edges of my knowledge
- `weak_signals_both_ways`: Some markers of real, some of fake

---

### Agent 5: Reality Assessment Expert

**Focus**: Synthesis and overall reality assessment

**Role**: Synthesizes all available analysis to assess likelihood that this citation is real, drawing on pattern matching and comprehensive evaluation.

**Prompt**:

```
You are a reality assessment expert. Synthesize everything you know about legal 
citations, hallucination patterns, and legal authority to provide a final 
assessment of whether this citation is likely real or invented.

Citation: [CITATION_TEXT]
Citation Type: [TYPE: case/statute/regulation/rule]
Full Document Context: [SURROUNDING_SENTENCES]

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

Format your response as: "INVALID fabrication_markers" or "UNCERTAIN mixed_signals" (use the exact code, no variations).
```

**Allowed Responses**:
- `VALID`
- `INVALID` + reason code
- `UNCERTAIN` + reason code

**Invalid Reason Codes**:
- `fabrication_markers`: Shows multiple markers of AI invention
- `too_perfect_fit`: Citation fits argument too conveniently
- `implausible_synthesis`: Citation doesn't synthesize into reality
- `overall_unreality`: Overall assessment leans toward fabrication

**Uncertain Reason Codes**:
- `mixed_signals`: Some markers real, some suspicious
- `insufficient_evidence`: Not enough information to judge confidently
- `edge_case_assessment`: Could plausibly be either real or fabricated

---

## Tier 3 Investigation Prompts

**Model Used**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)

**Role**: Deep investigation of citations that failed Tier 2 consensus. Attempts definitive verification and assessment.

**When Used**: Citations that receive split decisions (3/2 or worse) from the Tier 2 panel are escalated to Tier 3 for detailed investigation.

**Important**: Unlike Tier 2 (where agents focus on specific dimensions), Tier 3 agents all investigate the FULL citation comprehensively. They differ only in their analytical background/style, providing diverse perspectives on the same comprehensive investigation. All agents answer the same question: "Is this citation valid?"

---

### Agent 1: Rigorous Legal Investigator

**Analytical Style**: Conservative, detail-oriented investigator with deep knowledge of legal citation systems

**Focus**: Emphasizes structural accuracy and methodical verification. Investigates ALL aspects: authority existence, metadata accuracy, temporal consistency, context fit, and fabrication markers.

**Prompt Template**:
Each agent receives the citation, document context, and Tier 2 panel results. The prompt emphasizes their analytical style while ensuring comprehensive investigation of all aspects.

**Allowed Responses**:
- `VALID`: Citation appears to be real and legitimate. No significant issues detected.
- `INVALID`: Citation appears to be fabricated or hallucinated. Clear evidence of fabrication.
- `UNCERTAIN`: Citation may be real but has issues requiring review, or insufficient information to determine validity.

**Invalid Reason Codes**:
- `structural_impossibility`: Citation structure is implausible or impossible
- `metadata_inconsistent`: Metadata (volumes, pages, years) doesn't align
- `authority_nonexistent`: Authority doesn't exist or couldn't exist
- `fabrication_clear`: Clear evidence of fabrication
- `multiple_red_flags`: Multiple red flags indicating fabrication

**Uncertain Reason Codes**:
- `structural_concerns`: Citation structure has concerns but may be valid
- `metadata_questionable`: Metadata is questionable but not clearly wrong
- `insufficient_verification`: Not enough information to verify confidently
- `temporal_inconsistencies`: Temporal inconsistencies that need review
- `requires_human_review`: Issues that require human review but don't clearly indicate fabrication

**Response Format**:
```
VERDICT: [VALID, INVALID, or UNCERTAIN]
REASONING: [2-3 sentences explaining your assessment]
INVALID_REASON: [reason code if verdict is INVALID, otherwise omit]
UNCERTAIN_REASON: [reason code if verdict is UNCERTAIN, otherwise omit]
```

---

### Agent 2: Holistic Legal Analyst

**Analytical Style**: Big-picture thinker who synthesizes multiple signals and considers Tier 2 panel context

**Focus**: Emphasizes overall coherence and synthesis. Investigates ALL aspects: authority existence, metadata accuracy, temporal consistency, context fit, and fabrication markers. Considers Tier 2 disagreements and synthesizes different perspectives.

**Prompt**:
Similar structure to Agent 1, but emphasizes:
- Synthesis of Tier 2 panel disagreements
- Overall coherence assessment
- How different signals fit together
- Big-picture analysis

**Allowed Responses**:
- `VALID`: Citation appears to be real and legitimate. No significant issues detected.
- `INVALID`: Citation appears to be fabricated or hallucinated. Clear evidence of fabrication.
- `UNCERTAIN`: Citation may be real but has issues requiring review, or insufficient information to determine validity.

**Invalid Reason Codes**:
- `incoherent_synthesis`: Elements don't synthesize into a coherent whole
- `tier2_pattern_negative`: Tier 2 pattern suggests fabrication
- `fabrication_clear`: Clear evidence of fabrication
- `context_mismatch`: Citation doesn't fit context coherently
- `multiple_concerns`: Multiple concerns that together suggest issues

**Uncertain Reason Codes**:
- `mixed_signals`: Some signals suggest validity, others suggest issues
- `tier2_disagreement_unresolved`: Tier 2 disagreement couldn't be resolved
- `context_uncertain`: Context fit is uncertain
- `synthesis_unclear`: Overall synthesis is unclear
- `requires_human_review`: Requires human review to resolve

**Response Format**:
```
VERDICT: [VALID, INVALID, or UNCERTAIN]
REASONING: [2-3 sentences explaining your assessment]
INVALID_REASON: [reason code if verdict is INVALID, otherwise omit]
UNCERTAIN_REASON: [reason code if verdict is UNCERTAIN, otherwise omit]
```

---

### Agent 3: Pattern Recognition Expert

**Analytical Style**: Expert at detecting fabrication patterns and authenticity markers

**Focus**: Emphasizes pattern recognition and detecting AI hallucinations. Investigates ALL aspects: authority existence, metadata accuracy, temporal consistency, context fit, and fabrication markers. Particularly attuned to fabrication patterns and authenticity gestalt.

**Prompt**:
Similar structure to Agent 1, but emphasizes:
- Fabrication pattern detection
- AI hallucination markers
- Authenticity gestalt assessment
- Pattern recognition expertise

**Allowed Responses**:
- `VALID`: Citation appears to be real and legitimate. No significant issues detected.
- `INVALID`: Citation appears to be fabricated or hallucinated. Clear evidence of fabrication.
- `UNCERTAIN`: Citation may be real but has issues requiring review, or insufficient information to determine validity.

**Invalid Reason Codes**:
- `fabrication_markers`: Clear markers of AI fabrication detected
- `hallucination_pattern`: Pattern matches known AI hallucination patterns
- `too_perfect_fit`: Citation fits too perfectly, suggesting construction
- `authenticity_gestalt_negative`: Overall gestalt suggests fabrication
- `ai_invention_clear`: Clear evidence of AI invention

**Uncertain Reason Codes**:
- `pattern_ambiguous`: Pattern is ambiguous, could be either
- `mixed_authenticity_signals`: Some signals suggest authenticity, others suggest fabrication
- `gestalt_unclear`: Overall gestalt is unclear
- `some_fabrication_concerns`: Some fabrication concerns but not definitive
- `requires_human_review`: Requires human review to assess patterns

**Response Format**:
```
VERDICT: [VALID, INVALID, or UNCERTAIN]
REASONING: [2-3 sentences explaining your assessment]
INVALID_REASON: [reason code if verdict is INVALID, otherwise omit]
UNCERTAIN_REASON: [reason code if verdict is UNCERTAIN, otherwise omit]
```

---

## Implementation Notes

### Model Configuration

- **Tier 2**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
  - Fast and cost-efficient
  - Used for parallel validation by all 5 agents
  - Estimated cost: $0.0001-0.0003 per citation

- **Tier 3**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
  - Most capable model for deep investigation
  - Used only for citations that fail Tier 2 consensus
  - Higher cost but used less frequently

### Execution Flow

1. **Tier 2**: All 5 agents evaluate citations in parallel
2. **Consensus Calculation**: System determines agreement level
3. **Tier 3 Escalation**: Citations with split decisions (3/2 or worse) are escalated
4. **Tier 3 Investigation**: All 3 agents investigate citations comprehensively in parallel (unlike Tier 2, they don't split investigation by dimension - all investigate fully)
5. **Tier 3 Consensus**: System calculates consensus from 3-agent panel

### Response Parsing

- Tier 2 responses are parsed to extract verdict and reason codes
- Tier 3 responses are parsed to extract verdict (VALID/INVALID/UNCERTAIN), reasoning, and reason codes (similar to Tier 2)
- Tier 3 consensus is calculated from 3-agent panel evaluations

---

## Version History

- **v1**: Initial prompt set (current)
- All agents include version identifiers (e.g., `citation_authority_validator_v1`) for tracking and evolution

---

## Files Reference

- Tier 2 prompts: `lib/citation-identification/validation-prompts.ts`
- Tier 3 prompts: `lib/citation-identification/tier3-prompts.ts`
- Validation logic: `lib/citation-identification/validation.ts`
- Specification docs: `validationT2.md`, `tier3prompt.md`

