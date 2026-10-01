export type Tag = { name: string; commit: string; tagged_at: string }

// activity is commits per week over the last 12 weeks, oldest first.
// contributors are the distinct author emails of the last 4 weeks.
export type Repo = {
  name: string
  description: string
  default_branch: string
  updated_at: string
  last_commit: { hash: string; subject: string; author: Signature } | null
  latest_tag: Tag | null
  branch_count: number
  tag_count: number
  activity: number[]
  contributors?: string[]
  work_tree?: boolean
  // error marks a repository the server could not read, listed with only its name
  error?: string
}

// RepoMode is `public` when only repositories exported to git-daemon are
// served and `all` when every repository is, without authentication.

export type RepoList = { repos: Repo[] }

export type ActivityCommit = {
  repo: string
  hash: string
  subject: string
  author: Signature
  committed_at: string
  ref: string
}

export type ActivityTag = Tag & { repo: string; previous: string }

export type ActivityBranch = {
  repo: string
  name: string
  commit: string
  subject: string
  updated_at: string
  ahead: number
  behind: number
}

// error is a short reason safe to show, and the server logs the details
export type RepoFailure = { repo: string; error: string }

export type Activity = {
  commits: ActivityCommit[]
  tags: ActivityTag[]
  branches: ActivityBranch[]
  failed: RepoFailure[]
}

// partial marks a filtered page that stopped scanning early, which next continues
export type CommitFeed = {
  commits: ActivityCommit[]
  next: string
  partial?: boolean
  // scanned counts the commits the page read, matching or not
  scanned: number
  failed: RepoFailure[]
}

// total and versions count every tag the query selects, across all pages
export type ReleaseFeed = {
  releases: ActivityTag[]
  next: string
  total: number
  versions: number
  failed: RepoFailure[]
}

export type Ref = { name: string; commit: string; updated_at: string }

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
  old_start: number
  old_lines: number
  new_start: number
  new_lines: number
  header: string
  lines: DiffLine[]
}

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'

export type FileDiff = {
  path: string
  old_path: string
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
  merge_base: string
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
