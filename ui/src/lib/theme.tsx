import { useCallback, useEffect, useState } from 'react'
import { type Theme, ThemeContext } from './theme-context'

// must match the pre-paint script in index.html
const STORAGE_KEY = 'gv:theme'

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // storage blocked
  }
  return 'system'
}

function apply(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  const el = document.documentElement
  el.classList.toggle('dark', dark)
  el.style.colorScheme = dark ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => apply('system')
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // storage unavailable, the choice lasts this session
    }
    setThemeState(next)
    apply(next)
  }, [])

  const toggle = useCallback(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'light' : 'dark')
  }, [setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}
