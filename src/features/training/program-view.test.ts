import type { Location, ProgramSession, ProgramSlot } from '@/db/types'
import { testCatalog } from '@/test/fixtures'
import {
  compactDuration,
  daysLabel,
  ladderInfo,
  locationLabel,
  programOutdated,
  sessionSummary,
  slotPatch,
  workCount,
} from './program-view'

function slot(patch: Partial<ProgramSlot> = {}): ProgramSlot {
  return {
    id: 's',
    exerciseId: 'pushup',
    ladderId: 'pushH',
    sets: 3,
    target: { kind: 'reps', min: 5, max: 8 },
    loadKg: null,
    restSec: 120,
    note: '',
    successStreak: 1,
    failStreak: 0,
    ...patch,
  }
}

function session(blocks: ProgramSession['blocks']): ProgramSession {
  return { id: 'x', name: 'A', emphasis: 'full', weekdays: [1], blocks }
}

describe('affichage des programmes', () => {
  it('écrit les jours et les durées en court', () => {
    expect(daysLabel([5, 1, 3])).toBe('Lun, Mer, Ven')
    expect(daysLabel([])).toBe('Pas de jour prévu')
    expect(compactDuration(45)).toBe('45 s')
    expect(compactDuration(90)).toBe('1 min 30')
    expect(compactDuration(120)).toBe('2 min')
  })

  it('résume une séance sans compter l’échauffement ni les étirements', async () => {
    const { byId } = await testCatalog()
    const full = session([
      {
        id: 'w',
        kind: 'warmup',
        title: 'Échauffement',
        slots: [slot({ id: 'w1', exerciseId: 'jumping-jacks' })],
      },
      {
        id: 'r',
        kind: 'strength',
        title: 'Renforcement',
        slots: [slot(), slot({ id: 's2', exerciseId: 'dip' })],
      },
    ])
    expect(workCount(full)).toBe(2)
    expect(sessionSummary(full, byId)).toMatch(/^2 exercices · environ \d+ min$/)
    expect(sessionSummary(session([]), byId)).toBe('Séance vide')
    // Rien que de l'échauffement : on compte ce qu'il y a.
    const warmupOnly = session([full.blocks[0]!])
    expect(sessionSummary(warmupOnly, byId)).toMatch(/^1 exercice · /)
  })

  it('nomme le matériel d’un programme', () => {
    const home: Location = { id: 'home', name: 'Maison', icon: 'home', createdAt: '2026-10-10T08:00:00.000Z' }
    expect(locationLabel({ locationId: null }, [home])).toBe('Tout mon matériel')
    expect(locationLabel({ locationId: 'home' }, [home])).toBe('Maison')
    expect(locationLabel({ locationId: 'gone' }, [home])).toBe('Lieu supprimé')
  })

  it('situe un exercice dans sa progression, même quand il revient plus haut', () => {
    const one = {
      ladderId: 'skill:muscleUp',
      exerciseId: 'muscleup',
      target: { kind: 'reps', min: 1, max: 1 },
    } as const
    const five = { ...one, target: { kind: 'reps', min: 3, max: 5 } } as const
    expect(ladderInfo(one)).toMatchObject({ step: 5, total: 6, nextExerciseId: 'muscleup' })
    expect(ladderInfo(five)).toMatchObject({ step: 6, total: 6, nextExerciseId: null })
    expect(ladderInfo({ ...one, ladderId: null })).toBeNull()
    expect(ladderInfo({ ...one, exerciseId: 'squat' })).toBeNull()
  })

  it('ne garde que ce qui a changé', () => {
    const current = slot({ note: 'Mains larges' })
    const same = {
      exerciseId: 'pushup',
      sets: 3,
      target: { kind: 'reps', min: 5, max: 8 },
      loadKg: null,
      restSec: 120,
      note: ' Mains larges ',
    } as const
    expect(slotPatch(current, same)).toEqual({})
    expect(slotPatch(current, { ...same, sets: 4, target: { kind: 'reps', min: 5, max: 10 } })).toEqual({
      sets: 4,
      target: { kind: 'reps', min: 5, max: 10 },
    })
    expect(slotPatch(current, { ...same, note: '' })).toEqual({ note: '' })
  })

  it('repère un programme calculé qui ne suit plus le profil', () => {
    const program = {
      source: 'generated' as const,
      focuses: ['strength' as const],
      sessions: [session([]), { ...session([]), weekdays: [3 as const] }],
    }
    expect(programOutdated(program, { trainingDays: [3, 1], focuses: ['strength'] })).toBe(false)
    expect(programOutdated(program, { trainingDays: [1, 3, 5], focuses: ['strength'] })).toBe(true)
    expect(programOutdated(program, { trainingDays: [1, 3], focuses: ['strength', 'skills'] })).toBe(true)
    // Un programme fait main ne se compare pas au profil.
    expect(programOutdated({ ...program, source: 'custom' }, { trainingDays: [6], focuses: [] })).toBe(false)
  })
})
