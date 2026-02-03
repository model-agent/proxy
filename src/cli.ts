#!/usr/bin/env node
/**
 * RelayPlane Proxy CLI
 * 
 * Intelligent AI model routing proxy server.
 * 
 * Usage:
 *   npx @relayplane/proxy [options]
 *   relayplane-proxy [options]
 * 
 * Options:
 *   --port <number>    Port to listen on (default: 3001)
 *   --host <string>    Host to bind to (default: 127.0.0.1)
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

function printHelp(): void {
  console.log(`
RelayPlane Proxy - Intelligent AI Model Routing

Usage:
  npx @relayplane/proxy [options]
  relayplane-proxy [options]

Options:
  --port <number>    Port to listen on (default: 3001)
  --host <string>    Host to bind to (default: 127.0.0.1)
  -v, --verbose      Enable verbose logging
  -h, --help         Show this help message

Environment Variables:
  ANTHROPIC_API_KEY  Anthropic API key
  OPENAI_API_KEY     OpenAI API key
  GEMINI_API_KEY     Google Gemini API key (optional)
  XAI_API_KEY        xAI/Grok API key (optional)
  MOONSHOT_API_KEY   Moonshot API key (optional)

Example:
  # Start proxy on default port
  npx @relayplane/proxy

  # Start on custom port with verbose logging
  npx @relayplane/proxy --port 8080 -v

  # Then point your SDKs to the proxy
  export ANTHROPIC_BASE_URL=http://localhost:3001
  export OPENAI_BASE_URL=http://localhost:3001

Learn more: https://relayplane.com/integrations/openclaw
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  // Parse arguments
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
