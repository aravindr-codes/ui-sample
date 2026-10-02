import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** Consistent page heading: optional breadcrumb, eyebrow, title, supporting text and actions. */
export function PageHeader({
  breadcrumbs,
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  breadcrumbs?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Stack spacing={1.5} sx={{ mb: 1 }}>
      {breadcrumbs}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' }, justifyContent: 'space-between' }}
      >
        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          {eyebrow ? (
            <Typography variant="overline" color="primary" component="p">
              {eyebrow}
            </Typography>
          ) : null}
          <Typography variant="h1">{title}</Typography>
          {subtitle ? (
            <Typography color="text.secondary" component="div">
              {subtitle}
            </Typography>
          ) : null}
        </Stack>
        {actions ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
