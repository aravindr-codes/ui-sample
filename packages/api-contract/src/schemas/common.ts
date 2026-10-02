import { z } from 'zod';

/** ISO 8601 UTC timestamp, e.g. `2026-01-31T12:00:00.000Z`. */
export const Timestamp = z.iso.datetime();

/** Sort expression `field:asc` or `field:desc`. */
export const SortExpr = z.string().regex(/^[A-Za-z][A-Za-z0-9]*:(asc|desc)$/, 'Expected "field:asc" or "field:desc"');

/**
 * Paging / sort / search shared by every list endpoint.
 * Numbers are coerced so the same schema parses typed client input and URL search params.
 */
export const ListQuery = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: SortExpr.optional(),
  q: z.string().trim().max(200).optional(),
});
export type ListQuery = z.output<typeof ListQuery>;
export type ListQueryInput = z.input<typeof ListQuery>;

export const Page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(0),
    pageSize: z.number().int().min(1),
  });
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export type SortDirection = 'asc' | 'desc';
export function parseSort(sort: string | undefined): { field: string; direction: SortDirection } | undefined {
  if (!sort) return undefined;
  const [field, direction] = sort.split(':');
  if (!field || (direction !== 'asc' && direction !== 'desc')) return undefined;
  return { field, direction };
}
