import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useQuery,
} from '@tanstack/react-query'
import { type CompareMode, isCommitHash, splitRevision } from '@/lib/url'
import { ApiError, getJSON, isNotFound, type Params } from './client'
import type {
  Blame,
  Blob,
  Commit,
  CommitDetail,
  Compare,
  FileList,
  Histogram,
  Log,
  Refs,
  Rendered,
  RepoList,
  Tree,
} from './types'

// hash-addressed data never changes, so it is cached for the session
const IMMUTABLE = Number.POSITIVE_INFINITY
const MUTABLE = 30_000

function staleFor(rev: string): number {
  return isCommitHash(rev) ? IMMUTABLE : MUTABLE
}

export const reposQuery = () =>
  queryOptions({
    queryKey: ['repos'],
    queryFn: ({ signal }) => getJSON<RepoList>('repos', {}, signal),
    staleTime: 60_000,
  })

export const refsQuery = (repo: string) =>
  queryOptions({
    queryKey: ['refs', repo],
    queryFn: ({ signal }) => getJSON<Refs>('refs', { repo }, signal),
    staleTime: MUTABLE,
  })

export const treeQuery = (repo: string, rev: string, path: string) =>
  queryOptions({
    queryKey: ['tree', repo, rev, path],
    queryFn: ({ signal }) =>
      getJSON<Tree>('tree', { repo, ref: rev, path }, signal),
    staleTime: staleFor(rev),
  })

export const blobQuery = (repo: string, rev: string, path: string) =>
  queryOptions({
    queryKey: ['blob', repo, rev, path],
    queryFn: ({ signal }) =>
      getJSON<Blob>('blob', { repo, ref: rev, path }, signal),
    staleTime: staleFor(rev),
  })

export const blameQuery = (repo: string, rev: string, path: string) =>
  queryOptions({
    queryKey: ['blame', repo, rev, path],
    queryFn: ({ signal }) =>
      getJSON<Blame>('blame', { repo, ref: rev, path }, signal),
    staleTime: staleFor(rev),
  })

export const renderQuery = (repo: string, rev: string, path: string) =>
  queryOptions({
    queryKey: ['render', repo, rev, path],
    queryFn: ({ signal }) =>
      getJSON<Rendered>('render', { repo, ref: rev, path }, signal),
    staleTime: staleFor(rev),
    // 404 means the server lacks the endpoint and the view shows the source
    retry: false,
  })

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(path)
}

const LOG_PAGE = 50

// the cursor is only valid under the filters that issued it
export const logQuery = (
  repo: string,
  rev: string,
  path: string,
  filter: Params = {},
) =>
  infiniteQueryOptions({
    queryKey: ['log', repo, rev, path, filter],
    queryFn: ({ signal, pageParam }) =>
      getJSON<Log>(
        'log',
        { ...filter, repo, ref: rev, path, cursor: pageParam, limit: LOG_PAGE },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next || undefined,
    staleTime: staleFor(rev),
  })

export const histogramQuery = (
  repo: string,
  rev: string,
  path: string,
  bucket: 'day' | 'week' | 'month',
  dateField?: string,
) =>
  queryOptions({
    queryKey: ['histogram', repo, rev, path, bucket, dateField ?? ''],
    queryFn: ({ signal }) =>
      getJSON<Histogram>(
        'log/histogram',
        { repo, ref: rev, path, bucket, dateField },
        signal,
      ),
    staleTime: staleFor(rev),
  })

export const commitQuery = (repo: string, hash: string) =>
  queryOptions({
    queryKey: ['commit', repo, hash],
    queryFn: ({ signal }) =>
      getJSON<CommitDetail>('commit', { repo, hash }, signal),
    staleTime: staleFor(hash),
  })

export const revisionQuery = (repo: string, rev: string) =>
  queryOptions({
    queryKey: ['revision', repo, rev],
    queryFn: async ({ signal }): Promise<Commit | null> => {
      const log = await getJSON<Log>(
        'log',
        { repo, ref: rev, limit: 1 },
        signal,
      )
      return log.commits[0] ?? null
    },
    staleTime: staleFor(splitRevision(rev).name),
    retry: false,
  })

export const compareQuery = (
  repo: string,
  base: string,
  head: string,
  mode?: CompareMode,
) =>
  queryOptions({
    queryKey: ['compare', repo, base, head, mode ?? ''],
    queryFn: ({ signal }) =>
      getJSON<Compare>(
        'compare',
        mode ? { repo, base, head, mode } : { repo, base, head },
        signal,
      ),
    staleTime: isCommitHash(base) && isCommitHash(head) ? IMMUTABLE : MUTABLE,
  })

const CRAWL_LIMIT = 400

export const filesQuery = (qc: QueryClient, repo: string, rev: string) =>
  queryOptions({
    queryKey: ['files', repo, rev],
    queryFn: async ({ signal }): Promise<FileList> => {
      try {
        return await getJSON<FileList>('files', { repo, ref: rev }, signal)
      } catch (err) {
        if (
          !(err instanceof ApiError) ||
          (err.status !== 404 && err.status !== 405)
        )
          throw err
      }
      const files: string[] = []
      const queue = ['']
      let requests = 0
      while (queue.length > 0 && requests < CRAWL_LIMIT) {
        const batch = queue.splice(0, 8)
        requests += batch.length
        const trees = await Promise.all(
          batch.map((p) => qc.query(treeQuery(repo, rev, p))),
        )
        for (const t of trees) {
          for (const e of t.entries) {
            if (e.type === 'tree') queue.push(e.path)
            else if (e.type === 'blob' || e.type === 'symlink')
              files.push(e.path)
          }
        }
      }
      files.sort()
      return { files, truncated: queue.length > 0 }
    },
    staleTime: staleFor(rev),
  })

export type ResolvedRef = {
  name: string
  // the commit hash once known, so responses are shared across branch names
  rev: string
  commit?: string
  isDefault: boolean
  kind: 'branch' | 'tag' | 'commit' | 'unknown'
}

export function resolveRef(
  refs: Refs | undefined,
  ref?: string,
): ResolvedRef | null {
  if (ref && isCommitHash(ref) && !refs?.branches.some((b) => b.name === ref)) {
    return {
      name: ref,
      rev: ref,
      commit: ref,
      isDefault: false,
      kind: 'commit',
    }
  }
  if (!refs) {
    return ref
      ? { name: ref, rev: ref, isDefault: false, kind: 'unknown' }
      : null
  }
  const name = ref || refs.default
  const branch = refs.branches.find((b) => b.name === name)
  if (branch) {
    return {
      name,
      rev: branch.commit || name,
      commit: branch.commit || undefined,
      isDefault: name === refs.default,
      kind: 'branch',
    }
  }
  const tag = refs.tags.find((t) => t.name === name)
  if (tag) {
    return {
      name,
      rev: tag.commit || name,
      commit: tag.commit || undefined,
      isDefault: false,
      kind: 'tag',
    }
  }
  return { name, rev: name, isDefault: name === refs.default, kind: 'unknown' }
}

// while refs load a named ref is used as is, so the first request is not held back
export function useResolvedRef(repo: string, ref?: string) {
  const refs = useQuery(refsQuery(repo))
  return { resolved: resolveRef(refs.data, ref), refs }
}

export { isNotFound }
