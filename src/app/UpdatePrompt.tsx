import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

const HOUR = 60 * 60 * 1000

/** Propose d'installer une nouvelle version de l'appli quand elle est disponible. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        if (navigator.onLine) void registration.update()
      }, HOUR)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-[calc(var(--safe-top)+8px)] z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface-3 p-3 shadow-xl"
    >
      <RefreshCw size={20} className="shrink-0 text-accent-text" aria-hidden />
      <p className="flex-1 text-[14px] text-ink">Une nouvelle version de CaliTrack est prête.</p>
      <button
        type="button"
        className="rounded-xl px-3 py-2 text-[14px] font-medium text-ink-2"
        onClick={() => {
          setNeedRefresh(false)
        }}
      >
        Plus tard
      </button>
      <button
        type="button"
        className="rounded-xl bg-accent px-3 py-2 text-[14px] font-semibold text-accent-ink"
        onClick={() => {
          void updateServiceWorker(true)
        }}
      >
        Mettre à jour
      </button>
    </div>
  )
}
