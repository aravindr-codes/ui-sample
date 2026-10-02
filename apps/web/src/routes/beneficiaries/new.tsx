import Breadcrumbs from '@mui/material/Breadcrumbs';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { BeneficiaryForm } from '../../components/BeneficiaryForm';
import { RouterLink } from '../../components/links';
import { useNotify } from '../../components/Notifier';
import { PageHeader } from '../../components/PageHeader';
import { programQueries } from '../../queries';
import { useCreateBeneficiary } from '../../queries/mutations';
import { newBeneficiarySearch } from '../../queries/search';

export const Route = createFileRoute('/beneficiaries/new')({
  validateSearch: newBeneficiarySearch,
  loader: ({ context: { queryClient, api } }) => queryClient.ensureQueryData(programQueries.list(api)),
  component: NewBeneficiaryPage,
});

function NewBeneficiaryPage() {
  const { api } = Route.useRouteContext();
  const { programId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const notify = useNotify();
  const { data: programs } = useSuspenseQuery(programQueries.list(api));
  const create = useCreateBeneficiary();

  return (
    <Stack spacing={3}>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs aria-label="Breadcrumb">
            <RouterLink to="/">Dashboard</RouterLink>
            <Typography color="text.primary">New beneficiary</Typography>
          </Breadcrumbs>
        }
        eyebrow="Registration"
        title="New beneficiary"
        subtitle="New beneficiaries start as pending and must be verified before they can receive disbursements."
      />
      <Card sx={{ p: { xs: 2, md: 4 } }}>
        <BeneficiaryForm
          programs={programs.items}
          defaultProgramId={programId}
          onCancel={() => router.history.back()}
          onSubmit={async (values) => {
            const created = await create.mutateAsync(values);
            notify(`${created.displayName} was registered and is pending verification.`, 'success');
            await navigate({ to: '/beneficiaries/$beneficiaryId', params: { beneficiaryId: created.id }, search: {} });
          }}
        />
      </Card>
    </Stack>
  );
}
