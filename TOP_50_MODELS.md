# OpenRouter Top 50 Models

## Overview

Top 50 AI models available through OpenRouter, ranked by average
PinchBench score. Combines benchmark results with current pricing.

## Data Sources

- **Benchmark**: [PinchBench](https://pinchbench.com/?score=average)
  — [23 tasks](https://pinchbench.com/about) across different categories
- **Pricing**: [OpenRouter API](https://openrouter.ai/models)
- **Generated**: 03 May 2026

### Methodology

PinchBench entries from the `openrouter` provider are used directly.
Entries from other providers (e.g. `anthropic`, `openai-codex`, `xai`)
are mapped to their OpenRouter equivalents when the model exists on
OpenRouter. When multiple entries map to the same model, the entry with
the most submissions is used. Models not available on OpenRouter are excluded.

---

## Model Rankings & Costs

| Rank | Model ID | Best % | Avg % | Input ($/M) | Output ($/M) | Source |
|------|----------|--------|-------|-------------|--------------|--------|
| 1 | arcee-ai/trinity-large-thinking | 91.9% | 91.9% | $0.22 | $0.85 | mapped |
| 2 | z-ai/glm-5.1 | 84.6% | 80.9% | $1.05 | $3.50 | direct |
| 3 | anthropic/claude-opus-4.6 | 96.0% | 80.7% | $5.00 | $25.00 | direct |
| 4 | qwen/qwen3.5-122b-a10b | 85.5% | 80.6% | $0.26 | $2.08 | direct |
| 5 | z-ai/glm-5 | 86.4% | 80.6% | $0.60 | $2.08 | direct |
| 6 | qwen/qwen3.5-397b-a17b | 89.1% | 80.4% | $0.39 | $2.34 | direct |
| 7 | z-ai/glm-5-turbo | 86.5% | 80.3% | $1.20 | $4.00 | direct |
| 8 | qwen/qwen3.5-27b | 92.3% | 80.1% | $0.20 | $1.56 | direct |
| 9 | anthropic/claude-sonnet-4.5 | 88.6% | 80.0% | $3.00 | $15.00 | direct |
| 10 | bytedance-seed/seed-2.0-lite | 85.2% | 79.8% | $0.25 | $2.00 | direct |
| 11 | minimax/minimax-m2.7 | 91.9% | 79.7% | $0.30 | $1.20 | direct |
| 12 | moonshotai/kimi-k2.5 | 87.6% | 79.6% | $0.44 | $2.00 | direct |
| 13 | qwen/qwen3.5-plus-02-15 | 85.8% | 79.1% | $0.26 | $1.56 | direct |
| 14 | qwen/qwen3-coder-next | 79.1% | 79.1% | $0.12 | $0.80 | mapped |
| 15 | anthropic/claude-opus-4.5 | 87.2% | 78.8% | $5.00 | $25.00 | direct |
| 16 | xiaomi/mimo-v2-omni | 87.5% | 78.6% | $0.40 | $2.00 | direct |
| 17 | minimax/minimax-m2.1 | 88.4% | 78.4% | $0.29 | $0.95 | direct |
| 18 | anthropic/claude-sonnet-4 | 80.5% | 77.2% | $3.00 | $15.00 | direct |
| 19 | z-ai/glm-4.5-air | 85.7% | 76.8% | $0.13 | $0.85 | direct |
| 20 | minimax/minimax-m2.5 | 87.8% | 76.7% | $0.15 | $1.15 | direct |
| 21 | stepfun/step-3.5-flash | 85.3% | 76.6% | $0.10 | $0.30 | direct |
| 22 | mistralai/devstral-2512 | 82.0% | 74.8% | $0.40 | $2.00 | direct |
| 23 | google/gemma-4-26b-a4b-it | 83.9% | 74.1% | $0.06 | $0.33 | direct |
| 24 | anthropic/claude-haiku-4.5 | 89.5% | 74.1% | $1.00 | $5.00 | direct |
| 25 | openai/gpt-5.4-mini | 87.7% | 73.2% | $0.75 | $4.50 | direct |
| 26 | qwen/qwen3-max-thinking | 80.3% | 71.8% | $0.78 | $3.90 | direct |
| 27 | x-ai/grok-4.1-fast | 82.4% | 71.3% | $0.20 | $0.50 | direct |
| 28 | mistralai/mistral-small-2603 | 76.7% | 71.3% | $0.15 | $0.60 | direct |
| 29 | inception/mercury-2 | 80.1% | 71.2% | $0.25 | $0.75 | direct |
| 30 | x-ai/grok-4.20 | 83.3% | 71.2% | $1.25 | $2.50 | direct |
| 31 | qwen/qwen3.5-35b-a3b | 78.4% | 70.3% | $0.16 | $1.30 | direct |
| 32 | amazon/nova-2-lite-v1 | 75.4% | 70.0% | $0.30 | $2.50 | direct |
| 33 | qwen/qwen3-235b-a22b-2507 | 78.7% | 69.9% | $0.07 | $0.10 | direct |
| 34 | nvidia/nemotron-3-super-120b-a12b:free | 75.0% | 69.6% | Free | Free | mapped |
| 35 | openai/gpt-5.4-nano | 78.5% | 69.4% | $0.20 | $1.25 | direct |
| 36 | xiaomi/mimo-v2-flash | 88.8% | 69.2% | $0.09 | $0.29 | direct |
| 37 | openai/gpt-5-mini | 80.3% | 69.0% | $0.25 | $2.00 | direct |
| 38 | xiaomi/mimo-v2-pro | 87.4% | 68.4% | $1.00 | $3.00 | direct |
| 39 | deepseek/deepseek-v3.2 | 84.3% | 68.0% | $0.25 | $0.38 | direct |
| 40 | z-ai/glm-5v-turbo | 85.5% | 67.0% | $1.20 | $4.00 | direct |
| 41 | google/gemma-4-31b-it | 76.4% | 66.5% | $0.13 | $0.38 | direct |
| 42 | nvidia/nemotron-3-super-120b-a12b | 88.6% | 66.0% | $0.09 | $0.45 | direct |
| 43 | mistralai/mistral-large-2512 | 72.2% | 66.0% | $0.50 | $1.50 | direct |
| 44 | google/gemini-3-flash-preview | 97.8% | 65.9% | $0.50 | $3.00 | direct |
| 45 | google/gemini-2.5-pro | 71.9% | 65.0% | $1.25 | $10.00 | direct |
| 46 | arcee-ai/trinity-large-preview | 80.6% | 63.7% | $0.15 | $0.45 | direct |
| 47 | openai/gpt-4o-mini | 75.0% | 63.6% | $0.15 | $0.60 | direct |
| 48 | qwen/qwen3.6-plus | 63.9% | 63.3% | $0.33 | $1.95 | direct |
| 49 | deepseek/deepseek-chat | 71.7% | 63.2% | $0.32 | $0.89 | direct |
| 50 | anthropic/claude-sonnet-4.6 | 88.0% | 61.8% | $3.00 | $15.00 | direct |

---

## Quick Picks

- **Best overall**: `arcee-ai/trinity-large-thinking` — 91.9% avg
- **Best free**: `nvidia/nemotron-3-super-120b-a12b:free` — 69.6% avg
- **Best value**: `google/gemma-4-26b-a4b-it` — 74.1% avg, $0.06/M input

---

## Notes

- Prices in USD per million tokens
- "Source: direct" = PinchBench run used OpenRouter; "mapped" = run used
  another provider but the model is available on OpenRouter
- Free models may have usage limits
- All models available via [OpenRouter](https://openrouter.ai)
