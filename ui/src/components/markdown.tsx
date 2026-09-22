import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { treeQuery } from '@/api/queries'
import { getHighlight, type Highlight, type Tok } from '@/highlight'
import { cn } from '@/lib/cn'
import { repoLink } from '@/lib/url'

export function Markdown({
  source,
  html,
  repo,
  rev,
  linkRef,
  className,
}: {
  source: string
  html?: string
  repo: string
  // linkRef is undefined for the default branch
  rev: string
  linkRef?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const hash = useLocation({ select: (l) => l.hash })
  useEffect(() => {
    const root = ref.current
    if (!root || !html) return
    const docs: { h: Highlight; off: () => void }[] = []
    root.querySelectorAll('pre > code[class*="language-"]').forEach((el, i) => {
      const code = el as HTMLElement
      const lang = /language-([\w+#-]+)/.exec(code.className)?.[1]
      if (!lang) return
      const text = code.textContent ?? ''
      const h = getHighlight(
        `md:${repo}:${rev}:${i}:${lang}`,
        `block.${lang}`,
        text,
      )
      const paint = () => {
        if (h.done && !h.plain) paintTokens(code, h.lines)
      }
      const off = h.subscribe(paint)
      h.want(1e9)
      paint()
      docs.push({ h, off })
    })
    return () => {
      for (const d of docs) d.off()
    }
  }, [html, repo, rev])

  useEffect(() => {
    const root = ref.current
    if (!root || !html || !hash) return
    const el = root.querySelector(
      `[id="${CSS.escape(decodeURIComponent(hash))}"]`,
    )
    el?.scrollIntoView({ block: 'start' })
  }, [html, hash])

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('#') && href.length > 1) {
      e.preventDefault()
      navigate({
        to: '.',
        hash: href.slice(1),
        replace: true,
        resetScroll: false,
      })
      return
    }
    const path = a.dataset.gvPath
    if (path === undefined) return
    e.preventDefault()
    const clean = path.replace(/^\/+|\/+$/g, '')
    if (!clean) {
      navigate(repoLink(repo, { kind: 'tree', ref: linkRef, path: '' }))
      return
    }
    navigate(
      repoLink(repo, {
        kind: (await isFolder(clean)) ? 'tree' : 'blob',
        ref: linkRef,
        path: clean,
      }),
    )
  }

  const isFolder = async (path: string): Promise<boolean> => {
    const parent = path.includes('/')
      ? path.slice(0, path.lastIndexOf('/'))
      : ''
    try {
      const t = await qc.query(treeQuery(repo, rev, parent))
      return t.entries.some((x) => x.path === path && x.type === 'tree')
    } catch {
      return false
    }
  }

  if (!html) {
    return (
      <pre
        className={cn(
          'whitespace-pre-wrap break-words font-sans text-base leading-relaxed',
          className,
        )}
      >
        {source}
      </pre>
    )
  }
  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegates clicks on the links inside, which stay keyboard reachable */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the handler only intercepts clicks on real links inside */}
      <div
        ref={ref}
        onClick={handleClick}
        className={cn('markdown', className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: the server sanitizes rendered Markdown, this is its one injection point
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}

function paintTokens(code: HTMLElement, lines: readonly (Tok[] | undefined)[]) {
  const frag = document.createDocumentFragment()
  lines.forEach((line, i) => {
    if (i > 0) frag.append('\n')
    for (const t of line ?? []) {
      const span = document.createElement('span')
      span.textContent = t[0]
      if (t[1] || t[2]) {
        span.className = 'tok'
        if (t[1]) span.style.setProperty('--shiki-light', t[1])
        if (t[2]) span.style.setProperty('--shiki-dark', t[2])
      }
      if (t[3] && t[3] & 1) span.style.fontStyle = 'italic'
      if (t[3] && t[3] & 2) span.style.fontWeight = '600'
      frag.append(span)
    }
  })
  code.replaceChildren(frag)
}
