import { defaultNutritionGoals } from '@/db/defaults'
import type { NutritionGoals } from '@/db/types'
import { computeTargets, mifflinStJeor } from './targets'

const charles = { sex: 'male' as const, birthYear: 1996, heightCm: 180 }
const goals = (patch: Partial<NutritionGoals> = {}) => ({ ...defaultNutritionGoals('x'), ...patch })

describe('objectifs caloriques', () => {
  it('estime le métabolisme de base (Mifflin-St Jeor)', () => {
    expect(mifflinStJeor('male', 80, 180, 30)).toBe(1780)
    expect(mifflinStJeor('female', 60, 165, 30)).toBe(1320.25)
    // Sexe inconnu : la moyenne des deux formules.
    expect(mifflinStJeor(null, 80, 180, 30)).toBe(1697)
  })

  it('calcule énergie et macronutriments selon l’activité et la phase', () => {
    const result = computeTargets(charles, 80, goals(), 2026)
    expect(result).toEqual({
      ok: true,
      // 1780 × 1,55 = 2759 → 2760 kcal ; protéines 1,8 g/kg ; lipides 25 % ; glucides le reste.
      targets: { kcal: 2760, proteinG: 145, fatG: 75, carbsG: 375 },
      computedKcal: 2760,
      bmr: 1780,
      sexUnknown: false,
      missing: [],
    })
    const cut = computeTargets(charles, 80, goals({ phase: 'cut' }), 2026)
    expect(cut.ok && cut.targets).toEqual({ kcal: 2210, proteinG: 175, fatG: 60, carbsG: 245 })
    const bulk = computeTargets(charles, 80, goals({ phase: 'bulk', activity: 'active' }), 2026)
    expect(bulk.ok && bulk.targets.kcal).toBe(3380)
  })

  it('garde les valeurs fixées à la main et recalcule le reste', () => {
    const result = computeTargets(charles, 80, goals({ kcal: 2500, proteinG: 160 }), 2026)
    expect(result.ok && result.targets).toEqual({ kcal: 2500, proteinG: 160, fatG: 70, carbsG: 310 })
    expect(result.ok && result.computedKcal).toBe(2760)
  })

  it('dit ce qu’il manque au profil, sauf si l’énergie est fixée à la main', () => {
    expect(computeTargets({ sex: null, birthYear: null, heightCm: null }, null, goals(), 2026)).toEqual({
      ok: false,
      missing: ['âge', 'taille', 'poids'],
    })
    const manual = computeTargets(
      { sex: null, birthYear: null, heightCm: 175 },
      null,
      goals({ kcal: 2000 }),
      2026,
    )
    expect(manual).toEqual({
      ok: true,
      targets: { kcal: 2000, proteinG: 125, fatG: 55, carbsG: 250 },
      computedKcal: null,
      bmr: null,
      sexUnknown: false,
      missing: ['âge', 'poids'],
    })
  })

  it('signale que la formule prend la moyenne quand le sexe manque', () => {
    const result = computeTargets({ ...charles, sex: 'other' }, 80, goals(), 2026)
    expect(result.ok && result.sexUnknown).toBe(true)
  })
})
