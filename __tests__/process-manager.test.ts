import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/process-manager.js';
import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('ProcessManager', () => {
  let pm: ProcessManager;

  afterEach(() => {
    pm?.destroy();
  });

  it('start() spawns a child process and emits started', async () => {
    // Use a command that exits quickly
    pm = new ProcessManager({
      command: 'echo',
      args: ['hello'],
    });

    const started = new Promise<{ pid: number }>((resolve) => pm.once('started', resolve));
    pm.start();
    const { pid } = await started;
    expect(pid).toBeGreaterThan(0);
  });

  it('stop() kills the child process', async () => {
    pm = new ProcessManager({
      command: 'sleep',
      args: ['60'],
    });

    const started = new Promise<void>((resolve) => pm.once('started', () => resolve()));
    pm.start();
    await started;
    expect(pm.isRunning()).toBe(true);
    const pid = pm.getPid();
    expect(pid).toBeGreaterThan(0);

    pm.stop();
    expect(pm.isRunning()).toBe(false);
    expect(pm.getPid()).toBeNull();
  });

  it('restart() stops and starts', async () => {
    pm = new ProcessManager({
      command: 'sleep',
      args: ['60'],
    });

    const started1 = new Promise<void>((resolve) => pm.once('started', () => resolve()));
    pm.start();
    await started1;
    const pid1 = pm.getPid();

    const started2 = new Promise<void>((resolve) => pm.once('started', () => resolve()));
    pm.restart();
    await started2;
    const pid2 = pm.getPid();

    expect(pid2).toBeGreaterThan(0);
    // PIDs should differ (new process)
    expect(pid2).not.toBe(pid1);
  });

  it('marks circuit breaker OPEN on crash', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    pm = new ProcessManager({
      command: 'false', // exits with code 1
      args: [],
      circuitBreaker: cb,
      restartDelayMs: 999999, // don't actually restart in test
    });

    const crash = new Promise<void>((resolve) => pm.once('crash', () => resolve()));
    pm.start();
    await crash;

    expect(cb.getState()).toBe('OPEN');
    cb.destroy();
  });

  it('emits maxRestartsExceeded when limit hit', async () => {
    pm = new ProcessManager({
      command: 'false',
      args: [],
      restartDelayMs: 1, // very fast for testing
      maxRestartAttempts: 2,
      restartWindowMs: 60_000,
    });

    const exceeded = new Promise<void>((resolve) => pm.once('maxRestartsExceeded', () => resolve()));
    pm.start();
    await exceeded;
  }, 10_000);

  it('handles command not found gracefully', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    pm = new ProcessManager({
      command: '/nonexistent/binary',
      args: [],
      circuitBreaker: cb,
      restartDelayMs: 999999,
    });

    const error = new Promise<Error>((resolve) => pm.once('error', resolve));
    pm.start();
    const err = await error;
    expect(err.message).toContain('ENOENT');
    expect(cb.getState()).toBe('OPEN');
    cb.destroy();
  });

  it('isRunning() returns false when not started', () => {
    pm = new ProcessManager({ command: 'sleep', args: ['60'] });
    expect(pm.isRunning()).toBe(false);
    expect(pm.getPid()).toBeNull();
  });

  it('start() is idempotent when already running', async () => {
    pm = new ProcessManager({ command: 'sleep', args: ['60'] });
    const started = new Promise<void>((resolve) => pm.once('started', () => resolve()));
    pm.start();
    await started;
    const pid1 = pm.getPid();

    // Second start should be a no-op
    pm.start();
    expect(pm.getPid()).toBe(pid1);
  });
});
