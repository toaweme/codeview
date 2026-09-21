import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'
import { toast, toasts } from '@/lib/toast'

export function useToast() {
  return toast
}

export function Toaster() {
  const list = useSyncExternalStore(toasts.subscribe, toasts.get, toasts.get)
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex flex-col items-center gap-2 px-4"
    >
      {list.map((t) => {
        const Icon = t.tone === 'error' ? CircleAlert : CircleCheck
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-island py-2 pr-2 pl-3.5 text-sm',
              'shadow-[0_0_0_1px_var(--border),0_16px_40px_-12px_rgb(0_0_0/0.35)]',
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'size-4 shrink-0',
                t.tone === 'error' ? 'text-del' : 'text-add',
              )}
            />
            <span className="min-w-0 text-foreground">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => toasts.dismiss(t.id)}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
