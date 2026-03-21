#!/usr/bin/env python3
"""
Example usage of the OpenClaw Config Generator
"""

from openclaw_config_generator import OpenClawConfigGenerator


def example_telegram_only():
    """Example: Generate config for Telegram only"""
    print("Example 1: Telegram Only Configuration")
    print("-" * 50)

    gen = OpenClawConfigGenerator()
    gen.add_telegram(
        bot_token="$TELEGRAM_TOKEN",
        chat_id="$TELEGRAM_CHAT_ID",
        super_group_id="$TELEGRAM_SUPER_GROUP_ID",
        require_mention=False
    )

    print(gen.to_json())
    print()


def example_discord_only():
    """Example: Generate config for Discord only"""
    print("Example 2: Discord Only Configuration")
    print("-" * 50)

    gen = OpenClawConfigGenerator()
    gen.add_discord(
        bot_token="$DISCORD_TOKEN",
        guild_id="$DISCORD_GUILD_ID",
        channel_id="$DISCORD_CHANNEL_ID",
        require_mention=True
    )

    print(gen.to_json())
    print()


def example_both_channels():
    """Example: Generate config for both Telegram and Discord"""
    print("Example 3: Both Telegram and Discord")
    print("-" * 50)

    gen = OpenClawConfigGenerator()

    # Method chaining
    gen.add_telegram(
        bot_token="$TELEGRAM_TOKEN",
        chat_id="$TELEGRAM_CHAT_ID",
        super_group_id="$TELEGRAM_SUPER_GROUP_ID",
        require_mention=False
    ).add_discord(
        bot_token="$DISCORD_TOKEN",
        guild_id="$DISCORD_GUILD_ID",
        channel_id="$DISCORD_CHANNEL_ID",
        require_mention=True
    )

    print(gen.to_json())
    print()


def example_with_actual_values():
    """Example: Using actual values instead of env vars"""
    print("Example 4: With Actual Values")
    print("-" * 50)

    gen = OpenClawConfigGenerator()
    gen.add_telegram(
        bot_token="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        chat_id="-1001234567890",
        super_group_id="-1001234567890",
        require_mention=False
    )

    print(gen.to_json())
    print()


def example_custom_settings():
    """Example: Custom settings"""
    print("Example 5: Custom Settings")
    print("-" * 50)

    gen = OpenClawConfigGenerator()
    gen.add_telegram(
        bot_token="$TELEGRAM_TOKEN",
        chat_id="$TELEGRAM_CHAT_ID",
        super_group_id="$TELEGRAM_SUPER_GROUP_ID",
        enabled=True,
        dm_policy="allowlist",  # Changed from default "pairing"
        group_policy="allowlist",
        require_mention=True,  # Changed from default False
        streaming="full"  # Changed from default "partial"
    )

    print(gen.to_json())
    print()


def main():
    """Run all examples"""
    print("=" * 60)
    print("OpenClaw Config Generator - Example Usage")
    print("=" * 60)
    print()

    example_telegram_only()
    example_discord_only()
    example_both_channels()
    example_with_actual_values()
    example_custom_settings()

    print("=" * 60)
    print("To save any config to a file, use:")
    print("  gen.save('openclaw-config.json')")
    print("=" * 60)


if __name__ == "__main__":
    main()
