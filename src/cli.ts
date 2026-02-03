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
 *   (default)          Start the proxy server
 *   stats              Show routing statistics
 * 
 * Options:
 *   --port <number>    Port to listen on (default: 3001)
 *   --host <string>    Host to bind to (default: 127.0.0.1)
 *   --days <number>    Days of history for stats (default: 7)
 *   -v, --verbose      Enable verbose logging
 *   -h, --help         Show this help message
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

import { startProxy } from './proxy.js';
import { getDefaultDbPath } from './storage/index.js';
import Database from 'better-sqlite3';

function printHelp(): void {
  console.log(`
RelayPlane Proxy - Intelligent AI Model Routing

Usage:
  npx @relayplane/proxy [command] [options]
  relayplane-proxy [command] [options]

Commands:
  (default)          Start the proxy server
  stats              Show routing statistics

Server Options:
  --port <number>    Port to listen on (default: 3001)
  --host <string>    Host to bind to (default: 127.0.0.1)
  -v, --verbose      Enable verbose logging

Stats Options:
  --days <number>    Days of history to show (default: 7)

General:
  -h, --help         Show this help message

Environment Variables:
  ANTHROPIC_API_KEY  Anthropic API key
  OPENAI_API_KEY     OpenAI API key
  GEMINI_API_KEY     Google Gemini API key (optional)
  XAI_API_KEY        xAI/Grok API key (optional)
  MOONSHOT_API_KEY   Moonshot API key (optional)

Examples:
  # Start proxy on default port
  npx @relayplane/proxy

  # Start on custom port with verbose logging
  npx @relayplane/proxy --port 8080 -v

  # View routing stats for last 7 days
  npx @relayplane/proxy stats

  # View stats for last 30 days
  npx @relayplane/proxy stats --days 30

Learn more: https://relayplane.com/integrations/openclaw
`);
}

function showStats(days: number): void {
  const dbPath = getDefaultDbPath();
  
  try {
    const db = new Database(dbPath, { readonly: true });
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // Get stats from database
    const runs = db.prepare(`
      SELECT 
        model,
        task_type,
        COUNT(*) as count,
        SUM(tokens_in) as total_in,
        SUM(tokens_out) as total_out,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM runs 
      WHERE created_at >= ?
      GROUP BY model
      ORDER BY count DESC
    `).all(cutoff) as Array<{
      model: string;
      task_type: string;
      count: number;
      total_in: number;
      total_out: number;
      avg_duration: number;
      successes: number;
    }>;

    const totalRuns = runs.reduce((sum, r) => sum + r.count, 0);
    const totalTokensIn = runs.reduce((sum, r) => sum + (r.total_in || 0), 0);
    const totalTokensOut = runs.reduce((sum, r) => sum + (r.total_out || 0), 0);

    console.log('');
    console.log(`  ╭─────────────────────────────────────────╮`);
    console.log(`  │      RelayPlane Routing Stats          │`);
    console.log(`  │          Last ${String(days).padStart(2)} days                  │`);
    console.log(`  ╰─────────────────────────────────────────╯`);
    console.log('');

    if (totalRuns === 0) {
      console.log('  No routing data found for this period.');
      console.log('  Start using the proxy to collect stats!');
      console.log('');
      return;
    }

    console.log('  Summary:');
    console.log(`    Total requests:     ${totalRuns.toLocaleString()}`);
    console.log(`    Total tokens in:    ${totalTokensIn.toLocaleString()}`);
    console.log(`    Total tokens out:   ${totalTokensOut.toLocaleString()}`);
    console.log('');

    console.log('  By Model:');
    console.log('  ─────────────────────────────────────────────');
    for (const row of runs) {
      const pct = ((row.count / totalRuns) * 100).toFixed(1);
      const successRate = row.count > 0 ? ((row.successes / row.count) * 100).toFixed(0) : '0';
      console.log(`    ${row.model.padEnd(35)} ${String(row.count).padStart(6)} (${pct.padStart(5)}%)  ${successRate}% ok`);
    }
    console.log('');

    // Estimate savings (rough calculation)
    // Haiku: ~$0.25/M in, $1.25/M out
    // Sonnet: ~$3/M in, $15/M out
    // Opus: ~$15/M in, $75/M out
    const haikuRuns = runs.filter(r => r.model.includes('haiku'));
    const haikuTokensIn = haikuRuns.reduce((sum, r) => sum + (r.total_in || 0), 0);
    const haikuTokensOut = haikuRuns.reduce((sum, r) => sum + (r.total_out || 0), 0);
    
    // Cost if all were Opus
    const opusCost = (totalTokensIn * 15 / 1_000_000) + (totalTokensOut * 75 / 1_000_000);
    // Actual cost with Haiku routing
    const haikuCost = (haikuTokensIn * 0.25 / 1_000_000) + (haikuTokensOut * 1.25 / 1_000_000);
    const nonHaikuCost = ((totalTokensIn - haikuTokensIn) * 3 / 1_000_000) + ((totalTokensOut - haikuTokensOut) * 15 / 1_000_000);
    const actualCost = haikuCost + nonHaikuCost;
    const savings = opusCost - actualCost;

    if (savings > 0) {
      console.log('  Estimated Savings:');
      console.log(`    If all Opus:        $${opusCost.toFixed(2)}`);
      console.log(`    With routing:       $${actualCost.toFixed(2)}`);
      console.log(`    Saved:              $${savings.toFixed(2)} (${((savings / opusCost) * 100).toFixed(0)}%)`);
      console.log('');
    }

    db.close();
  } catch (err) {
    console.error('Error reading stats:', err);
    console.log('');
    console.log('  No data found. The proxy stores data at:');
    console.log(`    ${dbPath}`);
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  // Check for stats command
  if (args[0] === 'stats') {
    let days = 7;
    const daysIdx = args.indexOf('--days');
    if (daysIdx !== -1 && args[daysIdx + 1]) {
      days = parseInt(args[daysIdx + 1]!, 10) || 7;
    }
    showStats(days);
    process.exit(0);
  }

  // Parse server arguments
  let port = 3001;
  let host = '127.0.0.1';
  let verbose = false;

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
    }
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
  console.log('  │         RelayPlane Proxy v0.1.0         │');
  console.log('  │    Intelligent AI Model Routing         │');
  console.log('  ╰─────────────────────────────────────────╯');
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
    console.log('  To use, set these environment variables:');
    console.log(`    export ANTHROPIC_BASE_URL=http://${host}:${port}`);
    console.log(`    export OPENAI_BASE_URL=http://${host}:${port}`);
    console.log('');
    console.log('  Then run your agent (OpenClaw, Cursor, Aider, etc.)');
    console.log('');
  } catch (err) {
    console.error('Failed to start proxy:', err);
    process.exit(1);
  }
}

main();
