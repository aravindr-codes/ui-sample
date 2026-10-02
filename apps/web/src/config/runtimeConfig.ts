import { z } from 'zod';

export const MockConfig = z.object({
  latencyMs: z
    .tuple([z.number().int().min(0).max(30_000), z.number().int().min(0).max(30_000)])
    .refine(([min, max]) => min <= max, 'latencyMs must be [min, max] with min <= max'),
  failureRate: z.number().min(0).max(1),
  seed: z.number().int().default(20260930),
  /** Simulated activity by other operators, producing live (SSE) events. */
  simulation: z
    .object({
      enabled: z.boolean(),
      intervalMs: z
        .tuple([z.number().int().min(250), z.number().int().min(250)])
        .refine(([min, max]) => min <= max, 'intervalMs must be [min, max] with min <= max'),
    })
    .default({ enabled: true, intervalMs: [6000, 14000] }),
});
export type MockConfig = z.infer<typeof MockConfig>;

export const RuntimeConfig = z.object({
  apiMode: z.enum(['memory', 'msw', 'http']),
  apiBaseUrl: z.string().min(1),
  mock: MockConfig.default({
    latencyMs: [150, 400],
    failureRate: 0,
    seed: 20260930,
    simulation: { enabled: true, intervalMs: [6000, 14000] },
  }),
  features: z.object({ disbursementApproval: z.boolean().default(true) }).default({ disbursementApproval: true }),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfig>;
export type ApiMode = RuntimeConfig['apiMode'];

export class RuntimeConfigError extends Error {
  override readonly name = 'RuntimeConfigError';
  readonly problems: string[];

  constructor(message: string, problems: string[] = []) {
    super(message);
    this.problems = problems;
  }
}

/**
 * Loads `/config.json` (replaced per environment at deploy time) and validates it.
 * Never reads `import.meta.env` for environment-specific values.
 */
export async function loadRuntimeConfig(url = `${import.meta.env.BASE_URL}config.json`): Promise<RuntimeConfig> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (cause) {
    throw new RuntimeConfigError(`Could not fetch ${url}`, [String(cause)]);
  }
  if (!response.ok) throw new RuntimeConfigError(`Could not fetch ${url}: HTTP ${response.status}`);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new RuntimeConfigError(`${url} is not valid JSON`);
  }
  return parseRuntimeConfig(json);
}

export function parseRuntimeConfig(json: unknown): RuntimeConfig {
  const result = RuntimeConfig.safeParse(json);
  if (!result.success) {
    throw new RuntimeConfigError(
      'Runtime configuration is invalid',
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}
