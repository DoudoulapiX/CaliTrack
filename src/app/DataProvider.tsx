import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { ensureSeeded, requestPersistentStorage } from '@/db/seed'
import type { AppSettings } from '@/db/types'
import { Splash } from '@/ui/Splash'
import { ProfileContext, SettingsContext } from './data-context'
import { useTheme } from './theme'

function StorageError({ error }: { error: unknown }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-8 text-center">
      <p className="text-[18px] font-semibold text-ink">Impossible d’ouvrir les données</p>
      <p className="text-[15px] text-ink-2">
        Le stockage de Safari semble indisponible (navigation privée ?). Ouvre CaliTrack depuis l’écran
        d’accueil ou une fenêtre normale.
      </p>
      <p className="text-[12px] text-ink-3">{error instanceof Error ? error.message : String(error)}</p>
      <button
        type="button"
        className="mt-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink"
        onClick={() => {
          window.location.reload()
        }}
      >
        Réessayer
      </button>
    </div>
  )
}

function ThemeApplier({ settings }: { settings: AppSettings }) {
  useTheme(settings.themeMode, settings.accent)
  return null
}

/**
 * Durée du remplissage de l'anneau (`.app-icon-fill` dans index.css, 600 ms) et une image de plus : l'appli
 * s'ouvre alors même si la fin n'a pas été annoncée. WebKit annonce les animations au rendu suivant, qui tarde
 * pendant le chargement ; l'annonce de fin ne sert qu'à ouvrir plus tôt (« Réduire les animations »).
 */
export const INTRO_TIMEOUT_MS = 650

/** Remplissage de l'anneau à l'ouverture : pas commencé, en cours, fini. */
type Intro = 'waiting' | 'playing' | 'done'

/** Prépare la base locale et fournit réglages et profil à toute l'appli. */
export function DataProvider({
  children,
  introTimeoutMs = INTRO_TIMEOUT_MS,
}: {
  children: ReactNode
  /** Seulement pour les tests : attente maximale de la fin du remplissage. */
  introTimeoutMs?: number
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [intro, setIntro] = useState<Intro>('waiting')

  useEffect(() => {
    let cancelled = false
    ensureSeeded().then(
      () => {
        if (!cancelled) setReady(true)
      },
      (e: unknown) => {
        if (!cancelled) setError(e)
      },
    )
    void requestPersistentStorage()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (intro !== 'playing') return
    const timer = window.setTimeout(() => {
      setIntro('done')
    }, introTimeoutMs)
    return () => {
      window.clearTimeout(timer)
    }
  }, [intro, introTimeoutMs])

  const settings = useLiveQuery(() => (ready ? db.settings.get('app') : undefined), [ready])
  const profile = useLiveQuery(() => (ready ? db.profile.get('me') : undefined), [ready])

  if (error) return <StorageError error={error} />
  // Une animation commencée va jusqu'au bout ; si elle n'a pas démarré (données déjà prêtes, ou navigateur
  // sans animation), l'appli s'ouvre sans l'attendre.
  if (!settings || !profile || intro === 'playing') {
    return (
      <Splash
        intro={intro !== 'done'}
        onIntroStart={() => {
          setIntro((current) => (current === 'waiting' ? 'playing' : current))
        }}
        onIntroEnd={() => {
          setIntro('done')
        }}
      />
    )
  }

  return (
    <SettingsContext value={settings}>
      <ProfileContext value={profile}>
        <ThemeApplier settings={settings} />
        {children}
      </ProfileContext>
    </SettingsContext>
  )
}
