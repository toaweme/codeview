/// <reference lib="webworker" />
import {
  bundledLanguages,
  createHighlighter,
  createJavaScriptRegexEngine,
  type GrammarState,
  type Highlighter,
} from 'shiki'
import { langFor } from './lang'
import type { FromWorker, Tok, ToWorker } from './protocol'

// the JS regex engine avoids WASM, so no wasm-unsafe-eval under a strict CSP

const CHUNK = 250
const THEMES = { light: 'github-light', dark: 'github-dark' } as const

type Job = {
  id: number
  lang: string
  lines: string[]
  done: number
  want: number
  touched: number
  state?: GrammarState
}

const scope = self as unknown as DedicatedWorkerGlobalScope
const jobs = new Map<number, Job>()
let clock = 0
let pumping = false
let hl: Promise<Highlighter> | null = null
// wants and closes that arrive while a job's grammar is still loading
const early = new Map<number, number>()
const closed = new Set<number>()
const pending = new Set<number>()

function highlighter(): Promise<Highlighter> {
  if (!hl) {
    hl = createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    })
  }
  return hl
}

function post(msg: FromWorker) {
  scope.postMessage(msg)
}

async function ensureLang(h: Highlighter, lang: string): Promise<boolean> {
  if (h.getLoadedLanguages().includes(lang)) return true
  if (!(lang in bundledLanguages)) return false
  try {
    await h.loadLanguage(lang as keyof typeof bundledLanguages)
    return true
  } catch {
    return false
  }
}

function styleBits(s: Record<string, string> | undefined): number {
  if (!s) return 0
  const fs = `${s['--shiki-light-font-style'] ?? ''} ${s['--shiki-dark-font-style'] ?? ''}`
  let bits = 0
  if (fs.includes('italic')) bits |= 1
  if (fs.includes('bold')) bits |= 2
  if (fs.includes('underline')) bits |= 4
  return bits
}

function next(): Job | undefined {
  let best: Job | undefined
  for (const j of jobs.values()) {
    if (j.done >= j.lines.length || j.done >= j.want) continue
    if (!best || j.touched > best.touched) best = j
  }
  return best
}

async function pump() {
  if (pumping) return
  pumping = true
  try {
    const h = await highlighter()
    for (let job = next(); job; job = next()) {
      const start = job.done
      const end = Math.min(job.lines.length, start + CHUNK)
      const code = job.lines.slice(start, end).join('\n')
      const res = h.codeToTokens(code, {
        lang: job.lang as keyof typeof bundledLanguages,
        themes: THEMES,
        defaultColor: false,
        grammarState: job.state,
        tokenizeMaxLineLength: 2000,
        tokenizeTimeLimit: 200,
      })
      job.state = res.grammarState
      job.done = end
      const lines: Tok[][] = res.tokens.map((line) =>
        line.map((t) => {
          const s = t.htmlStyle as Record<string, string> | undefined
          const bits = styleBits(s)
          return bits
            ? [t.content, s?.['--shiki-light'], s?.['--shiki-dark'], bits]
            : [t.content, s?.['--shiki-light'], s?.['--shiki-dark']]
        }),
      )
      post({ type: 'chunk', id: job.id, start, lines })
      if (job.done >= job.lines.length) {
        // drop finished jobs so the worker does not keep every opened file alive
        jobs.delete(job.id)
        post({ type: 'done', id: job.id })
      }
      // yield so pending want/close messages land before the next chunk
      await new Promise((r) => setTimeout(r, 0))
    }
  } finally {
    pumping = false
  }
}

async function open(msg: Extract<ToWorker, { type: 'open' }>) {
  const h = await highlighter()
  const lang = langFor(msg.path)
  const ok = lang !== 'txt' && (await ensureLang(h, lang))
  // a close that landed while the grammar loaded wins
  const wasClosed = closed.delete(msg.id)
  const earlyWant = early.get(msg.id) ?? 0
  early.delete(msg.id)
  if (wasClosed) return
  if (!ok) {
    post({ type: 'plain', id: msg.id })
    return
  }
  jobs.set(msg.id, {
    id: msg.id,
    lang,
    lines: msg.text.split('\n'),
    done: 0,
    want: Math.max(msg.want, earlyWant),
    touched: ++clock,
  })
  void pump()
}

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  switch (msg.type) {
    case 'open':
      pending.add(msg.id)
      void open(msg).finally(() => pending.delete(msg.id))
      break
    case 'want': {
      const job = jobs.get(msg.id)
      if (!job) {
        if (!pending.has(msg.id)) break
        early.set(msg.id, Math.max(msg.want, early.get(msg.id) ?? 0))
        break
      }
      if (msg.want > job.want) {
        job.want = msg.want
        job.touched = ++clock
        void pump()
      }
      break
    }
    case 'close':
      if (!jobs.delete(msg.id) && pending.has(msg.id)) closed.add(msg.id)
      early.delete(msg.id)
      break
  }
}
