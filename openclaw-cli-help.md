# OpenClaw CLI Help

> Official docs: [docs.openclaw.ai/cli](https://docs.openclaw.ai/cli)

OpenClaw is an open-source, local-first personal AI assistant that runs on your own hardware and connects to messaging platforms you already use. The CLI controls the gateway daemon, configuration, channels, models, skills, cron jobs, and more.

- **npm package**: `openclaw` (requires Node.js >= 22)
- **Latest stable**: `v2026.3.8`
- **GitHub**: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)

---

## Installation

### macOS / Linux

```bash
curl -fsSL --proto 'https' --tlsv1.2 https://openclaw.ai/install-cli.sh | bash
# or via npm
npm install -g openclaw@latest
```

### Windows (PowerShell)

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

### Docker

```bash
docker run -d --name openclaw \
  -v ~/.openclaw:/root/.openclaw \
  -p 18789:18789 \
  ghcr.io/openclaw/openclaw:latest
```

Then attach and run `openclaw onboard` inside the container.

### First-run setup

```bash
openclaw onboard                  # Interactive setup wizard (recommended)
openclaw onboard --install-daemon # Setup + register background daemon
openclaw onboard --non-interactive # For Docker/CI environments
```

The daemon registers as a `systemd` user service (Linux) or `launchd` LaunchAgent (macOS), keeping the gateway running across reboots.

---

## File Layout

```
~/.openclaw/
├── openclaw.json          # Main config (JSON5)
├── .env                   # Secret environment variables (API keys, tokens)
├── state/                 # Session data, message history
├── workspace/             # Skills and custom tools
│   └── skills/<name>/SKILL.md
├── credentials/           # OAuth tokens
└── cron/jobs.json         # Persisted cron jobs
```

---

## CLI Command Reference

General pattern: `openclaw [--dev] [--profile <name>] <command>`

### Core / System

```bash
openclaw --version              # Version + git commit hash
openclaw onboard                # Interactive setup wizard
openclaw configure              # Reconfigure settings
openclaw doctor                 # Automated health check
openclaw doctor --fix           # Auto-fix issues (creates .json.bak backup)
openclaw dashboard              # Open web UI
openclaw tui                    # Open terminal UI
openclaw tui --session <name>   # Target a specific agent session
openclaw update                 # Update to latest stable
openclaw update --channel stable|beta|dev  # Switch release channel
openclaw reload                 # Reload gateway config (hot-reload)
openclaw migrate                # Run config migrations
openclaw reset --scope config   # Reset config only
openclaw reset --scope full     # Full reset (nuclear)
openclaw uninstall              # Remove OpenClaw
openclaw logs                   # View gateway logs
openclaw logs --follow          # Real-time log tail (works remotely)
openclaw logs --local-time      # Show logs in local timezone
openclaw logs --json            # Output logs as JSON
```

### Configuration

```bash
openclaw config get <path>          # Read a config value
openclaw config set <path> <value>  # Write a config value
openclaw config unset <path>        # Remove a config value
```

Dot or bracket notation for paths, e.g.:
```bash
openclaw config get agents.defaults.model.primary
openclaw config set gateway.port 18790
openclaw config set models.providers.anthropic.apiKey "sk-ant-..."
```

#### Configuration Precedence (highest to lowest)
1. CLI flags (`--port`, `--bind`, etc.)
2. Environment variables (`OPENCLAW_GATEWAY_PORT`, `OPENCLAW_GATEWAY_TOKEN`, etc.)
3. Config file (`~/.openclaw/openclaw.json` or `$OPENCLAW_CONFIG_PATH`)
4. Built-in defaults

#### Hot-reload (no restart needed)
Model/fallback changes, agent config, channel policies, cron jobs, heartbeat intervals, tool config, and most session settings apply live.

### Gateway

```bash
openclaw gateway status         # Show gateway status
openclaw gateway health         # Health check
openclaw gateway start          # Start gateway
openclaw gateway stop           # Stop gateway
openclaw gateway restart        # Restart gateway (most commonly used)
openclaw gateway install        # Install as system service
openclaw gateway uninstall      # Remove system service
openclaw gateway run            # Run in foreground (no daemon)
openclaw gateway call           # Send a raw call to the gateway
openclaw gateway probe          # Test gateway connectivity
openclaw gateway discover       # Discover gateway on local network
```

### Daemon

```bash
openclaw daemon status          # Show daemon status
openclaw daemon install         # Install daemon
openclaw daemon uninstall       # Remove daemon
openclaw daemon start           # Start daemon
openclaw daemon stop            # Stop daemon
openclaw daemon restart         # Restart daemon
openclaw daemon logs            # View daemon logs
```

### Channels

```bash
openclaw channels list          # List configured channels
openclaw channels status        # Show channel connection status
openclaw channels status --probe # Test channel connectivity
openclaw channels logs          # View channel logs
openclaw channels add           # Add a channel (wizard mode)
openclaw channels remove        # Remove a channel
openclaw channels remove --delete # Remove and delete credentials
openclaw channels login         # Authenticate a channel
openclaw channels logout        # Deauthenticate a channel
```

**Supported channels**: WhatsApp, Telegram, Discord, Slack, Google Chat, Signal, iMessage/BlueBubbles, Microsoft Teams, Matrix, Mattermost, IRC, Feishu, LINE, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo, WebChat.

**DM policy modes:**

| Mode | Behaviour |
|---|---|
| `pairing` | Unknown senders get a pairing code (1-hour expiry, 3 pending max) — default |
| `allowlist` | Only explicitly listed senders allowed |
| `open` | Anyone can DM (requires `"*"` in allowlist as opt-in) |
| `disabled` | Ignore all inbound DMs |

### Models

```bash
openclaw models list                        # List available models
openclaw models status                      # Show active model
openclaw models set <provider/model>        # Switch active model
openclaw models set-image <provider/model>  # Set image generation model
openclaw models scan                        # Scan for available models
openclaw models aliases list                # List model aliases
openclaw models aliases add <alias> <model> # Add a model alias
openclaw models aliases remove <alias>      # Remove a model alias
openclaw models fallbacks list              # List fallback models
openclaw models fallbacks add <model>       # Add a fallback model
openclaw models fallbacks remove <model>    # Remove a fallback model
openclaw models fallbacks clear             # Clear all fallbacks
openclaw models auth add                    # Add model auth
openclaw models auth setup-token           # Configure API token
openclaw models auth paste-token           # Paste an API token
openclaw models auth order get             # Show auth resolution order
openclaw models auth order set             # Set auth resolution order
openclaw models auth order clear           # Reset auth order
```

**Supported providers**: Anthropic (Claude), OpenAI (GPT), Google Gemini, Google Vertex, OpenRouter, xAI (Grok), Groq, Mistral, Cerebras, Venice, Moonshot AI, Kimi, MiniMax, GitHub Copilot, Amazon Bedrock, Ollama (local), and more.

**Auto-detection priority**: Anthropic → OpenAI → OpenRouter → Gemini → xAI → Groq → Mistral → Cerebras → Venice → Moonshot → Kimi → MiniMax → Bedrock → Ollama

If the primary model fails (rate limit, timeout), fallbacks are tried automatically.

### Agents

```bash
openclaw agents list            # List configured agents
openclaw agents add             # Add an agent
openclaw agents delete <id>     # Remove an agent
openclaw agent <message>        # Send a message to the agent
openclaw message <text>         # Send a one-off message
```

### Skills

```bash
openclaw skills list            # List installed skills
openclaw skills info <name>     # Show skill details
openclaw skills check <name>    # Validate a skill
```

Skills are Markdown files with YAML frontmatter at `~/.openclaw/workspace/skills/<name>/SKILL.md`. They extend agent behaviour without granting new permissions. Changes take effect on the next new session.

**ClawHub** (public registry, 13,729+ skills): [clawhub.com](https://clawhub.com)

```bash
clawhub install <slug>          # Install a skill
clawhub uninstall <slug>        # Remove a skill
clawhub list                    # List installed skills
clawhub update --all            # Update all skills
clawhub inspect <slug>          # Review skill source before installing
clawhub publish <path>          # Publish a skill
clawhub sync                    # Sync skills with registry
```

> **Security note**: ~20% of community skills on ClawHub have security concerns. Always run `clawhub inspect` before installing, and prefer pinned versions (`@scope/pkg@1.2.3`). OpenClaw has a VirusTotal partnership for automated skill scanning.

### Plugins

```bash
openclaw plugins list           # List installed plugins
openclaw plugins info <name>    # Show plugin details
openclaw plugins install <name> # Install a plugin
openclaw plugins enable <name>  # Enable a plugin
openclaw plugins disable <name> # Disable a plugin
openclaw plugins doctor         # Check plugin health
```

### Memory

```bash
openclaw memory status          # Show memory index status
openclaw memory index           # Rebuild memory index
openclaw memory search <query>  # Search memory
```

### Cron Jobs

```bash
openclaw cron list              # List all cron jobs
openclaw cron add               # Add a cron job (interactive)
openclaw cron edit <id>         # Edit a cron job
openclaw cron delete <id>       # Delete a cron job
openclaw cron run <id>          # Trigger a job immediately
openclaw cron status <id>       # Show job status
openclaw cron next <id>         # Show next scheduled run time
openclaw cron pause <id>        # Pause a job
openclaw cron resume <id>       # Resume a paused job
openclaw cron disable <id>      # Disable a job
```

**Schedule kinds:**

```bash
# Recurring (cron expression)
openclaw cron add --name "Morning Brief" \
  --cron "0 9 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Summarize overnight emails and news" \
  --announce

# Interval (milliseconds)
openclaw cron add --name "Backup" --every 3600000 \
  --session isolated --message "Run git backup"

# One-time future task
openclaw cron add --name "Reminder" \
  --at "2026-03-15T16:00:00Z" \
  --session main \
  --message "Check the deployment" \
  --delete-after-run
```

### Heartbeat

```bash
openclaw system heartbeat last      # Show last heartbeat time
openclaw system heartbeat enable    # Enable heartbeat
openclaw system heartbeat disable   # Disable heartbeat
openclaw config set agents.defaults.heartbeat.every "2h"  # Set interval
```

On each heartbeat, the agent reads `HEARTBEAT.md` from the workspace, decides if action is needed, and either messages you or responds `HEARTBEAT_OK`. Default interval: 30 minutes.

### Security

```bash
openclaw security audit             # Audit current setup
openclaw security audit --deep      # Deep audit
openclaw security audit --fix       # Auto-remediate issues
openclaw security scan --all        # Scan all components
openclaw secrets                    # Manage stored secrets
```

### Agent Client Protocol (ACP)

ACP lets OpenClaw orchestrate external AI coding tools (Claude Code, Codex, Gemini CLI, etc.).

```bash
openclaw acp status                         # Show ACP status
openclaw acp health                         # ACP health check
openclaw acp sessions                       # List ACP sessions
openclaw acp --provenance off|meta|meta+receipt  # Set provenance mode
```

### Sandbox

```bash
openclaw sandbox list               # List sandbox instances
openclaw sandbox recreate           # Recreate sandbox container
openclaw sandbox explain            # Explain sandbox configuration
```

**Sandbox modes:**

| Mode | Behaviour |
|---|---|
| `off` | No sandboxing (default for main session) |
| `non-main` | Sandbox all non-main sessions in per-session Docker containers |
| `all` | Sandbox everything |

Default sandbox allowlist: `bash, process, read, write, edit, sessions_list, sessions_history, sessions_send, sessions_spawn`

Default sandbox denylist: `browser, canvas, nodes, cron, discord, gateway`

---

## Environment Variables

Stored in `~/.openclaw/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
OPENCLAW_GATEWAY_TOKEN=...
OPENCLAW_CONFIG_PATH=/custom/path/openclaw.json
OPENCLAW_GATEWAY_PORT=18789
MODEL_BACKEND_URL=http://localhost:11434   # Ollama
SHARP_IGNORE_GLOBAL_LIBVIPS=1             # npm install fix on macOS
OPENCLAW_BIND_MOUNT_OPTIONS=:Z            # Podman/SELinux (Fedora/RHEL)
OPENCLAW_HOME_VOLUME=<name>               # Named Docker volume for /home/node
OPENCLAW_EXTRA_MOUNTS=...                 # Additional Docker bind mounts
```

---

## Configuration File (`~/.openclaw/openclaw.json`)

```json5
{
  gateway: {
    mode: "local",
    port: 18789,
    bind: "loopback",
    reload: "hybrid",
    auth: { mode: "token", token: "${GATEWAY_TOKEN}" },
    tailscale: { mode: "off", resetOnExit: false },
    http: { endpoints: { chatCompletions: { enabled: true } } }
  },
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: { primary: "anthropic/claude-opus-4-6" },
      heartbeat: { every: "30m" },
      sandbox: {
        mode: "non-main",   // off | non-main | all
        scope: "agent"      // session | agent | shared
      }
    },
    list: [
      { agentId: "main" },
      { agentId: "work", workspace: "~/.openclaw/workspace-work" }
    ]
  },
  channels: {
    telegram: {
      botToken: "...",
      enabled: true,
      dmPolicy: "pairing",
      streamMode: "partial"
    }
  },
  session: {
    dmScope: "main",
    reset: { mode: "daily", atHour: 4 }
  },
  cron: { enabled: true },
  models: {
    providers: {
      "openrouter": {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-...",
        api: "openai-completions"
      }
    }
  },
  env: { vars: { TZ: "America/New_York" }, shellEnv: true }
}
```

---

## Multi-Agent Routing

Map specific conversations to specific agents using bindings:

```json5
agents: {
  defaults: { workspace: "~/.openclaw/workspace" },
  list: [
    { agentId: "main", default: true },
    { agentId: "work", workspace: "~/.openclaw/workspace-work" }
  ]
},
bindings: [
  {
    agentId: "work",
    match: { channel: "whatsapp", peer: { kind: "group", id: "[email protected]" } }
  }
]
```

Switch model in-chat: `/model opus` or `/model gpt` (using named aliases).

---

## Docker / Container Notes

- Runs as user `node` (uid 1000) — mount ownership must match
- Liveness/readiness endpoints: `/health`, `/healthz`, `/ready`, `/readyz`
- Use `OPENCLAW_BIND_MOUNT_OPTIONS=:Z` for Podman/SELinux
- `openclaw-cli` Docker Compose service provides CLI access alongside the main container

---

## Release Channels

Uses calendar versioning: `YYYY.M.D[-beta.N]`

| Channel | Description |
|---|---|
| `stable` | Production releases (default) |
| `beta` | Pre-release builds |
| `dev` | Bleeding-edge main branch |

```bash
openclaw update --channel beta
```

---

## Common Workflows

```bash
# Check overall health
openclaw doctor

# Restart after config changes
openclaw gateway restart

# Tail logs in real time
openclaw logs --follow

# Switch to a different AI model
openclaw models set anthropic/claude-sonnet-4-6

# Add a fallback model
openclaw models fallbacks add openai/gpt-4o

# Test that all channels are reachable
openclaw channels status --probe

# Schedule a daily summary at 8 AM
openclaw cron add --name "Daily Summary" \
  --cron "0 8 * * *" --tz "UTC" \
  --session isolated \
  --message "Give me a brief summary of pending tasks"

# Run a security audit
openclaw security audit --deep

# Install a skill from ClawHub
clawhub inspect github
clawhub install github
```
