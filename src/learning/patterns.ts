/**
 * Pattern Detection
 *
 * Analyzes run history to detect patterns and generate suggestions.
 *
 * @packageDocumentation
 */

import type { Store } from '../storage/store.js';
import type { TaskType, Suggestion } from '../types.js';
import { nanoid } from 'nanoid';
import { calculateCost, MODEL_PRICING } from './savings.js';

/**
 * Minimum number of runs required to generate a suggestion.
 */
const MIN_RUNS_FOR_SUGGESTION = 10;

/**
 * Minimum confidence threshold for suggestions.
 */
const MIN_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Minimum improvement threshold to suggest a change (e.g., 10% better).
 */
const MIN_IMPROVEMENT_THRESHOLD = 0.1;

/**
 * Minimum cost savings threshold to suggest a cheaper model (20% cost reduction).
 */
const MIN_COST_IMPROVEMENT_THRESHOLD = 0.2;

/**
 * Pattern detection engine for learning from outcomes.
 */
export class PatternDetector {
  private store: Store;

  /**
   * Creates a new PatternDetector.
   *
   * @param store - The storage instance to use
   */
  constructor(store: Store) {
    this.store = store;
  }

  /**
   * Analyzes a task type and generates suggestions if appropriate.
   *
   * @param taskType - The task type to analyze
   * @returns Array of suggestions
   */
  analyzeTaskType(taskType: TaskType): Suggestion[] {
    const stats = this.store.getLearningStats(taskType);

    if (stats.length < 2) {
      // Need at least 2 models to compare
      return [];
    }

    // Get the current routing rule
    const currentRule = this.store.getRule(taskType);
    if (!currentRule) return [];

    const currentModel = currentRule.preferredModel;

    // Find the current model's stats
    const currentStats = stats.find((s) => s.model === currentModel);
    if (!currentStats) return [];

    // Get pricing for current model
    const currentModelName = currentModel.includes(':') ? currentModel.split(':')[1] : currentModel;
    const currentPricing = MODEL_PRICING[currentModelName as keyof typeof MODEL_PRICING];

    // Find better performing models
    const suggestions: Suggestion[] = [];

    for (const modelStats of stats) {
      if (modelStats.model === currentModel) continue;
      if (modelStats.runs < MIN_RUNS_FOR_SUGGESTION) continue;

      // Calculate improvement potential
      const successImprovement = modelStats.outcomeSuccessRate - currentStats.outcomeSuccessRate;
      const latencyImprovement = (currentStats.avgDurationMs - modelStats.avgDurationMs) / currentStats.avgDurationMs;

      // Calculate cost improvement
      const suggestedModelName = modelStats.model.includes(':') 
        ? modelStats.model.split(':')[1] 
        : modelStats.model;
      const suggestedPricing = MODEL_PRICING[suggestedModelName as keyof typeof MODEL_PRICING];
      
      let costImprovement = 0;
      if (currentPricing && suggestedPricing) {
        // Use average of input/output pricing for comparison
        const currentAvgCost = (currentPricing.input + currentPricing.output) / 2;
        const suggestedAvgCost = (suggestedPricing.input + suggestedPricing.output) / 2;
        costImprovement = (currentAvgCost - suggestedAvgCost) / currentAvgCost;
      }

      // Check if this model is significantly better
      // Better = higher success OR faster OR cheaper (with acceptable success rate)
      const isSignificantlyBetter =
        successImprovement > MIN_IMPROVEMENT_THRESHOLD ||
        (successImprovement >= 0 && latencyImprovement > MIN_IMPROVEMENT_THRESHOLD) ||
        (successImprovement >= -0.05 && costImprovement > MIN_COST_IMPROVEMENT_THRESHOLD); // Allow 5% worse success for 20%+ cost savings

      if (!isSignificantlyBetter) continue;

      // Calculate confidence based on sample size and improvement magnitude
      const sampleConfidence = Math.min(modelStats.runs / 50, 1); // Max confidence at 50 runs
      const improvementConfidence = Math.min(
        Math.abs(successImprovement) / 0.3 + 
        Math.abs(latencyImprovement) / 0.5 +
        Math.abs(costImprovement) / 0.5,
        1
      );
      const confidence = (sampleConfidence + improvementConfidence) / 2;

      if (confidence < MIN_CONFIDENCE_THRESHOLD) continue;

      // Generate reason
      const reasons: string[] = [];
      if (successImprovement > 0) {
        reasons.push(`${(successImprovement * 100).toFixed(0)}% higher success rate`);
      }
      if (latencyImprovement > 0) {
        reasons.push(`${(latencyImprovement * 100).toFixed(0)}% faster`);
      }
      if (costImprovement > 0) {
        reasons.push(`${(costImprovement * 100).toFixed(0)}% cheaper`);
      }

      const suggestion: Suggestion = {
        id: nanoid(),
        taskType,
        currentModel,
        suggestedModel: modelStats.model,
        reason: reasons.join(', '),
        confidence,
        expectedImprovement: {
          successRate: successImprovement > 0 ? successImprovement : undefined,
          latency: latencyImprovement > 0 ? latencyImprovement : undefined,
          cost: costImprovement > 0 ? costImprovement : undefined,
        },
        sampleCount: modelStats.runs,
        createdAt: new Date().toISOString(),
      };

      suggestions.push(suggestion);
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions;
  }

  /**
   * Analyzes all task types and generates suggestions.
   *
   * @returns Array of all suggestions across task types
   */
  analyzeAll(): Suggestion[] {
    const taskTypes: TaskType[] = [
      'code_generation',
      'code_review',
      'summarization',
      'analysis',
      'creative_writing',
      'data_extraction',
      'translation',
      'question_answering',
      'general',
    ];

    const allSuggestions: Suggestion[] = [];

    for (const taskType of taskTypes) {
      const suggestions = this.analyzeTaskType(taskType);
      allSuggestions.push(...suggestions);
    }

    // Sort by confidence descending
    allSuggestions.sort((a, b) => b.confidence - a.confidence);

    return allSuggestions;
  }

  /**
   * Stores suggestions in the database.
   *
   * @param suggestions - The suggestions to store
   * @returns Array of suggestion IDs
   */
  storeSuggestions(suggestions: Suggestion[]): string[] {
    const ids: string[] = [];

    for (const suggestion of suggestions) {
      const id = this.store.recordSuggestion({
        taskType: suggestion.taskType,
        currentModel: suggestion.currentModel,
        suggestedModel: suggestion.suggestedModel,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        expectedImprovement: JSON.stringify(suggestion.expectedImprovement),
        sampleCount: suggestion.sampleCount,
        accepted: null,
      });
      ids.push(id);
    }

    return ids;
  }

  /**
   * Generates and stores new suggestions, returning only new ones.
   *
   * @returns Array of new suggestions
   */
  generateSuggestions(): Suggestion[] {
    const suggestions = this.analyzeAll();

    // Filter out suggestions that already exist (same task type + suggested model)
    const pending = this.store.getPendingSuggestions();
    const existingKeys = new Set(
      pending.map((s) => `${s.taskType}:${s.suggestedModel}`)
    );

    const newSuggestions = suggestions.filter(
      (s) => !existingKeys.has(`${s.taskType}:${s.suggestedModel}`)
    );

    // Store new suggestions
    this.storeSuggestions(newSuggestions);

    return newSuggestions;
  }
}
