import { z } from 'zod';
import { BeneficiaryId } from './beneficiary';
import { ListQuery, Timestamp } from './common';
import { ProgramId } from './program';

export const DisbursementId = z.uuid().brand<'DisbursementId'>();
export type DisbursementId = z.infer<typeof DisbursementId>;

export const DisbursementStatus = z.enum(['pending', 'approved']);
export type DisbursementStatus = z.infer<typeof DisbursementStatus>;

export const Disbursement = z.object({
  id: DisbursementId,
  programId: ProgramId,
  beneficiaryId: BeneficiaryId,
  /** Amount in minor units (e.g. cents) of `currency`. */
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: DisbursementStatus,
  createdAt: Timestamp,
  approvedAt: Timestamp.nullable(),
});
export type Disbursement = z.infer<typeof Disbursement>;

/** Program and currency are derived from the beneficiary's program. */
export const NewDisbursement = z.object({
  beneficiaryId: BeneficiaryId,
  amountMinor: z.number().int().positive('Amount must be positive').max(100_000_000, 'Amount is too large'),
});
export type NewDisbursement = z.infer<typeof NewDisbursement>;

export const DisbursementListQuery = ListQuery.extend({
  programId: ProgramId.optional(),
  beneficiaryId: BeneficiaryId.optional(),
  status: DisbursementStatus.optional(),
});
export type DisbursementListQuery = z.output<typeof DisbursementListQuery>;
export type DisbursementListQueryInput = z.input<typeof DisbursementListQuery>;

export const DISBURSEMENT_SORT_FIELDS = ['amountMinor', 'status', 'createdAt', 'approvedAt'] as const;
