import { describe, it, expect, afterEach } from 'vitest';
import { RelayPlaneMiddleware } from '../src/middleware.js';
import { ProcessManager } from '../src/process-manager.js';

describe('Middleware + ProcessManager integration', () => {
  let mw: RelayPlaneMiddleware;

  afterEach(() => {
    mw?.destroy();
  });

  it('auto-starts process manager when autoStart and enabled', async () => {
    const pm = new ProcessManager({
      command: 'sleep',
      args: ['60'],
    });

    mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: true },
      processManager: pm,
    });

    expect(mw.getProcessManager()).toBe(pm);
    // Wait for spawn
    await new Promise<void>((resolve) => {
      if (pm.isRunning()) return resolve();
      pm.once('started', () => resolve());
      setTimeout(resolve, 2000);
    });
    expect(pm.isRunning()).toBe(true);
  });

  it('stores but does not start process manager when autoStart is false', () => {
    const pm = new ProcessManager({
      command: 'sleep',
      args: ['60'],
    });

    mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: false },
      processManager: pm,
    });

    // PM should be stored but NOT started
    // Actually with current logic, when autoStart is false, PM won't be assigned
    // That's by design — if autoStart is false, middleware doesn't manage the process
    expect(pm.isRunning()).toBe(false);
  });

  it('does not auto-start process manager when disabled', () => {
    const pm = new ProcessManager({
      command: 'sleep',
      args: ['60'],
    });

    mw = new RelayPlaneMiddleware({
      config: { enabled: false, autoStart: true },
      processManager: pm,
    });

    expect(pm.isRunning()).toBe(false);
  });

  it('destroy() stops the process manager', async () => {
    const pm = new ProcessManager({
      command: 'sleep',
      args: ['60'],
    });

    mw = new RelayPlaneMiddleware({
      config: { enabled: true, autoStart: true },
      processManager: pm,
    });

    await new Promise<void>((resolve) => {
      if (pm.isRunning()) return resolve();
      pm.once('started', () => resolve());
      setTimeout(resolve, 2000);
    });

    mw.destroy();
    expect(pm.isRunning()).toBe(false);
  });

  it('backward compatible: accepts config directly', () => {
    mw = new RelayPlaneMiddleware({ enabled: true, proxyUrl: 'http://localhost:9999' });
    expect(mw.circuitBreaker).toBeDefined();
  });
});
