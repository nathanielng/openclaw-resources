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

### 1. Create the data directories

Each instance needs its own directory for config, state, and workspace files.

```bash
mkdir -p data/instance-1 data/instance-2 data/instance-3 data/instance-4
```

### 2. Create a `.env` file for each instance

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

### 3. Pull the image

```bash
docker compose pull
```

### 4. Run the onboarding wizard per instance

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

### 5. Start the containers

```bash
# 2 containers (instances 1 and 2)
docker compose up -d

# 3 containers
docker compose --profile three up -d

# 4 containers
docker compose --profile four up -d
```

### 6. Verify

```bash
docker compose ps

# Health check each instance
docker compose run --rm openclaw-1-cli doctor
docker compose run --rm openclaw-2-cli doctor
```

---

## Port Map

| Instance | Host Port | URL |
|---|---|---|
| 1 | 18789 | http://localhost:18789 |
| 2 | 18790 | http://localhost:18790 |
| 3 | 18791 | http://localhost:18791 |
| 4 | 18792 | http://localhost:18792 |

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

OpenClaw runs as user `node` (uid 1000) inside the container. If you see permission errors on the data directories:

```bash
# macOS / Linux
sudo chown -R 1000:1000 data/

# Windows (Docker Desktop with WSL2 backend) — typically not needed
```

---

## Security Notes

- Use a different `OPENCLAW_GATEWAY_TOKEN` for each instance.
- Bind to `127.0.0.1` if you don't need LAN access: change port mapping to `"127.0.0.1:18789:18789"`.
- For hardened container settings (read-only filesystem, capability drops), see [`openclaw-isolation-guide.md`](openclaw-isolation-guide.md).
- Never commit `.env` files to version control.
