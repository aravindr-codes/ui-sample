import type { ApiClient } from '@ifcui/api-contract';
import type { RuntimeConfig } from '../config/runtimeConfig';
import { createHttpApiClient } from './http/HttpApiClient';

/**
 * Chooses the adapter from runtime config. UI code never knows which one it got.
 * Mock code (store, seed data, simulator) is loaded on demand, so `http` deployments never download it.
 */
export async function createApiClient(cfg: RuntimeConfig): Promise<ApiClient> {
  switch (cfg.apiMode) {
    case 'memory': {
      const [{ createInMemoryApiClient }, { createStore }, { createChaos }, { createSimulation }] = await Promise.all([
        import('./memory/InMemoryApiClient'),
        import('./mock/store'),
        import('./mock/chaos'),
        import('./mock/simulator'),
      ]);
      const store = createStore({ seed: cfg.mock.seed });
      if (cfg.mock.simulation.enabled) createSimulation(store, { intervalMs: cfg.mock.simulation.intervalMs }).start();
      return createInMemoryApiClient(store, createChaos(cfg.mock));
    }
    case 'msw':
    case 'http':
      return createHttpApiClient({ baseUrl: cfg.apiBaseUrl, getToken: async () => undefined });
  }
}
