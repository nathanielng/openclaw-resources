#!/usr/bin/env python3
"""
OpenClaw Config Generator
A simple tool to generate OpenClaw JSON configuration files for Telegram and Discord.
"""

import json
import sys
from typing import Dict, Any, Optional


class OpenClawConfigGenerator:
    """Generator for OpenClaw JSON configuration files."""

    def __init__(self):
        self.config = {"channels": {}}

    def add_telegram(
        self,
        bot_token: str,
        chat_id: str,
        super_group_id: str,
        enabled: bool = True,
        dm_policy: str = "pairing",
        group_policy: str = "allowlist",
        require_mention: bool = False,
        streaming: str = "partial"
    ) -> 'OpenClawConfigGenerator':
        """
        Add Telegram channel configuration.

        Args:
            bot_token: Telegram bot token (can use $TELEGRAM_TOKEN for env var)
            chat_id: Telegram chat ID (can use $TELEGRAM_CHAT_ID for env var)
            super_group_id: Telegram super group ID (can use $TELEGRAM_SUPER_GROUP_ID for env var)
            enabled: Whether the channel is enabled
            dm_policy: Direct message policy (default: "pairing")
            group_policy: Group policy (default: "allowlist")
            require_mention: Whether to require mention in groups
            streaming: Streaming mode (default: "partial")

        Returns:
            self for method chaining
        """
        self.config["channels"]["telegram"] = {
            "enabled": enabled,
            "dmPolicy": dm_policy,
            "botToken": bot_token,
            "groupPolicy": group_policy,
            "groupAllowFrom": [chat_id],
            "groups": {
                super_group_id: {
                    "requireMention": require_mention
                }
            },
            "streaming": streaming
        }
        return self

    def add_discord(
        self,
        bot_token: str,
        guild_id: str,
        channel_id: str,
        enabled: bool = True,
        dm_policy: str = "pairing",
        guild_policy: str = "allowlist",
        require_mention: bool = False,
        streaming: str = "partial"
    ) -> 'OpenClawConfigGenerator':
        """
        Add Discord channel configuration.

        Args:
            bot_token: Discord bot token (can use $DISCORD_TOKEN for env var)
            guild_id: Discord guild (server) ID (can use $DISCORD_GUILD_ID for env var)
            channel_id: Discord channel ID (can use $DISCORD_CHANNEL_ID for env var)
            enabled: Whether the channel is enabled
            dm_policy: Direct message policy (default: "pairing")
            guild_policy: Guild policy (default: "allowlist")
            require_mention: Whether to require mention in channels
            streaming: Streaming mode (default: "partial")

        Returns:
            self for method chaining
        """
        self.config["channels"]["discord"] = {
            "enabled": enabled,
            "dmPolicy": dm_policy,
            "botToken": bot_token,
            "guildPolicy": guild_policy,
            "guildAllowFrom": [guild_id],
            "guilds": {
                guild_id: {
                    "channels": {
                        channel_id: {
                            "requireMention": require_mention
                        }
                    }
                }
            },
            "streaming": streaming
        }
        return self

    def to_json(self, indent: int = 2) -> str:
        """
        Convert configuration to JSON string.

        Args:
            indent: Number of spaces for indentation

        Returns:
            JSON string representation of the config
        """
        return json.dumps(self.config, indent=indent)

    def to_dict(self) -> Dict[str, Any]:
        """
        Get configuration as dictionary.

        Returns:
            Configuration dictionary
        """
        return self.config

    def save(self, filename: str, indent: int = 2) -> None:
        """
        Save configuration to a JSON file.

        Args:
            filename: Output filename
            indent: Number of spaces for indentation
        """
        with open(filename, 'w') as f:
            json.dump(self.config, f, indent=indent)
        print(f"Configuration saved to {filename}")


def interactive_telegram_config() -> Dict[str, str]:
    """Interactively collect Telegram configuration from user."""
    print("\n=== Telegram Configuration ===")
    print("You can use environment variable references like $TELEGRAM_TOKEN")
    print("or provide actual values.\n")

    bot_token = input("Telegram Bot Token: ").strip() or "$TELEGRAM_TOKEN"
    chat_id = input("Telegram Chat ID: ").strip() or "$TELEGRAM_CHAT_ID"
    super_group_id = input("Telegram Super Group ID: ").strip() or "$TELEGRAM_SUPER_GROUP_ID"

    require_mention = input("Require mention in groups? (y/N): ").strip().lower() == 'y'

    return {
        "bot_token": bot_token,
        "chat_id": chat_id,
        "super_group_id": super_group_id,
        "require_mention": require_mention
    }


def interactive_discord_config() -> Dict[str, Any]:
    """Interactively collect Discord configuration from user."""
    print("\n=== Discord Configuration ===")
    print("You can use environment variable references like $DISCORD_TOKEN")
    print("or provide actual values.\n")

    bot_token = input("Discord Bot Token: ").strip() or "$DISCORD_TOKEN"
    guild_id = input("Discord Guild (Server) ID: ").strip() or "$DISCORD_GUILD_ID"
    channel_id = input("Discord Channel ID: ").strip() or "$DISCORD_CHANNEL_ID"

    require_mention = input("Require mention in channels? (y/N): ").strip().lower() == 'y'

    return {
        "bot_token": bot_token,
        "guild_id": guild_id,
        "channel_id": channel_id,
        "require_mention": require_mention
    }


def interactive_mode():
    """Run the config generator in interactive mode."""
    print("=" * 50)
    print("OpenClaw Configuration Generator")
    print("=" * 50)

    generator = OpenClawConfigGenerator()

    # Ask which channels to configure
    print("\nWhich channels would you like to configure?")
    configure_telegram = input("Configure Telegram? (Y/n): ").strip().lower() != 'n'
    configure_discord = input("Configure Discord? (Y/n): ").strip().lower() != 'n'

    if configure_telegram:
        telegram_config = interactive_telegram_config()
        generator.add_telegram(**telegram_config)

    if configure_discord:
        discord_config = interactive_discord_config()
        generator.add_discord(**discord_config)

    # Display the generated config
    print("\n" + "=" * 50)
    print("Generated Configuration:")
    print("=" * 50)
    print(generator.to_json())

    # Ask if user wants to save
    save = input("\nSave to file? (Y/n): ").strip().lower() != 'n'
    if save:
        filename = input("Output filename (default: openclaw-config.json): ").strip()
        filename = filename or "openclaw-config.json"
        generator.save(filename)


def main():
    """Main entry point."""
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help']:
        print(__doc__)
        print("\nUsage:")
        print("  python openclaw_config_generator.py          # Interactive mode")
        print("  python openclaw_config_generator.py --help   # Show this help")
        print("\nExample programmatic usage:")
        print("""
from openclaw_config_generator import OpenClawConfigGenerator

# Create a config generator
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
print(gen.to_json())
        """)
        return

    interactive_mode()


if __name__ == "__main__":
    main()
