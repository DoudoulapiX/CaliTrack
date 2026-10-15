import type {
  BodyPart,
  CountedMovement,
  PlacementHint,
  RejectReason,
  UnsureReason,
} from '@/content/reps/types'
import { NBSP } from '@/lib/typography'
import { counterResult, counterSnapshot } from '@/test/pose'
import {
  addDoubtfulLabel,
  canRetry,
  closeQuestion,
  CLOSE_LABEL,
  counterTitle,
  countShown,
  CUE_TEXT,
  debugLines,
  DEBUG_TEXT,
  EMPTY_TEXT,
  eventText,
  exportFileName,
  GUIDE_CHECKLIST,
  GUIDE_TEXT,
  GUIDE_TITLE,
  HINT_TEXT,
  hintText,
  LIVE_LABEL,
  liveText,
  nextText,
  OUT_TEXT,
  PLACEMENT_TEXT,
  PROBLEM_TEXT,
  repsLabel,
  repsText,
  REST_LABEL,
  RESULT_LABEL,
  REVIEW_LEAD,
  reviewHeading,
  SAVE_TEXT,
  saveLabel,
  START_TEXT,
  startingText,
  STATUS_TEXT,
  targetLine,
  targetMin,
  unsureLines,
  WAKE_LOCK_TEXT,
} from './counter-view'
import type { PoseCameraProblem, PoseCameraStats } from './usePoseCamera'

const MOVEMENTS: readonly CountedMovement[] = ['squat', 'pushup', 'dip', 'pullup', 'curl']
const PARTS: readonly BodyPart[] = ['head', 'hands', 'feet', 'body']
const HINTS: readonly PlacementHint[] = [
  { kind: 'noPerson' },
  { kind: 'tooClose' },
  { kind: 'tooFar' },
  ...PARTS.map((part) => ({ kind: 'out' as const, part })),
  { kind: 'phoneUpright' },
  { kind: 'turnSide' },
  { kind: 'position' },
  { kind: 'dark' },
  { kind: 'holdStill' },
]
const REJECTS: readonly RejectReason[] = ['fast', 'slow', 'posture', 'drift', 'anchor', 'travel']
const REASONS: readonly UnsureReason[] = [
  'lost',
  'doubtful',
  'rejected',
  'fewReps',
  'slow',
  'interrupted',
  'trial',
]
const PROBLEMS: readonly PoseCameraProblem[] = [
  'denied',
  'unavailable',
  'error',
  'unsupported',
  'load',
  'crashed',
  'stopped',
]

const STATS: PoseCameraStats = {
  fps: 14.2,
  msP50: 46.4,
  light: 131.6,
  frames: 77,
  detected: 74,
  delegate: 'CPU',
}

/** Toutes les phrases que le compteur peut afficher. */
function everyText(): string[] {
  const texts: string[] = [
    GUIDE_TITLE,
    ...GUIDE_CHECKLIST,
    ...Object.values(GUIDE_TEXT),
    WAKE_LOCK_TEXT,
    startingText({ kind: 'idle' }),
    startingText({ kind: 'loading', step: 'camera' }),
    ...Object.values(STATUS_TEXT),
    ...Object.values(LIVE_LABEL),
    ...Object.values(SAVE_TEXT),
    REST_LABEL,
    ...Object.values(RESULT_LABEL),
    REVIEW_LEAD,
    ...Object.values(EMPTY_TEXT),
    ...Object.values(CLOSE_LABEL),
    ...Object.values(DEBUG_TEXT),
    ...PROBLEMS.map((problem) => PROBLEM_TEXT[problem]),
  ]
  for (const movement of MOVEMENTS) {
    texts.push(PLACEMENT_TEXT[movement], START_TEXT[movement])
    for (const hint of HINTS) texts.push(hintText(hint, movement))
    texts.push(eventText({ kind: 'partial', t: 0 }, movement) ?? '')
    for (const why of REJECTS) texts.push(eventText({ kind: 'rejected', t: 0, why }, movement) ?? '')
    texts.push(
      ...debugLines(
        counterSnapshot({ debug: { ...counterSnapshot().debug, signal: 0.8, lastReject: 'anchor' } }),
        STATS,
        movement,
      ),
    )
  }
  for (const reps of [0, 1, 2, 12]) {
    texts.push(repsText(reps), reviewHeading(reps), saveLabel(reps), closeQuestion(Math.max(1, reps)))
    texts.push(addDoubtfulLabel(Math.max(1, reps)), targetLine({ kind: 'reps', min: reps, max: 12 }) ?? '')
  }
  for (const count of [1, 2]) {
    texts.push(...unsureLines(counterResult({ reasons: REASONS, doubtful: count, rejected: count })))
  }
  texts.push(
    nextText({ index: 2, total: 4 }, true),
    nextText({ index: 2, total: 4 }, false),
    nextText(null, true),
  )
  return texts
}

describe('textes du compteur caméra', () => {
  it('ont une espace insécable avant « : ; ! ? » et dans les guillemets', () => {
    for (const text of everyText()) {
      expect(text, text).not.toMatch(/ [:;!?%»]/)
      expect(text, text).not.toMatch(/« /)
      expect(text, text).not.toMatch(/^\s|\s$/)
    }
  })

  it('ne coupent jamais un nombre de son unité', () => {
    for (const text of everyText()) {
      expect(text, text).not.toMatch(/\d (mètres?|répétitions?|mouvements?|ms|images?|par seconde|sur 255)/)
    }
    expect(PLACEMENT_TEXT.squat).toContain(`2${NBSP}ou${NBSP}3${NBSP}mètres`)
    expect(PROBLEM_TEXT.unsupported).toContain(`iOS${NBSP}16.4`)
  })

  it('n’oublient aucun mouvement, aucune consigne, aucun problème', () => {
    for (const movement of MOVEMENTS) {
      expect(PLACEMENT_TEXT[movement]).toMatch(/^Pose le téléphone/)
      expect(START_TEXT[movement]).toMatch(/\.$/)
      for (const hint of HINTS) expect(hintText(hint, movement)).toMatch(/[.…]$/)
    }
    expect(Object.keys(HINT_TEXT).sort()).toEqual(
      ['dark', 'holdStill', 'noPerson', 'phoneUpright', 'tooClose', 'tooFar', 'turnSide'].sort(),
    )
    expect(Object.keys(OUT_TEXT).sort()).toEqual([...PARTS].sort())
    expect(Object.keys(PROBLEM_TEXT).sort()).toEqual([...PROBLEMS].sort())
    expect(PLACEMENT_TEXT.curl).toContain('tes deux bras doivent se voir')
    expect(hintText({ kind: 'position' }, 'pullup')).toBe('Suspends-toi à la barre, bras tendus.')
    expect(hintText({ kind: 'out', part: 'feet' }, 'squat')).toBe(
      `Tes pieds sortent de l’image${NBSP}: recule un peu.`,
    )
    expect(HINT_TEXT.tooFar).toBe(
      `Tu es trop loin${NBSP}: rapproche-toi, 2${NBSP}à${NBSP}3${NBSP}mètres suffisent.`,
    )
  })

  it('accordent répétitions et mouvements', () => {
    expect([0, 1, 2].map(repsLabel)).toEqual(['répétition', 'répétition', 'répétitions'])
    expect(repsText(12)).toBe(`12${NBSP}répétitions`)
    expect(reviewHeading(7)).toBe(`7${NBSP}répétitions${NBSP}?`)
    expect(saveLabel(0)).toBe('Enregistrer')
    expect(saveLabel(1)).toBe(`Enregistrer 1${NBSP}répétition`)
    expect(saveLabel(9)).toBe(`Enregistrer 9${NBSP}répétitions`)
    expect(closeQuestion(7)).toBe(`Fermer sans enregistrer les 7${NBSP}répétitions${NBSP}?`)
    expect(closeQuestion(1)).toBe(`Fermer sans enregistrer 1${NBSP}répétition${NBSP}?`)
    expect(addDoubtfulLabel(2)).toBe(`Ajouter les 2${NBSP}mouvements`)
    expect(addDoubtfulLabel(1)).toBe('Ajouter le mouvement')
    expect(CUE_TEXT.saved(12)).toBe('12 répétitions enregistrées')
    expect(CUE_TEXT.saved(1)).toBe('1 répétition enregistrée')
  })

  it('donnent le titre, l’objectif et la suite de la série', () => {
    expect(counterTitle('Pompes', 1)).toBe('Pompes, série 2')
    expect(targetLine({ kind: 'reps', min: 8, max: 12 })).toBe(
      `Compteur caméra · Objectif${NBSP}: 8${NBSP}à${NBSP}12`,
    )
    expect(targetLine({ kind: 'reps', min: 10, max: 10 })).toBe(`Compteur caméra · Objectif${NBSP}: 10`)
    expect(targetLine({ kind: 'time', min: 30, max: 30 })).toBeNull()
    expect(targetLine(null)).toBeNull()
    expect(targetMin({ kind: 'reps', min: 8, max: 12 })).toBe(8)
    expect(targetMin({ kind: 'time', min: 8, max: 12 })).toBeNull()
    expect(targetMin(null)).toBeNull()
    expect(nextText({ index: 2, total: 4 }, true)).toBe(
      `Ensuite${NBSP}: série${NBSP}3${NBSP}sur${NBSP}4. Le compteur repart à la fin du repos.`,
    )
    expect(nextText({ index: 1, total: 3 }, false)).toBe(`Ensuite${NBSP}: série${NBSP}2${NBSP}sur${NBSP}3.`)
    expect(nextText(null, true)).toBe('C’était la dernière série de cet exercice.')
  })

  it('disent la préparation, puis la consigne du moment', () => {
    expect(startingText({ kind: 'idle' })).toBe('Préparation du compteur…')
    expect(startingText({ kind: 'loading', step: 'engine' })).toBe('Préparation du compteur…')
    expect(startingText({ kind: 'loading', step: 'camera' })).toBe('Ouverture de la caméra…')
    expect(liveText(null, 'squat', 8)).toBe(START_TEXT.squat)
    expect(liveText(counterSnapshot({ hint: { kind: 'noPerson' } }), 'squat', 8)).toBe(HINT_TEXT.noPerson)
    expect(liveText(counterSnapshot(), 'dip', 8)).toBe(START_TEXT.dip)
    expect(liveText(counterSnapshot({ status: 'arming' }), 'squat', 8)).toBe(STATUS_TEXT.arming)
    expect(liveText(counterSnapshot({ status: 'counting', reps: 7 }), 'squat', 8)).toBe(STATUS_TEXT.counting)
    expect(liveText(counterSnapshot({ status: 'counting', reps: 8 }), 'squat', 8)).toBe(STATUS_TEXT.target)
    expect(liveText(counterSnapshot({ status: 'counting', reps: 30 }), 'squat', null)).toBe(
      STATUS_TEXT.counting,
    )
    expect(liveText(counterSnapshot({ status: 'ended', reps: 3 }), 'curl', null)).toBe(START_TEXT.curl)
    expect(countShown(null)).toBe(false)
    expect(countShown(counterSnapshot())).toBe(false)
    expect(countShown(counterSnapshot({ status: 'arming' }))).toBe(true)
    expect(countShown(counterSnapshot({ status: 'counting', reps: 2 }))).toBe(true)
  })

  it('expliquent un mouvement pas compté, selon l’exercice', () => {
    expect(eventText({ kind: 'rep', t: 0, reps: 3 }, 'squat')).toBeNull()
    expect(eventText({ kind: 'partial', t: 0 }, 'squat')).toBe(`Pas assez bas${NBSP}: pas comptée.`)
    expect(eventText({ kind: 'partial', t: 0 }, 'pullup')).toBe(`Pas assez haut${NBSP}: pas comptée.`)
    expect(eventText({ kind: 'partial', t: 0 }, 'curl')).toBe(`Bras pas assez plié${NBSP}: pas comptée.`)
    const rejected = (why: RejectReason, movement: CountedMovement) =>
      eventText({ kind: 'rejected', t: 0, why }, movement)
    expect(rejected('fast', 'dip')).toBe(`Trop rapide${NBSP}: pas comptée.`)
    expect(rejected('slow', 'dip')).toBe(`Trop long${NBSP}: pas comptée.`)
    expect(rejected('posture', 'dip')).toBe(`Position perdue${NBSP}: pas comptée.`)
    expect(rejected('drift', 'squat')).toBe(`Tu t’es déplacé${NBSP}: pas comptée.`)
    expect(rejected('travel', 'pullup')).toBe(`Mouvement trop petit${NBSP}: pas comptée.`)
    expect(rejected('anchor', 'squat')).toBe(`Tes pieds ont bougé${NBSP}: pas comptée.`)
    expect(rejected('anchor', 'pushup')).toBe(`Tes mains ont bougé${NBSP}: pas comptée.`)
    expect(rejected('anchor', 'curl')).toBe(`Ton coude a bougé${NBSP}: pas comptée.`)
  })

  it('listent les raisons de vérifier, la dernière finie par un point', () => {
    expect(unsureLines(counterResult({ reasons: ['lost', 'doubtful', 'trial'], doubtful: 2 }))).toEqual([
      `je t’ai perdu de vue pendant une partie de la série${NBSP};`,
      `2${NBSP}mouvements après une pause n’ont pas été comptés${NBSP};`,
      'ce compteur est encore en essai pour cet exercice.',
    ])
    expect(unsureLines(counterResult({ reasons: ['rejected', 'rejected'], rejected: 1 }))).toEqual([
      `1${NBSP}mouvement n’a pas été compté (trop rapide ou position perdue).`,
    ])
    expect(unsureLines(counterResult({ reasons: ['rejected'], rejected: 3 }))).toEqual([
      `3${NBSP}mouvements n’ont pas été comptés (trop rapides ou position perdue).`,
    ])
    expect(unsureLines(counterResult({ reasons: ['doubtful'], doubtful: 1 }))).toEqual([
      `1${NBSP}mouvement après une pause n’a pas été compté.`,
    ])
    expect(unsureLines(counterResult({ reasons: ['fewReps', 'slow', 'interrupted'] }))).toEqual([
      `une seule répétition vue${NBSP};`,
      `l’image était trop saccadée sur ce téléphone${NBSP};`,
      'la caméra s’est coupée pendant la série.',
    ])
    expect(unsureLines(counterResult())).toEqual([])
  })

  it('proposent de réessayer sauf quand rien n’y changerait', () => {
    expect(PROBLEMS.filter(canRetry)).toEqual(['denied', 'error', 'load', 'crashed', 'stopped'])
    expect(PROBLEM_TEXT.denied).toContain('Réglages › Safari › Appareil photo')
  })

  it('montrent les infos de réglage, avec la mesure de chaque mouvement', () => {
    const debug = {
      ...counterSnapshot().debug,
      signal: 151.6,
      flexed: 120,
      extended: 150,
      phase: 'top' as const,
      side: 'left' as const,
      visibility: 0.917,
      lastReject: 'fast' as const,
    }
    expect(debugLines(counterSnapshot({ debug }), STATS, 'squat')).toEqual([
      `Images analysées${NBSP}: 14${NBSP}par${NBSP}seconde`,
      `Analyse${NBSP}: 46${NBSP}ms par image (médiane)`,
      `Calcul${NBSP}: processeur`,
      `Silhouette trouvée${NBSP}: 74${NBSP}images sur 77`,
      `Lumière${NBSP}: 132${NBSP}sur${NBSP}255`,
      `Mesure${NBSP}: genou 152° (seuils 120° et 150°)`,
      `Phase${NBSP}: en haut`,
      `Côté suivi${NBSP}: gauche`,
      `Visibilité${NBSP}: 0,92`,
      `Dernier refus${NBSP}: trop rapide`,
    ])
    const pullup = { ...debug, signal: 0.823, flexed: 0.45, extended: 0.8, side: 'both' as const }
    expect(debugLines(counterSnapshot({ debug: pullup }), STATS, 'pullup')).toContain(
      `Mesure${NBSP}: hauteur des épaules 0,82 (seuils 0,45 et 0,80)`,
    )
    expect(debugLines(counterSnapshot({ debug: { ...debug, phase: 'down' } }), STATS, 'curl')).toContain(
      `Phase${NBSP}: en descente`,
    )
    expect(debugLines(counterSnapshot({ debug: { ...debug, phase: 'bottom' } }), STATS, 'dip')).toContain(
      `Phase${NBSP}: en bas`,
    )
    expect(debugLines(counterSnapshot(), { ...STATS, delegate: 'GPU' }, 'squat')).toEqual(
      expect.arrayContaining([
        `Calcul${NBSP}: puce graphique`,
        `Mesure${NBSP}: aucune`,
        `Phase${NBSP}: inconnue`,
        `Côté suivi${NBSP}: aucun`,
        `Dernier refus${NBSP}: aucun`,
      ]),
    )
    // Avant la première image : la vitesse seulement.
    expect(
      debugLines(null, { fps: 0, msP50: null, light: null, frames: 0, detected: 0, delegate: null }, 'squat'),
    ).toEqual([
      `Images analysées${NBSP}: 0${NBSP}par${NBSP}seconde`,
      `Analyse${NBSP}: pas encore mesurée`,
      `Calcul${NBSP}: en attente`,
      `Silhouette trouvée${NBSP}: 0${NBSP}images sur 0`,
      `Lumière${NBSP}: pas mesurée`,
    ])
  })

  it('nomment le fichier de points avec le mouvement et l’heure', () => {
    expect(exportFileName('pullup', new Date(2026, 9, 21, 11, 30))).toBe(
      'calitrack-points-pullup-2026-10-21-1130.json',
    )
  })
})
