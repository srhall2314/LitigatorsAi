# Citation Identification Process - Tier 1 Specification
## Litigator's AI Legal Fact Checker

---

## Overview

The Citation Identification process is Tier 1 of the three-tier validation system. Its purpose is to programmatically identify well-formatted legal citations in JSON-structured documents and flag them for downstream AI validation (Tier 2) and detailed analysis (Tier 3).

**Design Principle**: High precision pattern matching. We optimize to avoid false positives, accepting that some valid citations may be missed in favor of accurately identifying citations that are formatted to Bluebook standards.

---

## Input Specification

**Source**: JSON documents from the Word-to-JSON parser

**Expected Structure**: 
- Document preserved as JSON with text nodes
- Paragraphs, sections, footnotes, and references marked with metadata
- Each text segment has location information (e.g., section path, position)

**Scope Constraint**: Only well-formatted citations per Bluebook. Non-standard formatting is excluded from Tier 1 (users can request manual review).

---

## Citation Formats Supported

### 1. Federal Case Citations
**Format**: `Citation v. Citation, Volume Reporter Page (Court Year)`

Examples:
- `Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020)`
- `United States v. Morrison, 529 U.S. 598 (2000)`

**Pattern Components**:
- Party names (with "v." or "vs.")
- Volume number
- Reporter abbreviation (U.S., F.3d, F. Supp., F.2d, F. Supp. 2d, etc.)
- Page number
- Court in parentheses
- Year in parentheses

---

### 2. State Case Citations
**Format**: `Citation v. Citation, Volume Reporter Page (State Abbr. Court Year)`

Examples:
- `Doe v. Roe, 300 N.Y. 456 (N.Y. 2015)`
- `Brown v. Board, 242 N.E.2d 789 (Ill. App. Ct. 2018)`

**Pattern Components**:
- Party names with "v."
- Volume number
- State reporter abbreviation (N.Y., N.E., N.E.2d, Cal., P., P.2d, etc.)
- Page number
- State court abbreviation in parentheses
- Year in parentheses

---

### 3. Statute Citations
**Format**: `Code Abbreviation § Section(Year)` or similar

Examples:
- `42 U.S.C. § 1983`
- `18 U.S.C. § 242`
- `N.Y. Penal Law § 155`

**Pattern Components**:
- Volume number (optional for state statutes)
- Code abbreviation (U.S.C., A.R.S., Penal Law, etc.)
- § or "Sec." symbol
- Section number (may include subsections: §1983(a))
- Year (optional, in parentheses if present)

---

### 4. Regulation Citations
**Format**: `Volume CFR § Section` or state equivalent

Examples:
- `29 C.F.R. § 1910.1200`
- `42 C.F.R. § 482.12`

**Pattern Components**:
- Volume number
- Code of Federal Regulations (C.F.R.) or state regulation abbreviation
- § symbol
- Section number with subsections

---

### 5. Rule Citations
**Format**: `Federal Rules of [Category] Rule [Number]`

Examples:
- `Fed. R. Civ. P. 12(b)`
- `Fed. R. Evid. 401`

**Pattern Components**:
- "Federal Rules of" or similar prefix
- Category (Civil Procedure, Evidence, Criminal Procedure, etc.)
- "Rule" keyword
- Rule number with possible subsections

---

## Pattern Matching Algorithm

### Phase 1: Text Extraction
1. Extract all text from JSON document while preserving segment locations
2. Index each text segment by its document path (enables flagging at source)

### Phase 2: Citation Detection
For each text segment:

1. **Apply citation patterns** in order of specificity (most specific first):
   - Case citations (federal, then state)
   - Statute citations
   - Regulation citations
   - Rule citations

2. **Pattern validation**: Each match must satisfy:
   - Correct syntactic structure per format
   - Valid court abbreviations (for case citations)
   - Valid reporter abbreviations (for case citations)
   - Valid code abbreviations (for statutes/regulations)
   - Proper year formatting (4-digit year within plausible range: 1800-current)

3. **Context filtering** (reduce false positives):
   - Reject matches in isolated hyphenated sequences
   - Reject matches that span across sentence boundaries illogically
   - Reject matches where reporter/code appears in a non-citation context

### Phase 3: Segmentation & Cleanup
1. Identify citation boundaries precisely (don't over-match)
2. Detect and separate multiple citations in a single sequence
   - Example: "Smith v. Jones, 100 F.3d 1 (D.C. Cir. 2010), cert. denied, 500 U.S. 1 (2011)"
3. Group related citations (parallel citations)

---

## Output Specification

### JSON Flagging Structure

Citations are flagged within the JSON at their location. Add a `citations` array to each text segment containing identified citations:

```json
{
  "type": "paragraph",
  "text": "In Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020), the court held...",
  "path": "/document/body/section_1/paragraph_3",
  "citations": [
    {
      "id": "cite_001",
      "text": "Smith v. Jones, 123 F.3d 456 (D.C. Cir. 2020)",
      "type": "case",
      "start_offset": 3,
      "end_offset": 47,
      "components": {
        "party_1": "Smith",
        "party_2": "Jones",
        "volume": "123",
        "reporter": "F.3d",
        "page": "456",
        "court": "D.C. Cir.",
        "year": "2020"
      },
      "jurisdiction": "federal",
      "court_level": "circuit"
    }
  ]
}
```

### Citation Object Fields

**Required**:
- `id`: Unique identifier (cite_XXX format for ordering)
- `text`: Exact citation text as appears in document
- `type`: one of [case, statute, regulation, rule]
- `start_offset`: Character offset where citation begins
- `end_offset`: Character offset where citation ends
- `components`: Citation parts extracted by pattern (format varies by type)

**Type-Specific Components**:

**Case Citations**:
- `party_1`, `party_2`: Party names
- `volume`, `reporter`, `page`: Reporter info
- `court`: Court abbreviation
- `year`: Year decided
- `jurisdiction`: "federal" or state abbreviation
- `court_level`: "supreme", "circuit", "district", "state_supreme", "appellate", "trial"

**Statute Citations**:
- `volume`: Code volume (if applicable)
- `code`: Code abbreviation
- `section`: Section number with subsections
- `year`: Year enacted/amended (if present)
- `jurisdiction`: "federal" or state abbreviation

**Regulation Citations**:
- `volume`: Volume number
- `code`: Regulation code (C.F.R., state equivalent)
- `section`: Section number
- `jurisdiction`: "federal" or state abbreviation

**Rule Citations**:
- `code`: Rule code (e.g., "Fed. R. Civ. P.")
- `rule_number`: Rule number with subsections
- `category`: Category (Civil Procedure, Evidence, etc.)

---

## Implementation Details

### Valid Reporter/Court/Code Lookup Tables

**Federal Reporters**:
- U.S., S. Ct., L. Ed., L. Ed. 2d
- F., F.2d, F.3d
- F. Supp., F. Supp. 2d, F. Supp. 3d

**Federal Court Abbreviations**:
- U.S. (Supreme Court)
- D.C. Cir., 1st Cir., 2nd Cir., ... 11th Cir. (Circuit Courts)
- D.[State Abbr.] (District Courts)
- Fed. Cir. (Federal Circuit)

**Federal Codes**:
- U.S.C. (United States Code)
- C.F.R. (Code of Federal Regulations)
- Act names (e.g., "Civil Rights Act of 1964")

**Federal Rules**:
- Fed. R. Civ. P., Fed. R. Crim. P., Fed. R. Evid., Fed. R. App. P.

**State Citations**: Tables for each state's reporters and court abbreviations

---

## Precision & Recall Targets

**Goal**: High precision to minimize false positives sent to Tier 2

**Target Metrics**:
- Precision: ≥95% (95% of flagged citations are real)
- Recall: ≥85% (catch 85% of actual citations)

**Rationale**: False positives waste Tier 2 resources and create noise. Missed citations are caught in subsequent review or users can flag them manually.

---

## Edge Cases & Limitations

### Handled
- Partial citations with ibid., id., supra references (flag the full citation sequence)
- Multiple citations in single sentence
- Parallel citations (same case, multiple reporters)
- Typeface variations (bold, italics don't affect matching)
- Whitespace variations

### Not Handled (Out of Scope for Tier 1)
- Shortened citations without full reporter (e.g., "The Smith case")
- Parentheticals or signal phrases adjacent to citations
- Non-standard formatting or abbreviations
- Historical citations or very old cases
- Foreign legal citations
- Academic citations (law review articles, treatises)
- Manuscript citations or unpublished opinions

These can be flagged for manual review or handled in future iterations.

---

## Integration with Downstream Tiers

### Output to Tier 2
- Send flagged citations with all extracted components
- Include document context (full paragraph, section)
- Preserve original document location for reporting

**Tier 2 Input Format**:
```json
{
  "citation": { ... },
  "document_context": {
    "segment": "...",
    "section_path": "/document/body/section_1/paragraph_3"
  }
}
```

### Feedback Loop
- Track false positives identified by Tier 2
- Quarterly review of pattern accuracy
- Update lookup tables with new court/code changes
- Refine patterns based on user corrections

---

## Performance & Scalability

**Performance Requirements**:
- Process average 10-page legal document: <2 seconds
- Scale to documents up to 100 pages: <20 seconds
- Per-citation detection overhead: <50ms average

**Optimization Strategy**:
- Pre-compile regex patterns
- Index text segments for parallel processing
- Cache lookup tables in memory
- Consider streaming for large documents

---

## Testing Strategy

### Unit Tests
- Each citation format (case, statute, regulation, rule)
- Valid variations of each format
- Boundary conditions (very long names, unusual years)
- Invalid patterns that should not match

### Integration Tests
- Full documents with mixed citation types
- Varied formatting and whitespace
- Citations in different document sections (body, footnotes, headers)
- Accuracy against hand-annotated test corpus

### Regression Tests
- Maintain suite of known false positives/negatives
- Test against quarterly updates to patterns

---

## Future Enhancements

1. **Parallel citations detection**: Recognize when same case cited in multiple reporters
2. **Shortened form recognition**: Link "Smith" back to full "Smith v. Jones"
3. **Signal word integration**: Recognize "See Smith v. Jones" as citation
4. **Court abbreviation inference**: When court not explicitly stated
5. **Jurisdiction-specific rules**: Handle state-specific citation variations
6. **Machine learning layer**: Train model on false positives to improve Tier 1 accuracy

---

## Rollout Plan

**Phase 1**: Implement federal case and statute citations (most common)
**Phase 2**: Add state case citations for top 10 states
**Phase 3**: Add regulations and rules
**Phase 4**: Expand state coverage to all 50 states
**Phase 5**: Advanced features (shortened forms, parallel citations)