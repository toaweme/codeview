import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { Tooltip } from './tooltip'

export function CopyButton({
  text,
  title = 'Copy',
  what = 'Text',
  className,
}: {
  text: string
  title?: string
  what?: string
  className?: string
}) {
  const [done, setDone] = useState(false)
  const Icon = done ? Check : Copy
  return (
    <Tooltip label={done ? 'Copied' : title}>
      <button
        type="button"
        aria-label={title}
        onClick={() => {
          void copyText(text, what).then((ok) => {
            if (!ok) return
            setDone(true)
            setTimeout(() => setDone(false), 1200)
          })
        }}
        className={cn(
          'grid size-8 place-items-center rounded-md',
          'text-muted-foreground transition-colors',
          'hover:bg-accent hover:text-foreground',
          'focus-visible:outline-2 focus-visible:outline-ring',
          done && 'text-add',
          className,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </Tooltip>
  )
}
