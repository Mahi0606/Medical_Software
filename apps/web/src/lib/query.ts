import { QueryClient } from '@tanstack/react-query';
/**
 * networkMode 'always': the data layer falls back to the offline copy itself, so queries and the
 * bill-post mutation must run even when the browser reports it is offline (the default would pause them).
 */
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false, networkMode: 'always' }, mutations: { networkMode: 'always' } } });
