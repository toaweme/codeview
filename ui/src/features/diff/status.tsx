import type { FileStatus } from '@/api/types'
import { Badge, type BadgeTone } from '@/components/badge'
import { cn } from '@/lib/cn'

const LETTER: Record<FileStatus, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
}

const TONE: Record<FileStatus, BadgeTone> = {
  added: 'add',
  modified: 'warn',
  deleted: 'del',
  renamed: 'info',
  copied: 'info',
}

export function StatusBadge({
  status,
  short,
}: {
  status: FileStatus
  short?: boolean
}) {
  return (
    <Badge
      tone={TONE[status]}
      title={status}
      className={cn(short && 'w-(--badge-h) justify-center px-0')}
    >
      {short ? LETTER[status] : status}
    </Badge>
  )
}
