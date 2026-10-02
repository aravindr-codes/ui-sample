import { ApiError } from '@ifcui/api-contract';
import type { MockConfig } from '../../config/runtimeConfig';

/**
 * Simulated network conditions (latency + failure injection) shared by the MSW handlers and the
 * in-memory adapter, so loading and error states are real in every local mode.
 * Mutable at runtime through `POST /__dev/chaos` (used by E2E failure-injection tests).
 */
export interface Chaos {
  settings(): ChaosSettings;
  update(next: Partial<ChaosSettings>): ChaosSettings;
  /** Waits a random latency, then throws ApiError(unavailable) with probability `failureRate`. */
  apply(): Promise<void>;
}

export interface ChaosSettings {
  latencyMs: [number, number];
  failureRate: number;
}

export function createChaos(
  config: Pick<MockConfig, 'latencyMs' | 'failureRate'>,
  random: () => number = Math.random,
): Chaos {
  let current: ChaosSettings = { latencyMs: [...config.latencyMs], failureRate: config.failureRate };

  return {
    settings: () => ({ latencyMs: [...current.latencyMs], failureRate: current.failureRate }),
    update(next) {
      current = {
        latencyMs: next.latencyMs ? [...next.latencyMs] : current.latencyMs,
        failureRate: next.failureRate ?? current.failureRate,
      };
      return this.settings();
    },
    async apply() {
      const [min, max] = current.latencyMs;
      const ms = min + Math.round(random() * (max - min));
      if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
      if (current.failureRate > 0 && random() < current.failureRate) {
        throw ApiError.of('unavailable', 'The service is temporarily unavailable (injected failure). Please retry.');
      }
    },
  };
}
