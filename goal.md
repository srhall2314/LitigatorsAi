# Citation Checker Product Outline

## Product Vision

**Problem:** AI-generated legal content (briefs, motions, memoranda) frequently contains hallucinated, fabricated, or misquoted citations. Lawyers need a systematic way to audit and verify citations before filing.

**Solution:** Citation Checker is a post-drafting review tool that programmatically extracts citations from legal documents, validates them through a multi-tier verification system, and flags suspicious citations for lawyer review.

**Positioning:** The hallucination detector for legal AI. Solves the core trust problem with AI-assisted legal drafting.

---

## Core Architecture: Three-Tier Validation System

### Tier 1: Structure Panel (Programmatic)
**Purpose:** Is this actually a citation?

**Approach:** Rule-based pattern matching, not AI
- Regex + heuristics for citation formats
- Case law: "Party v. Party, Volume Reporter Page (Court Year)"
- Statutes: "Title Code § Section"
- Regulations: "CFR/state reg patterns"
- Secondary sources: "Author, Title (Publisher Year)"
- Validates against known reporter abbreviations and court codes

**Output:** Binary gate (citation / not citation)

**Cost:** $0 (pure code)

---

### Tier 2: Citation check Panel (Consensus)
**Purpose:** Does this citation look valid? (Fast, cheap validation)

**Approach:** Three independent LLM evaluations (Haiku) per citation
- Evaluator A: Citation format + parties plausibility
- Evaluator B: Court/year/reporter combo validity  
- Evaluator C: Red flags (too new, too old, jurisdiction oddities)
Model like haiku and quick open AI model will do 3 passes split amoung at least 2 model providers


**Voting Logic:**
- Unanimous vote → passes (VALID)
- Split decision → escalate to Tier 3
- Majority flag → escalate to Tier 3

**Output:** Thumbs up/down per evaluator + consensus verdict

**Cost:** Cost per citation × expected citations per document

---

### Tier 3: Advanced Review (Analysis)
**Purpose:** Explain what's wrong so the lawyer can judge

**Approach:** Single deeper-reasoning prompt with structured analysis (Sonnet or such)
- Why this citation is problematic
- What the lawyer should check
- Severity/urgency of issue
- Suggested action

**Output:** Detailed analysis for lawyer decision-making

**Cost:** Only escalated citations (smaller set)

---

## Data Flow

### Input
Lawyer loads document (Word, PDF, or native format). System parses document to extract text.

### Processing Pipeline
1. **Tier 1 (Programmatic):** Identify citation patterns using rule-based extraction. Each potential citation is flagged with its position in the document (start/end offset) to enable precise editing when exporting back to Word.

2. **Tier 2 (Consensus):** Each citation is evaluated by three independent LLM assessments in parallel. System captures each evaluator's verdict and confidence level. Citations with unanimous verdicts pass. Split decisions escalate to Tier 3.

3. **Tier 3 (Analysis):** Citations with split Tier 2 decisions are escalated for deeper analysis. System generates detailed explanation of what's wrong and what lawyer should check.

4. **Output:** Complete structured data with all verdicts, maintaining document position data for export back to Word.

### Data Structure
The system maintains structured information throughout processing:
- Citation text as extracted from document
- Location in document (precise offsets for re-insertion)
- Citation components parsed out (parties, reporter, court, year, page)
- Tier 1 verdict (is it a real citation format?)
- Tier 2 verdicts (three independent evaluations with confidence scores)
- Tier 2 consensus (unanimous pass / split decision that escalates)
- Tier 3 analysis (if escalated, detailed explanation for lawyer)
- Final status and recommended lawyer action

---

## User Interface

### Primary View: Citations List
- Scannable table of all citations
- Columns: Citation Text | Tier 2 Result | Severity | Tier 3 Analysis
- Sortable by: status, severity, appearance order
- Filterable: show all / flagged only / escalated only


---

## MVP Scope

### In Scope
1. Word document upload and parsing
2. Tier 1 (programmatic citation pattern extraction) 
3. Tier 2 (three independent LLM evaluations with consensus voting)
4. Advanced Anaalysis
5. Citations list view as primary interface
6. Structured data output for technical users

### Out of Scope (Phase 2+)
1. Real-time verification APIs (CourtListener, Westlaw integration)
2. Citation recommendations / stronger alternative suggestions
3. Drafting assistance or document generation
4. PDF native support (convert to text first)
5. Other document formats beyond Word



