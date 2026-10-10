import type { FigureAnim, Limb, Pose, Prop, Vec } from './engine.ts'

/*
 * Bibliothèque d'animations. Repères : zone de 200 × 160, sol à y = 146, silhouette tournée vers
 * la droite. Angles en degrés : 0 = vers la droite, 90 = vers le bas, -90 = vers le haut, 180 = vers la gauche.
 * Les mains et les pieds en appui sont placés par un point visé (cinématique inverse), ce qui les garde
 * immobiles pendant le mouvement. Vérification visuelle : node scripts/figures-sheet.ts sortie.png
 */

const FLOOR = 146
const ANKLE = FLOOR - 3
const floor: Prop = { kind: 'floor', y: FLOOR }

/** Membre qui vise un point ; bend = 1 plie dans le sens horaire, -1 dans l'autre sens. */
const ik = (x: number, y: number, bend: 1 | -1): Limb => ({ to: [x, y], bend })
/** Membre placé par angles : segment du haut, segment du bas. */
const fk = (a: number, b: number = a): Limb => ({ a, b })

const deg = (from: Vec, to: Vec) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI

/** Debout, bras le long du corps. */
function standing(x = 100, arms: Limb = fk(96, 92)): Pose {
  return { hip: [x, ANKLE - 58.5], torso: -90, arm: arms, leg: ik(x + 1, ANKLE, -1) }
}

/** Point situé à une distance donnée d'un autre, dans la direction d'un troisième. */
function toward(from: Vec, to: Vec, length: number): Vec {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  return [from[0] + (dx / len) * length, from[1] + (dy / len) * length]
}

/* ------------------------------------------------------------------ */
/* Corps gainé en appui (pompes, planche, gainage)                       */
/* ------------------------------------------------------------------ */

interface PlankOptions {
  hands: Vec
  feet: Vec
  shoulder: Vec
  oneArm?: boolean
  /** Genoux au sol : `feet` est alors la position du genou. */
  knees?: boolean
  /** Appui sur les avant-bras. */
  forearms?: boolean
}

function plankPose({ hands, feet, shoulder, oneArm, knees, forearms }: PlankOptions): Pose {
  const arm: Limb = forearms ? fk(90, 0) : ik(hands[0], hands[1], 1)
  const arm2: Limb | undefined = oneArm ? fk(150, 30) : undefined
  if (knees) {
    const hip = toward(feet, shoulder, 30)
    return { hip, torso: shoulder, arm, arm2, leg: fk(deg(hip, feet), 205), foot: 205 }
  }
  const hip = toward(shoulder, feet, 36)
  return { hip, torso: shoulder, arm, arm2, leg: ik(feet[0], feet[1], 1), foot: 75 }
}

interface PushupOptions extends Omit<PlankOptions, 'shoulder'> {
  top: Vec
  bottom: Vec
  props?: Prop[]
}

function pushup({ top, bottom, props = [floor], ...rest }: PushupOptions): FigureAnim {
  return {
    frames: [plankPose({ ...rest, shoulder: top }), plankPose({ ...rest, shoulder: bottom })],
    duration: 2.4,
    props,
  }
}

/** Pompes classiques : mains à x = 142, pieds à x = 39 (corps tendu). */
const PUSHUP_FEET: Vec = [39, 140]

/* ------------------------------------------------------------------ */
/* Suspensions à la barre                                               */
/* ------------------------------------------------------------------ */

const BAR: Vec = [100, 14]
const bar: Prop = { kind: 'bar', x: BAR[0], y: BAR[1] }

/** Suspendu à la barre : épaules à la hauteur donnée sous la barre. */
function hanging(
  shoulderY: number,
  opts: { lean?: number; legs?: Limb; legs2?: Limb; hand?: Vec } = {},
): Pose {
  const hand = opts.hand ?? BAR
  const neck: Vec = [hand[0] - 3 + (opts.lean ?? 0), shoulderY]
  const hip: Vec = [neck[0] - 4, neck[1] + 36]
  return {
    hip,
    torso: neck,
    head: -90,
    arm: ik(hand[0], hand[1], 1),
    leg: opts.legs ?? fk(96, 100),
    leg2: opts.legs2 ?? opts.legs ?? fk(92, 104),
  }
}

const pullTop = (lean = -6) => hanging(24, { lean })

/** Dips : mains sur les barres, épaules à la hauteur donnée. */
function dipPose(shoulder: Vec, hip: Vec): Pose {
  return { hip, torso: shoulder, head: -86, arm: ik(104, 94, 1), leg: fk(80, 140), foot: 60 }
}

/* ------------------------------------------------------------------ */
/* Leviers et planche                                                   */
/* ------------------------------------------------------------------ */

/** Front lever (face vers le haut, corps horizontal sous la barre, tête à droite). */
function frontLever(legs: Limb, legs2?: Limb, hipX = 62): Pose {
  return { hip: [hipX, 56], torso: [98, 54], head: 0, arm: ik(100, 14, 1), leg: legs, leg2: legs2, foot: 90 }
}

/** Back lever (face vers le bas, tête à gauche). */
function backLever(legs: Limb, legs2?: Limb, hipX = 138): Pose {
  return {
    hip: [hipX, 56],
    torso: [102, 54],
    head: 180,
    arm: ik(100, 14, -1),
    leg: legs,
    leg2: legs2,
    foot: 90,
  }
}

/** Planche (mains au sol, corps à l'horizontale, tête à droite). */
function planche(legs: Limb, hipY = 104, legs2?: Limb): Pose {
  return {
    hip: [96, hipY],
    torso: [132, 104],
    head: 6,
    arm: ik(124, 144, 1),
    leg: legs,
    leg2: legs2,
    foot: 90,
  }
}

/** Drapeau : corps à l'horizontale accroché à un poteau à gauche. */
const POLE_X = 50
function flag(legs: Limb, legs2?: Limb): Pose {
  return {
    hip: [96, 84],
    torso: [60, 80],
    head: 186,
    arm: ik(POLE_X + 2, 46, 1),
    arm2: ik(POLE_X + 2, 104, -1),
    leg: legs,
    leg2: legs2,
    foot: -90,
  }
}

/* ------------------------------------------------------------------ */
/* Bibliothèque                                                          */
/* ------------------------------------------------------------------ */

export const FIGURES: Record<string, FigureAnim> = {
  /* Poussée horizontale */
  pushup: pushup({ hands: [142, 144], feet: PUSHUP_FEET, top: [141, 104], bottom: [147, 129] }),
  'pushup-diamond': pushup({ hands: [134, 144], feet: PUSHUP_FEET, top: [138, 105], bottom: [145, 129] }),
  'pushup-knee': pushup({
    hands: [140, 144],
    feet: [84, 142],
    top: [138, 106],
    bottom: [146, 130],
    knees: true,
  }),
  'pushup-incline': pushup({
    hands: [146, 117],
    feet: [60, 140],
    top: [140, 79],
    bottom: [152, 101],
    props: [floor, { kind: 'box', x: 132, y: 118, w: 40, h: 28 }],
  }),
  'pushup-wall': {
    frames: [
      { hip: [104, 86], torso: [126, 52], arm: ik(150, 54, 1), leg: ik(91, ANKLE, 1), foot: 0 },
      { hip: [110, 88], torso: [138, 58], arm: ik(150, 54, 1), leg: ik(91, ANKLE, 1), foot: 0 },
    ],
    duration: 2.2,
    props: [floor, { kind: 'wall', x: 152 }],
  },
  'pushup-decline': pushup({
    hands: [146, 144],
    feet: [40, 100],
    top: [144, 105],
    bottom: [150, 128],
    props: [floor, { kind: 'box', x: 20, y: 104, w: 40, h: 42 }],
  }),
  'pushup-archer': pushup({ hands: [142, 144], feet: PUSHUP_FEET, top: [141, 104], bottom: [150, 128] }),
  'pushup-one-arm': pushup({
    hands: [142, 144],
    feet: PUSHUP_FEET,
    top: [141, 104],
    bottom: [147, 126],
    oneArm: true,
  }),
  'pushup-pseudo-planche': pushup({
    hands: [126, 144],
    feet: [35, 140],
    top: [140, 106],
    bottom: [148, 128],
  }),
  'pushup-clap': {
    frames: [
      plankPose({ hands: [142, 144], feet: PUSHUP_FEET, shoulder: [147, 129] }),
      plankPose({ hands: [142, 144], feet: PUSHUP_FEET, shoulder: [141, 104] }),
      { ...plankPose({ hands: [142, 144], feet: PUSHUP_FEET, shoulder: [138, 90] }), arm: fk(80, 60) },
    ],
    duration: 1.8,
    props: [floor],
  },
  'scap-pushup': {
    frames: [
      plankPose({ hands: [142, 144], feet: PUSHUP_FEET, shoulder: [141, 104] }),
      plankPose({ hands: [142, 144], feet: PUSHUP_FEET, shoulder: [141, 106.5] }),
    ],
    duration: 1.8,
    props: [floor],
  },

  /* Poussée verticale */
  'pike-pushup': {
    frames: [
      { hip: [96, 84], torso: [124, 106], head: 75, arm: ik(136, 144, 1), leg: ik(70, ANKLE, 1), foot: 20 },
      { hip: [100, 94], torso: [126, 124], head: 80, arm: ik(136, 144, 1), leg: ik(70, ANKLE, 1), foot: 20 },
    ],
    duration: 2.4,
    props: [floor],
  },
  'pike-pushup-elevated': {
    frames: [
      { hip: [104, 76], torso: [126, 106], head: 80, arm: ik(132, 144, 1), leg: ik(62, 112, 1), foot: 40 },
      { hip: [106, 88], torso: [126, 122], head: 85, arm: ik(132, 144, 1), leg: ik(62, 112, 1), foot: 40 },
    ],
    duration: 2.4,
    props: [floor, { kind: 'box', x: 34, y: 116, w: 38, h: 30 }],
  },
  'hspu-wall': {
    frames: [
      { hip: [120, 69], torso: 92, head: 96, arm: ik(124, 144, 1), leg: fk(-88, -86), foot: -10 },
      { hip: [120, 86], torso: 95, head: 100, arm: ik(124, 144, 1), leg: fk(-86, -84), foot: -10 },
    ],
    duration: 2.6,
    props: [floor, { kind: 'wall', x: 132 }],
  },
  handstand: {
    frames: [{ hip: [100, 69], torso: 90, head: 96, arm: ik(107, 144, -1), leg: fk(-90, -90), foot: 0 }],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'handstand-wall': {
    frames: [{ hip: [52, 69], torso: 90, head: 96, arm: ik(59, 144, -1), leg: fk(-92, -92), foot: 180 }],
    duration: 3,
    mode: 'still',
    props: [floor, { kind: 'wall', x: 40 }],
  },
  'wall-walk': {
    frames: [
      plankPose({ hands: [134, 144], feet: [44, 140], shoulder: [133, 104] }),
      { hip: [70, 86], torso: [94, 112], head: 60, arm: ik(100, 144, 1), leg: ik(44, 42, -1), foot: 180 },
      { hip: [52, 69], torso: 90, head: 96, arm: ik(59, 144, -1), leg: fk(-92, -92), foot: 180 },
    ],
    duration: 4,
    props: [floor, { kind: 'wall', x: 40 }],
  },
  'crow-pose': {
    frames: [
      { hip: [100, 100], torso: [130, 108], head: 30, arm: ik(126, 144, 1), leg: fk(20, 130), foot: 160 },
    ],
    duration: 3,
    mode: 'still',
    props: [floor],
  },

  /* Dips */
  dip: {
    frames: [dipPose([98, 54], [94, 92]), dipPose([104, 78], [88, 112])],
    duration: 2.4,
    props: [{ kind: 'dipbars', x: 104, y: 96 }],
  },
  'dip-ring': {
    frames: [
      { ...dipPose([98, 54], [94, 92]), arm: ik(104, 94, 1) },
      { ...dipPose([104, 78], [88, 112]), arm: ik(104, 94, 1) },
    ],
    duration: 2.4,
    props: [{ kind: 'rings', x: 104, y: 99 }],
  },
  'dip-bench': {
    frames: [
      {
        hip: [96, 100],
        torso: [94, 62],
        head: -88,
        arm: ik(84, 102, -1),
        leg: ik(150, ANKLE, -1),
        foot: -20,
      },
      {
        hip: [98, 122],
        torso: [94, 84],
        head: -84,
        arm: ik(84, 102, -1),
        leg: ik(150, ANKLE, -1),
        foot: -20,
      },
    ],
    duration: 2.2,
    props: [floor, { kind: 'box', x: 50, y: 104, w: 40, h: 42 }],
  },
  'support-hold': {
    frames: [dipPose([100, 56], [96, 94])],
    duration: 3,
    mode: 'still',
    props: [{ kind: 'dipbars', x: 104, y: 96 }],
  },

  /* Traction verticale */
  'dead-hang': { frames: [hanging(52)], duration: 3, mode: 'still', props: [bar] },
  'scap-pull': { frames: [hanging(54), hanging(46)], duration: 2, props: [bar] },
  pullup: { frames: [hanging(52), pullTop()], duration: 2.6, weights: [1.2, 1], props: [bar] },
  'pullup-negative': { frames: [pullTop(), hanging(52)], duration: 4, weights: [3, 1], props: [bar] },
  'lock-off': { frames: [hanging(30, { lean: -6 })], duration: 3, mode: 'still', props: [bar] },
  'pullup-l-sit': {
    frames: [hanging(52, { legs: fk(0, 0) }), hanging(26, { lean: -6, legs: fk(-4, -4) })],
    duration: 2.6,
    props: [bar],
  },
  'hangboard-hang': {
    frames: [hanging(54, { hand: [100, 16] })],
    duration: 3,
    mode: 'still',
    props: [{ kind: 'hangboard', x: 100, y: 14 }],
  },

  /* Abdos suspendus */
  'knee-raise-hanging': {
    frames: [hanging(52), hanging(52, { legs: fk(-20, 80) })],
    duration: 2.2,
    props: [bar],
  },
  'leg-raise-hanging': {
    frames: [hanging(52), hanging(52, { legs: fk(-6, -6) })],
    duration: 2.4,
    props: [bar],
  },
  'toes-to-bar': {
    frames: [
      hanging(52),
      { hip: [100, 72], torso: [88, 40], head: -110, arm: ik(100, 14, 1), leg: fk(-84, -84), foot: 0 },
    ],
    duration: 2.4,
    props: [bar],
  },
  'skin-the-cat': {
    frames: [
      hanging(52),
      hanging(52, { legs: fk(-60, 200) }),
      { hip: [104, 16], torso: [101, 52], head: 95, arm: ik(100, 14, 1), leg: fk(-80, 200), foot: 180 },
    ],
    duration: 4,
    props: [bar],
  },

  /* Traction horizontale */
  'row-australian': {
    frames: [
      { hip: [96, 120], torso: [132, 113], head: 0, arm: ik(142, 76, -1), leg: ik(40, 138, 1), foot: -70 },
      { hip: [100, 108], torso: [136, 96], head: -5, arm: ik(142, 76, -1), leg: ik(40, 138, 1), foot: -70 },
    ],
    duration: 2.4,
    props: [floor, { kind: 'bar', x: 142, y: 76 }],
  },
  'row-incline': {
    frames: [
      { hip: [94, 98], torso: [118, 70], head: -40, arm: ik(146, 50, -1), leg: ik(60, 140, 1), foot: -40 },
      { hip: [100, 92], torso: [126, 62], head: -45, arm: ik(146, 50, -1), leg: ik(60, 140, 1), foot: -40 },
    ],
    duration: 2.4,
    props: [floor, { kind: 'rings', x: 146, y: 50 }],
  },
  'row-table': {
    frames: [
      { hip: [92, 134], torso: [128, 131], head: 0, arm: ik(136, 99, -1), leg: ik(34, 140, 1), foot: -70 },
      { hip: [96, 125], torso: [132, 115], head: -8, arm: ik(136, 99, -1), leg: ik(36, 140, 1), foot: -70 },
    ],
    duration: 2.4,
    props: [floor, { kind: 'box', x: 136, y: 96, w: 70, h: 50 }],
  },
  'row-door': {
    frames: [
      { hip: [110, 108], torso: [114, 75], head: -95, arm: ik(150, 92, 1), leg: ik(140, ANKLE, -1), foot: 0 },
      { hip: [120, 104], torso: [132, 72], head: -80, arm: ik(150, 92, 1), leg: ik(140, ANKLE, -1), foot: 0 },
    ],
    duration: 2.4,
    props: [floor, { kind: 'wall', x: 156 }, { kind: 'band', from: [150, 92], to: [156, 96] }],
  },
  'front-lever-row': {
    frames: [
      frontLever(fk(-40, 160), undefined, 70),
      { hip: [70, 34], torso: [98, 30], head: 0, arm: ik(100, 14, 1), leg: fk(-40, 160), foot: 90 },
    ],
    duration: 2.6,
    props: [bar],
  },

  /* Jambes */
  squat: {
    frames: [standing(100), { hip: [82, 120], torso: -58, arm: fk(-4, -4), leg: ik(101, ANKLE, -1) }],
    duration: 2.4,
    props: [floor],
  },
  'deep-squat': {
    frames: [{ hip: [86, 128], torso: -62, arm: fk(60, 30), leg: ik(101, ANKLE, -1) }],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'squat-jump': {
    frames: [
      { hip: [82, 120], torso: -58, arm: fk(120, 120), leg: ik(101, ANKLE, -1) },
      { hip: [100, 70], torso: -90, arm: fk(-70, -80), leg: fk(92, 90), foot: 40 },
    ],
    duration: 1.6,
    view: [0, -24, 200, 184],
    props: [floor],
  },
  'wall-sit': {
    frames: [{ hip: [66, 112], torso: -90, arm: fk(10, 10), leg: fk(0, 90), foot: 0 }],
    duration: 3,
    mode: 'still',
    props: [floor, { kind: 'wall', x: 58 }],
  },
  lunge: {
    frames: [
      {
        hip: [100, 86],
        torso: -90,
        arm: fk(96, 92),
        leg: ik(122, ANKLE, -1),
        leg2: ik(76, ANKLE, -1),
        foot2: 40,
      },
      {
        hip: [100, 112],
        torso: -90,
        arm: fk(96, 92),
        leg: ik(124, ANKLE, -1),
        leg2: ik(72, ANKLE, -1),
        foot2: 40,
      },
    ],
    duration: 2.4,
    props: [floor],
  },
  'bulgarian-split-squat': {
    frames: [
      {
        hip: [104, 88],
        torso: -88,
        arm: fk(96, 92),
        leg: ik(122, ANKLE, -1),
        leg2: fk(110, 200),
        foot2: 190,
      },
      {
        hip: [100, 112],
        torso: -82,
        arm: fk(96, 92),
        leg: ik(124, ANKLE, -1),
        leg2: fk(130, 200),
        foot2: 190,
      },
    ],
    duration: 2.4,
    props: [floor, { kind: 'box', x: 30, y: 112, w: 36, h: 34 }],
  },
  'step-up': {
    frames: [
      { hip: [96, 86], torso: -88, arm: fk(96, 92), leg: ik(124, 114, -1), leg2: ik(92, ANKLE, -1) },
      { hip: [124, 56], torso: -90, arm: fk(96, 92), leg: ik(125, 114, -1), leg2: fk(70, 110), foot2: 20 },
    ],
    duration: 2.4,
    view: [0, -14, 200, 174],
    props: [floor, { kind: 'box', x: 108, y: 117, w: 50, h: 29 }],
  },
  pistol: {
    frames: [
      { ...standing(100, fk(-4, -4)), leg2: fk(70, 70), foot2: -20 },
      { hip: [84, 124], torso: -52, arm: fk(-6, -6), leg: ik(101, ANKLE, -1), leg2: fk(-6, -4), foot2: -90 },
    ],
    duration: 2.8,
    props: [floor],
  },
  'pistol-box': {
    frames: [
      { ...standing(110, fk(-4, -4)), leg2: fk(70, 70), foot2: -20 },
      { hip: [90, 112], torso: -64, arm: fk(-6, -6), leg: ik(111, ANKLE, -1), leg2: fk(10, 10), foot2: -90 },
    ],
    duration: 2.8,
    props: [floor, { kind: 'box', x: 56, y: 114, w: 40, h: 32 }],
  },
  'shrimp-squat': {
    frames: [
      { ...standing(100, fk(-4, -4)), leg2: fk(110, 200), foot2: 200 },
      {
        hip: [90, 116],
        torso: -64,
        arm: fk(-6, -6),
        leg: ik(103, ANKLE, -1),
        leg2: fk(130, 192),
        foot2: 192,
      },
    ],
    duration: 2.6,
    props: [floor],
  },
  'calf-raise': {
    frames: [standing(100), { ...standing(100), hip: [100, 79], leg: ik(101, ANKLE - 5, -1), foot: 35 }],
    duration: 1.8,
    props: [floor],
  },
  'glute-bridge': {
    frames: [
      { hip: [96, 136], torso: [60, 140], head: 180, arm: fk(10, 10), leg: ik(126, ANKLE, -1), foot: 0 },
      { hip: [96, 112], torso: [62, 136], head: 180, arm: fk(10, 10), leg: ik(126, ANKLE, -1), foot: 0 },
    ],
    duration: 2.2,
    props: [floor],
  },
  'glute-bridge-single': {
    frames: [
      {
        hip: [96, 136],
        torso: [60, 140],
        head: 180,
        arm: fk(10, 10),
        leg: ik(126, ANKLE, -1),
        leg2: fk(-40, -40),
        foot: 0,
      },
      {
        hip: [96, 112],
        torso: [62, 136],
        head: 180,
        arm: fk(10, 10),
        leg: ik(126, ANKLE, -1),
        leg2: fk(-14, -14),
        foot: 0,
      },
    ],
    duration: 2.2,
    props: [floor],
  },
  'hip-thrust': {
    frames: [
      { hip: [100, 132], torso: [70, 114], head: 200, arm: fk(170, 170), leg: ik(130, ANKLE, -1), foot: 0 },
      { hip: [104, 112], torso: [70, 112], head: 190, arm: fk(170, 170), leg: ik(130, ANKLE, -1), foot: 0 },
    ],
    duration: 2.2,
    props: [floor, { kind: 'box', x: 30, y: 116, w: 44, h: 30 }],
  },
  'nordic-curl': {
    frames: [
      { hip: [80, 112], torso: -90, arm: fk(96, 92), leg: fk(90, 180), foot: 180 },
      { hip: [104, 125], torso: -35, arm: fk(60, 70), leg: fk(145, 180), foot: 180 },
    ],
    duration: 3.4,
    weights: [2.5, 1],
    props: [floor],
  },
  'single-leg-rdl': {
    frames: [
      standing(100),
      {
        hip: [96, 86],
        torso: -8,
        head: -5,
        arm: fk(92, 92),
        leg: ik(100, ANKLE, -1),
        leg2: fk(184, 184),
        foot2: 90,
      },
    ],
    duration: 2.6,
    props: [floor],
  },

  /* Gainage et abdos au sol */
  plank: {
    frames: [plankPose({ hands: [0, 0], feet: [36, 141], shoulder: [128, 123], forearms: true })],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'plank-high': {
    frames: [plankPose({ hands: [142, 144], feet: PUSHUP_FEET, shoulder: [141, 104] })],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'side-plank': {
    frames: [
      {
        ...plankPose({ hands: [0, 0], feet: [36, 141], shoulder: [128, 122], forearms: true }),
        arm2: fk(-90, -90),
      },
    ],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'mountain-climber': {
    frames: [
      {
        ...plankPose({ hands: [142, 144], feet: PUSHUP_FEET, shoulder: [141, 104] }),
        leg: fk(20, 150),
        leg2: ik(PUSHUP_FEET[0], PUSHUP_FEET[1], 1),
        foot: 120,
        foot2: 75,
      },
      {
        ...plankPose({ hands: [142, 144], feet: PUSHUP_FEET, shoulder: [141, 104] }),
        leg2: fk(20, 150),
        foot: 75,
        foot2: 120,
      },
    ],
    duration: 0.9,
    props: [floor],
  },
  'hollow-hold': {
    frames: [{ hip: [100, 136], torso: 200, head: 205, arm: fk(198, 196), leg: fk(-14, -12), foot: -100 }],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'hollow-hold-tuck': {
    frames: [{ hip: [100, 138], torso: 205, head: 210, arm: fk(20, 20), leg: fk(-50, 10), foot: -80 }],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'hollow-rock': {
    frames: [
      { hip: [100, 134], torso: 196, head: 200, arm: fk(194, 192), leg: fk(-22, -20), foot: -100 },
      { hip: [100, 134], torso: 210, head: 214, arm: fk(208, 206), leg: fk(-8, -6), foot: -100 },
    ],
    duration: 1.6,
    props: [floor],
  },
  'arch-hold': {
    frames: [{ hip: [100, 138], torso: 186, head: 194, arm: fk(196, 196), leg: fk(-8, -8), foot: 90 }],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'dead-bug': {
    frames: [
      { hip: [112, 140], torso: 180, head: 180, arm: fk(-90, -90), leg: fk(-90, 0), foot: -90 },
      {
        hip: [112, 140],
        torso: 180,
        head: 180,
        arm: fk(-90, -90),
        arm2: fk(196, 196),
        leg: fk(-90, 0),
        leg2: fk(-6, -6),
        foot: -90,
      },
    ],
    duration: 2.4,
    props: [floor],
  },
  'leg-raise-lying': {
    frames: [
      { hip: [100, 141], torso: 180, head: 180, arm: fk(0, 0), leg: fk(-4, -4), foot: -90 },
      { hip: [100, 141], torso: 180, head: 180, arm: fk(0, 0), leg: fk(-88, -88), foot: 0 },
    ],
    duration: 2.4,
    props: [floor],
  },
  'ab-wheel': {
    frames: [
      { hip: [74, 112], torso: [92, 80], head: -60, arm: ik(100, 138, 1), leg: fk(100, 180), foot: 180 },
      { hip: [82, 124], torso: [116, 116], head: -10, arm: ik(150, 138, 1), leg: fk(129, 180), foot: 180 },
    ],
    duration: 3,
    props: [floor, { kind: 'dumbbell', at: 'hand' }],
  },
  'dragon-flag': {
    frames: [
      { hip: [96, 70], torso: [66, 128], head: 115, arm: fk(-60, -100), leg: fk(-64, -64), foot: 0 },
      { hip: [104, 108], torso: [66, 128], head: 150, arm: fk(-60, -100), leg: fk(-24, -24), foot: 0 },
    ],
    duration: 3.4,
    weights: [2.5, 1],
    props: [floor, { kind: 'box', x: 20, y: 132, w: 80, h: 14 }],
  },
  'l-sit': {
    frames: [{ hip: [96, 106], torso: [98, 70], head: -88, arm: ik(104, 112, 1), leg: fk(2, 2), foot: -70 }],
    duration: 3,
    mode: 'still',
    props: [floor, { kind: 'parallettes', x: 104, y: 113 }],
  },
  'l-sit-tuck': {
    frames: [
      { hip: [96, 106], torso: [98, 70], head: -88, arm: ik(104, 112, 1), leg: fk(-30, 100), foot: 10 },
    ],
    duration: 3,
    mode: 'still',
    props: [floor, { kind: 'parallettes', x: 104, y: 113 }],
  },
  'l-sit-one-leg': {
    frames: [
      {
        hip: [96, 106],
        torso: [98, 70],
        head: -88,
        arm: ik(104, 112, 1),
        leg: fk(2, 2),
        leg2: fk(-30, 100),
        foot: -70,
      },
    ],
    duration: 3,
    mode: 'still',
    props: [floor, { kind: 'parallettes', x: 104, y: 113 }],
  },
  'v-sit': {
    frames: [
      { hip: [96, 112], torso: [90, 76], head: -95, arm: ik(100, 118, 1), leg: fk(-48, -48), foot: -120 },
    ],
    duration: 3,
    mode: 'still',
    props: [floor, { kind: 'parallettes', x: 100, y: 119 }],
  },

  /* Figures */
  'planche-lean': {
    frames: [
      plankPose({ hands: [124, 144], feet: [38, 140], shoulder: [136, 106] }),
      plankPose({ hands: [124, 144], feet: [44, 140], shoulder: [143, 106] }),
    ],
    duration: 3,
    props: [floor],
  },
  'planche-tuck': {
    frames: [planche(fk(40, 175), 100)],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'planche-adv-tuck': {
    frames: [planche(fk(95, 178), 104)],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'planche-full': {
    frames: [planche(fk(178, 178), 104)],
    duration: 3,
    mode: 'still',
    props: [floor],
  },
  'front-lever-tuck': {
    frames: [frontLever(fk(-40, 160), undefined, 70)],
    duration: 3,
    mode: 'still',
    props: [bar],
  },
  'front-lever-adv-tuck': {
    frames: [frontLever(fk(-90, 180), undefined, 66)],
    duration: 3,
    mode: 'still',
    props: [bar],
  },
  'front-lever-one-leg': {
    frames: [frontLever(fk(180, 180), fk(-90, 180))],
    duration: 3,
    mode: 'still',
    props: [bar],
  },
  'front-lever': { frames: [frontLever(fk(180, 180))], duration: 3, mode: 'still', props: [bar] },
  'back-lever-tuck': {
    frames: [backLever(fk(90, 0), undefined, 130)],
    duration: 3,
    mode: 'still',
    props: [bar],
  },
  'back-lever': { frames: [backLever(fk(0, 0))], duration: 3, mode: 'still', props: [bar] },
  'flag-tuck': {
    frames: [flag(fk(-30, 120))],
    duration: 3,
    mode: 'still',
    props: [{ kind: 'pole', x: POLE_X }],
  },
  flag: { frames: [flag(fk(0, 0))], duration: 3, mode: 'still', props: [{ kind: 'pole', x: POLE_X }] },
  muscleup: {
    frames: [
      hanging(52),
      hanging(24, { lean: -10 }),
      { hip: [94, 30], torso: [108, -2], head: -70, arm: ik(100, 14, 1), leg: fk(100, 108), foot: 70 },
      { hip: [99, 10], torso: [101, -26], head: -92, arm: ik(100, 14, 1), leg: fk(95, 100), foot: 70 },
    ],
    duration: 3.6,
    mode: 'loop',
    view: [0, -54, 200, 214],
    props: [bar],
  },

  /* Cardio et échauffement */
  burpee: {
    frames: [
      standing(100),
      { hip: [86, 122], torso: -45, arm: ik(124, 144, 1), leg: ik(102, ANKLE, -1) },
      plankPose({ hands: [130, 144], feet: [36, 140], shoulder: [129, 104] }),
      { hip: [86, 122], torso: -45, arm: ik(124, 144, 1), leg: ik(102, ANKLE, -1) },
      { hip: [100, 70], torso: -90, arm: fk(-80, -88), leg: fk(92, 90), foot: 30 },
    ],
    duration: 3.2,
    mode: 'loop',
    view: [0, -30, 200, 190],
    props: [floor],
  },
  'jumping-jacks': {
    frames: [
      {
        hip: [100, 84],
        torso: -90,
        arm: fk(100, 96),
        arm2: fk(80, 84),
        leg: fk(93, 92),
        leg2: fk(87, 88),
        foot: 20,
        foot2: 160,
      },
      {
        hip: [100, 80],
        torso: -90,
        arm: fk(-140, -120),
        arm2: fk(-40, -60),
        leg: fk(112, 108),
        leg2: fk(68, 72),
        foot: 20,
        foot2: 160,
      },
    ],
    duration: 1.2,
    frontal: true,
    props: [floor],
  },
  'high-knees': {
    frames: [
      {
        hip: [100, 82],
        torso: -88,
        arm: fk(60, -60),
        arm2: fk(120, 60),
        leg: fk(-10, 90),
        leg2: ik(100, ANKLE, -1),
      },
      {
        hip: [100, 82],
        torso: -88,
        arm: fk(120, 60),
        arm2: fk(60, -60),
        leg: ik(100, ANKLE, -1),
        leg2: fk(-10, 90),
      },
    ],
    duration: 0.9,
    props: [floor],
  },
}

/** Animation associée à un identifiant, s'il existe. */
export function figureFor(id: string | null | undefined): FigureAnim | undefined {
  return id ? FIGURES[id] : undefined
}
