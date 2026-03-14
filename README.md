# OpenClaw Resources

## 1. OpenClaw

- **Home**: [https://openclaw.ai/](https://openclaw.ai/)
- **Github**: [https://github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
- **Discord**: [https://discord.com/invite/qkhbAGHRBT](https://discord.com/invite/qkhbAGHRBT)
- **Luma** (Meetups): [https://luma.com/claw](https://luma.com/claw)
- **X**: [https://x.com/openclaw](https://x.com/openclaw)
- **OpenClaw Singapore**: [ClawJunction](https://www.clawjunction.com/) | [Instagram](https://www.instagram.com/clawsingapore) | [LinkedIn](https://www.linkedin.com/company/clawsingapore) | [Substack](https://clawsg.substack.com/) | [X](https://x.com/openclawsg)


## 2. Resources in this Repo

- [openclaw-vm-security-guide.md](openclaw-vm-security-guide.md) — **VM security hardening guide** (network isolation, SSH, Docker, secrets, skills, prompt injection, CVEs)
- [openclaw-cli-help.md](openclaw-cli-help.md) — OpenClaw CLI comprehensive reference
  - [Messaging & Provider Setup](openclaw-cli-help.md#messaging--provider-setup) — Step-by-step setup for Telegram, Slack, Discord, WhatsApp, and OpenRouter
- [obsidian-cli-help.md](obsidian-cli-help.md) — Obsidian CLI command reference


## 3. OpenClaw News, Commentary, Blogs, Videos

### 3.1 Peter Steinberger

- 2026.02.25 [Builders Unscripted: Ep. 1 - Peter Steinberger, Creator of OpenClaw](https://www.youtube.com/watch?v=9jgcT0Fqt7U)
- 2026.02.14 [OpenClaw, OpenAI and the future](https://steipete.me/posts/2026/openclaw) | Peter Steinberger
- 2026.02.14 [Will AI replace programmers?](https://www.youtube.com/watch?v=ecBrO3GXdZ8) | Peter Steinberger and Lex Fridman
- 2026.02.13 [Who will acquire OpenClaw? - OpenAI and Meta make big offers](https://www.youtube.com/watch?v=NMBoNFDOr_o) | Peter Steinberger and Lex Fridman
- 2026.02.12 [How to code with AI agents - Advice from OpenClaw creator](https://www.youtube.com/watch?v=wKy1_KLcxcs) | Peter Steinberger and Lex Fridman
- 2026.02.12 [OpenClaw: The Viral AI Agent that Broke the Internet - Peter Steinberger](https://www.youtube.com/watch?v=YFjfBk8HI5o) | Lex Fridman Podcast | Youtube

### 3.2 Others

- 2026.03.03 [OpenClaw is 100x better with this tool (Mission Control)](https://www.youtube.com/watch?v=RhLpV6QDBFE) | Alex Finn


## 4. Hosting & Integrations

### 4.1 Hosting Platforms

- **AWS**: [Get started with OpenClaw on Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-quick-start-guide-openclaw.html) | [Introducing OpenClaw on Amazon Lightsail](https://aws.amazon.com/blogs/aws/introducing-openclaw-on-amazon-lightsail-to-run-your-autonomous-private-ai-agents/) (4 Mar 2026)
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

Security audit ([docs](https://docs.openclaw.ai/gateway/security)):

```bash
openclaw security audit --deep
openclaw security audit --fix
```


## 6. FAQ

### 6.1 Using MCPs vs Code Execution

1. [Code execution with MCP: Building more efficient agents](https://www.anthropic.com/engineering/code-execution-with-mcp) | Anthropic
2. [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/) | The Cloudflare Blog
