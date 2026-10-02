import type {
  ApiClient,
  BeneficiaryId,
  BeneficiaryListQueryInput,
  DisbursementId,
  DisbursementListQueryInput,
  ListQueryInput,
  ProgramId,
} from '@ifcui/api-contract';
import { queryOptions } from '@tanstack/react-query';

/** Query keys are hierarchical so mutations can invalidate by prefix (e.g. `['beneficiaries']`). */
export const queryKeys = {
  programs: {
    all: ['programs'] as const,
    list: (q: ListQueryInput) => ['programs', 'list', q] as const,
    detail: (id: ProgramId) => ['programs', 'detail', id] as const,
    statsAll: ['programs', 'stats'] as const,
    stats: (id: ProgramId) => ['programs', 'stats', id] as const,
  },
  beneficiaries: {
    all: ['beneficiaries'] as const,
    list: (programId: ProgramId, q: BeneficiaryListQueryInput) => ['beneficiaries', 'list', programId, q] as const,
    detail: (id: BeneficiaryId) => ['beneficiaries', 'detail', id] as const,
  },
  documents: {
    all: ['documents'] as const,
    list: (beneficiaryId: BeneficiaryId) => ['documents', 'list', beneficiaryId] as const,
  },
  disbursements: {
    all: ['disbursements'] as const,
    list: (q: DisbursementListQueryInput) => ['disbursements', 'list', q] as const,
    detail: (id: DisbursementId) => ['disbursements', 'detail', id] as const,
  },
};

/** All programs; there are few, so the navigation and filters load them in one page. */
export const ALL_PROGRAMS: ListQueryInput = { page: 0, pageSize: 200, sort: 'code:asc' };

/**
 * queryOptions factories shared by route loaders (`ensureQueryData`) and components (`useSuspenseQuery`).
 * The ApiClient is passed in (from router context or `useApi()`), never imported.
 */
export const programQueries = {
  list: (api: ApiClient, q: ListQueryInput = ALL_PROGRAMS) =>
    queryOptions({ queryKey: queryKeys.programs.list(q), queryFn: () => api.programs.list(q) }),
  detail: (api: ApiClient, id: ProgramId) =>
    queryOptions({ queryKey: queryKeys.programs.detail(id), queryFn: () => api.programs.get(id) }),
  stats: (api: ApiClient, id: ProgramId) =>
    queryOptions({ queryKey: queryKeys.programs.stats(id), queryFn: () => api.programs.stats(id) }),
};

export const beneficiaryQueries = {
  list: (api: ApiClient, programId: ProgramId, q: BeneficiaryListQueryInput) =>
    queryOptions({
      queryKey: queryKeys.beneficiaries.list(programId, q),
      queryFn: () => api.beneficiaries.list(programId, q),
    }),
  detail: (api: ApiClient, id: BeneficiaryId) =>
    queryOptions({ queryKey: queryKeys.beneficiaries.detail(id), queryFn: () => api.beneficiaries.get(id) }),
};

export const disbursementQueries = {
  list: (api: ApiClient, q: DisbursementListQueryInput) =>
    queryOptions({ queryKey: queryKeys.disbursements.list(q), queryFn: () => api.disbursements.list(q) }),
  detail: (api: ApiClient, id: DisbursementId) =>
    queryOptions({ queryKey: queryKeys.disbursements.detail(id), queryFn: () => api.disbursements.get(id) }),
};

export const documentQueries = {
  list: (api: ApiClient, beneficiaryId: BeneficiaryId) =>
    queryOptions({
      queryKey: queryKeys.documents.list(beneficiaryId),
      queryFn: () => api.documents.list(beneficiaryId),
    }),
};
