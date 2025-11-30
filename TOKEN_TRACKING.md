# Token Tracking System

## Overview

The token tracking system captures token usage and calculates costs for validation runs. It's designed to work with the current Anthropic-only setup while being easily extensible for multi-provider/multi-model support in the future.

## Current Implementation

### Features

1. **Token Extraction**: Automatically extracts token usage from Anthropic API responses
2. **Cost Calculation**: Calculates costs based on per-model pricing (per 1M tokens)
3. **Run Cost Aggregation**: Aggregates costs across all agents in a validation run
4. **JSON Storage**: Stores token usage and costs in the validation result JSON

### How It Works

1. **During Validation**: Each agent call extracts token usage from the API response
2. **Per-Agent Tracking**: Each `AgentVerdict` and `Tier3AgentVerdict` includes:
   - `token_usage`: Input/output/total tokens and provider
   - `cost`: Calculated cost breakdown
3. **Run-Level Aggregation**: Each `CitationValidation` and `Tier3Result` includes:
   - `run_cost`: Cost breakdown by model and total cost

### Data Structure

```typescript
// Per-agent token usage
{
  token_usage: {
    input_tokens: 1250,
    output_tokens: 150,
    total_tokens: 1400,
    provider: 'anthropic'
  },
  cost: {
    input_cost: 0.001,
    output_cost: 0.0006,
    total_cost: 0.0016,
    currency: 'USD'
  }
}

// Run-level cost aggregation
{
  run_cost: {
    byModel: {
      'claude-haiku-4-5-20251001': {
        input_cost: 0.005,
        output_cost: 0.003,
        total_cost: 0.008,
        currency: 'USD'
      }
    },
    total: {
      input_cost: 0.005,
      output_cost: 0.003,
      total_cost: 0.008,
      currency: 'USD'
    }
  }
}
```

## Future Multi-Model Support

The system is designed to easily support multiple providers and models:

### Extensibility Points

1. **Provider Support**: The `extractTokens()` function auto-detects providers and can be extended:
   - Currently: Anthropic (fully implemented)
   - Ready for: OpenAI, Gemini (extraction functions exist, just need API integration)

2. **Model Pricing**: The `MODEL_PRICING` dictionary can be easily updated with new models:
   ```typescript
   'gpt-4o': { input: 2.50, output: 10.00 },
   'gemini-2.0-flash': { input: 0.075, output: 0.30 },
   ```

3. **Provider Type**: The `Provider` type already includes `'openai' | 'gemini'` for future use

### Integration Points for Multi-Model

When implementing multi-model support, you'll need to:

1. **Update API Calls**: Modify `callValidationAgent` and `callTier3Agent` to:
   - Accept a model configuration parameter
   - Route to the appropriate provider SDK
   - Pass the provider type to `extractTokens()`

2. **Model Configuration**: Create a configuration system that:
   - Maps agents to models/providers
   - Allows per-agent model assignment
   - Supports environment variable overrides

3. **API Key Management**: Ensure API keys are available for all providers:
   ```bash
   ANTHROPIC_API_KEY=...
   OPENAI_API_KEY=...
   GEMINI_API_KEY=...
   ```

## Files Modified

- `lib/citation-identification/token-tracking.ts`: Core token tracking logic
- `lib/citation-identification/validation.ts`: Integration with validation functions
- `types/citation-json.ts`: Type definitions for token usage and costs

## Usage

Token tracking is automatic - no code changes needed. After validation runs complete, check:

- `validation.panel_evaluation[].token_usage` - Per-agent token usage
- `validation.panel_evaluation[].cost` - Per-agent costs
- `validation.run_cost` - Aggregated run costs

## Pricing Updates

To update model pricing, edit `MODEL_PRICING` in `lib/citation-identification/model-pricing.ts`. Prices are per 1M tokens in USD.

This configuration file is separate from the token tracking logic, making it easy to update pricing without modifying core functionality.

## Report Display

Token usage and estimated costs are automatically displayed in the Citations Report (Step 6). The report shows:

- **Total Tokens**: Aggregated across all citations and models
- **Estimated Cost**: Total cost in USD
- **Breakdown by Model**: Per-model token usage and costs

The cost calculation uses the pricing from `model-pricing.ts`, ensuring accurate cost estimates.

