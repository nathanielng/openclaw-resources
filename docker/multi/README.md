# OpenClaw Multi-Container Setup Guide

Run 2, 3, or 4 independent OpenClaw instances on a single Docker Desktop host using Docker Compose.

Each instance is fully independent: its own port, configuration, agents, channels, and AI model settings.

---

## Why Docker Compose (not Kubernetes)?

With Docker Desktop and 2–4 containers on one machine, Docker Compose is the right tool:

| | Docker Compose | Kubernetes (via Docker Desktop) |
|---|---|---|
| Setup complexity | Low — one YAML file | High — Deployments, Services, PVCs, Ingress |
| Overhead | Minimal | ~1 GB RAM for control plane alone |
| Good for | 1–10 containers, single host | Multi-node clusters, auto-scaling |
| Port management | Simple host port mapping | Requires Service/Ingress config |

Use Kubernetes only if you need to spread containers across multiple machines or need automatic pod rescheduling.

---

## Quick Start

All commands below must be run from the `docker/multi/` directory:

```bash
cd openclaw-resources/docker/multi
```

### 1. Stop any conflicting containers

If you already have OpenClaw containers running (e.g. from a single-instance setup), stop them first — otherwise the ports will clash:

```bash
# Stop and remove all running openclaw containers
docker compose down

# Or, if you started with profiles:
docker compose --profile three --profile four down
```

To check what is currently running:

```bash
docker ps
```

Ports used by this multi-instance setup: **18789, 18790, 18791, 18792, 4000**. Make sure none of these are occupied before proceeding.

### 2. Create the data directories

Each instance needs its own directory for config, state, and workspace files. Run this from `docker/multi/`:

```bash
mkdir -p data/instance-1 data/instance-2 data/instance-3 data/instance-4
```

### 3. Create a `.env` file for each instance

Each instance must have its own `data/instance-N/.env`. Copy and edit:

```bash
# data/instance-1/.env
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# OPENROUTER_API_KEY=sk-or-...
OPENCLAW_GATEWAY_TOKEN=change-me-instance-1
TZ=America/New_York
```

Use a different `OPENCLAW_GATEWAY_TOKEN` per instance so they can't be confused.

### 4. Build the mission control image

```bash
docker compose build mission-control
```

This only needs to be run once (or after updating files in `mission-control/`).

### 5. Pull the OpenClaw image

```bash
docker compose pull
```

### 6. Run the onboarding wizard per instance

Each instance needs its own onboarding (chooses model, configures channels, etc.):

```bash
# Instance 1
docker compose run --rm openclaw-1-cli onboard

# Instance 2
docker compose run --rm openclaw-2-cli onboard

# Instance 3 (only if running 3 or 4)
docker compose --profile three run --rm openclaw-3-cli onboard

# Instance 4 (only if running 4)
docker compose --profile four run --rm openclaw-4-cli onboard
```

For headless/non-interactive setup:
```bash
docker compose run --rm openclaw-1-cli onboard --non-interactive
```

### 7. Start Mission Control, then launch instances from the UI

You can start Mission Control on its own first, then use its web UI to bring up each OpenClaw instance individually:

```bash
# Start only Mission Control
docker compose up -d mission-control
```

Open **http://localhost:4000**, go to the **Fleet** tab, and click **▶ Start** on each instance card. The output streams inline so you can see what Docker is doing.

> **Note:** Before starting instances 3 or 4 via Mission Control, make sure their data directories already exist on the host (see Step 2). If they are missing, Mission Control will display a clear error rather than letting Docker produce a cryptic "mounts denied" message. Clicking **▶ Start** on an instance that is already running is also safe — Mission Control detects this and skips the launch rather than returning a name-conflict error.

Alternatively, start everything from the command line in one go:

```bash
# 2 containers + mission control
docker compose up -d

# 3 containers + mission control
docker compose --profile three up -d

# 4 containers + mission control
docker compose --profile four up -d
```

Mission Control is available at **http://localhost:4000**. Use it to paste API keys, launch/stop individual containers, monitor health, view live logs, and ping containers on demand — without touching the command line.

### 8. Verify

In Mission Control's **Fleet** tab, click **↻ Ping All** to trigger an immediate health check across all running instances. Each card shows its current status (`healthy`, `degraded`, `unreachable`) and the time of the last check. You can also click the **↻** button on an individual card to ping just that instance.

Alternatively, from the command line:

```bash
docker compose ps

# Health check each instance
docker compose run --rm openclaw-1-cli doctor
docker compose run --rm openclaw-2-cli doctor
```

---

## Telegram API Key

Each instance that uses a Telegram channel needs its own bot token (`TELEGRAM_BOT_TOKEN`). A Telegram bot can only be connected to one instance at a time.

### Set the key for one instance at a time

Append the key to the `.env` file for whichever instance you want to connect to Telegram:

```bash
# Instance 1
echo "TELEGRAM_BOT_TOKEN=your-token-here" >> data/instance-1/.env

# Instance 2
echo "TELEGRAM_BOT_TOKEN=your-token-here" >> data/instance-2/.env

# Instance 3
echo "TELEGRAM_BOT_TOKEN=your-token-here" >> data/instance-3/.env

# Instance 4
echo "TELEGRAM_BOT_TOKEN=your-token-here" >> data/instance-4/.env
```

If the `.env` file does not exist yet, create it first (see Step 3 of Quick Start), or use the same `echo` command — it will create the file if absent.

To verify the key was written:

```bash
grep TELEGRAM_BOT_TOKEN data/instance-1/.env
```

### Set the key for all 4 instances at once

If you have four separate bot tokens (one per instance), export them as shell variables and write them all in one go:

```bash
TOKEN1=your-token-for-instance-1
TOKEN2=your-token-for-instance-2
TOKEN3=your-token-for-instance-3
TOKEN4=your-token-for-instance-4

echo "TELEGRAM_BOT_TOKEN=${TOKEN1}" >> data/instance-1/.env
echo "TELEGRAM_BOT_TOKEN=${TOKEN2}" >> data/instance-2/.env
echo "TELEGRAM_BOT_TOKEN=${TOKEN3}" >> data/instance-3/.env
echo "TELEGRAM_BOT_TOKEN=${TOKEN4}" >> data/instance-4/.env
```

Or as a single command using a loop (replace each token value inline):

```bash
declare -A TOKENS=(
  [1]="your-token-for-instance-1"
  [2]="your-token-for-instance-2"
  [3]="your-token-for-instance-3"
  [4]="your-token-for-instance-4"
)
for i in 1 2 3 4; do
  echo "TELEGRAM_BOT_TOKEN=${TOKENS[$i]}" >> data/instance-$i/.env
done
```

After updating any `.env` file, restart the affected instance for the change to take effect:

```bash
docker compose restart openclaw-1   # or whichever instance was updated
```

---

## Port Map

| Service | Host Port | URL |
|---|---|---|
| openclaw-1 (Research) | 18789 | http://localhost:18789 |
| openclaw-2 (Coding)   | 18790 | http://localhost:18790 |
| openclaw-3 (Comms)    | 18791 | http://localhost:18791 |
| openclaw-4 (Ops)      | 18792 | http://localhost:18792 |
| Mission Control       | 4000  | http://localhost:4000  |

---

## Connecting to Gateways

Each instance exposes an HTTP gateway on its host port. Connect your clients (apps, bots, CLI tools) to the relevant URL:

| Instance | Gateway URL | Notes |
|---|---|---|
| openclaw-1 (Research)  | http://localhost:18789 | Default instance |
| openclaw-2 (Coding)    | http://localhost:18790 | |
| openclaw-3 (Comms)     | http://localhost:18791 | Requires `--profile three` or `--profile four` |
| openclaw-4 (Ops)       | http://localhost:18792 | Requires `--profile four` |
| Mission Control        | http://localhost:4000  | Web UI — manage all instances |

To verify each gateway is up and accepting connections:

```bash
curl http://localhost:18789/healthz
curl http://localhost:18790/healthz
curl http://localhost:18791/healthz   # if running instance 3
curl http://localhost:18792/healthz   # if running instance 4
```

Or use the CLI doctor command:

```bash
docker compose run --rm openclaw-1-cli doctor
docker compose run --rm openclaw-2-cli doctor
```

To connect from another machine on the same LAN, replace `localhost` with the host machine's IP address (and ensure the ports are not firewalled). To restrict access to localhost only, see the Security Notes section.

---

## CLI Commands Per Instance

All standard OpenClaw CLI commands work — just target the right service:

```bash
# Tail logs
docker compose logs -f openclaw-1
docker compose logs -f openclaw-2

# Restart a gateway
docker compose run --rm openclaw-1-cli gateway restart

# Switch model on instance 2
docker compose run --rm openclaw-2-cli models set anthropic/claude-opus-4-6

# Check channels on instance 3
docker compose --profile three run --rm openclaw-3-cli channels status --probe

# Security audit on instance 1
docker compose run --rm openclaw-1-cli security audit --deep
```

Tip — create shell aliases to reduce typing:

```bash
alias oc1="docker compose run --rm openclaw-1-cli"
alias oc2="docker compose run --rm openclaw-2-cli"
alias oc3="docker compose --profile three run --rm openclaw-3-cli"
alias oc4="docker compose --profile four run --rm openclaw-4-cli"

oc1 doctor
oc2 logs --follow
oc3 gateway restart
```

---

## Stopping

```bash
# Stop all running instances (adjust profiles to match what you started)
docker compose --profile three --profile four down

# Stop just instance 2
docker compose stop openclaw-2
```

---

## Updating

```bash
docker compose pull
docker compose --profile four up -d --force-recreate
```

---

## Use Cases for Multiple Instances

| Instance | Suggested Use |
|---|---|
| 1 | Personal agent — Telegram/WhatsApp, general tasks |
| 2 | Work agent — Slack, work email, separate model/API key |
| 3 | Automation agent — cron jobs, monitoring, read-only tools |
| 4 | Experimental — beta channel, testing new skills |

Each instance has independent channels, models, skills, memory, and cron jobs. A channel (e.g., a Telegram bot) can only be connected to one instance at a time.

---

## Volume Ownership

The `data/instance-N/` directories live on your **host machine** (under `docker/multi/data/`), not inside the container. Docker mounts them into each container at `/root/.openclaw`.

OpenClaw runs as user `node` (uid 1000) inside the container. If that user lacks write access to the mounted host directories, you will see permission errors. Fix them on the host:

```bash
# macOS / Linux — run from docker/multi/
sudo chown -R 1000:1000 data/

# Windows (Docker Desktop with WSL2 backend) — typically not needed
```

---

## Security Notes

- Use a different `OPENCLAW_GATEWAY_TOKEN` for each instance.
- Bind to `127.0.0.1` if you don't need LAN access: change port mapping to `"127.0.0.1:18789:18789"`.
- For hardened container settings (read-only filesystem, capability drops), see [`openclaw-isolation-guide.md`](../../openclaw-isolation-guide.md).
- Never commit `.env` files to version control.
