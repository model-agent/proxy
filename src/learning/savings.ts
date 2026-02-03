/**
 * Savings Calculator
 *
 * Calculates cost savings from intelligent model routing vs a baseline (all-Opus).
 *
 * @packageDocumentation
 */

import type { Store } from '../storage/store.js';

/**
 * Model pricing in USD per 1M tokens.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic models
  'claude-3-5-haiku-latest': { input: 0.25, output: 1.25 },
  'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
  'claude-3-5-sonnet-latest': { input: 3, output: 15 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-opus-latest': { input: 15, output: 75 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  'claude-opus-4-5-20250514': { input: 15, output: 75 },
  // OpenAI models
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4-turbo': { input: 10, output: 30 },
  // Google models
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  // xAI models
  'grok-2': { input: 2, output: 10 },
  'grok-2-latest': { input: 2, output: 10 },
  // Moonshot models
  'moonshot-v1-8k': { input: 0.1, output: 0.1 },
  'moonshot-v1-32k': { input: 0.2, output: 0.2 },
};

/**
 * Baseline model for savings comparison (most expensive).
 */
export const BASELINE_MODEL = 'claude-3-opus-latest';

/**
 * Model cost breakdown.
 */
export interface ModelCostBreakdown {
  runs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  successRate: number;
  avgLatencyMs: number;
}

/**
 * Savings report structure.
 */
export interface SavingsReport {
  /** Number of days included in the report */
  periodDays: number;
  /** Date range */
  period: {
    from: string;
    to: string;
  };
  /** Total number of runs */
  totalRuns: number;
  /** Total tokens used */
  totalTokensIn: number;
  totalTokensOut: number;
  /** Actual cost incurred */
  actualCost: number;
  /** Cost if all calls went to baseline model (Opus) */
  baselineCost: number;
  /** Total savings */
  savings: number;
  /** Savings as percentage */
  savingsPercent: number;
  /** Cost breakdown by model */
  byModel: Record<string, ModelCostBreakdown>;
  /** Cost breakdown by task type */
  byTaskType: Record<string, { runs: number; cost: number; avgCostPerRun: number }>;
}

/**
 * Calculate cost for a specific model and token counts.
 */
export function calculateCost(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  // Extract model name from provider:model format
  const modelName = model.includes(':') ? model.split(':')[1] : model;
  
  // Find pricing, with fallback to default
  const pricing = MODEL_PRICING[modelName as keyof typeof MODEL_PRICING] ??
    MODEL_PRICING[model as keyof typeof MODEL_PRICING] ??
    { input: 1, output: 3 }; // Default fallback pricing

  const inputCost = (tokensIn / 1_000_000) * pricing.input;
  const outputCost = (tokensOut / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Get pricing for a model.
 */
export function getModelPricing(model: string): { input: number; output: number } | null {
  const modelName = model.includes(':') ? model.split(':')[1] : model;
  return MODEL_PRICING[modelName as keyof typeof MODEL_PRICING] ??
    MODEL_PRICING[model as keyof typeof MODEL_PRICING] ??
    null;
}

/**
 * Calculate savings report from stored runs.
 */
export function calculateSavings(store: Store, days: number = 30): SavingsReport {
  // Calculate date range
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const fromStr = from.toISOString();
  const toStr = to.toISOString();

  // Get all runs in the period
  const runs = store.getRuns({
    from: fromStr,
    to: toStr,
    limit: 100000, // Get all runs
  });

  // Initialize aggregation
  const byModel: Record<string, ModelCostBreakdown> = {};
  const byTaskType: Record<string, { runs: number; cost: number; totalCost: number }> = {};
  
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let actualCost = 0;
  let baselineCost = 0;

  const baselinePricing = MODEL_PRICING[BASELINE_MODEL] ?? { input: 15, output: 75 };

  for (const run of runs) {
    const tokensIn = run.tokensIn ?? 0;
    const tokensOut = run.tokensOut ?? 0;
    const modelName = run.model.includes(':') ? run.model.split(':')[1] ?? run.model : run.model;

    // Calculate actual cost for this run
    const runCost = calculateCost(run.model, tokensIn, tokensOut);
    actualCost += runCost;

    // Calculate baseline cost (if this run used Opus)
    const baselineRunCost = (tokensIn / 1_000_000) * (baselinePricing?.input ?? 15) +
      (tokensOut / 1_000_000) * (baselinePricing?.output ?? 75);
    baselineCost += baselineRunCost;

    // Aggregate totals
    totalTokensIn += tokensIn;
    totalTokensOut += tokensOut;

    // Aggregate by model
    if (!byModel[modelName]) {
      byModel[modelName] = {
        runs: 0,
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        successRate: 0,
        avgLatencyMs: 0,
      };
    }
    const modelStats = byModel[modelName]!;
    modelStats.runs++;
    modelStats.tokensIn += tokensIn;
    modelStats.tokensOut += tokensOut;
    modelStats.cost += runCost;
    modelStats.avgLatencyMs += run.durationMs;
    if (run.success) {
      modelStats.successRate++;
    }

    // Aggregate by task type
    if (!byTaskType[run.taskType]) {
      byTaskType[run.taskType] = { runs: 0, cost: 0, totalCost: 0 };
    }
    const taskStats = byTaskType[run.taskType]!;
    taskStats.runs++;
    taskStats.totalCost += runCost;
  }

  // Finalize model stats (calculate averages)
  for (const model of Object.keys(byModel)) {
    const stats = byModel[model]!;
    stats.successRate = stats.runs > 0 ? stats.successRate / stats.runs : 0;
    stats.avgLatencyMs = stats.runs > 0 ? stats.avgLatencyMs / stats.runs : 0;
  }

  // Finalize task type stats
  const byTaskTypeFinal: Record<string, { runs: number; cost: number; avgCostPerRun: number }> = {};
  for (const [taskType, stats] of Object.entries(byTaskType)) {
    byTaskTypeFinal[taskType] = {
      runs: stats.runs,
      cost: stats.totalCost,
      avgCostPerRun: stats.runs > 0 ? stats.totalCost / stats.runs : 0,
    };
  }

  // Calculate savings
  const savings = baselineCost - actualCost;
  const savingsPercent = baselineCost > 0 ? (savings / baselineCost) * 100 : 0;

  return {
    periodDays: days,
    period: {
      from: fromStr,
      to: toStr,
    },
    totalRuns: runs.length,
    totalTokensIn,
    totalTokensOut,
    actualCost,
    baselineCost,
    savings: Math.max(0, savings), // Don't report negative savings
    savingsPercent: Math.max(0, savingsPercent),
    byModel,
    byTaskType: byTaskTypeFinal,
  };
}

/**
 * Format currency for display.
 */
export function formatCurrency(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Format token count for display.
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return String(count);
}
