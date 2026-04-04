# OpenClaw Multi-Instance — Learnings & Reference

Compiled from the Mission Control build session on 2026-04-04.

---

## 1. Architecture Overview

- **4 OpenClaw instances** running via Docker Compose on a single Docker Desktop host
- **Mission Control** (Node.js/Express + WebSocket) at `http://localhost:4000` manages all instances
- Each instance is fully independent: own port, config, agents, channels, API keys
- Data lives on the host at `docker/multi/data/instance-N/`, mounted into containers at `/home/node/.openclaw`

### Port Map

| Service              | Host Port | Internal Port |
|----------------------|-----------|---------------|
| openclaw-1 (Research)| 18789     | 18789         |
| openclaw-2 (Coding)  | 18790     | 18789         |
| openclaw-3 (Comms)   | 18791     | 18789         |
| openclaw-4 (Ops)     | 18792     | 18789         |
| Mission Control      | 4000      | 4000          |

### Docker Compose Profiles

| CLI Service       | Profile(s)            |
|-------------------|-----------------------|
| openclaw-1-cli    | `cli`                 |
| openclaw-2-cli    | `cli`                 |
| openclaw-3-cli    | `cli-three`, `cli-four` |
| openclaw-4-cli    | `cli-four`            |

---

## 2. Two Log Systems

OpenClaw has **two separate log outputs**:

### Docker logs (stdout/stderr)
- Accessed via `docker logs --follow <container>`
- Contains startup messages, gateway binding, Telegram provider start, bonjour
- **Does NOT contain** agent interactions, token usage, pairing requests, or tool errors
- Human-readable, one line per entry

### Internal log file
- Located at `/tmp/openclaw/openclaw-YYYY-MM-DD.log` **inside the container**
- **Not** on the mounted volume — lives in the container's ephemeral `/tmp`
- Structured JSON, one JSON object per line
- Contains everything: agent runs, Telegram pairing requests, tool errors, DM access events
- Date-stamped filename rotates daily

### JSON log format
```json
{
  "0": "{\"module\":\"telegram-auto-reply\"}",
  "1": {"chatId":"9162324","username":"natng","matchKey":"none"},
  "2": "telegram pairing request",
  "_meta": {"logLevelName":"INFO","path":{"fileName":"dm-access.ts"}},
  "time": "2026-04-04T03:28:50.925+00:00"
}
```
- `"2"` = message text
- `"1"` = metadata object or string
- `_meta.path.fileName` = source file
- `time` = ISO timestamp

### Accessing internal logs from Mission Control
- Use `docker exec <container> tail -n 200 -f /tmp/openclaw/openclaw-YYYY-MM-DD.log`
- Parse JSON lines into readable format: `{time} [{fileName}] {message} {metadata}`
- Internal logs are shown per-instance only (not on "All" view) to avoid clutter

---

## 3. Telegram Pairing

### How it actually works
- There is **no pairing code** exchanged. The original regex `/pairing code[:\s]+([A-Z0-9]{6,10})/i` never matches anything.
- When a new user messages the bot, OpenClaw logs `telegram pairing request` with user metadata (`chatId`, `username`, `firstName`, `matchKey: "none"`)
- The admin approves users via CLI: `openclaw pairing approve telegram <code>`
- A Telegram bot token can only be connected to **one instance** at a time

### Approval command
```bash
# Instance 1 or 2
docker compose --profile cli run --rm openclaw-1-cli pairing approve telegram <code>

# Instance 3
docker compose --profile cli-three run --rm openclaw-3-cli pairing approve telegram <code>

# Instance 4
docker compose --profile cli-four run --rm openclaw-4-cli pairing approve telegram <code>
```

### Common issues
- **Bot doesn't respond to /start**: User hasn't been approved/paired yet. Check `sessions.json` — if the only session origin is `heartbeat`, no Telegram user has been paired.
- **409 Conflict errors**: Two processes polling `getUpdates` on the same bot token simultaneously. Self-resolves in seconds. Caused by external `curl` calls to the Telegram API competing with OpenClaw's polling loop.
- **Bot starts but no bot name in logs** (`starting provider` vs `starting provider (@botname)`): Token may be invalid or not loaded properly.

---

## 4. OpenRouter Integration

### Credits API — account-level (NOT per-key)
```
GET https://openrouter.ai/api/v1/credits
Authorization: Bearer <any-api-key>

Response: {"data": {"total_credits": 42.37, "total_usage": 24.38}}
```
Returns the **same numbers** regardless of which key is used — it's account-wide.

### Per-key usage API — the correct endpoint
```
GET https://openrouter.ai/api/v1/key
Authorization: Bearer <specific-api-key>

Response: {"data": {"usage": 0.004, "usage_daily": 0.002, "usage_weekly": 0.004, "usage_monthly": 0.004, "limit": null, "limit_remaining": null, ...}}
```
- Works with regular API keys (no management key needed)
- Returns usage for **that specific key only**
- Includes `usage_daily`, `usage_weekly`, `usage_monthly` breakdowns
- Requires **separate API keys per instance** to get per-instance breakdown

### Per-key usage via management key
```
GET https://openrouter.ai/api/v1/keys
Authorization: Bearer <management-key>
```
Lists all keys with per-key `usage` fields. Also supports `api_key_hash` filtering on the activity endpoint.

### Config in openclaw.json
The provider block must be written in a **single `config set` command** because validation runs on every call:
```bash
docker compose run --rm openclaw-1-cli config set models.providers.openrouter \
  '{"baseUrl":"https://openrouter.ai/api/v1","apiKey":"${OPENROUTER_API_KEY}","api":"openai-completions","models":["minimax/minimax-m2.7"]}'
```
`${OPENROUTER_API_KEY}` is a **literal string** stored in `openclaw.json` — OpenClaw expands it at runtime from the container's environment. Single quotes prevent shell expansion.

---

## 5. Gateway WebSocket RPC Protocol

The gateway does **NOT** have a REST API. All `/api/v1/*` HTTP endpoints return 404. Communication is via WebSocket RPC.

### Connection flow
1. Connect to `ws://openclaw-N:18789` (with `Origin` header matching an allowed origin)
2. Receive: `{"type":"event","event":"connect.challenge","payload":{"nonce":"...","ts":...}}`
3. Send connect request:
```json
{
  "type": "req", "id": "unique-id", "method": "connect",
  "params": {
    "minProtocol": 3, "maxProtocol": 3,
    "client": {"id": "openclaw-control-ui", "version": "1.0", "platform": "linux", "mode": "webchat"},
    "role": "operator",
    "scopes": ["operator.read", "operator.write", "operator.admin"],
    "auth": {"token": "<gateway-token>"},
    "caps": ["tool-events"]
  }
}
```
4. Receive `hello-ok` with method list, events list, and state snapshot

### Required gateway config
```json
"gateway": {
  "controlUi": {
    "allowedOrigins": ["http://openclaw-N:18789", "http://localhost:4000"],
    "allowInsecureAuth": true,
    "dangerouslyDisableDeviceAuth": true
  }
}
```
Without these, the `openclaw-control-ui` client requires HTTPS + device identity (crypto keypair).

### Client IDs and their restrictions
| Client ID              | Origin check | Device identity | Scopes granted |
|------------------------|-------------|-----------------|----------------|
| `openclaw-control-ui`  | Yes         | Yes (unless disabled) | Full (read/write/admin) |
| `webchat`              | Yes         | No              | Read-only |
| `cli`                  | Yes         | No              | Origin-blocked from non-localhost |
| `gateway-client`       | Yes         | No              | Origin-blocked |

### Sending a message
```json
{
  "type": "req", "id": "unique-id", "method": "chat.send",
  "params": {
    "sessionKey": "agent:main:main",
    "message": "What is 2+2?",
    "idempotencyKey": "uuid"
  }
}
```
Response: `{"ok": true, "payload": {"runId": "...", "status": "started"}}`
Then streaming `chat` events with `state: "delta"` and `state: "final"`.

### Available methods (partial list)
- `chat.send`, `chat.history`, `chat.abort`
- `sessions.list`, `sessions.send`, `sessions.create`, `sessions.delete`
- `usage.status`, `usage.cost`
- `models.list`, `config.get`, `config.set`
- `channels.status`, `channels.logout`
- `cron.list`, `cron.add`, `cron.run`
- `device.pair.list`, `device.pair.approve`, `device.pair.reject`
- `node.pair.approve`, `node.pair.reject`
- `logs.tail`, `health`, `status`

### Available events
- `chat`, `session.message`, `session.tool`
- `health`, `heartbeat`, `tick`
- `device.pair.requested`, `device.pair.resolved`
- `node.pair.requested`, `node.pair.resolved`
- `exec.approval.requested`, `exec.approval.resolved`
- `update.available`, `shutdown`

---

## 6. File System Layout

```
docker/multi/
├── docker-compose.yml
├── mission-control/
│   ├── server.js              # Express + WebSocket server
│   ├── Dockerfile
│   └── public/
│       ├── index.html         # SPA shell
│       ├── app.js             # Frontend logic
│       └── style.css          # Styles
├── data/
│   ├── .mission-control/
│   │   ├── kanban.json        # Kanban board state
│   │   └── pairings.json      # Persisted pairing requests
│   ├── instance-1/
│   │   ├── .env               # API keys, tokens
│   │   ├── openclaw.json      # Instance config
│   │   ├── workspace/
│   │   │   └── MEMORY.md      # Agent memory file (must exist)
│   │   ├── telegram/
│   │   │   ├── update-offset-default.json
│   │   │   └── command-hash-default-*.txt
│   │   └── agents/main/sessions/
│   │       ├── sessions.json  # Session index
│   │       └── *.jsonl        # Session transcripts
│   ├── instance-2/ ...
│   ├── instance-3/ ...
│   └── instance-4/ ...
```

### Key files
- **`openclaw.json`** — main config. On host at `data/instance-N/openclaw.json`, mounted at `/home/node/.openclaw/openclaw.json`
- **`.env`** — environment variables (API keys, bot tokens). Not inside the container image.
- **`MEMORY.md`** — agent reads this on startup. If missing, causes `ENOENT` errors. Create empty if needed.
- **`sessions.json`** — shows active sessions. `origin.provider` reveals which channel is connected (telegram, heartbeat, api).
- **`update-offset-default.json`** — Telegram polling offset. Contains `lastUpdateId` and `botId`.

---

## 7. Mission Control Implementation Notes

### WebSocket reconnection
- `ws` is a module-scope `let` variable, reassigned on reconnect
- All handlers reference `ws` directly, so they always use the current connection
- Log subscriptions must be re-sent after reconnect

### Log stream lifecycle
- `ensureLogStream()` is async — must be `await`ed before accessing `logStreams.get()`
- If container isn't running, returns early with no retry. Pending subscribers tracked in `pendingLogSubs` map.
- Polling interval (10s) checks if containers have started and connects pending subscribers.
- Each stream has a 200-line `history` ring buffer, replayed to new subscribers.

### Streaming POST helper (`streamingPost`)
- Used for docker compose operations (start/stop/build)
- Sends POST, reads response as streaming text, appends to a `<pre>` element
- Shows the `<pre>` element, scrolls to bottom on each chunk

### Cost tracking
- Polls `GET /api/v1/key` per instance every 60 seconds
- Reads `OPENROUTER_API_KEY` from each instance's `.env` file
- Broadcasts `cost_update` to all WebSocket clients every 15 seconds

### Pairings persistence
- Stored in `data/.mission-control/pairings.json`
- Loaded on startup, saved after every mutation
- Survives container rebuilds (on mounted volume)

---

## 8. Common Gotchas

1. **All `docker compose` commands must run from `docker/multi/`** — the compose file sets `name: openclaw-multi` but still needs consistent working directory.

2. **Container name conflicts** — if `docker compose run` fails with "container name already in use", run `docker rm -f openclaw-N` first.

3. **Config validation** — `config set` validates the entire provider object on every call. Set the whole block at once, not field by field.

4. **Volume ownership** — OpenClaw runs as uid 1000 (`node`). Fix with `sudo chown -R 1000:1000 data/`.

5. **MEMORY.md must exist** — create empty `data/instance-N/workspace/MEMORY.md` for each instance or the agent throws ENOENT.

6. **Internal logs are ephemeral** — `/tmp/openclaw/` is inside the container, not on the mounted volume. Lost on container restart.

7. **Telegram 409 conflicts** — any external `getUpdates` call (curl, debug scripts) will conflict with OpenClaw's polling. Self-resolves in ~3 seconds.

8. **CSS log filtering** — log lines use `data-instance` attribute and CSS `data-filter` on `#log-box` to show/hide. Internal log lines have `.internal` class, hidden on "All" view via `#log-box:not([data-filter]) .log-line.internal { display: none; }`.
