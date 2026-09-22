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

// 1-based inclusive
export type BlameRange = {
  start: number
  end: number
  commit: { hash: string; subject: string; author: Signature }
}

export type Blame = { ranges: BlameRange[] }

export type FileList = { commit?: string; files: string[]; truncated?: boolean }
