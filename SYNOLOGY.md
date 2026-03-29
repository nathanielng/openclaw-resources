# Running OpenClaw on a Synology NAS

---

> [!WARNING]
> **AI-GENERATED GUIDE — NOT VALIDATED**
>
> This guide was created by an AI assistant and has **not been tested or verified** on actual Synology hardware. Steps may be incomplete, inaccurate, or outdated. Commands, paths, and UI labels may differ from your DSM version. **Do not rely on this guide for production setups without independently verifying each step.** Always consult the [official OpenClaw documentation](https://docs.openclaw.ai) and [Synology documentation](https://kb.synology.com) as primary references.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Container Manager](#2-install-container-manager)
3. [Prepare Storage](#3-prepare-storage)
4. [Create the Docker Compose File](#4-create-the-docker-compose-file)
5. [Configure OpenClaw](#5-configure-openclaw)
6. [Run the Onboarding Wizard](#6-run-the-onboarding-wizard)
7. [Start the Gateway](#7-start-the-gateway)
8. [Set Up Synology Chat Channel](#8-set-up-synology-chat-channel)
9. [Reverse Proxy with DSM (Optional)](#9-reverse-proxy-with-dsm-optional)
10. [Auto-Start on Boot](#10-auto-start-on-boot)
11. [Updating OpenClaw](#11-updating-openclaw)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| **Synology DSM** | DSM 7.2 or later recommended |
| **NAS architecture** | x86-64 (most Plus/XS models). ARM-based NAS devices may work but are less tested. |
| **RAM** | 4 GB minimum; 8 GB+ recommended |
| **Container Manager** | Version 20.10+ (provides Docker and Docker Compose v2) |
| **SSH access** | Enabled in DSM → Control Panel → Terminal & SNMP |
| **AI provider API key** | Anthropic, OpenAI, OpenRouter, or another [supported provider](https://docs.openclaw.ai) |

Check your NAS architecture via DSM → Control Panel → Info Center → General.

---

## 2. Install Container Manager

1. Open **Package Center** in DSM.
2. Search for **Container Manager**.
3. Click **Install** and follow the prompts.
4. Once installed, Container Manager appears in the main menu.

> **Note**: On older DSM versions Container Manager may be called **Docker**. The steps are largely the same.

---

## 3. Prepare Storage

OpenClaw stores its configuration, secrets, and workspace files in a persistent directory. Create a dedicated folder on your NAS.

### Via DSM File Station

1. Open **File Station**.
2. Navigate to a shared folder (e.g., `docker` on `volume1`).
3. Create a new folder: `docker/openclaw`.
4. Inside it, create a subfolder: `docker/openclaw/data`.

### Via SSH

```bash
ssh admin@<your-nas-ip>
mkdir -p /volume1/docker/openclaw/data
```

This path (`/volume1/docker/openclaw/data`) maps to `~/.openclaw` inside the container.

---

## 4. Create the Docker Compose File

SSH into your NAS and create the Compose file:

```bash
mkdir -p /volume1/docker/openclaw
cd /volume1/docker/openclaw
```

Create `docker-compose.yml`:

```yaml
services:
  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: openclaw
    restart: unless-stopped
    ports:
      - "18789:18789"
    volumes:
      - /volume1/docker/openclaw/data:/root/.openclaw
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:18789/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

  openclaw-cli:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: openclaw-cli
    profiles:
      - cli
    volumes:
      - /volume1/docker/openclaw/data:/root/.openclaw
    env_file:
      - .env
    entrypoint: ["openclaw"]
    network_mode: "service:openclaw"
```

> **Note**: The `openclaw-cli` service uses a `cli` profile so it only runs on demand (see commands below), not as a background daemon.

---

## 5. Configure OpenClaw

Create the `.env` file with your API key(s):

```bash
cd /volume1/docker/openclaw
cat > .env << 'EOF'
# AI provider — add the key(s) for your chosen provider
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# OPENROUTER_API_KEY=sk-or-...

# Optional: set a gateway auth token
# OPENCLAW_GATEWAY_TOKEN=change-me-to-something-random

# Optional: timezone
TZ=Asia/Singapore
EOF
chmod 600 .env
```

> **Security**: `.env` contains secrets. Restrict file permissions and do not commit it to version control.

---

## 6. Run the Onboarding Wizard

Pull the image and run the interactive setup:

```bash
cd /volume1/docker/openclaw

# Pull the latest image
docker compose pull

# Run the onboarding wizard
docker compose run --rm openclaw-cli onboard
```

The wizard will guide you through:
- Choosing your AI model provider
- Setting your API key
- Configuring a messaging channel
- Creating an initial agent

For a non-interactive (headless) setup:

```bash
docker compose run --rm openclaw-cli onboard --non-interactive
```

---

## 7. Start the Gateway

```bash
cd /volume1/docker/openclaw
docker compose up -d
```

Verify it is running:

```bash
docker compose ps
docker compose run --rm openclaw-cli doctor
```

Tail the logs:

```bash
docker compose logs -f openclaw
# or via the CLI
docker compose run --rm openclaw-cli logs --follow
```

The gateway is now reachable at `http://<your-nas-ip>:18789`.

---

## 8. Set Up Synology Chat Channel

Synology Chat is a first-class supported channel in OpenClaw. This lets you message your AI agent directly from the Synology Chat app on your phone or desktop.

### 8.1 Create a Synology Chat Incoming Webhook

1. Open **Synology Chat** on your NAS.
2. Go to your username (top-right) → **Integration** → **Incoming Webhooks**.
3. Click **+** to add a new webhook. Give it a name (e.g., `OpenClaw`).
4. Copy the **webhook URL**.

### 8.2 Create an Outgoing Webhook

1. In Synology Chat → Integration → **Outgoing Webhooks**.
2. Add a new outgoing webhook:
   - **Trigger word**: leave blank to receive all messages, or set a prefix like `claw`
   - **URL**: `http://localhost:18789/webhooks/synology-chat`
     (use the NAS LAN IP if OpenClaw runs outside Docker's internal network)
3. Copy the **secret token**.

### 8.3 Configure OpenClaw

Add the credentials to `.env`:

```bash
SYNOLOGY_CHAT_INCOMING_WEBHOOK_URL=https://your-nas/webapi/...
SYNOLOGY_CHAT_OUTGOING_TOKEN=your-secret-token
```

Then add the channel:

```bash
docker compose run --rm openclaw-cli channels add
# select "Synology Chat" and follow the prompts
```

Or configure manually in `/volume1/docker/openclaw/data/openclaw.json`:

```json5
channels: {
  synologyChat: {
    incomingWebhookUrl: "${SYNOLOGY_CHAT_INCOMING_WEBHOOK_URL}",
    outgoingToken: "${SYNOLOGY_CHAT_OUTGOING_TOKEN}",
    enabled: true,
    dmPolicy: "pairing"
  }
}
```

Restart the gateway:

```bash
docker compose run --rm openclaw-cli gateway restart
```

---

## 9. Reverse Proxy with DSM (Optional)

If you want to access OpenClaw over HTTPS without exposing port 18789 directly, use DSM's built-in reverse proxy.

1. Open **Control Panel** → **Login Portal** → **Advanced** → **Reverse Proxy**.
2. Click **Create**.
3. Fill in:
   - **Source**: Protocol `HTTPS`, hostname `openclaw.your-domain.com`, port `443`
   - **Destination**: Protocol `HTTP`, hostname `localhost`, port `18789`
4. Under the **Custom Header** tab, add:
   - `Upgrade: $http_upgrade`
   - `Connection: Upgrade`
   (These are needed for WebSocket support used by the OpenClaw dashboard and TUI.)
5. Save and ensure your router forwards port 443 to the NAS.

> For a Let's Encrypt certificate, go to **Control Panel** → **Security** → **Certificate** and add a certificate for your domain.

---

## 10. Auto-Start on Boot

The `restart: unless-stopped` policy in the Compose file ensures the container restarts automatically after a NAS reboot **as long as Container Manager starts on boot**.

To verify Container Manager starts on boot:

1. DSM → **Package Center** → **Installed**.
2. Find **Container Manager** → click the gear icon → **Auto-start**.

Alternatively, use a DSM **Task Scheduler** trigger:

1. **Control Panel** → **Task Scheduler** → **Create** → **Triggered Task** → **User-defined script**.
2. **Event**: Boot-up.
3. **User**: `root`.
4. **Script**:
   ```bash
   cd /volume1/docker/openclaw && docker compose up -d
   ```

---

## 11. Updating OpenClaw

```bash
cd /volume1/docker/openclaw

# Pull the latest image
docker compose pull

# Recreate the container with the new image
docker compose up -d --force-recreate

# Or use the built-in update command
docker compose run --rm openclaw-cli update
```

---

## 12. Troubleshooting

### Container fails to start

```bash
docker compose logs openclaw
```

Check for missing environment variables or permission errors on the data volume.

### Permission errors on `/volume1/docker/openclaw/data`

OpenClaw runs as user `node` (uid 1000) inside the container. Ensure the host directory is owned by uid 1000:

```bash
chown -R 1000:1000 /volume1/docker/openclaw/data
```

### Port 18789 conflict

If another service occupies port 18789, change the host port in `docker-compose.yml`:

```yaml
ports:
  - "18790:18789"   # host:container
```

Then update any reverse proxy or firewall rules accordingly.

### Cannot reach gateway from LAN

1. Check DSM **Firewall** rules (Control Panel → Security → Firewall) — ensure port 18789 is allowed.
2. Confirm the container is running: `docker compose ps`.
3. Run `docker compose run --rm openclaw-cli gateway probe`.

### Health check

```bash
docker compose run --rm openclaw-cli doctor
docker compose run --rm openclaw-cli gateway health
docker compose run --rm openclaw-cli channels status --probe
```

### Synology Chat webhook not receiving messages

- Confirm the outgoing webhook URL matches the gateway address reachable from the NAS (use `http://172.17.0.1:18789` or the NAS LAN IP if `localhost` resolves incorrectly inside DSM).
- Verify the secret token in `.env` matches what Synology Chat shows.

---

## Quick Reference

```bash
# Start / stop
docker compose up -d
docker compose down

# CLI shorthand (run from /volume1/docker/openclaw)
alias oc="docker compose run --rm openclaw-cli"

oc doctor                        # Health check
oc gateway restart               # Restart gateway
oc logs --follow                 # Tail logs
oc channels status --probe       # Test channels
oc models set anthropic/claude-opus-4-6
oc security audit --deep
```

---

*For full CLI reference see [openclaw-cli-help-docker.md](openclaw-cli-help-docker.md). For security hardening see [openclaw-vm-security-guide.md](openclaw-vm-security-guide.md).*
