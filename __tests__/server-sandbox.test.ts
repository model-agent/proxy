/**
 * Server Sandbox (Circuit Breaker) Integration Tests
 */

import { describe, it, expect } from 'vitest';
import { createSandboxedProxyServer } from '../src/server.js';

describe('createSandboxedProxyServer', () => {
  it('should create server without middleware when relayplane not configured', () => {
    const { server, middleware } = createSandboxedProxyServer({
      port: 3299,
    });
    expect(server).toBeDefined();
    expect(middleware).toBeUndefined();
  });

  it('should create server without middleware when relayplane.enabled is false', () => {
    const { server, middleware } = createSandboxedProxyServer({
      port: 3299,
      relayplane: { enabled: false },
    });
    expect(server).toBeDefined();
    expect(middleware).toBeUndefined();
  });

  it('should create server with middleware when relayplane.enabled is true', () => {
    const result = createSandboxedProxyServer({
      port: 3299,
      relayplane: {
        enabled: true,
        proxyUrl: 'http://127.0.0.1:9999',
        autoStart: false, // Don't actually start a process
      },
    });
    expect(result.server).toBeDefined();
    expect(result.middleware).toBeDefined();
    expect(result.middleware!.circuitBreaker).toBeDefined();

    // Clean up
    result.middleware!.destroy();
  });

  it('should pass circuit breaker config through', () => {
    const result = createSandboxedProxyServer({
      port: 3299,
      relayplane: {
        enabled: true,
        autoStart: false,
        circuitBreaker: {
          failureThreshold: 5,
          resetTimeoutMs: 60000,
        },
      },
    });
    expect(result.middleware).toBeDefined();

    // Clean up
    result.middleware!.destroy();
  });

  it('server should have learning engine when enableLearning is true', () => {
    const { server } = createSandboxedProxyServer({
      port: 3299,
      enableLearning: true,
    });
    expect(server.getLearningEngine()).not.toBeNull();
  });

  it('server should not have learning engine by default', () => {
    const { server } = createSandboxedProxyServer({
      port: 3299,
    });
    expect(server.getLearningEngine()).toBeNull();
  });
});
