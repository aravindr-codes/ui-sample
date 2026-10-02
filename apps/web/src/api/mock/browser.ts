import { setupWorker } from 'msw/browser';
import type { RuntimeConfig } from '../../config/runtimeConfig';
import { createChaos } from './chaos';
import { createHandlers } from './handlers';
import { createSimulation } from './simulator';
import { createStore } from './store';

export interface MockWorkerHandle {
  /** Stops the simulator and detaches the worker from this page (used on hot reload). */
  stop(): void;
}

/**
 * Starts the Mock Service Worker with a fresh seeded store and the activity simulator.
 * Only loaded when `apiMode === 'msw'`.
 */
export async function startMockWorker(config: RuntimeConfig): Promise<MockWorkerHandle> {
  const store = createStore({ seed: config.mock.seed });
  const chaos = createChaos(config.mock);
  const simulation = createSimulation(store, { intervalMs: config.mock.simulation.intervalMs });
  const worker = setupWorker(...createHandlers({ store, chaos, baseUrl: config.apiBaseUrl, simulation }));
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledFrame: 'bypass',
    quiet: true,
  });
  if (config.mock.simulation.enabled) simulation.start();
  return {
    stop() {
      simulation.stop();
      worker.stop();
    },
  };
}
