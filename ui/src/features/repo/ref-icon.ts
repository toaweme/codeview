import { GitBranch, GitCommitHorizontal, Tag } from 'lucide-react'
import type { Refs } from '@/api/types'
import { isCommitHash, isRevision } from '@/lib/url'

export function refIcon(refs: Refs | undefined, name: string) {
  if (refs?.tags.some((t) => t.name === name)) return Tag
  if (refs?.branches.some((b) => b.name === name)) return GitBranch
  return isCommitHash(name) || isRevision(name)
    ? GitCommitHorizontal
    : GitBranch
}
