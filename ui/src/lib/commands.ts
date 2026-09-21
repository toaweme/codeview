import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { KeyId } from './keymap'

export type Command = {
  id: string
  label: string
  run: () => void
  icon?: LucideIcon
  shortcut?: KeyId
}

type Entry = { commands: { current: Command[] } }
const stack: Entry[] = []

export function useCommands(commands: Command[]) {
  const ref = useRef(commands)
  ref.current = commands
  useEffect(() => {
    const entry: Entry = { commands: ref }
    stack.push(entry)
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [])
}

export function listCommands(): Command[] {
  const seen = new Set<string>()
  const out: Command[] = []
  for (let i = stack.length - 1; i >= 0; i--) {
    for (const c of stack[i].commands.current) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      out.push(c)
    }
  }
  return out
}

const PALETTE_EVENT = 'gv:palette'
const KEYBOARD_HELP_EVENT = 'gv:keyboard-help'

export function openPalette(query = '') {
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: query }))
}

export function onPaletteOpen(fn: (query: string) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<string>).detail ?? '')
  window.addEventListener(PALETTE_EVENT, h)
  return () => window.removeEventListener(PALETTE_EVENT, h)
}

export function openKeyboardHelp() {
  window.dispatchEvent(new Event(KEYBOARD_HELP_EVENT))
}

export function onKeyboardHelpOpen(fn: () => void): () => void {
  window.addEventListener(KEYBOARD_HELP_EVENT, fn)
  return () => window.removeEventListener(KEYBOARD_HELP_EVENT, fn)
}
