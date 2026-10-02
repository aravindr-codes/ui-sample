import type { BeneficiaryStatus, DisbursementStatus } from '@ifcui/api-contract';
import Box from '@mui/material/Box';

type Status = BeneficiaryStatus | DisbursementStatus | 'active' | 'closed';
type Tone = 'success' | 'warning' | 'error' | 'primary' | 'neutral';

const TONES: Record<Status, Tone> = {
  pending: 'warning',
  verified: 'success',
  suspended: 'error',
  approved: 'success',
  active: 'primary',
  closed: 'neutral',
};

const LABELS: Record<Status, string> = {
  pending: 'Pending',
  verified: 'Verified',
  suspended: 'Suspended',
  approved: 'Approved',
  active: 'Active',
  closed: 'Closed',
};

export function statusLabel(status: Status): string {
  return LABELS[status];
}

/** Tonal status badge: tinted background, colored dot and text. */
export function StatusChip({ status, size = 'small' }: { status: Status; size?: 'small' | 'medium' }) {
  const tone = TONES[status];
  return (
    <Box
      component="span"
      className="MuiChip-root"
      sx={(theme) => {
        const { palette } = theme.vars ?? theme;
        const base = tone === 'neutral' ? palette.text.secondary : palette[tone].main;
        const text = tone === 'neutral' ? palette.text.secondary : palette[tone].dark;
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: size === 'small' ? 1.25 : 1.5,
          py: size === 'small' ? 0.25 : 0.5,
          borderRadius: 999,
          fontSize: size === 'small' ? '0.75rem' : '0.8125rem',
          fontWeight: 700,
          lineHeight: 1.6,
          whiteSpace: 'nowrap',
          color: text,
          bgcolor: `color-mix(in srgb, ${base} 12%, transparent)`,
          ...theme.applyStyles('dark', {
            color: tone === 'neutral' ? palette.text.secondary : palette[tone].light,
            bgcolor: `color-mix(in srgb, ${base} 22%, transparent)`,
          }),
          '&::before': { content: '""', width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' },
        };
      }}
    >
      <span className="MuiChip-label">{LABELS[status]}</span>
    </Box>
  );
}
