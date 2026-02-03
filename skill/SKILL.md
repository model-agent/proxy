---
name: relayplane
description: RelayPlane proxy control - stats, status, and routing mode management
user-invocable: true
homepage: https://relayplane.com
version: 1.2.0
author: Continuum
license: MIT
metadata: { "openclaw": { "emoji": "🚀", "category": "ai-tools", "requires": { "bins": ["node", "curl"] } } }
---

# RelayPlane

**100% Local. Zero Cloud. Full Control.**

Intelligent LLM gateway that routes requests to optimal models.

> ⚠️ **Cost Monitoring Required**
>
> RelayPlane routes requests to LLM providers using your API keys. **This incurs real costs.**
> Monitor usage through your provider's dashboard and use `/relayplane stats` to track requests.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/relayplane stats` | Show usage statistics and cost savings |
| `/relayplane status` | Show proxy health and configuration |
| `/relayplane switch <mode>` | Change routing mode (auto\|cost\|fast\|quality) |
| `/relayplane models` | List available routing models |

## Usage

When user invokes `/relayplane <subcommand>`, run:

```bash
node {baseDir}/relayplane.js <subcommand>
```

Examples:
- `/relayplane stats` → `node {baseDir}/relayplane.js stats`
- `/relayplane status` → `node {baseDir}/relayplane.js status`
- `/relayplane switch cost` → `node {baseDir}/relayplane.js switch cost`

## REST Endpoints (Alternative)

If the script isn't available, use curl:

```bash
# Stats
curl -s http://127.0.0.1:3001/control/stats

# Status
curl -s http://127.0.0.1:3001/control/status
```

## Quick Start

```bash
# Set API keys
export ANTHROPIC_API_KEY="sk-ant-..."
export ANTHROPIC_BASE_URL=http://localhost:3001

# Start proxy
npx @relayplane/proxy --port 3001
```

## Routing Modes

| Mode | Description |
|------|-------------|
| `auto` | Cascade routing - starts cheap, escalates on uncertainty |
| `cost` | Always use cheapest model |
| `fast` | Prioritize lowest latency |
| `quality` | Always use best model |

## More Info

- [GitHub](https://github.com/RelayPlane/proxy)
- [Documentation](https://relayplane.com/docs)
