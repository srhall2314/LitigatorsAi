# Citation Checker JSON Schema Reference

## Overview

The Citation Checker produces a JSON structure that preserves the complete document text with citations marked inline, along with validation data for each citation. This design keeps context intact, simplifies export, and allows flexible UI rendering.

---

## Document Structure

```
Document
├── metadata
├── content (array of paragraphs/sections with inline citations)
└── citations (array of citation objects with validation data)
```

---

## Root Object

**`document`** - Top-level container

```json
{
  "document": {
    "metadata": { /* see below */ },
    "content": [ /* paragraphs with inline citations */ ],
    "citations": [ /* citation objects with validation */ ]
  }
}
```

---

## Metadata

**`metadata`** - Document information

```json
{
  "metadata": {
    "filename": "motion_to_dismiss.docx",
    "uploadDate": "2025-11-18T14:30:00Z",
    "documentType": "motion",
    "totalCitations": 47
  }
}
```

**Fields:**
- `filename` (string) - Original document filename
- `uploadDate` (string, ISO 8601) - When document was uploaded
- `documentType` (string, optional) - Type of document (motion, brief, memo, etc.)
- `totalCitations` (number) - Total number of citations found

---

## Content Array

**`content`** - Array of document paragraphs/sections with inline citations

Each element represents a paragraph or section of the document. Citations are marked inline using a consistent marker format.

```json
{
  "content": [
    {
      "type": "paragraph",
      "id": "para_001",
      "text": "Defendant submits this Motion to Dismiss pursuant to Federal Rule of Civil Procedure 12(b)(6). The complaint fails to state a claim upon which relief can be granted. As established in [CITATION:cit_001]Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)[/CITATION:cit_001], the complaint must contain sufficient factual matter to state a plausible claim for relief."
    },
    {
      "type": "heading",
      "id": "heading_001",
      "level": 1,
      "text": "I. LEGAL STANDARD"
    },
    {
      "type": "paragraph",
      "id": "para_002",
      "text": "A motion to dismiss under Federal Rule of Civil Procedure 12(b)(6) challenges the sufficiency of the complaint. [CITATION:cit_002]Ashcroft v. Iqbal, 556 U.S. 662 (2009)[/CITATION:cit_002]."
    }
  ]
}
```

**Fields:**
- `type` (string) - Type of content: "paragraph", "heading", "section", etc.
- `id` (string) - Unique identifier within document (para_001, heading_001, etc.)
- `level` (number, optional) - For headings, the level (1-6)
- `text` (string) - The actual text content with citations marked inline

**Citation Markers:**
Citations within text use consistent inline markers:
```
[CITATION:cit_001]Citation Text Here[/CITATION:cit_001]
```

The `cit_001` identifier links to the citation object in the `citations` array. When exporting to Word or rendering in UI, strip these markers or convert to highlights/comments.

---

## Citations Array

**`citations`** - Array of citation objects with validation data

Each citation found in the document gets an object with extraction results and tier validation data.

```json
{
  "citations": [
    {
      "id": "cit_001",
      "citationText": "Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)",
      "citationType": "case",
      "extractedComponents": {
        "parties": ["Bell Atlantic Corp.", "Twombly"],
        "reporter": "U.S.",
        "page": "544",
        "court": "U.S.",
        "year": 2007
      },
      "tier_1": {
        "status": "VALID_FORMAT",
        "confidence": 0.99
      },
      "tier_2": {
        "evaluations": [
          {
            "evaluatorName": "format_validator",
            "verdict": "PLAUSIBLE",
            "confidence": 0.92
          },
          {
            "evaluatorName": "plausibility_checker",
            "verdict": "PLAUSIBLE",
            "confidence": 0.88
          },
          {
            "evaluatorName": "red_flag_detector",
            "verdict": "PLAUSIBLE",
            "confidence": 0.90
          }
        ],
        "consensus": "VALID",
        "consensusConfidence": 0.90,
        "escalated": false
      },
      "tier_3": null,
      "recommendations": null
    },
    {
      "id": "cit_002",
      "citationText": "Smith v. Jones, 999 F.3d 456 (2d Cir. 2045)",
      "citationType": "case",
      "extractedComponents": {
        "parties": ["Smith", "Jones"],
        "reporter": "F.3d",
        "page": "456",
        "court": "2d Cir",
        "year": 2045
      },
      "tier_1": {
        "status": "VALID_FORMAT",
        "confidence": 0.98
      },
      "tier_2": {
        "evaluations": [
          {
            "evaluatorName": "format_validator",
            "verdict": "PLAUSIBLE",
            "confidence": 0.85
          },
          {
            "evaluatorName": "plausibility_checker",
            "verdict": "SUSPICIOUS",
            "confidence": 0.72
          },
          {
            "evaluatorName": "red_flag_detector",
            "verdict": "SUSPICIOUS",
            "confidence": 0.88
          }
        ],
        "consensus": "FLAG_FOR_REVIEW",
        "consensusConfidence": 0.65,
        "escalated": true
      },
      "tier_3": {
        "analysis": "Year 2045 is in the future. This case citation cannot exist. Verify the year is correct. The reporter volume F.3d 456 is also unusually low for a 2045 citation if the year were correct.",
        "severity": "HIGH"
      },
      "recommendations": null
    }
  ]
}
```

### Citation Object Fields

**Basic Citation Info:**
- `id` (string) - Unique identifier (cit_001, cit_002, etc.)
- `citationText` (string) - The exact citation as it appears in the document
- `citationType` (string) - Type of citation: "case", "statute", "regulation", "secondary"
- `extractedComponents` (object) - Parsed citation elements (structure varies by type)

**Tier 1 (Structure Validation):**
```json
"tier_1": {
  "status": "VALID_FORMAT" | "INVALID_FORMAT" | "AMBIGUOUS_FORMAT",
  "confidence": 0.99
}
```
- `status` - Whether citation format is recognized
- `confidence` - How confident the pattern matcher is (0-1)

**Tier 2 (Consensus Validation):**
```json
"tier_2": {
  "evaluations": [
    {
      "evaluatorName": "string",
      "verdict": "PLAUSIBLE" | "SUSPICIOUS",
      "confidence": 0.85
    }
  ],
  "consensus": "VALID" | "FLAG_FOR_REVIEW",
  "consensusConfidence": 0.85,
  "escalated": false | true
}
```
- `evaluations` (array) - Results from three independent LLM evaluations
  - `evaluatorName` - Name of the evaluator (provided by whoever runs evaluation)
  - `verdict` - This evaluator's assessment
  - `confidence` - How confident this evaluator is (0-1)
- `consensus` - Overall voting result (VALID if unanimous pass, FLAG_FOR_REVIEW if split)
- `consensusConfidence` - Average or composite confidence across evaluators
- `escalated` - Whether this citation is escalated to Tier 3 (boolean)

**Tier 3 (Analysis) - Only present if escalated:**
```json
"tier_3": {
  "analysis": "Detailed explanation of why this citation is problematic",
  "severity": "LOW" | "MEDIUM" | "HIGH"
}
```
- `analysis` - Plain English explanation of the issue for lawyer review
- `severity` - How urgent this flag is

**Recommendations - Optional, populated in Phase 2:**
```json
"recommendations": null | [
  {
    "citationText": "Better v. Citation, 123 U.S. 456 (2020)",
    "reason": "more recent, same holding"
  }
]
```

---

## Citation Components by Type

Different citation types have different `extractedComponents` structures:

### Case Citation
```json
"citationType": "case",
"extractedComponents": {
  "parties": ["First Party", "Second Party"],
  "reporter": "U.S.",
  "page": "544",
  "court": "U.S.",
  "year": 2007
}
```

### Statute Citation
```json
"citationType": "statute",
"extractedComponents": {
  "title": "42",
  "code": "U.S.C.",
  "section": "2000",
  "subdivision": null
}
```

### Regulation Citation
```json
"citationType": "regulation",
"extractedComponents": {
  "title": "29",
  "code": "C.F.R.",
  "section": "1601.20"
}
```

### Rule Citation
```json
"citationType": "rule",
"extractedComponents": {
  "ruleSet": "Federal Rules of Civil Procedure",
  "rule": "12",
  "subdivision": "b(6)"
}
```

---

## Complete Example Document

```json
{
  "document": {
    "metadata": {
      "filename": "motion_to_dismiss.docx",
      "uploadDate": "2025-11-18T14:30:00Z",
      "documentType": "motion",
      "totalCitations": 3
    },
    "content": [
      {
        "type": "heading",
        "id": "heading_001",
        "level": 1,
        "text": "I. INTRODUCTION"
      },
      {
        "type": "paragraph",
        "id": "para_001",
        "text": "Defendant submits this Motion to Dismiss pursuant to [CITATION:cit_001]Federal Rule of Civil Procedure 12(b)(6)[/CITATION:cit_001]. The complaint fails to state a claim upon which relief can be granted. As established in [CITATION:cit_002]Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)[/CITATION:cit_002], the complaint must contain sufficient factual matter to state a plausible claim for relief."
      },
      {
        "type": "heading",
        "id": "heading_002",
        "level": 1,
        "text": "II. LEGAL STANDARD"
      },
      {
        "type": "paragraph",
        "id": "para_002",
        "text": "A motion to dismiss under [CITATION:cit_001]Federal Rule of Civil Procedure 12(b)(6)[/CITATION:cit_001] challenges the sufficiency of the complaint. [CITATION:cit_003]Ashcroft v. Iqbal, 556 U.S. 662 (2009)[/CITATION:cit_003] establishes the pleading standard."
      }
    ],
    "citations": [
      {
        "id": "cit_001",
        "citationText": "Federal Rule of Civil Procedure 12(b)(6)",
        "citationType": "rule",
        "extractedComponents": {
          "ruleSet": "Federal Rules of Civil Procedure",
          "rule": "12",
          "subdivision": "b(6)"
        },
        "tier_1": {
          "status": "VALID_FORMAT",
          "confidence": 0.99
        },
        "tier_2": {
          "evaluations": [
            {
              "evaluatorName": "format_validator",
              "verdict": "PLAUSIBLE",
              "confidence": 0.98
            },
            {
              "evaluatorName": "plausibility_checker",
              "verdict": "PLAUSIBLE",
              "confidence": 0.96
            },
            {
              "evaluatorName": "red_flag_detector",
              "verdict": "PLAUSIBLE",
              "confidence": 0.97
            }
          ],
          "consensus": "VALID",
          "consensusConfidence": 0.97,
          "escalated": false
        },
        "tier_3": null,
        "recommendations": null
      },
      {
        "id": "cit_002",
        "citationText": "Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)",
        "citationType": "case",
        "extractedComponents": {
          "parties": ["Bell Atlantic Corp.", "Twombly"],
          "reporter": "U.S.",
          "page": "544",
          "court": "U.S.",
          "year": 2007
        },
        "tier_1": {
          "status": "VALID_FORMAT",
          "confidence": 0.99
        },
        "tier_2": {
          "evaluations": [
            {
              "evaluatorName": "format_validator",
              "verdict": "PLAUSIBLE",
              "confidence": 0.95
            },
            {
              "evaluatorName": "plausibility_checker",
              "verdict": "PLAUSIBLE",
              "confidence": 0.92
            },
            {
              "evaluatorName": "red_flag_detector",
              "verdict": "PLAUSIBLE",
              "confidence": 0.90
            }
          ],
          "consensus": "VALID",
          "consensusConfidence": 0.92,
          "escalated": false
        },
        "tier_3": null,
        "recommendations": null
      },
      {
        "id": "cit_003",
        "citationText": "Ashcroft v. Iqbal, 556 U.S. 662 (2009)",
        "citationType": "case",
        "extractedComponents": {
          "parties": ["Ashcroft", "Iqbal"],
          "reporter": "U.S.",
          "page": "662",
          "court": "U.S.",
          "year": 2009
        },
        "tier_1": {
          "status": "VALID_FORMAT",
          "confidence": 0.99
        },
        "tier_2": {
          "evaluations": [
            {
              "evaluatorName": "format_validator",
              "verdict": "PLAUSIBLE",
              "confidence": 0.96
            },
            {
              "evaluatorName": "plausibility_checker",
              "verdict": "PLAUSIBLE",
              "confidence": 0.94
            },
            {
              "evaluatorName": "red_flag_detector",
              "verdict": "PLAUSIBLE",
              "confidence": 0.93
            }
          ],
          "consensus": "VALID",
          "consensusConfidence": 0.94,
          "escalated": false
        },
        "tier_3": null,
        "recommendations": null
      }
    ]
  }
}
```

---

## Development Notes

### For Parser Development
- Use Tier 1 to validate you're correctly extracting citation patterns
- Verify `extractedComponents` matches what you extracted from the citation text
- Test with the provided test document

### For Tier 2/3 AI Development
- Each evaluator reads the citation JSON object (not the full document JSON)
- Evaluator writes their verdict and confidence to the tier_2 evaluations array
- If consensus is split, escalate to tier_3 automatically
- Tier_3 analyst populates analysis and severity

### For UI Development
- Parse content array and render paragraphs, stripping the [CITATION:...] markers
- On hover/click, highlight the citation and pull data from citations array
- Show tier_2 consensus and tier_3 analysis in side panel
- List view: extract all citations and render as table

### For Export to Word
- Strip the [CITATION:...] markers from text (leaves original citation text)
- Optionally add comments or highlights where tier_2 flagged issues
- Use tier_3 analysis to generate tracked comments for lawyer review

---

## Phase 2: Adding Recommendations

When recommendations are implemented, add to each citation:

```json
"recommendations": [
  {
    "citationText": "Johnson v. Williams, 789 U.S. 123 (2020)",
    "reason": "more recent Supreme Court decision on same point"
  },
  {
    "citationText": "State v. Martinez, 456 F.3d 789 (2d Cir. 2019)",
    "reason": "stronger circuit precedent in your jurisdiction"
  }
]
```

---

## Null Values

- `tier_3` is `null` if citation is not escalated
- `recommendations` is `null` until recommendations feature is added
- Component fields may be `null` if not extracted (e.g., subdivision in statute)