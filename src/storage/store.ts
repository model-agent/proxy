/**
 * SQLite Storage Implementation
 *
 * Provides persistent storage for runs, outcomes, routing rules, and suggestions.
 *
 * @packageDocumentation
 */

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { SCHEMA_SQL, generateSeedSQL } from './schema.js';
import type {
  RunRecord,
  OutcomeRecord,
  RuleRecord,
  SuggestionRecord,
  TaskType,
  RuleSource,
  OutcomeQuality,
} from '../types.js';

/**
 * Default database path.
 */
export function getDefaultDbPath(): string {
  return path.join(os.homedir(), '.relayplane', 'data.db');
}

/**
 * SQLite storage class for RelayPlane data.
 */
export class Store {
  private db: Database.Database;
  private readonly dbPath: string;

  /**
   * Creates a new Store instance.
   *
   * @param dbPath - Path to the SQLite database file. Defaults to ~/.relayplane/data.db
   */
  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getDefaultDbPath();

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Initialize schema
    this.initializeSchema();
  }

  /**
   * Initializes the database schema.
   */
  private initializeSchema(): void {
    this.db.exec(SCHEMA_SQL);
    this.db.exec(generateSeedSQL());
  }

  /**
   * Closes the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Gets the database path.
   */
  getDbPath(): string {
    return this.dbPath;
  }

  // ============================================================================
  // Runs
  // ============================================================================

  /**
   * Records a new run.
   */
  recordRun(run: Omit<RunRecord, 'id' | 'createdAt'>): string {
    const id = nanoid();
    const stmt = this.db.prepare(`
      INSERT INTO runs (id, prompt, system_prompt, task_type, model, success, output, error, duration_ms, tokens_in, tokens_out, cost_usd, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
      id,
      run.prompt,
      run.systemPrompt,
      run.taskType,
      run.model,
      run.success ? 1 : 0,
      run.output,
      run.error,
      run.durationMs,
      run.tokensIn,
      run.tokensOut,
      run.costUsd,
      run.metadata
    );

    return id;
  }

  /**
   * Gets a run by ID.
   */
  getRun(id: string): RunRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, prompt, system_prompt as systemPrompt, task_type as taskType, model, success, output, error, duration_ms as durationMs, tokens_in as tokensIn, tokens_out as tokensOut, cost_usd as costUsd, metadata, created_at as createdAt
      FROM runs
      WHERE id = ?
    `);

    const row = stmt.get(id) as RunRecord | undefined;
    if (!row) return null;

    return {
      ...row,
      success: Boolean(row.success),
    };
  }

  /**
   * Gets runs with optional filters.
   */
  getRuns(options?: {
    taskType?: TaskType;
    model?: string;
    limit?: number;
    offset?: number;
    from?: string;
    to?: string;
  }): RunRecord[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.taskType) {
      conditions.push('task_type = ?');
      params.push(options.taskType);
    }

    if (options?.model) {
      conditions.push('model = ?');
      params.push(options.model);
    }

    if (options?.from) {
      conditions.push('created_at >= ?');
      params.push(options.from);
    }

    if (options?.to) {
      conditions.push('created_at <= ?');
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const stmt = this.db.prepare(`
      SELECT id, prompt, system_prompt as systemPrompt, task_type as taskType, model, success, output, error, duration_ms as durationMs, tokens_in as tokensIn, tokens_out as tokensOut, cost_usd as costUsd, metadata, created_at as createdAt
      FROM runs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    params.push(limit, offset);

    const rows = stmt.all(...params) as RunRecord[];
    return rows.map((row) => ({
      ...row,
      success: Boolean(row.success),
    }));
  }

  /**
   * Counts runs with optional filters.
   */
  countRuns(options?: {
    taskType?: TaskType;
    model?: string;
    from?: string;
    to?: string;
  }): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.taskType) {
      conditions.push('task_type = ?');
      params.push(options.taskType);
    }

    if (options?.model) {
      conditions.push('model = ?');
      params.push(options.model);
    }

    if (options?.from) {
      conditions.push('created_at >= ?');
      params.push(options.from);
    }

    if (options?.to) {
      conditions.push('created_at <= ?');
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM runs
      ${whereClause}
    `);

    const row = stmt.get(...params) as { count: number };
    return row.count;
  }

  // ============================================================================
  // Outcomes
  // ============================================================================

  /**
   * Records an outcome for a run.
   */
  recordOutcome(outcome: Omit<OutcomeRecord, 'id' | 'createdAt'>): string {
    const id = nanoid();
    const stmt = this.db.prepare(`
      INSERT INTO outcomes (id, run_id, success, quality, latency_satisfactory, cost_satisfactory, feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(run_id) DO UPDATE SET
        success = excluded.success,
        quality = excluded.quality,
        latency_satisfactory = excluded.latency_satisfactory,
        cost_satisfactory = excluded.cost_satisfactory,
        feedback = excluded.feedback,
        created_at = datetime('now')
    `);

    stmt.run(
      id,
      outcome.runId,
      outcome.success ? 1 : 0,
      outcome.quality,
      outcome.latencySatisfactory != null ? (outcome.latencySatisfactory ? 1 : 0) : null,
      outcome.costSatisfactory != null ? (outcome.costSatisfactory ? 1 : 0) : null,
      outcome.feedback
    );

    return id;
  }

  /**
   * Gets an outcome for a run.
   */
  getOutcome(runId: string): OutcomeRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, run_id as runId, success, quality, latency_satisfactory as latencySatisfactory, cost_satisfactory as costSatisfactory, feedback, created_at as createdAt
      FROM outcomes
      WHERE run_id = ?
    `);

    const row = stmt.get(runId) as OutcomeRecord | undefined;
    if (!row) return null;

    return {
      ...row,
      success: Boolean(row.success),
      latencySatisfactory: row.latencySatisfactory != null ? Boolean(row.latencySatisfactory) : null,
      costSatisfactory: row.costSatisfactory != null ? Boolean(row.costSatisfactory) : null,
    };
  }

  /**
   * Gets outcomes with optional filters.
   */
  getOutcomes(options?: {
    taskType?: TaskType;
    model?: string;
    limit?: number;
    from?: string;
    to?: string;
  }): Array<OutcomeRecord & { taskType: TaskType; model: string }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.taskType) {
      conditions.push('r.task_type = ?');
      params.push(options.taskType);
    }

    if (options?.model) {
      conditions.push('r.model = ?');
      params.push(options.model);
    }

    if (options?.from) {
      conditions.push('o.created_at >= ?');
      params.push(options.from);
    }

    if (options?.to) {
      conditions.push('o.created_at <= ?');
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 100;

    const stmt = this.db.prepare(`
      SELECT o.id, o.run_id as runId, o.success, o.quality, o.latency_satisfactory as latencySatisfactory, o.cost_satisfactory as costSatisfactory, o.feedback, o.created_at as createdAt, r.task_type as taskType, r.model
      FROM outcomes o
      JOIN runs r ON o.run_id = r.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ?
    `);

    params.push(limit);

    const rows = stmt.all(...params) as Array<OutcomeRecord & { taskType: TaskType; model: string }>;
    return rows.map((row) => ({
      ...row,
      success: Boolean(row.success),
      latencySatisfactory: row.latencySatisfactory != null ? Boolean(row.latencySatisfactory) : null,
      costSatisfactory: row.costSatisfactory != null ? Boolean(row.costSatisfactory) : null,
    }));
  }

  // ============================================================================
  // Routing Rules
  // ============================================================================

  /**
   * Gets a routing rule for a task type.
   */
  getRule(taskType: TaskType): RuleRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, task_type as taskType, preferred_model as preferredModel, source, confidence, sample_count as sampleCount, created_at as createdAt, updated_at as updatedAt
      FROM routing_rules
      WHERE task_type = ?
    `);

    return (stmt.get(taskType) as RuleRecord | undefined) ?? null;
  }

  /**
   * Sets a routing rule for a task type.
   */
  setRule(taskType: TaskType, preferredModel: string, source: RuleSource, confidence?: number, sampleCount?: number): string {
    const existingRule = this.getRule(taskType);
    const id = existingRule?.id ?? nanoid();

    const stmt = this.db.prepare(`
      INSERT INTO routing_rules (id, task_type, preferred_model, source, confidence, sample_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(task_type) DO UPDATE SET
        preferred_model = excluded.preferred_model,
        source = excluded.source,
        confidence = excluded.confidence,
        sample_count = excluded.sample_count,
        updated_at = datetime('now')
    `);

    stmt.run(id, taskType, preferredModel, source, confidence ?? null, sampleCount ?? null);

    return id;
  }

  /**
   * Lists all routing rules.
   */
  listRules(): RuleRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, task_type as taskType, preferred_model as preferredModel, source, confidence, sample_count as sampleCount, created_at as createdAt, updated_at as updatedAt
      FROM routing_rules
      ORDER BY task_type
    `);

    return stmt.all() as RuleRecord[];
  }

  /**
   * Deletes a routing rule and resets to default.
   */
  deleteRule(taskType: TaskType): boolean {
    // Find the default rule for this task type
    const defaultRule = DEFAULT_ROUTING_RULES.find((r) => r.taskType === taskType);
    if (!defaultRule) return false;

    // Reset to default
    this.setRule(taskType, defaultRule.preferredModel, 'default');
    return true;
  }

  // ============================================================================
  // Suggestions
  // ============================================================================

  /**
   * Records a suggestion.
   */
  recordSuggestion(suggestion: Omit<SuggestionRecord, 'id' | 'createdAt' | 'acceptedAt'>): string {
    const id = nanoid();
    const stmt = this.db.prepare(`
      INSERT INTO suggestions (id, task_type, current_model, suggested_model, reason, confidence, expected_improvement, sample_count, accepted, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
      id,
      suggestion.taskType,
      suggestion.currentModel,
      suggestion.suggestedModel,
      suggestion.reason,
      suggestion.confidence,
      suggestion.expectedImprovement,
      suggestion.sampleCount,
      suggestion.accepted ?? null
    );

    return id;
  }

  /**
   * Gets a suggestion by ID.
   */
  getSuggestion(id: string): SuggestionRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, task_type as taskType, current_model as currentModel, suggested_model as suggestedModel, reason, confidence, expected_improvement as expectedImprovement, sample_count as sampleCount, accepted, created_at as createdAt, accepted_at as acceptedAt
      FROM suggestions
      WHERE id = ?
    `);

    const row = stmt.get(id) as SuggestionRecord | undefined;
    if (!row) return null;

    return {
      ...row,
      accepted: row.accepted != null ? Boolean(row.accepted) : null,
    };
  }

  /**
   * Gets pending (unaccepted) suggestions.
   */
  getPendingSuggestions(): SuggestionRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, task_type as taskType, current_model as currentModel, suggested_model as suggestedModel, reason, confidence, expected_improvement as expectedImprovement, sample_count as sampleCount, accepted, created_at as createdAt, accepted_at as acceptedAt
      FROM suggestions
      WHERE accepted IS NULL
      ORDER BY confidence DESC
    `);

    const rows = stmt.all() as SuggestionRecord[];
    return rows.map((row) => ({
      ...row,
      accepted: row.accepted != null ? Boolean(row.accepted) : null,
    }));
  }

  /**
   * Accepts a suggestion.
   */
  acceptSuggestion(id: string): boolean {
    const suggestion = this.getSuggestion(id);
    if (!suggestion) return false;

    // Update the suggestion
    const updateStmt = this.db.prepare(`
      UPDATE suggestions
      SET accepted = 1, accepted_at = datetime('now')
      WHERE id = ?
    `);
    updateStmt.run(id);

    // Update the routing rule
    this.setRule(
      suggestion.taskType,
      suggestion.suggestedModel,
      'learned',
      suggestion.confidence,
      suggestion.sampleCount
    );

    return true;
  }

  /**
   * Rejects a suggestion.
   */
  rejectSuggestion(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE suggestions
      SET accepted = 0, accepted_at = datetime('now')
      WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Gets aggregated statistics.
   */
  getStats(options?: { from?: string; to?: string }): {
    totalRuns: number;
    successfulRuns: number;
    avgDurationMs: number;
    byTaskType: Record<string, { runs: number; successRate: number; avgDurationMs: number }>;
    byModel: Record<string, { runs: number; successRate: number; avgDurationMs: number }>;
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.from) {
      conditions.push('created_at >= ?');
      params.push(options.from);
    }

    if (options?.to) {
      conditions.push('created_at <= ?');
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Overall stats
    const overallStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as totalRuns,
        SUM(success) as successfulRuns,
        AVG(duration_ms) as avgDurationMs
      FROM runs
      ${whereClause}
    `);

    const overall = overallStmt.get(...params) as {
      totalRuns: number;
      successfulRuns: number;
      avgDurationMs: number;
    };

    // Stats by task type
    const byTaskTypeStmt = this.db.prepare(`
      SELECT 
        task_type as taskType,
        COUNT(*) as runs,
        AVG(success) as successRate,
        AVG(duration_ms) as avgDurationMs
      FROM runs
      ${whereClause}
      GROUP BY task_type
    `);

    const byTaskTypeRows = byTaskTypeStmt.all(...params) as Array<{
      taskType: string;
      runs: number;
      successRate: number;
      avgDurationMs: number;
    }>;

    const byTaskType: Record<string, { runs: number; successRate: number; avgDurationMs: number }> = {};
    for (const row of byTaskTypeRows) {
      byTaskType[row.taskType] = {
        runs: row.runs,
        successRate: row.successRate,
        avgDurationMs: row.avgDurationMs,
      };
    }

    // Stats by model
    const byModelStmt = this.db.prepare(`
      SELECT 
        model,
        COUNT(*) as runs,
        AVG(success) as successRate,
        AVG(duration_ms) as avgDurationMs
      FROM runs
      ${whereClause}
      GROUP BY model
    `);

    const byModelRows = byModelStmt.all(...params) as Array<{
      model: string;
      runs: number;
      successRate: number;
      avgDurationMs: number;
    }>;

    const byModel: Record<string, { runs: number; successRate: number; avgDurationMs: number }> = {};
    for (const row of byModelRows) {
      byModel[row.model] = {
        runs: row.runs,
        successRate: row.successRate,
        avgDurationMs: row.avgDurationMs,
      };
    }

    return {
      totalRuns: overall.totalRuns,
      successfulRuns: overall.successfulRuns ?? 0,
      avgDurationMs: overall.avgDurationMs ?? 0,
      byTaskType,
      byModel,
    };
  }

  /**
   * Gets statistics for learning (outcomes joined with runs).
   */
  getLearningStats(taskType: TaskType): Array<{
    model: string;
    runs: number;
    successRate: number;
    avgDurationMs: number;
    outcomeSuccessRate: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        r.model,
        COUNT(*) as runs,
        AVG(r.success) as successRate,
        AVG(r.duration_ms) as avgDurationMs,
        AVG(CASE WHEN o.success IS NOT NULL THEN o.success ELSE r.success END) as outcomeSuccessRate
      FROM runs r
      LEFT JOIN outcomes o ON r.id = o.run_id
      WHERE r.task_type = ?
      GROUP BY r.model
      HAVING runs >= 5
    `);

    return stmt.all(taskType) as Array<{
      model: string;
      runs: number;
      successRate: number;
      avgDurationMs: number;
      outcomeSuccessRate: number;
    }>;
  }
}

// Import for seed data
import { DEFAULT_ROUTING_RULES } from './schema.js';
