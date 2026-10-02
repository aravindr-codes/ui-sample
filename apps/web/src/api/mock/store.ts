import {
  ApiError,
  BENEFICIARY_SORT_FIELDS,
  BENEFICIARY_TRANSITIONS,
  Beneficiary,
  BeneficiaryDocument,
  BeneficiaryId,
  BeneficiaryListQuery,
  DISBURSEMENT_SORT_FIELDS,
  Disbursement,
  DisbursementId,
  DisbursementListQuery,
  DocumentContentType,
  DocumentFileName,
  DocumentId,
  DocumentKind,
  type DomainEvent,
  type DomainEventInput,
  ListQuery,
  MAX_DOCUMENT_BYTES,
  NewBeneficiary,
  NewDisbursement,
  type Page,
  PROGRAM_SORT_FIELDS,
  Program,
  ProgramId,
  type ProgramStats,
  parseSort,
  SetBeneficiaryStatus,
} from '@ifcui/api-contract';
import type { z } from 'zod';
import { createSeed, type SeedData, type SeedOptions } from './seed';

/**
 * In-memory backing store shared by InMemoryApiClient and the MSW handlers (IRP03).
 * Accepts untrusted input, validates it with the contract schemas, parses entities on write,
 * and throws only ApiError. Paging, sorting and filtering live here, as they will on the real API.
 */
export interface MutationContext {
  /** Who performs the change; recorded on emitted events and documents. */
  actor: string;
}

export interface NewDocumentInput {
  fileName: unknown;
  contentType: unknown;
  kind: unknown;
  bytes: Uint8Array<ArrayBuffer>;
}

export interface StoredDocument {
  document: BeneficiaryDocument;
  bytes: Uint8Array<ArrayBuffer>;
}

export interface Store {
  reset(): void;
  listPrograms(query: unknown): Page<Program>;
  getProgram(id: string): Program;
  programStats(id: string): ProgramStats;
  listBeneficiaries(programId: string, query: unknown): Page<Beneficiary>;
  getBeneficiary(id: string): Beneficiary;
  createBeneficiary(input: unknown, ctx?: MutationContext): Beneficiary;
  setBeneficiaryStatus(id: string, input: unknown, ctx?: MutationContext): Beneficiary;
  listDisbursements(query: unknown): Page<Disbursement>;
  getDisbursement(id: string): Disbursement;
  createDisbursement(input: unknown, ctx?: MutationContext): Disbursement;
  approveDisbursement(id: string, ctx?: MutationContext): Disbursement;
  listDocuments(beneficiaryId: string): BeneficiaryDocument[];
  createDocument(beneficiaryId: string, input: NewDocumentInput, ctx?: MutationContext): Promise<BeneficiaryDocument>;
  getDocumentContent(id: string): StoredDocument;
  deleteDocument(id: string, ctx?: MutationContext): void;
  /**
   * Receives every domain event after it is committed. With `afterEventId`, events still in the
   * replay buffer that came after it are delivered first (SSE `Last-Event-ID` resume).
   */
  subscribe(listener: (event: DomainEvent) => void, afterEventId?: string): () => void;
}

export const DEFAULT_ACTOR = 'Operator';
const EVENT_BUFFER_SIZE = 500;
/** Total bytes of uploaded documents kept in memory. */
export const DOCUMENT_QUOTA_BYTES = 50 * 1024 * 1024;

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface StoreOptions extends SeedOptions {
  now?: () => Date;
  newId?: () => string;
}

function parseInput<S extends z.ZodType>(schema: S, input: unknown, message = 'Validation failed'): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.fromZod(result.error, message);
  return result.data;
}

/** Entities are re-validated on every write so the store can never hold contract-invalid data. */
function parseEntity<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw ApiError.of('unknown', 'Store produced an invalid entity', { issues: result.error.issues });
  return result.data;
}

function parseId<S extends z.ZodType>(schema: S, id: string, what: string): z.output<S> {
  const result = schema.safeParse(id);
  if (!result.success) throw ApiError.of('not_found', `${what} ${id} not found`);
  return result.data;
}

type Comparable = string | number | null;

function paginate<T extends { id: string }>(
  rows: T[],
  query: ListQuery,
  sortFields: readonly string[],
  defaultSort: { field: string; direction: 'asc' | 'desc' },
  fieldValue: (row: T, field: string) => Comparable,
): Page<T> {
  const sort = query.sort ? parseSort(query.sort) : defaultSort;
  if (!sort || !sortFields.includes(sort.field)) {
    throw ApiError.of('validation', `Unsupported sort "${query.sort}"`, { allowed: sortFields });
  }
  const dir = sort.direction === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const av = fieldValue(a, sort.field);
    const bv = fieldValue(b, sort.field);
    // Nulls always last, regardless of direction.
    if (av === null && bv !== null) return 1;
    if (bv === null && av !== null) return -1;
    if (av !== null && bv !== null && av !== bv) {
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      if (cmp !== 0) return cmp * dir;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // stable tie-break
  });
  const start = query.page * query.pageSize;
  return {
    items: sorted.slice(start, start + query.pageSize).map((r) => structuredClone(r)),
    total: sorted.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

function field<T extends object>(row: T, name: string): Comparable {
  const value = (row as Record<string, unknown>)[name];
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

export function createStore(options: StoreOptions): Store {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => crypto.randomUUID());

  let programs = new Map<string, Program>();
  let beneficiaries = new Map<string, Beneficiary>();
  let disbursements = new Map<string, Disbursement>();
  let documents = new Map<string, StoredDocument>();
  let eventSeq = 0;
  let eventBuffer: DomainEvent[] = [];
  const listeners = new Set<(event: DomainEvent) => void>();

  function emit(input: DomainEventInput) {
    eventSeq += 1;
    const event = { ...input, id: String(eventSeq).padStart(10, '0'), occurredAt: now().toISOString() } as DomainEvent;
    eventBuffer.push(event);
    if (eventBuffer.length > EVENT_BUFFER_SIZE) eventBuffer = eventBuffer.slice(-EVENT_BUFFER_SIZE);
    for (const listener of listeners) {
      try {
        listener(structuredClone(event));
      } catch (error) {
        console.error('Store event listener failed', error);
      }
    }
  }

  function load(seed: SeedData) {
    programs = new Map(seed.programs.map((p) => [p.id, parseEntity(Program, p)]));
    beneficiaries = new Map(seed.beneficiaries.map((b) => [b.id, parseEntity(Beneficiary, b)]));
    disbursements = new Map(seed.disbursements.map((d) => [d.id, parseEntity(Disbursement, d)]));
    documents = new Map();
    eventBuffer = [];
  }

  function requireDocument(id: string): StoredDocument {
    const d = documents.get(parseId(DocumentId, id, 'Document'));
    if (!d) throw ApiError.of('not_found', `Document ${id} not found`);
    return d;
  }

  function requireProgram(id: string): Program {
    const program = programs.get(parseId(ProgramId, id, 'Program'));
    if (!program) throw ApiError.of('not_found', `Program ${id} not found`);
    return program;
  }

  function requireBeneficiary(id: string): Beneficiary {
    const b = beneficiaries.get(parseId(BeneficiaryId, id, 'Beneficiary'));
    if (!b) throw ApiError.of('not_found', `Beneficiary ${id} not found`);
    return b;
  }

  function requireDisbursement(id: string): Disbursement {
    const d = disbursements.get(parseId(DisbursementId, id, 'Disbursement'));
    if (!d) throw ApiError.of('not_found', `Disbursement ${id} not found`);
    return d;
  }

  load(createSeed(options));

  return {
    reset() {
      load(createSeed(options));
    },

    listPrograms(query) {
      const q = parseInput(ListQuery, query, 'Invalid query');
      const needle = q.q?.toLowerCase();
      const rows = [...programs.values()].filter(
        (p) => !needle || p.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle),
      );
      return paginate(rows, q, PROGRAM_SORT_FIELDS, { field: 'code', direction: 'asc' }, field);
    },

    getProgram(id) {
      return structuredClone(requireProgram(id));
    },

    programStats(id) {
      const program = requireProgram(id);
      const stats: ProgramStats = {
        programId: program.id,
        beneficiaries: { pending: 0, verified: 0, suspended: 0 },
        disbursements: { pending: 0, approved: 0 },
        approvedAmountMinor: 0,
      };
      for (const b of beneficiaries.values()) if (b.programId === program.id) stats.beneficiaries[b.status] += 1;
      for (const d of disbursements.values()) {
        if (d.programId !== program.id) continue;
        stats.disbursements[d.status] += 1;
        if (d.status === 'approved') stats.approvedAmountMinor += d.amountMinor;
      }
      return stats;
    },

    listBeneficiaries(programId, query) {
      const program = requireProgram(programId);
      const q = parseInput(BeneficiaryListQuery, query, 'Invalid query');
      const needle = q.q?.toLowerCase();
      const rows = [...beneficiaries.values()].filter(
        (b) =>
          b.programId === program.id &&
          (!q.status || b.status === q.status) &&
          (!needle ||
            b.displayName.toLowerCase().includes(needle) ||
            b.country.toLowerCase() === needle ||
            b.id.startsWith(needle)),
      );
      return paginate(rows, q, BENEFICIARY_SORT_FIELDS, { field: 'createdAt', direction: 'desc' }, field);
    },

    getBeneficiary(id) {
      return structuredClone(requireBeneficiary(id));
    },

    createBeneficiary(input, ctx = { actor: DEFAULT_ACTOR }) {
      const data = parseInput(NewBeneficiary, input);
      const program = requireProgram(data.programId);
      if (program.status !== 'active') {
        throw ApiError.of('conflict', `Program ${program.code} is closed to new beneficiaries`, {
          programId: program.id,
        });
      }
      const created = parseEntity(Beneficiary, {
        ...data,
        id: newId(),
        status: 'pending',
        createdAt: now().toISOString(),
      });
      beneficiaries.set(created.id, created);
      emit({ type: 'beneficiary.created', actor: ctx.actor, beneficiary: structuredClone(created) });
      return structuredClone(created);
    },

    setBeneficiaryStatus(id, input, ctx = { actor: DEFAULT_ACTOR }) {
      const current = requireBeneficiary(id);
      const { status } = parseInput(SetBeneficiaryStatus, input);
      const allowed = BENEFICIARY_TRANSITIONS[current.status];
      if (!allowed.includes(status)) {
        throw ApiError.of('conflict', `Cannot change status from ${current.status} to ${status}`, {
          from: current.status,
          to: status,
          allowed,
        });
      }
      const updated = parseEntity(Beneficiary, { ...current, status });
      beneficiaries.set(updated.id, updated);
      emit({
        type: 'beneficiary.status_changed',
        actor: ctx.actor,
        beneficiary: structuredClone(updated),
        previousStatus: current.status,
      });
      return structuredClone(updated);
    },

    listDisbursements(query) {
      const q = parseInput(DisbursementListQuery, query, 'Invalid query');
      const needle = q.q?.toLowerCase();
      const rows = [...disbursements.values()].filter((d) => {
        if (q.programId && d.programId !== q.programId) return false;
        if (q.beneficiaryId && d.beneficiaryId !== q.beneficiaryId) return false;
        if (q.status && d.status !== q.status) return false;
        if (!needle) return true;
        if (d.id.startsWith(needle)) return true;
        return beneficiaries.get(d.beneficiaryId)?.displayName.toLowerCase().includes(needle) ?? false;
      });
      return paginate(rows, q, DISBURSEMENT_SORT_FIELDS, { field: 'createdAt', direction: 'desc' }, field);
    },

    getDisbursement(id) {
      return structuredClone(requireDisbursement(id));
    },

    createDisbursement(input, ctx = { actor: DEFAULT_ACTOR }) {
      const data = parseInput(NewDisbursement, input);
      const beneficiary = requireBeneficiary(data.beneficiaryId);
      const program = requireProgram(beneficiary.programId);
      if (program.status !== 'active') {
        throw ApiError.of('conflict', `Program ${program.code} is closed`, { programId: program.id });
      }
      if (beneficiary.status !== 'verified') {
        throw ApiError.of(
          'conflict',
          `Beneficiary must be verified to receive disbursements (is ${beneficiary.status})`,
          {
            beneficiaryStatus: beneficiary.status,
          },
        );
      }
      const created = parseEntity(Disbursement, {
        id: newId(),
        programId: program.id,
        beneficiaryId: beneficiary.id,
        amountMinor: data.amountMinor,
        currency: program.currency,
        status: 'pending',
        createdAt: now().toISOString(),
        approvedAt: null,
      });
      disbursements.set(created.id, created);
      emit({
        type: 'disbursement.created',
        actor: ctx.actor,
        disbursement: structuredClone(created),
        beneficiaryName: beneficiary.displayName,
      });
      return structuredClone(created);
    },

    approveDisbursement(id, ctx = { actor: DEFAULT_ACTOR }) {
      const current = requireDisbursement(id);
      if (current.status !== 'pending') {
        throw ApiError.of('conflict', `Disbursement is already ${current.status}`, { status: current.status });
      }
      const beneficiary = requireBeneficiary(current.beneficiaryId);
      if (beneficiary.status !== 'verified') {
        throw ApiError.of('conflict', `Beneficiary is ${beneficiary.status}; only verified beneficiaries can be paid`, {
          beneficiaryStatus: beneficiary.status,
        });
      }
      const updated = parseEntity(Disbursement, { ...current, status: 'approved', approvedAt: now().toISOString() });
      disbursements.set(updated.id, updated);
      emit({
        type: 'disbursement.approved',
        actor: ctx.actor,
        disbursement: structuredClone(updated),
        beneficiaryName: beneficiary.displayName,
      });
      return structuredClone(updated);
    },

    listDocuments(beneficiaryId) {
      const beneficiary = requireBeneficiary(beneficiaryId);
      return [...documents.values()]
        .filter((d) => d.document.beneficiaryId === beneficiary.id)
        .map((d) => structuredClone(d.document))
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id));
    },

    async createDocument(beneficiaryId, input, ctx = { actor: DEFAULT_ACTOR }) {
      const beneficiary = requireBeneficiary(beneficiaryId);
      const issues: Array<{ path: string; message: string }> = [];
      const fileName = DocumentFileName.safeParse(input.fileName);
      if (!fileName.success)
        issues.push({ path: 'file', message: fileName.error.issues[0]?.message ?? 'Invalid name' });
      const contentType = DocumentContentType.safeParse(input.contentType);
      if (!contentType.success)
        issues.push({ path: 'file', message: 'Only PDF, PNG, JPEG, TXT and CSV files are accepted' });
      const kind = DocumentKind.safeParse(input.kind);
      if (!kind.success) issues.push({ path: 'kind', message: 'Choose a document type' });
      if (input.bytes.byteLength === 0) issues.push({ path: 'file', message: 'The file is empty' });
      if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
        issues.push({ path: 'file', message: `Files must be ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB or smaller` });
      }
      if (issues.length || !fileName.success || !contentType.success || !kind.success) {
        throw ApiError.of('validation', issues[0]?.message ?? 'Invalid upload', { issues });
      }
      const used = [...documents.values()].reduce((sum, d) => sum + d.bytes.byteLength, 0);
      if (used + input.bytes.byteLength > DOCUMENT_QUOTA_BYTES) {
        throw ApiError.of('conflict', 'Document storage quota exceeded. Delete documents and try again.');
      }
      const bytes = input.bytes.slice();
      const document = parseEntity(BeneficiaryDocument, {
        id: newId(),
        beneficiaryId: beneficiary.id,
        kind: kind.data,
        fileName: fileName.data,
        contentType: contentType.data,
        sizeBytes: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        uploadedAt: now().toISOString(),
        uploadedBy: ctx.actor,
      });
      documents.set(document.id, { document, bytes });
      emit({
        type: 'document.uploaded',
        actor: ctx.actor,
        document: structuredClone(document),
        beneficiaryName: beneficiary.displayName,
      });
      return structuredClone(document);
    },

    getDocumentContent(id) {
      const stored = requireDocument(id);
      return { document: structuredClone(stored.document), bytes: stored.bytes.slice() };
    },

    deleteDocument(id, ctx = { actor: DEFAULT_ACTOR }) {
      const stored = requireDocument(id);
      documents.delete(stored.document.id);
      emit({
        type: 'document.deleted',
        actor: ctx.actor,
        documentId: stored.document.id,
        beneficiaryId: stored.document.beneficiaryId,
        fileName: stored.document.fileName,
      });
    },

    subscribe(listener, afterEventId) {
      if (afterEventId) {
        const index = eventBuffer.findIndex((e) => e.id === afterEventId);
        if (index !== -1) for (const event of eventBuffer.slice(index + 1)) listener(structuredClone(event));
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
