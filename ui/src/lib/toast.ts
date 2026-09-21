export type ToastTone = 'success' | 'error'

export type Toast = {
  id: number
  tone: ToastTone
  message: string
}

type Listener = (toasts: readonly Toast[]) => void

export const TOAST_MS = 3500
const MAX = 3

export function createToasts(schedule = setTimeout) {
  let toasts: readonly Toast[] = []
  let next = 1
  const listeners = new Set<Listener>()
  const emit = () => {
    for (const l of listeners) l(toasts)
  }
  const dismiss = (id: number) => {
    const rest = toasts.filter((t) => t.id !== id)
    if (rest.length === toasts.length) return
    toasts = rest
    emit()
  }
  const show = (message: string, tone: ToastTone = 'success') => {
    const id = next++
    toasts = [...toasts, { id, tone, message }].slice(-MAX)
    emit()
    schedule(() => dismiss(id), TOAST_MS)
    return id
  }
  const subscribe = (l: Listener) => {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }
  return { show, dismiss, subscribe, get: () => toasts }
}

export const toasts = createToasts()

export const toast = toasts.show
