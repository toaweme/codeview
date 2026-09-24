export type Tag = { name: string; commit: string; taggedAt: string }

// activity is commits per week over the last 12 weeks, oldest first
export type Repo = {
  name: string
  description: string
  defaultBranch: string
  updatedAt: string
  lastCommit: { hash: string; subject: string; author: Signature } | null
  latestTag: Tag | null
  branchCount: number
  tagCount: number
  activity: number[]
}

export type RepoList = { repos: Repo[] }

export type ActivityCommit = {
  repo: string
  hash: string
  subject: string
  author: Signature
  committedAt: string
  ref: string
}

export type ActivityTag = Tag & { repo: string; previous: string }

export type ActivityBranch = {
  repo: string
  name: string
  commit: string
  subject: string
  updatedAt: string
  ahead: number
  behind: number
}

export type Activity = {
  commits: ActivityCommit[]
  tags: ActivityTag[]
  branches: ActivityBranch[]
}

export type Ref = { name: string; commit: string; updatedAt: string }

export type Refs = { default: string; branches: Ref[]; tags: Ref[] }

export type EntryType = 'tree' | 'blob' | 'symlink' | 'submodule'

export type TreeEntry = {
  name: string
  path: string
  type: EntryType
  size: number
  mode: string
}

export type Tree = {
  ref: string
  commit: string
  path: string
  entries: TreeEntry[]
  readme?: { path: string; content: string; html?: string }
}

export type Rendered = { path: string; html: string }

export type Blob = {
  path: string
  size: number
  binary: boolean
  truncated: boolean
  content?: string
}

export type Signature = { name: string; email: string; date: string }

export type Commit = {
  hash: string
  parents: string[]
  author: Signature
  committer: Signature
  subject: string
  body: string
}

// partial means the author-date filter stopped early and older matches may be missing
export type Log = { commits: Commit[]; next?: string; partial?: boolean }

export type Histogram = {
  buckets: { start: string; count: number }[]
  first: string | null
  last: string | null
}

export type LineType = 'context' | 'add' | 'del'

// 1-based
export type DiffLine = {
  type: LineType
  old: number | null
  new: number | null
  text: string
}

export type Hunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  lines: DiffLine[]
}

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'

export type FileDiff = {
  path: string
  oldPath: string
  status: FileStatus
  additions: number
  deletions: number
  binary: boolean
  truncated?: boolean
  hunks: Hunk[]
}

export type CommitDetail = { commit: Commit; files: FileDiff[] }

export type Compare = {
  base: string
  head: string
  mergeBase: string
  // capped at 250
  ahead: number
  behind: number
  diverged: boolean
  // null when the histories never meet
  boundary: Commit | null
  commits: Commit[]
  files: FileDiff[]
}

// 1-based inclusive
export type BlameRange = {
  start: number
  end: number
  commit: { hash: string; subject: string; author: Signature }
}

export type Blame = { ranges: BlameRange[] }

export type FileList = { commit?: string; files: string[]; truncated?: boolean }
