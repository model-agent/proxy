#!/usr/bin/env node
/**
 * RelayPlane Proxy CLI
 * 
 * Intelligent AI model routing proxy server.
 * 
 * Usage:
 *   npx @relayplane/proxy [command] [options]
 *   relayplane-proxy [command] [options]
 * 
 * Commands:
 *   (default)              Start the proxy server
 *   status                 Show proxy status (circuit state, stats, process info)
 *   enable                 Enable RelayPlane in openclaw.json
 *   disable                Disable RelayPlane in openclaw.json
 *   telemetry [on|off|status]  Manage telemetry settings
 *   stats                  Show usage statistics
 *   config                 Show configuration
 * 
 * Options:
 *   --port <number>    Port to listen on (default: 4100)
 *   --host <string>    Host to bind to (default: 127.0.0.1)
 *   --offline          Disable all network calls except LLM endpoints
 *   --audit            Show telemetry payloads before sending
 *   -v, --verbose      Enable verbose logging
 *   -h, --help         Show this help message
 *   --version          Show version
 * 
 * Environment Variables:
 *   ANTHROPIC_API_KEY  Anthropic API key
 *   OPENAI_API_KEY     OpenAI API key
 *   GEMINI_API_KEY     Google Gemini API key
 *   XAI_API_KEY        xAI/Grok API key
 *   MOONSHOT_API_KEY   Moonshot API key
 * 
 * @packageDocumentation
 */

import { startProxy } from './standalone-proxy.js';
import {
  loadConfig,
  isFirstRun,
  markFirstRunComplete,
  isTelemetryEnabled,
  enableTelemetry,
  disableTelemetry,
  getConfigPath,
  setApiKey,
} from './config.js';
import {
  printTelemetryDisclosure,
  setAuditMode,
  setOfflineMode,
  getTelemetryStats,
  getTelemetryPath,
} from './telemetry.js';

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

let VERSION = '0.0.0';
try {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  VERSION = pkg.version ?? '0.0.0';
} catch {
  // fallback
}

/**
 * Check npm registry for newer version (non-blocking, best-effort).
 * Returns update message string or null.
 */
async function checkForUpdate(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://registry.npmjs.org/@relayplane/proxy/latest', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    const latest = data.version;
    if (!latest || latest === VERSION) return null;
    // Simple semver compare: split and compare numerically
    const cur = VERSION.split('.').map(Number);
    const lat = latest.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((lat[i] ?? 0) > (cur[i] ?? 0)) {
        return `\n  ⬆️  Update available: v${VERSION} → v${latest}\n     Run: npm update -g @relayplane/proxy\n`;
      }
      if ((lat[i] ?? 0) < (cur[i] ?? 0)) return null;
    }
    return null;
  } catch {
    return null; // Network error, offline, etc. — silently skip
  }
}

function printHelp(): void {
  console.log(`
RelayPlane Proxy - Intelligent AI Model Routing

Usage:
  npx @relayplane/proxy [command] [options]
  relayplane-proxy [command] [options]

Commands:
  (default)              Start the proxy server
  status                 Show proxy status (circuit state, stats, process info)
  enable                 Enable RelayPlane in openclaw.json
  disable                Disable RelayPlane in openclaw.json
  telemetry [on|off|status]  Manage telemetry settings
  stats                  Show usage statistics
  config                 Show configuration

Options:
  --port <number>    Port to listen on (default: 4100)
  --host <string>    Host to bind to (default: 127.0.0.1)
  --offline          Disable all network calls except LLM endpoints
  --audit            Show telemetry payloads before sending
  -v, --verbose      Enable verbose logging
  -h, --help         Show this help message
  --version          Show version

Environment Variables:
  ANTHROPIC_API_KEY  Anthropic API key
  OPENAI_API_KEY     OpenAI API key
  GEMINI_API_KEY     Google Gemini API key (optional)
  XAI_API_KEY        xAI/Grok API key (optional)
  MOONSHOT_API_KEY   Moonshot API key (optional)

Example:
  # Start proxy on default port
  npx @relayplane/proxy

  # Start with audit mode (see telemetry before it's sent)
  npx @relayplane/proxy --audit

  # Start in offline mode (no telemetry transmission)
  npx @relayplane/proxy --offline

  # Disable telemetry completely
  npx @relayplane/proxy telemetry off

  # Add to openclaw.json:
  # { "relayplane": { "enabled": true } }

Learn more: https://relayplane.com/docs
`);
}

function printVersion(): void {
  console.log(`RelayPlane Proxy v${VERSION}`);
}

function handleTelemetryCommand(args: string[]): void {
  const subcommand = args[0];
  
  switch (subcommand) {
    case 'on':
      enableTelemetry();
      console.log('✅ Telemetry enabled');
      console.log('   Anonymous usage data will be collected to improve routing.');
      console.log('   Run with --audit to see exactly what\'s collected.');
      break;
      
    case 'off':
      disableTelemetry();
      console.log('✅ Telemetry disabled');
      console.log('   No usage data will be collected.');
      console.log('   The proxy will continue to work normally.');
      break;
      
    case 'status':
    default:
      const enabled = isTelemetryEnabled();
      console.log('');
      console.log('📊 Telemetry Status');
      console.log('───────────────────');
      console.log(`   Enabled: ${enabled ? '✅ Yes' : '❌ No'}`);
      console.log(`   Data file: ${getTelemetryPath()}`);
      console.log('');
      console.log('   To enable:  relayplane-proxy telemetry on');
      console.log('   To disable: relayplane-proxy telemetry off');
      console.log('   To audit:   relayplane-proxy --audit');
      console.log('');
      break;
  }
}

function handleStatsCommand(): void {
  const stats = getTelemetryStats();
  
  console.log('');
  console.log('📊 Usage Statistics');
  console.log('═══════════════════');
  console.log('');
  console.log(`  Total requests: ${stats.totalEvents}`);
  console.log(`  Actual cost:    $${stats.totalCost.toFixed(4)}`);
  console.log(`  Without RP:     $${stats.baselineCost.toFixed(4)}`);
  if (stats.savings > 0) {
    console.log(`  💰 You saved:   $${stats.savings.toFixed(4)} (${stats.savingsPercent.toFixed(1)}%)`);
  } else if (stats.totalEvents > 0 && stats.baselineCost === 0) {
    console.log(`  ⚠️  No token data yet — savings will appear after new requests`);
  }
  console.log(`  Success rate:   ${(stats.successRate * 100).toFixed(1)}%`);
  console.log('');
  
  if (Object.keys(stats.byModel).length > 0) {
    console.log('  By Model:');
    for (const [model, data] of Object.entries(stats.byModel)) {
      const savingsNote = data.baselineCost > 0
        ? ` (saved $${(data.baselineCost - data.cost).toFixed(4)} vs Opus)`
        : '';
      console.log(`    ${model}: ${data.count} requests, $${data.cost.toFixed(4)}${savingsNote}`);
    }
    console.log('');
  }
  
  if (Object.keys(stats.byTaskType).length > 0) {
    console.log('  By Task Type:');
    for (const [taskType, data] of Object.entries(stats.byTaskType)) {
      console.log(`    ${taskType}: ${data.count} requests, $${data.cost.toFixed(4)}`);
    }
    console.log('');
  }
  
  if (stats.totalEvents === 0) {
    console.log('  No data yet. Start using the proxy to collect statistics.');
    console.log('');
  }
}

async function handleStatusCommand(): Promise<void> {
  const { RelayPlaneMiddleware } = await import('./middleware.js');
  const { resolveConfig } = await import('./relay-config.js');

  const resolved = resolveConfig();
  const middleware = new RelayPlaneMiddleware({ config: { ...resolved, autoStart: false } });

  // Check if proxy is actually running by hitting /health
  let proxyReachable = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${resolved.proxyUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    proxyReachable = res.ok;
  } catch {
    // not running
  }

  console.log('');
  console.log(middleware.formatStatus());
  console.log('');
  if (proxyReachable) {
    console.log(`  🟢 Proxy is reachable at ${resolved.proxyUrl}`);
  } else {
    console.log(`  🔴 Proxy is not reachable at ${resolved.proxyUrl}`);
  }
  console.log('');

  middleware.destroy();
}

function getOpenClawConfigPath(): string {
  return join(homedir(), '.openclaw', 'openclaw.json');
}

function handleEnableDisableCommand(enable: boolean): void {
  const configPath = getOpenClawConfigPath();
  const dir = dirname(configPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      // start fresh
    }
  }

  if (!config.relayplane || typeof config.relayplane !== 'object') {
    config.relayplane = {};
  }
  (config.relayplane as Record<string, unknown>).enabled = enable;

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`✅ RelayPlane ${enable ? 'enabled' : 'disabled'}`);
  console.log(`   Updated ${configPath}`);
}

function handleConfigCommand(args: string[]): void {
  const subcommand = args[0];
  
  if (subcommand === 'set-key' && args[1]) {
    setApiKey(args[1]);
    console.log('✅ API key saved');
    console.log('   Pro features will be enabled on next proxy start.');
    return;
  }
  
  const config = loadConfig();
  
  console.log('');
  console.log('⚙️  Configuration');
  console.log('═════════════════');
  console.log('');
  console.log(`  Config file: ${getConfigPath()}`);
  console.log(`  Device ID:   ${config.device_id}`);
  console.log(`  Telemetry:   ${config.telemetry_enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  API Key:     ${config.api_key ? '••••' + config.api_key.slice(-4) : 'Not set'}`);
  console.log(`  Created:     ${config.created_at}`);
  console.log('');
  console.log('  To set API key: relayplane-proxy config set-key <your-key>');
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  // Check for version
  if (args.includes('--version')) {
    printVersion();
    process.exit(0);
  }

  // Handle commands
  const command = args[0];
  
  if (command === 'telemetry') {
    handleTelemetryCommand(args.slice(1));
    process.exit(0);
  }
  
  if (command === 'stats') {
    handleStatsCommand();
    process.exit(0);
  }
  
  if (command === 'config') {
    handleConfigCommand(args.slice(1));
    process.exit(0);
  }

  if (command === 'status') {
    await handleStatusCommand();
    process.exit(0);
  }

  if (command === 'enable') {
    handleEnableDisableCommand(true);
    process.exit(0);
  }

  if (command === 'disable') {
    handleEnableDisableCommand(false);
    process.exit(0);
  }

  // Parse server options
  let port = 4100;
  let host = '127.0.0.1';
  let verbose = false;
  let audit = false;
  let offline = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1]!, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error('Error: Invalid port number');
        process.exit(1);
      }
      i++;
    } else if (arg === '--host' && args[i + 1]) {
      host = args[i + 1]!;
      i++;
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (arg === '--audit') {
      audit = true;
    } else if (arg === '--offline') {
      offline = true;
    }
  }

  // Set modes
  setAuditMode(audit);
  setOfflineMode(offline);

  // First run disclosure
  if (isFirstRun()) {
    printTelemetryDisclosure();
    markFirstRunComplete();
    
    // Wait for user to read (brief pause)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Check for at least one API key
  const hasAnthropicKey = !!process.env['ANTHROPIC_API_KEY'];
  const hasOpenAIKey = !!process.env['OPENAI_API_KEY'];
  const hasGeminiKey = !!process.env['GEMINI_API_KEY'];
  const hasXAIKey = !!process.env['XAI_API_KEY'];
  const hasMoonshotKey = !!process.env['MOONSHOT_API_KEY'];

  if (!hasAnthropicKey && !hasOpenAIKey && !hasGeminiKey && !hasXAIKey && !hasMoonshotKey) {
    console.error('Error: No API keys found. Set at least one of:');
    console.error('  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY, MOONSHOT_API_KEY');
    process.exit(1);
  }

  // Print startup info
  console.log('');
  console.log('  ╭─────────────────────────────────────────╮');
  console.log(`  │       RelayPlane Proxy v${VERSION}          │`);
  console.log('  │    Intelligent AI Model Routing         │');
  console.log('  ╰─────────────────────────────────────────╯');
  console.log('');
  
  // Show modes
  const telemetryEnabled = isTelemetryEnabled();
  console.log('  Mode:');
  if (offline) {
    console.log('    🔒 Offline (no telemetry transmission)');
  } else if (audit) {
    console.log('    🔍 Audit (showing telemetry payloads)');
  } else if (telemetryEnabled) {
    console.log('    📊 Telemetry enabled (--audit to inspect, telemetry off to disable)');
  } else {
    console.log('    📴 Telemetry disabled');
  }
  
  console.log('');
  console.log('  Providers:');
  if (hasAnthropicKey) console.log('    ✓ Anthropic');
  if (hasOpenAIKey) console.log('    ✓ OpenAI');
  if (hasGeminiKey) console.log('    ✓ Google Gemini');
  if (hasXAIKey) console.log('    ✓ xAI (Grok)');
  if (hasMoonshotKey) console.log('    ✓ Moonshot');
  console.log('');

  try {
    await startProxy({ port, host, verbose });
    
    console.log('');
    console.log('  To use, add to your openclaw.json:');
    console.log('    { "relayplane": { "enabled": true } }');
    console.log('');
    console.log('  Then run your agent (OpenClaw, Cursor, Aider, etc.)');
    console.log('');

    // Non-blocking update check (fires after startup, doesn't delay anything)
    if (!offline) {
      checkForUpdate().then(msg => {
        if (msg) console.log(msg);
      });
    }
  } catch (err) {
    console.error('Failed to start proxy:', err);
    process.exit(1);
  }
}

main();
