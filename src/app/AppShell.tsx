import { Suspense, type CSSProperties } from 'react'
import { Navigate, Outlet, ScrollRestoration, useLocation, useMatches } from 'react-router'
import { ActiveClimbBar } from '@/features/climbing/ActiveClimbBar'
import { useActiveClimb } from '@/features/climbing/useClimbing'
import { CatalogProvider } from '@/features/library/CatalogProvider'
import { ActiveWorkoutBar } from '@/features/workout/ActiveWorkoutBar'
import { useActiveWorkout } from '@/features/workout/useWorkouts'
import { PageSpinner } from '@/ui/PageSpinner'
import { useSettings } from './data-context'
import { TabBar } from './TabBar'

/** Place réservée à la barre « séance en cours » au-dessus des onglets (les pages s'y adaptent). */
const WORKOUT_BAR: CSSProperties = { ['--workout-bar-height' as string]: '64px' }

export interface RouteHandle {
  /** Écran plein (séance en cours, accueil) : pas de barre d'onglets. */
  hideTabBar?: boolean
}

function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null && 'hideTabBar' in value
}

export function AppShell() {
  const settings = useSettings()
  const location = useLocation()
  const matches = useMatches()
  const active = useActiveWorkout()
  const climb = useActiveClimb()
  const hideTabBar = matches.some((m) => isRouteHandle(m.handle) && m.handle.hideTabBar === true)
  // Une seule barre au-dessus des onglets : la séance de muscu d'abord, sinon l'escalade.
  const accessory = hideTabBar ? null : active ? (
    <ActiveWorkoutBar workout={active} />
  ) : climb ? (
    <ActiveClimbBar session={climb} />
  ) : null

  // L'accueil s'ouvre et se ferme ici, d'après le réglage enregistré : une fois l'accueil terminé,
  // on n'en sort qu'après la mise à jour des réglages (sinon on y serait renvoyé aussitôt).
  const onOnboarding = location.pathname === '/onboarding'
  if (!settings.onboardingDone && !onOnboarding) return <Navigate to="/onboarding" replace />
  if (settings.onboardingDone && onOnboarding) return <Navigate to="/" replace />

  return (
    <div className="contents" style={accessory ? WORKOUT_BAR : undefined}>
      <Suspense fallback={<PageSpinner />}>
        <CatalogProvider>
          <Outlet />
        </CatalogProvider>
      </Suspense>
      {!hideTabBar && <TabBar accessory={accessory} />}
      <ScrollRestoration />
    </div>
  )
}
