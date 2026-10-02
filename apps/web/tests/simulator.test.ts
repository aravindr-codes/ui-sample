// @vitest-environment node
import type { DomainEvent } from '@ifcui/api-contract';
import { describe, expect, it } from 'vitest';
import { createSimulation } from '../src/api/mock/simulator';
import { createStore } from '../src/api/mock/store';

/** Deterministic PRNG so the simulation is reproducible in tests. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('activity simulation', () => {
  it('changes data through the store and emits attributed events', () => {
    const store = createStore({ seed: 1 });
    const events: DomainEvent[] = [];
    store.subscribe((e) => events.push(e));
    const sim = createSimulation(store, { intervalMs: [1000, 2000] }, mulberry32(42));
    const results = Array.from({ length: 40 }, () => sim.tick()).filter(Boolean);
    expect(results.length).toBeGreaterThan(20);
    expect(events.length).toBe(results.length);
    expect(events.every((e) => e.actor.endsWith('(simulated)'))).toBe(true);
    expect(new Set(events.map((e) => e.type)).size).toBeGreaterThanOrEqual(3);
  });

  it('starts and stops its timer', async () => {
    const store = createStore({ seed: 1 });
    const events: DomainEvent[] = [];
    store.subscribe((e) => events.push(e));
    const sim = createSimulation(store, { intervalMs: [5, 10] });
    sim.start();
    expect(sim.running).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 120));
    sim.stop();
    const count = events.length;
    expect(count).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(events.length).toBe(count);
  });
});
