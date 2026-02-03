/**
 * RelayPlane Core Types
 *
 * All TypeScript interfaces for the agent optimization layer.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// ============================================================================
// Task Types
// ============================================================================

/**
 * The 9 task types that RelayPlane can infer and route.
 */
export const TaskTypes = [
  'code_generation',
  'code_review',
  'summarization',
  'analysis',
  'creative_writing',
  'data_extraction',
  'translation',
  'question_answering',
  'general',
] as const;

export type TaskType = (typeof TaskTypes)[number];

/**
 * Zod schema for task types.
 */
export const TaskTypeSchema = z.enum(TaskTypes);

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported AI providers.
 */
export const Providers = ['openai', 'anthropic', 'google', 'xai', 'moonshot', 'local'] as const;

export type Provider = (typeof Providers)[number];

/**
 * Zod schema for providers.
 */
export const ProviderSchema = z.enum(Providers);

// ============================================================================
// Configuration
// ============================================================================

/**
 * Provider-specific configuration.
 */
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * RelayPlane configuration.
 */
export interface RelayPlaneConfig {
  /**
   * Path to SQLite database file.
   * @default "~/.relayplane/data.db"
   */
  dbPath?: string;

  /**
   * Provider configurations.
   */
  providers?: Partial<Record<Provider, ProviderConfig>>;

  /**
   * Default provider to use when routing cannot determine one.
   * @default "local"
   */
  defaultProvider?: Provider;

  /**
   * Default model within the default provider.
   * @default "llama3.2"
   */
  defaultModel?: string;
}

/**
 * Zod schema for RelayPlane configuration.
 */
export const RelayPlaneConfigSchema = z.object({
  dbPath: z.string().optional(),
  providers: z.record(ProviderSchema, z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
  })).optional(),
  defaultProvider: ProviderSchema.optional(),
  defaultModel: z.string().optional(),
});

// ============================================================================
// Run Input/Output
// ============================================================================

/**
 * Input for a RelayPlane run.
 */
export interface RunInput {
  /**
   * The prompt to send to the model.
   */
  prompt: string;

  /**
   * Optional system prompt.
   */
  systemPrompt?: string;

  /**
   * Override the inferred task type.
   */
  taskType?: TaskType;

  /**
   * Override the model selection (format: "provider:model").
   */
  model?: string;

  /**
   * Additional metadata to attach to the run.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Zod schema for run input.
 */
export const RunInputSchema = z.object({
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  taskType: TaskTypeSchema.optional(),
  model: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Result of a RelayPlane run.
 */
export interface RunResult {
  /**
   * Unique identifier for this run.
   */
  runId: string;

  /**
   * Whether the run completed successfully.
   */
  success: boolean;

  /**
   * The model's output (if successful).
   */
  output?: string;

  /**
   * Error message (if failed).
   */
  error?: string;

  /**
   * The inferred or specified task type.
   */
  taskType: TaskType;

  /**
   * The model used (format: "provider:model").
   */
  model: string;

  /**
   * Execution duration in milliseconds.
   */
  durationMs: number;

  /**
   * Input tokens used (if available).
   */
  tokensIn?: number;

  /**
   * Output tokens used (if available).
   */
  tokensOut?: number;

  /**
   * Timestamp of the run.
   */
  timestamp: string;
}

// ============================================================================
// Routing Rules
// ============================================================================

/**
 * Source of a routing rule.
 */
export const RuleSources = ['default', 'user', 'learned'] as const;

export type RuleSource = (typeof RuleSources)[number];

/**
 * A routing rule that maps a task type to a preferred model.
 */
export interface RoutingRule {
  /**
   * Unique identifier for this rule.
   */
  id: string;

  /**
   * The task type this rule applies to.
   */
  taskType: TaskType;

  /**
   * The preferred model (format: "provider:model").
   */
  preferredModel: string;

  /**
   * How this rule was created.
   */
  source: RuleSource;

  /**
   * Confidence score (0-1) for learned rules.
   */
  confidence?: number;

  /**
   * Number of runs that informed this rule.
   */
  sampleCount?: number;

  /**
   * When the rule was created.
   */
  createdAt: string;

  /**
   * When the rule was last updated.
   */
  updatedAt: string;
}

/**
 * Zod schema for routing rule.
 */
export const RoutingRuleSchema = z.object({
  id: z.string(),
  taskType: TaskTypeSchema,
  preferredModel: z.string(),
  source: z.enum(RuleSources),
  confidence: z.number().min(0).max(1).optional(),
  sampleCount: z.number().int().positive().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// Outcome Recording
// ============================================================================

/**
 * Outcome quality levels.
 */
export const OutcomeQualities = ['excellent', 'good', 'acceptable', 'poor', 'failed'] as const;

export type OutcomeQuality = (typeof OutcomeQualities)[number];

/**
 * Input for recording an outcome.
 */
export interface OutcomeInput {
  /**
   * The run ID to record outcome for.
   */
  runId: string;

  /**
   * Whether the outcome was successful.
   */
  success: boolean;

  /**
   * Quality assessment.
   */
  quality?: OutcomeQuality;

  /**
   * Latency satisfaction (was the response fast enough?).
   */
  latencySatisfactory?: boolean;

  /**
   * Cost satisfaction (was the cost acceptable?).
   */
  costSatisfactory?: boolean;

  /**
   * Free-form feedback.
   */
  feedback?: string;
}

/**
 * Zod schema for outcome input.
 */
export const OutcomeInputSchema = z.object({
  runId: z.string().min(1),
  success: z.boolean(),
  quality: z.enum(OutcomeQualities).optional(),
  latencySatisfactory: z.boolean().optional(),
  costSatisfactory: z.boolean().optional(),
  feedback: z.string().optional(),
});

/**
 * A recorded outcome with full details.
 */
export interface Outcome extends OutcomeInput {
  /**
   * Unique identifier for this outcome.
   */
  id: string;

  /**
   * When the outcome was recorded.
   */
  recordedAt: string;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Statistics for a specific task type.
 */
export interface TaskStats {
  /**
   * The task type.
   */
  taskType: TaskType;

  /**
   * Total number of runs.
   */
  totalRuns: number;

  /**
   * Number of successful runs.
   */
  successfulRuns: number;

  /**
   * Success rate (0-1).
   */
  successRate: number;

  /**
   * Average duration in milliseconds.
   */
  avgDurationMs: number;

  /**
   * Average input tokens.
   */
  avgTokensIn?: number;

  /**
   * Average output tokens.
   */
  avgTokensOut?: number;

  /**
   * Model breakdown.
   */
  byModel: Record<string, {
    runs: number;
    successRate: number;
    avgDurationMs: number;
  }>;
}

/**
 * Overall statistics.
 */
export interface Stats {
  /**
   * Total runs across all task types.
   */
  totalRuns: number;

  /**
   * Overall success rate.
   */
  overallSuccessRate: number;

  /**
   * Statistics by task type.
   */
  byTaskType: Record<TaskType, TaskStats>;

  /**
   * Time period covered.
   */
  period: {
    from: string;
    to: string;
  };
}

// ============================================================================
// Suggestions
// ============================================================================

/**
 * A suggestion for improving routing.
 */
export interface Suggestion {
  /**
   * Unique identifier for this suggestion.
   */
  id: string;

  /**
   * The task type this suggestion applies to.
   */
  taskType: TaskType;

  /**
   * Current model being used.
   */
  currentModel: string;

  /**
   * Suggested model to switch to.
   */
  suggestedModel: string;

  /**
   * Reason for the suggestion.
   */
  reason: string;

  /**
   * Confidence score (0-1).
   */
  confidence: number;

  /**
   * Expected improvement.
   */
  expectedImprovement: {
    successRate?: number;
    latency?: number;
    cost?: number;
  };

  /**
   * Number of data points this suggestion is based on.
   */
  sampleCount: number;

  /**
   * When the suggestion was generated.
   */
  createdAt: string;

  /**
   * Whether this suggestion has been accepted.
   */
  accepted?: boolean;

  /**
   * When the suggestion was accepted.
   */
  acceptedAt?: string;
}

/**
 * Zod schema for suggestion.
 */
export const SuggestionSchema = z.object({
  id: z.string(),
  taskType: TaskTypeSchema,
  currentModel: z.string(),
  suggestedModel: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  expectedImprovement: z.object({
    successRate: z.number().optional(),
    latency: z.number().optional(),
    cost: z.number().optional(),
  }),
  sampleCount: z.number().int().positive(),
  createdAt: z.string(),
  accepted: z.boolean().optional(),
  acceptedAt: z.string().optional(),
});

// ============================================================================
// Storage Types (Internal)
// ============================================================================

/**
 * Run record as stored in the database.
 */
export interface RunRecord {
  id: string;
  prompt: string;
  systemPrompt: string | null;
  taskType: TaskType;
  model: string;
  success: boolean;
  output: string | null;
  error: string | null;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  metadata: string | null; // JSON
  createdAt: string;
}

/**
 * Outcome record as stored in the database.
 */
export interface OutcomeRecord {
  id: string;
  runId: string;
  success: boolean;
  quality: OutcomeQuality | null;
  latencySatisfactory: boolean | null;
  costSatisfactory: boolean | null;
  feedback: string | null;
  createdAt: string;
}

/**
 * Routing rule record as stored in the database.
 */
export interface RuleRecord {
  id: string;
  taskType: TaskType;
  preferredModel: string;
  source: RuleSource;
  confidence: number | null;
  sampleCount: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Suggestion record as stored in the database.
 */
export interface SuggestionRecord {
  id: string;
  taskType: TaskType;
  currentModel: string;
  suggestedModel: string;
  reason: string;
  confidence: number;
  expectedImprovement: string; // JSON
  sampleCount: number;
  accepted: boolean | null;
  createdAt: string;
  acceptedAt: string | null;
}
