# OpenClaw Security Hardening Options

> **Disclaimer**
>
> 1. This guide is provided on a **best-effort basis** and is not guaranteed to be exhaustive. Security is a moving target — new vulnerabilities and attack vectors emerge regularly.
> 2. This document is **AI-generated**, compiled using AI tools from various web resources, community guides, and the author's own experience. It has not been formally audited or tested in a production environment.
> 3. **When in doubt, consult the official sources.** OpenClaw has a dedicated security team with experts vetting their guidance. Start here:
>     - [OpenClaw Gateway Security Docs](https://docs.openclaw.ai/gateway/security) — official threat models and hardening guidance
>     - [OpenClaw Security in Public](https://openclaw.ai/blog/openclaw-security-in-public) — the team's security philosophy and expert-vetted practices
>
> Always consult a qualified security professional for production deployments handling sensitive data.

---

## TL;DR

**What you need to know:** OpenClaw is a powerful AI agent that runs on your own machine. Unlike cloud chatbots, it can execute commands, read your files, send emails, and call APIs — which means a misconfigured instance can be exploited to steal your data. Over 42,000 OpenClaw instances have been found exposed on the public internet, most without proper authentication.

**The core risk:** If your agent can access private data, process untrusted content (web pages, emails), and communicate externally (send messages, make HTTP requests), an attacker can trick it into exfiltrating your data via prompt injection. This is not theoretical — it has been demonstrated against major AI products repeatedly.

**If you're setting up OpenClaw, do at least these five things:**

1. **Run `openclaw security audit --deep --fix`** on every deployment
2. **Never expose the gateway to the internet** — bind to `127.0.0.1` and access via secure tunnel (SSM, VPN)
3. **Enable sandboxing** — set `sandbox.mode: "non-main"` and shell command approval to `deny`
4. **Limit what tools the agent can use** — wrap email, calendar, and shell tools with rate limits and audit logging (see Part III)
5. **Vet every skill before installing** — scan for malicious patterns, pin versions, and only install from trusted sources

For the principles behind these recommendations, see [Guiding Principles](#guiding-principles). For implementation details, read on.

---

## Guiding Principles

These principles are general and apply to AI agent tools broadly, not just OpenClaw. If a tool can access your data, process external content, and communicate outward, these apply.

### The Lethal Trifecta

An AI agent becomes exploitable when it combines three capabilities ([Simon Willison, 2025](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)):

1. **Access to private data** — reading emails, files, calendars, databases, credentials
2. **Exposure to untrusted content** — processing web pages, incoming emails, user-uploaded documents, chat messages from external channels
3. **Ability to externally communicate** — sending emails, making HTTP requests, posting to messaging channels, or even rendering a clickable link

When all three are present, an attacker can craft a prompt injection (e.g., hidden instructions in a web page or email) that causes the agent to read your private data and exfiltrate it — without any user interaction. This has been demonstrated against Microsoft 365 Copilot, GitHub Copilot Chat, Slack AI, Google NotebookLM, and many others.

**The only reliable defense is to avoid combining all three.** Where that's not possible, constrain each leg as tightly as you can.

### Sandbox by Default

Never run an AI agent with unrestricted shell access or host-level exec permissions. Default to the most restrictive sandbox mode available and only relax it for specific, justified use cases. This applies to OpenClaw's `sandbox.mode`, Claude Code's permissions model, and any tool that offers execution tiers.

### Least Privilege for Tools

Only enable the tools each agent actually needs. If an agent's job is to summarize documents, it doesn't need `send_email`, `exec_command`, or `http_post`. Require human confirmation for any destructive or irreversible action (delete, send, execute).

### Protect Credential Stores

AI agents should never have read access to:
- `~/.ssh/` (SSH private keys)
- `~/.aws/credentials` and `~/.aws/config` (AWS access keys)
- `~/.config/gcloud/` (GCP credentials)
- `~/.env`, `.env` files, or any file containing API keys
- OS keychains or password managers
- Browser profile directories (cookies, saved passwords)

Block these paths in shell wrappers, filesystem sandboxes, or tool-level deny lists. If an agent needs to call an AWS API, pass credentials via scoped environment variables or IAM roles — never let it read the credential file directly.

### Supply Chain Vigilance

Every skill, plugin, or MCP server is third-party code running with your agent's permissions. Pin versions, review source code before install, and scan for known malicious patterns. This applies equally to OpenClaw skills, VS Code extensions, npm packages, and MCP servers.

### Monitor and Audit

Assume the agent will eventually do something unexpected. Log every tool invocation, rate-limit destructive actions, and set up alerts for anomalies. Nightly automated audits catch drift before it becomes a breach.

### No Guardrail Is 100% Reliable

Guardrails are a valuable defense-in-depth layer, but they cannot be guaranteed to prevent 100% of attacks — an attacker only needs to get through once. System prompt instructions are soft guidance only. **Hard enforcement comes from tool policy, exec approvals, sandboxing, and network controls.**

Managed guardrail services like [Amazon Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html) can filter harmful content, block denied topics, redact PII, and detect hallucinations at the API level. Open-source options like [NVIDIA NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails) provide programmable rails you can self-host and customize. These are worth enabling alongside the structural controls in this document.

---

## Part I: First Steps

### 1. Quick Security Audit

Run these before anything else on any OpenClaw deployment:

```bash
openclaw security audit --deep
openclaw security audit --fix
openclaw doctor
```

### Threat Landscape

The primary risks map directly to the [Lethal Trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) — most attacks require the agent to have access to private data, exposure to untrusted content, and the ability to externally communicate:

| Threat | Example | Impact |
|---|---|---|
| **Prompt injection** | Malicious content in a fetched webpage instructs the agent to forward emails | Data exfiltration, unauthorized actions |
| **Tool misuse (autonomous)** | Agent decides to "clean up" by deleting old calendar events | Mass data loss |
| **Skill supply chain** | A community skill contains a backdoor shell command | Arbitrary code execution |
| **Credential leakage** | Agent echoes API keys from `.env` files in chat responses | Secret exposure |
| **Unbounded automation** | Cron job triggers agent loop that sends thousands of API calls | Cost explosion, account suspension |
| **Gateway WebSocket hijacking** | CSRF via WebSocket origin bypass (CVSS 8.8) | Unauthorized remote control of agent |
| **Sandbox escape** | Dynamic imports bypass skill sandbox (CVSS 9.1) | Full system compromise |
| **Unauthenticated gateway access** | No auth on exposed gateway port (CVSS 7.5) | Anyone can issue commands to your agent |
| **Supply chain injection** | Malicious package impersonating a legitimate tool steals credentials and SSH keys (e.g., GhostClaw, March 2026) | Full credential compromise; may require system re-image |

### 2. Gateway and Network Lockdown

Lock down the gateway and network perimeter before configuring anything else.

#### Bind to Localhost

OpenClaw should never listen on `0.0.0.0`:

```yaml
# ~/.openclaw/config.yaml
gateway:
  host: 127.0.0.1   # NOT 0.0.0.0
  port: 18789
```

#### Firewall

The general principle: deny all inbound traffic by default, then allowlist only the ports you need. Do not expose the OpenClaw gateway port to the internet. Access it only via a secure tunnel (e.g., AWS SSM port forwarding, VPN, or SSH tunnel).

On Linux systems, UFW is a common choice — see [Appendix B](#appendix-b-ec2-and-linux-specific-hardening) for specific commands.

#### Gateway Token Security

The gateway token may be displayed in plaintext in the OpenClaw dashboard. Rotate it regularly and never expose the dashboard to the internet.

#### Cloud Metadata Access

If running on a cloud VM (EC2, GCE, etc.), ensure the instance metadata endpoint is locked down so the agent cannot access cloud credentials. See [Appendix B](#appendix-b-ec2-and-linux-specific-hardening) for EC2-specific commands.

---

## Part II: Runtime Controls

### 3. Sandbox and Exec Policy

These are the most critical settings in OpenClaw. Some default configurations ship with `exec host policy: gateway` and `shell command approval: allow`, which eliminates all isolation.

```yaml
# ~/.openclaw/config.yaml — REQUIRED hardening
sandbox:
  mode: "non-main"   # or "all" for stricter isolation

tools:
  allow:
    - read_file
    - write_file
    # Explicitly list only what's needed
  deny:
    - exec_command   # unless absolutely required
    - shell

approvals:
  require_for:
    - exec_command
    - delete_file
    - send_email
    - http_post
```

> **Critical:** Keep exec policy on `sandbox`; set shell command approval to `deny` or require explicit human confirmation. Never use `allow` in production.

### 4. Outbound Communication Controls

Per the [Lethal Trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) framework, any tool that can make an HTTP request — to an API, to load an image, or even to provide a clickable link — can be used to exfiltrate stolen data. These controls constrain the external communication leg.

| Control | Implementation |
|---|---|
| **URL allowlist** | Only permit fetches to known domains; block `169.254.169.254` (EC2 metadata), `localhost`, and private IP ranges |
| **Egress firewall** | Use security groups or iptables to restrict outbound traffic from the agent host |
| **API rate limits** | Configure provider-level rate limits to prevent cost explosion |
| **Disable unused channels** | If the agent doesn't need Telegram/WeChat/Slack, disable those channels entirely |

#### Disable Link Previews (Prompt Injection via Messaging Channels)

This is a direct instance of the [Lethal Trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) exfiltration pattern. When OpenClaw is connected to Telegram, Slack, etc., those apps auto-fetch URL previews — no user interaction required. A prompt injection that tricks the agent into outputting an attacker-controlled URL with appended sensitive data will silently exfiltrate it via the preview request. Disabling link previews breaks the external communication leg.

```json
{
  "channels": {
    "telegram": {
      "linkPreview": false
    }
  }
}
```

Apply the equivalent setting for any messaging channel that supports link previews.

---

## Part III: Tool Safeguards (CLI Wrappers)

When an agent has direct access to a tool's underlying API, a single hallucinated or injected tool call can cause irreversible damage. Wrapping tools in CLI scripts creates a **chokepoint** where you enforce rate limits, domain allowlists, destructive action blocking, and audit logging. Each wrapper below breaks one or more legs of the [Lethal Trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/).

> **Note:** The scripts below illustrate the **principle**, not production-ready code. They have not been audited or security-vetted. The specific tool names (e.g., `openclaw tool email`, `openclaw tool calendar`) may vary depending on your setup — adapt the wrapper pattern to whatever email, calendar, or shell tool your agent uses.

### 5. Skill Execution Wrapper

Create a wrapper script that the agent calls instead of raw skill execution:

```bash
#!/bin/bash
# /usr/local/bin/openclaw-skill-run
# Wrapper for agent skill execution with safety checks

SKILL_NAME="$1"
ACTION="$2"
shift 2

LOG_FILE="$HOME/.openclaw/audit/skill-$(date +%Y%m%d).log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Iseconds)] SKILL=$SKILL_NAME ACTION=$ACTION ARGS=$*" >> "$LOG_FILE"

DESTRUCTIVE_ACTIONS="delete remove purge drop reset"
for word in $DESTRUCTIVE_ACTIONS; do
  if [[ "$ACTION" == *"$word"* ]]; then
    echo "BLOCKED: Destructive action '$ACTION' requires manual approval."
    echo "[$(date -Iseconds)] BLOCKED SKILL=$SKILL_NAME ACTION=$ACTION" >> "$LOG_FILE"
    exit 1
  fi
done

openclaw skill run "$SKILL_NAME" "$ACTION" "$@"
```

Configure OpenClaw to use it:

```yaml
# ~/.openclaw/config.yaml
skills:
  executor: /usr/local/bin/openclaw-skill-run
```

### 6. Email Wrapper

Email is a textbook [Lethal Trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) in a single tool: it provides access to private data (your inbox), exposure to untrusted content (anyone can email your agent), and the ability to externally communicate (send/forward). As Willison notes: *"an attacker can literally email your LLM and tell it what to do."*

### CLI Wrapper for Email Operations

```bash
#!/bin/bash
# /usr/local/bin/openclaw-email
# Safe email CLI wrapper with rate limits and destructive action blocking

ACTION="$1"
shift

LOG_FILE="$HOME/.openclaw/audit/email-$(date +%Y%m%d).log"
RATE_FILE="$HOME/.openclaw/audit/email-rate-$(date +%Y%m%d)"
mkdir -p "$(dirname "$LOG_FILE")"

# --- Rate limiting ---
MAX_SENDS_PER_DAY=20
MAX_DELETES_PER_DAY=5

increment_counter() {
  local key="$1" max="$2"
  local count
  count=$(grep -c "^$key$" "$RATE_FILE" 2>/dev/null || echo 0)
  if [ "$count" -ge "$max" ]; then
    echo "RATE LIMITED: $key has reached daily limit ($max). Try again tomorrow."
    echo "[$(date -Iseconds)] RATE_LIMITED action=$key count=$count" >> "$LOG_FILE"
    exit 1
  fi
  echo "$key" >> "$RATE_FILE"
}

# --- Action routing ---
case "$ACTION" in
  send|reply|forward)
    increment_counter "send" $MAX_SENDS_PER_DAY

    # Block external forwarding unless allowlisted
    if [[ "$ACTION" == "forward" ]]; then
      RECIPIENT="$1"
      ALLOWED_DOMAINS="@yourcompany.com @partner.com"
      ALLOWED=false
      for domain in $ALLOWED_DOMAINS; do
        [[ "$RECIPIENT" == *"$domain" ]] && ALLOWED=true
      done
      if [ "$ALLOWED" = false ]; then
        echo "BLOCKED: Forwarding to external address '$RECIPIENT' is not allowed."
        echo "[$(date -Iseconds)] BLOCKED forward to=$RECIPIENT" >> "$LOG_FILE"
        exit 1
      fi
    fi

    echo "[$(date -Iseconds)] EMAIL action=$ACTION to=$1" >> "$LOG_FILE"
    ;;

  delete|purge)
    increment_counter "delete" $MAX_DELETES_PER_DAY
    echo "WARNING: Deleting email. This action is logged and rate-limited."
    echo "[$(date -Iseconds)] EMAIL action=$ACTION id=$1" >> "$LOG_FILE"
    ;;

  read|search|list)
    echo "[$(date -Iseconds)] EMAIL action=$ACTION" >> "$LOG_FILE"
    ;;

  *)
    echo "Unknown email action: $ACTION"
    exit 1
    ;;
esac

# Pass through to actual email tool
openclaw tool email "$ACTION" "$@"
```

### Key Protections

| Protection | What it prevents |
|---|---|
| **Send rate limit** (20/day) | Mass spam or phishing from a compromised agent |
| **Delete rate limit** (5/day) | Mass email deletion |
| **Forward domain allowlist** | Data exfiltration via email forwarding |
| **Audit logging** | Forensic trail for all email operations |

---

### 7. Calendar Wrapper

Calendar manipulation can disrupt operations — mass-deleting meetings, creating fake events to social-engineer attendees, or reading private entries for reconnaissance.

### CLI Wrapper for Calendar Operations

```bash
#!/bin/bash
# /usr/local/bin/openclaw-calendar
# Safe calendar CLI wrapper

ACTION="$1"
shift

LOG_FILE="$HOME/.openclaw/audit/calendar-$(date +%Y%m%d).log"
RATE_FILE="$HOME/.openclaw/audit/calendar-rate-$(date +%Y%m%d)"
mkdir -p "$(dirname "$LOG_FILE")"

MAX_CREATES_PER_DAY=10
MAX_DELETES_PER_DAY=3
MAX_UPDATES_PER_DAY=15

increment_counter() {
  local key="$1" max="$2"
  local count
  count=$(grep -c "^$key$" "$RATE_FILE" 2>/dev/null || echo 0)
  if [ "$count" -ge "$max" ]; then
    echo "RATE LIMITED: $key has reached daily limit ($max)."
    echo "[$(date -Iseconds)] RATE_LIMITED action=$key count=$count" >> "$LOG_FILE"
    exit 1
  fi
  echo "$key" >> "$RATE_FILE"
}

case "$ACTION" in
  create)
    increment_counter "create" $MAX_CREATES_PER_DAY
    echo "[$(date -Iseconds)] CALENDAR create $*" >> "$LOG_FILE"
    ;;

  delete)
    increment_counter "delete" $MAX_DELETES_PER_DAY
    echo "[$(date -Iseconds)] CALENDAR delete $*" >> "$LOG_FILE"
    ;;

  update)
    increment_counter "update" $MAX_UPDATES_PER_DAY
    echo "[$(date -Iseconds)] CALENDAR update $*" >> "$LOG_FILE"
    ;;

  read|list|search|availability)
    echo "[$(date -Iseconds)] CALENDAR $ACTION" >> "$LOG_FILE"
    ;;

  *)
    echo "Unknown calendar action: $ACTION"
    exit 1
    ;;
esac

openclaw tool calendar "$ACTION" "$@"
```

---

### 8. Shell Wrapper

Shell access is the most dangerous tool an agent can have. If you must enable it (after configuring the sandbox policy in Section 3), use a command allowlist:

### Allowlist Approach

Create a restricted shell wrapper that only permits pre-approved commands:

```bash
#!/bin/bash
# /usr/local/bin/openclaw-shell
# Restricted shell for agent use

COMMAND="$1"
shift

ALLOWED_COMMANDS="ls cat head tail grep wc find file date whoami pwd df du"
LOG_FILE="$HOME/.openclaw/audit/shell-$(date +%Y%m%d).log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Iseconds)] SHELL command=$COMMAND args=$*" >> "$LOG_FILE"

# Check allowlist
ALLOWED=false
for cmd in $ALLOWED_COMMANDS; do
  [[ "$COMMAND" == "$cmd" ]] && ALLOWED=true
done

if [ "$ALLOWED" = false ]; then
  echo "BLOCKED: '$COMMAND' is not in the allowed command list."
  echo "[$(date -Iseconds)] BLOCKED command=$COMMAND" >> "$LOG_FILE"
  exit 1
fi

# Block path traversal and sensitive file access
for arg in "$@"; do
  if [[ "$arg" == *".env"* ]] || [[ "$arg" == *"credentials"* ]] || \
     [[ "$arg" == *"private"* ]] || [[ "$arg" == *".ssh"* ]] || \
     [[ "$arg" == *".aws"* ]]; then
    echo "BLOCKED: Access to sensitive path '$arg' is not allowed."
    echo "[$(date -Iseconds)] BLOCKED sensitive_path=$arg" >> "$LOG_FILE"
    exit 1
  fi
done

$COMMAND "$@"
```

### Deny by Default

If the agent doesn't need shell access, disable it entirely in the agent config:

```yaml
# ~/.openclaw/config.yaml
tools:
  shell:
    enabled: false
```

---

## Part IV: Supply Chain and Credentials

### 9. Skill Supply Chain Security

Community skills are code that runs with your agent's permissions. Treat them like third-party dependencies.

### Mitigations

| Practice | Implementation |
|---|---|
| **Pin skill versions** | Use exact commit hashes or version tags, not `latest` |
| **Review before install** | Read the skill's source code — especially any shell commands, HTTP calls, or file writes |
| **Isolate skill directories** | Run skills in a sandboxed directory with no access to `~/.ssh`, `~/.aws`, or `.env` files |
| **Audit installed skills** | Periodically run `openclaw skill list` and remove unused skills |
| **Disable auto-install** | Disable automatic skill installation in your OpenClaw config or GUI settings |

### Skill Directory Permissions

```bash
# Restrict the skills directory so skills can't write outside it
chmod 700 ~/.openclaw/skills
# Make individual skill dirs read-only after install
find ~/.openclaw/skills -type d -name "node_modules" -prune -o -type f -print | \
  xargs chmod 444
```

### Scan Installed Skills for Malicious Patterns

The [`awesome-openclaw-security`](https://github.com/munnam77/awesome-openclaw-security) scanner detects `eval`/`exec` calls, `subprocess`/`os.system` usage, outbound HTTP, dynamic imports, and reverse shell indicators:

```bash
python3 scanner/scan.py --path ~/.openclaw/skills/
```

> **Warning**: SecurityWeek reporting found ~800 malicious skills in ClawHub (~20% of the registry as of early 2026). Only install skills from the [official registry](https://github.com/anthropics/skills/tree/main/skills) or after manual source review.

### Recognizing Supply Chain Attacks

Supply chain attacks against AI tools are an emerging and growing threat. Common red flags to watch for in any skill, plugin, or package:

- `postinstall` hooks that install binaries globally or modify shell config files
- Fake CLI installer UIs or prompts for admin/system passwords
- Encrypted payloads fetched from unknown domains at install time
- Package names that closely mimic official tools (typosquatting)

**Prevention:** Only install from official sources. Verify package names and publishers carefully. Treat any package exhibiting the above behaviors as malicious.

**Example — GhostClaw (March 2026):** A rogue npm package (`@openclaw-ai/openclawai`) impersonated the official OpenClaw CLI and deployed a multi-stage RAT that stole system credentials, browser data, SSH keys, and cloud API keys. If compromised by a similar attack: remove the malicious package, check shell config files for injected hooks, rotate all credentials immediately, and consider a full system re-image. See the [GhostClaw report](https://cybersecuritynews.com/ghostclaw-mimic-as-openclaw/) for details.

---

### 10. Credential and Secret Protection

### Rules

1. **Never store API keys in agent config files.** Use environment variables or a secrets manager.
2. **Use OS keychain** where available for storing provider API keys.
3. **Restrict `.env` file permissions:**
   ```bash
   chmod 600 ~/.openclaw/.env
   ```
4. **Block agent access to secret files** via the shell wrapper (Section 5) or filesystem sandboxing.
5. **Rotate API keys** if you suspect an agent has been compromised or has echoed credentials in chat.

### Detecting Credential Leakage

Add a post-processing hook that scans agent responses for patterns that look like secrets:

```bash
#!/bin/bash
# /usr/local/bin/openclaw-output-filter
# Scan agent output for leaked secrets

INPUT=$(cat)

# Patterns that suggest leaked credentials
PATTERNS=(
  'AKIA[0-9A-Z]{16}'          # AWS Access Key
  'sk-[a-zA-Z0-9]{48}'        # OpenAI API Key
  'sk-ant-[a-zA-Z0-9-]{80,}'  # Anthropic API Key
  'ghp_[a-zA-Z0-9]{36}'       # GitHub PAT
  'xoxb-[0-9]+-[a-zA-Z0-9]+' # Slack Bot Token
)

for pattern in "${PATTERNS[@]}"; do
  if echo "$INPUT" | grep -qE "$pattern"; then
    echo "[REDACTED — potential credential detected in agent output]"
    echo "[$(date -Iseconds)] CREDENTIAL_LEAK pattern=$pattern" >> \
      "$HOME/.openclaw/audit/security-$(date +%Y%m%d).log"
    exit 0
  fi
done

echo "$INPUT"
```

---

## Part V: Automation and Monitoring

### 11. Cron Job and Automation Guardrails

Scheduled agent tasks (cron jobs) run unattended, making them high-risk for runaway loops.

### Mitigations

| Guard | Implementation |
|---|---|
| **Max execution time** | Set `timeout: 300` (5 min) per cron job in the cron config |
| **Max tool calls per run** | Limit to 20–30 tool calls per cron execution |
| **Cost ceiling** | Track token usage per cron job; alert or kill if it exceeds threshold |
| **Idempotency** | Design cron tasks to be safe to re-run (no duplicate sends, no double-deletes) |
| **Dead man's switch** | If a cron job fails 3 times consecutively, auto-disable it and notify the owner |

### Example Cron Config with Guards

```json
{
  "name": "daily-summary",
  "schedule": "0 9 * * 1-5",
  "max_turns": 20,
  "timeout_seconds": 300,
  "on_failure": "pause_after_3"
}
```

---

### 12. Audit and Monitoring

All the wrappers above write to `~/.openclaw/audit/`. Set up basic monitoring:

```bash
# Daily audit summary (add to crontab)
0 18 * * * echo "=== OpenClaw Audit $(date +%Y-%m-%d) ===" && \
  echo "Emails sent: $(grep -c 'action=send' ~/.openclaw/audit/email-$(date +%Y%m%d).log 2>/dev/null || echo 0)" && \
  echo "Emails deleted: $(grep -c 'action=delete' ~/.openclaw/audit/email-$(date +%Y%m%d).log 2>/dev/null || echo 0)" && \
  echo "Calendar deletes: $(grep -c 'CALENDAR delete' ~/.openclaw/audit/calendar-$(date +%Y%m%d).log 2>/dev/null || echo 0)" && \
  echo "Blocked actions: $(grep -c 'BLOCKED' ~/.openclaw/audit/*-$(date +%Y%m%d).log 2>/dev/null || echo 0)" && \
  echo "Credential leaks: $(grep -c 'CREDENTIAL_LEAK' ~/.openclaw/audit/security-$(date +%Y%m%d).log 2>/dev/null || echo 0)"
```

### What to Alert On

- Any `BLOCKED` entry in audit logs (agent attempted something dangerous)
- Any `CREDENTIAL_LEAK` detection
- Any `RATE_LIMITED` hit (agent is being unusually active)
- Cron job failures exceeding threshold

### Maintenance Schedule

| Frequency | Task |
|---|---|
| **Daily** | Scan logs for anomalies; check for unexpected outbound connections |
| **Weekly** | `openclaw update`; apply OS security patches (`sudo apt update && sudo apt upgrade -y`) |
| **Monthly** | Rotate API keys; re-audit installed skills; review tool allowlists |
| **On-demand** | Run `openclaw security audit --deep` after any skill install or config change |

### Nightly Automated Audit

```bash
# Add to crontab
0 2 * * * openclaw security audit --deep >> /var/log/openclaw-audit.log 2>&1
```

### Backup

```bash
# Backup OpenClaw state nightly
0 3 * * * tar -czf ~/backups/openclaw-$(date +\%F).tar.gz ~/.openclaw/
```

Store backups off-instance (S3, etc.) and test restores periodically.

---

## Quick Reference: Defense-in-Depth Checklist

| Layer | Control | Status |
|---|---|---|
| **Quick audit** | Run `openclaw security audit --deep --fix` | ☐ |
| **Gateway** | Bind to `127.0.0.1`, rotate token, enforce `ALLOWED_ORIGINS` | ☐ |
| **Sandbox/Exec** | `sandbox.mode: non-main`, shell approval: `deny` | ☐ |
| **Firewall** | UFW deny incoming; no gateway port exposed | ☐ |
| **Skills** | CLI wrapper with destructive action blocking | ☐ |
| **Email** | Rate limits, forward allowlist, audit log | ☐ |
| **Calendar** | Rate limits on create/delete/update, audit log | ☐ |
| **Shell** | Command allowlist, sensitive path blocking | ☐ |
| **Credentials** | OS keychain, `.env` permissions, output scanning | ☐ |
| **Skills supply chain** | Version pinning, source review, scanner, directory isolation | ☐ |
| **Cron/automation** | Timeouts, max tool calls, failure circuit breaker | ☐ |
| **Network** | URL allowlist, SSRF blocking, IMDSv2, link preview disabled | ☐ |
| **Monitoring** | Daily audit summary, nightly `--deep` scan, alerting | ☐ |
| **Backups** | Nightly `~/.openclaw` backup to off-instance storage | ☐ |

---

## Appendix A: SlowMist 3-Tier Defense Matrix

Based on the [SlowMist OpenClaw Security Practice Guide](https://github.com/slowmist/openclaw-security-practice-guide):

**Tier 1 — Pre-Action (Supply Chain):** Behavioral blacklists for known-bad skill patterns. Verify fingerprint/hash of every skill before activation. Never install from unverified sources.

**Tier 2 — In-Action (Runtime):** Permission narrowing during sensitive operations. Cross-skill preflight verification before tool chaining. Red-line commands (destructive/irreversible) require human confirmation. Yellow-line commands (moderate risk) proceed with audit logging.

**Tier 3 — Post-Action (Detection):** Nightly automated audits across 13 core security metrics. Anomaly alerts for unexpected tool calls, file modifications, or outbound connections. Git-based backup of `~/.openclaw` brain data.

---

## Appendix B: EC2 and Linux-Specific Hardening

### UFW Firewall (Ubuntu/Debian)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh          # Only if using SSH; not needed if using SSM exclusively
sudo ufw enable
```

> **Note:** If you access the instance exclusively via AWS SSM Session Manager, you do not need to allow SSH. SSM does not require any inbound ports. If OpenClaw listens on a non-standard port, do **not** open that port in UFW — access it via SSM port forwarding instead.

### Enforce IMDSv2 (EC2 Metadata)

Prevent the agent from accessing EC2 instance credentials via the metadata endpoint:

```bash
aws ec2 modify-instance-metadata-options \
  --instance-id i-YOUR_INSTANCE_ID \
  --http-tokens required \
  --http-put-response-hop-limit 1
```

### SSM Port Forwarding (Recommended Access Method)

Instead of exposing ports, use SSM to tunnel to the OpenClaw gateway:

```bash
aws ssm start-session \
  --target i-YOUR_INSTANCE_ID \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["18789"],"localPortNumber":["18789"]}'
```

### Lightsail / One-Click Blueprint Findings

These findings were identified by a Cloud Security Engineer deploying OpenClaw via the AWS Lightsail blueprint. They are specific to that deployment model but worth noting.

- **Unpatched OS:** Blueprint ships with 31+ unpatched security updates including kernel patches. Run `sudo apt update && sudo apt upgrade -y && sudo reboot` immediately after deploy.
- **Permissive exec policy:** Default config sets `exec host policy: gateway` + `shell command approval: allow`, eliminating all isolation. Fix per Section 3.
- **IPv6 uncontrolled:** IPv4-only firewall rules leave IPv6 traffic open. Disable IPv6 if unused or audit rules for both protocol families.
- **Apache2 bundled:** Web server included with no documented hardening. Keep patched; restrict dashboard access to trusted IPs.
- **SSH keypair:** Generate your SSH keypair locally (`ssh-keygen -t ed25519`). Never let the cloud provider generate it.
- **Default security groups:** Lightsail opens ports 80, 443, and 22 to `0.0.0.0/0`. Tighten to your IP immediately.

---

## Appendix C: Docker Hardening

If running OpenClaw in Docker, use these flags for hardening:

```bash
docker run -d --name openclaw \
  --read-only --cap-drop=ALL --cap-add=NET_BIND_SERVICE \
  --security-opt no-new-privileges:true \
  --network openclaw-net \
  -e OPENCLAW_TOKEN="$OPENCLAW_TOKEN" \
  openclaw/openclaw:latest
```

For Nginx reverse proxy with TLS, rate limiting, and security headers, see the [VM Security Guide](https://github.com/nathanielng/openclaw-resources/blob/main/openclaw-vm-security-guide.md#4-docker-hardening).

---

## Appendix D: Desktop / VPN Access

If accessing OpenClaw from a desktop (not via SSM), consider Tailscale for secure remote access instead of exposing the gateway port:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Bind OpenClaw to the Tailscale interface IP instead of a public IP. Never expose the OpenClaw dashboard directly to the internet.

---

## References

**Official:**
- [OpenClaw Gateway Security Docs](https://docs.openclaw.ai/gateway/security) — official threat models and hardening guidance
- [OpenClaw Security in Public](https://openclaw.ai/blog/openclaw-security-in-public) — the team's security philosophy and expert-vetted practices

**Foundational:**
- [The Lethal Trifecta for AI Agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) — Simon Willison's framework for understanding when AI agents become exploitable (private data + untrusted content + external communication)

**Community:**
- [SlowMist Security Practice Guide](https://github.com/slowmist/openclaw-security-practice-guide) — 3-tier defense matrix
- [awesome-openclaw-security](https://github.com/munnam77/awesome-openclaw-security) — scanner, CVE docs, production configs
- [OpenClaw VM Security Guide](https://github.com/nathanielng/openclaw-resources/blob/main/openclaw-vm-security-guide.md) — comprehensive VM/VPS hardening reference
- [GhostClaw Attack Report](https://cybersecuritynews.com/ghostclaw-mimic-as-openclaw/) — supply chain attack details
