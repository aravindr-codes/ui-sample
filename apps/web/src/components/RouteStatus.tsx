import { ApiError } from '@ifcui/api-contract';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { type ErrorComponentProps, notFound, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { describeError } from '../api/errors';
import { ButtonLink } from './links';

/** Per-route error UI. Retry resets the query error boundary and re-runs the route loaders. */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const queryErrorReset = useQueryErrorResetBoundary();
  const { title, message, retryable } = describeError(error);

  useEffect(() => {
    queryErrorReset.reset();
  }, [queryErrorReset]);

  return (
    <Box role="alert" sx={{ py: 4 }}>
      <Alert
        severity="error"
        action={
          <Stack direction="row" spacing={1}>
            {retryable ? (
              <Button color="inherit" size="small" onClick={() => void router.invalidate()}>
                Retry
              </Button>
            ) : null}
            <ButtonLink to="/" color="inherit" size="small">
              Dashboard
            </ButtonLink>
          </Stack>
        }
      >
        <AlertTitle>{title}</AlertTitle>
        {message}
      </Alert>
    </Box>
  );
}

export function RoutePending() {
  return (
    <Stack spacing={2} sx={{ py: 2 }} aria-busy="true" aria-label="Loading">
      <LinearProgress />
      <Skeleton variant="text" width="40%" height={40} />
      <Skeleton variant="rounded" height={320} />
    </Stack>
  );
}

/** Full-page loading state while the app shell's own data loads for the first time. */
export function AppPending() {
  return (
    <Stack
      role="status"
      aria-live="polite"
      spacing={2}
      sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}
    >
      <CircularProgress aria-hidden />
      <Typography color="text.secondary">Loading Disbursement Console…</Typography>
    </Stack>
  );
}

export function NotFound() {
  return (
    <Stack spacing={2} sx={{ py: 6, alignItems: 'flex-start' }}>
      <Typography variant="h1">Not found</Typography>
      <Typography color="text.secondary">The page or record you are looking for does not exist.</Typography>
      <ButtonLink to="/" variant="contained">
        Go to dashboard
      </ButtonLink>
    </Stack>
  );
}

/** Loader helper: turns ApiError(not_found) into the router's notFound() so the route renders its 404 UI. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') throw notFound();
    throw error;
  }
}
