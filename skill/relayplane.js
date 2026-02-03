#!/usr/bin/env node

const PROXY_URL = 'http://127.0.0.1:3001';

// Anthropic API pricing per 1M tokens (as of Feb 2024)
const MODEL_PRICING = {
  'anthropic/claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'anthropic/claude-3-5-haiku-latest': { input: 1.00, output: 5.00 },
  'anthropic/claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'anthropic/claude-sonnet-4-20250514': { input: 3.00, output: 15.00 }, // Assuming similar to Sonnet 3.5
  'anthropic/claude-3-opus-20240229': { input: 15.00, output: 75.00 },
  'anthropic/claude-opus-4-5-20250514': { input: 15.00, output: 75.00 }, // Assuming similar to Opus 3
};

function estimateTokens(avgLatencyMs, requestCount) {
  // Rough estimation: longer responses = more tokens
  // This is very approximate - ideally we'd track actual token usage
  const avgResponseTokens = Math.max(50, Math.min(500, avgLatencyMs / 10));
  const avgInputTokens = 200; // Estimate based on conversation context
  
  return {
    inputTokens: avgInputTokens * requestCount,
    outputTokens: avgResponseTokens * requestCount
  };
}

async function callProxy(endpoint) {
  try {
    const response = await fetch(`${PROXY_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Proxy error: ${error.message}`);
  }
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function calculateCosts(modelCounts, totalRequests, avgLatencyMs) {
  const tokenEstimate = estimateTokens(avgLatencyMs, totalRequests);
  
  let actualCost = 0;
  let opusCost = 0;
  
  // Calculate actual cost based on models used
  for (const [model, count] of Object.entries(modelCounts)) {
    const pricing = MODEL_PRICING[model];
    if (pricing) {
      const requestRatio = count / totalRequests;
      const inputTokens = tokenEstimate.inputTokens * requestRatio;
      const outputTokens = tokenEstimate.outputTokens * requestRatio;
      
      actualCost += (inputTokens / 1000000 * pricing.input) + (outputTokens / 1000000 * pricing.output);
    }
  }
  
  // Calculate what it would cost if all requests used Opus
  const opusPricing = MODEL_PRICING['anthropic/claude-3-opus-20240229'];
  if (opusPricing) {
    opusCost = (tokenEstimate.inputTokens / 1000000 * opusPricing.input) + 
               (tokenEstimate.outputTokens / 1000000 * opusPricing.output);
  }
  
  const savings = opusCost - actualCost;
  const savingsPercent = opusCost > 0 ? ((savings / opusCost) * 100).toFixed(1) : 0;
  
  return {
    actualCost: actualCost.toFixed(4),
    opusCost: opusCost.toFixed(4),
    savings: savings.toFixed(4),
    savingsPercent,
    tokenEstimate
  };
}

function formatStats(stats) {
  const { 
    totalRequests, 
    successfulRequests, 
    failedRequests, 
    successRate, 
    avgLatencyMs, 
    escalations,
    uptimeMs,
    routingCounts,
    modelCounts
  } = stats;

  const costs = calculateCosts(modelCounts, totalRequests, avgLatencyMs);

  let output = `**RelayPlane Statistics**\n`;
  output += `• **Uptime:** ${formatUptime(uptimeMs)}\n`;
  output += `• **Requests:** ${totalRequests} total, ${successfulRequests} success, ${failedRequests} failed\n`;
  output += `• **Success Rate:** ${successRate}\n`;
  output += `• **Avg Latency:** ${avgLatencyMs}ms\n`;
  output += `• **Escalations:** ${escalations}\n\n`;

  output += `**💰 Cost Analysis** *(estimated)*\n`;
  output += `• **Actual Cost:** $${costs.actualCost}\n`;
  output += `• **All-Opus Cost:** $${costs.opusCost}\n`;
  output += `• **Savings:** $${costs.savings} (${costs.savingsPercent}%)\n`;
  output += `• **Token Est:** ${costs.tokenEstimate.inputTokens.toLocaleString()} in, ${costs.tokenEstimate.outputTokens.toLocaleString()} out\n\n`;

  if (Object.keys(routingCounts).length > 0) {
    output += `**Routing Modes:**\n`;
    for (const [mode, count] of Object.entries(routingCounts)) {
      output += `• ${mode}: ${count} requests\n`;
    }
    output += `\n`;
  }

  if (Object.keys(modelCounts).length > 0) {
    output += `**Models Used:**\n`;
    for (const [model, count] of Object.entries(modelCounts)) {
      const shortModel = model.split('/')[1]?.replace(/^claude-/, '').replace(/-\d+.*$/, '') || model;
      output += `• ${shortModel}: ${count} requests\n`;
    }
  }

  return output;
}

function formatStatus(status) {
  const { enabled, mode, modelOverrides } = status;
  
  let output = `**RelayPlane Status**\n`;
  output += `• **Enabled:** ${enabled ? '✅' : '❌'}\n`;
  output += `• **Mode:** ${mode}\n`;

  if (Object.keys(modelOverrides).length > 0) {
    output += `\n**Model Overrides:**\n`;
    for (const [from, to] of Object.entries(modelOverrides)) {
      output += `• ${from} → ${to}\n`;
    }
  }

  return output;
}

async function switchMode(mode) {
  const validModes = ['auto', 'cost', 'fast', 'quality'];
  if (!validModes.includes(mode)) {
    return `❌ Invalid mode. Use: ${validModes.join(', ')}`;
  }

  // Switch via OpenClaw model change  
  const modelName = `relayplane/${mode}`;
  return `Switching to **${mode}** mode.\nUse: \`/model ${modelName}\``;
}

function listModels() {
  return `**Available RelayPlane Models:**

• **relayplane/auto** - Smart cascade routing (starts cheap, escalates if needed)
• **relayplane/cost** - Always use cheapest model (Haiku)
• **relayplane/fast** - Fastest response model (Haiku) 
• **relayplane/quality** - Best quality model (Opus/Sonnet 4)

**Switch with:** \`/model <model-name>\``;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: /relayplane <stats|status|switch|models>');
    return;
  }

  const command = args[0];
  
  try {
    switch (command) {
      case 'stats':
        const stats = await callProxy('/control/stats');
        console.log(formatStats(stats));
        break;
        
      case 'status':
        const status = await callProxy('/control/status');
        console.log(formatStatus(status));
        break;
        
      case 'switch':
        if (args.length < 2) {
          console.log('Usage: /relayplane switch <auto|cost|fast|quality>');
          return;
        }
        console.log(await switchMode(args[1]));
        break;
        
      case 'models':
        console.log(listModels());
        break;
        
      default:
        console.log('Unknown command. Use: stats, status, switch, models');
    }
  } catch (error) {
    console.log(`❌ ${error.message}`);
  }
}

main().catch(console.error);