# Tier 3 Case Link Feature - Analysis

## Overview
This document analyzes the requirements and implementation considerations for adding case link verification to the Tier 3 citation validation prompts. The feature would request AI agents to find and provide valid links to cases referenced by citations, which would then be displayed in the Step 3: Review Citations page.

## Current System Architecture

### 1. Tier 3 Prompt Structure

**Location**: `lib/citation-identification/tier3-prompts.ts`

**Current Format**: All three Tier 3 agents (Rigorous Legal Investigator, Holistic Legal Analyst, Pattern Recognition Expert) currently return:
```
RISK_LEVEL: LOW_RISK | MODERATE_RISK | NEEDS_ADDITIONAL_REVIEW
REASONING: <2-3 sentences explaining assessment>
```

**Prompt Functions**:
- `getRigorousLegalInvestigatorPrompt()` - Agent 1: Senior Litigator Reviewer
- `getHolisticLegalAnalystPrompt()` - Agent 2: Specialist Legal Researcher  
- `getPatternRecognitionExpertPrompt()` - Agent 3: Appellate Clerk / Judicial Reviewer

**Model Used**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)

### 2. Response Parsing

**Location**: `lib/citation-identification/tier3-prompts.ts`

**Function**: `parseTier3AgentResponse()`

**Current Parsing**: Extracts:
- `risk_level` (LOW_RISK, MODERATE_RISK, NEEDS_ADDITIONAL_REVIEW)
- `reasoning` (text explanation)
- Legacy fields: `verdict`, `invalid_reason`, `uncertain_reason`

**Parsing Method**: Line-by-line parsing looking for structured labels like `RISK_LEVEL:`, `REASONING:`, etc.

### 3. Data Structures

**Location**: `types/citation-json.ts`

**Tier3AgentVerdict Interface** (lines 38-61):
```typescript
export interface Tier3AgentVerdict {
  agent: string;
  risk_level?: Tier3RiskLevel;
  reasoning?: string;
  verdict?: Tier3AgentVerdictType; // Legacy
  invalid_reason?: string; // Legacy
  uncertain_reason?: string; // Legacy
  timestamp: string;
  model: string;
  token_usage?: {...};
  cost?: {...};
}
```

**Tier3Result Interface** (lines 229-258):
```typescript
export interface Tier3Result {
  panel_evaluation: Tier3AgentVerdict[]; // 3 agent verdicts
  consensus: Tier3Consensus;
  // Legacy fields...
  timestamp: string;
  model: string;
  run_cost?: {...};
}
```

**Note**: There's already a `caseLink` field in `HeavyAnalysisResult` (line 271), which suggests precedent for storing links.

### 4. Display Location

**Step 3: Review Citations Page**: `app/citation-checker/[fileId]/document-review/page.tsx`

**Component**: `DocumentReviewPage` in `app/citation-checker/components/DocumentReviewPage.tsx`

**T3 Details Display** (lines 1209-1318):
- Shows consensus summary with risk level and confidence
- Expandable "Show Tier 3 Panel Details" section
- For each agent, displays:
  - Agent name
  - Verdict/risk level badge
  - Reasoning text
  - Invalid/uncertain reason codes (if present)
  - Model and timestamp

**Current Display Structure**:
```tsx
{tier3.panel_evaluation.map((agent: any, idx: number) => (
  <div>
    {/* Agent name, verdict badge */}
    {agent.reasoning && (
      <div>Reasoning: {agent.reasoning}</div>
    )}
    {/* Reason codes, model, timestamp */}
  </div>
))}
```

### 5. Validation Flow

**Location**: `lib/citation-identification/validation.ts`

**Function**: `validateCitationTier3()` (lines 729-812)
1. Calls all 3 agents in parallel via `callTier3Agent()`
2. Each agent:
   - Gets prompt from `agentConfig.getPrompt(citation, context)`
   - Calls Anthropic API with Claude Sonnet 4.5
   - Parses response with `parseTier3AgentResponse()`
   - Returns `Tier3AgentVerdict`
3. Calculates consensus with `calculateTier3Consensus()`
4. Builds `Tier3Result` with panel evaluations and consensus

## Proposed Changes

### 1. Prompt Modifications

**Add to all three Tier 3 prompts** (in `tier3-prompts.ts`):

Add a new section in the investigation instructions:
```
6. CASE LINK VERIFICATION
   - Please provide a link to the case referenced by this citation to verify that the citation and any quotations are both real and accurate.
   - If you can find a valid link to the case (e.g., from Westlaw, Lexis, Justia, CourtListener, or official court websites), include it in your response.
   - If you cannot find a link, indicate that in your response.
```

**Update response format** in all three prompts:
```
RISK_LEVEL: LOW_RISK | MODERATE_RISK | NEEDS_ADDITIONAL_REVIEW
REASONING: <2-3 sentences explaining your assessment>
CASE_LINK: <URL to the case if found, or "NOT_FOUND" if unavailable>
```

**Considerations**:
- The prompt should be clear about what constitutes a "valid link" (official sources preferred)
- Should handle cases where the link cannot be found gracefully
- May want to specify preferred sources (Westlaw, Lexis, Justia, CourtListener, official court sites)
- Should note that link availability doesn't necessarily affect risk assessment

### 2. Data Structure Updates

**Update `Tier3AgentVerdict` interface** (`types/citation-json.ts`):
```typescript
export interface Tier3AgentVerdict {
  agent: string;
  risk_level?: Tier3RiskLevel;
  reasoning?: string;
  case_link?: string; // NEW: URL to verify the case
  // ... existing fields
}
```

**Considerations**:
- Make `case_link` optional since not all agents may find links
- Consider validation: should we validate URLs before storing?
- May want to track which agent found the link (if multiple agents provide links)
- Consider storing multiple links if different agents find different sources

### 3. Response Parsing Updates

**Update `parseTier3AgentResponse()` function** (`lib/citation-identification/tier3-prompts.ts`):

Add parsing for `CASE_LINK:` field:
```typescript
// Extract case link
const caseLinkLine = lines.find(l => l.toUpperCase().startsWith('CASE_LINK:'))
let case_link: string | undefined
if (caseLinkLine) {
  const linkText = caseLinkLine.substring(10).trim()
  if (linkText && linkText.toUpperCase() !== 'NOT_FOUND' && linkText.length > 0) {
    // Basic URL validation
    if (linkText.startsWith('http://') || linkText.startsWith('https://')) {
      case_link = linkText
    }
  }
}
```

**Return in `ParsedTier3AgentResponse`**:
```typescript
export interface ParsedTier3AgentResponse {
  risk_level?: Tier3RiskLevel;
  reasoning: string;
  case_link?: string; // NEW
  // ... existing fields
}
```

**Considerations**:
- Handle cases where AI provides partial URLs or malformed links
- Consider URL validation/sanitization
- Handle "NOT_FOUND" or similar indicators gracefully
- May want to extract links from reasoning text as fallback

### 4. Display Updates

**Update `DocumentReviewPage.tsx`** (lines 1257-1296):

Add case link display in the agent details section:
```tsx
{agent.reasoning && (
  <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">
    <span className="font-medium">Reasoning: </span>
    <span>{agent.reasoning}</span>
  </div>
)}
{agent.case_link && (
  <div className="mt-1 text-xs">
    <span className="font-medium">Case Link: </span>
    <a 
      href={agent.case_link} 
      target="_blank" 
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-800 underline"
    >
      {agent.case_link}
    </a>
  </div>
)}
```

**Also consider displaying in consensus section** (lines 1210-1248):
- Could show a consolidated case link if multiple agents agree
- Or show "Case verified" indicator if at least one agent found a link

**Considerations**:
- Should links open in new tab? (Yes, recommended)
- Should we truncate long URLs for display?
- Consider showing link source/type (Westlaw, Justia, etc.) if identifiable
- May want to validate links before displaying (check if they're still valid)

### 5. Consensus/Aggregation Logic

**Consider updating `calculateTier3Consensus()`** (`lib/citation-identification/validation.ts`):

Options:
1. **Store links per agent** (recommended): Keep individual agent links in `Tier3AgentVerdict`, display all in UI
2. **Aggregate to consensus**: If multiple agents find the same link, store in consensus; if different links, store array
3. **First link wins**: Use the first valid link found by any agent

**Recommendation**: Option 1 - Keep links per agent. This:
- Preserves transparency (users see which agent found which link)
- Allows comparison if agents find different sources
- Doesn't require complex aggregation logic
- Maintains data integrity

### 6. Additional Considerations

#### Link Validation
- Should we validate URLs before storing? (Check format, maybe ping to verify accessibility)
- Consider rate limiting if validating many links
- May want to cache link validation results

#### Link Sources
- Different agents might find different sources (Westlaw vs Justia vs official court site)
- Should we prefer certain sources? (Official > Westlaw/Lexis > Justia/CourtListener)
- May want to track source type for analytics

#### Error Handling
- What if AI provides invalid URL format?
- What if link is found but later becomes inaccessible?
- Should we re-validate links on display?

#### Performance
- No significant performance impact expected (just storing additional string field)
- Link validation (if implemented) could add latency

#### Backward Compatibility
- New field is optional, so existing T3 results remain valid
- Display code should handle missing `case_link` gracefully

#### Testing
- Test with citations that have easily findable links
- Test with citations that don't have public links
- Test with malformed URL responses from AI
- Test with "NOT_FOUND" responses

## Implementation Checklist

### Phase 1: Core Functionality
- [ ] Update all three Tier 3 prompt functions to request case links
- [ ] Update response format specification in prompts
- [ ] Add `case_link` field to `Tier3AgentVerdict` interface
- [ ] Update `ParsedTier3AgentResponse` interface
- [ ] Update `parseTier3AgentResponse()` to extract case links
- [ ] Update `callTier3Agent()` to include case_link in verdict
- [ ] Update `DocumentReviewPage` to display case links

### Phase 2: Enhancement (Optional)
- [ ] Add URL validation before storing
- [ ] Add link source detection/display (Westlaw, Justia, etc.)
- [ ] Add consolidated case link in consensus section
- [ ] Add link validation on display (check if still accessible)
- [ ] Add analytics for link availability by citation type

### Phase 3: Testing & Validation
- [ ] Test with various citation types (cases, statutes, regulations)
- [ ] Test with citations that have/don't have public links
- [ ] Test error handling (malformed URLs, missing links)
- [ ] Verify backward compatibility with existing T3 results
- [ ] Test display on Step 3: Review Citations page

## Example Prompt Addition

Here's how the prompt section would look:

```typescript
Use ALL of the following angles in your review:

1. AUTHORITY & STRUCTURE
   [... existing content ...]

2. EXISTENCE & DOCTRINE
   [... existing content ...]

3. TEMPORAL & HISTORICAL FIT
   [... existing content ...]

4. CONTEXT IN THE BRIEF
   [... existing content ...]

5. FABRICATION OR ERROR MARKERS
   [... existing content ...]

6. CASE LINK VERIFICATION
   - Please provide a link to the case referenced by this citation to verify that the citation and any quotations are both real and accurate.
   - Preferred sources (in order): official court websites, Westlaw, Lexis, Justia, CourtListener, or other reputable legal databases.
   - If you cannot find a valid link, respond with "NOT_FOUND".
   - Note: The availability of a link does not affect your risk assessment - use it only for verification purposes.

Respond in exactly this format:

RISK_LEVEL: LOW_RISK | MODERATE_RISK | NEEDS_ADDITIONAL_REVIEW
REASONING: <2-3 sentences explaining your risk assessment in practical "would I sign this brief?" terms>
CASE_LINK: <URL to the case if found, or "NOT_FOUND" if unavailable>`
```

## Questions for Consideration

1. **Should all three agents be required to find links, or is one sufficient?**
   - Recommendation: Optional for all agents, display all found links

2. **Should we validate links before storing, or trust the AI's response?**
   - Recommendation: Basic format validation (starts with http/https), full validation optional

3. **How should we handle different links from different agents?**
   - Recommendation: Display all, let user choose which to use

4. **Should case links affect the risk assessment?**
   - Recommendation: No - links are for verification only, not part of risk calculation

5. **Should we store links for non-case citations (statutes, regulations)?**
   - Recommendation: Yes, but prompt should specify appropriate sources (e.g., official code websites for statutes)

6. **Should we track link source type (Westlaw, Justia, etc.)?**
   - Recommendation: Optional enhancement - could parse from URL or ask AI to specify

## Summary

The implementation is straightforward and follows existing patterns in the codebase. The main changes are:
1. Adding case link request to Tier 3 prompts
2. Extending data structures to store links
3. Updating response parsing to extract links
4. Displaying links in the Step 3: Review Citations page

The feature is backward compatible (optional field) and doesn't require changes to the consensus calculation logic. The most important consideration is ensuring the AI provides valid URLs and handling cases where links cannot be found.

