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

### 7. Start the containers

```bash
# 2 containers (instances 1 and 2) + mission control
docker compose up -d

# 3 containers + mission control
docker compose --profile three up -d

# 4 containers + mission control
docker compose --profile four up -d
```

Mission Control is available at **http://localhost:4000** once the stack is up. Use it to paste API keys, launch/stop the fleet, monitor health, and view live logs — without touching the command line.

### 8. Verify

```bash
docker compose ps

# Health check each instance
docker compose run --rm openclaw-1-cli doctor
docker compose run --rm openclaw-2-cli doctor
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
