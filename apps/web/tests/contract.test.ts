// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  type ApiClient,
  ApiError,
  type Beneficiary,
  type BeneficiaryId,
  type ConnectionState,
  type DisbursementId,
  type DocumentId,
  type DomainEvent,
  formatSse,
  MAX_DOCUMENT_BYTES,
  type Program,
  type ProgramId,
  SseParser,
} from '@ifcui/api-contract';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHttpApiClient } from '../src/api/http/HttpApiClient';
import { createInMemoryApiClient } from '../src/api/memory/InMemoryApiClient';
import { type ChaosSettings, createChaos } from '../src/api/mock/chaos';
import { createHandlers } from '../src/api/mock/handlers';
import { createStore } from '../src/api/mock/store';

const SEED = 20260930;
const BASE = 'http://local/api';
const UNKNOWN_ID = '6f1c1c2e-8a4b-4c1d-9e2f-3a4b5c6d7e8f';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

type Make = (chaos?: Partial<ChaosSettings>) => ApiClient;

const noChaos: ChaosSettings = { latencyMs: [0, 0], failureRate: 0 };

const adapters: Array<[string, Make]> = [
  ['memory', (c) => createInMemoryApiClient(createStore({ seed: SEED }), createChaos({ ...noChaos, ...c }))],
  [
    'http+msw',
    (c) => {
      server.resetHandlers(
        ...createHandlers({
          store: createStore({ seed: SEED }),
          chaos: createChaos({ ...noChaos, ...c }),
          baseUrl: BASE,
        }),
      );
      return createHttpApiClient({ baseUrl: BASE });
    },
  ],
];

async function expectApiError(promise: Promise<unknown>, code: ApiError['code'], status: number): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error(`Expected ApiError(${code}) but the call succeeded`);
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  const apiError = error as ApiError;
  expect(apiError.code).toBe(code);
  expect(apiError.status).toBe(status);
  return apiError;
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function activeProgram(api: ApiClient): Promise<Program> {
  const { items } = await api.programs.list({ pageSize: 200 });
  const program = items.find((p) => p.status === 'active');
  if (!program) throw new Error('seed has no active program');
  return program;
}

async function beneficiaryWith(api: ApiClient, status: Beneficiary['status']): Promise<Beneficiary> {
  const program = await activeProgram(api);
  const { items } = await api.beneficiaries.list(program.id, { status, pageSize: 1 });
  const b = items[0];
  if (!b) throw new Error(`seed has no ${status} beneficiary`);
  return b;
}

describe.each(adapters)('ApiClient contract: %s', (_name, make) => {
  describe('programs', () => {
    it('lists the seeded programs sorted by code', async () => {
      const page = await make().programs.list();
      expect(page.total).toBe(3);
      expect(page.page).toBe(0);
      expect(page.pageSize).toBe(25);
      expect(page.items.map((p) => p.code)).toEqual([...page.items.map((p) => p.code)].sort());
    });

    it('gets a program by id', async () => {
      const api = make();
      const program = await activeProgram(api);
      await expect(api.programs.get(program.id)).resolves.toEqual(program);
    });

    it('throws ApiError(not_found) for unknown and malformed ids', async () => {
      const api = make();
      await expectApiError(api.programs.get(UNKNOWN_ID as ProgramId), 'not_found', 404);
      await expectApiError(api.programs.get('not-a-uuid' as ProgramId), 'not_found', 404);
    });

    it('reports stats consistent with the beneficiary list', async () => {
      const api = make();
      const program = await activeProgram(api);
      const stats = await api.programs.stats(program.id);
      const all = await api.beneficiaries.list(program.id, { pageSize: 1 });
      const counts = Object.values(stats.beneficiaries).reduce((a, b) => a + b, 0);
      expect(counts).toBe(all.total);
      const pending = await api.beneficiaries.list(program.id, { status: 'pending', pageSize: 1 });
      expect(stats.beneficiaries.pending).toBe(pending.total);
      const approved = await api.disbursements.list({ programId: program.id, status: 'approved', pageSize: 1 });
      expect(stats.disbursements.approved).toBe(approved.total);
      expect(stats.approvedAmountMinor).toBeGreaterThan(0);
    });
  });

  describe('beneficiaries', () => {
    it('pages with a stable total and no overlap', async () => {
      const api = make();
      const program = await activeProgram(api);
      const p0 = await api.beneficiaries.list(program.id, { page: 0, pageSize: 10 });
      const p1 = await api.beneficiaries.list(program.id, { page: 1, pageSize: 10 });
      expect(p0.items).toHaveLength(10);
      expect(p1.items).toHaveLength(10);
      expect(p1.total).toBe(p0.total);
      expect(p0.total).toBeGreaterThan(20);
      const ids0 = new Set(p0.items.map((b) => b.id));
      expect(p1.items.some((b) => ids0.has(b.id))).toBe(false);
      expect(p0.items.every((b) => b.programId === program.id)).toBe(true);
    });

    it('returns an empty page beyond the last page', async () => {
      const api = make();
      const program = await activeProgram(api);
      const page = await api.beneficiaries.list(program.id, { page: 999, pageSize: 50 });
      expect(page.items).toEqual([]);
      expect(page.total).toBeGreaterThan(0);
    });

    it('sorts server-side in both directions', async () => {
      const api = make();
      const program = await activeProgram(api);
      const asc = await api.beneficiaries.list(program.id, { sort: 'displayName:asc', pageSize: 50 });
      const names = asc.items.map((b) => b.displayName);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      const desc = await api.beneficiaries.list(program.id, { sort: 'displayName:desc', pageSize: 50 });
      const last = await api.beneficiaries.list(program.id, {
        sort: 'displayName:asc',
        page: Math.ceil(asc.total / 50) - 1,
        pageSize: 50,
      });
      expect(desc.items[0]?.displayName).toBe(last.items.at(-1)?.displayName);
    });

    it('rejects unsupported sort fields and invalid paging with validation errors', async () => {
      const api = make();
      const program = await activeProgram(api);
      await expectApiError(api.beneficiaries.list(program.id, { sort: 'password:asc' }), 'validation', 422);
      await expectApiError(api.beneficiaries.list(program.id, { pageSize: 500 }), 'validation', 422);
    });

    it('filters by status and search text', async () => {
      const api = make();
      const program = await activeProgram(api);
      const verified = await api.beneficiaries.list(program.id, { status: 'verified', pageSize: 200 });
      expect(verified.items.every((b) => b.status === 'verified')).toBe(true);
      const sample = verified.items[0];
      if (!sample) throw new Error('no verified beneficiary');
      const lastName = sample.displayName.split(' ').at(-1) ?? sample.displayName;
      const found = await api.beneficiaries.list(program.id, { q: lastName.toUpperCase(), pageSize: 200 });
      expect(found.items.map((b) => b.id)).toContain(sample.id);
      expect(found.items.every((b) => b.displayName.toLowerCase().includes(lastName.toLowerCase()))).toBe(true);
    });

    it('creates a pending beneficiary that can be read back', async () => {
      const api = make();
      const program = await activeProgram(api);
      const created = await api.beneficiaries.create({
        programId: program.id,
        displayName: 'Amina Ochieng',
        country: 'KE',
      });
      expect(created).toMatchObject({
        programId: program.id,
        displayName: 'Amina Ochieng',
        country: 'KE',
        status: 'pending',
      });
      await expect(api.beneficiaries.get(created.id)).resolves.toEqual(created);
      const stats = await api.programs.stats(program.id);
      const before = await make().programs.stats(program.id);
      expect(stats.beneficiaries.pending).toBe(before.beneficiaries.pending + 1);
    });

    it('rejects invalid input with per-field validation issues', async () => {
      const api = make();
      const program = await activeProgram(api);
      const error = await expectApiError(
        api.beneficiaries.create({ programId: program.id, displayName: ' ', country: 'kenya' }),
        'validation',
        422,
      );
      const issues = error.body.details?.issues as Array<{ path: string }>;
      expect(issues.map((i) => i.path).sort()).toEqual(expect.arrayContaining(['country', 'displayName']));
    });

    it('refuses new beneficiaries in a closed program', async () => {
      const api = make();
      const closed = (await api.programs.list()).items.find((p) => p.status === 'closed');
      if (!closed) throw new Error('seed has no closed program');
      await expectApiError(
        api.beneficiaries.create({ programId: closed.id, displayName: 'Rosa Quispe', country: 'PE' }),
        'conflict',
        409,
      );
    });

    it('enforces status transitions', async () => {
      const api = make();
      const pending = await beneficiaryWith(api, 'pending');
      const verified = await api.beneficiaries.setStatus(pending.id, 'verified');
      expect(verified.status).toBe('verified');
      await expect(api.beneficiaries.get(pending.id)).resolves.toMatchObject({ status: 'verified' });
      await expectApiError(api.beneficiaries.setStatus(pending.id, 'pending'), 'conflict', 409);
      await expectApiError(api.beneficiaries.setStatus(pending.id, 'verified'), 'conflict', 409);
      await expect(api.beneficiaries.setStatus(pending.id, 'suspended')).resolves.toMatchObject({
        status: 'suspended',
      });
      await expectApiError(api.beneficiaries.setStatus(UNKNOWN_ID as BeneficiaryId, 'verified'), 'not_found', 404);
    });
  });

  describe('disbursements', () => {
    it('filters by beneficiary and program', async () => {
      const api = make();
      const b = await beneficiaryWith(api, 'verified');
      const page = await api.disbursements.list({ beneficiaryId: b.id, pageSize: 200 });
      expect(page.items.every((d) => d.beneficiaryId === b.id && d.programId === b.programId)).toBe(true);
      const byProgram = await api.disbursements.list({ programId: b.programId, pageSize: 5 });
      expect(byProgram.items.every((d) => d.programId === b.programId)).toBe(true);
    });

    it('sorts by amount and keeps approvedAt null for pending ones', async () => {
      const api = make();
      const page = await api.disbursements.list({ sort: 'amountMinor:desc', pageSize: 100 });
      const amounts = page.items.map((d) => d.amountMinor);
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
      const pending = await api.disbursements.list({ status: 'pending', pageSize: 50 });
      expect(pending.items.every((d) => d.approvedAt === null)).toBe(true);
      expect(page.total).toBe(2000);
    });

    it('creates a disbursement in the program currency and approves it once', async () => {
      const api = make();
      const b = await beneficiaryWith(api, 'verified');
      const program = await api.programs.get(b.programId);
      const created = await api.disbursements.create({ beneficiaryId: b.id, amountMinor: 12_345 });
      expect(created).toMatchObject({
        beneficiaryId: b.id,
        programId: program.id,
        currency: program.currency,
        amountMinor: 12_345,
        status: 'pending',
        approvedAt: null,
      });
      const approved = await api.disbursements.approve(created.id);
      expect(approved.status).toBe('approved');
      expect(approved.approvedAt).not.toBeNull();
      await expect(api.disbursements.get(created.id)).resolves.toEqual(approved);
      await expectApiError(api.disbursements.approve(created.id), 'conflict', 409);
    });

    it('refuses disbursements to unverified beneficiaries and bad amounts', async () => {
      const api = make();
      const pending = await beneficiaryWith(api, 'pending');
      await expectApiError(api.disbursements.create({ beneficiaryId: pending.id, amountMinor: 100 }), 'conflict', 409);
      const verified = await beneficiaryWith(api, 'verified');
      await expectApiError(
        api.disbursements.create({ beneficiaryId: verified.id, amountMinor: -5 }),
        'validation',
        422,
      );
    });

    it('refuses approval once the beneficiary is suspended', async () => {
      const api = make();
      const b = await beneficiaryWith(api, 'verified');
      const created = await api.disbursements.create({ beneficiaryId: b.id, amountMinor: 500 });
      await api.beneficiaries.setStatus(b.id, 'suspended');
      await expectApiError(api.disbursements.approve(created.id), 'conflict', 409);
    });

    it('throws not_found for unknown disbursements', async () => {
      await expectApiError(make().disbursements.approve(UNKNOWN_ID as DisbursementId), 'not_found', 404);
    });
  });

  describe('documents', () => {
    it('uploads, lists, downloads and deletes a document', async () => {
      const api = make();
      const b = await beneficiaryWith(api, 'verified');
      const content = 'id,name\n1,Ana\n';
      const progress: number[] = [];
      const doc = await api.documents.upload(b.id, new File([content], 'roster.csv', { type: 'text/csv' }), 'consent', {
        onProgress: (p) => progress.push(p),
      });
      expect(doc).toMatchObject({
        beneficiaryId: b.id,
        fileName: 'roster.csv',
        contentType: 'text/csv',
        kind: 'consent',
        sizeBytes: content.length,
        uploadedBy: 'Operator',
        sha256: createHash('sha256').update(content).digest('hex'),
      });
      expect(progress.at(-1)).toBe(1);
      await expect(api.documents.list(b.id)).resolves.toEqual([doc]);

      const file = await api.documents.download(doc.id);
      expect(file.fileName).toBe('roster.csv');
      expect(file.contentType).toMatch(/^text\/csv/);
      await expect(file.data.text()).resolves.toBe(content);

      await api.documents.delete(doc.id);
      await expect(api.documents.list(b.id)).resolves.toEqual([]);
      await expectApiError(api.documents.download(doc.id), 'not_found', 404);
      await expectApiError(api.documents.delete(doc.id), 'not_found', 404);
    });

    it('preserves unicode file names and binary content', async () => {
      const api = make();
      const b = await beneficiaryWith(api, 'verified');
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10, 0x80]);
      const doc = await api.documents.upload(
        b.id,
        new File([bytes], 'Überweisung März.pdf', { type: 'application/pdf' }),
        'bank',
      );
      const file = await api.documents.download(doc.id);
      expect(file.fileName).toBe('Überweisung März.pdf');
      expect(new Uint8Array(await file.data.arrayBuffer())).toEqual(bytes);
    });

    it('rejects disallowed, empty and oversized files', async () => {
      const api = make();
      const b = await beneficiaryWith(api, 'verified');
      await expectApiError(
        api.documents.upload(b.id, new File(['MZ'], 'tool.exe', { type: 'application/x-msdownload' }), 'other'),
        'validation',
        422,
      );
      await expectApiError(
        api.documents.upload(b.id, new File([], 'empty.txt', { type: 'text/plain' }), 'other'),
        'validation',
        422,
      );
      await expectApiError(
        api.documents.upload(
          b.id,
          new File([new Uint8Array(MAX_DOCUMENT_BYTES + 1)], 'huge.pdf', { type: 'application/pdf' }),
          'other',
        ),
        'validation',
        422,
      );
      await expectApiError(
        api.documents.upload(UNKNOWN_ID as BeneficiaryId, new File(['x'], 'a.txt', { type: 'text/plain' }), 'other'),
        'not_found',
        404,
      );
      await expectApiError(api.documents.download(UNKNOWN_ID as DocumentId), 'not_found', 404);
    });
  });

  describe('events', () => {
    it('streams domain events for every change, with the full entity', async () => {
      const api = make();
      const received: DomainEvent[] = [];
      const states: ConnectionState[] = [];
      const unsubscribe = api.events.subscribe({
        onEvent: (e) => received.push(e),
        onStateChange: (s) => states.push(s),
      });
      await waitFor(() => states.includes('open'));
      const b = await beneficiaryWith(api, 'pending');
      await api.beneficiaries.setStatus(b.id, 'verified');
      const d = await api.disbursements.create({ beneficiaryId: b.id, amountMinor: 700 });
      await api.disbursements.approve(d.id);
      await api.documents.upload(b.id, new File(['hello'], 'note.txt', { type: 'text/plain' }), 'other');
      await waitFor(() => received.length >= 4);
      unsubscribe();

      expect(received.map((e) => e.type)).toEqual([
        'beneficiary.status_changed',
        'disbursement.created',
        'disbursement.approved',
        'document.uploaded',
      ]);
      expect(received[0]).toMatchObject({
        previousStatus: 'pending',
        actor: 'Operator',
        beneficiary: { id: b.id, status: 'verified' },
      });
      expect(received[2]).toMatchObject({
        beneficiaryName: b.displayName,
        disbursement: { id: d.id, status: 'approved' },
      });
      const ids = received.map((e) => e.id);
      expect([...ids].sort()).toEqual(ids);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('stops delivering after unsubscribe', async () => {
      const api = make();
      const received: DomainEvent[] = [];
      const states: ConnectionState[] = [];
      const unsubscribe = api.events.subscribe({
        onEvent: (e) => received.push(e),
        onStateChange: (s) => states.push(s),
      });
      await waitFor(() => states.includes('open'));
      unsubscribe();
      await waitFor(() => states.includes('closed'));
      await api.beneficiaries.setStatus((await beneficiaryWith(api, 'pending')).id, 'verified');
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(received).toEqual([]);
    });
  });

  describe('resilience', () => {
    it('surfaces injected failures as ApiError(unavailable)', async () => {
      await expectApiError(make({ failureRate: 1 }).programs.list(), 'unavailable', 503);
    });

    it('applies injected latency', async () => {
      const api = make({ latencyMs: [60, 60] });
      const started = performance.now();
      await api.programs.list();
      expect(performance.now() - started).toBeGreaterThanOrEqual(55);
    });
  });
});

describe('adapters are interchangeable', () => {
  it('return identical data for the same seed and query', async () => {
    const [memory, httpMsw] = adapters.map(([, make]) => make());
    if (!memory || !httpMsw) throw new Error('adapters missing');
    const program = await activeProgram(memory);
    const q = { page: 2, pageSize: 25, sort: 'country:asc' } as const;
    const [a, b] = await Promise.all([
      memory.beneficiaries.list(program.id, q),
      httpMsw.beneficiaries.list(program.id, q),
    ]);
    expect(b).toEqual(a);
  });
});

describe('HttpApiClient boundary', () => {
  it('rejects responses that violate the contract', async () => {
    server.resetHandlers(http.get(`${BASE}/programs`, () => HttpResponse.json({ items: [{ id: 'nope' }] })));
    await expectApiError(createHttpApiClient({ baseUrl: BASE }).programs.list(), 'unknown', 500);
  });

  it('maps non-contract error bodies by status code', async () => {
    server.resetHandlers(
      http.get(`${BASE}/programs`, () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })),
    );
    await expectApiError(createHttpApiClient({ baseUrl: BASE }).programs.list(), 'unavailable', 502);
  });

  it('reports a missing endpoint distinctly from a missing record', async () => {
    server.resetHandlers(
      http.get(`${BASE}/programs`, () => new HttpResponse('<!doctype html><title>404</title>', { status: 404 })),
    );
    const error = await expectApiError(createHttpApiClient({ baseUrl: BASE }).programs.list(), 'unknown', 404);
    expect(error.message).toMatch(/API endpoint is not available/);
    expect(error.body.details).toEqual({ endpointMissing: true });
  });

  it('maps network failures to ApiError(unavailable)', async () => {
    const api = createHttpApiClient({
      baseUrl: BASE,
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expectApiError(api.programs.list(), 'unavailable', 503);
  });

  it('sends a bearer token when getToken returns one', async () => {
    let auth: string | null = null;
    server.resetHandlers(
      http.get(`${BASE}/programs`, ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json({ items: [], total: 0, page: 0, pageSize: 25 });
      }),
    );
    await createHttpApiClient({ baseUrl: BASE, getToken: async () => 'tkn' }).programs.list();
    expect(auth).toBe('Bearer tkn');
  });

  it('replays missed events after Last-Event-ID', async () => {
    const store = createStore({ seed: SEED });
    server.resetHandlers(...createHandlers({ store, chaos: createChaos(noChaos), baseUrl: BASE }));
    const api = createHttpApiClient({ baseUrl: BASE });
    const program = await activeProgram(api);
    const first = await api.beneficiaries.create({ programId: program.id, displayName: 'First One', country: 'KE' });
    const second = await api.beneficiaries.create({ programId: program.id, displayName: 'Second One', country: 'KE' });
    const firstEventId = '0000000001';

    const controller = new AbortController();
    const response = await fetch(`${BASE}/events`, {
      headers: { 'Last-Event-ID': firstEventId },
      signal: controller.signal,
    });
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
    const parser = new SseParser();
    const messages = [];
    while (reader && messages.length < 1) {
      const { value, done } = await reader.read();
      if (done) break;
      messages.push(...parser.push(value));
    }
    controller.abort();
    const replayed = JSON.parse(messages[0]?.data ?? '{}') as DomainEvent;
    expect(replayed).toMatchObject({ type: 'beneficiary.created', beneficiary: { id: second.id } });
    expect(first.id).not.toBe(second.id);
  });

  it('reconnects after the stream drops and resumes from the last event id', async () => {
    const seen: Array<string | null> = [];
    const event = (id: string): DomainEvent =>
      ({
        id,
        occurredAt: '2026-01-01T00:00:00.000Z',
        actor: 'Test',
        type: 'document.deleted',
        documentId: '0b8d7c4e-2f3a-4c5d-9e6f-7a8b9c0d1e2f',
        beneficiaryId: '1b8d7c4e-2f3a-4c5d-9e6f-7a8b9c0d1e2f',
        fileName: 'x.pdf',
      }) as DomainEvent;
    server.resetHandlers(
      http.get(`${BASE}/events`, ({ request }) => {
        seen.push(request.headers.get('last-event-id'));
        const id = String(seen.length);
        // Each connection delivers one event, then the server closes the stream.
        const body = `retry: 10\n\n${formatSse({ id, data: JSON.stringify(event(id)) })}`;
        return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });
      }),
    );
    const received: DomainEvent[] = [];
    const states: ConnectionState[] = [];
    const unsubscribe = createHttpApiClient({ baseUrl: BASE, maxReconnectDelayMs: 50 }).events.subscribe({
      onEvent: (e) => received.push(e),
      onStateChange: (s) => states.push(s),
    });
    await waitFor(() => received.length >= 3);
    unsubscribe();
    expect(seen.slice(0, 3)).toEqual([null, '1', '2']);
    expect(received.map((e) => e.id).slice(0, 3)).toEqual(['1', '2', '3']);
    expect(states).toContain('reconnecting');
  });

  it('drops events that violate the contract instead of crashing', async () => {
    server.resetHandlers(
      http.get(
        `${BASE}/events`,
        () =>
          new HttpResponse(`${formatSse({ id: '1', data: '{"type":"bogus"}' })}`, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const received: DomainEvent[] = [];
    const unsubscribe = createHttpApiClient({ baseUrl: BASE, maxReconnectDelayMs: 1000 }).events.subscribe({
      onEvent: (e) => received.push(e),
    });
    await waitFor(() => warn.mock.calls.length > 0);
    unsubscribe();
    expect(received).toEqual([]);
  });

  it('serves the dev reset endpoint', async () => {
    const store = createStore({ seed: SEED });
    server.resetHandlers(...createHandlers({ store, chaos: createChaos(noChaos), baseUrl: BASE }));
    const api = createHttpApiClient({ baseUrl: BASE });
    const program = await activeProgram(api);
    await api.beneficiaries.create({ programId: program.id, displayName: 'Temp Person', country: 'KE' });
    const before = await api.beneficiaries.list(program.id, { pageSize: 1 });
    const res = await fetch(`${BASE}/__dev/reset`, { method: 'POST' });
    expect(res.status).toBe(204);
    const after = await api.beneficiaries.list(program.id, { pageSize: 1 });
    expect(after.total).toBe(before.total - 1);
  });
});
