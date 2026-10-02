import { z } from 'zod';
import { BeneficiaryStatus } from './beneficiary';
import { DisbursementStatus } from './disbursement';
import { ProgramId } from './program';

export const ProgramStats = z.object({
  programId: ProgramId,
  beneficiaries: z.record(BeneficiaryStatus, z.number().int().min(0)),
  disbursements: z.record(DisbursementStatus, z.number().int().min(0)),
  /** Sum of approved disbursements in minor units of the program currency. */
  approvedAmountMinor: z.number().int().min(0),
});
export type ProgramStats = z.infer<typeof ProgramStats>;
