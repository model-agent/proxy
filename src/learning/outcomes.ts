/**
 * Outcome Recording
 *
 * Handles recording and processing of run outcomes.
 *
 * @packageDocumentation
 */

import type { Store } from '../storage/store.js';
import type { OutcomeInput, Outcome, OutcomeRecord } from '../types.js';

/**
 * Outcome recorder for processing user feedback.
 */
export class OutcomeRecorder {
  private store: Store;

  /**
   * Creates a new OutcomeRecorder.
   *
   * @param store - The storage instance to use
   */
  constructor(store: Store) {
    this.store = store;
  }

  /**
   * Records an outcome for a run.
   *
   * @param input - The outcome input
   * @returns The recorded outcome
   * @throws If the run ID is not found
   */
  record(input: OutcomeInput): Outcome {
    // Verify the run exists
    const run = this.store.getRun(input.runId);
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }

    // Record the outcome
    const id = this.store.recordOutcome({
      runId: input.runId,
      success: input.success,
      quality: input.quality ?? null,
      latencySatisfactory: input.latencySatisfactory ?? null,
      costSatisfactory: input.costSatisfactory ?? null,
      feedback: input.feedback ?? null,
    });

    // Get the recorded outcome
    const outcome = this.store.getOutcome(input.runId);
    if (!outcome) {
      throw new Error('Failed to record outcome');
    }

    return {
      id: outcome.id,
      runId: outcome.runId,
      success: outcome.success,
      quality: outcome.quality ?? undefined,
      latencySatisfactory: outcome.latencySatisfactory ?? undefined,
      costSatisfactory: outcome.costSatisfactory ?? undefined,
      feedback: outcome.feedback ?? undefined,
      recordedAt: outcome.createdAt,
    };
  }

  /**
   * Gets an outcome for a run.
   *
   * @param runId - The run ID
   * @returns The outcome, or null if not found
   */
  get(runId: string): Outcome | null {
    const outcome = this.store.getOutcome(runId);
    if (!outcome) return null;

    return {
      id: outcome.id,
      runId: outcome.runId,
      success: outcome.success,
      quality: outcome.quality ?? undefined,
      latencySatisfactory: outcome.latencySatisfactory ?? undefined,
      costSatisfactory: outcome.costSatisfactory ?? undefined,
      feedback: outcome.feedback ?? undefined,
      recordedAt: outcome.createdAt,
    };
  }

  /**
   * Gets outcome statistics for a task type.
   *
   * @param taskType - The task type to get stats for
   * @returns Outcome statistics
   */
  getTaskStats(taskType: string): {
    totalOutcomes: number;
    successRate: number;
    qualityDistribution: Record<string, number>;
    latencySatisfactionRate: number;
    costSatisfactionRate: number;
  } {
    const outcomes = this.store.getOutcomes({ taskType: taskType as any, limit: 1000 });

    if (outcomes.length === 0) {
      return {
        totalOutcomes: 0,
        successRate: 0,
        qualityDistribution: {},
        latencySatisfactionRate: 0,
        costSatisfactionRate: 0,
      };
    }

    // Calculate statistics
    let successCount = 0;
    let latencySatisfiedCount = 0;
    let latencyRatedCount = 0;
    let costSatisfiedCount = 0;
    let costRatedCount = 0;
    const qualityDistribution: Record<string, number> = {};

    for (const outcome of outcomes) {
      if (outcome.success) successCount++;

      if (outcome.quality) {
        qualityDistribution[outcome.quality] = (qualityDistribution[outcome.quality] ?? 0) + 1;
      }

      if (outcome.latencySatisfactory != null) {
        latencyRatedCount++;
        if (outcome.latencySatisfactory) latencySatisfiedCount++;
      }

      if (outcome.costSatisfactory != null) {
        costRatedCount++;
        if (outcome.costSatisfactory) costSatisfiedCount++;
      }
    }

    return {
      totalOutcomes: outcomes.length,
      successRate: successCount / outcomes.length,
      qualityDistribution,
      latencySatisfactionRate: latencyRatedCount > 0 ? latencySatisfiedCount / latencyRatedCount : 0,
      costSatisfactionRate: costRatedCount > 0 ? costSatisfiedCount / costRatedCount : 0,
    };
  }
}
