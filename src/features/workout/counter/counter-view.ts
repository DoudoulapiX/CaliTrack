import { format } from 'date-fns'
import type {
  BodyPart,
  CountedMovement,
  CounterResult,
  CounterSnapshot,
  Phase,
  PlacementHint,
  RejectReason,
  RepEvent,
  UnsureReason,
} from '@/content/reps/types'
import type { SlotTarget } from '@/db/types'
import { frenchSpacing, keepTogether, lowerFirst } from '@/lib/typography'
import type { Delegate } from './pose-engine'
import type { PoseCameraProblem, PoseCameraState, PoseCameraStats } from './usePoseCamera'

/*
 * Textes du compteur caméra : conseils de placement, consignes en direct, résultats, problèmes, infos de
 * réglage. Chaque texte passe par frenchSpacing() ; un nombre et son unité restent ensemble (keepTogether()).
 * Les textes dits à voix haute (CUE_TEXT) n'ont pas d'espace insécable.
 */

/** Plus que ça, ce n'est plus une série : le compte se corrige jusqu'à 500. */
export const MAX_REPS = 500

/** « 12 répétitions », « 1 répétition », « 0 répétition ». */
export function repsText(reps: number): string {
  return keepTogether(`${String(reps)} ${repsLabel(reps)}`)
}

/** « répétition » pour 0 et 1, « répétitions » au-delà. */
export function repsLabel(reps: number): string {
  return reps > 1 ? 'répétitions' : 'répétition'
}

/** Titre de la feuille (et nom de la boîte de dialogue) : « Pompes, série 2 ». */
export function counterTitle(exerciseName: string, setIndex: number): string {
  return `${exerciseName}, série ${String(setIndex + 1)}`
}

/** « Compteur caméra · Objectif : 8 à 12 », « … Objectif : 10 », ou rien sans objectif de répétitions. */
export function targetLine(target: SlotTarget | null): string | null {
  if (target?.kind !== 'reps') return null
  const range =
    target.min === target.max
      ? String(target.max)
      : keepTogether(`${String(target.min)} à ${String(target.max)}`)
  return frenchSpacing(`Compteur caméra · Objectif : ${range}`)
}

/** Le bas de l'objectif : atteint, le compteur le dit une fois. */
export function targetMin(target: SlotTarget | null): number | null {
  return target?.kind === 'reps' ? target.min : null
}

/* ------------------------------------------------------------------ */
/* Conseils de placement                                                */
/* ------------------------------------------------------------------ */

export const GUIDE_TITLE = 'Place ton téléphone'

const TWO_OR_THREE = keepTogether('2 ou 3 mètres')

export const PLACEMENT_TEXT: Readonly<Record<CountedMovement, string>> = {
  squat: frenchSpacing(
    `Pose le téléphone debout, à hauteur de hanches, à ${TWO_OR_THREE}. Mets-toi face à lui ou un peu de biais.`,
  ),
  pushup: frenchSpacing(
    `Pose le téléphone debout au sol, à ${TWO_OR_THREE}, et mets-toi de profil : des mains aux pieds, tout ton corps doit tenir dans l’image.`,
  ),
  dip: frenchSpacing(
    `Pose le téléphone debout à hauteur des barres, à ${TWO_OR_THREE}, et mets-toi de profil.`,
  ),
  pullup: frenchSpacing(
    `Pose le téléphone au sol, à ${TWO_OR_THREE} de la barre, incliné vers le haut : la barre et tout ton haut du corps doivent être dans l’image. Face au téléphone ou de dos.`,
  ),
  curl: frenchSpacing(
    `Pose le téléphone debout, à hauteur de poitrine, à ${keepTogether('2 mètres')} environ, et mets-toi face à lui : tes deux bras doivent se voir.`,
  ),
}

export const GUIDE_CHECKLIST: readonly string[] = [
  'Tout ton corps dans l’image, avec un peu de marge.',
  'De la lumière face à toi, pas de fenêtre dans ton dos.',
  'Personne d’autre dans l’image.',
  'Le téléphone ne bouge plus une fois posé.',
  'En mode silencieux, l’iPhone peut couper les bips.',
]

export const GUIDE_TEXT = {
  how: 'Le compte démarre quand tu restes une seconde en position, et la série s’enregistre quand tu t’arrêtes. Si le compte est douteux, je te demande de le vérifier.',
  privacy: frenchSpacing('L’image reste sur ton iPhone : rien n’est envoyé ni enregistré.'),
  /** Seulement quand les annonces vocales sont coupées. */
  voiceOff: 'Pour entendre le compte, active Annonces vocales dans Réglages › Pendant la séance.',
  /** Seulement pour un mouvement encore « en essai ». */
  trial: frenchSpacing(
    'Ce compteur est encore en essai pour cet exercice : tu vérifieras chaque compte avant de l’enregistrer.',
  ),
  open: 'Ouvrir la caméra',
} as const

/** Le verrou d'écran est refusé (appli sur l'écran d'accueil avant iOS 18.4). */
export const WAKE_LOCK_TEXT = frenchSpacing(
  'L’écran risque de s’éteindre pendant la série : règle Verrouillage automatique sur « Jamais » (Réglages › Luminosité et affichage).',
)

/* ------------------------------------------------------------------ */
/* Démarrage et direct                                                  */
/* ------------------------------------------------------------------ */

/** Pendant la préparation : le moteur se charge, puis la caméra s'ouvre. */
export function startingText(state: PoseCameraState): string {
  return state.kind === 'loading' && state.step === 'camera'
    ? 'Ouverture de la caméra…'
    : 'Préparation du compteur…'
}

/** Position de départ de chaque mouvement (consigne « position »). */
export const START_TEXT: Readonly<Record<CountedMovement, string>> = {
  squat: 'Tiens-toi debout, face au téléphone.',
  pushup: 'Mets-toi en planche, bras tendus.',
  dip: 'Monte en appui sur les barres, bras tendus.',
  pullup: 'Suspends-toi à la barre, bras tendus.',
  curl: 'Tiens-toi debout, bras le long du corps.',
}

type SimpleHint = Exclude<PlacementHint['kind'], 'out' | 'position'>

export const HINT_TEXT: Readonly<Record<SimpleHint, string>> = {
  noPerson: frenchSpacing('Je ne te vois pas : mets-toi face au téléphone, en entier.'),
  tooClose: frenchSpacing('Tu es trop près : recule d’un ou deux pas.'),
  tooFar: frenchSpacing(`Tu es trop loin : rapproche-toi, ${keepTogether('2 à 3 mètres')} suffisent.`),
  phoneUpright: 'Pose le téléphone debout, pas couché.',
  turnSide: 'Mets-toi de profil par rapport au téléphone.',
  dark: frenchSpacing('L’image est trop sombre : allume la lumière ou tourne-toi vers elle.'),
  holdStill: 'Ne bouge plus un instant…',
}

export const OUT_TEXT: Readonly<Record<BodyPart, string>> = {
  head: frenchSpacing('Ta tête sort de l’image : recule ou incline le téléphone.'),
  hands: frenchSpacing('Tes mains sortent de l’image : recule un peu.'),
  feet: frenchSpacing('Tes pieds sortent de l’image : recule un peu.'),
  body: frenchSpacing('Une partie de ton corps sort de l’image : recule un peu.'),
}

export function hintText(hint: PlacementHint, movement: CountedMovement): string {
  if (hint.kind === 'out') return OUT_TEXT[hint.part]
  if (hint.kind === 'position') return START_TEXT[movement]
  return HINT_TEXT[hint.kind]
}

export const STATUS_TEXT = {
  arming: 'Reste en position une seconde…',
  counting: 'Je compte. Arrête-toi quand tu as fini.',
  target: 'Objectif atteint, continue si tu peux.',
  /** Sous les autres consignes : le téléphone analyse moins de 8 images par seconde. */
  slow: frenchSpacing('Le téléphone peine à suivre : le compte sera à vérifier.'),
} as const

/** La consigne en haut de l'image : ce qui gêne d'abord, sinon où en est le compte. */
export function liveText(
  snapshot: CounterSnapshot | null,
  movement: CountedMovement,
  target: number | null,
): string {
  if (!snapshot) return START_TEXT[movement]
  if (snapshot.hint) return hintText(snapshot.hint, movement)
  if (snapshot.status === 'arming') return STATUS_TEXT.arming
  if (snapshot.status === 'counting') {
    return target !== null && snapshot.reps >= target ? STATUS_TEXT.target : STATUS_TEXT.counting
  }
  return START_TEXT[movement]
}

/** Le grand compte se montre dès que le compteur s'arme (0 avant la première répétition). */
export function countShown(snapshot: CounterSnapshot | null): boolean {
  return snapshot !== null && snapshot.status !== 'searching'
}

/** Ce qui n'a pas été compté, en quelques mots (« Trop rapide »). */
function rejectName(why: RejectReason, movement: CountedMovement): string {
  switch (why) {
    case 'fast':
      return 'Trop rapide'
    case 'slow':
      return 'Trop long'
    case 'posture':
      return 'Position perdue'
    case 'drift':
      return 'Tu t’es déplacé'
    case 'travel':
      return 'Mouvement trop petit'
    case 'anchor':
      if (movement === 'squat') return 'Tes pieds ont bougé'
      return movement === 'curl' ? 'Ton coude a bougé' : 'Tes mains ont bougé'
  }
}

const PARTIAL_NAME: Readonly<Record<CountedMovement, string>> = {
  squat: 'Pas assez bas',
  pushup: 'Pas assez bas',
  dip: 'Pas assez bas',
  pullup: 'Pas assez haut',
  curl: 'Bras pas assez plié',
}

/** Ligne montrée 2 s sous l'image après un mouvement pas compté ; rien pour une répétition comptée. */
export function eventText(event: RepEvent, movement: CountedMovement): string | null {
  if (event.kind === 'rep') return null
  const name = event.kind === 'partial' ? PARTIAL_NAME[movement] : rejectName(event.why, movement)
  return frenchSpacing(`${name} : pas comptée.`)
}

export const LIVE_LABEL = {
  switchCamera: 'Changer de caméra',
  guide: 'Conseils de placement',
  debug: 'Infos de réglage',
  finish: 'Terminer la série',
} as const

/* ------------------------------------------------------------------ */
/* Résultats                                                            */
/* ------------------------------------------------------------------ */

export const SAVE_TEXT = {
  saving: 'Enregistrement…',
  saved: 'Série enregistrée.',
  error: 'La série n’a pas pu être enregistrée.',
  corrected: 'Correction enregistrée.',
  correctionError: 'La correction n’a pas pu être enregistrée.',
} as const

export const REST_LABEL = 'Repos avant la série suivante'

/** Ce qui suit une série enregistrée : la série suivante de l'exercice, ou la fin de l'exercice. */
export function nextText(next: { index: number; total: number } | null, resting: boolean): string {
  if (!next) return 'C’était la dernière série de cet exercice.'
  const position = keepTogether(`série ${String(next.index + 1)} sur ${String(next.total)}`)
  return frenchSpacing(
    resting ? `Ensuite : ${position}. Le compteur repart à la fin du repos.` : `Ensuite : ${position}.`,
  )
}

export const RESULT_LABEL = {
  nextSet: 'Série suivante',
  correct: 'Corriger',
  continueSet: 'Continuer la série',
  saveCorrection: 'Enregistrer la correction',
  cancel: 'Annuler',
  retry: 'Réessayer',
  stepper: 'Répétitions',
  discard: 'Ne pas enregistrer',
} as const

/** « 7 répétitions ? » : le compte à vérifier. */
export function reviewHeading(reps: number): string {
  return frenchSpacing(`${repsText(reps)} ?`)
}

export const REVIEW_LEAD = frenchSpacing('Vérifie le nombre avant de l’enregistrer :')

function movements(count: number): string {
  return keepTogether(`${String(count)} ${count > 1 ? 'mouvements' : 'mouvement'}`)
}

function unsureReason(reason: UnsureReason, result: CounterResult): string {
  switch (reason) {
    case 'lost':
      return 'je t’ai perdu de vue pendant une partie de la série'
    case 'doubtful':
      return result.doubtful > 1
        ? `${movements(result.doubtful)} après une pause n’ont pas été comptés`
        : `${movements(result.doubtful)} après une pause n’a pas été compté`
    case 'rejected':
      return result.rejected > 1
        ? `${movements(result.rejected)} n’ont pas été comptés (trop rapides ou position perdue)`
        : `${movements(result.rejected)} n’a pas été compté (trop rapide ou position perdue)`
    case 'fewReps':
      return 'une seule répétition vue'
    case 'slow':
      return 'l’image était trop saccadée sur ce téléphone'
    case 'interrupted':
      return 'la caméra s’est coupée pendant la série'
    case 'trial':
      return 'ce compteur est encore en essai pour cet exercice'
  }
}

/** Pourquoi vérifier, une ligne par raison : « … ; » puis « … . » pour la dernière. */
export function unsureLines(result: CounterResult): string[] {
  const reasons = [...new Set(result.reasons)]
  return reasons.map((reason, index) =>
    frenchSpacing(`${unsureReason(reason, result)}${index === reasons.length - 1 ? '.' : ' ;'}`),
  )
}

/** « Ajouter les 2 mouvements » écartés après une pause. */
export function addDoubtfulLabel(count: number): string {
  return count > 1 ? `Ajouter les ${movements(count)}` : 'Ajouter le mouvement'
}

/** « Enregistrer 7 répétitions » ; à 0, le bouton est grisé et dit seulement « Enregistrer ». */
export function saveLabel(reps: number): string {
  return reps > 0 ? `Enregistrer ${repsText(reps)}` : 'Enregistrer'
}

export const EMPTY_TEXT = {
  title: 'Aucune répétition comptée',
  text: 'Vérifie la place du téléphone et la lumière, puis réessaie.',
} as const

export const PROBLEM_TEXT: Readonly<Record<PoseCameraProblem, string>> = {
  denied: frenchSpacing(
    'CaliTrack n’a pas accès à la caméra. Autorise-la dans Réglages › Safari › Appareil photo, puis réessaie.',
  ),
  unavailable: 'Pas de caméra disponible sur cet appareil.',
  error: 'La caméra n’a pas démarré. Réessaie dans un instant.',
  unsupported: frenchSpacing(
    `Ce téléphone ne peut pas faire tourner le compteur : il faut ${keepTogether('iOS 16.4')} ou plus récent.`,
  ),
  load: 'Le compteur n’a pas pu démarrer. S’il n’a encore jamais servi, connecte-toi une fois à Internet pour le télécharger.',
  crashed: 'Le compteur s’est arrêté. Réessaie.',
  stopped: 'La caméra s’est coupée quand l’appli est passée en arrière-plan.',
}

/** Pas de caméra, ou téléphone trop ancien : réessayer n'y changerait rien. */
export function canRetry(problem: PoseCameraProblem): boolean {
  return problem !== 'unavailable' && problem !== 'unsupported'
}

/** « Fermer sans enregistrer les 7 répétitions ? » */
export function closeQuestion(reps: number): string {
  return frenchSpacing(`Fermer sans enregistrer ${reps > 1 ? 'les ' : ''}${repsText(reps)} ?`)
}

export const CLOSE_LABEL = {
  keep: 'Continuer à compter',
  close: 'Fermer sans enregistrer',
} as const

/** Ce que disent la voix et les bips (sans espace insécable : c'est lu, pas affiché). */
export const CUE_TEXT = {
  armed: 'C’est parti',
  target: 'Objectif atteint',
  unsure: 'Compte à vérifier',
  saved: (reps: number) =>
    reps > 1 ? `${String(reps)} répétitions enregistrées` : `${String(reps)} répétition enregistrée`,
} as const

/* ------------------------------------------------------------------ */
/* Infos de réglage                                                     */
/* ------------------------------------------------------------------ */

export const DEBUG_TEXT = {
  section: 'Réglage du compteur',
  gpu: 'Calcul sur la puce graphique (essai)',
  gpuHelp: 'Pris en compte à la prochaine ouverture du compteur.',
  export: 'Exporter les points de la série',
  exportNote: 'Un fichier de points du squelette, sans aucune image, pour régler le compteur.',
} as const

const SIGNAL_NAME: Readonly<Record<CountedMovement, string>> = {
  squat: 'genou',
  pushup: 'coude',
  dip: 'coude',
  pullup: 'hauteur des épaules',
  curl: 'coude',
}

const PHASE_TEXT: Readonly<Record<Phase, string>> = {
  unknown: 'inconnue',
  top: 'en haut',
  down: 'en descente',
  bottom: 'en bas',
}

const SIDE_TEXT = { left: 'gauche', right: 'droit', both: 'les deux' } as const

const DELEGATE_TEXT: Readonly<Record<Delegate, string>> = { CPU: 'processeur', GPU: 'puce graphique' }

/** Nombre à virgule : « 0,82 ». */
function decimal(value: number, digits = 2): string {
  return value.toFixed(digits).replace('.', ',')
}

/** La mesure suivie et ses deux seuils : « genou 152° (seuils 120° et 150°) », « … 0,82 (seuils 0,45 et 0,80) ». */
function measureText(debug: CounterSnapshot['debug'], movement: CountedMovement): string {
  if (debug.signal === null) return 'aucune'
  const value = (n: number) => (movement === 'pullup' ? decimal(n) : `${String(Math.round(n))}°`)
  return `${SIGNAL_NAME[movement]} ${value(debug.signal)} (seuils ${value(debug.flexed)} et ${value(debug.extended)})`
}

/** Les lignes de « Infos de réglage » : vitesse de l'analyse, ce que voit le compteur, dernier refus. */
export function debugLines(
  snapshot: CounterSnapshot | null,
  stats: PoseCameraStats,
  movement: CountedMovement,
): string[] {
  const lines = [
    `Images analysées : ${keepTogether(`${String(Math.round(stats.fps))} par seconde`)}`,
    stats.msP50 === null
      ? 'Analyse : pas encore mesurée'
      : `Analyse : ${keepTogether(`${String(Math.round(stats.msP50))} ms`)} par image (médiane)`,
    `Calcul : ${stats.delegate ? DELEGATE_TEXT[stats.delegate] : 'en attente'}`,
    `Silhouette trouvée : ${keepTogether(`${String(stats.detected)} images`)} sur ${String(stats.frames)}`,
    `Lumière : ${stats.light === null ? 'pas mesurée' : keepTogether(`${String(Math.round(stats.light))} sur 255`)}`,
  ]
  if (snapshot) {
    const { debug } = snapshot
    lines.push(
      `Mesure : ${measureText(debug, movement)}`,
      `Phase : ${PHASE_TEXT[debug.phase]}`,
      `Côté suivi : ${debug.side ? SIDE_TEXT[debug.side] : 'aucun'}`,
      `Visibilité : ${decimal(debug.visibility)}`,
      `Dernier refus : ${debug.lastReject ? lowerFirst(rejectName(debug.lastReject, movement)) : 'aucun'}`,
    )
  }
  return lines.map(frenchSpacing)
}

/** Nom du fichier de points : « calitrack-points-squat-2026-10-21-1130.json ». */
export function exportFileName(movement: CountedMovement, at: Date): string {
  return `calitrack-points-${movement}-${format(at, 'yyyy-MM-dd-HHmm')}.json`
}
