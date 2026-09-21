export function Highlighted({
  text,
  positions,
}: {
  text: string
  positions: readonly number[]
}) {
  const hits = new Set(positions)
  const cut = text.lastIndexOf('/') + 1
  const parts: React.ReactNode[] = []
  let run = ''
  let runHit = false
  let runDim = true
  const flush = (at: number) => {
    if (!run) return
    parts.push(
      <span
        key={at}
        className={
          runHit
            ? 'font-semibold text-primary'
            : runDim
              ? 'text-muted-foreground'
              : 'text-foreground'
        }
      >
        {run}
      </span>,
    )
    run = ''
  }
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i)
    const dim = i < cut
    if (run && (hit !== runHit || dim !== runDim)) flush(i)
    runHit = hit
    runDim = dim
    run += text[i]
  }
  flush(text.length)
  return <>{parts}</>
}
