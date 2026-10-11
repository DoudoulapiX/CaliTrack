import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProfile } from '@/app/data-context'
import { loadCiqual, type FoodItem } from '@/content/nutrition/foods'
import { computeTargets, type TargetsResult } from '@/content/nutrition/targets'
import { db } from '@/db/db'
import { recentFoods } from '@/db/nutrition'
import type { Food, FoodEntry, NutritionGoals } from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { useBodyMetrics } from '@/features/goals/useGoals'
import { weighInsOf } from '@/features/today/today-view'

/** Les aliments notés un jour (undefined pendant le chargement). */
export function useDayEntries(day: ISODate): FoodEntry[] | undefined {
  return useLiveQuery(() => db.foodEntries.where('date').equals(day).toArray(), [day])
}

/** Les objectifs caloriques enregistrés (undefined pendant le chargement). */
export function useNutritionGoals(): NutritionGoals | undefined {
  return useLiveQuery(async () => db.nutritionGoals.get('me'), [])
}

/** Le poids le plus récent : dernière pesée, sinon celui du profil (undefined pendant le chargement). */
export function useCurrentWeightKg(): number | null | undefined {
  const metrics = useBodyMetrics()
  const profile = useProfile()
  if (metrics === undefined) return undefined
  return weighInsOf(metrics).at(-1)?.kg ?? profile.weightKg
}

/** Les objectifs du jour, calculés d'après le profil, le poids et les réglages (undefined pendant le chargement). */
export function useTargets(): { goals: NutritionGoals; result: TargetsResult } | undefined {
  const goals = useNutritionGoals()
  const weightKg = useCurrentWeightKg()
  const profile = useProfile()
  return useMemo(() => {
    if (goals === undefined || weightKg === undefined) return undefined
    return { goals, result: computeTargets(profile, weightKg, goals, new Date().getFullYear()) }
  }, [goals, weightKg, profile])
}

/** Les aliments perso et produits scannés, par nom. */
export function useFoods(): Food[] | undefined {
  return useLiveQuery(async () => {
    const foods = await db.foods.toArray()
    return foods.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [])
}

/** Les aliments notés récemment, à reprendre en un geste. */
export function useRecentFoods(): FoodItem[] | undefined {
  return useLiveQuery(() => recentFoods(), [])
}

export type CiqualState = { status: 'loading' } | { status: 'ready'; items: FoodItem[] } | { status: 'error' }

/** La table Ciqual, chargée à la première ouverture de l'écran (« retry » pour réessayer après un échec). */
export function useCiqual(): { state: CiqualState; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<CiqualState>({ status: 'loading' })
  useEffect(() => {
    let active = true
    loadCiqual().then(
      (items) => {
        if (active) setState({ status: 'ready', items })
      },
      () => {
        if (active) setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [attempt])
  return {
    state,
    retry: () => {
      setState({ status: 'loading' })
      setAttempt((value) => value + 1)
    },
  }
}
