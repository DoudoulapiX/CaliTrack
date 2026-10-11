import { customGoal } from '@/content/goals/create'
import {
  withAchieved,
  withManualProgress,
  withMilestoneAchieved,
  withStepTarget,
  withoutStep,
} from '@/content/goals/edit'
import { resetDb } from '@/test/db'
import { sequentialIds } from '@/test/fixtures'
import { db } from './db'
import { ensureSeeded } from './seed'
import { addSkillGoals, deleteBodyMetric, deleteGoal, logWeight, saveGoal } from './goals'

const NOW = '2026-10-11T08:00:00.000Z'

beforeEach(async () => {
  await resetDb()
  await ensureSeeded()
})

describe('objectifs enregistrés', () => {
  it('enregistre, vérifie et supprime un objectif', async () => {
    const goal = customGoal({ title: 'Semi-marathon', deadline: null, pinned: false }, NOW, () => 'g1')
    await saveGoal(withManualProgress(goal, 30, NOW))
    expect(await db.goals.get('g1')).toMatchObject({ title: 'Semi-marathon', manualProgress: 30 })
    await expect(saveGoal({ ...goal, manualProgress: 150 })).rejects.toThrow()
    await expect(saveGoal({ ...goal, deadline: '31/12/2026' })).rejects.toThrow()
    await deleteGoal('g1')
    expect(await db.goals.count()).toBe(0)
  })

  it('crée les figures visées une seule fois, épinglées', async () => {
    const first = await addSkillGoals(['muscleUp', 'inconnue', 'muscleUp'], (id) => id)
    expect(first.map((g) => [g.skillId, g.pinned])).toEqual([['muscleUp', true]])
    const second = await addSkillGoals(['muscleUp', 'frontLever'], (id) => id)
    expect(second.map((g) => g.skillId)).toEqual(['frontLever'])
    expect(await db.goals.count()).toBe(2)
  })
})

describe('modifications d’un objectif', () => {
  const ids = sequentialIds()
  const goal = {
    ...customGoal({ title: 'Test', deadline: null, pinned: false }, NOW, ids),
    kind: 'skill' as const,
    milestones: [
      {
        id: 'a',
        title: 'A',
        criterion: { kind: 'reps' as const, exerciseId: 'pullup', value: 8 },
        achievedAt: null,
      },
      { id: 'b', title: 'B', criterion: null, achievedAt: null },
    ],
  }

  it('cochent une étape, changent sa cible ou la retirent', () => {
    const checked = withMilestoneAchieved(goal, 'b', true, NOW)
    expect(checked.milestones[1]?.achievedAt).toBe(NOW)
    expect(
      withMilestoneAchieved(checked, 'b', true, '2026-12-01T00:00:00.000Z').milestones[1]?.achievedAt,
    ).toBe(NOW)
    expect(withMilestoneAchieved(checked, 'b', false, NOW).milestones[1]?.achievedAt).toBeNull()
    expect(withStepTarget(goal, 'a', 10).milestones[0]?.criterion?.value).toBe(10)
    expect(withStepTarget(goal, 'b', 10).milestones[1]?.criterion).toBeNull()
    const one = withoutStep(goal, 'a')
    expect(one.milestones.map((m) => m.id)).toEqual(['b'])
    expect(withoutStep(one, 'b')).toBe(one)
  })

  it('notent l’avancement à la main et marquent l’objectif atteint', () => {
    expect(withManualProgress(goal, 130, NOW)).toMatchObject({ manualProgress: 100, achievedAt: NOW })
    expect(withManualProgress({ ...goal, achievedAt: NOW }, 55.4, NOW)).toMatchObject({
      manualProgress: 55,
      achievedAt: null,
    })
    expect(withAchieved(goal, true, NOW).achievedAt).toBe(NOW)
    expect(withAchieved({ ...goal, achievedAt: NOW }, false, NOW).achievedAt).toBeNull()
  })
})

describe('pesées', () => {
  it('gardent une pesée par jour et le profil suit la plus récente', async () => {
    await logWeight('2026-10-08', 80.4)
    expect((await db.profile.get('me'))?.weightKg).toBe(80.4)
    await logWeight('2026-10-08', 80)
    await logWeight('2026-10-01', 82)
    const metrics = await db.bodyMetrics.orderBy('date').toArray()
    expect(metrics.map((m) => [m.date, m.weightKg])).toEqual([
      ['2026-10-01', 82],
      ['2026-10-08', 80],
    ])
    expect((await db.profile.get('me'))?.weightKg).toBe(80)

    const latest = metrics[1]
    if (!latest) throw new Error('pesée')
    await deleteBodyMetric(latest.id)
    expect((await db.profile.get('me'))?.weightKg).toBe(82)
    await expect(logWeight('2026-10-09', 3)).rejects.toThrow()
    await expect(logWeight('2026-10-09', Number.NaN)).rejects.toThrow()
  })
})
