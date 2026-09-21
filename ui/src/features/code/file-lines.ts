import type { BlameRange } from '@/api/types'

export function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

// the server may attribute blame line by line
export function mergeBlame(ranges: readonly BlameRange[]): BlameRange[] {
  const out: BlameRange[] = []
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1]
    if (last && last.commit.hash === r.commit.hash && last.end + 1 >= r.start) {
      last.end = Math.max(last.end, r.end)
    } else {
      out.push({ ...r })
    }
  }
  return out
}
