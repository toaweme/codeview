import { toast } from './toast'

export function copyError(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return msg.replace(/\.$/, '') || 'unknown error'
}

// copyText copies text and reports the outcome in a toast,
// resolving to whether the copy landed.
export async function copyText(text: string, what = 'Text'): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error('clipboard is unavailable in this browser')
    await navigator.clipboard.writeText(text)
    toast(`${what} copied`)
    return true
  } catch (err) {
    toast(`Couldn't copy ${what.toLowerCase()} (${copyError(err)})`, 'error')
    return false
  }
}
