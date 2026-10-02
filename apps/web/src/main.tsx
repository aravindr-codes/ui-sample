import '@fontsource-variable/open-sans';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiProvider } from './api/ApiProvider';
import { createApiClient } from './api/createApiClient';
import { LiveEventsProvider } from './components/LiveEvents';
import { NotifierProvider } from './components/Notifier';
import { loadRuntimeConfig, RuntimeConfigError } from './config/runtimeConfig';
import { createAppRouter, createQueryClient } from './router';
import { theme } from './theme/theme';

function StartupError({ title, problems }: { title: string; problems: string[] }) {
  return (
    <Box sx={{ p: 4, maxWidth: 720, mx: 'auto' }}>
      <Alert severity="error" role="alert">
        <AlertTitle>{title}</AlertTitle>
        {problems.length ? (
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </Box>
        ) : (
          'The application could not start.'
        )}
      </Alert>
    </Box>
  );
}

/** IRP04: load config.json → start MSW if configured → build the API client → render. */
async function bootstrap() {
  const container = document.getElementById('root');
  if (!container) throw new Error('#root element missing');
  const root = createRoot(container);
  let stopMocks: (() => void) | undefined;

  // Dev only: when Vite re-executes this module, tear down the previous app instance first.
  // Otherwise the page ends up with two React roots and a second MSW worker, and API calls escape to the dev server.
  import.meta.hot?.dispose(() => {
    stopMocks?.();
    root.unmount();
  });

  const render = (node: React.ReactNode) =>
    root.render(
      <StrictMode>
        <ThemeProvider theme={theme} defaultMode="system">
          <CssBaseline />
          {node}
        </ThemeProvider>
      </StrictMode>,
    );

  try {
    const config = await loadRuntimeConfig();
    if (config.apiMode === 'msw') {
      const { startMockWorker } = await import('./api/mock/browser');
      const mocks = await startMockWorker(config);
      stopMocks = () => mocks.stop();
    }
    const api = await createApiClient(config);
    const queryClient = createQueryClient();
    const router = createAppRouter({ queryClient, api, config });

    render(
      <QueryClientProvider client={queryClient}>
        <ApiProvider client={api}>
          <NotifierProvider>
            <LiveEventsProvider>
              <RouterProvider router={router} />
            </LiveEventsProvider>
          </NotifierProvider>
        </ApiProvider>
      </QueryClientProvider>,
    );
  } catch (error) {
    console.error(error);
    if (error instanceof RuntimeConfigError) render(<StartupError title={error.message} problems={error.problems} />);
    else render(<StartupError title="The application failed to start" problems={[String(error)]} />);
  }
}

void bootstrap();
