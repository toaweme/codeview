import { describe, expect, test } from 'vitest'
import {
  detectPlatform,
  firesWhileTyping,
  formatChord,
  type KeyDef,
  type KeyEventLike,
  matchChord,
  type Platform,
  parseChord,
} from './keymap'

const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
  key: '',
  code: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
})

describe('formatChord', () => {
  const cases: [string, Platform, string[]][] = [
    ['mod+p', 'mac', ['⌘', 'P']],
    ['mod+p', 'other', ['Ctrl', 'P']],
    ['mod+shift+p', 'mac', ['⇧', '⌘', 'P']],
    ['mod+shift+p', 'other', ['Ctrl', 'Shift', 'P']],
    ['alt+shift+l', 'mac', ['⌥', '⇧', 'L']],
    ['alt+shift+l', 'other', ['Alt', 'Shift', 'L']],
    ['ctrl+g', 'mac', ['⌃', 'G']],
    ['mod+/', 'mac', ['⌘', '/']],
    ['mod+/', 'other', ['Ctrl', '/']],
    ['Escape', 'mac', ['Esc']],
    ['Escape', 'other', ['Esc']],
    ['?', 'mac', ['?']],
  ]
  for (const [chord, platform, want] of cases) {
    test(`${chord} on ${platform}`, () =>
      expect(formatChord(chord, platform)).toEqual(want))
  }
})

describe('detectPlatform', () => {
  test('mac', () =>
    expect(detectPlatform({ platform: 'MacIntel' })).toBe('mac'))
  test('linux', () =>
    expect(detectPlatform({ platform: 'Linux x86_64' })).toBe('other'))
  test('none', () => expect(detectPlatform(undefined)).toBe('other'))
})

describe('matchChord', () => {
  const cases: {
    name: string
    chord: string
    platform: Platform
    e: KeyEventLike
    want: boolean
  }[] = [
    {
      name: 'mod is meta on mac',
      chord: 'mod+p',
      platform: 'mac',
      e: ev({ key: 'p', code: 'KeyP', metaKey: true }),
      want: true,
    },
    {
      name: 'mod is ctrl elsewhere',
      chord: 'mod+p',
      platform: 'other',
      e: ev({ key: 'p', code: 'KeyP', ctrlKey: true }),
      want: true,
    },
    {
      name: 'extra shift does not match',
      chord: 'mod+p',
      platform: 'mac',
      e: ev({ key: 'P', code: 'KeyP', metaKey: true, shiftKey: true }),
      want: false,
    },
    {
      name: 'option letter matches by code on mac',
      chord: 'alt+shift+l',
      platform: 'mac',
      e: ev({ key: 'Ò', code: 'KeyL', altKey: true, shiftKey: true }),
      want: true,
    },
    {
      name: 'letter on another layout matches by code',
      chord: 'mod+b',
      platform: 'other',
      e: ev({ key: 'и', code: 'KeyB', ctrlKey: true }),
      want: true,
    },
    {
      name: 'bare question mark ignores shift',
      chord: '?',
      platform: 'mac',
      e: ev({ key: '?', code: 'Slash', shiftKey: true }),
      want: true,
    },
    {
      name: 'bare slash refuses a modifier',
      chord: '/',
      platform: 'mac',
      e: ev({ key: '/', code: 'Slash', metaKey: true }),
      want: false,
    },
    {
      name: 'mod slash falls back to the physical key',
      chord: 'mod+/',
      platform: 'other',
      e: ev({ key: '.', code: 'Slash', ctrlKey: true }),
      want: true,
    },
    {
      name: 'named key',
      chord: 'Escape',
      platform: 'other',
      e: ev({ key: 'Escape', code: 'Escape' }),
      want: true,
    },
    {
      name: 'named key with an extra shift',
      chord: 'Escape',
      platform: 'other',
      e: ev({ key: 'Escape', code: 'Escape', shiftKey: true }),
      want: false,
    },
  ]
  for (const c of cases) {
    test(c.name, () =>
      expect(matchChord(parseChord(c.chord, c.platform), c.e)).toBe(c.want),
    )
  }
})

describe('firesWhileTyping', () => {
  const typing: KeyDef = {
    label: 'x',
    context: 'global',
    mac: [],
    other: [],
    typing: true,
  }
  const plain: KeyDef = { ...typing, typing: false }
  const cases: [string, KeyDef, string, boolean][] = [
    ['typing chord', typing, 'mod+p', true],
    ['typing bare key', typing, '?', false],
    ['typing escape', typing, 'Escape', false],
    ['plain chord', plain, 'mod+b', false],
    ['plain bare key', plain, '/', false],
  ]
  for (const [name, def, chord, want] of cases) {
    test(name, () =>
      expect(firesWhileTyping(def, parseChord(chord, 'mac'))).toBe(want),
    )
  }
})
