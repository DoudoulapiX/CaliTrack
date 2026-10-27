/*
 * Compteur de répétitions à la caméra : les types partagés par le calcul (src/content/reps), la caméra et les
 * écrans (src/features/workout/counter). Ce fichier est aussi lu par Node (scripts/reps-*.ts) : rien que des types.
 */

/** Point du squelette sur l'image : x, y de 0 à 1 (largeur, hauteur), visibilité de 0 à 1. */
export type ImagePoint = readonly [x: number, y: number, visibility: number]
/** Le même point dans l'espace, en mètres, origine au milieu des hanches. */
export type WorldPoint = readonly [x: number, y: number, z: number]

/** Une image analysée : 33 points (numérotation MediaPipe), ou null quand personne n'est vu. */
export interface PoseFrame {
  /** Millisecondes, strictement croissantes pendant une séance du compteur. */
  readonly t: number
  /** Taille de l'image analysée en pixels (les angles sur l'image se mesurent en pixels). */
  readonly width: number
  readonly height: number
  readonly image: readonly ImagePoint[] | null
  readonly world: readonly WorldPoint[] | null
}

/** Mouvements comptés : chaque exercice compté se ramène à l'un d'eux. */
export type CountedMovement = 'squat' | 'pushup' | 'dip' | 'pullup' | 'curl'

/** Réglages propres à une variante (pompes sur les genoux, pompes inclinées, curl à la barre…). */
export interface VariantOverrides {
  /** Bout de la ligne du corps des pompes : chevilles (par défaut) ou genoux. */
  readonly bodyLine?: 'ankle' | 'knee'
  /** Inclinaison minimale du buste, en degrés depuis la verticale (pompes inclinées : 25). */
  readonly minTorsoTilt?: number
  /** Inclinaison maximale du buste, en degrés depuis la verticale (dips penchés : 50). */
  readonly maxTorsoTilt?: number
  /** Les deux coudes plient ensemble (barre, barre EZ) : un seul compte pour les deux bras. */
  readonly bothArms?: boolean
  /**
   * Curl alterné compté par paire, comme le dit sa fiche (« Les deux bras comptent pour une répétition ») : un bras
   * puis l'autre, ou les deux ensemble, font une répétition ; sinon chaque bras compte.
   */
  readonly armPairs?: boolean
  /**
   * Variante encore en essai alors que son mouvement est validé sur une autre (curls : MM-Fit n'a que des curls
   * alternés aux haltères) : jamais sûre, le compte attend toujours la vérification.
   */
  readonly trial?: boolean
}

export interface CountedVariant {
  readonly movement: CountedMovement
  readonly overrides: VariantOverrides
}

export type CounterStatus = 'searching' | 'arming' | 'counting' | 'ended'
export type BodyPart = 'head' | 'hands' | 'feet' | 'body'
/** Consigne de placement, de la plus importante à la moins importante (voir counter-view.ts). */
export type PlacementHint =
  | {
      readonly kind:
        'noPerson' | 'tooClose' | 'tooFar' | 'phoneUpright' | 'turnSide' | 'position' | 'dark' | 'holdStill'
    }
  | { readonly kind: 'out'; readonly part: BodyPart }

/** Pourquoi un mouvement allé jusqu'en bas n'a pas été compté. */
export type RejectReason = 'fast' | 'slow' | 'posture' | 'drift' | 'anchor' | 'travel'
export type RepEvent =
  | { readonly kind: 'rep'; readonly t: number; readonly reps: number }
  | { readonly kind: 'partial'; readonly t: number }
  | { readonly kind: 'rejected'; readonly t: number; readonly why: RejectReason }

export type Phase = 'unknown' | 'top' | 'down' | 'bottom'

/** Ce que montre « Infos de réglage ». */
export interface CounterDebug {
  /** Mesure suivie (angle en degrés, ou rapport de hauteur des épaules pour les tractions). */
  readonly signal: number | null
  readonly flexed: number
  readonly extended: number
  readonly phase: Phase
  readonly side: 'left' | 'right' | 'both' | null
  readonly visibility: number
  readonly quality: number
  /** Images analysées par seconde, d'après le temps des images. */
  readonly fps: number
  readonly lastReject: RejectReason | null
}

export interface CounterSnapshot {
  readonly status: CounterStatus
  readonly reps: number
  readonly partials: number
  readonly hint: PlacementHint | null
  /** Dernier évènement, avec un numéro qui augmente : l'écran le montre une seule fois, 2 s. */
  readonly event: (RepEvent & { readonly id: number }) | null
  readonly debug: CounterDebug
  /** Moins de 8 images analysées par seconde depuis le départ : le compte sera à vérifier. */
  readonly slow: boolean
}

export type UnsureReason = 'lost' | 'doubtful' | 'rejected' | 'fewReps' | 'slow' | 'interrupted' | 'trial'
export type EndReason = 'idle' | 'left' | 'gone' | 'manual' | 'interrupted'

export interface CounterResult {
  /** Répétitions gardées (sans les douteuses). */
  readonly reps: number
  /** Répétitions écartées par la cadence (proposées en « Ajouter les N mouvements »). */
  readonly doubtful: number
  readonly partials: number
  readonly rejected: number
  readonly confident: boolean
  /** Vide quand le compte est sûr. */
  readonly reasons: readonly UnsureReason[]
  readonly endedBy: EndReason
  /** Temps des répétitions comptées, en millisecondes (pour l'export des points). */
  readonly repTimes: readonly number[]
}

/**
 * Seuils du compteur (valeurs dans specs.ts, COUNTER_PARAMS). Durées en millisecondes, longueurs en longueurs
 * de buste (épaules → hanches, en pixels), sauf mention contraire.
 */
export interface CounterParams {
  /** Visibilité minimale d'un point pour s'en servir. */
  readonly minVisibility: number
  /** Marge au bord de l'image (fraction de la largeur ou de la hauteur) : plus près, le point sort du cadre. */
  readonly edgeMargin: number
  /** Constante de temps du lissage. */
  readonly tauMs: number
  /** Trou plus long entre deux images utilisables : le lissage et le mouvement en cours repartent de zéro. */
  readonly gapResetMs: number
  /** Une consigne ne change qu'après être restée stable aussi longtemps. */
  readonly hintStableMs: number
  /** Position de départ tenue, immobile, avant de compter. */
  readonly armMs: number
  /** Vitesse des hanches permise pendant ce temps (longueurs de buste par seconde). */
  readonly armHipSpeed: number
  /** Saut des hanches entre deux images proches : une autre personne. */
  readonly jumpTorso: number
  readonly jumpWindowMs: number
  readonly maxRepMs: number
  /** Part des images d'une répétition où la position est bonne. */
  readonly postureShare: number
  /** Déplacement horizontal des hanches permis pendant une répétition. */
  readonly driftTorso: number
  /** Deux bras qui finissent une répétition aussi rapprochés comptent pour une. */
  readonly perArmMergeMs: number
  /** Pause qui termine la série avant la troisième répétition. */
  readonly idleBefore3Ms: number
  /** Ensuite : idleFactor × intervalle médian, borné entre idleMinMs et idleMaxMs. */
  readonly idleFactor: number
  readonly idleMinMs: number
  readonly idleMaxMs: number
  /** Position quittée (debout, descendu de la barre) aussi longtemps : fin de série. */
  readonly leftMs: number
  /** Plus personne d'utilisable dans l'image aussi longtemps : fin de série. */
  readonly goneMs: number
  /** Trou dans la cadence : max(cadenceGapFactor × intervalle médian, médiane + cadenceGapMs). */
  readonly cadenceGapFactor: number
  readonly cadenceGapMs: number
  /** Part minimale des images bonnes entre le départ et la dernière répétition pour un compte sûr. */
  readonly confidentShare: number
  /** Images analysées par seconde en dessous desquelles le compte est à vérifier. */
  readonly minFps: number
  /** Buste plus long que tooClose × hauteur de l'image : trop près ; plus court que tooFar × hauteur : trop loin. */
  readonly tooClose: number
  readonly tooFar: number
  /** Écart des épaules (en longueurs de buste) sous lequel on est de profil. */
  readonly sideSpread: number
  /** Avance de visibilité qu'il faut à l'autre côté pour devenir le côté suivi. */
  readonly sideSwitch: number
  /** Buste penché de plus de phoneUprightDeg pendant phoneUprightMs (mouvements debout) : téléphone couché. */
  readonly phoneUprightDeg: number
  readonly phoneUprightMs: number
  /** Lumière moyenne (0 à 255) sous laquelle l'image est trop sombre. */
  readonly darkLight: number
  /** Visibilité moyenne des points utiles dans cet intervalle [min, max) : image trop sombre. */
  readonly darkVisibility: readonly [min: number, max: number]
}
