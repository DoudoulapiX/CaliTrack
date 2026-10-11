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
            path: 'training/new',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/training/NewProgramPage')).NewProgramPage,
            }),
          },
          {
            path: 'training/programs',
            lazy: async () => ({
              Component: (await import('@/features/training/ProgramsPage')).ProgramsPage,
            }),
          },
          {
            path: 'training/programs/:id',
            lazy: async () => ({
              Component: (await import('@/features/training/ProgramPage')).ProgramPage,
            }),
          },
          {
            path: 'training/programs/:id/sessions/:sessionId',
            lazy: async () => ({
              Component: (await import('@/features/training/SessionPage')).SessionPage,
            }),
          },
          {
            path: 'training/history',
            lazy: async () => ({
              Component: (await import('@/features/workout/HistoryPage')).HistoryPage,
            }),
          },
          {
            path: 'training/history/:id',
            lazy: async () => ({
              Component: (await import('@/features/workout/WorkoutPage')).HistoryWorkoutPage,
            }),
          },
          {
            path: 'training/records',
            lazy: async () => ({
              Component: (await import('@/features/workout/RecordsPage')).RecordsPage,
            }),
          },
          {
            path: 'workout/:id',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/workout/WorkoutPage')).WorkoutPage,
            }),
          },
          {
            path: 'climbing',
            lazy: async () => ({
              Component: (await import('@/features/climbing/ClimbingPage')).ClimbingPage,
            }),
          },
          {
            path: 'climbing/session/:id',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/climbing/ClimbPage')).ClimbSessionPage,
            }),
          },
          {
            path: 'climbing/history',
            lazy: async () => ({
              Component: (await import('@/features/climbing/ClimbHistoryPage')).ClimbHistoryPage,
            }),
          },
          {
            path: 'climbing/history/:id',
            lazy: async () => ({
              Component: (await import('@/features/climbing/ClimbPage')).ClimbHistorySessionPage,
            }),
          },
          {
            path: 'climbing/stats',
            lazy: async () => ({
              Component: (await import('@/features/climbing/ClimbStatsPage')).ClimbStatsPage,
            }),
          },
          {
            path: 'climbing/grades',
            lazy: async () => ({
              Component: (await import('@/features/climbing/GradesPage')).GradesPage,
            }),
          },
          {
            path: 'goals',
            lazy: async () => ({ Component: (await import('@/features/goals/GoalsPage')).GoalsPage }),
          },
          {
            path: 'goals/new',
            handle: fullScreen,
            lazy: async () => ({ Component: (await import('@/features/goals/NewGoalPage')).NewGoalPage }),
          },
          {
            path: 'goals/:id',
            lazy: async () => ({ Component: (await import('@/features/goals/GoalPage')).GoalPage }),
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
          {
            path: 'more/profile',
            handle: fullScreen,
            lazy: async () => ({ Component: (await import('@/features/profile/ProfilePage')).ProfilePage }),
          },
          {
            path: 'more/profile/test',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/profile/LevelTestPage')).LevelTestPage,
            }),
          },
          {
            path: 'more/equipment',
            lazy: async () => ({
              Component: (await import('@/features/equipment/EquipmentPage')).EquipmentPage,
            }),
          },
          {
            path: 'more/equipment/new/:kind',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/equipment/EquipmentItemPage')).EquipmentItemPage,
            }),
          },
          {
            path: 'more/equipment/:id',
            handle: fullScreen,
            lazy: async () => ({
              Component: (await import('@/features/equipment/EquipmentItemPage')).EquipmentItemPage,
            }),
          },
          { path: '*', Component: NotFound },
        ],
      },
    ],
  },
]
