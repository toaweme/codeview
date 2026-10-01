export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// an array repeats its key, once per value
export type Params = Record<string, string | number | string[] | undefined>

export function apiUrl(path: string, params: Params = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : [v]) {
      if (item !== undefined && item !== '') q.append(k, String(item))
    }
  }
  const qs = q.toString()
  return `/api/${path}${qs ? `?${qs}` : ''}`
}

export async function getJSON<T>(
  path: string,
  params: Params = {},
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(apiUrl(path, params), {
    signal,
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    let message = res.statusText || `request failed with ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // non-JSON body, keep the status text
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}
