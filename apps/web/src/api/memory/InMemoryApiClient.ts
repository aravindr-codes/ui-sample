import { type ApiClient, ApiError } from '@ifcui/api-contract';
import type { Chaos } from '../mock/chaos';
import type { Store } from '../mock/store';

/**
 * ApiClient backed directly by the store (IRP03), without HTTP.
 * Results are JSON-round-tripped so callers see exactly what the HTTP adapter would return.
 */
export function createInMemoryApiClient(store: Store, chaos?: Chaos): ApiClient {
  /** Simulated network conditions + ApiError-only failures. */
  async function guard<T>(fn: () => T | Promise<T>): Promise<T> {
    try {
      await chaos?.apply();
      return await fn();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.of('unknown', error instanceof Error ? error.message : 'Unexpected error');
    }
  }

  /** Like `guard`, and JSON-round-trips the result exactly as HTTP would. */
  async function call<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = await guard(fn);
    return result === undefined ? result : (JSON.parse(JSON.stringify(result)) as T);
  }

  return {
    programs: {
      list: (q) => call(() => store.listPrograms(q ?? {})),
      get: (id) => call(() => store.getProgram(id)),
      stats: (id) => call(() => store.programStats(id)),
    },
    beneficiaries: {
      list: (programId, q) => call(() => store.listBeneficiaries(programId, q ?? {})),
      get: (id) => call(() => store.getBeneficiary(id)),
      create: (input) => call(() => store.createBeneficiary(input)),
      setStatus: (id, status) => call(() => store.setBeneficiaryStatus(id, { status })),
    },
    disbursements: {
      list: (q) => call(() => store.listDisbursements(q ?? {})),
      get: (id) => call(() => store.getDisbursement(id)),
      create: (input) => call(() => store.createDisbursement(input)),
      approve: (id) => call(() => store.approveDisbursement(id)),
    },
    documents: {
      list: (beneficiaryId) => call(() => store.listDocuments(beneficiaryId)),
      upload: (beneficiaryId, file, kind, options) =>
        call(async () => {
          if (options?.signal?.aborted) throw ApiError.of('unknown', 'Upload cancelled', { cancelled: true });
          const bytes = new Uint8Array(await file.arrayBuffer());
          options?.onProgress?.(1);
          return store.createDocument(beneficiaryId, { fileName: file.name, contentType: file.type, kind, bytes });
        }),
      download: (id) =>
        guard(() => {
          const { document, bytes } = store.getDocumentContent(id);
          return {
            fileName: document.fileName,
            contentType: document.contentType,
            data: new Blob([bytes], { type: document.contentType }),
          };
        }),
      delete: (id) => call(() => store.deleteDocument(id)),
    },
    events: {
      subscribe({ onEvent, onStateChange }) {
        onStateChange?.('open');
        const unsubscribe = store.subscribe((event) => onEvent(JSON.parse(JSON.stringify(event))));
        return () => {
          unsubscribe();
          onStateChange?.('closed');
        };
      },
    },
  };
}
