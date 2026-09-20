import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { Progress } from '@/features/shell/progress'

export type RouterContext = { queryClient: QueryClient }

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
})

function Root() {
  return (
    <>
      <Progress />
      <Outlet />
    </>
  )
}
