import { describe, expect, it } from 'vitest'
import { defaultProfile } from '@/db/defaults'
import { CALITRACK_EXERCISES } from './exercises/calisthenics'
import { SKILLS, skillFor, skillName } from './skills'

const EXERCISES = new Map(CALITRACK_EXERCISES.map((e) => [e.id, e]))

describe('figures (skills)', () => {
  it('ont des identifiants uniques', () => {
    const ids = SKILLS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z]+$/)
  })

  it('progressent par des exercices CaliTrack mesurés comme il faut', () => {
    const problems: string[] = []
    for (const skill of SKILLS) {
      expect(skill.steps.length, skill.id).toBeGreaterThanOrEqual(3)
      for (const step of skill.steps) {
        const exercise = EXERCISES.get(step.exerciseId)
        if (!exercise) problems.push(`${skill.id} : ${step.exerciseId} n’existe pas`)
        else if ((exercise.measure === 'time') !== (step.target.kind === 'time'))
          problems.push(`${skill.id} : ${step.exerciseId} se mesure en ${exercise.measure}`)
        if (!Number.isInteger(step.target.value) || step.target.value <= 0)
          problems.push(`${skill.id} : objectif invalide pour ${step.exerciseId}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('ne répètent un exercice que pour un objectif plus élevé', () => {
    for (const skill of SKILLS) {
      const best = new Map<string, number>()
      for (const step of skill.steps) {
        const previous = best.get(step.exerciseId)
        if (previous !== undefined) expect(step.target.value, skill.id).toBeGreaterThan(previous)
        best.set(step.exerciseId, step.target.value)
      }
    }
  })

  it('contiennent les figures du profil par défaut', () => {
    for (const id of defaultProfile().targetSkills) expect(skillFor(id), id).toBeDefined()
    expect(skillName('muscleUp')).toBe('Muscle-up')
    expect(skillName('inconnue')).toBe('Figure inconnue')
  })
})
