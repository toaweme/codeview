import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { KeyboardHelp } from '@/features/shell/keyboard-help'
import { Progress } from '@/features/shell/progress'
import { ErrorState } from '@/features/shell/states'

export type RouterContext = { queryClient: QueryClient }

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  notFoundComponent: () => (
    <ErrorState error={new Error('No page lives at this address.')} />
  ),
})

function Root() {
  return (
    <>
      <Progress />
      <Outlet />
      <KeyboardHelp />
    </>
  )
}
