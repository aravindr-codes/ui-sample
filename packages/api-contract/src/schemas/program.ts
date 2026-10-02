import { z } from 'zod';
import { Timestamp } from './common';

export const ProgramId = z.uuid().brand<'ProgramId'>();
export type ProgramId = z.infer<typeof ProgramId>;

export const ProgramStatus = z.enum(['active', 'closed']);
export type ProgramStatus = z.infer<typeof ProgramStatus>;

export const Program = z.object({
  id: ProgramId,
  code: z.string().regex(/^[A-Z0-9-]{3,16}$/),
  name: z.string().min(1).max(200),
  currency: z.string().regex(/^[A-Z]{3}$/), // ISO 4217
  status: ProgramStatus,
  createdAt: Timestamp,
});
export type Program = z.infer<typeof Program>;

export const PROGRAM_SORT_FIELDS = ['code', 'name', 'status', 'createdAt'] as const;
