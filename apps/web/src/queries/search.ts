import {
  BENEFICIARY_SORT_FIELDS,
  BeneficiaryStatus,
  DISBURSEMENT_SORT_FIELDS,
  DisbursementStatus,
  ProgramId,
  parseSort,
} from '@ifcui/api-contract';
import type { GridPaginationModel, GridSortModel } from '@mui/x-data-grid';
import { useMemo } from 'react';
import { z } from 'zod';

/** Page sizes offered by the grids (MUI X free tier caps pageSize at 100). */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * URL search-param schemas. Malformed values fall back to defaults instead of erroring,
 * so a hand-edited or stale link still opens the screen.
 */
const page = z.number().int().min(0).max(100_000).default(0).catch(0);
const pageSize = z
  .number()
  .int()
  .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
  .default(DEFAULT_PAGE_SIZE)
  .catch(DEFAULT_PAGE_SIZE);
const text = z.string().trim().max(200).optional().catch(undefined);

const sortOf = (fields: readonly string[]) =>
  z
    .string()
    .refine((s) => {
      const parsed = parseSort(s);
      return parsed !== undefined && fields.includes(parsed.field);
    })
    .optional()
    .catch(undefined);

export const beneficiaryGridSearch = z.object({
  page,
  pageSize,
  sort: sortOf(BENEFICIARY_SORT_FIELDS),
  q: text,
  status: BeneficiaryStatus.optional().catch(undefined),
});
export type BeneficiaryGridSearch = z.output<typeof beneficiaryGridSearch>;

export const disbursementGridSearch = z.object({
  page,
  pageSize,
  sort: sortOf(DISBURSEMENT_SORT_FIELDS),
  q: text,
  status: DisbursementStatus.optional().catch(undefined),
  programId: ProgramId.optional().catch(undefined),
});
export type DisbursementGridSearch = z.output<typeof disbursementGridSearch>;

export const historyGridSearch = z.object({
  page,
  pageSize,
  sort: sortOf(DISBURSEMENT_SORT_FIELDS),
});
export type HistoryGridSearch = z.output<typeof historyGridSearch>;

export const newBeneficiarySearch = z.object({
  programId: ProgramId.optional().catch(undefined),
});

export const GRID_DEFAULTS = { page: 0, pageSize: DEFAULT_PAGE_SIZE } as const;

/** Removes empty strings so they do not end up in the URL or the API query. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as T;
}

export function toSortModel(sort: string | undefined): GridSortModel {
  const parsed = parseSort(sort);
  return parsed ? [{ field: parsed.field, sort: parsed.direction }] : [];
}

export function fromSortModel(model: GridSortModel): string | undefined {
  const first = model[0];
  return first?.sort ? `${first.field}:${first.sort}` : undefined;
}

export function toPaginationModel(search: { page: number; pageSize: number }): GridPaginationModel {
  return { page: search.page, pageSize: search.pageSize };
}

/**
 * Wires a server-mode DataGrid to URL search state. Callbacks only navigate on a real change:
 * the grid can re-emit an unchanged sort/pagination model (e.g. when rows are replaced), and
 * treating that as a change would reset the page to 0.
 */
export function useGridUrlState<S extends { page: number; pageSize: number; sort?: string | undefined }>(
  search: S,
  update: (patch: Partial<S>) => void,
) {
  const { page, pageSize } = search;
  const paginationModel = useMemo(() => toPaginationModel({ page, pageSize }), [page, pageSize]);
  const sortModel = useMemo(() => toSortModel(search.sort), [search.sort]);
  return {
    paginationModel,
    sortModel,
    onPaginationModelChange: (m: GridPaginationModel) => {
      if (m.page === search.page && m.pageSize === search.pageSize) return;
      update({ page: m.pageSize === search.pageSize ? m.page : 0, pageSize: m.pageSize } as Partial<S>);
    },
    onSortModelChange: (m: GridSortModel) => {
      const sort = fromSortModel(m);
      if (sort === search.sort) return;
      update({ sort, page: 0 } as Partial<S>);
    },
  };
}
