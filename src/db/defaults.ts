import { nowISO } from '@/lib/dates'
import { VERTICAL_ART_SCALE_ID } from '@/content/grades'
import type { AppSettings, DashboardCardKey, Profile, TabKey } from './types'

export const DEFAULT_ACCENT = '#ff6a2b'

/** Onglets affichés par défaut (l'onglet « Plus » est toujours ajouté à la fin). */
export const DEFAULT_TABS: TabKey[] = ['today', 'calendar', 'training', 'climbing']
export const MAX_TABS = 4

export const DEFAULT_DASHBOARD_CARDS: DashboardCardKey[] = [
  'todaySession',
  'week',
  'goals',
  'climbing',
  'weight',
  'records',
]

export function defaultSettings(now: string = nowISO()): AppSettings {
  return {
    id: 'app',
    themeMode: 'system',
    accent: DEFAULT_ACCENT,
    weightUnit: 'kg',
    tabs: [...DEFAULT_TABS],
    dashboardCards: [...DEFAULT_DASHBOARD_CARDS],
    hiddenModules: [],
    restTimerDefaultSec: 90,
    restTimerSound: true,
    voiceCues: false,
    keepScreenOn: true,
    backupReminderDays: 7,
    lastBackupAt: null,
    onboardingDone: false,
    activeGradeScaleId: VERTICAL_ART_SCALE_ID,
    climbingGym: "Vertical'Art",
    currentLocationId: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function defaultProfile(now: string = nowISO()): Profile {
  return {
    id: 'me',
    firstName: '',
    birthYear: null,
    sex: null,
    heightCm: null,
    weightKg: null,
    experience: 'beginner',
    focuses: ['strength', 'skills'],
    targetSkills: ['muscleUp'],
    sessionsPerWeek: 3,
    sessionMinutes: 60,
    trainingDays: [1, 3, 5],
    climbingDays: [],
    levelTest: null,
    createdAt: now,
    updatedAt: now,
  }
}
