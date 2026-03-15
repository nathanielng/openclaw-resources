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
docker run -d --name docker compose run --rm openclaw-cli \
  -v ~/.openclaw:/root/.openclaw \
  -p 18789:18789 \
  ghcr.io/openclaw/openclaw:latest
```

Then attach and run `docker compose run --rm openclaw-cli onboard` inside the container.

### First-run setup

```bash
docker compose run --rm openclaw-cli onboard                  # Interactive setup wizard (recommended)
docker compose run --rm openclaw-cli onboard --install-daemon # Setup + register background daemon
docker compose run --rm openclaw-cli onboard --non-interactive # For Docker/CI environments
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

General pattern: `docker compose run --rm openclaw-cli [--dev] [--profile <name>] <command>`

### Core / System

```bash
docker compose run --rm openclaw-cli --version              # Version + git commit hash
docker compose run --rm openclaw-cli onboard                # Interactive setup wizard
docker compose run --rm openclaw-cli configure              # Reconfigure settings
docker compose run --rm openclaw-cli doctor                 # Automated health check
docker compose run --rm openclaw-cli doctor --fix           # Auto-fix issues (creates .json.bak backup)
docker compose run --rm openclaw-cli dashboard              # Open web UI
docker compose run --rm openclaw-cli tui                    # Open terminal UI
docker compose run --rm openclaw-cli tui --session <name>   # Target a specific agent session
docker compose run --rm openclaw-cli update                 # Update to latest stable
docker compose run --rm openclaw-cli update --channel stable|beta|dev  # Switch release channel
docker compose run --rm openclaw-cli reload                 # Reload gateway config (hot-reload)
docker compose run --rm openclaw-cli migrate                # Run config migrations
docker compose run --rm openclaw-cli reset --scope config   # Reset config only
docker compose run --rm openclaw-cli reset --scope full     # Full reset (nuclear)
docker compose run --rm openclaw-cli uninstall              # Remove OpenClaw
docker compose run --rm openclaw-cli logs                   # View gateway logs
docker compose run --rm openclaw-cli logs --follow          # Real-time log tail (works remotely)
docker compose run --rm openclaw-cli logs --local-time      # Show logs in local timezone
docker compose run --rm openclaw-cli logs --json            # Output logs as JSON
```

### Configuration

```bash
docker compose run --rm openclaw-cli config get <path>          # Read a config value
docker compose run --rm openclaw-cli config set <path> <value>  # Write a config value
docker compose run --rm openclaw-cli config unset <path>        # Remove a config value
```

Dot or bracket notation for paths, e.g.:
```bash
docker compose run --rm openclaw-cli config get agents.defaults.model.primary
docker compose run --rm openclaw-cli config set gateway.port 18790
docker compose run --rm openclaw-cli config set models.providers.anthropic.apiKey "sk-ant-..."
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
docker compose run --rm openclaw-cli gateway status         # Show gateway status
docker compose run --rm openclaw-cli gateway health         # Health check
docker compose run --rm openclaw-cli gateway start          # Start gateway
docker compose run --rm openclaw-cli gateway stop           # Stop gateway
docker compose run --rm openclaw-cli gateway restart        # Restart gateway (most commonly used)
docker compose run --rm openclaw-cli gateway install        # Install as system service
docker compose run --rm openclaw-cli gateway uninstall      # Remove system service
docker compose run --rm openclaw-cli gateway run            # Run in foreground (no daemon)
docker compose run --rm openclaw-cli gateway call           # Send a raw call to the gateway
docker compose run --rm openclaw-cli gateway probe          # Test gateway connectivity
docker compose run --rm openclaw-cli gateway discover       # Discover gateway on local network
```

### Daemon

```bash
docker compose run --rm openclaw-cli daemon status          # Show daemon status
docker compose run --rm openclaw-cli daemon install         # Install daemon
docker compose run --rm openclaw-cli daemon uninstall       # Remove daemon
docker compose run --rm openclaw-cli daemon start           # Start daemon
docker compose run --rm openclaw-cli daemon stop            # Stop daemon
docker compose run --rm openclaw-cli daemon restart         # Restart daemon
docker compose run --rm openclaw-cli daemon logs            # View daemon logs
```

### Channels

```bash
docker compose run --rm openclaw-cli channels list          # List configured channels
docker compose run --rm openclaw-cli channels status        # Show channel connection status
docker compose run --rm openclaw-cli channels status --probe # Test channel connectivity
docker compose run --rm openclaw-cli channels logs          # View channel logs
docker compose run --rm openclaw-cli channels add           # Add a channel (wizard mode)
docker compose run --rm openclaw-cli channels remove        # Remove a channel
docker compose run --rm openclaw-cli channels remove --delete # Remove and delete credentials
docker compose run --rm openclaw-cli channels login         # Authenticate a channel
docker compose run --rm openclaw-cli channels logout        # Deauthenticate a channel
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
docker compose run --rm openclaw-cli models list                        # List available models
docker compose run --rm openclaw-cli models status                      # Show active model
docker compose run --rm openclaw-cli models set <provider/model>        # Switch active model
docker compose run --rm openclaw-cli models set-image <provider/model>  # Set image generation model
docker compose run --rm openclaw-cli models scan                        # Scan for available models
docker compose run --rm openclaw-cli models aliases list                # List model aliases
docker compose run --rm openclaw-cli models aliases add <alias> <model> # Add a model alias
docker compose run --rm openclaw-cli models aliases remove <alias>      # Remove a model alias
docker compose run --rm openclaw-cli models fallbacks list              # List fallback models
docker compose run --rm openclaw-cli models fallbacks add <model>       # Add a fallback model
docker compose run --rm openclaw-cli models fallbacks remove <model>    # Remove a fallback model
docker compose run --rm openclaw-cli models fallbacks clear             # Clear all fallbacks
docker compose run --rm openclaw-cli models auth add                    # Add model auth
docker compose run --rm openclaw-cli models auth setup-token           # Configure API token
docker compose run --rm openclaw-cli models auth paste-token           # Paste an API token
docker compose run --rm openclaw-cli models auth order get             # Show auth resolution order
docker compose run --rm openclaw-cli models auth order set             # Set auth resolution order
docker compose run --rm openclaw-cli models auth order clear           # Reset auth order
```

**Supported providers**: Anthropic (Claude), OpenAI (GPT), Google Gemini, Google Vertex, OpenRouter, xAI (Grok), Groq, Mistral, Cerebras, Venice, Moonshot AI, Kimi, MiniMax, GitHub Copilot, Amazon Bedrock, Ollama (local), and more.

**Auto-detection priority**: Anthropic → OpenAI → OpenRouter → Gemini → xAI → Groq → Mistral → Cerebras → Venice → Moonshot → Kimi → MiniMax → Bedrock → Ollama

If the primary model fails (rate limit, timeout), fallbacks are tried automatically.

### Agents

```bash
docker compose run --rm openclaw-cli agents list            # List configured agents
docker compose run --rm openclaw-cli agents add             # Add an agent
docker compose run --rm openclaw-cli agents delete <id>     # Remove an agent
docker compose run --rm openclaw-cli agent <message>        # Send a message to the agent
docker compose run --rm openclaw-cli message <text>         # Send a one-off message
```

### Skills

```bash
docker compose run --rm openclaw-cli skills list            # List installed skills
docker compose run --rm openclaw-cli skills info <name>     # Show skill details
docker compose run --rm openclaw-cli skills check <name>    # Validate a skill
```

Skills are Markdown files with YAML frontmatter at `~/.openclaw/workspace/skills/<name>/SKILL.md`. They extend agent behaviour without granting new permissions. Changes take effect on the next new session.

**ClawHub** (public registry, 13,729+ skills): [clawhub.com](https://clawhub.com)

```bash
docker compose run --rm openclaw-cli clawhub install <slug>          # Install a skill
docker compose run --rm openclaw-cli clawhub uninstall <slug>        # Remove a skill
docker compose run --rm openclaw-cli clawhub list                    # List installed skills
docker compose run --rm openclaw-cli clawhub update --all            # Update all skills
docker compose run --rm openclaw-cli clawhub inspect <slug>          # Review skill source before installing
docker compose run --rm openclaw-cli clawhub publish <path>          # Publish a skill
docker compose run --rm openclaw-cli clawhub sync                    # Sync skills with registry
```

> **Security note**: ~20% of community skills on ClawHub have security concerns. Always run `docker compose run --rm openclaw-cli clawhub inspect` before installing, and prefer pinned versions (`@scope/pkg@1.2.3`). OpenClaw has a VirusTotal partnership for automated skill scanning.

### Plugins

```bash
docker compose run --rm openclaw-cli plugins list           # List installed plugins
docker compose run --rm openclaw-cli plugins info <name>    # Show plugin details
docker compose run --rm openclaw-cli plugins install <name> # Install a plugin
docker compose run --rm openclaw-cli plugins enable <name>  # Enable a plugin
docker compose run --rm openclaw-cli plugins disable <name> # Disable a plugin
docker compose run --rm openclaw-cli plugins doctor         # Check plugin health
```

### Memory

```bash
docker compose run --rm openclaw-cli memory status          # Show memory index status
docker compose run --rm openclaw-cli memory index           # Rebuild memory index
docker compose run --rm openclaw-cli memory search <query>  # Search memory
```

### Cron Jobs

```bash
docker compose run --rm openclaw-cli cron list              # List all cron jobs
docker compose run --rm openclaw-cli cron add               # Add a cron job (interactive)
docker compose run --rm openclaw-cli cron edit <id>         # Edit a cron job
docker compose run --rm openclaw-cli cron delete <id>       # Delete a cron job
docker compose run --rm openclaw-cli cron run <id>          # Trigger a job immediately
docker compose run --rm openclaw-cli cron status <id>       # Show job status
docker compose run --rm openclaw-cli cron next <id>         # Show next scheduled run time
docker compose run --rm openclaw-cli cron pause <id>        # Pause a job
docker compose run --rm openclaw-cli cron resume <id>       # Resume a paused job
docker compose run --rm openclaw-cli cron disable <id>      # Disable a job
```

**Schedule kinds:**

```bash
# Recurring (cron expression)
docker compose run --rm openclaw-cli cron add --name "Morning Brief" \
  --cron "0 9 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Summarize overnight emails and news" \
  --announce

# Interval (milliseconds)
docker compose run --rm openclaw-cli cron add --name "Backup" --every 3600000 \
  --session isolated --message "Run git backup"

# One-time future task
docker compose run --rm openclaw-cli cron add --name "Reminder" \
  --at "2026-03-15T16:00:00Z" \
  --session main \
  --message "Check the deployment" \
  --delete-after-run
```

### Heartbeat

```bash
docker compose run --rm openclaw-cli system heartbeat last      # Show last heartbeat time
docker compose run --rm openclaw-cli system heartbeat enable    # Enable heartbeat
docker compose run --rm openclaw-cli system heartbeat disable   # Disable heartbeat
docker compose run --rm openclaw-cli config set agents.defaults.heartbeat.every "2h"  # Set interval
```

On each heartbeat, the agent reads `HEARTBEAT.md` from the workspace, decides if action is needed, and either messages you or responds `HEARTBEAT_OK`. Default interval: 30 minutes.

### Security

```bash
docker compose run --rm openclaw-cli security audit             # Audit current setup
docker compose run --rm openclaw-cli security audit --deep      # Deep audit
docker compose run --rm openclaw-cli security audit --fix       # Auto-remediate issues
docker compose run --rm openclaw-cli security scan --all        # Scan all components
docker compose run --rm openclaw-cli secrets                    # Manage stored secrets
```

### Agent Client Protocol (ACP)

ACP lets OpenClaw orchestrate external AI coding tools (Claude Code, Codex, Gemini CLI, etc.).

```bash
docker compose run --rm openclaw-cli acp status                         # Show ACP status
docker compose run --rm openclaw-cli acp health                         # ACP health check
docker compose run --rm openclaw-cli acp sessions                       # List ACP sessions
docker compose run --rm openclaw-cli acp --provenance off|meta|meta+receipt  # Set provenance mode
```

### Sandbox

```bash
docker compose run --rm openclaw-cli sandbox list               # List sandbox instances
docker compose run --rm openclaw-cli sandbox recreate           # Recreate sandbox container
docker compose run --rm openclaw-cli sandbox explain            # Explain sandbox configuration
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

## Messaging & Provider Setup

### Telegram

1. **Create a bot** — Open [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, and follow the prompts to get a bot token (`123456789:ABCdef...`).

2. **Add the token** to `~/.openclaw/.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCdef...
   ```

3. **Enable the channel**:
   ```bash
   docker compose run --rm openclaw-cli channels add
   # select "Telegram" from the list, paste your token when prompted
   ```
   Or set it directly in `~/.openclaw/openclaw.json`:
   ```json5
   channels: {
     telegram: {
       botToken: "${TELEGRAM_BOT_TOKEN}",
       enabled: true,
       dmPolicy: "pairing",   // pairing | allowlist | open | disabled
       streamMode: "partial"  // partial | full | off
     }
   }
   ```

4. **Start the gateway** and message your bot on Telegram:
   ```bash
   docker compose run --rm openclaw-cli gateway restart
   ```

5. **Pair your Telegram account** — send any message to the bot; it replies with a pairing code. Run `docker compose run --rm openclaw-cli channels login` and enter the code to allowlist yourself.

---

### Slack

1. **Create a Slack App** at [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.

2. **Enable Socket Mode** (Apps & Connections → Socket Mode → Enable) — copy the **App-Level Token** (`xapp-...`).

3. **Subscribe to Bot Events** (Event Subscriptions → Subscribe to bot events):
   - `message.channels`, `message.groups`, `message.im`, `message.mpim`

4. **Add OAuth Scopes** (OAuth & Permissions → Bot Token Scopes):
   `chat:write`, `channels:history`, `groups:history`, `im:history`, `im:read`, `im:write`

5. **Install the app** to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`).

6. **Add tokens** to `~/.openclaw/.env`:
   ```bash
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   ```

7. **Add the channel**:
   ```bash
   docker compose run --rm openclaw-cli channels add   # select "Slack"
   ```
   Or configure manually in `openclaw.json`:
   ```json5
   channels: {
     slack: {
       botToken: "${SLACK_BOT_TOKEN}",
       appToken: "${SLACK_APP_TOKEN}",
       enabled: true,
       dmPolicy: "pairing"
     }
   }
   ```

8. **Restart and invite the bot** to a Slack channel with `/invite @YourBotName`.

---

### Discord

1. **Create an application** at [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.

2. Open **Bot** → **Add Bot** → enable **Message Content Intent**, **Server Members Intent**, and **Presence Intent** under Privileged Gateway Intents.

3. Copy the **Bot Token** (Bot → Reset Token).

4. **Invite the bot** to your server using OAuth2 → URL Generator:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `View Channels`

5. **Add the token** to `~/.openclaw/.env`:
   ```bash
   DISCORD_BOT_TOKEN=MTI3...
   ```

6. **Add the channel**:
   ```bash
   docker compose run --rm openclaw-cli channels add   # select "Discord"
   ```
   Or in `openclaw.json`:
   ```json5
   channels: {
     discord: {
       botToken: "${DISCORD_BOT_TOKEN}",
       enabled: true,
       dmPolicy: "pairing"
     }
   }
   ```

7. ```bash
   docker compose run --rm openclaw-cli gateway restart
   ```

---

### WhatsApp

OpenClaw connects to WhatsApp via the **WhatsApp Business API** (Meta Cloud API) or a compatible bridge (e.g., [whatsapp-web.js](https://wwebjs.dev/) in bridge mode).

#### Option A — Meta Cloud API (recommended for production)

1. Set up a **Meta Business App** at [developers.facebook.com](https://developers.facebook.com) with the **WhatsApp** product.
2. Add a phone number and verify it in the WhatsApp Manager.
3. Copy the **Permanent Access Token** and **Phone Number ID**.
4. Set a **Webhook** URL pointing to your OpenClaw gateway:
   - URL: `https://<your-domain>:18789/webhooks/whatsapp`
   - Verify token: any secret string you choose
   - Subscribe to: `messages`

5. Add to `~/.openclaw/.env`:
   ```bash
   WHATSAPP_ACCESS_TOKEN=EAAl...
   WHATSAPP_PHONE_NUMBER_ID=12345678901234
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=my-secret
   ```

6. Configure in `openclaw.json`:
   ```json5
   channels: {
     whatsapp: {
       provider: "meta-cloud",
       accessToken: "${WHATSAPP_ACCESS_TOKEN}",
       phoneNumberId: "${WHATSAPP_PHONE_NUMBER_ID}",
       webhookVerifyToken: "${WHATSAPP_WEBHOOK_VERIFY_TOKEN}",
       enabled: true,
       dmPolicy: "pairing"
     }
   }
   ```

#### Option B — Local QR-code bridge

```bash
docker compose run --rm openclaw-cli channels add   # select "WhatsApp (bridge)"
# follow the on-screen QR code prompt and scan with your phone
```

---

### OpenRouter

[OpenRouter](https://openrouter.ai) provides a unified API for hundreds of models (GPT-4o, Gemini, Mistral, etc.) through an OpenAI-compatible endpoint.

1. **Get an API key** at [openrouter.ai/keys](https://openrouter.ai/keys).

2. **Add the key** to `~/.openclaw/.env`:
   ```bash
   OPENROUTER_API_KEY=sk-or-...
   ```

3. **Configure the provider** in `openclaw.json`:
   ```json5
   models: {
     providers: {
       openrouter: {
         baseUrl: "https://openrouter.ai/api/v1",
         apiKey: "${OPENROUTER_API_KEY}",
         api: "openai-completions"
       }
     }
   }
   ```

4. **Set OpenRouter as your active model** (pick any model slug from [openrouter.ai/models](https://openrouter.ai/models)):
   ```bash
   docker compose run --rm openclaw-cli models set openrouter/google/gemini-2.0-flash-exp
   docker compose run --rm openclaw-cli models set openrouter/mistralai/mistral-large
   docker compose run --rm openclaw-cli models set openrouter/meta-llama/llama-3.1-405b-instruct
   ```

5. **Add fallbacks** across providers:
   ```bash
   docker compose run --rm openclaw-cli models fallbacks add openrouter/openai/gpt-4o
   docker compose run --rm openclaw-cli models fallbacks add openrouter/anthropic/claude-opus-4-6
   ```

6. **Verify** the connection:
   ```bash
   docker compose run --rm openclaw-cli models scan
   docker compose run --rm openclaw-cli doctor
   ```

> **Tip**: Use OpenRouter model aliases to switch models in-chat: add an alias with `docker compose run --rm openclaw-cli models aliases add gemini openrouter/google/gemini-2.0-flash-exp`, then type `/model gemini` in any conversation.

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
docker compose run --rm openclaw-cli update --channel beta
```

---

## Common Workflows

```bash
# Check overall health
docker compose run --rm openclaw-cli doctor

# Restart after config changes
docker compose run --rm openclaw-cli gateway restart

# Tail logs in real time
docker compose run --rm openclaw-cli logs --follow

# Switch to a different AI model
docker compose run --rm openclaw-cli models set anthropic/claude-sonnet-4-6

# Add a fallback model
docker compose run --rm openclaw-cli models fallbacks add openai/gpt-4o

# Test that all channels are reachable
docker compose run --rm openclaw-cli channels status --probe

# Schedule a daily summary at 8 AM
docker compose run --rm openclaw-cli cron add --name "Daily Summary" \
  --cron "0 8 * * *" --tz "UTC" \
  --session isolated \
  --message "Give me a brief summary of pending tasks"

# Run a security audit
docker compose run --rm openclaw-cli security audit --deep

# Install a skill from ClawHub
docker compose run --rm openclaw-cli clawhub inspect github
docker compose run --rm openclaw-cli clawhub install github
```
