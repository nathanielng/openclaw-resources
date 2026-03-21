# OpenClaw Resources

## 1. OpenClaw

- **Home**: [https://openclaw.ai/](https://openclaw.ai/)
- **Github**: [https://github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
- **Discord**: [https://discord.com/invite/qkhbAGHRBT](https://discord.com/invite/qkhbAGHRBT)
- **Luma** (Meetups): [https://luma.com/claw](https://luma.com/claw)
- **X**: [https://x.com/openclaw](https://x.com/openclaw)
- **OpenClaw Singapore**: [ClawJunction](https://www.clawjunction.com/) | [Instagram](https://www.instagram.com/clawsingapore) | [LinkedIn](https://www.linkedin.com/company/clawsingapore) | [Substack](https://clawsg.substack.com/) | [X](https://x.com/openclawsg)


## 2. Resources in this Repo

- **[scripts/](scripts/)** — **OpenClaw Config Generator** - Python tool to easily create OpenClaw JSON configurations for Telegram and Discord
  - [scripts/streamlit_app.py](scripts/streamlit_app.py) — Streamlit web UI (`streamlit run scripts/streamlit_app.py`)
  - [scripts/openclaw_config_generator.py](scripts/openclaw_config_generator.py) — Core generator (interactive CLI + importable API)
  - [scripts/example_usage.py](scripts/example_usage.py) — Example code
  - [CONFIG_GENERATOR_README.md](CONFIG_GENERATOR_README.md) — Full documentation and usage guide
- [openclaw-vm-security-guide.md](openclaw-vm-security-guide.md) — **VM security hardening guide** (network isolation, SSH, Docker, secrets, skills, prompt injection, CVEs)
- [openclaw-cli-help.md](openclaw-cli-help.md) — OpenClaw CLI comprehensive reference
  - [Messaging & Provider Setup](openclaw-cli-help.md#messaging--provider-setup) — Step-by-step setup for Telegram, Slack, Discord, WhatsApp, and OpenRouter
- [obsidian-cli-help.md](obsidian-cli-help.md) — Obsidian CLI command reference
- [memory-troubleshooting-guide.md](memory-troubleshooting-guide.md) — **Memory troubleshooting guide** (JavaScript heap OOM, GC diagnostics, heap profiling, prevention)


## 3. OpenClaw News, Commentary, Blogs, Videos

### 3.1 Peter Steinberger

- 2026.02.25 [Builders Unscripted: Ep. 1 - Peter Steinberger, Creator of OpenClaw](https://www.youtube.com/watch?v=9jgcT0Fqt7U)
- 2026.02.14 [OpenClaw, OpenAI and the future](https://steipete.me/posts/2026/openclaw) | Peter Steinberger
- 2026.02.14 [Will AI replace programmers?](https://www.youtube.com/watch?v=ecBrO3GXdZ8) | Peter Steinberger and Lex Fridman
- 2026.02.13 [Who will acquire OpenClaw? - OpenAI and Meta make big offers](https://www.youtube.com/watch?v=NMBoNFDOr_o) | Peter Steinberger and Lex Fridman
- 2026.02.12 [How to code with AI agents - Advice from OpenClaw creator](https://www.youtube.com/watch?v=wKy1_KLcxcs) | Peter Steinberger and Lex Fridman
- 2026.02.12 [OpenClaw: The Viral AI Agent that Broke the Internet - Peter Steinberger](https://www.youtube.com/watch?v=YFjfBk8HI5o) | Lex Fridman Podcast | Youtube

### 3.2 Jensen Huang

- 2026.03.17 [NVIDIA's Jenson Hwang launches NemoClaw to the OpenClaw community](https://www.youtube.com/watch?v=kRmZ5zmMS2o)

### 3.3 Others

- 2026.03.03 [OpenClaw is 100x better with this tool (Mission Control)](https://www.youtube.com/watch?v=RhLpV6QDBFE) | Alex Finn


## 4. Hosting & Integrations

### 4.1 Hosting Platforms

- **AWS/Lightsail**: [Get started with OpenClaw on Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-quick-start-guide-openclaw.html) | [Introducing OpenClaw on Amazon Lightsail](https://aws.amazon.com/blogs/aws/introducing-openclaw-on-amazon-lightsail-to-run-your-autonomous-private-ai-agents/) (4 Mar 2026) | [OpenClaw on Lightsail Security](https://dev.to/aws-heroes/i-deployed-openclaw-on-aws-and-heres-what-i-found-as-a-cloud-security-engineer-3p9i)
- **AWS/Bedrock AgentCore**: Github: [sample-host-openclaw-on-amazon-bedrock-agentcore](https://github.com/aws-samples/sample-host-openclaw-on-amazon-bedrock-agentcore) | [Blog post](https://dev.to/aws-builders/openclaw-on-aws-agentcore-secure-serverless-production-ready-i8n)
- **AWS EC2**: Github: [sample-OpenClaw-on-AWS-with-Bedrock](https://github.com/aws-samples/sample-OpenClaw-on-AWS-with-Bedrock)
- **Digital Ocean**: [Marketplace](https://marketplace.digitalocean.com/apps/openclaw) | [Announcement](https://www.digitalocean.com/blog/moltbot-on-digitalocean)
- **Kimi**: [Kimi Claw](https://www.kimi.com/bot)

**Community blog posts**

- 2026.01.29 [Deploy Moltbot on AWS — A Decision Worth Making](https://builder.aws.com/content/38v1OFpMzs1xofBgM17CWn604lV/deploy-moltbot-on-aws-a-decision-worth-making) | Builder Center — Github: [aws-samples/sample-OpenClaw-on-AWS-with-Bedrock](https://github.com/aws-samples/sample-OpenClaw-on-AWS-with-Bedrock)

### 4.2 Integrations

- [OpenRouter](https://openrouter.ai/docs/guides/guides/coding-agents/openclaw-integration)
- [SEA-LION](https://sea-lion.ai/blog/openclaw-with-sea-lion-running-multilingual-personal-ai-assistants/)

### 4.3 Skills

- [Anthropic Skills](https://github.com/anthropics/skills/tree/main/skills)


## 5. OpenClaw Usage

Install or update OpenClaw (preferred versions: v2026.3.8 or later):

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
npm install -g openclaw@latest
```

Common commands:

```bash
openclaw --version  # Get OpenClaw version
openclaw update     # Update OpenClaw
openclaw doctor     # Check system health
```

## 6. OpenClaw Security

Security audit ([docs](https://docs.openclaw.ai/gateway/security)):

```bash
openclaw security audit --deep
openclaw security audit --fix
```


## 7. FAQ

### 7.1 OpenClaw Channel Options

| **Criteria**            | **Telegram**                        | **WhatsApp**                                          | **Slack**                           | **Discord**                   |
| ----------------------- | ----------------------------------- | ----------------------------------------------------- | ----------------------------------- | ----------------------------- |
| **Effort to Set Up**    | **Low** (fastest)                   | **Medium-High**                                       | **Medium-High**                     | **Medium**                    |
| **Method**              | Official Bot API (via `@BotFather`) | Baileys (reverse engineers the WhatsApp web protocol) | Slack App (Socket Mode or Webhooks) | Discord Bot Application       |
| **Official?**           | Yes                                 | No (Account ban risk)                                 | Yes                                 | Yes                           |
| **Key Requirement**     | A Telegram bot token                | **Dedicated SIM/eSIM** highly recommended.            | Workspace Admin permissions         | Developer Portal access       |
| **Phone Number?**       | No (Bot username only)              | **Yes.** Needs a real mobile number.                  | No                                  | No                            |
| **Technical Expertise** | Beginner-friendly                   | Medium                                                | Medium-High (Scopes/OAuth)          | Medium-High (Roles/Intents)   |
| **Security Risk**       | Moderate (Bot-based)                | **High** (number exposure)                            | Low-Moderate (Internal/Workspace)   | Moderate (Role-based)         |
| **Stability**           | Very Stable                         | **Fragile** (Breaks on WhatsApp updates)              | Very Stable                         | Stable                        |
| **Multi-user setup***   | Moderate                            | Difficult                                             | Easiest                             | Easiest                       |
| **Best For**            | Solo users & Quick starts.          | Mobile-first & Personal use.                          | Technical teams/Workflows.          | Community/Team collaboration. |


### 7.2 Using MCPs vs Code Execution

1. [Code execution with MCP: Building more efficient agents](https://www.anthropic.com/engineering/code-execution-with-mcp) | Anthropic
2. [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/) | The Cloudflare Blog

