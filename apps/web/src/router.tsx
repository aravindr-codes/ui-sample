import type { ApiClient } from '@ifcui/api-contract';
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { shouldRetry } from './api/errors';
import { NotFound, RouteError, RoutePending } from './components/RouteStatus';
import type { RuntimeConfig } from './config/runtimeConfig';
import { routeTree } from './routeTree.gen';

export interface RouterContext {
  queryClient: QueryClient;
  api: ApiClient;
  config: RuntimeConfig;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(250 * 2 ** attempt, 2_000),
      },
      mutations: { retry: false },
    },
  });
}

export function createAppRouter(context: RouterContext) {
  return createRouter({
    routeTree,
    context,
    defaultPreload: 'intent',
    // TanStack Query owns caching; the router always asks it.
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
