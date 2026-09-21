import { useRouter } from '@tanstack/react-router'
import type { LinkTarget } from '@/features/shell/top-line'

export function usePressPreload() {
  const router = useRouter()
  return (link: LinkTarget) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      void router.preloadRoute(link).catch(() => undefined)
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.matches(':focus-visible')) return
      void router.preloadRoute(link).catch(() => undefined)
    },
  })
}
