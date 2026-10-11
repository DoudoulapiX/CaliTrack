import { useState } from 'react'

/** Remplace le module virtuel de vite-plugin-pwa dans les tests. */
export function useRegisterSW() {
  const needRefresh = useState(false)
  const offlineReady = useState(false)
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async () => {
      /* rien à faire dans les tests */
    },
  }
}
