import { useEffect, useRef } from 'react'

// `mod` is ⌘ on macOS and Ctrl elsewhere. letters match by `event.code`, since
// ⌥ on macOS and non-US layouts change `event.key`

export type Platform = 'mac' | 'other'

export type Context = 'global' | 'repo'

export type KeyDef = {
  label: string
  context: Context
  mac: readonly string[]
  other: readonly string[]
  // lets modifier chords fire inside a text field or dialog, bare keys never do
  typing?: boolean
  // handled by the browser or a component, listed for reference only
  native?: boolean
}

const both = (...chords: string[]) => ({ mac: chords, other: chords })

export const KEYMAP = {
  'palette.files': {
    label: 'Go to file',
    context: 'global',
    ...both('mod+p'),
    typing: true,
  },
  'palette.actions': {
    label: 'Show all actions',
    context: 'global',
    ...both('mod+shift+p', 'mod+k'),
    typing: true,
  },
  'sidebar.toggle': {
    label: 'Toggle the sidebar',
    context: 'global',
    ...both('mod+b'),
  },
  'help.open': {
    label: 'Show keyboard shortcuts',
    context: 'global',
    ...both('mod+/', '?'),
    typing: true,
  },
  'overlay.close': {
    label: 'Clear or close',
    context: 'global',
    ...both('Escape'),
    native: true,
  },
  'repo.copyPermalink': {
    label: 'Copy link to this page',
    context: 'repo',
    ...both('alt+shift+l'),
  },
} satisfies Record<string, KeyDef>

export type KeyId = keyof typeof KEYMAP

export const KEY_IDS = Object.keys(KEYMAP) as KeyId[]

export function detectPlatform(
  nav: { platform?: string; userAgent?: string } | undefined,
): Platform {
  if (!nav) return 'other'
  const s = `${nav.platform ?? ''} ${nav.userAgent ?? ''}`
  return /Mac|iPhone|iPad|iPod/.test(s) ? 'mac' : 'other'
}

export const PLATFORM: Platform = detectPlatform(
  typeof navigator === 'undefined' ? undefined : navigator,
)

export type Chord = {
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  key: string
}

export function parseChord(s: string, platform: Platform): Chord {
  const parts = s === '+' ? ['+'] : s.split('+')
  const key = parts.pop() ?? ''
  const c: Chord = { meta: false, ctrl: false, alt: false, shift: false, key }
  for (const m of parts) {
    if (m === 'mod') {
      if (platform === 'mac') c.meta = true
      else c.ctrl = true
    } else if (m === 'ctrl') c.ctrl = true
    else if (m === 'alt') c.alt = true
    else if (m === 'shift') c.shift = true
    else if (m === 'meta') c.meta = true
  }
  return c
}

// US layout fallback for when a modifier changes what the key types
const CODES: Record<string, string> = {
  '/': 'Slash',
}

export type KeyEventLike = {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export function matchChord(c: Chord, e: KeyEventLike): boolean {
  const k = c.key
  const mods =
    c.meta === e.metaKey && c.ctrl === e.ctrlKey && c.alt === e.altKey
  if (/^[a-z]$/.test(k))
    return mods && c.shift === e.shiftKey && e.code === `Key${k.toUpperCase()}`
  if (k.length === 1) {
    // a bare symbol is whatever the layout types, shifted or not
    if (!c.meta && !c.ctrl && !c.alt && !c.shift) return mods && e.key === k
    return (
      mods && c.shift === e.shiftKey && (e.key === k || e.code === CODES[k])
    )
  }
  return mods && c.shift === e.shiftKey && e.key === k
}

export function firesWhileTyping(def: KeyDef, c: Chord): boolean {
  if (!def.typing) return false
  return c.meta || c.ctrl || c.alt
}

const KEY_NAMES: Record<string, string> = { Escape: 'Esc' }

export function formatChord(s: string, platform: Platform): string[] {
  const c = parseChord(s, platform)
  const key =
    KEY_NAMES[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key)
  const mods =
    platform === 'mac'
      ? [c.ctrl && '⌃', c.alt && '⌥', c.shift && '⇧', c.meta && '⌘']
      : [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.meta && 'Meta']
  return [...mods.filter((m): m is string => Boolean(m)), key]
}

export function chordsOf(id: KeyId, platform: Platform = PLATFORM): string[][] {
  return KEYMAP[id][platform].map((s) => formatChord(s, platform))
}

type Handler = (e: KeyboardEvent) => unknown
type Handlers = Partial<Record<KeyId, Handler>>

type Entry = { handlers: { current: Handlers } }
const stack: Entry[] = []
let installed = false

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const PARSED = KEY_IDS.map((id) => ({
  id,
  def: KEYMAP[id] as KeyDef,
  chords: (KEYMAP[id] as KeyDef)[PLATFORM].map((s) => parseChord(s, PLATFORM)),
}))

function onKeyDown(e: KeyboardEvent) {
  if (e.isComposing || e.defaultPrevented) return
  if (['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) return
  const guarded =
    isTyping(e.target) || document.querySelector('[role="dialog"]') !== null
  const hits: KeyId[] = []
  for (const p of PARSED) {
    if (p.def.native) continue
    const c = p.chords.find((c) => matchChord(c, e))
    if (!c) continue
    if (guarded && !firesWhileTyping(p.def, c)) continue
    hits.push(p.id)
  }
  if (hits.length === 0) return
  // later registrations shadow earlier ones, a handler returning false passes the key on
  for (let i = stack.length - 1; i >= 0; i--) {
    for (const id of hits) {
      const run = stack[i].handlers.current[id]
      if (!run) continue
      if (run(e) === false) continue
      e.preventDefault()
      return
    }
  }
}

export function useKeys(handlers: Handlers) {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    if (!installed) {
      window.addEventListener('keydown', onKeyDown)
      installed = true
    }
    const entry: Entry = { handlers: ref }
    stack.push(entry)
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [])
}
