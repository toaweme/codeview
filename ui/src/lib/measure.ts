import { type RefObject, useLayoutEffect, useState } from 'react'

// TAB_EM mirrors tab-size on .code in theme.css
const TAB_EM = 1.75
const SAMPLE = 400

let canvas: HTMLCanvasElement | null = null

// character count is close enough to pick a small sample to measure exactly
export function longestCandidates(
  lines: readonly string[],
  sample = SAMPLE,
): number[] {
  if (lines.length <= sample) return lines.map((_, i) => i)
  const lens = lines.map((l) => l.length).sort((a, b) => b - a)
  const floor = lens[sample - 1]
  const out: number[] = []
  for (let i = 0; i < lines.length && out.length < sample * 2; i++) {
    if (lines[i].length >= floor) out.push(i)
  }
  return out
}

// the code font is proportional, so width comes from real glyph measurement
export function useTextWidth(
  lines: readonly string[],
  el: RefObject<HTMLElement | null>,
): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    let alive = true
    const run = () => {
      const node = el.current
      if (!node || !alive) return
      canvas ??= document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const cs = getComputedStyle(node)
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const tab = Number.parseFloat(cs.fontSize) * TAB_EM
      let max = 0
      for (const i of longestCandidates(lines)) {
        const line = lines[i]
        let tabs = 0
        for (let k = 0; k < line.length; k++)
          if (line.charCodeAt(k) === 9) tabs++
        const w =
          ctx.measureText(tabs ? line.replaceAll('\t', '') : line).width +
          tabs * tab
        if (w > max) max = w
      }
      setWidth(Math.ceil(max))
    }
    run()
    void document.fonts?.ready.then(run)
    return () => {
      alive = false
    }
  }, [lines, el])
  return width
}
