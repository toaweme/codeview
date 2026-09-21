import { useCallback, useEffect, useState } from 'react'

export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const storageKey = `gv:${key}`

  const [state, setState] = useState<T>(() => readJSON(storageKey, initial))

  useEffect(() => {
    writeJSON(storageKey, state)
  }, [storageKey, state])

  const set = useCallback((next: T | ((prev: T) => T)) => setState(next), [])
  return [state, set]
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable, keep the value in memory
  }
}
