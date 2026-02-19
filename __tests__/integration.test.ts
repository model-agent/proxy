/**
 * Integration test: middleware → proxy → provider fallback
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as http from 'node:http';
import { RelayPlaneMiddleware } from '../src/middleware.js';
import type { MiddlewareRequest, MiddlewareResponse, DirectSendFn } from '../src/middleware.js';

// Helper: create a simple HTTP server
function createMockServer(handler: http.RequestListener): Promise<{ server: http.Server; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('Integration: Middleware → Proxy → Fallback', () => {
  let mockProvider: { server: http.Server; port: number; url: string };
  let mockProxy: { server: http.Server; port: number; url: string };
  let middleware: RelayPlaneMiddleware | null = null;

  // Mock provider: returns canned response
  beforeAll(async () => {
    mockProvider = await createMockServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ provider: true, echo: body }));
      });
    });
  });

  afterAll(async () => {
    await closeServer(mockProvider.server);
  });

  afterEach(() => {
    if (middleware) {
      middleware.destroy();
      middleware = null;
    }
  });

  // Direct send function (simulates calling provider directly)
  const directSend: DirectSendFn = async (req: MiddlewareRequest): Promise<MiddlewareResponse> => {
    return { status: 200, headers: {}, body: JSON.stringify({ direct: true }), viaProxy: false };
  };

  it('routes through proxy when healthy', async () => {
    // Start a mock proxy that forwards
    mockProxy = await createMockServer((req, res) => {
      if (req.url === '/health' || req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ proxied: true }));
    });

    middleware = new RelayPlaneMiddleware({
      config: {
        enabled: true,
        proxyUrl: mockProxy.url,
        autoStart: false,
        circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 500, requestTimeoutMs: 3000 },
      },
    });

    const resp = await middleware.route(
      { method: 'POST', path: '/v1/chat/completions', headers: {}, body: '{}' },
      directSend,
    );

    expect(resp.viaProxy).toBe(true);
    expect(JSON.parse(resp.body).proxied).toBe(true);

    // Check stats
    const stats = middleware.stats.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.proxiedRequests).toBe(1);

    await closeServer(mockProxy.server);
  });

  it('falls back to direct when proxy is down and circuit trips', async () => {
    // Create middleware pointing at a port with nothing running
    middleware = new RelayPlaneMiddleware({
      config: {
        enabled: true,
        proxyUrl: 'http://127.0.0.1:19999', // nothing here
        autoStart: false,
        circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60000, requestTimeoutMs: 1000 },
      },
    });

    // First two requests fail through proxy, triggering circuit breaker
    const resp1 = await middleware.route(
      { method: 'POST', path: '/test', headers: {}, body: '{}' },
      directSend,
    );
    expect(resp1.viaProxy).toBe(false);
    expect(JSON.parse(resp1.body).direct).toBe(true);

    const resp2 = await middleware.route(
      { method: 'POST', path: '/test', headers: {}, body: '{}' },
      directSend,
    );
    expect(resp2.viaProxy).toBe(false);

    // Circuit should be OPEN now
    expect(middleware.circuitBreaker.getState()).toBe('OPEN');

    // Third request goes direct immediately (circuit open)
    const resp3 = await middleware.route(
      { method: 'POST', path: '/test', headers: {}, body: '{}' },
      directSend,
    );
    expect(resp3.viaProxy).toBe(false);

    // Stats should reflect all requests
    const stats = middleware.stats.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.directRequests).toBe(3);
    expect(stats.proxiedRequests).toBe(0);
  });

  it('records stats for both proxied and direct requests', async () => {
    mockProxy = await createMockServer((req, res) => {
      if (req.url === '/health' || req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ proxied: true }));
    });

    middleware = new RelayPlaneMiddleware({
      config: {
        enabled: true,
        proxyUrl: mockProxy.url,
        autoStart: false,
        circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 500, requestTimeoutMs: 3000 },
      },
    });

    // Successful proxied request
    await middleware.route(
      { method: 'POST', path: '/test', headers: {}, body: '{}' },
      directSend,
    );

    // Kill proxy
    await closeServer(mockProxy.server);

    // Next requests fail through proxy → fall back to direct
    await middleware.route(
      { method: 'POST', path: '/test', headers: {}, body: '{}' },
      directSend,
    );

    const stats = middleware.stats.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.proxiedRequests).toBe(1);
    expect(stats.directRequests).toBe(1);
    expect(stats.successfulRequests).toBe(2); // both succeeded (direct fallback worked)
  });

  it('disabled middleware always goes direct', async () => {
    middleware = new RelayPlaneMiddleware({
      config: { enabled: false, autoStart: false },
    });

    const resp = await middleware.route(
      { method: 'POST', path: '/test', headers: {}, body: '{}' },
      directSend,
    );

    expect(resp.viaProxy).toBe(false);
    const stats = middleware.stats.getStats();
    expect(stats.directRequests).toBe(1);
  });
});
