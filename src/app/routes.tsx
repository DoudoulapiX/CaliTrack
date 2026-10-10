import type { RouteObject } from 'react-router'
import { PageSpinner } from '@/ui/PageSpinner'
import { AppShell, type RouteHandle } from './AppShell'
import { NotFound } from './NotFound'
import { RouteError } from './RouteError'

const fullScreen: RouteHandle = { hideTabBar: true }

/**
 * Tous les écrans de l'appli. Chaque écran est chargé à la demande : l'ouverture reste rapide.
 */
export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <PageSpinner />,
    children: [
      {
        // Une erreur dans un écran garde la barre d'onglets : on peut changer d'écran.
        errorElement: <RouteError />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('@/features/today/TodayPage')).TodayPage }),
          },
          {
            path: 'onboarding',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/onboarding/OnboardingPage')).OnboardingPage,
            }),
          },
          {
            path: 'calendar',
            lazy: async () => ({
              Component: (await import('@/features/calendar/CalendarPage')).CalendarPage,
            }),
          },
          {
            path: 'training',
            lazy: async () => ({
              Component: (await import('@/features/training/TrainingPage')).TrainingPage,
            }),
          },
          {
            path: 'climbing',
            lazy: async () => ({
              Component: (await import('@/features/climbing/ClimbingPage')).ClimbingPage,
            }),
          },
          {
            path: 'goals',
            lazy: async () => ({ Component: (await import('@/features/goals/GoalsPage')).GoalsPage }),
          },
          {
            path: 'library',
            lazy: async () => ({ Component: (await import('@/features/library/LibraryPage')).LibraryPage }),
          },
          {
            path: 'library/new',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/library/ExerciseEditPage')).ExerciseEditPage,
            }),
          },
          {
            path: 'library/:id',
            lazy: async () => ({ Component: (await import('@/features/library/ExercisePage')).ExercisePage }),
          },
          {
            path: 'library/:id/edit',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/library/ExerciseEditPage')).ExerciseEditPage,
            }),
          },
          {
            path: 'more',
            lazy: async () => ({ Component: (await import('@/features/more/MorePage')).MorePage }),
          },
          { path: '*', Component: NotFound },
        ],
      },
    ],
  },
]
