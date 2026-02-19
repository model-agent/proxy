import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { handleHealthRequest, probeHealth } from '../src/health.js';

const PORT = 14198;

describe('Health endpoint', () => {
  let server: http.Server;

  beforeAll(() => new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === '/health') {
        handleHealthRequest(res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(PORT, '127.0.0.1', resolve);
  }));

  afterAll(() => new Promise<void>((resolve) => {
    server.close(() => resolve());
  }));

  it('returns ok:true and uptime', async () => {
    const resp = await new Promise<any>((resolve) => {
      http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(JSON.parse(d)));
      });
    });
    expect(resp.ok).toBe(true);
    expect(typeof resp.uptime).toBe('number');
  });

  it('probeHealth returns true for healthy server', async () => {
    expect(await probeHealth(`http://127.0.0.1:${PORT}`)).toBe(true);
  });

  it('probeHealth returns false for unreachable server', async () => {
    expect(await probeHealth('http://127.0.0.1:19998', 500)).toBe(false);
  });
});
