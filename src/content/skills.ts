import { frenchSpacing } from '@/lib/typography'

export interface SkillStep {
  /** Exercice du répertoire CaliTrack à réussir. */
  exerciseId: string
  /** Répétitions ou secondes à atteindre (selon la mesure de l'exercice). */
  target: { kind: 'reps' | 'time'; value: number }
}

export interface Skill {
  id: string
  name: string
  description: string
  /** Étapes, de la plus accessible à la figure finale. */
  steps: SkillStep[]
}

const reps = (exerciseId: string, value: number): SkillStep => ({
  exerciseId,
  target: { kind: 'reps', value },
})
const time = (exerciseId: string, value: number): SkillStep => ({
  exerciseId,
  target: { kind: 'time', value },
})

/** Figures de calisthénie que l'on peut viser (objectifs et programmes). */
export const SKILLS: readonly Skill[] = [
  {
    id: 'muscleUp',
    name: 'Muscle-up',
    description: 'Passer de la traction à l’appui au-dessus de la barre, d’un seul mouvement.',
    steps: [
      reps('pullup', 8),
      reps('pullup-chest-to-bar', 5),
      reps('muscleup-transition', 5),
      reps('muscleup-negative', 3),
      reps('muscleup', 1),
      reps('muscleup', 5),
    ],
  },
  {
    id: 'frontLever',
    name: 'Front lever',
    description: 'Suspendu à la barre, le corps à l’horizontale, face vers le ciel.',
    steps: [
      reps('pullup', 8),
      time('front-lever-tuck', 15),
      time('front-lever-adv-tuck', 10),
      time('front-lever-one-leg', 8),
      time('front-lever-straddle', 5),
      time('front-lever', 5),
    ],
  },
  {
    id: 'backLever',
    name: 'Back lever',
    description: 'Suspendu à la barre, le corps à l’horizontale, face vers le sol.',
    steps: [
      reps('skin-the-cat', 5),
      time('back-lever-tuck', 15),
      time('back-lever-adv-tuck', 10),
      time('back-lever-straddle', 8),
      time('back-lever', 5),
    ],
  },
  {
    id: 'planche',
    name: 'Planche',
    description: 'En appui sur les mains, le corps à l’horizontale au-dessus du sol.',
    steps: [
      time('planche-lean', 30),
      time('planche-tuck', 15),
      time('planche-adv-tuck', 10),
      time('planche-straddle', 5),
      time('planche-full', 3),
    ],
  },
  {
    id: 'handstand',
    name: 'Équilibre sur les mains',
    description: 'Tenir l’équilibre tête en bas, sans mur.',
    steps: [
      time('crow-pose', 30),
      time('handstand-wall', 60),
      time('handstand', 10),
      time('handstand', 30),
      time('handstand', 60),
    ],
  },
  {
    id: 'hspu',
    name: 'Pompes en équilibre',
    description: 'Des pompes tête en bas, en équilibre contre le mur.',
    steps: [
      reps('pike-pushup', 10),
      reps('pike-pushup-elevated', 8),
      reps('hspu-wall-negative', 5),
      reps('hspu-wall', 1),
      reps('hspu-wall', 8),
    ],
  },
  {
    id: 'lSit',
    name: 'L-sit',
    description: 'En appui sur les mains, jambes tendues à l’horizontale.',
    steps: [
      time('l-sit-tuck', 20),
      time('l-sit-one-leg', 15),
      time('l-sit', 10),
      time('l-sit', 30),
      time('v-sit', 5),
    ],
  },
  {
    id: 'flag',
    name: 'Drapeau',
    description: 'Tenir le corps à l’horizontale, sur le côté, accroché à un poteau.',
    steps: [time('side-plank', 60), time('flag-tuck', 10), time('flag-straddle', 5), time('flag', 5)],
  },
  {
    id: 'pistol',
    name: 'Pistol squat',
    description: frenchSpacing('Le squat complet sur une jambe : force et équilibre.'),
    steps: [
      reps('bulgarian-split-squat', 10),
      reps('pistol-box', 8),
      reps('pistol-assisted', 8),
      reps('pistol', 1),
      reps('pistol', 8),
    ],
  },
  {
    id: 'oneArmPullup',
    name: 'Traction à un bras',
    description: 'Le graal de la force de tirage.',
    steps: [
      reps('pullup', 15),
      reps('pullup-archer', 5),
      reps('pullup-one-arm-negative', 3),
      reps('pullup-one-arm', 1),
    ],
  },
  {
    id: 'oneArmPushup',
    name: 'Pompe sur un bras',
    description: 'Une pompe complète sur un seul bras, corps gainé.',
    steps: [
      reps('pushup', 30),
      reps('pushup-archer', 8),
      reps('pushup-one-arm', 1),
      reps('pushup-one-arm', 5),
    ],
  },
]

const BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]))

export function skillFor(id: string): Skill | undefined {
  return BY_ID.get(id)
}

/** Nom d'une figure, même si elle a disparu du catalogue. */
export function skillName(id: string): string {
  return BY_ID.get(id)?.name ?? 'Figure inconnue'
}
