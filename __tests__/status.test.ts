import { describe, it, expect } from 'vitest';
import { StatusReporter } from '../src/status.js';
import { StatsCollector } from '../src/stats.js';
import { CircuitBreaker } from '../src/circuit-breaker.js';

function makeReporter() {
  const cb = new CircuitBreaker();
  const stats = new StatsCollector();
  const reporter = new StatusReporter({
    enabled: true,
    proxyUrl: 'http://127.0.0.1:4100',
    circuitBreaker: cb,
    statsCollector: stats,
    processManager: null,
  });
  return { cb, stats, reporter };
}

describe('StatusReporter', () => {
  it('returns correct structure', () => {
    const { reporter } = makeReporter();
    const s = reporter.getStatus();

    expect(s.enabled).toBe(true);
    expect(s.proxyUrl).toBe('http://127.0.0.1:4100');
    expect(s.proxyRunning).toBe(false);
    expect(s.proxyPid).toBeNull();
    expect(s.circuitState).toBe('CLOSED');
    expect(s.stats.totalRequests).toBe(0);
    expect(s.restarts).toBe(0);
    expect(s.lastError).toBeNull();
  });

  it('tracks restarts and errors', () => {
    const { reporter } = makeReporter();
    reporter.incrementRestarts();
    reporter.incrementRestarts();
    reporter.setLastError('something broke');

    const s = reporter.getStatus();
    expect(s.restarts).toBe(2);
    expect(s.lastError).toBe('something broke');
  });

  it('includes stats from collector', () => {
    const { stats, reporter } = makeReporter();
    const now = Date.now();
    stats.recordRequest({ timestamp: now, latencyMs: 100, viaProxy: true, success: true });
    stats.recordRequest({ timestamp: now, latencyMs: 50, viaProxy: false, success: true });

    const s = reporter.getStatus();
    expect(s.stats.totalRequests).toBe(2);
    expect(s.stats.proxiedRequests).toBe(1);
    expect(s.stats.directRequests).toBe(1);
  });

  it('formatStatus returns readable string', () => {
    const { reporter } = makeReporter();
    const output = reporter.formatStatus();
    expect(output).toContain('RelayPlane Proxy Status');
    expect(output).toContain('Enabled:');
    expect(output).toContain('Circuit State:');
    expect(output).toContain('CLOSED');
  });

  it('formatStatus includes last error when present', () => {
    const { reporter } = makeReporter();
    reporter.setLastError('connection refused');
    const output = reporter.formatStatus();
    expect(output).toContain('connection refused');
  });
});
