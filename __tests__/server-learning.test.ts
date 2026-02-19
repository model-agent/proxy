/**
 * Server Learning Engine Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { ProxyServer, createProxyServer } from '../src/server.js';
import { createLedger } from '@relayplane/ledger';
import { MemoryAuthProfileStorage } from '@relayplane/auth-gate';

// Helper to make HTTP requests
async function request(
  port: number,
  method: string,
  reqPath: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode ?? 500, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('ProxyServer + Learning Engine', () => {
  describe('when enableLearning is false (default)', () => {
    let server: ProxyServer;
    const port = 3197;

    beforeAll(async () => {
      const dbPath = path.join(os.tmpdir(), `proxy-learn-test-${Date.now()}.db`);
      const ledger = createLedger({ dbPath });
      const authStorage = new MemoryAuthProfileStorage();
      await authStorage.seedTestData('test_workspace');

      server = createProxyServer({
        port,
        ledger,
        authStorage,
        enableLearning: false,
      });
      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it('should not initialize learning engine', () => {
      expect(server.getLearningEngine()).toBeNull();
    });

    it('should return 404 for analytics endpoints', async () => {
      const res = await request(port, 'GET', '/v1/analytics/summary');
      expect(res.status).toBe(404);
    });
  });

  describe('when enableLearning is true', () => {
    let server: ProxyServer;
    const port = 3198;

    beforeAll(async () => {
      const dbPath = path.join(os.tmpdir(), `proxy-learn-test-${Date.now()}.db`);
      const ledger = createLedger({ dbPath });
      const authStorage = new MemoryAuthProfileStorage();
      await authStorage.seedTestData('test_workspace');

      server = createProxyServer({
        port,
        ledger,
        authStorage,
        enableLearning: true,
        defaultWorkspaceId: 'test_workspace',
      });
      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it('should initialize learning engine', () => {
      expect(server.getLearningEngine()).not.toBeNull();
    });

    it('GET /v1/analytics/summary should return summary', async () => {
      const res = await request(port, 'GET', '/v1/analytics/summary?from=2024-01-01T00:00:00Z&to=2024-12-31T23:59:59Z', undefined, {
        'X-RelayPlane-Workspace': 'test_workspace',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
    });

    it('POST /v1/analytics/analyze should run analysis', async () => {
      const res = await request(port, 'POST', '/v1/analytics/analyze', {}, {
        'X-RelayPlane-Workspace': 'test_workspace',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('patterns');
      expect(res.body).toHaveProperty('anomalies');
      expect(res.body).toHaveProperty('suggestions');
    });

    it('GET /v1/suggestions should return suggestions list', async () => {
      const res = await request(port, 'GET', '/v1/suggestions', undefined, {
        'X-RelayPlane-Workspace': 'test_workspace',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('suggestions');
      expect(Array.isArray(res.body.suggestions)).toBe(true);
    });

    it('GET /v1/rules should return rules list', async () => {
      const res = await request(port, 'GET', '/v1/rules', undefined, {
        'X-RelayPlane-Workspace': 'test_workspace',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('rules');
      expect(Array.isArray(res.body.rules)).toBe(true);
    });

    it('suggestions workflow: analyze → list → approve/reject', async () => {
      const analyzeRes = await request(port, 'POST', '/v1/analytics/analyze', {}, {
        'X-RelayPlane-Workspace': 'test_workspace',
      });
      expect(analyzeRes.status).toBe(200);

      const listRes = await request(port, 'GET', '/v1/suggestions', undefined, {
        'X-RelayPlane-Workspace': 'test_workspace',
      });
      expect(listRes.status).toBe(200);

      if (listRes.body.suggestions.length > 0) {
        const firstId = listRes.body.suggestions[0].id;
        const approveRes = await request(port, 'POST', `/v1/suggestions/${firstId}/approve`, {
          user_id: 'test_user',
        });
        expect(approveRes.status).toBe(200);
        expect(approveRes.body).toHaveProperty('rule');
      }
    });
  });
});
