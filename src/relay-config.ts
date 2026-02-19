/**
 * RelayPlane integration configuration types.
 * @packageDocumentation
 */

export interface RelayPlaneConfig {
  enabled: boolean;
  /** Proxy URL (default: http://127.0.0.1:4100) */
  proxyUrl?: string;
  circuitBreaker?: {
    failureThreshold?: number;   // default: 3
    resetTimeoutMs?: number;     // default: 30000
    requestTimeoutMs?: number;   // default: 3000
  };
  /** Auto-start proxy process (Phase 2, default: true) */
  autoStart?: boolean;
}

export const DEFAULT_RELAY_CONFIG: Required<RelayPlaneConfig> = {
  enabled: false,
  proxyUrl: 'http://127.0.0.1:4100',
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeoutMs: 30_000,
    requestTimeoutMs: 3_000,
  },
  autoStart: true,
};

export function resolveConfig(partial?: Partial<RelayPlaneConfig>): Required<RelayPlaneConfig> {
  if (!partial) return { ...DEFAULT_RELAY_CONFIG };
  return {
    enabled: partial.enabled ?? DEFAULT_RELAY_CONFIG.enabled,
    proxyUrl: partial.proxyUrl ?? DEFAULT_RELAY_CONFIG.proxyUrl,
    circuitBreaker: {
      ...DEFAULT_RELAY_CONFIG.circuitBreaker,
      ...partial.circuitBreaker,
    },
    autoStart: partial.autoStart ?? DEFAULT_RELAY_CONFIG.autoStart,
  };
}
