import { z } from 'zod';
import { Beneficiary, BeneficiaryId, BeneficiaryStatus } from './beneficiary';
import { Timestamp } from './common';
import { Disbursement } from './disbursement';
import { BeneficiaryDocument, DocumentId } from './document';

const base = {
  /** Monotonic, opaque event id; clients send the last one back as `Last-Event-ID` to resume. */
  id: z.string().min(1),
  occurredAt: Timestamp,
  /** Who caused the change (user or system). */
  actor: z.string().min(1),
};

/**
 * Domain events pushed over Server-Sent Events (`GET /events`). Each carries the full updated entity so
 * clients can update caches without a round trip.
 */
export const DomainEvent = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('beneficiary.created'), beneficiary: Beneficiary }),
  z.object({
    ...base,
    type: z.literal('beneficiary.status_changed'),
    beneficiary: Beneficiary,
    previousStatus: BeneficiaryStatus,
  }),
  z.object({
    ...base,
    type: z.literal('disbursement.created'),
    disbursement: Disbursement,
    beneficiaryName: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal('disbursement.approved'),
    disbursement: Disbursement,
    beneficiaryName: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal('document.uploaded'),
    document: BeneficiaryDocument,
    beneficiaryName: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal('document.deleted'),
    documentId: DocumentId,
    beneficiaryId: BeneficiaryId,
    fileName: z.string(),
  }),
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
export type DomainEventType = DomainEvent['type'];

/** Event payload before the server assigns `id` and `occurredAt`. */
export type DomainEventInput = DomainEvent extends infer E
  ? E extends DomainEvent
    ? Omit<E, 'id' | 'occurredAt'>
    : never
  : never;
