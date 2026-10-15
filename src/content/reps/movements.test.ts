import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Exercise } from '@/db/types'
import { CALITRACK_EXERCISES, FEDB_MERGED_INTO } from '@/content/exercises/calisthenics'
import { MOVEMENT_LADDERS } from '@/content/programs/ladders'
import { COUNTED_EXERCISES, countableVariant, NOT_COUNTED } from './movements'
import { specFor } from './specs'
import type { CountedMovement } from './types'

const FEDB = JSON.parse(readFileSync(join(process.cwd(), 'src/data/fedb.json'), 'utf8')) as Exercise[]
const CATALOG = new Map([...CALITRACK_EXERCISES, ...FEDB].map((exercise) => [exercise.id, exercise]))

const counted = Object.keys(COUNTED_EXERCISES)
const notCounted = Object.keys(NOT_COUNTED)

function idsOf(movement: CountedMovement): string[] {
  return counted.filter((id) => COUNTED_EXERCISES[id]?.movement === movement)
}

describe('exercices comptés à la caméra', () => {
  it('existent tous, se font en répétitions, des deux côtés à la fois', () => {
    expect(counted.filter((id) => !CATALOG.has(id))).toEqual([])
    expect(counted.filter((id) => CATALOG.get(id)?.measure !== 'reps')).toEqual([])
    expect(counted.filter((id) => CATALOG.get(id)?.unilateral !== false)).toEqual([])
    expect(counted.filter((id) => Object.hasOwn(FEDB_MERGED_INTO, id))).toEqual([])
  })

  it('couvrent les squats, pompes, dips, tractions et curls prévus', () => {
    expect(counted).toHaveLength(66)
    expect(idsOf('squat')).toHaveLength(18)
    expect(idsOf('pushup')).toHaveLength(14)
    expect(idsOf('dip')).toHaveLength(7)
    expect(idsOf('pullup')).toHaveLength(9)
    expect(idsOf('curl')).toHaveLength(18)
    expect(idsOf('curl')).toContain('curl-band')
  })

  it('appliquent les réglages des variantes', () => {
    expect(COUNTED_EXERCISES['pushup']).toEqual({ movement: 'pushup', overrides: {} })
    expect(COUNTED_EXERCISES['pushup-knee']).toEqual({ movement: 'pushup', overrides: { bodyLine: 'knee' } })
    const inclined = counted.filter((id) => COUNTED_EXERCISES[id]?.overrides.minTorsoTilt === 25)
    expect(inclined.sort()).toEqual(
      [
        'pushup-incline',
        'Incline_Push-Up_Medium',
        'Incline_Push-Up_Wide',
        'Incline_Push-Up_Close-Grip',
        'Incline_Push-Up_Reverse_Grip',
        'Suspended_Push-Up',
      ].sort(),
    )
    const leaning = counted.filter((id) => COUNTED_EXERCISES[id]?.overrides.maxTorsoTilt === 50)
    expect(leaning.sort()).toEqual(['Dips_-_Chest_Version', 'dip-straight-bar'])
    const bar = counted.filter((id) => COUNTED_EXERCISES[id]?.overrides.bothArms === true)
    expect(bar).toHaveLength(8)
    expect(bar.every((id) => COUNTED_EXERCISES[id]?.movement === 'curl')).toBe(true)
    expect(COUNTED_EXERCISES['Dumbbell_Alternate_Bicep_Curl']).toEqual({ movement: 'curl', overrides: {} })
  })

  it('s’enregistrent sans vérification seulement si la variante est vérifiée : squats et curl alterné', () => {
    const validated = (movement: CountedMovement) =>
      idsOf(movement).filter((id) => specFor(COUNTED_EXERCISES[id]!).validated)
    expect(validated('squat')).toEqual(idsOf('squat'))
    // Les curls de MM-Fit sont tous alternés aux haltères : ni curls simultanés, ni élastique, ni barre.
    expect(validated('curl')).toEqual(['Dumbbell_Alternate_Bicep_Curl'])
    expect(idsOf('curl').filter((id) => COUNTED_EXERCISES[id]?.overrides.trial === true)).toHaveLength(9)
    for (const movement of ['pushup', 'dip', 'pullup'] as const) expect(validated(movement)).toEqual([])
  })
})

describe('répétition comptée', () => {
  it('suit la fiche de l’exercice : un bras puis l’autre font une répétition quand elle le dit', () => {
    const saysPairs = (id: string) =>
      CATALOG.get(id)?.instructions.some((line) =>
        line.includes('Les deux bras comptent pour une répétition'),
      ) === true
    const pairs = counted.filter((id) => COUNTED_EXERCISES[id]?.overrides.armPairs === true)
    expect(pairs).toEqual(counted.filter(saysPairs))
    expect(pairs).toEqual(['Alternate_Hammer_Curl'])
    expect(specFor(COUNTED_EXERCISES.Alternate_Hammer_Curl!)).toMatchObject({
      armPairs: true,
      validated: false,
    })
    expect(specFor(COUNTED_EXERCISES.Dumbbell_Alternate_Bicep_Curl!).armPairs).toBe(false)
  })
})

describe('exercices pas comptés', () => {
  it('existent tous et ne sont pas aussi dans la liste des comptés', () => {
    expect(notCounted.filter((id) => !CATALOG.has(id))).toEqual([])
    expect(notCounted.filter((id) => Object.hasOwn(COUNTED_EXERCISES, id))).toEqual([])
    expect(Object.values(NOT_COUNTED).every((reason) => reason.length > 0)).toBe(true)
  })

  it('tranchent chaque échelon en répétitions des pompes, dips, tractions et squats', () => {
    const steps = [
      MOVEMENT_LADDERS.pushH,
      MOVEMENT_LADDERS.dip,
      MOVEMENT_LADDERS.pullV,
      MOVEMENT_LADDERS.squat,
    ]
      .flatMap((ladder) => ladder.steps.flatMap((step) => step.exerciseIds))
      .filter((id) => CATALOG.get(id)?.measure === 'reps')
    const undecided = steps.filter(
      (id) => Object.hasOwn(COUNTED_EXERCISES, id) === Object.hasOwn(NOT_COUNTED, id),
    )
    expect(undecided).toEqual([])
    expect(steps.filter((id) => Object.hasOwn(NOT_COUNTED, id)).sort()).toEqual(
      [
        'pushup-wall',
        'pushup-archer',
        'pushup-pseudo-planche',
        'pushup-one-arm',
        'dip-negative',
        'pullup-negative',
        'pullup-archer',
        'pullup-one-arm-negative',
        'pullup-one-arm',
        'split-squat',
        'bulgarian-split-squat',
        'Split_Squat_with_Dumbbells',
        'pistol-box',
        'pistol-assisted',
        'pistol',
      ].sort(),
    )
  })
})

describe('countableVariant', () => {
  it('rend la variante d’un exercice compté en répétitions', () => {
    expect(countableVariant('pushup', 'reps')).toEqual({ movement: 'pushup', overrides: {} })
    expect(countableVariant('Barbell_Curl', 'reps')).toEqual({
      movement: 'curl',
      overrides: { bothArms: true },
    })
  })

  it('ne compte ni au temps, ni un exercice inconnu, perso ou pas compté', () => {
    expect(countableVariant('pushup', 'time')).toBeNull()
    expect(countableVariant('plank', 'time')).toBeNull()
    expect(countableVariant('plank', 'reps')).toBeNull()
    expect(countableVariant('pistol', 'reps')).toBeNull()
    expect(countableVariant('perso-1a2b3c', 'reps')).toBeNull()
    expect(countableVariant('inconnu', 'reps')).toBeNull()
    expect(countableVariant('constructor', 'reps')).toBeNull()
  })
})
