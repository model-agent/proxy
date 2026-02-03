/**
 * Routing Engine
 *
 * Manages routing rules and model selection for tasks.
 *
 * @packageDocumentation
 */

import type { Store } from '../storage/store.js';
import type { TaskType, RoutingRule, RuleSource } from '../types.js';
import { inferTaskType, getInferenceConfidence } from './inference.js';

/**
 * Routing engine for managing model selection.
 */
export class RoutingEngine {
  private store: Store;

  /**
   * Creates a new RoutingEngine.
   *
   * @param store - The storage instance to use
   */
  constructor(store: Store) {
    this.store = store;
  }

  /**
   * Infers the task type from a prompt.
   *
   * @param prompt - The prompt to analyze
   * @returns The inferred task type
   */
  inferTaskType(prompt: string): TaskType {
    return inferTaskType(prompt);
  }

  /**
   * Gets the inference confidence for a task type.
   *
   * @param prompt - The prompt to analyze
   * @param taskType - The task type to check
   * @returns Confidence score (0-1)
   */
  getInferenceConfidence(prompt: string, taskType: TaskType): number {
    return getInferenceConfidence(prompt, taskType);
  }

  /**
   * Gets the routing rule for a task type.
   *
   * @param taskType - The task type to get the rule for
   * @returns The routing rule, or null if not found
   */
  get(taskType: TaskType): RoutingRule | null {
    const record = this.store.getRule(taskType);
    if (!record) return null;

    return {
      id: record.id,
      taskType: record.taskType,
      preferredModel: record.preferredModel,
      source: record.source,
      confidence: record.confidence ?? undefined,
      sampleCount: record.sampleCount ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Sets a routing rule for a task type.
   *
   * @param taskType - The task type to set the rule for
   * @param preferredModel - The preferred model (format: "provider:model")
   * @param source - How the rule was created
   * @param options - Optional confidence and sample count
   * @returns The rule ID
   */
  set(
    taskType: TaskType,
    preferredModel: string,
    source: RuleSource = 'user',
    options?: { confidence?: number; sampleCount?: number }
  ): string {
    return this.store.setRule(
      taskType,
      preferredModel,
      source,
      options?.confidence,
      options?.sampleCount
    );
  }

  /**
   * Lists all routing rules.
   *
   * @returns Array of all routing rules
   */
  list(): RoutingRule[] {
    const records = this.store.listRules();
    return records.map((record) => ({
      id: record.id,
      taskType: record.taskType,
      preferredModel: record.preferredModel,
      source: record.source,
      confidence: record.confidence ?? undefined,
      sampleCount: record.sampleCount ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }

  /**
   * Deletes a routing rule and resets to default.
   *
   * @param taskType - The task type to reset
   * @returns True if the rule was reset
   */
  delete(taskType: TaskType): boolean {
    return this.store.deleteRule(taskType);
  }

  /**
   * Gets the preferred model for a task type.
   *
   * @param taskType - The task type
   * @returns The preferred model string, or a default
   */
  getPreferredModel(taskType: TaskType): string {
    const rule = this.get(taskType);
    return rule?.preferredModel ?? 'local:llama3.2';
  }

  /**
   * Parses a model string into provider and model name.
   *
   * @param modelString - The model string (format: "provider:model")
   * @returns Object with provider and model
   */
  parseModel(modelString: string): { provider: string; model: string } {
    const parts = modelString.split(':');
    if (parts.length < 2) {
      return { provider: 'local', model: modelString };
    }
    return { provider: parts[0]!, model: parts.slice(1).join(':') };
  }

  /**
   * Resolves the model to use for a prompt.
   *
   * @param prompt - The prompt to analyze
   * @param overrideTaskType - Optional task type override
   * @param overrideModel - Optional model override
   * @returns Object with resolved taskType, model, provider, and confidence
   */
  resolve(
    prompt: string,
    overrideTaskType?: TaskType,
    overrideModel?: string
  ): {
    taskType: TaskType;
    model: string;
    provider: string;
    modelName: string;
    confidence: number;
  } {
    // Determine task type
    const taskType = overrideTaskType ?? this.inferTaskType(prompt);
    const confidence = this.getInferenceConfidence(prompt, taskType);

    // Determine model
    let model: string;
    if (overrideModel) {
      model = overrideModel;
    } else {
      model = this.getPreferredModel(taskType);
    }

    const { provider, model: modelName } = this.parseModel(model);

    return {
      taskType,
      model,
      provider,
      modelName,
      confidence,
    };
  }
}
