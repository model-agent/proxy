/**
 * Status Reporter for RelayPlane Proxy
 * @packageDocumentation
 */

import type { StatsCollector } from './stats.js';
import type { ProcessManager } from './process-manager.js';
import type { CircuitBreaker } from './circuit-breaker.js';

export interface ProxyStatus {
  enabled: boolean;
  proxyUrl: string;
  proxyRunning: boolean;
  proxyPid: number | null;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF-OPEN';
  circuitStateAge: number;
  stats: {
    totalRequests: number;
    proxiedRequests: number;
    directRequests: number;
    failedRequests: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    uptimeMs: number;
  };
  restarts: number;
  lastError: string | null;
}

export interface StatusReporterDeps {
  enabled: boolean;
  proxyUrl: string;
  circuitBreaker: CircuitBreaker;
  statsCollector: StatsCollector;
  processManager: ProcessManager | null;
}

export class StatusReporter {
  private readonly deps: StatusReporterDeps;
  private readonly startTime = Date.now();
  private restartCount = 0;
  private lastError: string | null = null;

  constructor(deps: StatusReporterDeps) {
    this.deps = deps;
  }

  incrementRestarts(): void {
    this.restartCount++;
  }

  setLastError(err: string | null): void {
    this.lastError = err;
  }

  getStatus(): ProxyStatus {
    const stats = this.deps.statsCollector.getStats();
    return {
      enabled: this.deps.enabled,
      proxyUrl: this.deps.proxyUrl,
      proxyRunning: this.deps.processManager?.isRunning() ?? false,
      proxyPid: this.deps.processManager?.getPid() ?? null,
      circuitState: stats.circuitState,
      circuitStateAge: stats.circuitStateAge,
      stats: {
        totalRequests: stats.totalRequests,
        proxiedRequests: stats.proxiedRequests,
        directRequests: stats.directRequests,
        failedRequests: stats.failedRequests,
        avgLatencyMs: stats.avgLatencyMs,
        p95LatencyMs: stats.p95LatencyMs,
        p99LatencyMs: stats.p99LatencyMs,
        uptimeMs: Date.now() - this.startTime,
      },
      restarts: this.restartCount,
      lastError: this.lastError,
    };
  }

  formatStatus(): string {
    const s = this.getStatus();
    const lines = [
      `RelayPlane Proxy Status`,
      `═══════════════════════`,
      `Enabled:        ${s.enabled ? 'Yes' : 'No'}`,
      `Proxy URL:      ${s.proxyUrl}`,
      `Proxy Running:  ${s.proxyRunning ? `Yes (PID ${s.proxyPid})` : 'No'}`,
      `Circuit State:  ${s.circuitState} (${Math.round(s.circuitStateAge / 1000)}s)`,
      ``,
      `Requests`,
      `────────`,
      `Total:          ${s.stats.totalRequests}`,
      `Proxied:        ${s.stats.proxiedRequests}`,
      `Direct:         ${s.stats.directRequests}`,
      `Failed:         ${s.stats.failedRequests}`,
      ``,
      `Latency (proxied)`,
      `─────────────────`,
      `Average:        ${s.stats.avgLatencyMs}ms`,
      `P95:            ${s.stats.p95LatencyMs}ms`,
      `P99:            ${s.stats.p99LatencyMs}ms`,
      ``,
      `Uptime:         ${Math.round(s.stats.uptimeMs / 1000)}s`,
      `Restarts:       ${s.restarts}`,
    ];
    if (s.lastError) {
      lines.push(`Last Error:     ${s.lastError}`);
    }
    return lines.join('\n');
  }
}
