# Hermes Agent — Docker Setup

Run [Hermes Agent](https://github.com/NousResearch/hermes-agent) (by Nous Research) via Docker, with optional migration from an existing OpenClaw multi-container setup.

## Quick Start (Fresh Install)

```bash
cd docker/hermes

# Build the image (first time — takes a few minutes)
docker compose build

# Run the setup wizard
docker compose run --rm hermes setup

# Start the gateway (Telegram, Discord, etc.)
docker compose up -d

# Or start an interactive CLI session
docker compose run --rm hermes
```

All data is stored in `./data/` and persists across container restarts.

## Migrating from OpenClaw

If you have an existing OpenClaw multi-container setup in `docker/multi/`, you can migrate an instance to Hermes. The script uses Hermes's built-in `hermes claw migrate` to import your persona (SOUL.md), memories, skills, messaging config, and API keys.

```bash
# Preview what would be migrated (no changes)
./migrate.sh 1 --dry-run

# Migrate OpenClaw instance-1 to Hermes
./migrate.sh 1
```

### What gets migrated

| From OpenClaw | To Hermes |
|---|---|
| SOUL.md | SOUL.md |
| MEMORY.md, USER.md | Persistent memory |
| Skills | `data/skills/openclaw-imports/` |
| Telegram/Discord/Slack config | Gateway platform config |
| API keys (.env) | `data/.env` |
| Model provider settings | `data/config.yaml` |

### What needs manual setup

- **Telegram bot token**: A bot can only connect to one agent. Stop the OpenClaw instance before starting Hermes with the same token, or create a new bot via [@BotFather](https://t.me/BotFather).
- **Custom providers** (e.g. oMLX local): Re-add via `docker compose run --rm hermes model` and select "Custom Endpoint".
- **Cron jobs, plugins, hooks**: Archived for manual review — check `hermes claw migrate --dry-run` output.

## File Layout

```
docker/hermes/
├── docker-compose.yml    # Compose file (builds from GitHub repo)
├── .env.example          # Template for API keys
├── migrate.sh            # OpenClaw → Hermes migration script
├── README.md             # This file
└── data/                 # Created on first run (mounted as /opt/data)
    ├── .env              # API keys
    ├── config.yaml       # Hermes configuration
    ├── SOUL.md           # Agent persona
    ├── sessions/         # Conversation history
    ├── memories/         # Persistent memory
    ├── skills/           # Installed skills
    └── logs/             # Agent and gateway logs
```

## Common Commands

```bash
# Interactive CLI session
docker compose run --rm hermes

# Start gateway in background
docker compose up -d

# View logs
docker compose logs -f

# Change model/provider
docker compose run --rm hermes model

# Check health
docker compose run --rm hermes doctor

# Update (rebuild from latest source)
docker compose build --no-cache
docker compose up -d
```

## AWS Bedrock

To use Bedrock models, add AWS credentials to `data/.env`:

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

Then select Bedrock as the provider:

```bash
docker compose run --rm hermes model
# Choose "AWS Bedrock" from the provider list
```

## Web Dashboard

Hermes has a built-in web dashboard for managing config, API keys, and sessions. To run it:

```bash
docker compose run --rm -p 9119:9119 hermes dashboard --host 0.0.0.0
```

Then open [http://localhost:9119](http://localhost:9119) in your browser.

> The dashboard requires `hermes-agent[web]` which is included in the Docker image's `.[all]` install.

## Connecting Telegram / Discord

### Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram and copy the bot token.
2. Add the token to `data/.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   TELEGRAM_ALLOWED_USERS=your_telegram_user_id
   ```
   To find your user ID, message [@userinfobot](https://t.me/userinfobot) on Telegram.
3. Start the gateway:
   ```bash
   docker compose up -d
   ```
4. Send your bot a message — it will prompt you to pair via a code.

### Discord

1. Create a bot at the [Discord Developer Portal](https://discord.com/developers/applications):
   - New Application → Bot → copy the token
   - Enable **Message Content Intent** under Privileged Gateway Intents
   - Invite the bot to your server with the OAuth2 URL Generator (scopes: `bot`, permissions: `Send Messages`, `Read Message History`)
2. Run the interactive gateway setup:
   ```bash
   docker compose run --rm hermes gateway setup
   ```
   Select Discord and paste your bot token when prompted.
3. Start the gateway:
   ```bash
   docker compose up -d
   ```

### Other Platforms

Hermes also supports Slack, WhatsApp, Signal, and Email. Run the interactive setup to configure any of them:

```bash
docker compose run --rm hermes gateway setup
```

## Running Alongside OpenClaw

Hermes and OpenClaw can run side by side — they're completely independent. The only constraint is that a Telegram bot token can only be used by one agent at a time. Either use separate bot tokens, or stop one before starting the other.
