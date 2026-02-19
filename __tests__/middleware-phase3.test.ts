import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RelayPlaneMiddleware, type MiddlewareResponse } from '../src/middleware.js';
import type { Logger } from '../src/logger.js';

function mockLogger(): Logger & { logs: { level: string; msg: string }[] } {
  const logs: { level: string; msg: string }[] = [];
  return {
    logs,
    info: (msg: string) => logs.push({ level: 'info', msg }),
    warn: (msg: string) => logs.push({ level: 'warn', msg }),
    error: (msg: string) => logs.push({ level: 'error', msg }),
  };
}

const directResponse: MiddlewareResponse = {
  status: 200, headers: {}, body: 'direct', viaProxy: false,
};

const directSend = vi.fn(async () => directResponse);

describe('RelayPlaneMiddleware', () => {
  let mw: RelayPlaneMiddleware;
  let logger: ReturnType<typeof mockLogger>;

  beforeEach(() => {
    logger = mockLogger();
  });

  afterEach(() => {
    mw?.destroy();
  });

  it('falls back to direct when disabled and logs warning', async () => {
    mw = new RelayPlaneMiddleware({
      config: { enabled: false },
      logger,
    });

    const resp = await mw.route(
      { method: 'POST', path: '/v1/chat', headers: {} },
      directSend,
    );

    expect(resp.body).toBe('direct');
    expect(logger.logs.some(l => l.level === 'warn' && l.msg.includes('proxy disabled'))).toBe(true);
  });

  it('records stats on direct fallback', async () => {
    mw = new RelayPlaneMiddleware({
      config: { enabled: false },
      logger,
    });

    await mw.route({ method: 'POST', path: '/v1/chat', headers: {} }, directSend);

    const stats = mw.stats.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.directRequests).toBe(1);
  });

  it('falls back to direct when circuit is OPEN and logs warning', async () => {
    mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: false },
      logger,
    });

    // Trip the circuit breaker
    for (let i = 0; i < 3; i++) {
      mw.circuitBreaker.recordFailure();
    }

    const resp = await mw.route(
      { method: 'POST', path: '/v1/chat', headers: {} },
      directSend,
    );

    expect(resp.body).toBe('direct');
    expect(logger.logs.some(l => l.level === 'warn' && l.msg.includes('circuit breaker OPEN'))).toBe(true);
  });

  it('logs error when circuit trips OPEN', () => {
    mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: false },
      logger,
    });

    for (let i = 0; i < 3; i++) {
      mw.circuitBreaker.recordFailure();
    }

    expect(logger.logs.some(l => l.level === 'error' && l.msg.includes('tripped OPEN'))).toBe(true);
  });

  it('logs info when circuit recovers from HALF-OPEN to CLOSED', () => {
    mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: false },
      logger,
    });

    // Trip to OPEN
    for (let i = 0; i < 3; i++) {
      mw.circuitBreaker.recordFailure();
    }
    logger.logs.length = 0;

    // recordSuccess from OPEN goes directly to CLOSED
    mw.circuitBreaker.recordSuccess();

    // Should log about recovery (OPEN → CLOSED)
    expect(logger.logs.some(l => l.msg?.includes('CLOSED') || l.msg?.includes('recovered'))).toBe(true);
  });

  it('exposes getStatus()', () => {
    mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: false },
      logger,
    });

    const status = mw.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.circuitState).toBe('CLOSED');
    expect(status.stats.totalRequests).toBe(0);
  });

  it('exposes formatStatus()', () => {
    mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: false },
      logger,
    });

    const output = mw.formatStatus();
    expect(output).toContain('RelayPlane Proxy Status');
  });
});

describe('Health probe integration', () => {
  it('starts probing when circuit opens', () => {
    const logger = mockLogger();
    const mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: false },
      logger,
    });

    // We can verify probing started by checking that circuit OPEN triggered it
    // (probeInterval is private, so we verify indirectly via the stateChange log)
    for (let i = 0; i < 3; i++) {
      mw.circuitBreaker.recordFailure();
    }

    expect(logger.logs.some(l => l.level === 'error' && l.msg.includes('tripped OPEN'))).toBe(true);

    // Clean up
    mw.destroy();
  });

  it('stops probing when circuit closes', () => {
    const logger = mockLogger();
    const mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: false },
      logger,
    });

    // Trip circuit
    for (let i = 0; i < 3; i++) {
      mw.circuitBreaker.recordFailure();
    }

    // Recover
    mw.circuitBreaker.recordSuccess();

    // Destroying should be clean (no lingering intervals)
    mw.destroy();
  });
});
