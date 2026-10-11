import { useEffect } from 'react'

/**
 * Garde l'écran allumé tant que `enabled` est vrai (séance en cours). Le téléphone relâche le verrou
 * quand l'appli passe en arrière-plan : on le redemande au retour.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let stopped = false

    const release = () => {
      const held = sentinel
      sentinel = null
      if (held && !held.released) void held.release().catch(() => undefined)
    }
    const request = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(
        (lock) => {
          if (stopped) {
            void lock.release().catch(() => undefined)
            return
          }
          release()
          sentinel = lock
        },
        () => undefined, // Refusé (économie d'énergie…) : l'écran pourra s'éteindre.
      )
    }

    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', request)
      release()
    }
  }, [enabled])
}
