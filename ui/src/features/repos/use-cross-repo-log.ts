import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getJSON } from '@/api/client'
import type { Log } from '@/api/types'
import { mergeStreams, nextFetches, type Stream } from './merge-feed'

const PAGE = 40

export function useCrossRepoLog(
  repos: { name: string; ref: string }[],
  since?: number,
) {
  const [streams, setStreams] = useState<Record<string, Stream>>({})
  const ref = useRef(streams)
  ref.current = streams
  const fetchPage = useCallback((name: string, branch: string) => {
    const prev = ref.current[name]
    if (prev?.loading || prev?.done || prev?.failed) return
    const patch = (p: Partial<Stream>) =>
      setStreams((s) => {
        const cur = s[name] ?? {
          repo: name,
          commits: [],
          done: false,
          loading: false,
          failed: false,
        }
        return { ...s, [name]: { ...cur, ...p } }
      })
    patch({ loading: true })
    ref.current = {
      ...ref.current,
      [name]: {
        ...(prev ?? {
          repo: name,
          commits: [],
          done: false,
          failed: false,
        }),
        loading: true,
      },
    }
    getJSON<Log>('log', {
      repo: name,
      ref: branch,
      cursor: prev?.next,
      limit: PAGE,
    })
      .then((log) => {
        const added = log.commits.map((c) => ({
          repo: name,
          hash: c.hash,
          subject: c.subject,
          author: c.author,
          committed_at: c.committer.date,
          ref: branch,
        }))
        setStreams((s) => {
          const cur = s[name]
          return {
            ...s,
            [name]: {
              ...cur,
              commits: [...(cur?.commits ?? []), ...added],
              next: log.next || undefined,
              done: !log.next,
              loading: false,
            },
          }
        })
      })
      // not aborted on unmount since a remount picks the same stream up
      .catch(() => patch({ loading: false, failed: true }))
  }, [])

  const active = useMemo(
    () =>
      repos.map(
        (r) =>
          streams[r.name] ?? {
            repo: r.name,
            commits: [],
            done: false,
            loading: false,
            failed: false,
          },
      ),
    [repos, streams],
  )
  const merged = useMemo(() => mergeStreams(active, since), [active, since])
  const branchOf = useMemo(
    () => new Map(repos.map((r) => [r.name, r.ref])),
    [repos],
  )

  const loadMore = useCallback(() => {
    for (const name of nextFetches(
      active,
      merged.commits.length,
      PAGE,
      since,
    )) {
      const branch = branchOf.get(name)
      if (branch) fetchPage(name, branch)
    }
  }, [active, merged.commits.length, since, branchOf, fetchPage])

  useEffect(() => {
    for (const r of repos) if (!ref.current[r.name]) fetchPage(r.name, r.ref)
  }, [repos, fetchPage])

  return {
    commits: merged.commits,
    complete: merged.complete,
    loading: active.some((s) => s.loading),
    pending: active.some((s) => s.commits.length === 0 && !s.done && !s.failed),
    failed: active.filter((s) => s.failed).map((s) => s.repo),
    loadMore,
  }
}
