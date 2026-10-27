import { useEffect, useState } from 'react'

/**
 * Où en est le verrou d'écran : pas demandé, demandé, tenu, ou impossible (pas d'API, ou demande refusée :
 * appli sur l'écran d'accueil avant iOS 18.4).
 */
export type WakeLockStatus = 'off' | 'pending' | 'held' | 'unavailable'

/**
 * Garde l'écran allumé tant que `enabled` est vrai (séance en cours, compteur caméra). Le téléphone relâche le
 * verrou quand l'appli passe en arrière-plan : on le redemande au retour.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const [status, setStatus] = useState<'pending' | 'held' | 'unavailable'>('pending')

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
          setStatus('held')
          // Relâché par le téléphone (appli en arrière-plan) : redemandé au retour.
          lock.addEventListener('release', () => {
            if (sentinel !== lock) return
            sentinel = null
            if (!stopped) setStatus('pending')
          })
        },
        () => {
          // Refusé (économie d'énergie, appli sur l'écran d'accueil avant iOS 18.4) : l'écran pourra s'éteindre.
          if (!stopped) setStatus('unavailable')
        },
      )
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || sentinel) return
      setStatus('pending')
      request()
    }

    request()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisibility)
      release()
      setStatus('pending')
    }
  }, [enabled])

  if (!enabled) return 'off'
  if (!('wakeLock' in navigator)) return 'unavailable'
  return status
}
