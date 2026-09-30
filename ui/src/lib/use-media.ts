import { useSyncExternalStore } from 'react'

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

// below this width the sidebar leaves the layout and opens as a drawer
export const WIDE = '(min-width: 1024px)'
