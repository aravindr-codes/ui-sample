import { useSuspenseQuery } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { AppShell } from '../components/AppShell';
import { AppPending } from '../components/RouteStatus';
import { programQueries } from '../queries';
import type { RouterContext } from '../router';

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: ({ context: { queryClient, api } }) => queryClient.ensureQueryData(programQueries.list(api)),
  pendingComponent: AppPending,
  pendingMs: 150,
  component: Root,
});

function Root() {
  const { api } = Route.useRouteContext();
  const { data } = useSuspenseQuery(programQueries.list(api));
  return (
    <AppShell programs={data.items}>
      <Outlet />
    </AppShell>
  );
}
