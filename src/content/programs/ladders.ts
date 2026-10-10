import type { EquipmentKind } from '@/db/types'
import type { LevelTestKey } from '@/content/level-test'
import { SKILLS, type Skill } from '@/content/skills'

/*
 * Progressions : pour chaque mouvement, les exercices du plus accessible au plus dur. Le programme
 * place chacun au bon échelon d'après le test de niveau, puis le fait monter quand toutes les séries
 * sont réussies en haut de la fourchette (voir progression.ts).
 */

/** Mouvements de base d'une séance. */
export type MovementId =
  | 'pushH'
  | 'pushV'
  | 'dip'
  | 'pullV'
  | 'pullH'
  | 'squat'
  | 'lunge'
  | 'hinge'
  | 'calves'
  | 'core'
  | 'compression'
  | 'fingers'

export interface LadderStep {
  /** Exercice de l'échelon ; les suivants le remplacent si le matériel manque. */
  exerciseIds: readonly string[]
  /**
   * Résultat au test de niveau à partir duquel on peut commencer à cet échelon.
   * Infinity : on n'y arrive qu'en progressant.
   */
  entry: number
  /** Échelon chargé (haltère, kettlebell) : seulement si l'on a au moins cette charge. */
  minLoadKg?: number
  /** Objectif de l'échelon (figures) : à atteindre sur chaque série pour passer au suivant. */
  goal?: { kind: 'reps' | 'time'; value: number }
}

export interface Ladder {
  id: string
  name: string
  /** Résultat du test de niveau qui place le départ (null : premier échelon accessible). */
  test: LevelTestKey | null
  /** Tirage ou suspension : sollicite doigts et avant-bras (évité la veille et le jour de l'escalade). */
  grip: boolean
  steps: readonly LadderStep[]
}

const step = (exerciseIds: string | readonly string[], entry: number, minLoadKg?: number): LadderStep => ({
  exerciseIds: typeof exerciseIds === 'string' ? [exerciseIds] : exerciseIds,
  entry,
  ...(minLoadKg === undefined ? {} : { minLoadKg }),
})

const NEVER = Number.POSITIVE_INFINITY

export const MOVEMENT_LADDERS: Readonly<Record<MovementId, Ladder>> = {
  pushH: {
    id: 'pushH',
    name: 'Pompes',
    test: 'pushUps',
    grip: false,
    steps: [
      step('pushup-wall', 0),
      step('pushup-incline', 3),
      step('pushup-knee', 6),
      step('pushup', 12),
      step('pushup-decline', 22),
      step('pushup-diamond', 28),
      step('pushup-archer', 38),
      step('pushup-pseudo-planche', 48),
      step('pushup-one-arm', NEVER),
    ],
  },
  pushV: {
    id: 'pushV',
    name: 'Poussée verticale',
    test: 'pushUps',
    grip: false,
    steps: [
      step('pike-pushup', 8),
      step('pike-pushup-elevated', 25),
      step('hspu-wall-negative', 35),
      step('hspu-wall', NEVER),
    ],
  },
  dip: {
    id: 'dip',
    name: 'Dips',
    test: 'dips',
    grip: false,
    steps: [
      step('dip-bench', 0),
      step('dip-negative', 2),
      step('dip-band', 4),
      step('dip', 8),
      step('dip-ring', 20),
    ],
  },
  pullV: {
    id: 'pullV',
    name: 'Tractions',
    test: 'pullUps',
    grip: true,
    steps: [
      step('pullup-negative', 0),
      step('pullup-band', 2),
      step('pullup', 6),
      step('pullup-chest-to-bar', 13),
      step('pullup-archer', 17),
      step('pullup-one-arm-negative', 22),
      step('pullup-one-arm', NEVER),
    ],
  },
  pullH: {
    id: 'pullH',
    name: 'Rowing',
    test: 'pullUps',
    grip: true,
    steps: [
      step('row-door', 0),
      step('row-table', 0),
      step(['One-Arm_Dumbbell_Row', 'Bent_Over_Two-Dumbbell_Row'], 0, 6),
      step('row-incline', 0),
      step('row-australian', 3),
      step('row-australian-elevated', 8),
      step('row-archer', 14),
      step('front-lever-row-tuck', 20),
    ],
  },
  squat: {
    id: 'squat',
    name: 'Squats',
    test: 'squats',
    grip: false,
    steps: [
      step('squat-assisted', 0),
      step('squat', 8),
      step('Goblet_Squat', 25, 8),
      step('split-squat', 30),
      step('bulgarian-split-squat', 40),
      step('Split_Squat_with_Dumbbells', 50, 6),
      step('pistol-box', 55),
      step('pistol-assisted', 65),
      step('pistol', NEVER),
    ],
  },
  lunge: {
    id: 'lunge',
    name: 'Fentes',
    test: 'squats',
    grip: false,
    steps: [step('step-up', 0), step('lunge', 10), step('Dumbbell_Lunges', 25, 6), step('shrimp-squat', 70)],
  },
  calves: {
    id: 'calves',
    name: 'Mollets',
    test: 'squats',
    grip: false,
    steps: [step('calf-raise', 0), step('calf-raise-single', 30)],
  },
  hinge: {
    id: 'hinge',
    name: 'Arrière des jambes',
    test: 'squats',
    grip: false,
    steps: [
      step('glute-bridge', 0),
      step('Stiff-Legged_Dumbbell_Deadlift', 15, 8),
      step('glute-bridge-single', 25),
      step('single-leg-rdl', 35),
      step('Kettlebell_One-Legged_Deadlift', 45, 8),
      step('nordic-curl-negative', 60),
    ],
  },
  core: {
    id: 'core',
    name: 'Gainage',
    test: 'plankSec',
    grip: false,
    steps: [
      step('plank', 0),
      step('hollow-hold-tuck', 40),
      step('hollow-hold', 75),
      step('hollow-rock', 110),
      step('ab-wheel', 140),
      step('dragon-flag-negative', NEVER),
    ],
  },
  compression: {
    id: 'compression',
    name: 'Relevés de jambes',
    test: 'plankSec',
    grip: true,
    steps: [
      step('leg-raise-lying', 0),
      step('knee-raise-hanging', 45),
      step('leg-raise-hanging', 90),
      step('toes-to-bar', 150),
    ],
  },
  fingers: {
    id: 'fingers',
    name: 'Doigts',
    test: 'deadHangSec',
    grip: true,
    steps: [step('dead-hang', 0), step('hangboard-hang', 40), step('hangboard-repeaters', 75)],
  },
}

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

/** Figures qui se travaillent en tirage ou suspendu (doigts et avant-bras). */
const GRIP_SKILLS = new Set(['muscleUp', 'frontLever', 'backLever', 'oneArmPullup', 'flag'])

export const SKILL_LADDER_PREFIX = 'skill:'

function skillLadder(skill: Skill): Ladder {
  return {
    id: `${SKILL_LADDER_PREFIX}${skill.id}`,
    name: skill.name,
    test: null,
    grip: GRIP_SKILLS.has(skill.id),
    steps: skill.steps.map((s) => ({ exerciseIds: [s.exerciseId], entry: NEVER, goal: s.target })),
  }
}

export const SKILL_LADDERS: readonly Ladder[] = SKILLS.map(skillLadder)

const LADDERS = new Map<string, Ladder>(
  [...Object.values(MOVEMENT_LADDERS), ...SKILL_LADDERS].map((ladder) => [ladder.id, ladder]),
)

export function ladderFor(id: string | null): Ladder | null {
  return id === null ? null : (LADDERS.get(id) ?? null)
}

export function skillLadderId(skillId: string): string {
  return `${SKILL_LADDER_PREFIX}${skillId}`
}

/** Index de l'échelon où se trouve un exercice (-1 s'il n'en fait pas partie). */
export function stepIndexOf(ladder: Ladder, exerciseId: string): number {
  return ladder.steps.findIndex((s) => s.exerciseIds.includes(exerciseId))
}

/* ------------------------------------------------------------------ */
/* Charges                                                             */
/* ------------------------------------------------------------------ */

/** Matériel qui porte des charges (les poids de l'inventaire). */
export const WEIGHT_KINDS: readonly EquipmentKind[] = ['dumbbells', 'kettlebell', 'weightVest', 'plates']

const HELD: readonly EquipmentKind[] = ['dumbbells', 'kettlebell', 'weightVest']
const VEST: readonly EquipmentKind[] = ['weightVest']

/**
 * Exercices au poids du corps que l'on peut lester quand la version plus dure n'est pas accessible :
 * haltère ou kettlebell tenus (ou entre les pieds pour les tractions), gilet lesté.
 */
export const EXTRA_LOAD: Readonly<Record<string, readonly EquipmentKind[]>> = {
  pullup: HELD,
  chinup: HELD,
  'pullup-chest-to-bar': VEST,
  dip: HELD,
  'dip-ring': VEST,
  pushup: VEST,
  'pushup-decline': VEST,
  'pushup-diamond': VEST,
  'pike-pushup': VEST,
  'row-australian': VEST,
  'row-australian-elevated': VEST,
  squat: HELD,
  'split-squat': HELD,
  'bulgarian-split-squat': HELD,
  lunge: HELD,
  'step-up': HELD,
  'pistol-box': HELD,
  pistol: HELD,
  'glute-bridge': HELD,
  'glute-bridge-single': HELD,
  'hip-thrust': HELD,
  'single-leg-rdl': HELD,
  'calf-raise': HELD,
  'calf-raise-single': HELD,
}
