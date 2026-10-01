import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { KeyboardHelp } from '@/features/shell/keyboard-help'
import { Progress } from '@/features/shell/progress'
import { ErrorState } from '@/features/shell/states'
import { NOT_FOUND_TITLE } from '@/lib/title'
import { useTitle } from '@/lib/use-title'

export type RouterContext = { queryClient: QueryClient }

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  notFoundComponent: NotFound,
})

function NotFound() {
  useTitle(NOT_FOUND_TITLE)
  return <ErrorState error={new Error('No page lives at this address.')} />
}

function Root() {
  return (
    <>
      <Progress />
      <Outlet />
      <KeyboardHelp />
    </>
  )
}
