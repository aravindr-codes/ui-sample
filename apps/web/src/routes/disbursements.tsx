import { DisbursementStatus, ProgramId } from '@ifcui/api-contract';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DataTable } from '../components/DataTable';
import { disbursementColumns } from '../components/disbursementColumns';
import { PageHeader } from '../components/PageHeader';
import { statusLabel } from '../components/StatusChip';
import { disbursementQueries, programQueries } from '../queries';
import { useApproveDisbursement } from '../queries/mutations';
import { compact, disbursementGridSearch, GRID_DEFAULTS } from '../queries/search';

export const Route = createFileRoute('/disbursements')({
  validateSearch: disbursementGridSearch,
  search: { middlewares: [stripSearchParams(GRID_DEFAULTS)] },
  loaderDeps: ({ search }) => compact(search),
  loader: async ({ context: { queryClient, api }, deps }) => {
    await Promise.all([
      queryClient.ensureQueryData(programQueries.list(api)),
      queryClient.ensureQueryData(disbursementQueries.list(api, deps)),
    ]);
  },
  component: DisbursementsPage,
});

function DisbursementsPage() {
  const { api, config } = Route.useRouteContext();
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const { data: programs } = useSuspenseQuery(programQueries.list(api));
  const { data } = useSuspenseQuery(disbursementQueries.list(api, deps));
  const approve = useApproveDisbursement();
  const canApprove = config.features.disbursementApproval;

  const programCodes = useMemo(() => new Map<string, string>(programs.items.map((p) => [p.id, p.code])), [programs]);
  const columns = useMemo(
    () => disbursementColumns({ programCodes, canApprove, approve, showBeneficiary: true }),
    [programCodes, canApprove, approve],
  );
  const programName = programs.items.find((p) => p.id === search.programId)?.name;

  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => compact({ ...prev, ...patch }), replace: true });

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Payments"
        title="Disbursements"
        subtitle="Every disbursement across programs. Pending items need approval before payment."
      />
      <DataTable
        title="Disbursements"
        columns={columns}
        data={data}
        state={search}
        onStateChange={update}
        searchLabel="Search beneficiary name or ID"
        fetchPage={(page, pageSize) => api.disbursements.list({ ...deps, page, pageSize })}
        exportDescription={[
          ...(programName ? [`Program: ${programName}`] : ['All programs']),
          ...(search.status ? [`Status: ${statusLabel(search.status)}`] : []),
        ]}
        filters={
          <>
            <TextField
              select
              size="small"
              label="Program"
              value={search.programId ?? ''}
              onChange={(e) => {
                const parsed = ProgramId.safeParse(e.target.value);
                update({ programId: parsed.success ? parsed.data : undefined, page: 0 });
              }}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">All programs</MenuItem>
              {programs.items.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Status"
              value={search.status ?? ''}
              onChange={(e) => {
                const parsed = DisbursementStatus.safeParse(e.target.value);
                update({ status: parsed.success ? parsed.data : undefined, page: 0 });
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All statuses</MenuItem>
              {DisbursementStatus.options.map((s) => (
                <MenuItem key={s} value={s}>
                  {statusLabel(s)}
                </MenuItem>
              ))}
            </TextField>
          </>
        }
      />
    </Stack>
  );
}
