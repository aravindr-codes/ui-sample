import type {
  Beneficiary,
  BeneficiaryDocument,
  BeneficiaryId,
  BeneficiaryStatus,
  DisbursementId,
  DocumentKind,
  NewBeneficiary,
  NewDisbursement,
  UploadFile,
} from '@ifcui/api-contract';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/ApiProvider';
import { describeError } from '../api/errors';
import { useNotify } from '../components/Notifier';
import { queryKeys } from './index';

export function useCreateBeneficiary() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBeneficiary) => api.beneficiaries.create(input),
    onSuccess: async (created) => {
      queryClient.setQueryData(queryKeys.beneficiaries.detail(created.id), created);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.beneficiaries.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.statsAll }),
      ]);
    },
  });
}

/** Optimistic: the detail view flips immediately and rolls back if the server refuses. */
export function useSetBeneficiaryStatus() {
  const api = useApi();
  const queryClient = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: ({ id, status }: { id: BeneficiaryId; status: BeneficiaryStatus }) =>
      api.beneficiaries.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      const key = queryKeys.beneficiaries.detail(id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Beneficiary>(key);
      if (previous) queryClient.setQueryData<Beneficiary>(key, { ...previous, status });
      return { previous };
    },
    onError: (error, { id }, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.beneficiaries.detail(id), context.previous);
      const { title, message } = describeError(error);
      notify(`${title}: ${message} The change was undone.`, 'error');
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.beneficiaries.detail(updated.id), updated);
      notify(`${updated.displayName} is now ${updated.status}.`, 'success');
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.beneficiaries.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.statsAll }),
      ]);
    },
  });
}

export function useCreateDisbursement() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewDisbursement) => api.disbursements.create(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.disbursements.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.statsAll }),
      ]);
    },
  });
}

export function useApproveDisbursement() {
  const api = useApi();
  const queryClient = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: (id: DisbursementId) => api.disbursements.approve(id),
    onSuccess: () => notify('Disbursement approved.', 'success'),
    onError: (error) => {
      const { title, message } = describeError(error);
      notify(`${title}: ${message}`, 'error');
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.disbursements.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.statsAll }),
      ]);
    },
  });
}

export function useUploadDocument(beneficiaryId: BeneficiaryId) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      kind,
      onProgress,
      signal,
    }: {
      file: UploadFile;
      kind: DocumentKind;
      onProgress: (fraction: number) => void;
      signal: AbortSignal;
    }) => api.documents.upload(beneficiaryId, file, kind, { onProgress, signal }),
    onSuccess: (document) => {
      queryClient.setQueryData<BeneficiaryDocument[]>(queryKeys.documents.list(beneficiaryId), (current) =>
        current?.some((d) => d.id === document.id) ? current : [document, ...(current ?? [])],
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(beneficiaryId) }),
  });
}

export function useDeleteDocument(beneficiaryId: BeneficiaryId) {
  const api = useApi();
  const queryClient = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: (document: BeneficiaryDocument) => api.documents.delete(document.id),
    onSuccess: (_, document) => notify(`${document.fileName} was deleted.`, 'success'),
    onError: (error) => {
      const { title, message } = describeError(error);
      notify(`${title}: ${message}`, 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(beneficiaryId) }),
  });
}
