import { SKILLS } from '@/content/skills'
import { testCatalog } from '@/test/fixtures'
import {
  EXTRA_LOAD,
  ladderFor,
  MOVEMENT_LADDERS,
  SKILL_LADDERS,
  skillLadderId,
  stepIndexOf,
  WEIGHT_KINDS,
} from './ladders'

describe('progressions', () => {
  it('ne citent que des exercices du répertoire', async () => {
    const { byId } = await testCatalog()
    const ladders = [...Object.values(MOVEMENT_LADDERS), ...SKILL_LADDERS]
    const missing = ladders.flatMap((ladder) =>
      ladder.steps.flatMap((s) =>
        s.exerciseIds.filter((id) => !byId.has(id)).map((id) => `${ladder.id}: ${id}`),
      ),
    )
    expect(missing).toEqual([])
    expect(Object.keys(EXTRA_LOAD).filter((id) => !byId.has(id))).toEqual([])
  })

  it('vont du plus accessible au plus dur', () => {
    for (const ladder of Object.values(MOVEMENT_LADDERS)) {
      const entries = ladder.steps.map((s) => s.entry)
      expect(entries, ladder.id).toEqual([...entries].sort((a, b) => a - b))
      // La poussée verticale attend 8 pompes ; avant, les pompes et les dips la remplacent.
      expect(ladder.steps[0]?.entry, ladder.id).toBe(ladder.id === 'pushV' ? 8 : 0)
    }
  })

  it('ne réservent les échelons chargés qu’aux exercices avec des poids', async () => {
    const { byId } = await testCatalog()
    for (const ladder of Object.values(MOVEMENT_LADDERS)) {
      for (const s of ladder.steps.filter((x) => x.minLoadKg !== undefined)) {
        for (const id of s.exerciseIds) {
          const kinds = byId.get(id)?.equipment.flat() ?? []
          expect(
            kinds.some((kind) => WEIGHT_KINDS.includes(kind)),
            id,
          ).toBe(true)
        }
      }
    }
  })

  it('suivent les étapes des figures, avec la bonne mesure', async () => {
    const { byId } = await testCatalog()
    for (const skill of SKILLS) {
      const ladder = ladderFor(skillLadderId(skill.id))
      expect(ladder?.steps.map((s) => s.exerciseIds[0])).toEqual(skill.steps.map((s) => s.exerciseId))
      for (const s of skill.steps) expect(byId.get(s.exerciseId)?.measure, s.exerciseId).toBe(s.target.kind)
    }
  })

  it('mesurent chaque mouvement de base de la même façon d’un échelon à l’autre, sauf le gainage', async () => {
    const { byId } = await testCatalog()
    for (const ladder of Object.values(MOVEMENT_LADDERS)) {
      if (ladder.id === 'core' || ladder.id === 'fingers') continue
      const measures = new Set(ladder.steps.flatMap((s) => s.exerciseIds.map((id) => byId.get(id)?.measure)))
      expect([...measures], ladder.id).toEqual(['reps'])
    }
  })

  it('marquent le tirage et la suspension (à ménager autour de l’escalade)', () => {
    expect(MOVEMENT_LADDERS.pullV.grip).toBe(true)
    expect(MOVEMENT_LADDERS.fingers.grip).toBe(true)
    expect(MOVEMENT_LADDERS.pushH.grip).toBe(false)
    expect(ladderFor(skillLadderId('frontLever'))?.grip).toBe(true)
    expect(ladderFor(skillLadderId('planche'))?.grip).toBe(false)
  })

  it('retrouvent l’échelon d’un exercice', () => {
    expect(stepIndexOf(MOVEMENT_LADDERS.pullV, 'pullup')).toBe(2)
    expect(stepIndexOf(MOVEMENT_LADDERS.pullH, 'Bent_Over_Two-Dumbbell_Row')).toBe(2)
    expect(stepIndexOf(MOVEMENT_LADDERS.pullV, 'squat')).toBe(-1)
    expect(ladderFor(null)).toBeNull()
    expect(ladderFor('inconnu')).toBeNull()
  })
})
