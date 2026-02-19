import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, type CircuitState } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000, requestTimeoutMs: 3_000 });
  });

  afterEach(() => {
    cb.destroy();
    vi.useRealTimers();
  });

  it('starts in CLOSED state', () => {
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.isHealthy()).toBe(true);
  });

  it('stays CLOSED below failure threshold', () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
  });

  it('trips to OPEN after threshold consecutive failures', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
    expect(cb.isHealthy()).toBe(false);
  });

  it('resets failure count on success', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
  });

  it('transitions OPEN → HALF-OPEN after resetTimeout', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');

    vi.advanceTimersByTime(30_000);
    expect(cb.getState()).toBe('HALF-OPEN');
    expect(cb.isHealthy()).toBe(true);
  });

  it('transitions HALF-OPEN → CLOSED on success', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(30_000);
    expect(cb.getState()).toBe('HALF-OPEN');

    cb.recordSuccess();
    expect(cb.getState()).toBe('CLOSED');
  });

  it('transitions HALF-OPEN → OPEN on failure (probe failed)', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(30_000);
    expect(cb.getState()).toBe('HALF-OPEN');

    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
  });

  it('emits stateChange events', () => {
    const transitions: Array<{ from: CircuitState; to: CircuitState }> = [];
    cb.on('stateChange', (t) => transitions.push(t));

    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure(); // → OPEN
    vi.advanceTimersByTime(30_000); // → HALF-OPEN
    cb.recordSuccess(); // → CLOSED

    expect(transitions).toEqual([
      { from: 'CLOSED', to: 'OPEN' },
      { from: 'OPEN', to: 'HALF-OPEN' },
      { from: 'HALF-OPEN', to: 'CLOSED' },
    ]);
  });

  it('reset() forces CLOSED', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
    cb.reset();
    expect(cb.getState()).toBe('CLOSED');
  });
});
