import { useSyncExternalStore } from 'react'
import type { FromWorker, Tok, ToWorker } from './protocol'

export type { Tok }

// past these sizes tokenizing costs more than the colour is worth
const MAX_BYTES = 3_000_000
const MAX_LINES = 150_000
const CACHE = 48

let worker: Worker | null = null
let nextId = 1
const byId = new Map<number, Highlight>()
const byKey = new Map<string, Highlight>()

function send(msg: ToWorker) {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      byId.get(e.data.id)?.receive(e.data)
    }
  }
  worker.postMessage(msg)
}

export class Highlight {
  readonly id = nextId++
  readonly lines: (Tok[] | undefined)[] = []
  plain = false
  done = false
  version = 0
  private wanted = 0
  private opened = false
  private listeners = new Set<() => void>()
  private frame = 0
  private resumeAt = 0
  private pauseTimer = 0

  constructor(
    readonly path: string,
    readonly text: string,
  ) {
    byId.set(this.id, this)
    const count = text.length === 0 ? 0 : text.split('\n', MAX_LINES + 1).length
    if (text.length > MAX_BYTES || count > MAX_LINES) {
      this.plain = true
      this.done = true
    }
  }

  // line is 0-based, exclusive
  want(line: number) {
    if (this.plain || this.done || line <= this.wanted) return
    this.wanted = line
    if (!this.opened) {
      this.opened = true
      send({
        type: 'open',
        id: this.id,
        path: this.path,
        text: this.text,
        want: line,
      })
      return
    }
    send({ type: 'want', id: this.id, want: line })
  }

  receive(msg: FromWorker) {
    switch (msg.type) {
      case 'chunk':
        for (let i = 0; i < msg.lines.length; i++) {
          this.lines[msg.start + i] = msg.lines[i]
        }
        break
      case 'done':
        this.done = true
        break
      case 'plain':
        this.plain = true
        this.done = true
        break
    }
    this.notify()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    window.clearTimeout(this.pauseTimer)
    if (this.resumeAt > 0) {
      const at = this.resumeAt
      this.resumeAt = 0
      this.want(at)
    }
    return () => {
      this.listeners.delete(fn)
      // wait a tick so a remount or StrictMode's double effect keeps the work
      if (this.listeners.size === 0) {
        window.clearTimeout(this.pauseTimer)
        this.pauseTimer = window.setTimeout(() => this.pause(), 0)
      }
    }
  }

  // the worker holds the grammar state, so a resumed document starts over
  private pause() {
    if (this.listeners.size > 0 || !this.opened || this.done) return
    send({ type: 'close', id: this.id })
    this.opened = false
    this.resumeAt = this.wanted
    this.wanted = 0
  }

  getVersion = () => this.version

  private notify() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.version++
      for (const fn of this.listeners) fn()
    })
  }

  dispose() {
    window.clearTimeout(this.pauseTimer)
    byId.delete(this.id)
    if (this.opened && !this.done) send({ type: 'close', id: this.id })
  }
}

export function getHighlight(
  key: string,
  path: string,
  text: string,
): Highlight {
  const hit = byKey.get(key)
  if (hit && hit.text === text) {
    byKey.delete(key)
    byKey.set(key, hit)
    return hit
  }
  hit?.dispose()
  const h = new Highlight(path, text)
  byKey.set(key, h)
  while (byKey.size > CACHE) {
    const oldest = byKey.keys().next().value as string
    byKey.get(oldest)?.dispose()
    byKey.delete(oldest)
  }
  return h
}

const noop = () => () => {}
const zero = () => 0

export function useHighlightVersion(h: Highlight | null | undefined): number {
  return useSyncExternalStore(h ? h.subscribe : noop, h ? h.getVersion : zero)
}
