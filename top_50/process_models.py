#!/usr/bin/env python3
"""
Fetch PinchBench leaderboard + OpenRouter model list, map PinchBench entries
to OpenRouter model IDs, and generate a top-50 markdown file.

Tier 1: PinchBench entries with provider='openrouter' (direct match)
Tier 2: Non-OpenRouter entries mapped to OpenRouter equivalents
        (only if the OpenRouter model ID is confirmed via the OpenRouter API)

Usage:
    python3 process_models.py              # generate TOP_50_MODELS.md
    python3 process_models.py --uncertain  # also print uncertain mappings
"""
import json
import sys
import subprocess
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

# ── Known provider mappings ─────────────────────────────────────────────────
# PinchBench provider → how to derive the OpenRouter model ID
# "strip" = remove the provider prefix (e.g. orproxy/stepfun/x → stepfun/x)
# "remap" = apply specific ID transformations

PROVIDER_STRIP = {"orproxy", "opencode-go"}

# PinchBench model ID → OpenRouter model ID (for non-obvious mappings)
MANUAL_MAP = {
    "anthropic/claude-opus-4-6": "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
    "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4.5",
    "openai-codex/gpt-5.2": "openai/gpt-5.2",
    "openai-codex/gpt-5.4": "openai/gpt-5.4",
    "openai-codex/gpt-5.4-mini": "openai/gpt-5.4-mini",
    "xai/grok-4.20-beta-0309-non-reasoning": "x-ai/grok-4.1-fast",
    "arcee-ai/trinity-large-thinking": "arcee-ai/trinity-large-thinking",
    "minimax-portal/MiniMax-M2.1": "minimax/minimax-m2.1",
    "minimax-portal/MiniMax-M2.5": "minimax/minimax-m2.5",
}

# Providers whose entries should never be mapped (local/custom runs)
SKIP_PROVIDERS = {
    "vllm", "ollama", "lmstudio", "local", "local-qwen", "omlx",
    "custom", "custom-api-shubiaobiao-cn", "custom-dashscope-aliyuncs-com",
    "custom-app-onerouter-pro", "custom-10-0-1-30-8050",
    "agnes", "aiping", "JoePro", "Jobeous_II", "jobeous",
    "coding-plan", "sapiens-ai", "agens", "cliproxyapi",
    "cm", "tierflow", "s1max", "modelstudio", "kiwiar",
    "ark-test", "ark_seed2pro", "bailian",
}

# Models to exclude even if they exist on OpenRouter (meta-routers, etc.)
EXCLUDE_MODELS = {"openrouter/auto"}

# Uncertain mappings — model exists on OpenRouter but the PinchBench entry
# might not be the same thing (different config, fine-tune, etc.)
UNCERTAIN_MAP = {
    "bytedance/seed2.0-pro": "bytedance-seed/seed-2.0-pro",
    "zai/pony-alpha-2": None,  # not on OpenRouter
    "google/gemini-3-flash-preview": "google/gemini-3-flash-preview",
}


def fetch_json(url: str) -> dict:
    """Fetch JSON from a URL using curl."""
    result = subprocess.run(
        ["curl", "-s", url], capture_output=True, text=True, check=True
    )
    return json.loads(result.stdout)


def fetch_pinchbench() -> List[dict]:
    """Fetch all PinchBench leaderboard entries."""
    data = fetch_json("https://api.pinchbench.com/api/leaderboard?limit=300")
    return data.get("leaderboard", [])


def fetch_openrouter_models() -> Dict[str, dict]:
    """Fetch OpenRouter models, return dict keyed by model ID."""
    data = fetch_json("https://openrouter.ai/api/v1/models")
    return {m["id"]: m for m in data.get("data", [])}


def map_to_openrouter(entry: dict) -> Tuple[Optional[str], str]:
    """
    Map a PinchBench entry to an OpenRouter model ID.
    Returns (openrouter_id_or_None, confidence) where confidence is
    'direct', 'mapped', 'uncertain', or 'skip'.
    """
    model = entry["model"]
    provider = entry["provider"]

    # Tier 1: direct OpenRouter entries
    if provider == "openrouter":
        if model in EXCLUDE_MODELS:
            return None, "skip"
        return model, "direct"

    # Skip known non-mappable providers
    if provider in SKIP_PROVIDERS:
        return None, "skip"

    # Check manual map first
    if model in MANUAL_MAP:
        return MANUAL_MAP[model], "mapped"

    # Check uncertain map
    if model in UNCERTAIN_MAP:
        return UNCERTAIN_MAP[model], "uncertain"

    # Strip-prefix providers (orproxy/X/Y → X/Y, opencode-go/X → X)
    if provider in PROVIDER_STRIP:
        stripped = model.split("/", 1)[1] if "/" in model else model
        return stripped, "mapped"

    # Provider is 'anthropic', 'xai', 'arcee-ai' etc. — try the model ID as-is
    if provider in ("anthropic", "xai", "arcee-ai", "google", "nvidia", "qwen",
                     "bytedance", "aliyun"):
        return model, "mapped"

    # Unknown provider — skip
    return None, "skip"


def format_price(pricing: dict, key: str) -> str:
    """Format price per million tokens from OpenRouter pricing."""
    if not pricing:
        return "—"
    val = pricing.get(key)
    if not val:
        return "—"
    try:
        per_million = float(val) * 1_000_000
        if per_million == 0:
            return "Free"
        if per_million < 0:
            return "—"
        return f"${per_million:.2f}"
    except (ValueError, TypeError):
        return "—"


def main():
    show_uncertain = "--uncertain" in sys.argv

    print("Fetching PinchBench leaderboard...")
    pinch_entries = fetch_pinchbench()
    print(f"  {len(pinch_entries)} entries")

    print("Fetching OpenRouter models...")
    or_models = fetch_openrouter_models()
    print(f"  {len(or_models)} models")

    # Map PinchBench → OpenRouter
    mapped = []       # (openrouter_id, best%, avg%, confidence, pinch_model, submissions)
    uncertain = []    # entries where mapping is uncertain
    unmapped = []     # entries we couldn't map

    for entry in pinch_entries:
        or_id, confidence = map_to_openrouter(entry)

        if or_id is None or confidence == "skip":
            unmapped.append(entry)
            continue

        # Validate against OpenRouter API
        if or_id not in or_models:
            # Try common variations
            found = False
            for variant in [or_id.lower(), or_id.replace("-", ".")]:
                if variant in or_models:
                    or_id = variant
                    found = True
                    break
            if not found:
                unmapped.append(entry)
                continue

        best = entry["best_score_percentage"] * 100
        avg = entry["average_score_percentage"] * 100
        subs = entry.get("submission_count", 0)

        if confidence == "uncertain":
            uncertain.append((or_id, best, avg, entry["model"], subs))
        else:
            mapped.append((or_id, best, avg, confidence, entry["model"], subs))

    # Deduplicate: when multiple PinchBench entries map to the same OpenRouter ID,
    # keep the one with the most submissions (more reliable average)
    best_by_id: Dict[str, tuple] = {}
    for or_id, best, avg, conf, pinch_model, subs in mapped:
        if or_id not in best_by_id or subs > best_by_id[or_id][5]:
            best_by_id[or_id] = (or_id, best, avg, conf, pinch_model, subs)

    # Sort by avg descending, take top 50
    ranked = sorted(best_by_id.values(), key=lambda x: x[2], reverse=True)[:50]

    # Print summary
    print(f"\nMapped: {len(best_by_id)} unique OpenRouter models")
    print(f"Uncertain: {len(uncertain)}")
    print(f"Unmapped/skipped: {len(unmapped)}")

    # Generate markdown
    now = datetime.now(timezone.utc).strftime("%d %B %Y")
    lines = []
    lines.append("# OpenRouter Top 50 Models")
    lines.append("")
    lines.append("## Overview")
    lines.append("")
    lines.append("Top 50 AI models available through OpenRouter, ranked by average")
    lines.append("PinchBench score. Combines benchmark results with current pricing.")
    lines.append("")
    lines.append("## Data Sources")
    lines.append("")
    lines.append("- **Benchmark**: [PinchBench](https://pinchbench.com/?score=average)")
    lines.append("  — [23 tasks](https://pinchbench.com/about) across different categories")
    lines.append("- **Pricing**: [OpenRouter API](https://openrouter.ai/models)")
    lines.append(f"- **Generated**: {now}")
    lines.append("")
    lines.append("### Methodology")
    lines.append("")
    lines.append("PinchBench entries from the `openrouter` provider are used directly.")
    lines.append("Entries from other providers (e.g. `anthropic`, `openai-codex`, `xai`)")
    lines.append("are mapped to their OpenRouter equivalents when the model exists on")
    lines.append("OpenRouter. When multiple entries map to the same model, the entry with")
    lines.append("the most submissions is used. Models not available on OpenRouter are excluded.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Model Rankings & Costs")
    lines.append("")
    lines.append("| Rank | Model ID | Best % | Avg % | Input ($/M) | Output ($/M) | Source |")
    lines.append("|------|----------|--------|-------|-------------|--------------|--------|")

    for i, (or_id, best, avg, conf, pinch_model, subs) in enumerate(ranked, 1):
        or_data = or_models.get(or_id, {})
        pricing = or_data.get("pricing", {})
        input_p = format_price(pricing, "prompt")
        output_p = format_price(pricing, "completion")
        source = "direct" if conf == "direct" else "mapped"
        lines.append(
            f"| {i} | {or_id} | {best:.1f}% | {avg:.1f}% | {input_p} | {output_p} | {source} |"
        )

    # Recommendations
    if ranked:
        lines.append("")
        lines.append("---")
        lines.append("")
        lines.append("## Quick Picks")
        lines.append("")

        # Best overall (highest avg)
        top = ranked[0]
        lines.append(f"- **Best overall**: `{top[0]}` — {top[2]:.1f}% avg")

        # Best free
        free = [(r[0], r[2]) for r in ranked
                if format_price(or_models.get(r[0], {}).get("pricing", {}), "prompt") == "Free"]
        if free:
            lines.append(f"- **Best free**: `{free[0][0]}` — {free[0][1]:.1f}% avg")

        # Best value (avg/cost ratio, skip free)
        value = []
        for r in ranked:
            p = or_models.get(r[0], {}).get("pricing", {})
            try:
                cost = float(p.get("prompt", 0)) * 1_000_000
                if cost > 0:
                    value.append((r[0], r[2], cost))
            except (TypeError, ValueError):
                pass
        if value:
            value.sort(key=lambda x: x[1] / x[2], reverse=True)
            v = value[0]
            lines.append(f"- **Best value**: `{v[0]}` — {v[1]:.1f}% avg, ${v[2]:.2f}/M input")

    # Uncertain mappings
    if uncertain and show_uncertain:
        lines.append("")
        lines.append("---")
        lines.append("")
        lines.append("## Uncertain Mappings")
        lines.append("")
        lines.append("These PinchBench entries may correspond to OpenRouter models but the")
        lines.append("mapping is uncertain (different provider, possibly different config):")
        lines.append("")
        lines.append("| PinchBench Model | Possible OpenRouter ID | Avg % |")
        lines.append("|------------------|----------------------|-------|")
        for or_id, best, avg, pinch_model, subs in sorted(uncertain, key=lambda x: x[2], reverse=True):
            lines.append(f"| {pinch_model} | {or_id} | {avg:.1f}% |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append("- Prices in USD per million tokens")
    lines.append("- \"Source: direct\" = PinchBench run used OpenRouter; \"mapped\" = run used")
    lines.append("  another provider but the model is available on OpenRouter")
    lines.append("- Free models may have usage limits")
    lines.append("- All models available via [OpenRouter](https://openrouter.ai)")
    lines.append("")

    md = "\n".join(lines)

    # Write files
    with open("TOP_50_MODELS.md", "w") as f:
        f.write(md)
    print(f"\n✓ Written TOP_50_MODELS.md ({len(ranked)} models)")

    # Also save raw data
    with open("pinchbench-leaderboard.json", "w") as f:
        json.dump(pinch_entries, f, indent=2)
    print("✓ Saved pinchbench-leaderboard.json")

    # Print uncertain mappings to stderr
    if uncertain:
        print(f"\n⚠ {len(uncertain)} uncertain mappings:", file=sys.stderr)
        for or_id, best, avg, pinch_model, subs in sorted(uncertain, key=lambda x: x[2], reverse=True):
            print(f"  {pinch_model:<50} → {or_id:<40} Avg: {avg:.1f}%", file=sys.stderr)

    # Print top 10 to stdout
    print(f"\nTop 10:")
    for i, (or_id, best, avg, conf, pinch_model, subs) in enumerate(ranked[:10], 1):
        flag = " *" if conf != "direct" else ""
        print(f"  {i:2d}. {or_id:<45} Avg: {avg:.1f}%  Best: {best:.1f}%{flag}")


if __name__ == "__main__":
    main()
