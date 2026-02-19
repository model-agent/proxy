/**
 * Health endpoint handler + active health probe.
 * @packageDocumentation
 */

import * as http from 'node:http';

const startTime = Date.now();

/**
 * Handle GET /health on the proxy server.
 * Returns { ok: true, uptime: <seconds> }.
 */
export function handleHealthRequest(res: http.ServerResponse): void {
  const body = JSON.stringify({ ok: true, uptime: Math.floor((Date.now() - startTime) / 1000) });
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/**
 * Probe a proxy's /health endpoint.
 * Resolves true if healthy, false on any error/timeout.
 */
export function probeHealth(proxyUrl: string, timeoutMs = 2000): Promise<boolean> {
  const url = new URL('/health', proxyUrl);
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.ok === true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}
