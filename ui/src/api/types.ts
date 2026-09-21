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

export type Signature = { name: string; email: string; date: string }
