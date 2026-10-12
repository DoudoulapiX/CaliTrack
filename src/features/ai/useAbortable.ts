import { useEffect, useMemo, useRef } from 'react'

export interface Abortable {
  /** Annule la demande précédente s'il y en a une, puis donne le signal de la nouvelle. */
  begin: () => AbortSignal
  /** Annule la demande en cours. */
  cancel: () => void
}

/**
 * Une demande à la fois, annulable : une nouvelle demande annule la précédente, et quitter l'écran
 * annule celle en cours. Les deux fonctions ne changent pas d'un rendu à l'autre.
 */
export function useAbortable(): Abortable {
  const live = useRef<{ controller: AbortController | null }>({ controller: null })
  useEffect(() => {
    const current = live.current
    return () => {
      current.controller?.abort()
      current.controller = null
    }
  }, [])
  return useMemo(
    () => ({
      begin: () => {
        live.current.controller?.abort()
        const controller = new AbortController()
        live.current.controller = controller
        return controller.signal
      },
      cancel: () => {
        live.current.controller?.abort()
        live.current.controller = null
      },
    }),
    [],
  )
}
