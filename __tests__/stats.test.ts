import { describe, it, expect, beforeEach } from 'vitest';
import { StatsCollector } from '../src/stats.js';

describe('StatsCollector', () => {
  let stats: StatsCollector;

  beforeEach(() => {
    stats = new StatsCollector();
  });

  it('starts with empty stats', () => {
    const s = stats.getStats();
    expect(s.totalRequests).toBe(0);
    expect(s.proxiedRequests).toBe(0);
    expect(s.directRequests).toBe(0);
    expect(s.failedRequests).toBe(0);
    expect(s.avgLatencyMs).toBe(0);
    expect(s.p50LatencyMs).toBe(0);
    expect(s.p95LatencyMs).toBe(0);
    expect(s.p99LatencyMs).toBe(0);
    expect(s.circuitState).toBe('CLOSED');
  });

  it('tracks proxied and direct requests', () => {
    const now = Date.now();
    stats.recordRequest({ timestamp: now, latencyMs: 100, viaProxy: true, success: true });
    stats.recordRequest({ timestamp: now, latencyMs: 50, viaProxy: false, success: true });
    stats.recordRequest({ timestamp: now, latencyMs: 200, viaProxy: true, success: false });

    const s = stats.getStats();
    expect(s.totalRequests).toBe(3);
    expect(s.proxiedRequests).toBe(2);
    expect(s.directRequests).toBe(1);
    expect(s.failedRequests).toBe(1);
    expect(s.successfulRequests).toBe(2);
  });

  it('calculates percentiles correctly', () => {
    const now = Date.now();
    // Add 100 proxied requests with latencies 1..100
    for (let i = 1; i <= 100; i++) {
      stats.recordRequest({ timestamp: now, latencyMs: i, viaProxy: true, success: true });
    }

    const s = stats.getStats();
    expect(s.p50LatencyMs).toBe(50);
    expect(s.p95LatencyMs).toBe(95);
    expect(s.p99LatencyMs).toBe(99);
    expect(s.avgLatencyMs).toBe(51); // Math.round(5050/100)
  });

  it('only uses proxied request latencies for percentiles', () => {
    const now = Date.now();
    stats.recordRequest({ timestamp: now, latencyMs: 999, viaProxy: false, success: true });
    stats.recordRequest({ timestamp: now, latencyMs: 100, viaProxy: true, success: true });

    const s = stats.getStats();
    expect(s.p50LatencyMs).toBe(100);
    expect(s.avgLatencyMs).toBe(100);
  });

  it('tracks state transitions', () => {
    stats.recordStateTransition('CLOSED', 'OPEN');
    stats.recordStateTransition('OPEN', 'HALF-OPEN');

    const s = stats.getStats();
    expect(s.stateTransitions).toHaveLength(2);
    expect(s.stateTransitions[0]!.from).toBe('CLOSED');
    expect(s.stateTransitions[0]!.to).toBe('OPEN');
    expect(s.circuitState).toBe('HALF-OPEN');
    expect(s.circuitStateAge).toBeLessThan(100);
  });

  it('prunes old records outside rolling window', () => {
    const oldTime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
    stats.recordRequest({ timestamp: oldTime, latencyMs: 100, viaProxy: true, success: true });
    stats.recordRequest({ timestamp: Date.now(), latencyMs: 50, viaProxy: true, success: true });

    const s = stats.getStats();
    expect(s.totalRequests).toBe(1);
    expect(s.avgLatencyMs).toBe(50);
  });
});
