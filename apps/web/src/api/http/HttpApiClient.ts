import {
  type ApiClient,
  ApiError,
  ApiErrorBody,
  Beneficiary,
  BeneficiaryDocument,
  buildPath,
  type ConnectionState,
  codeForStatus,
  Disbursement,
  DomainEvent,
  type EventSubscriber,
  Page,
  Program,
  ProgramStats,
  parseContentDisposition,
  SseParser,
  toSearch,
  type UploadFile,
  type UploadOptions,
} from '@ifcui/api-contract';
import { z } from 'zod';

export interface HttpApiClientOptions {
  baseUrl: string;
  /** Future MSAL/Entra ID seam: return a bearer token or undefined. */
  getToken?: () => Promise<string | undefined>;
  fetch?: typeof fetch;
  /** Upper bound for the SSE reconnect backoff. */
  maxReconnectDelayMs?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** ApiClient over HTTP (IRP02 → MSW, IRP05 → Function Apps). Every response is validated against the contract. */
export function createHttpApiClient({
  baseUrl,
  getToken,
  fetch: fetchImpl,
  maxReconnectDelayMs = 30_000,
}: HttpApiClientOptions): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');
  const doFetch = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function errorFromBody(status: number, statusText: string, text: string): ApiError {
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    const body = ApiErrorBody.safeParse(json);
    // A 404/405 without a contract error body means the endpoint itself is missing (wrong apiBaseUrl,
    // mock worker not running), not that a record was not found.
    if (!body.success && (status === 404 || status === 405)) {
      return new ApiError(status, {
        code: 'unknown',
        message: `The API endpoint is not available (HTTP ${status}). Check apiBaseUrl in config.json, or reload the page.`,
        details: { endpointMissing: true },
      });
    }
    return new ApiError(
      status,
      body.success
        ? body.data
        : { code: codeForStatus(status), message: statusText || `Request failed (HTTP ${status})` },
    );
  }

  const unreachable = (cause: unknown) =>
    ApiError.of('unavailable', 'Could not reach the server. Check your connection and retry.', {
      cause: String(cause),
    });

  async function send(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, init);
    } catch (cause) {
      if (init.signal?.aborted) throw ApiError.of('unknown', 'Request cancelled', { cancelled: true });
      throw unreachable(cause);
    }
    if (!response.ok) throw errorFromBody(response.status, response.statusText, await response.text());
    return response;
  }

  async function request<S extends z.ZodType>(
    schema: S,
    method: Method,
    path: string,
    init: { query?: object | undefined; body?: unknown; form?: FormData } = {},
  ): Promise<z.output<S>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...(await authHeaders()) };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await send(`${path}${toSearch(init.query)}`, {
      method,
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      ...(init.form ? { body: init.form } : {}),
    });
    return validate(schema, safeJson(await response.text()), method, path);
  }

  function validate<S extends z.ZodType>(schema: S, json: unknown, method: string, path: string): z.output<S> {
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw ApiError.of('unknown', 'The server response did not match the API contract', {
        method,
        path,
        issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
      });
    }
    return parsed.data;
  }

  /** Multipart upload. Uses XHR when available because fetch cannot report upload progress. */
  async function upload(path: string, file: UploadFile, fields: Record<string, string>, options: UploadOptions = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('file', file, file.name);
    if (typeof XMLHttpRequest === 'undefined' || fetchImpl) {
      const result = await request(BeneficiaryDocument, 'POST', path, { form });
      options.onProgress?.(1);
      return result;
    }
    const headers = { Accept: 'application/json', ...(await authHeaders()) };
    return new Promise<BeneficiaryDocument>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}${path}`);
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) options.onProgress?.(Math.min(1, e.loaded / e.total));
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(errorFromBody(xhr.status, xhr.statusText, xhr.responseText));
          return;
        }
        try {
          options.onProgress?.(1);
          resolve(validate(BeneficiaryDocument, JSON.parse(xhr.responseText), 'POST', path));
        } catch (error) {
          reject(error instanceof ApiError ? error : ApiError.of('unknown', 'Invalid upload response'));
        }
      };
      xhr.onerror = () => reject(unreachable('network error'));
      xhr.onabort = () => reject(ApiError.of('unknown', 'Upload cancelled', { cancelled: true }));
      options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      if (options.signal?.aborted) {
        reject(ApiError.of('unknown', 'Upload cancelled', { cancelled: true }));
        return;
      }
      xhr.send(form);
    });
  }

  /** Fetch-based SSE client (supports auth headers, unlike EventSource) with backoff and Last-Event-ID resume. */
  function subscribe({ onEvent, onStateChange }: EventSubscriber): () => void {
    let stopped = false;
    let controller: AbortController | undefined;
    let lastEventId: string | undefined;
    let wake: (() => void) | undefined;
    const setState = (state: ConnectionState) => onStateChange?.(state);

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });

    void (async () => {
      let attempt = 0;
      let retryMs = 3_000;
      while (!stopped) {
        setState(attempt === 0 ? 'connecting' : 'reconnecting');
        controller = new AbortController();
        try {
          const headers: Record<string, string> = { Accept: 'text/event-stream', ...(await authHeaders()) };
          if (lastEventId) headers['Last-Event-ID'] = lastEventId;
          const response = await send(buildPath('events'), { headers, signal: controller.signal, cache: 'no-store' });
          if (!response.body) throw ApiError.of('unavailable', 'Event stream has no body');
          setState('open');
          attempt = 0;
          const parser = new SseParser();
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const message of parser.push(value)) {
              if (message.id) lastEventId = message.id;
              const parsed = DomainEvent.safeParse(safeJson(message.data));
              if (parsed.success) onEvent(parsed.data);
              else console.warn('Dropped an event that does not match the contract', parsed.error.issues);
            }
            if (parser.reconnectMs !== undefined) retryMs = parser.reconnectMs;
          }
        } catch {
          // fall through to reconnect
        }
        if (stopped) break;
        attempt += 1;
        setState('reconnecting');
        const backoff = Math.min(retryMs * 2 ** (attempt - 1), maxReconnectDelayMs);
        await sleep(backoff / 2 + Math.random() * (backoff / 2));
      }
      setState('closed');
    })();

    return () => {
      stopped = true;
      controller?.abort();
      wake?.();
    };
  }

  const ProgramPage = Page(Program);
  const BeneficiaryPage = Page(Beneficiary);
  const DisbursementPage = Page(Disbursement);

  return {
    programs: {
      list: (q) => request(ProgramPage, 'GET', buildPath('programs'), { query: q }),
      get: (id) => request(Program, 'GET', buildPath('program', { programId: id })),
      stats: (id) => request(ProgramStats, 'GET', buildPath('programStats', { programId: id })),
    },
    beneficiaries: {
      list: (programId, q) =>
        request(BeneficiaryPage, 'GET', buildPath('programBeneficiaries', { programId }), { query: q }),
      get: (id) => request(Beneficiary, 'GET', buildPath('beneficiary', { beneficiaryId: id })),
      create: (input) => request(Beneficiary, 'POST', buildPath('beneficiaries'), { body: input }),
      setStatus: (id, status) =>
        request(Beneficiary, 'POST', buildPath('beneficiaryStatus', { beneficiaryId: id }), { body: { status } }),
    },
    disbursements: {
      list: (q) => request(DisbursementPage, 'GET', buildPath('disbursements'), { query: q }),
      get: (id) => request(Disbursement, 'GET', buildPath('disbursement', { disbursementId: id })),
      create: (input) => request(Disbursement, 'POST', buildPath('disbursements'), { body: input }),
      approve: (id) => request(Disbursement, 'POST', buildPath('disbursementApprove', { disbursementId: id })),
    },
    documents: {
      list: (beneficiaryId) =>
        request(z.array(BeneficiaryDocument), 'GET', buildPath('beneficiaryDocuments', { beneficiaryId })),
      upload: (beneficiaryId, file, kind, options) =>
        upload(buildPath('beneficiaryDocuments', { beneficiaryId }), file, { kind }, options),
      download: async (id) => {
        const path = buildPath('documentContent', { documentId: id });
        const response = await send(path, { headers: { Accept: '*/*', ...(await authHeaders()) } });
        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
        const data = await response.blob();
        return {
          fileName: parseContentDisposition(response.headers.get('content-disposition')) ?? `document-${id}`,
          contentType,
          data,
        };
      },
      delete: async (id) => {
        await send(buildPath('document', { documentId: id }), {
          method: 'DELETE',
          headers: { Accept: 'application/json', ...(await authHeaders()) },
        });
      },
    },
    events: { subscribe },
  };
}
