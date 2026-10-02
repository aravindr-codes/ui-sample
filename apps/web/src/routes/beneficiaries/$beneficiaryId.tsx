import { BENEFICIARY_TRANSITIONS, BeneficiaryId, type BeneficiaryStatus } from '@ifcui/api-contract';
import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, stripSearchParams } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { DocumentsPanel } from '../../components/DocumentsPanel';
import { disbursementColumns } from '../../components/disbursementColumns';
import { formatDateTime } from '../../components/format';
import { RouterLink } from '../../components/links';
import { NewDisbursementDialog } from '../../components/NewDisbursementDialog';
import { PageHeader } from '../../components/PageHeader';
import { orNotFound } from '../../components/RouteStatus';
import { StatusChip } from '../../components/StatusChip';
import { beneficiaryQueries, disbursementQueries, documentQueries, programQueries } from '../../queries';
import { useApproveDisbursement, useSetBeneficiaryStatus } from '../../queries/mutations';
import { compact, GRID_DEFAULTS, historyGridSearch } from '../../queries/search';

export const Route = createFileRoute('/beneficiaries/$beneficiaryId')({
  params: {
    parse: ({ beneficiaryId }) => {
      const parsed = BeneficiaryId.safeParse(beneficiaryId);
      if (!parsed.success) throw notFound();
      return { beneficiaryId: parsed.data };
    },
    stringify: ({ beneficiaryId }) => ({ beneficiaryId }),
  },
  validateSearch: historyGridSearch,
  search: { middlewares: [stripSearchParams(GRID_DEFAULTS)] },
  loaderDeps: ({ search }) => compact(search),
  loader: async ({ context: { queryClient, api }, params: { beneficiaryId }, deps }) => {
    const beneficiary = await orNotFound(queryClient.ensureQueryData(beneficiaryQueries.detail(api, beneficiaryId)));
    await Promise.all([
      queryClient.ensureQueryData(programQueries.detail(api, beneficiary.programId)),
      queryClient.ensureQueryData(disbursementQueries.list(api, { ...deps, beneficiaryId })),
      queryClient.ensureQueryData(documentQueries.list(api, beneficiaryId)),
    ]);
  },
  component: BeneficiaryPage,
});

const ACTION_LABELS: Record<BeneficiaryStatus, string> = {
  verified: 'Verify',
  suspended: 'Suspend',
  pending: 'Reset to pending',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="overline" color="text.secondary" component="p">
        {label}
      </Typography>
      <Typography variant="body1" component="div" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </Stack>
  );
}

function BeneficiaryPage() {
  const { api, config } = Route.useRouteContext();
  const { beneficiaryId } = Route.useParams();
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: beneficiary } = useSuspenseQuery(beneficiaryQueries.detail(api, beneficiaryId));
  const { data: program } = useSuspenseQuery(programQueries.detail(api, beneficiary.programId));
  const { data: history } = useSuspenseQuery(disbursementQueries.list(api, { ...deps, beneficiaryId }));

  const setStatus = useSetBeneficiaryStatus();
  const approve = useApproveDisbursement();
  const canApprove = config.features.disbursementApproval;
  const canPay = beneficiary.status === 'verified' && program.status === 'active';
  const columns = useMemo(
    () => disbursementColumns({ canApprove, approve, showBeneficiary: false }),
    [canApprove, approve],
  );

  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => compact({ ...prev, ...patch }), replace: true });

  return (
    <Stack spacing={3}>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs aria-label="Breadcrumb">
            <RouterLink to="/">Dashboard</RouterLink>
            <RouterLink to="/programs/$programId/beneficiaries" params={{ programId: program.id }} search={{}}>
              {program.name}
            </RouterLink>
            <Typography color="text.primary">{beneficiary.displayName}</Typography>
          </Breadcrumbs>
        }
        eyebrow="Beneficiary"
        title={beneficiary.displayName}
        subtitle={<StatusChip status={beneficiary.status} size="medium" />}
        actions={BENEFICIARY_TRANSITIONS[beneficiary.status].map((next) => (
          <Button
            key={next}
            variant={next === 'verified' ? 'contained' : 'outlined'}
            color={next === 'suspended' ? 'error' : 'primary'}
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: beneficiary.id, status: next })}
          >
            {beneficiary.status === 'suspended' && next === 'verified' ? 'Reinstate' : ACTION_LABELS[next]}
          </Button>
        ))}
      />

      <Card sx={{ p: { xs: 2, md: 3 } }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Field label="Program">
              {program.name} ({program.code})
            </Field>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Field label="Country">{beneficiary.country}</Field>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Field label="Registered">{formatDateTime(beneficiary.createdAt)}</Field>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Field label="ID">
              <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 'body2.fontSize' }}>
                {beneficiary.id}
              </Typography>
            </Field>
          </Grid>
        </Grid>
      </Card>

      <DocumentsPanel beneficiary={beneficiary} />

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <Typography variant="h2" sx={{ flexGrow: 1 }}>
            Disbursement history
          </Typography>
          <Button variant="contained" startIcon={<Add />} disabled={!canPay} onClick={() => setDialogOpen(true)}>
            New disbursement
          </Button>
        </Stack>
        {canPay ? null : (
          <Alert severity="info">
            {program.status !== 'active'
              ? 'This program is closed; no new disbursements can be created.'
              : 'Only verified beneficiaries can receive disbursements.'}
          </Alert>
        )}
        <DataTable
          title={`Disbursements — ${beneficiary.displayName}`}
          columns={columns}
          data={history}
          state={search}
          onStateChange={update}
          height={420}
          emptyMessage="No disbursements yet"
          fetchPage={(page, pageSize) => api.disbursements.list({ ...deps, beneficiaryId, page, pageSize })}
          exportDescription={[
            `Beneficiary: ${beneficiary.displayName} (${beneficiary.id})`,
            `Program: ${program.name}`,
          ]}
        />
      </Stack>

      <NewDisbursementDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        beneficiary={beneficiary}
        program={program}
      />
    </Stack>
  );
}
