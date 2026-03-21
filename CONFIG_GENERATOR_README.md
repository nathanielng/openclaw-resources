# OpenClaw Config Generator

A Python tool to easily generate OpenClaw JSON configuration files for Telegram and Discord channels.

## Features

- 🌐 **Streamlit Web UI**: Point-and-click config generation in your browser
- 🤖 **Interactive CLI**: Step-by-step prompts to create your config
- 📝 **Programmatic API**: Use in your own Python scripts
- 🔐 **Environment Variables**: Support for `$VARIABLE` references
- ⚡ **Simple & Fast**: Generate configs in seconds

## Quick Start

### Streamlit Web UI (Recommended)

Install dependencies and launch the browser-based UI:

```bash
pip install -r scripts/requirements.txt
streamlit run scripts/streamlit_app.py
```

Fill in your tokens and IDs, preview the JSON live, and download `openclaw-config.json` directly.

### Interactive CLI

Run the script without arguments for a terminal prompt experience:

```bash
python scripts/openclaw_config_generator.py
```

You'll be prompted to enter:
- **For Telegram**: Bot Token, Chat ID, Super Group ID
- **For Discord**: Bot Token, Guild ID, Channel ID

### Example Output

For Telegram, the generator creates:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "botToken": "$TELEGRAM_TOKEN",
      "groupPolicy": "allowlist",
      "groupAllowFrom": [
        "$TELEGRAM_CHAT_ID"
      ],
      "groups": {
        "$TELEGRAM_SUPER_GROUP_ID": {
          "requireMention": false
        }
      },
      "streaming": "partial"
    }
  }
}
```

## Programmatic Usage

You can also use the generator in your own Python scripts:

```python
from scripts.openclaw_config_generator import OpenClawConfigGenerator

# Create a new generator
gen = OpenClawConfigGenerator()

# Add Telegram configuration
gen.add_telegram(
    bot_token="$TELEGRAM_TOKEN",
    chat_id="$TELEGRAM_CHAT_ID",
    super_group_id="$TELEGRAM_SUPER_GROUP_ID",
    require_mention=False
)

# Add Discord configuration
gen.add_discord(
    bot_token="$DISCORD_TOKEN",
    guild_id="$DISCORD_GUILD_ID",
    channel_id="$DISCORD_CHANNEL_ID",
    require_mention=True
)

# Save to file
gen.save("openclaw-config.json")

# Or get as JSON string
config_json = gen.to_json()
print(config_json)
```

## API Reference

### OpenClawConfigGenerator

#### `add_telegram(bot_token, chat_id, super_group_id, **options)`

Add Telegram channel configuration.

**Parameters:**
- `bot_token` (str): Telegram bot token (e.g., `"$TELEGRAM_TOKEN"`)
- `chat_id` (str): Telegram chat ID (e.g., `"$TELEGRAM_CHAT_ID"`)
- `super_group_id` (str): Telegram super group ID (e.g., `"$TELEGRAM_SUPER_GROUP_ID"`)
- `enabled` (bool, optional): Enable/disable channel (default: `True`)
- `dm_policy` (str, optional): DM policy (default: `"pairing"`)
- `group_policy` (str, optional): Group policy (default: `"allowlist"`)
- `require_mention` (bool, optional): Require mention in groups (default: `False`)
- `streaming` (str, optional): Streaming mode (default: `"partial"`)

**Returns:** `self` for method chaining

#### `add_discord(bot_token, guild_id, channel_id, **options)`

Add Discord channel configuration.

**Parameters:**
- `bot_token` (str): Discord bot token (e.g., `"$DISCORD_TOKEN"`)
- `guild_id` (str): Discord guild/server ID (e.g., `"$DISCORD_GUILD_ID"`)
- `channel_id` (str): Discord channel ID (e.g., `"$DISCORD_CHANNEL_ID"`)
- `enabled` (bool, optional): Enable/disable channel (default: `True`)
- `dm_policy` (str, optional): DM policy (default: `"pairing"`)
- `guild_policy` (str, optional): Guild policy (default: `"allowlist"`)
- `require_mention` (bool, optional): Require mention in channels (default: `False`)
- `streaming` (str, optional): Streaming mode (default: `"partial"`)

**Returns:** `self` for method chaining

#### `to_json(indent=2)`

Convert configuration to JSON string.

**Returns:** JSON string

#### `to_dict()`

Get configuration as a Python dictionary.

**Returns:** Configuration dictionary

#### `save(filename, indent=2)`

Save configuration to a JSON file.

**Parameters:**
- `filename` (str): Output filename
- `indent` (int, optional): JSON indentation (default: 2)

## Examples

### Example 1: Telegram Only

```python
from scripts.openclaw_config_generator import OpenClawConfigGenerator

gen = OpenClawConfigGenerator()
gen.add_telegram(
    bot_token="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    chat_id="-1001234567890",
    super_group_id="-1001234567890"
)
gen.save("telegram-config.json")
```

### Example 2: Discord Only

```python
from scripts.openclaw_config_generator import OpenClawConfigGenerator

gen = OpenClawConfigGenerator()
gen.add_discord(
    bot_token="MTIzNDU2Nzg5MDEyMzQ1Njc4.Xyz123.Abc456def789",
    guild_id="123456789012345678",
    channel_id="987654321098765432",
    require_mention=True
)
gen.save("discord-config.json")
```

### Example 3: Both Telegram and Discord

```python
from scripts.openclaw_config_generator import OpenClawConfigGenerator

gen = OpenClawConfigGenerator()

# Method chaining
gen.add_telegram(
    bot_token="$TELEGRAM_TOKEN",
    chat_id="$TELEGRAM_CHAT_ID",
    super_group_id="$TELEGRAM_SUPER_GROUP_ID"
).add_discord(
    bot_token="$DISCORD_TOKEN",
    guild_id="$DISCORD_GUILD_ID",
    channel_id="$DISCORD_CHANNEL_ID"
).save("full-config.json")
```

## Environment Variables

The generator supports using environment variable references in your config:

- Telegram: `$TELEGRAM_TOKEN`, `$TELEGRAM_CHAT_ID`, `$TELEGRAM_SUPER_GROUP_ID`
- Discord: `$DISCORD_TOKEN`, `$DISCORD_GUILD_ID`, `$DISCORD_CHANNEL_ID`

These will be preserved in the JSON output and resolved by OpenClaw at runtime.

## Requirements

- Python 3.6+
- No external dependencies (uses only standard library)

## License

MIT
