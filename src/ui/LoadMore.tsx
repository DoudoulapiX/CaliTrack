import { useEffect, useRef } from 'react'
import { Button } from './Button'

/**
 * Fin d'une longue liste : charge la suite quand on s'en approche en défilant,
 * avec un bouton en secours (lecteur d'écran, navigateur sans IntersectionObserver).
 */
export function LoadMore({ onMore, remaining }: { onMore: () => void; remaining: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMoreRef = useRef(onMore)
  useEffect(() => {
    onMoreRef.current = onMore
  })

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onMoreRef.current()
      },
      { rootMargin: '1000px 0px' },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
    // Nouvel observateur à chaque ajout : la suite se charge tant que la fin reste proche.
  }, [remaining])

  return (
    <div ref={ref} className="flex justify-center py-4">
      <Button variant="secondary" onClick={onMore}>
        Afficher plus ({remaining})
      </Button>
    </div>
  )
}
