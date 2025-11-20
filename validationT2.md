# Citation Validation Process - Tier 2 Specification (Revised)
## Litigator's AI Legal Fact Checker

---

## Overview

Tier 2 is the **consensus validation stage**. After citations are identified by Eyecite (Tier 1), each citation is evaluated by a panel of 5 independent AI agents. Rather than checking format compliance, the panel assesses **whether the citation likely exists in reality or is fabricated**.

The panel combines:
- **3 analytical agents** that examine specific dimensions (authority, case ecology, temporal consistency)
- **2 broad knowledge agents** that apply general legal knowledge and intuition to assess reality

**Design Principle**: Fault-tolerant reality assessment through diverse evidence and broad synthesis. Analytical agents catch inconsistencies in metadata; broad agents apply knowledge to detect fabrications that "look right" but don't exist.

---

## Input Specification

**Source**: JSON output from Tier 1 (Eyecite citation identification)

**Expected Structure**:
```json
{
  "type": "paragraph",
  "text": "In Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020), the court held that...",
  "path": "/document/body/section_1/paragraph_3",
  "citations": [
    {
      "id": "cite_001",
      "text": "Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020)",
      "type": "case",
      "components": {
        "party_1": "Smith",
        "party_2": "Jones",
        "volume": "123",
        "reporter": "F.3d",
        "page": "456",
        "court": "D.C. Cir.",
        "year": "2020"
      }
    }
  ]
}
```

Each citation object is passed independently to the validation panel, along with surrounding document context.

---

## Validation Process Flow

### Phase 1: Panel Assignment
1. Extract citation from JSON
2. Prepare document context (full paragraph containing citation + 1-2 preceding sentences)
3. Assign to all 5 panelists simultaneously (parallel validation)

### Phase 2: Agent Evaluation
Each agent evaluates the same citation independently using its specific validation approach. Agents do NOT see other agents' responses.

### Phase 3: Response Recording
Record each agent's response in JSON validation object with `"agent"` field for versioning.

### Phase 4: Consensus Determination
- **Unanimous agreement** (5/5): High confidence verdict
- **Strong agreement** (4/5): Medium-high confidence verdict
- **Split decision** (3/2 or worse): Flag for Tier 3 detailed analysis

---

## Panel of 5 Validation Agents

### Agent 1: CITATION AUTHORITY VALIDATOR
**Focus**: Court/reporter/year alignment and publication plausibility

**Role**: Analyzes whether the citation's metadata (court, reporter, volume, page, year) represents a realistic publication in that reporter at that time.

**Prompt Template**:
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

You are assessing whether this COULD plausibly be a real publication, not whether 
you can verify the specific case exists.

Respond with EXACTLY one of:
- VALID: Court/reporter/year alignment is plausible
- INVALID: Court/reporter/year alignment is implausible (specify reason)
- UNCERTAIN: Alignment could be real but has some unusual aspects (specify reason)

Provide your verdict followed by reason code if INVALID or UNCERTAIN.
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

### Agent 2: CASE ECOLOGY VALIDATOR
**Focus**: Party names, case characteristics, and litigation plausibility

**Role**: Analyzes whether the party names and case type fit realistic litigation patterns.

**Prompt Template**:
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

Respond with EXACTLY one of:
- VALID: Party names and characteristics fit real litigation patterns
- INVALID: Party names or characteristics seem fabricated (specify reason)
- UNCERTAIN: Some aspects unusual but could be real (specify reason)

Provide your verdict followed by reason code if INVALID or UNCERTAIN.
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

### Agent 3: TEMPORAL REALITY VALIDATOR
**Focus**: Timeline consistency and historical plausibility

**Role**: Analyzes whether the citation fits the timeline of legal development and historical context.

**Prompt Template**:
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

You're checking whether the citation fits the legal and historical timeline, 
not verifying the specific case exists.

Respond with EXACTLY one of:
- VALID: Citation timing is historically and legally plausible
- INVALID: Citation timing is impossible or implausible (specify reason)
- UNCERTAIN: Timeline has some unusual aspects but could be real (specify reason)

Provide your verdict followed by reason code if INVALID or UNCERTAIN.
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

### Agent 4: LEGAL KNOWLEDGE VALIDATOR
**Focus**: Broad application of legal knowledge and awareness

**Role**: Uses general knowledge of law, courts, reporters, and case law to assess whether the citation is likely real or fabricated.

**Prompt Template**:
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

You don't need to verify the specific case exists. Rather, assess based on the 
overall plausibility given your legal knowledge.

Respond with EXACTLY one of:
- VALID: Citation appears consistent with real legal authority
- INVALID: Citation appears fabricated or inconsistent with legal knowledge (specify reason)
- UNCERTAIN: Citation could be real but has some inconsistencies (specify reason)

Provide your verdict followed by reason code if INVALID or UNCERTAIN.
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

### Agent 5: REALITY ASSESSMENT EXPERT
**Focus**: Synthesis and overall reality assessment

**Role**: Synthesizes all available analysis to assess likelihood that this citation is real, drawing on pattern matching and comprehensive evaluation.

**Prompt Template**:
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
- INVALID: Citation is likely fabricated (specify reason)
- UNCERTAIN: Citation could be either; insufficient basis for confident judgment (specify reason)

Provide your verdict followed by reason code if INVALID or UNCERTAIN.
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

## JSON Output Structure

Each citation receives validation results from all 5 agents. Add a `validation` object to each citation with `"agent"` field for versioning:

```json
{
  "id": "cite_001",
  "text": "Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020)",
  "type": "case",
  "components": { ... },
  "validation": {
    "panel_evaluation": [
      {
        "agent": "citation_authority_validator_v1",
        "verdict": "VALID",
        "timestamp": "2025-11-19T10:30:00Z",
        "model": "claude-haiku-4-5-20251001"
      },
      {
        "agent": "case_ecology_validator_v1",
        "verdict": "VALID",
        "timestamp": "2025-11-19T10:30:02Z",
        "model": "claude-haiku-4-5-20251001"
      },
      {
        "agent": "temporal_reality_validator_v1",
        "verdict": "VALID",
        "timestamp": "2025-11-19T10:30:04Z",
        "model": "claude-haiku-4-5-20251001"
      },
      {
        "agent": "legal_knowledge_validator_v1",
        "verdict": "VALID",
        "timestamp": "2025-11-19T10:30:06Z",
        "model": "claude-haiku-4-5-20251001"
      },
      {
        "agent": "reality_assessment_expert_v1",
        "verdict": "VALID",
        "timestamp": "2025-11-19T10:30:08Z",
        "model": "claude-haiku-4-5-20251001"
      }
    ],
    "consensus": {
      "agreement_level": "unanimous",
      "verdict_counts": {
        "VALID": 5,
        "INVALID": 0,
        "UNCERTAIN": 0
      },
      "confidence_score": 1.0,
      "recommendation": "CITATION_LIKELY_VALID",
      "reasoning": "All five validators agree citation is real with no concerns."
    },
    "tier_3_trigger": false
  }
}
```

Example with split decision:

```json
{
  "id": "cite_002",
  "text": "Johnson v. Smith, 456 F.3d 789 (D.C. Cir. 2035)",
  "type": "case",
  "components": { ... },
  "validation": {
    "panel_evaluation": [
      {
        "agent": "citation_authority_validator_v1",
        "verdict": "VALID",
        "timestamp": "2025-11-19T10:30:10Z",
        "model": "claude-haiku-4-5-20251001"
      },
      {
        "agent": "case_ecology_validator_v1",
        "verdict": "VALID",
        "timestamp": "2025-11-19T10:30:12Z",
        "model": "claude-haiku-4-5-20251001"
      },
      {
        "agent": "temporal_reality_validator_v1",
        "verdict": "INVALID",
        "invalid_reason": "temporal_impossibility",
        "timestamp": "2025-11-19T10:30:14Z",
        "model": "claude-haiku-4-5-20251001"
      },
      {
        "agent": "legal_knowledge_validator_v1",
        "verdict": "VALID",
        "timestamp": "2025-11-19T10:30:16Z",
        "model": "claude-haiku-4-5-20251001"
      },
      {
        "agent": "reality_assessment_expert_v1",
        "verdict": "UNCERTAIN",
        "uncertain_reason": "mixed_signals",
        "timestamp": "2025-11-19T10:30:18Z",
        "model": "claude-haiku-4-5-20251001"
      }
    ],
    "consensus": {
      "agreement_level": "split",
      "verdict_counts": {
        "VALID": 3,
        "INVALID": 1,
        "UNCERTAIN": 1
      },
      "confidence_score": 0.36,
      "recommendation": "CITATION_UNCERTAIN",
      "reasoning": "Panel split. Temporal validator flags future year (2035) as impossible. Others see plausibility. Reality expert detects mixed signals. Recommend Tier 3 investigation."
    },
    "tier_3_trigger": true
  }
}
```

---

## Field Definitions

**panel_evaluation (array)**:
Each element represents one agent's evaluation:
- `agent`: Agent identifier including version (e.g., "citation_authority_validator_v1")
- `verdict`: One of VALID, INVALID, or UNCERTAIN
- `invalid_reason` or `uncertain_reason`: Reason code (only if verdict is INVALID or UNCERTAIN)
- `timestamp`: When evaluation occurred
- `model`: Which LLM provided this evaluation

**consensus**:
- `agreement_level`: "unanimous" (5/5), "strong" (4/5), "split" (3/2 or other)
- `verdict_counts`: Count of VALID/INVALID/UNCERTAIN verdicts across all agents
- `confidence_score`: 0.0-1.0 score based on agreement
- `recommendation`: High-level recommendation (CITATION_LIKELY_VALID / CITATION_UNCERTAIN / CITATION_LIKELY_HALLUCINATED)
- `reasoning`: Summary of consensus reasoning
- `tier_3_trigger`: Boolean - whether citation should go to Tier 3 detailed analysis

---

## Consensus Scoring & Recommendations

### Confidence Score Calculation

```
confidence_score = (agreement_count / 5) ^ 2

Where agreement_count = number of agents agreeing with majority verdict
```

Example: If 3 agents say VALID and 2 say UNCERTAIN:
- majority = VALID (3/5)
- confidence_score = (3/5)^2 = 0.36

### Recommendation Logic

**CITATION_LIKELY_VALID** (confidence ≥ 0.8):
- All or nearly all agents found no issues (4-5 VALID verdicts)
- Citation assessed as real
- Proceed with assumption citation is legitimate

**CITATION_UNCERTAIN** (confidence 0.5-0.79):
- Panel disagreement or mixed verdicts (3 VALID, with 1-2 INVALID/UNCERTAIN)
- Citation has both credible and suspicious markers
- Flag for lawyer attention in document review
- **Trigger Tier 3 analysis**

**CITATION_LIKELY_HALLUCINATED** (confidence < 0.5):
- Majority finding against validity (2-3 VALID with 2+ INVALID/UNCERTAIN)
- Multiple validators flagged problems
- Lawyer should treat as suspicious or fabricated
- **Trigger Tier 3 analysis with priority**

---

## Implementation Notes

### Parallel Execution
- All 5 agents evaluate simultaneously
- No information sharing between agents
- Reduces total latency to ~0.5 seconds per citation

### Current Configuration
All agents use Claude Haiku for MVP testing.

**Future multi-model distribution**:
- Analytical agents (1-3): Claude Haiku (fast, cost-efficient)
- Broad agents (4-5): Claude Sonnet (stronger reasoning)
- Consider rotating models on subsequent runs for comparison

### Cost Optimization
- Haiku: ~$0.80 per 1M input tokens
- Estimated cost per citation: $0.0001-0.0003
- 100-page document (≈200 citations): $0.02-0.06

---

## Testing Protocol

### Phase 1: Baseline Testing
- Test on 50 real citations from actual legal documents
- Test on 50 obviously fabricated citations (AI-generated fakes)
- Test on 20 edge cases (real but unusual, or well-formed but fake)

**Success criteria**: 
- Real citations: ≥90% VALID or UNCERTAIN (not falsely marked INVALID)
- Fake citations: ≥80% INVALID or UNCERTAIN (catch hallucinations)
- Edge cases: Consistent flagging for manual review

### Phase 2: Manual Validation
- 100-citation sample with lawyer manual review
- Compare panel consensus with lawyer assessment
- Track false positives and false negatives

**Success criteria**: Panel assessment matches lawyer review ≥85% of time

### Phase 3: Iterative Refinement
- Track which agents make errors
- Refine prompts based on error patterns
- Test alternative agent configurations

---

## Integration with Tier 3

Citations flagged for Tier 3 analysis include:
- Full citation object with all Tier 2 verdicts
- Document context (full paragraph)
- Specific disagreements between agents
- Reason codes from each validator

Tier 3 performs definitive verification via:
- Database lookups (legal research APIs)
- Manual research by legal professionals
- Expert judgment on fabrication likelihood

---

## Version Control & Evolution

The `"agent"` field in JSON enables evolution:
- Track which agent versions flagged which citations
- Compare Agent v1 vs v2 performance
- A/B test prompt variations
- Retire agents when new versions improve accuracy

Example: "citation_authority_validator_v2" can be deployed alongside v1 for comparison testing.