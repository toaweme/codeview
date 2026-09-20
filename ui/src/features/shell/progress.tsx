import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

export function Progress() {
  const fetching = useIsFetching() > 0
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!fetching) {
      setShown(false)
      return
    }
    const t = setTimeout(() => setShown(true), 180)
    return () => clearTimeout(t)
  }, [fetching])
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden"
    >
      <div
        className={
          shown
            ? 'h-full w-1/3 animate-[gv-progress_1s_ease-in-out_infinite] bg-primary'
            : 'hidden'
        }
      />
    </div>
  )
}
