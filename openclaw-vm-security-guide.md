# OpenClaw VM Security Guide

A practical hardening reference for self-hosted OpenClaw deployments on VMs and VPS instances.

> **Why this matters**: A Shodan scan found 42,665 OpenClaw instances exposed to the public internet, 93.4% of which had authentication bypasses. Unlike cloud chatbots, OpenClaw runs on your hardware and can execute shell commands, read/write files, send emails, and call external APIs. A misconfigured instance can lead to credential theft, data exfiltration, and account abuse.


## Quick Security Audit

Run these before anything else:

```bash
openclaw security audit --deep
openclaw security audit --fix
openclaw doctor
```


## 1. Network Isolation

### Bind to localhost, not all interfaces

OpenClaw should never listen on `0.0.0.0`. Edit your config:

```yaml
# ~/.openclaw/config.yaml
gateway:
  host: 127.0.0.1   # NOT 0.0.0.0
  port: 3000
```

### Firewall with UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh        # or your custom SSH port
sudo ufw enable
sudo ufw status verbose
```

Only open ports that are strictly required. Do not expose the OpenClaw gateway port to the internet.

### Use a VPN for remote access

Access your OpenClaw instance over a VPN (e.g., Tailscale) rather than exposing it directly:

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Then bind OpenClaw to the Tailscale interface IP instead of a public IP.


## 2. VPS / OS Hardening

### Create a non-root user

```bash
adduser clawuser
usermod -aG sudo clawuser
```

Never run OpenClaw as root.

### Harden SSH

```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
Port 2222   # change from default 22
AllowUsers clawuser
```

```bash
sudo systemctl restart sshd
```

Use SSH keys exclusively — no password auth. Moving off port 22 significantly reduces automated scan noise.

### Keep the OS updated

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### Disable unused services

```bash
sudo systemctl list-units --type=service --state=running
sudo systemctl disable <unused-service>
```


## 3. Docker Hardening

The official OpenClaw image runs as a non-root user. Add these flags for further hardening:

```bash
docker run -d \
  --name openclaw \
  --read-only \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --security-opt no-new-privileges:true \
  --network openclaw-net \
  -e OPENCLAW_TOKEN="$OPENCLAW_TOKEN" \
  openclaw/openclaw:latest
```

### Hardened Docker Compose

```yaml
version: "3.8"
services:
  openclaw:
    image: openclaw/openclaw:latest
    restart: unless-stopped
    read_only: true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    security_opt:
      - no-new-privileges:true
    user: "1000:1000"
    networks:
      - openclaw-net
    environment:
      - OPENCLAW_TOKEN=${OPENCLAW_TOKEN}
    tmpfs:
      - /tmp

networks:
  openclaw-net:
    driver: bridge
    internal: false  # set true to block outbound from container
```

### Nginx reverse proxy with security headers

```nginx
server {
    listen 443 ssl http2;
    server_name your.domain.com;

    ssl_certificate     /etc/letsencrypt/live/your.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=openclaw:10m rate=10r/m;
    limit_req zone=openclaw burst=20 nodelay;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'";

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```


## 4. Credential & Secret Management

**Never** store API keys in config files committed to version control.

```bash
# Use environment variables
export OPENCLAW_TOKEN="your-token"
export ANTHROPIC_API_KEY="your-key"

# Or use a .env file with restricted permissions
chmod 600 ~/.openclaw/.env
```

### Secrets checklist

- [ ] API keys stored in environment variables or a secrets manager (Vault, AWS Secrets Manager, etc.)
- [ ] No secrets in `~/.openclaw/config.yaml` or any tracked file
- [ ] `.env` files in `.gitignore`
- [ ] Spending limits set on all LLM API keys where the provider supports it
- [ ] Keys rotated on a schedule (monthly recommended)

### Check for accidental secret exposure

```bash
# Scan git history for secrets
git log --all --full-history -- '*.env'
git grep -i "api_key\|secret\|token\|password" -- ':!*.md'
```


## 5. Skill (MCP) Security

OpenClaw skills can execute arbitrary code. Treat them as untrusted software.

### Before installing any skill

- Review the source code on GitHub before installing
- Check the publisher's reputation and star count
- Prefer skills from the [Anthropic official registry](https://github.com/anthropics/skills/tree/main/skills)
- Avoid skills requesting broad permissions (filesystem, exec, network) unless required

### Scan installed skills

The `awesome-openclaw-security` scanner ([GitHub](https://github.com/munnam77/awesome-openclaw-security)) detects:

```bash
python3 scanner/scan.py --path ~/.openclaw/skills/
```

It flags: `eval`/`exec` calls, `subprocess`/`os.system` usage, outbound HTTP, dynamic imports, reverse shell indicators.

> **Warning**: SecurityWeek reporting found ~800 malicious skills in ClawHub (~20% of the registry as of early 2026).

### Apply least privilege in config

Only enable the tools each agent actually needs:

```yaml
# ~/.openclaw/config.yaml
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
```


## 6. Prompt Injection Defense

OpenClaw processes external content (web pages, emails, user input) that may contain injection attempts.

### Core mitigations

1. **Sandboxing** — keep `sandbox.mode` set to `"non-main"` or `"all"` for any public-facing agent
2. **Tool allowlists** — if an agent doesn't need `exec`, remove it from the allowlist
3. **Explicit approval** — configure high-risk tool calls to require human confirmation:

```yaml
approvals:
  require_for:
    - exec_command
    - delete_file
    - send_email
    - http_post
```

4. **Treat external data as untrusted** — don't let scraped web content directly influence command construction

> System prompt guardrails are soft guidance only. Hard enforcement comes from tool policy, exec approvals, sandboxing, and channel allowlists.


## 7. 3-Tier Defense Matrix (SlowMist Framework)

Based on the [SlowMist OpenClaw Security Practice Guide](https://github.com/slowmist/openclaw-security-practice-guide):

### Tier 1 — Pre-Action (Supply Chain Protection)
- Behavioral blacklists to block known-bad skill patterns
- Strict install audit: verify fingerprint/hash of every skill before activation
- Never install skills from unverified sources

### Tier 2 — In-Action (Runtime Control)
- Permission narrowing during sensitive operations
- Cross-skill preflight verification before tool chaining
- Red-line commands (destructive or irreversible) → require human confirmation
- Yellow-line commands (moderate risk) → proceed with audit logging

### Tier 3 — Post-Action (Detection & Recovery)
- Nightly automated audits across 13 core security metrics
- Anomaly alerts for unexpected tool calls, file modifications, or outbound connections
- Git-based backup of `~/.openclaw` brain data

```bash
# Example nightly audit cron
0 2 * * * openclaw security audit --deep >> /var/log/openclaw-audit.log 2>&1
```


## 8. Tracked CVEs

Five known vulnerability classes affecting OpenClaw deployments (from [awesome-openclaw-security](https://github.com/munnam77/awesome-openclaw-security)):

| CVE Class | CVSS | Description | Mitigation |
|---|---|---|---|
| Gateway WebSocket hijacking | 8.8 | CSRF via WebSocket origin bypass | Enforce `ALLOWED_ORIGINS` config |
| Sandbox escape via import bypass | 9.1 | Dynamic imports bypass skill sandbox | Pin skill versions; use `--read-only` |
| Unauthenticated access | 7.5 | No auth on exposed gateway port | Bind to localhost; use token auth |
| Credential leakage | 6.5 | Secrets in logs or config files | Use env vars; restrict log verbosity |
| Supply chain injection | 8.1 | Malicious skill in ClawHub | Vet skills; use scanner before install |


## 9. Monitoring & Ongoing Maintenance

### Log locations

```bash
~/.openclaw/logs/          # Application logs
/var/log/openclaw-audit.log  # Security audit output (if configured)
journalctl -u openclaw -f    # Systemd service logs
```

### Maintenance schedule

| Frequency | Task |
|---|---|
| Daily | Scan logs for anomalies; check for unexpected outbound connections |
| Weekly | `openclaw update`; apply OS security patches |
| Monthly | Rotate API keys; re-audit installed skills; review tool allowlists |
| On-demand | Run `openclaw security audit --deep` after any skill install or config change |

### Backup

```bash
# Backup OpenClaw state and workspace nightly
tar -czf ~/backups/openclaw-$(date +%F).tar.gz ~/.openclaw/
```

Store backups off-VM (S3, B2, etc.) and test restores periodically.


## 10. Deployment Architecture Reference

```
Internet
    │
    ▼
[UFW Firewall]
    │  (only 443/80 + SSH open)
    ▼
[Nginx reverse proxy]  ← TLS termination, rate limiting, security headers
    │  (proxies to localhost:3000)
    ▼
[OpenClaw Gateway]     ← bound to 127.0.0.1, non-root user, Docker --read-only
    │
    ├──[Approved Skills/MCPs]  ← vetted, allowlisted, sandboxed
    │
    └──[LLM API]               ← key in env var, spending limit set
```

For GPU-heavy workloads: run the Gateway on a minimal VM and route model inference to dedicated GPU nodes or managed APIs (OpenRouter, Bedrock, etc.).


## References

- [OpenClaw Security Docs](https://docs.openclaw.ai/gateway/security) — official threat models and hardening guidance
- [SlowMist Security Practice Guide](https://github.com/slowmist/openclaw-security-practice-guide) — 3-tier defense matrix (agent-facing)
- [awesome-openclaw-security](https://github.com/munnam77/awesome-openclaw-security) — scanner, CVE docs, production configs
- [Hostinger VPS Hardening Guide](https://www.hostinger.com/support/how-to-secure-and-harden-openclaw-security/) — step-by-step for Docker deployments
- [Nebius Architecture & Hardening](https://nebius.com/blog/posts/openclaw-security) — architecture overview and security design
- [3-Tier Implementation Guide](https://aimaker.substack.com/p/openclaw-security-hardening-guide) — battle-tested defense matrix walkthrough
- [5 Steps to Harden OpenClaw on VPS](https://colonelserver.com/blog/steps-to-harden-openclaw-security-on-a-vps/) — quick-start VPS hardening
