import { useCallback, useState } from 'react'
import { readJSON, writeJSON } from '@/lib/use-persisted-state'

export function useViewed(repo: string, viewKey: string) {
  const key = `gv:viewed:${repo}:${viewKey}`
  const [state, setState] = useState(() => ({
    key,
    set: new Set(readJSON<string[]>(key, [])),
  }))
  const viewed =
    state.key === key ? state.set : new Set(readJSON<string[]>(key, []))
  if (state.key !== key) setState({ key, set: viewed })

  const toggleViewed = useCallback(
    (path: string) => {
      setState((prev) => {
        const next = new Set(prev.set)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        if (next.size === 0) {
          try {
            localStorage.removeItem(key)
          } catch {
            // storage unavailable
          }
        } else {
          writeJSON(key, [...next])
        }
        return { key, set: next }
      })
    },
    [key],
  )
  return { viewed, toggleViewed }
}
