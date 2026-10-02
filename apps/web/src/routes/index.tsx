import type { Program, ProgramStats } from '@ifcui/api-contract';
import ArrowForward from '@mui/icons-material/ArrowForward';
import HourglassEmptyOutlined from '@mui/icons-material/HourglassEmptyOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { formatCount, formatMoney } from '../components/format';
import { ButtonLink } from '../components/links';
import { StatusChip } from '../components/StatusChip';
import { programQueries } from '../queries';
import { tokens } from '../theme/theme';

export const Route = createFileRoute('/')({
  loader: async ({ context: { queryClient, api } }) => {
    const programs = await queryClient.ensureQueryData(programQueries.list(api));
    await Promise.all(programs.items.map((p) => queryClient.ensureQueryData(programQueries.stats(api, p.id))));
  },
  component: Dashboard,
});

function HeroKpi({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <Box
      sx={{
        p: 2.5,
        height: '100%',
        borderRadius: '16px',
        bgcolor: alpha('#fff', 0.08),
        border: `1px solid ${alpha('#fff', 0.12)}`,
        backdropFilter: 'blur(6px)',
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 36,
            height: 36,
            borderRadius: '10px',
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(tokens.brandBlue, 0.25),
            color: tokens.blue30,
          }}
        >
          {icon}
        </Box>
        <Typography variant="overline" component="p" sx={{ color: alpha('#fff', 0.75) }}>
          {label}
        </Typography>
      </Stack>
      <Typography
        component="p"
        sx={{ fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}
      >
        {value}
      </Typography>
      <Typography variant="body2" sx={{ color: alpha('#fff', 0.65), mt: 0.5 }}>
        {hint}
      </Typography>
    </Box>
  );
}

const SEGMENTS = [
  { key: 'verified', label: 'Verified', color: 'success.main' },
  { key: 'pending', label: 'Pending', color: 'warning.main' },
  { key: 'suspended', label: 'Suspended', color: 'error.main' },
] as const;

function DistributionBar({ stats }: { stats: ProgramStats }) {
  const total = SEGMENTS.reduce((sum, s) => sum + stats.beneficiaries[s.key], 0);
  return (
    <Stack spacing={1}>
      <Box
        role="img"
        aria-label={SEGMENTS.map((s) => `${s.label} ${stats.beneficiaries[s.key]}`).join(', ')}
        sx={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', bgcolor: 'divider', gap: '2px' }}
      >
        {total > 0
          ? SEGMENTS.map((s) => (
              <Box
                key={s.key}
                sx={{
                  flexGrow: stats.beneficiaries[s.key],
                  bgcolor: s.color,
                  minWidth: stats.beneficiaries[s.key] ? 4 : 0,
                }}
              />
            ))
          : null}
      </Box>
      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        {SEGMENTS.map((s) => (
          <Stack key={s.key} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
            <Typography variant="caption" color="text.secondary">
              {s.label}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {formatCount(stats.beneficiaries[s.key])}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function ProgramCard({ program, stats }: { program: Program; stats: ProgramStats }) {
  const total = stats.beneficiaries.pending + stats.beneficiaries.verified + stats.beneficiaries.suspended;
  return (
    <Card
      component="section"
      aria-labelledby={`program-${program.id}`}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 3,
        gap: 2.5,
        transition: 'transform 160ms ease, box-shadow 160ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 1px 2px ${alpha(tokens.blue90, 0.04)}, 0 16px 32px -16px ${alpha(tokens.blue90, 0.24)}`,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Box
          aria-hidden
          sx={(t) => ({
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 13,
            color: tokens.blue70,
            bgcolor: tokens.blue10,
            ...t.applyStyles('dark', { color: tokens.blue30, bgcolor: alpha(tokens.blue40, 0.16) }),
          })}
        >
          {program.code.split('-')[0]}
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography id={`program-${program.id}`} variant="h3" component="h2">
            {program.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {program.code} · {program.currency}
          </Typography>
        </Box>
        <StatusChip status={program.status} />
      </Stack>

      <Box>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
          <Typography variant="overline" color="text.secondary">
            Beneficiaries
          </Typography>
          <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCount(total)}</Typography>
        </Stack>
        <DistributionBar stats={stats} />
      </Box>

      <Box
        sx={(t) => ({
          p: 2,
          borderRadius: '12px',
          bgcolor: tokens.neutral05,
          ...t.applyStyles('dark', { bgcolor: alpha('#fff', 0.04) }),
        })}
      >
        <Typography variant="overline" color="text.secondary" component="p">
          Approved to date
        </Typography>
        <Typography
          component="p"
          color="primary.dark"
          sx={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}
        >
          {formatMoney(stats.approvedAmountMinor, program.currency)}
        </Typography>
        <Tooltip title="Disbursements waiting for approval">
          <Typography variant="body2" color="text.secondary" sx={{ display: 'inline-block' }}>
            {formatCount(stats.disbursements.approved)} approved · {formatCount(stats.disbursements.pending)} awaiting
            approval
          </Typography>
        </Tooltip>
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
        <ButtonLink
          to="/programs/$programId/beneficiaries"
          params={{ programId: program.id }}
          search={{}}
          size="small"
          variant="contained"
          endIcon={<ArrowForward />}
        >
          Beneficiaries
        </ButtonLink>
        <ButtonLink to="/disbursements" search={{ programId: program.id }} size="small" variant="outlined">
          Disbursements
        </ButtonLink>
      </Stack>
    </Card>
  );
}

function Dashboard() {
  const { api } = Route.useRouteContext();
  const { data: programs } = useSuspenseQuery(programQueries.list(api));
  const stats = useSuspenseQueries({
    queries: programs.items.map((p) => programQueries.stats(api, p.id)),
    combine: (results) => results.map((r) => r.data),
  });

  const totals = stats.reduce(
    (acc, s) => ({
      beneficiaries: acc.beneficiaries + s.beneficiaries.pending + s.beneficiaries.verified + s.beneficiaries.suspended,
      pendingVerification: acc.pendingVerification + s.beneficiaries.pending,
      awaitingApproval: acc.awaitingApproval + s.disbursements.pending,
    }),
    { beneficiaries: 0, pendingVerification: 0, awaitingApproval: 0 },
  );
  const activePrograms = programs.items.filter((p) => p.status === 'active').length;

  return (
    <Stack spacing={4}>
      <Box
        component="section"
        aria-labelledby="overview-title"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '24px',
          p: { xs: 3, md: 4 },
          color: '#fff',
          background: `radial-gradient(120% 140% at 100% 0%, ${alpha(tokens.brandBlue, 0.45)} 0%, transparent 55%), linear-gradient(135deg, ${tokens.blue70} 0%, ${tokens.blue90} 60%, ${tokens.blue120} 100%)`,
        }}
      >
        <Typography variant="overline" component="p" sx={{ color: tokens.blue30 }}>
          Portfolio overview
        </Typography>
        <Typography id="overview-title" variant="h1" sx={{ color: '#fff !important', mb: 1 }}>
          Dashboard
        </Typography>
        <Typography sx={{ color: alpha('#fff', 0.75), mb: 3, maxWidth: 640 }}>
          {activePrograms} active of {programs.items.length} programs. Verify pending beneficiaries and approve queued
          disbursements to keep payments flowing.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <HeroKpi
              icon={<PeopleOutlined fontSize="small" />}
              label="Beneficiaries"
              value={formatCount(totals.beneficiaries)}
              hint="Registered across all programs"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <HeroKpi
              icon={<HourglassEmptyOutlined fontSize="small" />}
              label="Pending verification"
              value={formatCount(totals.pendingVerification)}
              hint="Need identity verification"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <HeroKpi
              icon={<PaymentsOutlined fontSize="small" />}
              label="Awaiting approval"
              value={formatCount(totals.awaitingApproval)}
              hint="Disbursements in the queue"
            />
          </Grid>
        </Grid>
      </Box>

      <Stack spacing={2}>
        <Typography variant="h2">Programs</Typography>
        <Grid container spacing={3}>
          {programs.items.map((program, i) => {
            const s = stats[i];
            return s ? (
              <Grid key={program.id} size={{ xs: 12, md: 6, xl: 4 }}>
                <ProgramCard program={program} stats={s} />
              </Grid>
            ) : null;
          })}
        </Grid>
      </Stack>
    </Stack>
  );
}
