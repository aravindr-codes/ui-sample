import type { Beneficiary, Disbursement } from '@ifcui/api-contract';
import type { Store } from './store';

/**
 * Simulates other operators working in the system so live events (SSE) flow without user action.
 * Every change goes through the store, so data, stats and events stay consistent.
 */
export interface Simulation {
  readonly running: boolean;
  start(): void;
  stop(): void;
  configure(options: Partial<SimulationOptions>): SimulationOptions;
  /** Performs one simulated action immediately (used by tests and the dev endpoint). */
  tick(): string | undefined;
}

export interface SimulationOptions {
  intervalMs: [number, number];
}

const OPERATORS = ['A. Mensah', 'L. Okafor', 'R. Quispe', 'S. Rahman', 'M. Wanjiru', 'T. Haque'];
const NAMES = ['Grace Achieng', 'Rafiq Islam', 'Lucía Mamani', 'Joseph Kamau', 'Nusrat Jahan', 'Pedro Condori'];

export function createSimulation(
  store: Store,
  initial: SimulationOptions,
  random: () => number = Math.random,
): Simulation {
  let options: SimulationOptions = { intervalMs: [...initial.intervalMs] };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const pick = <T>(items: readonly T[]): T | undefined => items[Math.floor(random() * items.length)];
  const actor = () => `${pick(OPERATORS) ?? 'Operator'} (simulated)`;

  function randomItem<T>(list: (page: number) => { items: T[]; total: number }): T | undefined {
    const { total } = list(0);
    if (total === 0) return undefined;
    return list(Math.floor(random() * total)).items[0];
  }

  const actions: Array<{ weight: number; run: () => string | undefined }> = [
    {
      weight: 4,
      run: () => {
        const d = randomItem<Disbursement>((page) =>
          store.listDisbursements({ status: 'pending', page, pageSize: 1, sort: 'createdAt:desc' }),
        );
        if (!d) return undefined;
        const b = store.getBeneficiary(d.beneficiaryId);
        if (b.status !== 'verified') return undefined;
        store.approveDisbursement(d.id, { actor: actor() });
        return `approved ${d.id}`;
      },
    },
    {
      weight: 3,
      run: () => {
        const programs = store.listPrograms({ pageSize: 200 }).items.filter((p) => p.status === 'active');
        const program = pick(programs);
        if (!program) return undefined;
        const b = randomItem<Beneficiary>((page) =>
          store.listBeneficiaries(program.id, { status: 'pending', page, pageSize: 1 }),
        );
        if (!b) return undefined;
        store.setBeneficiaryStatus(b.id, { status: 'verified' }, { actor: actor() });
        return `verified ${b.id}`;
      },
    },
    {
      weight: 2,
      run: () => {
        const programs = store.listPrograms({ pageSize: 200 }).items.filter((p) => p.status === 'active');
        const program = pick(programs);
        if (!program) return undefined;
        const b = randomItem<Beneficiary>((page) =>
          store.listBeneficiaries(program.id, { status: 'verified', page, pageSize: 1 }),
        );
        if (!b) return undefined;
        const d = store.createDisbursement(
          { beneficiaryId: b.id, amountMinor: (50 + Math.floor(random() * 2000)) * 100 },
          { actor: actor() },
        );
        return `created disbursement ${d.id}`;
      },
    },
    {
      weight: 1,
      run: () => {
        const programs = store.listPrograms({ pageSize: 200 }).items.filter((p) => p.status === 'active');
        const program = pick(programs);
        if (!program) return undefined;
        const country = program.code.split('-')[1] ?? 'KE';
        const b = store.createBeneficiary(
          { programId: program.id, displayName: pick(NAMES) ?? 'New Beneficiary', country },
          { actor: actor() },
        );
        return `registered ${b.id}`;
      },
    },
  ];
  const totalWeight = actions.reduce((sum, a) => sum + a.weight, 0);

  function tick(): string | undefined {
    let roll = random() * totalWeight;
    for (const action of actions) {
      roll -= action.weight;
      if (roll <= 0) {
        try {
          return action.run();
        } catch {
          return undefined; // e.g. a concurrent user change made the action invalid; skip this tick
        }
      }
    }
    return undefined;
  }

  function schedule() {
    if (!running) return;
    const [min, max] = options.intervalMs;
    timer = setTimeout(
      () => {
        tick();
        schedule();
      },
      min + Math.floor(random() * Math.max(0, max - min)),
    );
  }

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      schedule();
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
    configure(next) {
      options = { intervalMs: next.intervalMs ? [...next.intervalMs] : options.intervalMs };
      if (running) {
        this.stop();
        this.start();
      }
      return { intervalMs: [...options.intervalMs] };
    },
    tick,
  };
}
