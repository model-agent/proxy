/**
 * Stats Collector for RelayPlane Proxy
 *
 * Tracks per-request metrics with a rolling 1-hour window.
 * No external dependencies.
 *
 * @packageDocumentation
 */

import type { CircuitState } from './circuit-breaker.js';

export interface RequestRecord {
  timestamp: number;
  latencyMs: number;
  viaProxy: boolean;
  success: boolean;
}

export interface StateTransitionRecord {
  timestamp: number;
  from: CircuitState;
  to: CircuitState;
}

export interface StatsSnapshot {
  totalRequests: number;
  proxiedRequests: number;
  directRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  circuitState: CircuitState;
  circuitStateAge: number;
  stateTransitions: StateTransitionRecord[];
}

const ROLLING_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export class StatsCollector {
  private requests: RequestRecord[] = [];
  private transitions: StateTransitionRecord[] = [];
  private currentState: CircuitState = 'CLOSED';
  private stateChangedAt: number = Date.now();

  /** Record a completed request. */
  recordRequest(record: RequestRecord): void {
    this.requests.push(record);
    this.prune();
  }

  /** Record a circuit breaker state transition. */
  recordStateTransition(from: CircuitState, to: CircuitState): void {
    const now = Date.now();
    this.transitions.push({ timestamp: now, from, to });
    this.currentState = to;
    this.stateChangedAt = now;
    this.prune();
  }

  /** Set current state without recording a transition (for init). */
  setCurrentState(state: CircuitState): void {
    this.currentState = state;
    this.stateChangedAt = Date.now();
  }

  getStats(): StatsSnapshot {
    this.prune();
    const reqs = this.requests;
    const proxied = reqs.filter(r => r.viaProxy);
    const direct = reqs.filter(r => !r.viaProxy);
    const failed = reqs.filter(r => !r.success);
    const successful = reqs.filter(r => r.success);

    const latencies = proxied.map(r => r.latencyMs).sort((a, b) => a - b);

    return {
      totalRequests: reqs.length,
      proxiedRequests: proxied.length,
      directRequests: direct.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      p99LatencyMs: percentile(latencies, 0.99),
      circuitState: this.currentState,
      circuitStateAge: Date.now() - this.stateChangedAt,
      stateTransitions: [...this.transitions],
    };
  }

  private prune(): void {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    this.requests = this.requests.filter(r => r.timestamp >= cutoff);
    this.transitions = this.transitions.filter(t => t.timestamp >= cutoff);
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}
