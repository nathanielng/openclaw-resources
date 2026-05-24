# Amazon Bedrock & Bedrock Mantle Setup Guide for OpenClaw

> **Note:** This guide was AI-generated and tested in May 2026. It may contain inaccuracies, and configurations or model availability may have changed since then. Always verify against the [official OpenClaw docs](https://docs.openclaw.ai) and [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/) before applying changes to your setup.

This guide covers configuring OpenClaw to use **Amazon Bedrock** (native runtime) and **Amazon Bedrock Mantle** (OpenAI-compatible surface) as model providers.

## 1. Overview

| | Amazon Bedrock (Native) | Amazon Bedrock Mantle |
|---|---|---|
| **Endpoint** | `bedrock-runtime.<region>.amazonaws.com` | `bedrock-mantle.<region>.api.aws/v1` |
| **API surface** | `bedrock-converse-stream` | `anthropic-messages` (Claude) / `openai-completions` (others) |
| **Model ID format** | Geo inference profile (`us.anthropic.claude-...`) | Bare ID (`anthropic.claude-...`) |
| **Available Claude models** | Sonnet 4.6, Haiku 4.5 (+ others if enabled) | Haiku 4.5 only (as of May 2026) |
| **Streaming** | ✅ Full support | ⚠️ Claude only via `anthropic-messages` |

**When to use which:**
- Use **native Bedrock** for Claude Sonnet 4.6 (best balance of capability and cost) or any model requiring streaming
- Use **Mantle** for open-source models (Qwen, Mistral, xAI) or Claude Haiku 4.5 if you prefer the simpler `/v1` interface

---

## 2. Prerequisites

- An AWS account with Bedrock model access enabled for your target models
- A Bearer token (same token works for both providers)
- OpenClaw `v2026.3.8` or later (the `bedrock-converse-stream` inference profile fix landed in PR #61299, included since `2026.5.22`)

---

## 3. Amazon Bedrock (Native Runtime)

### Config

Add to `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "providers": {
      "amazon-bedrock": {
        "baseUrl": "https://bedrock-runtime.us-east-1.amazonaws.com",
        "api": "bedrock-converse-stream",
        "auth": "api-key",
        "apiKey": "env:AWS_BEARER_TOKEN_BEDROCK",
        "models": [
          {
            "id": "us.anthropic.claude-sonnet-4-6",
            "name": "Claude Sonnet 4.6",
            "api": "bedrock-converse-stream",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 3, "output": 15 },
            "contextWindow": 200000,
            "maxTokens": 16000
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "amazon-bedrock/us.anthropic.claude-sonnet-4-6"
      }
    }
  }
}
```

### Model ID Format

> ⚠️ **Critical:** Newer Claude models on Bedrock require a **cross-region inference profile ID**, not the bare model ID. This is the #1 source of setup failures.

| Format | Result |
|---|---|
| `anthropic.claude-sonnet-4-6` | ❌ "on-demand throughput not supported" |
| `us.anthropic.claude-sonnet-4-6-v1:0` | ❌ "invalid model identifier" |
| `us.anthropic.claude-sonnet-4-6` | ✅ Works |

Use the geo prefix that matches your region:
- `us.` — US regions
- `eu.` — EU regions
- `ap.` — Asia Pacific
- `global.` — global routing

Find the correct ID for your model at:
`https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-<model>.html`
→ **Programmatic Access → Geo inference ID**

### Auth

> ⚠️ The `auth.profiles` section in `openclaw.json` is **not** used for Bedrock — that's only for OAuth sessions (OpenRouter, Anthropic claude-cli). No auth profile entry is needed.

Two options:
- `"auth": "aws-sdk"` — uses the AWS credential chain (`~/.aws/credentials`, env vars, instance role). Recommended for EC2/ECS.
- `"auth": "api-key"` — uses a Bearer token directly. Simpler for single-host setups.

Store the token in `~/.openclaw/.env`:
```bash
AWS_BEARER_TOKEN_BEDROCK=your-base64-encoded-token
```

---

## 4. Amazon Bedrock Mantle

Mantle is a separate `/v1` OpenAI-compatible surface backed by Bedrock infrastructure. It hosts open-source models and select Claude models.

### Config

```json
{
  "models": {
    "providers": {
      "amazon-bedrock-mantle": {
        "baseUrl": "https://bedrock-mantle.us-east-1.api.aws/v1",
        "auth": "api-key",
        "apiKey": "env:AWS_BEARER_TOKEN_BEDROCK",
        "models": [
          {
            "id": "anthropic.claude-haiku-4-5",
            "name": "Claude Haiku 4.5",
            "api": "anthropic-messages",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 1, "output": 5 },
            "contextWindow": 80000,
            "maxTokens": 16000
          }
        ]
      }
    }
  }
}
```

### Model ID Format — Different from Native Bedrock

> ⚠️ **Do not use `us./eu./global.` prefixes on Mantle** — they will return HTTP 404. Mantle handles geo-routing internally.

Use the bare model ID exactly as listed by the Mantle `/v1/models` endpoint:

```bash
curl https://bedrock-mantle.us-east-1.api.aws/v1/models \
  -H "Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK" | \
  python3 -c "import sys,json; [print(m['id']) for m in json.load(sys.stdin).get('data',[])]"
```

### API Selection for Mantle Models

| Model type | `api` value |
|---|---|
| Claude models | `anthropic-messages` |
| All other models (Qwen, Mistral, xAI, etc.) | `openai-completions` |

### Model Availability (as of May 2026)

| Model | Status |
|---|---|
| `anthropic.claude-haiku-4-5` | ✅ Works via `anthropic-messages` |
| `anthropic.claude-opus-4-7` | ❌ Listed but **not usable** — only supports non-streaming, OpenClaw requires streaming |
| `anthropic.claude-sonnet-4-6` | ❌ Not available on Mantle — use native Bedrock instead |

---

## 5. Things to Avoid

### Bedrock (Native)
- ❌ Don't use the bare model ID (`anthropic.claude-sonnet-4-6`) — it requires provisioned throughput you likely don't have
- ❌ Don't append `-v1:0` version suffixes to geo inference profile IDs
- ❌ Don't forget to restart the gateway after config changes — there is no hot reload

### Bedrock Mantle
- ❌ Don't use `us./eu./global.` prefixes — Mantle rejects them with HTTP 404
- ❌ Don't use `anthropic.claude-opus-4-7` — it only supports non-streaming `/v1/messages`, which OpenClaw's `anthropic-messages` API doesn't support (returns 404 on the streaming path)
- ❌ Don't use `anthropic.claude-sonnet-4-6` on Mantle — it's not available; use native Bedrock

### Both Providers
- ❌ Don't set `sandbox.mode: "all"` unless Docker is accessible — it will block every agent call with a permission error
- The same Bearer token works for both providers — no need for separate credentials

---

## 6. Discovery Commands

Find the correct inference profile ID and verify model access from the CLI:

```bash
# List all Claude inference profiles (these are the IDs you use in config)
aws bedrock list-inference-profiles --region us-east-1 \
  --query "inferenceProfileSummaries[].inferenceProfileId" \
  --output json | grep claude

# Verify a specific model is authorized and available
aws bedrock get-foundation-model-availability \
  --model-id "anthropic.claude-sonnet-4-6" \
  --region us-east-1
```

Look for `"authorizationStatus": "AUTHORIZED"` and `"entitlementAvailability": "AVAILABLE"` in the output.

---

## 7. Troubleshooting

### "on-demand throughput isn't supported"

**Cause:** You're using the bare model ID on native Bedrock.
**Fix:** Switch to the geo inference profile ID:
```
❌ anthropic.claude-sonnet-4-6
✅ us.anthropic.claude-sonnet-4-6
```

### "The provided model identifier is invalid"

**Cause:** Wrong inference profile format. Common mistakes:
- Added `-v1:0` suffix → remove it
- Used wrong geo prefix for your region

### "Anthropic Messages request failed with HTTP 404" (Mantle)

**Cause:** One of:
- You used a `us./global.` prefixed ID on Mantle → use bare ID
- You're trying to use `anthropic.claude-opus-4-7` → not supported via streaming

### "permission denied while trying to connect to the Docker daemon socket"

**Cause:** `sandbox.mode` is set to `"all"` but Docker isn't accessible.
**Fix:**
```bash
# Option 1: disable sandbox
openclaw config set agents.defaults.sandbox.mode off

# Option 2: add user to docker group (requires re-login + gateway restart)
sudo usermod -aG docker $USER
openclaw gateway restart
```

### Config changes not taking effect

Always restart the gateway after editing `openclaw.json`:
```bash
openclaw gateway restart
```

---

## 8. Verification

```bash
# Confirm models are registered
openclaw models list

# Test the primary model
openclaw agent --agent main -m "say hello in one word" --json

# Test a specific model explicitly
openclaw agent --agent main -m "hello" --model "amazon-bedrock/us.anthropic.claude-sonnet-4-6" --json

# Test Mantle
openclaw agent --agent main -m "hello" --model "amazon-bedrock-mantle/anthropic.claude-haiku-4-5" --json
```
