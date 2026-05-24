# Discord & Slack Setup Guide for OpenClaw

> **Note:** This guide was AI-generated and tested in May 2026. It may contain inaccuracies, and platform APIs or configurations may change since that date. Always verify against the [official OpenClaw docs](https://docs.openclaw.ai) and the respective platform documentation before applying changes to your setup.

This guide covers configuring OpenClaw to communicate via **Discord** and **Slack**, including bot creation, config, pairing, group/channel setup, and troubleshooting.

## 1. Overview

| | Discord | Slack |
|---|---|---|
| **Effort** | Medium | Medium-High |
| **Method** | Discord Bot Application | Slack App (Socket Mode) |
| **Key requirement** | Developer Portal access | Workspace Admin permissions |
| **Multi-user** | Easy (role-based) | Easy (workspace-based) |
| **Stability** | Stable | Very Stable |
| **Best for** | Community/team collaboration | Technical teams/workflows |

---

## 2. Discord

### 1. Create a Bot Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**
2. Click **Bot** in the sidebar
3. Scroll to **Privileged Gateway Intents** and enable:
   - ✅ **Message Content Intent** (required)
   - ✅ **Server Members Intent** (recommended)
4. Click **Reset Token** and copy your **Bot Token**

> ⚠️ **Message Content Intent is mandatory.** Without it, the bot receives message events but the content field is empty — the bot appears online but never responds.

### 2. Invite the Bot to Your Server

1. Go to **OAuth2 → URL Generator**
2. Select scopes: `bot` + `applications.commands`
3. Select permissions: **View Channels**, **Send Messages**, **Read Message History**, **Embed Links**, **Attach Files**
4. Copy the generated URL, open it in a browser, and add the bot to your server

### 3. Get Your IDs

Enable Developer Mode: **User Settings → Advanced → Developer Mode** (on)

- **Your User ID**: right-click your avatar → Copy User ID
- **Server ID**: right-click the server icon → Copy Server ID

### 4. Config

Add to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "YOUR_BOT_TOKEN",
      "allowFrom": ["YOUR_USER_ID"],
      "groupPolicy": "allowlist",
      "guilds": {
        "YOUR_SERVER_ID": {
          "requireMention": false,
          "users": ["YOUR_USER_ID"]
        }
      },
      "streaming": {
        "mode": "progress"
      }
    }
  },
  "plugins": {
    "entries": {
      "discord": { "enabled": true }
    }
  }
}
```

> ⚠️ **`allowFrom` controls DM access; `guilds.<id>.users` controls server channel access.** You need both if you want the bot to respond in DMs and server channels.

### 5. Pair for DMs

Message your bot on Discord. It will send a pairing code. Approve it:

```bash
openclaw pairing list discord
openclaw pairing approve discord <CODE>
```

> ⚠️ For DMs to work, ensure **Privacy Settings → Direct Messages** is enabled on your server (right-click server icon → Privacy Settings).

### 6. Owner Privileges

To grant yourself owner-level commands (restart, diagnostics):

```bash
openclaw config set commands.ownerAllowFrom '["discord:YOUR_USER_ID"]'
openclaw gateway restart
```

### 7. Restart

```bash
openclaw gateway restart
```

### Things to Avoid (Discord)

- ❌ Don't set `groupPolicy: "allowlist"` without a `guilds` block — the bot will be silently blocked in all server channels
- ❌ Don't forget to enable **Message Content Intent** in the Developer Portal — without it the bot sees no message text
- ❌ Don't use `requireMention: true` on a private server where it's just you — you'll have to @mention the bot every time
- ❌ If `guilds` has a `channels` sub-block, only listed channels are allowed — omit it to allow all channels in that server
- ❌ Bot tokens are secrets — prefer `DISCORD_BOT_TOKEN` env var over plaintext in config for production

### Troubleshooting (Discord)

**Bot online but doesn't respond in server channels**
- Check `groupPolicy` is `"allowlist"` and your server ID is in `guilds`
- Check your user ID is in `guilds.<id>.users`
- Run `openclaw doctor` to catch config issues

**Bot doesn't respond in DMs**
- Verify your user ID is in `allowFrom`
- Check `dmPolicy` — default is `"pairing"`, so you must complete pairing first
- Enable **Direct Messages** in server Privacy Settings

**"Missing Access" or bot can't see channels**
- Re-invite the bot with correct permissions (View Channels + Read Message History)
- Check channel-level permission overrides in Discord

**Slash commands not appearing**
- Restart the gateway — commands are registered on startup
- Check `commands.native` is `"auto"` or `true`

**Messages not streaming**
- Set `streaming.mode` to `"progress"` for Discord (shows live tool progress)

---

## 3. Slack

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it and select your workspace

### 2. Enable Socket Mode

1. Go to **Settings → Socket Mode** → Enable
2. Generate an **App-Level Token** with scope `connections:write` — copy it (`xapp-...`)

> ⚠️ **Socket Mode is required** for OpenClaw's Slack integration. Without it, you'd need a public URL for webhooks, which defeats the local-first architecture.

### 3. Subscribe to Bot Events

Go to **Event Subscriptions → Subscribe to bot events** and add:
- `message.channels`
- `message.groups`
- `message.im`
- `message.mpim`

### 4. Add OAuth Scopes

Go to **OAuth & Permissions → Bot Token Scopes** and add:
- `chat:write`
- `channels:history`
- `groups:history`
- `im:history`
- `im:read`
- `im:write`

### 5. Install the App

1. Go to **OAuth & Permissions** → **Install to Workspace**
2. Authorize the permissions
3. Copy the **Bot User OAuth Token** (`xoxb-...`)

### 6. Config

Add tokens to `~/.openclaw/.env`:
```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

Add to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "slack": {
      "enabled": true,
      "botToken": "${SLACK_BOT_TOKEN}",
      "appToken": "${SLACK_APP_TOKEN}",
      "dmPolicy": "pairing",
      "streaming": {
        "mode": "partial"
      }
    }
  },
  "plugins": {
    "entries": {
      "slack": { "enabled": true }
    }
  }
}
```

> ⚠️ **You need both tokens** — `botToken` (`xoxb-`) for sending messages and `appToken` (`xapp-`) for the Socket Mode WebSocket connection. Missing either will silently fail.

### 7. Restart and Invite

```bash
openclaw gateway restart
```

Invite the bot to a channel:
```
/invite @YourBotName
```

### 8. Pair Your Account

Message the bot in a DM. It will reply with a pairing code:

```bash
openclaw pairing list slack
openclaw pairing approve slack <CODE>
```

### Things to Avoid (Slack)

- ❌ Don't skip Socket Mode — without it OpenClaw has no way to receive events
- ❌ Don't confuse the two tokens: `xoxb-` is the Bot Token, `xapp-` is the App-Level Token — they are not interchangeable
- ❌ Don't forget to subscribe to `message.im` events — without it the bot won't receive DMs
- ❌ Don't forget to `/invite` the bot to channels — Slack bots can only see channels they've been explicitly added to
- ❌ Don't use `dmPolicy: "open"` in a shared workspace — anyone in the workspace could message your agent

### Troubleshooting (Slack)

**Bot doesn't respond to DMs**
- Verify `message.im` is in your event subscriptions
- Check pairing: `openclaw pairing list slack`
- Verify `im:history` and `im:read` scopes are granted

**Bot doesn't respond in channels**
- Ensure the bot has been `/invite`d to the channel
- Verify `message.channels` (public) or `message.groups` (private) events are subscribed
- Check `channels:history` or `groups:history` scopes

**"not_authed" or "invalid_auth" errors**
- Regenerate the Bot Token and App-Level Token
- Ensure tokens in `.env` don't have trailing whitespace or quotes

**Socket disconnects / bot goes offline**
- Check `openclaw logs --follow` for WebSocket errors
- Verify the App-Level Token has `connections:write` scope
- Restart the gateway: `openclaw gateway restart`

**Bot responds but can't post messages**
- Verify `chat:write` scope is granted
- Check the bot hasn't been restricted by a workspace admin

---

## 4. General Notes

- **After any config change:** `openclaw gateway restart` (no hot reload)
- **Owner privileges** (`commands.ownerAllowFrom`) are separate from channel access — they grant admin commands like restart and diagnostics
- **`groupAllowFrom`** (Telegram-style numeric IDs) vs **`guilds.<id>.users`** (Discord string IDs) — each channel has its own access control format
- Use `openclaw doctor` to validate your config after changes
