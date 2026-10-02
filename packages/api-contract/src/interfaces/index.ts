import type {
  Beneficiary,
  BeneficiaryId,
  BeneficiaryListQueryInput,
  BeneficiaryStatus,
  NewBeneficiary,
} from '../schemas/beneficiary';
import type { ListQueryInput, Page } from '../schemas/common';
import type {
  Disbursement,
  DisbursementId,
  DisbursementListQueryInput,
  NewDisbursement,
} from '../schemas/disbursement';
import type { BeneficiaryDocument, DocumentId, DocumentKind } from '../schemas/document';
import type { DomainEvent } from '../schemas/event';
import type { Program, ProgramId } from '../schemas/program';
import type { ProgramStats } from '../schemas/stats';

/**
 * Every method resolves with schema-valid data or rejects with `ApiError`.
 * Adapters must not leak any other error type.
 */
export interface ProgramApi {
  list(q?: ListQueryInput): Promise<Page<Program>>;
  get(id: ProgramId): Promise<Program>;
  stats(id: ProgramId): Promise<ProgramStats>;
}

export interface BeneficiaryApi {
  list(programId: ProgramId, q?: BeneficiaryListQueryInput): Promise<Page<Beneficiary>>;
  get(id: BeneficiaryId): Promise<Beneficiary>;
  create(input: NewBeneficiary): Promise<Beneficiary>;
  setStatus(id: BeneficiaryId, status: BeneficiaryStatus): Promise<Beneficiary>;
}

export interface DisbursementApi {
  list(q?: DisbursementListQueryInput): Promise<Page<Disbursement>>;
  get(id: DisbursementId): Promise<Disbursement>;
  create(input: NewDisbursement): Promise<Disbursement>;
  approve(id: DisbursementId): Promise<Disbursement>;
}

/** A file to upload: a browser `File`, or any Blob with a name (Node 20+ has both). */
export type UploadFile = Blob & { readonly name: string };

export interface UploadOptions {
  /** Called with 0..1 as bytes are sent (when the transport can report it). */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface DownloadedFile {
  fileName: string;
  contentType: string;
  data: Blob;
}

export interface DocumentApi {
  list(beneficiaryId: BeneficiaryId): Promise<BeneficiaryDocument[]>;
  upload(
    beneficiaryId: BeneficiaryId,
    file: UploadFile,
    kind: DocumentKind,
    options?: UploadOptions,
  ): Promise<BeneficiaryDocument>;
  download(id: DocumentId): Promise<DownloadedFile>;
  delete(id: DocumentId): Promise<void>;
}

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface EventSubscriber {
  onEvent: (event: DomainEvent) => void;
  onStateChange?: (state: ConnectionState) => void;
}

/** Live domain events (Server-Sent Events over HTTP). Reconnects automatically and resumes from the last event. */
export interface EventsApi {
  /** Starts receiving events; returns an unsubscribe function. */
  subscribe(subscriber: EventSubscriber): () => void;
}

export interface ApiClient {
  programs: ProgramApi;
  beneficiaries: BeneficiaryApi;
  disbursements: DisbursementApi;
  documents: DocumentApi;
  events: EventsApi;
}
