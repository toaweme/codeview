import { useState } from 'react'
import { type NavAction, navigate } from './listbox'

export function useListNav(count: number, initial = -1) {
  const [active, setActive] = useState(initial)
  const clamped = Math.min(active, count - 1)
  const dispatch = (a: NavAction) => setActive((s) => navigate(s, a, count))
  return [clamped, dispatch] as const
}
