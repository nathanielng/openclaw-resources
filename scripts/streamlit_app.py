#!/usr/bin/env python3
"""
OpenClaw Config Generator - Streamlit UI
A web interface for generating OpenClaw JSON configuration files.
"""

import json
import sys
from pathlib import Path

import streamlit as st

# Allow importing from the same directory
sys.path.insert(0, str(Path(__file__).parent))
from openclaw_config_generator import OpenClawConfigGenerator


st.set_page_config(
    page_title="OpenClaw Config Generator",
    page_icon="🐾",
    layout="wide",
)

st.title("🐾 OpenClaw Config Generator")
st.caption("Generate OpenClaw JSON configuration files for Telegram and Discord")

# --- Sidebar: Channel selection ---
st.sidebar.header("Channels")
enable_telegram = st.sidebar.checkbox("Telegram", value=True)
enable_discord = st.sidebar.checkbox("Discord", value=False)

# --- Main area ---
col_form, col_preview = st.columns([1, 1], gap="large")

gen = OpenClawConfigGenerator()

with col_form:
    # --- Telegram ---
    if enable_telegram:
        st.subheader("Telegram")
        tg_token = st.text_input(
            "Bot Token",
            value="$TELEGRAM_TOKEN",
            key="tg_token",
            help="Your Telegram bot token from @BotFather. Use $TELEGRAM_TOKEN to reference an environment variable.",
        )
        tg_chat_id = st.text_input(
            "Chat ID",
            value="$TELEGRAM_CHAT_ID",
            key="tg_chat_id",
            help="The chat/group ID to allowlist. Use $TELEGRAM_CHAT_ID to reference an environment variable.",
        )
        tg_super_group_id = st.text_input(
            "Super Group ID",
            value="$TELEGRAM_SUPER_GROUP_ID",
            key="tg_super_group_id",
            help="The super group ID for per-group settings.",
        )

        with st.expander("Advanced options"):
            tg_dm_policy = st.selectbox(
                "DM Policy", ["pairing", "allowlist", "deny"], key="tg_dm_policy"
            )
            tg_group_policy = st.selectbox(
                "Group Policy", ["allowlist", "deny"], key="tg_group_policy"
            )
            tg_require_mention = st.checkbox(
                "Require mention in groups", value=False, key="tg_require_mention"
            )
            tg_streaming = st.selectbox(
                "Streaming", ["partial", "full", "none"], key="tg_streaming"
            )

        gen.add_telegram(
            bot_token=tg_token or "$TELEGRAM_TOKEN",
            chat_id=tg_chat_id or "$TELEGRAM_CHAT_ID",
            super_group_id=tg_super_group_id or "$TELEGRAM_SUPER_GROUP_ID",
            dm_policy=tg_dm_policy,
            group_policy=tg_group_policy,
            require_mention=tg_require_mention,
            streaming=tg_streaming,
        )

    # --- Discord ---
    if enable_discord:
        if enable_telegram:
            st.divider()
        st.subheader("Discord")
        dc_token = st.text_input(
            "Bot Token",
            value="$DISCORD_TOKEN",
            key="dc_token",
            help="Your Discord bot token from the Developer Portal. Use $DISCORD_TOKEN to reference an environment variable.",
        )
        dc_guild_id = st.text_input(
            "Guild (Server) ID",
            value="$DISCORD_GUILD_ID",
            key="dc_guild_id",
            help="The Discord server/guild ID to allowlist.",
        )
        dc_channel_id = st.text_input(
            "Channel ID",
            value="$DISCORD_CHANNEL_ID",
            key="dc_channel_id",
            help="The Discord channel ID for per-channel settings.",
        )

        with st.expander("Advanced options"):
            dc_dm_policy = st.selectbox(
                "DM Policy", ["pairing", "allowlist", "deny"], key="dc_dm_policy"
            )
            dc_guild_policy = st.selectbox(
                "Guild Policy", ["allowlist", "deny"], key="dc_guild_policy"
            )
            dc_require_mention = st.checkbox(
                "Require mention in channels", value=False, key="dc_require_mention"
            )
            dc_streaming = st.selectbox(
                "Streaming", ["partial", "full", "none"], key="dc_streaming"
            )

        gen.add_discord(
            bot_token=dc_token or "$DISCORD_TOKEN",
            guild_id=dc_guild_id or "$DISCORD_GUILD_ID",
            channel_id=dc_channel_id or "$DISCORD_CHANNEL_ID",
            dm_policy=dc_dm_policy,
            guild_policy=dc_guild_policy,
            require_mention=dc_require_mention,
            streaming=dc_streaming,
        )

    if not enable_telegram and not enable_discord:
        st.info("Select at least one channel from the sidebar to get started.")

# --- Preview panel ---
with col_preview:
    st.subheader("Generated Config")

    if enable_telegram or enable_discord:
        config_json = gen.to_json()

        st.code(config_json, language="json")

        st.download_button(
            label="Download openclaw-config.json",
            data=config_json,
            file_name="openclaw-config.json",
            mime="application/json",
        )
    else:
        st.info("Your generated config will appear here.")
