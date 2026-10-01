import { useEffect } from 'react'

// useTitle names the browser tab while the calling page is mounted
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title
  }, [title])
}
