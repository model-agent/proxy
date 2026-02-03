/**
 * Tests for the savings calculator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../src/storage/store';
import {
  calculateSavings,
  calculateCost,
  getModelPricing,
  formatCurrency,
  formatTokens,
  MODEL_PRICING,
  BASELINE_MODEL,
} from '../src/learning/savings';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Savings Calculator', () => {
  let store: Store;
  let testDbPath: string;

  beforeEach(() => {
    // Create a temporary database
    testDbPath = path.join(os.tmpdir(), `relayplane-test-${Date.now()}.db`);
    store = new Store(testDbPath);
  });

  afterEach(() => {
    store.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('calculateCost', () => {
    it('should calculate cost for Haiku model', () => {
      const cost = calculateCost('claude-3-5-haiku-latest', 1_000_000, 1_000_000);
      // 1M input @ $0.25/M + 1M output @ $1.25/M = $1.50
      expect(cost).toBeCloseTo(1.50, 2);
    });

    it('should calculate cost for Sonnet model', () => {
      const cost = calculateCost('claude-3-5-sonnet-latest', 1_000_000, 1_000_000);
      // 1M input @ $3/M + 1M output @ $15/M = $18
      expect(cost).toBeCloseTo(18.00, 2);
    });

    it('should calculate cost for Opus model', () => {
      const cost = calculateCost('claude-3-opus-latest', 1_000_000, 1_000_000);
      // 1M input @ $15/M + 1M output @ $75/M = $90
      expect(cost).toBeCloseTo(90.00, 2);
    });

    it('should calculate cost for GPT-4o model', () => {
      const cost = calculateCost('gpt-4o', 1_000_000, 1_000_000);
      // 1M input @ $2.5/M + 1M output @ $10/M = $12.50
      expect(cost).toBeCloseTo(12.50, 2);
    });

    it('should handle provider:model format', () => {
      const cost = calculateCost('anthropic:claude-3-5-haiku-latest', 1_000_000, 500_000);
      // 1M input @ $0.25/M + 500K output @ $1.25/M = $0.25 + $0.625 = $0.875
      expect(cost).toBeCloseTo(0.875, 3);
    });

    it('should use fallback pricing for unknown models', () => {
      const cost = calculateCost('unknown-model', 1_000_000, 1_000_000);
      // Should use fallback of $1/M input + $3/M output = $4
      expect(cost).toBeCloseTo(4.00, 2);
    });
  });

  describe('getModelPricing', () => {
    it('should return pricing for known models', () => {
      const pricing = getModelPricing('claude-3-5-haiku-latest');
      expect(pricing).toEqual({ input: 0.25, output: 1.25 });
    });

    it('should return pricing for provider:model format', () => {
      const pricing = getModelPricing('anthropic:claude-3-5-sonnet-latest');
      expect(pricing).toEqual({ input: 3, output: 15 });
    });

    it('should return null for unknown models', () => {
      const pricing = getModelPricing('unknown-model-xyz');
      expect(pricing).toBeNull();
    });
  });

  describe('formatCurrency', () => {
    it('should format large amounts', () => {
      expect(formatCurrency(123.45)).toBe('$123.45');
    });

    it('should format small amounts with 4 decimals', () => {
      expect(formatCurrency(0.0012)).toBe('$0.0012');
    });

    it('should format zero', () => {
      expect(formatCurrency(0)).toBe('$0.0000');
    });
  });

  describe('formatTokens', () => {
    it('should format millions', () => {
      expect(formatTokens(2_500_000)).toBe('2.5M');
    });

    it('should format thousands', () => {
      expect(formatTokens(15_000)).toBe('15.0K');
    });

    it('should format small numbers', () => {
      expect(formatTokens(500)).toBe('500');
    });
  });

  describe('calculateSavings', () => {
    it('should return empty report for no runs', () => {
      const report = calculateSavings(store, 30);
      
      expect(report.totalRuns).toBe(0);
      expect(report.actualCost).toBe(0);
      expect(report.baselineCost).toBe(0);
      expect(report.savings).toBe(0);
    });

    it('should calculate savings for Haiku vs Opus baseline', () => {
      // Record some runs with Haiku
      for (let i = 0; i < 10; i++) {
        store.recordRun({
          prompt: 'Test prompt',
          systemPrompt: null,
          taskType: 'code_generation',
          model: 'anthropic:claude-3-5-haiku-latest',
          success: true,
          output: 'Test output',
          error: null,
          durationMs: 1000,
          tokensIn: 10000,  // 10K tokens in
          tokensOut: 5000,  // 5K tokens out
          costUsd: calculateCost('claude-3-5-haiku-latest', 10000, 5000),
          metadata: null,
        });
      }

      const report = calculateSavings(store, 30);

      expect(report.totalRuns).toBe(10);
      expect(report.totalTokensIn).toBe(100000); // 10 * 10K
      expect(report.totalTokensOut).toBe(50000); // 10 * 5K

      // Actual cost: 100K input @ $0.25/M + 50K output @ $1.25/M
      // = $0.025 + $0.0625 = $0.0875
      expect(report.actualCost).toBeCloseTo(0.0875, 3);

      // Baseline cost (Opus): 100K input @ $15/M + 50K output @ $75/M  
      // = $1.50 + $3.75 = $5.25
      expect(report.baselineCost).toBeCloseTo(5.25, 2);

      // Savings should be baseline - actual
      expect(report.savings).toBeCloseTo(5.1625, 2);
      expect(report.savingsPercent).toBeGreaterThan(90); // Should be ~98% savings
    });

    it('should aggregate by model', () => {
      // Record runs with different models
      store.recordRun({
        prompt: 'Test',
        systemPrompt: null,
        taskType: 'code_generation',
        model: 'anthropic:claude-3-5-haiku-latest',
        success: true,
        output: 'output',
        error: null,
        durationMs: 1000,
        tokensIn: 10000,
        tokensOut: 5000,
        costUsd: null,
        metadata: null,
      });

      store.recordRun({
        prompt: 'Test',
        systemPrompt: null,
        taskType: 'analysis',
        model: 'anthropic:claude-3-5-sonnet-latest',
        success: true,
        output: 'output',
        error: null,
        durationMs: 2000,
        tokensIn: 20000,
        tokensOut: 10000,
        costUsd: null,
        metadata: null,
      });

      const report = calculateSavings(store, 30);

      expect(report.totalRuns).toBe(2);
      expect(Object.keys(report.byModel)).toContain('claude-3-5-haiku-latest');
      expect(Object.keys(report.byModel)).toContain('claude-3-5-sonnet-latest');
      
      expect(report.byModel['claude-3-5-haiku-latest']?.runs).toBe(1);
      expect(report.byModel['claude-3-5-sonnet-latest']?.runs).toBe(1);
    });

    it('should aggregate by task type', () => {
      store.recordRun({
        prompt: 'Test',
        systemPrompt: null,
        taskType: 'code_generation',
        model: 'anthropic:claude-3-5-haiku-latest',
        success: true,
        output: 'output',
        error: null,
        durationMs: 1000,
        tokensIn: 10000,
        tokensOut: 5000,
        costUsd: null,
        metadata: null,
      });

      store.recordRun({
        prompt: 'Test',
        systemPrompt: null,
        taskType: 'code_generation',
        model: 'anthropic:claude-3-5-haiku-latest',
        success: true,
        output: 'output',
        error: null,
        durationMs: 1000,
        tokensIn: 10000,
        tokensOut: 5000,
        costUsd: null,
        metadata: null,
      });

      store.recordRun({
        prompt: 'Test',
        systemPrompt: null,
        taskType: 'summarization',
        model: 'anthropic:claude-3-5-haiku-latest',
        success: true,
        output: 'output',
        error: null,
        durationMs: 500,
        tokensIn: 5000,
        tokensOut: 2000,
        costUsd: null,
        metadata: null,
      });

      const report = calculateSavings(store, 30);

      expect(report.byTaskType['code_generation']?.runs).toBe(2);
      expect(report.byTaskType['summarization']?.runs).toBe(1);
    });

    it('should track success rate by model', () => {
      // Add some successful runs
      store.recordRun({
        prompt: 'Test',
        systemPrompt: null,
        taskType: 'code_generation',
        model: 'anthropic:claude-3-5-haiku-latest',
        success: true,
        output: 'output',
        error: null,
        durationMs: 1000,
        tokensIn: 10000,
        tokensOut: 5000,
        costUsd: null,
        metadata: null,
      });

      store.recordRun({
        prompt: 'Test',
        systemPrompt: null,
        taskType: 'code_generation',
        model: 'anthropic:claude-3-5-haiku-latest',
        success: true,
        output: 'output',
        error: null,
        durationMs: 1000,
        tokensIn: 10000,
        tokensOut: 5000,
        costUsd: null,
        metadata: null,
      });

      // Add a failed run
      store.recordRun({
        prompt: 'Test',
        systemPrompt: null,
        taskType: 'code_generation',
        model: 'anthropic:claude-3-5-haiku-latest',
        success: false,
        output: null,
        error: 'Error',
        durationMs: 500,
        tokensIn: 5000,
        tokensOut: 0,
        costUsd: null,
        metadata: null,
      });

      const report = calculateSavings(store, 30);
      
      // 2/3 successful = 66.67% success rate
      expect(report.byModel['claude-3-5-haiku-latest']?.successRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('MODEL_PRICING', () => {
    it('should have pricing for all major models', () => {
      const expectedModels = [
        'claude-3-5-haiku-latest',
        'claude-3-5-sonnet-latest',
        'claude-3-opus-latest',
        'gpt-4o',
        'gpt-4o-mini',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'grok-2',
      ];

      for (const model of expectedModels) {
        const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING];
        expect(pricing).toBeDefined();
        expect(pricing?.input).toBeGreaterThan(0);
        expect(pricing?.output).toBeGreaterThan(0);
      }
    });
  });

  describe('BASELINE_MODEL', () => {
    it('should be Opus', () => {
      expect(BASELINE_MODEL).toBe('claude-3-opus-latest');
    });

    it('should have the highest pricing', () => {
      const baselinePricing = MODEL_PRICING[BASELINE_MODEL as keyof typeof MODEL_PRICING];
      expect(baselinePricing).toBeDefined();
      
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        if (model !== BASELINE_MODEL && !model.includes('opus')) {
          expect(pricing.input).toBeLessThanOrEqual(baselinePricing!.input);
          expect(pricing.output).toBeLessThanOrEqual(baselinePricing!.output);
        }
      }
    });
  });
});
