/**
 * Circuit Breaker for RelayPlane Proxy
 * 
 * States: CLOSED (normal) → OPEN (bypassing) → HALF-OPEN (probing) → CLOSED
 * No external dependencies.
 * 
 * @packageDocumentation
 */

import { EventEmitter } from 'node:events';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

export interface CircuitBreakerOptions {
  /** Consecutive failures before tripping to OPEN (default: 3) */
  failureThreshold?: number;
  /** Ms to wait in OPEN before moving to HALF-OPEN (default: 30000) */
  resetTimeoutMs?: number;
  /** Ms timeout for proxied requests (default: 3000) */
  requestTimeoutMs?: number;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private halfOpenTimer: ReturnType<typeof setTimeout> | null = null;

  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly requestTimeoutMs: number;

  constructor(opts: CircuitBreakerOptions = {}) {
    super();
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 3_000;
  }

  getState(): CircuitState {
    // Check if we should transition from OPEN → HALF-OPEN based on elapsed time
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.transitionTo('HALF-OPEN');
    }
    return this.state;
  }

  /** Returns true when the proxy should be attempted (CLOSED or HALF-OPEN). */
  isHealthy(): boolean {
    const s = this.getState();
    return s === 'CLOSED' || s === 'HALF-OPEN';
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state === 'HALF-OPEN' || this.state === 'OPEN') {
      this.transitionTo('CLOSED');
    }
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF-OPEN') {
      // Probe failed — back to OPEN
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.consecutiveFailures >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  /** Force reset to CLOSED (manual override). */
  reset(): void {
    this.consecutiveFailures = 0;
    this.clearTimer();
    this.transitionTo('CLOSED');
  }

  destroy(): void {
    this.clearTimer();
    this.removeAllListeners();
  }

  private transitionTo(next: CircuitState): void {
    const prev = this.state;
    if (prev === next) return;
    this.state = next;
    this.clearTimer();

    if (next === 'OPEN') {
      // Schedule timer-based transition to HALF-OPEN
      this.halfOpenTimer = setTimeout(() => {
        if (this.state === 'OPEN') {
          this.transitionTo('HALF-OPEN');
        }
      }, this.resetTimeoutMs);
      // Don't block process exit
      if (this.halfOpenTimer && typeof this.halfOpenTimer === 'object' && 'unref' in this.halfOpenTimer) {
        this.halfOpenTimer.unref();
      }
    }

    if (next === 'CLOSED') {
      this.consecutiveFailures = 0;
    }

    this.emit('stateChange', { from: prev, to: next });
  }

  private clearTimer(): void {
    if (this.halfOpenTimer) {
      clearTimeout(this.halfOpenTimer);
      this.halfOpenTimer = null;
    }
  }
}
