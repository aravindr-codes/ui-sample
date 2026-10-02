import { type Beneficiary, BeneficiaryStatus, ProgramId } from '@ifcui/api-contract';
import PersonAddAlt from '@mui/icons-material/PersonAddAlt';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, stripSearchParams } from '@tanstack/react-router';
import { DataTable, type DataTableColumn } from '../../../components/DataTable';
import { formatDateTime } from '../../../components/format';
import { ButtonLink, RouterLink } from '../../../components/links';
import { PageHeader } from '../../../components/PageHeader';
import { orNotFound } from '../../../components/RouteStatus';
import { StatusChip, statusLabel } from '../../../components/StatusChip';
import { beneficiaryQueries, programQueries } from '../../../queries';
import { beneficiaryGridSearch, compact, GRID_DEFAULTS } from '../../../queries/search';

export const Route = createFileRoute('/programs/$programId/beneficiaries')({
  params: {
    parse: ({ programId }) => {
      const parsed = ProgramId.safeParse(programId);
      if (!parsed.success) throw notFound();
      return { programId: parsed.data };
    },
    stringify: ({ programId }) => ({ programId }),
  },
  validateSearch: beneficiaryGridSearch,
  search: { middlewares: [stripSearchParams(GRID_DEFAULTS)] },
  loaderDeps: ({ search }) => compact(search),
  loader: async ({ context: { queryClient, api }, params: { programId }, deps }) => {
    await orNotFound(queryClient.ensureQueryData(programQueries.detail(api, programId)));
    await queryClient.ensureQueryData(beneficiaryQueries.list(api, programId, deps));
  },
  component: BeneficiariesPage,
});

const columns: DataTableColumn<Beneficiary>[] = [
  {
    field: 'displayName',
    headerName: 'Name',
    flex: 2,
    minWidth: 200,
    renderCell: ({ row }) => (
      <RouterLink
        to="/beneficiaries/$beneficiaryId"
        params={{ beneficiaryId: row.id }}
        search={{}}
        underline="hover"
        sx={{ fontWeight: 600 }}
      >
        {row.displayName}
      </RouterLink>
    ),
  },
  { field: 'country', headerName: 'Country', width: 120 },
  {
    field: 'status',
    headerName: 'Status',
    width: 150,
    renderCell: ({ row }) => <StatusChip status={row.status} />,
    export: { pdf: (row) => statusLabel(row.status) },
  },
  {
    field: 'createdAt',
    headerName: 'Registered',
    flex: 1,
    minWidth: 190,
    valueFormatter: (value: string) => formatDateTime(value),
    export: { pdf: (row) => formatDateTime(row.createdAt) },
  },
  { field: 'id', headerName: 'ID', width: 300, sortable: false },
];

function BeneficiariesPage() {
  const { api } = Route.useRouteContext();
  const { programId } = Route.useParams();
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const { data: program } = useSuspenseQuery(programQueries.detail(api, programId));
  const { data } = useSuspenseQuery(beneficiaryQueries.list(api, programId, deps));

  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => compact({ ...prev, ...patch }), replace: true });

  return (
    <Stack spacing={3}>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs aria-label="Breadcrumb">
            <RouterLink to="/">Dashboard</RouterLink>
            <Typography color="text.primary">{program.name}</Typography>
          </Breadcrumbs>
        }
        eyebrow={`${program.code} · ${program.currency}`}
        title="Beneficiaries"
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <span>{program.name}</span>
            <StatusChip status={program.status} />
          </Stack>
        }
        actions={
          program.status === 'active' ? (
            <ButtonLink to="/beneficiaries/new" search={{ programId }} variant="contained" startIcon={<PersonAddAlt />}>
              New beneficiary
            </ButtonLink>
          ) : null
        }
      />
      <DataTable
        title={`Beneficiaries — ${program.name}`}
        columns={columns}
        data={data}
        state={search}
        onStateChange={update}
        searchLabel="Search name, country or ID"
        fetchPage={(page, pageSize) => api.beneficiaries.list(programId, { ...deps, page, pageSize })}
        exportDescription={[
          `Program: ${program.name} (${program.code})`,
          ...(search.status ? [`Status: ${statusLabel(search.status)}`] : []),
        ]}
        filters={
          <TextField
            select
            size="small"
            label="Status"
            value={search.status ?? ''}
            onChange={(e) => {
              const parsed = BeneficiaryStatus.safeParse(e.target.value);
              update({ status: parsed.success ? parsed.data : undefined, page: 0 });
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {BeneficiaryStatus.options.map((s) => (
              <MenuItem key={s} value={s}>
                {statusLabel(s)}
              </MenuItem>
            ))}
          </TextField>
        }
      />
    </Stack>
  );
}
