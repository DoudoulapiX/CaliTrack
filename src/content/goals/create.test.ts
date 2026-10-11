import { describe, expect, it } from 'vitest'
import { skillFor } from '@/content/skills'
import { sequentialIds } from '@/test/fixtures'
import {
  bodyweightGoal,
  bodyweightGoalError,
  climbingGoal,
  climbingGoalError,
  climbingGoalTitle,
  customGoal,
  customGoalError,
  deadlineError,
  exerciseGoal,
  exerciseGoalError,
  skillGoal,
  suggestedGoalTitle,
  withSuggestedTitle,
} from './create'

const NOW = '2026-10-11T08:00:00.000Z'
const BASICS = { title: '', deadline: null, pinned: false }

describe('création d’un objectif', () => {
  it('reprend les étapes d’une figure', () => {
    const skill = skillFor('handstand')
    if (!skill) throw new Error('handstand')
    const goal = skillGoal(skill, { ...BASICS, pinned: true }, (id) => `Nom de ${id}`, NOW, sequentialIds())
    expect(goal).toMatchObject({
      id: 'id-1',
      kind: 'skill',
      title: 'Équilibre sur les mains',
      skillId: 'handstand',
      pinned: true,
      archived: false,
      achievedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(goal.milestones).toHaveLength(skill.steps.length)
    expect(goal.milestones[0]).toEqual({
      id: 'id-2',
      title: 'Nom de crow-pose',
      criterion: { kind: 'time', exerciseId: 'crow-pose', value: 30 },
      achievedAt: null,
    })
    const renamed = skillGoal(
      skill,
      { ...BASICS, title: '  Mon équilibre ' },
      (id) => id,
      NOW,
      sequentialIds(),
    )
    expect(renamed.title).toBe('Mon équilibre')
  })

  it('donne un titre clair à chaque genre d’objectif', () => {
    const ids = sequentialIds()
    const reps = exerciseGoal(
      { exerciseId: 'pullup', name: 'Tractions', metric: 'reps', start: 8, target: 20, unit: 'kg' },
      BASICS,
      NOW,
      ids,
    )
    expect(reps).toMatchObject({
      kind: 'exercise',
      title: 'Tractions\u00a0: 20 rép.',
      exerciseId: 'pullup',
      metric: 'reps',
      startValue: 8,
      targetValue: 20,
    })
    const hold = exerciseGoal(
      { exerciseId: 'plank', name: 'Gainage', metric: 'time', start: 75, target: 180, unit: 'kg' },
      BASICS,
      NOW,
      ids,
    )
    expect(hold.title).toBe('Gainage\u00a0: 3 min')
    const load = exerciseGoal(
      { exerciseId: 'pullup', name: 'Tractions', metric: 'load', start: 0, target: 20, unit: 'lb' },
      BASICS,
      NOW,
      ids,
    )
    expect(load.title).toBe('Tractions\u00a0: 44 lb')

    const weight = bodyweightGoal({ startKg: 82, targetKg: 75, unit: 'kg' }, BASICS, NOW, ids)
    expect(weight).toMatchObject({
      kind: 'bodyweight',
      title: 'Peser 75 kg',
      startValue: 82,
      targetValue: 75,
    })

    const grade = { key: 'bleu', label: 'Bleu', color: '#2563eb', font: '6A – 6B' }
    const climb = climbingGoal({ scaleId: 'vertical-art', grade, count: 5 }, BASICS, NOW, ids)
    expect(climb).toMatchObject({
      kind: 'climbing',
      title: '5 blocs bleus',
      scaleId: 'vertical-art',
      gradeKey: 'bleu',
      targetCount: 5,
    })

    const custom = customGoal({ ...BASICS, title: 'Semi-marathon' }, NOW, ids)
    expect(custom).toMatchObject({ kind: 'custom', title: 'Semi-marathon', manualProgress: 0 })
  })

  it('accorde la couleur des blocs', () => {
    expect(climbingGoalTitle(1, { label: 'Noir' })).toBe('1 bloc noir')
    expect(climbingGoalTitle(5, { label: 'Bleu' })).toBe('5 blocs bleus')
    expect(climbingGoalTitle(2, { label: 'Orange' })).toBe('2 blocs orange')
    expect(climbingGoalTitle(3, { label: '6A' })).toBe('3 blocs en 6A')
  })
})

describe('vérifications', () => {
  it('refusent une échéance passée, sauf si on la garde', () => {
    expect(deadlineError(null, '2026-10-11')).toBeNull()
    expect(deadlineError('2026-10-11', '2026-10-11')).toBeNull()
    expect(deadlineError('2026-10-10', '2026-10-11')).toBe('L’échéance ne peut pas être déjà passée.')
    expect(deadlineError('2026-10-10', '2026-10-11', true)).toBeNull()
  })

  it('demandent un exercice et une cible au-dessus du record', () => {
    const base = { exerciseId: 'pullup', target: 20, start: 8, metric: 'reps' as const, unit: 'kg' as const }
    expect(exerciseGoalError(base)).toBeNull()
    expect(exerciseGoalError({ ...base, exerciseId: null })).toBe('Choisis un exercice.')
    expect(exerciseGoalError({ ...base, target: null })).toBe('Indique ce que tu vises.')
    expect(exerciseGoalError({ ...base, target: 8 })).toBe(
      'Ton record est déjà de 8 rép.\u00a0: vise plus haut.',
    )
    expect(exerciseGoalError({ ...base, metric: 'time', start: 90, target: 60 })).toBe(
      'Ton record est déjà de 1 min 30 s\u00a0: vise plus haut.',
    )
  })

  it('demandent deux poids différents et plausibles', () => {
    expect(bodyweightGoalError(82, 75, 'kg')).toBeNull()
    expect(bodyweightGoalError(null, 75, 'kg')).toBe('Indique ton poids actuel.')
    expect(bodyweightGoalError(82, null, 'kg')).toBe('Indique le poids que tu vises.')
    expect(bodyweightGoalError(82, 82.01, 'kg')).toBe(
      'Le poids visé doit être différent de ton poids actuel.',
    )
    expect(bodyweightGoalError(82, 400, 'kg')).toBe('Le poids doit être entre 25 kg et 300 kg.')
  })

  it('demandent un niveau d’escalade, un nombre de blocs et un nom', () => {
    expect(climbingGoalError('bleu', 5)).toBeNull()
    expect(climbingGoalError(null, 5)).toBe('Choisis un niveau.')
    expect(climbingGoalError('bleu', 0)).toBe('Le nombre de blocs doit être entre 1 et 100.')
    expect(climbingGoalError('bleu', 3, 3)).toBe(
      'Tu as déjà réussi 3 blocs à ce niveau ou plus dur\u00a0: vise plus haut.',
    )
    expect(climbingGoalError('bleu', 4, 3)).toBeNull()
    expect(customGoalError('  ')).toBe('Donne un nom à ton objectif.')
    expect(customGoalError('Semi')).toBeNull()
  })
})

describe('titre proposé', () => {
  const names = {
    exercise: (id: string) => (id === 'pullup' ? 'Tractions' : undefined),
    grade: (key: string) => (key === 'bleu' ? { label: 'Bleu' } : undefined),
  }

  it('suit la nouvelle cible tant que le titre n’a pas été changé', () => {
    const goal = exerciseGoal(
      { exerciseId: 'pullup', name: 'Tractions', metric: 'reps', start: 8, target: 20, unit: 'kg' },
      BASICS,
      NOW,
      sequentialIds(),
    )
    expect(suggestedGoalTitle(goal, names, 'kg')).toBe('Tractions\u00a0: 20 rép.')
    expect(withSuggestedTitle(goal, { ...goal, targetValue: 15 }, names, 'kg').title).toBe(
      'Tractions\u00a0: 15 rép.',
    )
    // Un nom choisi à la main est gardé, et un nom changé pendant la modification aussi.
    const named = { ...goal, title: 'Mes tractions' }
    expect(withSuggestedTitle(named, { ...named, targetValue: 15 }, names, 'kg').title).toBe('Mes tractions')
    expect(withSuggestedTitle(goal, { ...goal, title: 'Vingt', targetValue: 15 }, names, 'kg').title).toBe(
      'Vingt',
    )

    const climb = climbingGoal(
      {
        scaleId: 'vertical-art',
        grade: { key: 'bleu', label: 'Bleu', color: '', font: '' },
        count: 1,
      },
      BASICS,
      NOW,
      sequentialIds(),
    )
    expect(withSuggestedTitle(climb, { ...climb, targetCount: 3 }, names, 'kg').title).toBe('3 blocs bleus')
    const weight = bodyweightGoal({ startKg: 82, targetKg: 75, unit: 'kg' }, BASICS, NOW, sequentialIds())
    expect(withSuggestedTitle(weight, { ...weight, targetValue: 78 }, names, 'kg').title).toBe('Peser 78 kg')
    expect(
      suggestedGoalTitle(customGoal({ ...BASICS, title: 'Semi' }, NOW, sequentialIds()), names, 'kg'),
    ).toBeNull()
  })
})
