import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { RelayPlaneMiddleware, type MiddlewareRequest, type MiddlewareResponse } from '../src/middleware.js';

const PROXY_PORT = 14199;
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;

function makeReq(path = '/v1/chat/completions'): MiddlewareRequest {
  return { method: 'POST', path, headers: { 'content-type': 'application/json' }, body: '{}' };
}

function directSend(): Promise<MiddlewareResponse> {
  return Promise.resolve({ status: 200, headers: {}, body: '{"direct":true}', viaProxy: false });
}

describe('RelayPlaneMiddleware', () => {
  let server: http.Server;
  let serverHealthy = true;

  beforeAll(() => new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, uptime: 1 }));
        return;
      }
      if (!serverHealthy) {
        res.writeHead(500);
        res.end('dead');
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ proxied: true }));
      });
    });
    server.listen(PROXY_PORT, '127.0.0.1', resolve);
  }));

  afterAll(() => new Promise<void>((resolve) => {
    server.close(() => resolve());
  }));

  let mw: RelayPlaneMiddleware;

  beforeEach(() => {
    serverHealthy = true;
  });

  afterEach(() => {
    mw?.destroy();
  });

  it('routes through proxy when healthy', async () => {
    mw = new RelayPlaneMiddleware({ enabled: true, proxyUrl: PROXY_URL });
    const resp = await mw.route(makeReq(), directSend);
    expect(resp.viaProxy).toBe(true);
    expect(JSON.parse(resp.body).proxied).toBe(true);
  });

  it('falls back to direct when proxy returns 500', async () => {
    serverHealthy = false;
    mw = new RelayPlaneMiddleware({ enabled: true, proxyUrl: PROXY_URL });
    const resp = await mw.route(makeReq(), directSend);
    expect(resp.viaProxy).toBe(false);
    expect(JSON.parse(resp.body).direct).toBe(true);
  });

  it('skips proxy entirely when circuit is OPEN', async () => {
    mw = new RelayPlaneMiddleware({ enabled: true, proxyUrl: PROXY_URL, circuitBreaker: { failureThreshold: 1 } });
    serverHealthy = false;
    // Trip the circuit
    await mw.route(makeReq(), directSend);
    expect(mw.circuitBreaker.getState()).toBe('OPEN');

    // Next request should skip proxy entirely
    serverHealthy = true; // even if it recovers, circuit is OPEN
    const resp = await mw.route(makeReq(), directSend);
    expect(resp.viaProxy).toBe(false);
  });

  it('goes direct when disabled', async () => {
    mw = new RelayPlaneMiddleware({ enabled: false, proxyUrl: PROXY_URL });
    const resp = await mw.route(makeReq(), directSend);
    expect(resp.viaProxy).toBe(false);
  });

  it('falls back when proxy is unreachable', async () => {
    mw = new RelayPlaneMiddleware({ enabled: true, proxyUrl: 'http://127.0.0.1:19999', circuitBreaker: { requestTimeoutMs: 500 } });
    const resp = await mw.route(makeReq(), directSend);
    expect(resp.viaProxy).toBe(false);
  });
});
