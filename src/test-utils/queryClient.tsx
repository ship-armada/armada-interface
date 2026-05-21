// ABOUTME: Shared test helper — wraps children in a QueryClientProvider with sensible test defaults (no retries, no cache reuse across tests).
// ABOUTME: Lifts the QueryClient setup out of every modal test that mounts a hook calling useQuery (today: useFees consumers).

import type { ReactElement, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Render a fresh QueryClient per call so tests don't share query cache. Retries are disabled so
 * failing queryFn calls surface immediately in tests rather than triggering RQ's exponential
 * retry schedule and timing out the test.
 */
export function withTestQueryClient(children: ReactNode): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
