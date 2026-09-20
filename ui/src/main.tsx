import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/tooltip'
import { ThemeProvider } from '@/lib/theme'
import { routeTree } from './routeTree.gen'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // commit-addressed data is immutable
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) =>
        count < 2 && !(err instanceof Error && 'status' in err),
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: false,
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 150,
  defaultPendingMinMs: 0,
  scrollRestoration: true,
  pathParamsAllowedCharacters: ['@'],
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const el = document.getElementById('app')
if (el) {
  createRoot(el).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
