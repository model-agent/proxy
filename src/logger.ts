/**
 * Simple logger interface for RelayPlane Proxy.
 * @packageDocumentation
 */

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export const defaultLogger: Logger = {
  info: (msg, ...args) => console.log(`[relayplane] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[relayplane] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[relayplane] ${msg}`, ...args),
};
