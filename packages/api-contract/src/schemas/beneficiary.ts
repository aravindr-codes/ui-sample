import { z } from 'zod';
import { ListQuery, Timestamp } from './common';
import { ProgramId } from './program';

export const BeneficiaryId = z.uuid().brand<'BeneficiaryId'>();
export type BeneficiaryId = z.infer<typeof BeneficiaryId>;

export const BeneficiaryStatus = z.enum(['pending', 'verified', 'suspended']);
export type BeneficiaryStatus = z.infer<typeof BeneficiaryStatus>;

export const Beneficiary = z.object({
  id: BeneficiaryId,
  programId: ProgramId,
  displayName: z.string().trim().min(1, 'Name is required').max(120),
  country: z
    .string()
    .length(2, 'Use a 2-letter ISO country code')
    .regex(/^[A-Z]{2}$/, 'Use an uppercase ISO 3166-1 alpha-2 code'),
  status: BeneficiaryStatus,
  createdAt: Timestamp,
});
export type Beneficiary = z.infer<typeof Beneficiary>;

export const NewBeneficiary = Beneficiary.pick({ programId: true, displayName: true, country: true });
export type NewBeneficiary = z.infer<typeof NewBeneficiary>;

export const SetBeneficiaryStatus = z.object({ status: BeneficiaryStatus });
export type SetBeneficiaryStatus = z.infer<typeof SetBeneficiaryStatus>;

export const BeneficiaryListQuery = ListQuery.extend({ status: BeneficiaryStatus.optional() });
export type BeneficiaryListQuery = z.output<typeof BeneficiaryListQuery>;
export type BeneficiaryListQueryInput = z.input<typeof BeneficiaryListQuery>;

export const BENEFICIARY_SORT_FIELDS = ['displayName', 'country', 'status', 'createdAt'] as const;

/** Allowed status transitions. Setting the current status again is a conflict. */
export const BENEFICIARY_TRANSITIONS: Record<BeneficiaryStatus, readonly BeneficiaryStatus[]> = {
  pending: ['verified', 'suspended'],
  verified: ['suspended'],
  suspended: ['verified'],
};
