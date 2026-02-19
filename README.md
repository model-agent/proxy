# @relayplane/proxy

**Safe, intelligent AI model routing that never breaks your setup.** Sandbox architecture with circuit breakers ensures your agent keeps working even if RelayPlane has issues.

## Why RelayPlane?

AI agents burn through API credits fast — $30-300/month for most users, $1,000+ for power users. RelayPlane routes simple tasks to cheaper models automatically while keeping your setup bulletproof.

**Safety first:** RelayPlane runs as a sandbox layer. If anything goes wrong, the circuit breaker trips and requests flow directly to your provider. Zero downtime, zero intervention.

## Quick Start

### Option 1: OpenClaw Config (Recommended)

Add to your `openclaw.json`:

```json
{
  "relayplane": {
    "enabled": true
  }
}
```

That's it. OpenClaw handles starting and managing the proxy automatically.

### Option 2: ClawHub Skill

```bash
clawhub install relayplane
```

Then use `/relayplane` commands:
- `/relayplane stats` — See your usage and savings
- `/relayplane proxy start` — Start the proxy
- `/relayplane doctor` — Diagnose issues

### Option 3: Standalone

```bash
npm install -g @relayplane/proxy
relayplane-proxy
```

The proxy starts on `http://localhost:4100` by default.

## Architecture

```
Your Agent → RelayPlane Proxy → Right Model
                  ↓
         ┌─────────────────┐
         │  Middleware      │  Analyzes task type
         │  Circuit Breaker │  Auto-bypasses on failure
         │  Health Monitor  │  Continuous liveness checks
         │  Stats Tracker   │  Real-time cost monitoring
         └─────────────────┘
```

### Sandbox Safety Model

RelayPlane is designed to **never break your setup**:

1. **Circuit Breaker** — If the proxy encounters errors, it automatically opens the circuit and passes requests directly to your provider. No manual intervention needed.
2. **Health Monitoring** — Continuous health checks detect issues before they affect your workflow.
3. **Graceful Degradation** — Even if RelayPlane is completely down, your agent works normally.

### Routing Logic

- Quick tool calls → Haiku ($0.25/MTok)
- Code review → Sonnet ($3/MTok)
- Complex reasoning → Opus ($15/MTok)

Your prompts never leave your machine. Only anonymous usage stats are collected.

## Programmatic API

Use RelayPlane components directly in your own tooling:

```typescript
import {
  RelayPlaneMiddleware,
  CircuitBreaker,
  HealthMonitor,
  loadRelayConfig,
} from '@relayplane/proxy';

// Load config from openclaw.json or defaults
const config = loadRelayConfig();

// Circuit breaker with automatic recovery
const breaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 30000,
});

// Middleware for request routing
const middleware = new RelayPlaneMiddleware({ config, circuitBreaker: breaker });

// Health monitoring
const health = new HealthMonitor({ port: 4100 });
```

### Managed Launcher

For process lifecycle management:

```typescript
import { RelayPlaneLauncher } from '@relayplane/proxy';

const launcher = new RelayPlaneLauncher({ port: 4100 });
await launcher.start();   // Starts proxy, waits for healthy
await launcher.stop();    // Graceful shutdown
```

## CLI Commands

```bash
relayplane-proxy                    # Start proxy (default port 4100)
relayplane-proxy --port 8080        # Custom port
relayplane-proxy stats              # View usage statistics
relayplane-proxy config             # Show configuration
relayplane-proxy telemetry off      # Disable telemetry
relayplane-proxy telemetry status   # Check telemetry setting
relayplane-proxy --audit            # See telemetry before sending
relayplane-proxy --offline          # No external calls except LLM APIs
```

## Features

- **Sandbox Architecture** — Never breaks your existing setup
- **Circuit Breaker** — Automatic failover on errors
- **Health Monitoring** — Continuous liveness and readiness checks
- **Smart Routing** — Automatic model selection based on task complexity
- **Cost Tracking** — Real-time spend monitoring across all providers
- **Multi-Provider** — Anthropic, OpenAI, Gemini, xAI, OpenRouter
- **Privacy First** — Prompts stay local, only metadata is collected
- **Offline Mode** — Run fully local with `--offline`

## Telemetry

Anonymous telemetry helps improve routing decisions. Here's exactly what's collected:

```json
{
  "device_id": "anon_8f3a...",
  "task_type": "code_review",
  "model": "claude-sonnet-4",
  "tokens_in": 1847,
  "tokens_out": 423,
  "latency_ms": 2341,
  "success": true,
  "cost_usd": 0.02
}
```

**Never collected:** prompts, responses, file paths, anything identifying.

**Opt out anytime:**
```bash
relayplane-proxy telemetry off
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `XAI_API_KEY` | xAI/Grok API key |
| `RELAYPLANE_API_KEY` | Optional — enables cloud dashboard |

## Links

- **Docs:** [relayplane.com/docs](https://relayplane.com/docs)
- **Dashboard:** [relayplane.com/dashboard](https://relayplane.com/dashboard)
- **ClawHub Skill:** [clawhub.com/skills/relayplane](https://clawhub.com/skills/relayplane)
- **OpenClaw:** [openclaw.ai](https://openclaw.ai)

## License

MIT
