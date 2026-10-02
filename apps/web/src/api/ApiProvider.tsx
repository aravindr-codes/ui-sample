import type { ApiClient } from '@ifcui/api-contract';
import { createContext, type ReactNode, useContext } from 'react';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

/** IRP01: the only way UI code reaches the API. */
export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi() must be used inside <ApiProvider>');
  return client;
}
