import {
  ApiError,
  contentDisposition,
  type DomainEvent,
  formatSse,
  formatSseComment,
  fromSearch,
  routes,
} from '@ifcui/api-contract';
import { HttpResponse, http, type JsonBodyType } from 'msw';
import { z } from 'zod';
import type { Chaos } from './chaos';
import type { Simulation } from './simulator';
import type { Store } from './store';

export interface HandlerOptions {
  store: Store;
  chaos: Chaos;
  /** Same base URL the HttpApiClient uses, e.g. `/api` in the browser or `http://local/api` in Node. */
  baseUrl: string;
  /** Background activity simulator, controllable through `/__dev/simulation`. */
  simulation?: Simulation;
  /** Interval of SSE keep-alive comments. */
  heartbeatMs?: number;
}

const SimulationUpdate = z.object({
  enabled: z.boolean().optional(),
  intervalMs: z.tuple([z.number().int().min(100), z.number().int().min(100)]).optional(),
  tick: z.boolean().optional(),
});

/**
 * `GET /events`: a Server-Sent Events stream of store events. Honors `Last-Event-ID` (header or
 * `lastEventId` query param) to replay missed events, and sends keep-alive comments.
 */
function eventStream(store: Store, request: Request, heartbeatMs: number): Response {
  const lastEventId =
    request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('lastEventId') ?? undefined;
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      send('retry: 3000\n\n'); // reconnection delay hint for clients
      send(formatSseComment('connected'));
      const unsubscribe = store.subscribe(
        (event: DomainEvent) => send(formatSse({ id: event.id, event: 'domain', data: JSON.stringify(event) })),
        lastEventId || undefined,
      );
      const heartbeat = setInterval(() => send(formatSseComment('ping')), heartbeatMs);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
      request.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

const ChaosUpdate = z.object({
  latencyMs: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  failureRate: z.number().min(0).max(1).optional(),
});

function errorResponse(error: unknown) {
  const apiError =
    error instanceof ApiError
      ? error
      : ApiError.of('unknown', error instanceof Error ? error.message : 'Unexpected error');
  return HttpResponse.json(apiError.body, { status: apiError.status });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw ApiError.of('validation', 'Request body must be valid JSON');
  }
}

function param(params: Record<string, string | readonly string[] | undefined>, name: string): string {
  const value = params[name];
  return typeof value === 'string' ? value : '';
}

/** MSW handlers implementing the REST contract (IRP02) on top of the in-memory store (IRP03). */
export function createHandlers({ store, chaos, baseUrl, simulation, heartbeatMs = 15_000 }: HandlerOptions) {
  const base = baseUrl.replace(/\/+$/, '');
  const url = (path: string) => `${base}${path}`;

  /** Wraps a resolver with simulated latency/failures and ApiError → HTTP mapping. */
  const api =
    <A extends { request: Request; params: Record<string, string | readonly string[] | undefined> }>(
      resolve: (args: A) => JsonBodyType | Promise<JsonBodyType>,
      status = 200,
    ) =>
    async (args: A) => {
      try {
        await chaos.apply();
        return HttpResponse.json(await resolve(args), { status });
      } catch (error) {
        return errorResponse(error);
      }
    };

  const query = (request: Request) => fromSearch(new URL(request.url).searchParams);

  return [
    http.get(
      url(routes.programs),
      api(({ request }) => store.listPrograms(query(request))),
    ),
    http.get(
      url(routes.program),
      api(({ params }) => store.getProgram(param(params, 'programId'))),
    ),
    http.get(
      url(routes.programStats),
      api(({ params }) => store.programStats(param(params, 'programId'))),
    ),
    http.get(
      url(routes.programBeneficiaries),
      api(({ params, request }) => store.listBeneficiaries(param(params, 'programId'), query(request))),
    ),
    http.post(
      url(routes.beneficiaries),
      api(async ({ request }) => store.createBeneficiary(await readJson(request)), 201),
    ),
    http.get(
      url(routes.beneficiary),
      api(({ params }) => store.getBeneficiary(param(params, 'beneficiaryId'))),
    ),
    http.post(
      url(routes.beneficiaryStatus),
      api(async ({ params, request }) =>
        store.setBeneficiaryStatus(param(params, 'beneficiaryId'), await readJson(request)),
      ),
    ),
    http.get(
      url(routes.disbursements),
      api(({ request }) => store.listDisbursements(query(request))),
    ),
    http.post(
      url(routes.disbursements),
      api(async ({ request }) => store.createDisbursement(await readJson(request)), 201),
    ),
    http.get(
      url(routes.disbursement),
      api(({ params }) => store.getDisbursement(param(params, 'disbursementId'))),
    ),
    http.post(
      url(routes.disbursementApprove),
      api(({ params }) => store.approveDisbursement(param(params, 'disbursementId'))),
    ),

    http.get(
      url(routes.beneficiaryDocuments),
      api(({ params }) => store.listDocuments(param(params, 'beneficiaryId'))),
    ),
    http.post(
      url(routes.beneficiaryDocuments),
      api(async ({ params, request }) => {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          throw ApiError.of('validation', 'Upload must be multipart/form-data');
        }
        const file = form.get('file');
        if (!(file instanceof Blob)) {
          throw ApiError.of('validation', 'Attach a file in the "file" field', {
            issues: [{ path: 'file', message: 'A file is required' }],
          });
        }
        return store.createDocument(param(params, 'beneficiaryId'), {
          fileName: 'name' in file && typeof file.name === 'string' ? file.name : '',
          contentType: file.type,
          kind: form.get('kind'),
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      }, 201),
    ),
    http.get(url(routes.documentContent), async ({ params }) => {
      try {
        await chaos.apply();
        const { document, bytes } = store.getDocumentContent(param(params, 'documentId'));
        return new HttpResponse(bytes, {
          status: 200,
          headers: {
            'Content-Type': document.contentType,
            'Content-Length': String(bytes.byteLength),
            'Content-Disposition': contentDisposition(document.fileName),
            'X-Content-SHA256': document.sha256,
          },
        });
      } catch (error) {
        return errorResponse(error);
      }
    }),
    http.delete(url(routes.document), async ({ params }) => {
      try {
        await chaos.apply();
        store.deleteDocument(param(params, 'documentId'));
        return new HttpResponse(null, { status: 204 });
      } catch (error) {
        return errorResponse(error);
      }
    }),
    http.get(url(routes.events), async ({ request }) => {
      try {
        await chaos.apply();
        return eventStream(store, request, heartbeatMs);
      } catch (error) {
        return errorResponse(error);
      }
    }),

    // Dev-only endpoints: not part of the public contract, never subject to chaos.
    http.post(url('/__dev/simulation'), async ({ request }) => {
      try {
        if (!simulation) throw ApiError.of('not_found', 'Simulation is not available');
        const parsed = SimulationUpdate.safeParse(await readJson(request));
        if (!parsed.success) throw ApiError.fromZod(parsed.error);
        const { enabled, intervalMs, tick } = parsed.data;
        if (intervalMs) simulation.configure({ intervalMs });
        if (enabled === true) simulation.start();
        if (enabled === false) simulation.stop();
        const ticked = tick ? simulation.tick() : undefined;
        return HttpResponse.json({ running: simulation.running, ...(ticked ? { ticked } : {}) });
      } catch (error) {
        return errorResponse(error);
      }
    }),
    http.post(url(routes.devReset), () => {
      store.reset();
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(url('/__dev/chaos'), () => HttpResponse.json(chaos.settings())),
    http.post(url('/__dev/chaos'), async ({ request }) => {
      try {
        const parsed = ChaosUpdate.safeParse(await readJson(request));
        if (!parsed.success) throw ApiError.fromZod(parsed.error);
        const { latencyMs, failureRate } = parsed.data;
        return HttpResponse.json(
          chaos.update({ ...(latencyMs ? { latencyMs } : {}), ...(failureRate !== undefined ? { failureRate } : {}) }),
        );
      } catch (error) {
        return errorResponse(error);
      }
    }),
    // Unknown API paths get a contract-shaped 404 instead of falling through to the network.
    http.all(url('/*'), async () => {
      await chaos.apply().catch(() => undefined);
      return errorResponse(ApiError.of('not_found', 'No such API endpoint'));
    }),
  ];
}
