import { posePaths, samplePoses, type FigureAnim, type FigurePaths, type Prop, type Vec } from './engine.ts'

export interface RenderOptions {
  /** Anime la silhouette (sinon : première image clé, immobile). */
  animate?: boolean
  /** Couleur de la silhouette (par défaut celle du texte). */
  color?: string
  /** Couleur du décor (barre, sol…). */
  propColor?: string
  /** Couleur des charges (haltères). */
  accent?: string
  /** Numéro de l'image clé affichée quand l'animation est arrêtée. */
  frame?: number
  className?: string
  title?: string
}

const VIEW_W = 200
const VIEW_H = 160

function n(v: number): string {
  return (Math.round(v * 10) / 10).toString()
}

function propSvg(prop: Prop, color: string, view: readonly [number, number, number, number]): string {
  const [vx, vy, vw, vh] = view
  const s = `stroke="${color}" fill="none" stroke-linecap="round" stroke-linejoin="round"`
  switch (prop.kind) {
    case 'floor':
      return `<line x1="${vx}" y1="${n(prop.y)}" x2="${vx + vw}" y2="${n(prop.y)}" ${s} stroke-width="2"/>`
    case 'bar':
      return `<line x1="${n(prop.x - 16)}" y1="${n(prop.y)}" x2="${n(prop.x + 16)}" y2="${n(prop.y)}" ${s} stroke-width="4"/>`
    case 'wall':
      return `<line x1="${n(prop.x)}" y1="${n(prop.y ?? vy)}" x2="${n(prop.x)}" y2="${vy + vh}" ${s} stroke-width="3"/>`
    case 'box':
      return `<rect x="${n(prop.x)}" y="${n(prop.y)}" width="${n(prop.w)}" height="${n(prop.h)}" rx="2" ${s} stroke-width="2"/>`
    case 'parallettes':
      return `<path d="M${n(prop.x - 9)} ${n(prop.y + 7)} L${n(prop.x - 6)} ${n(prop.y)} H${n(prop.x + 6)} L${n(prop.x + 9)} ${n(prop.y + 7)}" ${s} stroke-width="3"/>`
    case 'dipbars':
      return `<path d="M${n(prop.x - 14)} ${n(prop.y)} H${n(prop.x + 14)} M${n(prop.x + 10)} ${n(prop.y)} V${vy + vh}" ${s} stroke-width="4"/>`
    case 'rings':
      return `<line x1="${n(prop.x)}" y1="${vy}" x2="${n(prop.x)}" y2="${n(prop.y - 5)}" ${s} stroke-width="1.5"/><circle cx="${n(prop.x)}" cy="${n(prop.y)}" r="5" ${s} stroke-width="2.5"/>`
    case 'pole':
      return `<line x1="${n(prop.x)}" y1="${vy}" x2="${n(prop.x)}" y2="${vy + vh}" ${s} stroke-width="5"/>`
    case 'hangboard':
      return `<rect x="${n(prop.x - 18)}" y="${n(prop.y - 6)}" width="36" height="9" rx="2" ${s} stroke-width="2.5"/>`
    case 'band':
      return `<line x1="${n(prop.from[0])}" y1="${n(prop.from[1])}" x2="${n(prop.to[0])}" y2="${n(prop.to[1])}" ${s} stroke-width="2" stroke-dasharray="4 3"/>`
    case 'dumbbell':
      return ''
  }
}

function animated(attr: string, values: string[], dur: number): string {
  return `<animate attributeName="${attr}" dur="${n(dur)}s" repeatCount="indefinite" values="${values.join(';')}"/>`
}

/** Dessine l'animation en SVG (texte), animée par SMIL : aucun calcul pendant l'affichage. */
export function renderFigureSvg(anim: FigureAnim, options: RenderOptions = {}): string {
  const color = options.color ?? 'currentColor'
  const propColor = options.propColor ?? 'currentColor'
  const accent = options.accent ?? color
  const doAnimate = options.animate ?? true
  const still = anim.frames[Math.min(Math.max(options.frame ?? 0, 0), anim.frames.length - 1)]
  const frames: FigurePaths[] = doAnimate
    ? samplePoses(anim, 40).map(posePaths)
    : still
      ? [posePaths(still)]
      : []
  const first = frames[0]
  if (!first) return ''
  const dur = anim.duration
  const live = doAnimate && frames.length > 1

  const limb = (key: 'body' | 'arm' | 'arm2' | 'leg' | 'leg2', extra = '') =>
    `<path d="${first[key]}"${extra}>${
      live
        ? animated(
            'd',
            frames.map((f) => f[key]),
            dur,
          )
        : ''
    }</path>`

  const point = (pick: (f: FigurePaths) => Vec, r: number, fill: string) =>
    `<circle cx="${n(pick(first)[0])}" cy="${n(pick(first)[1])}" r="${r}" fill="${fill}">${
      live
        ? animated(
            'cx',
            frames.map((f) => n(pick(f)[0])),
            dur,
          ) +
          animated(
            'cy',
            frames.map((f) => n(pick(f)[1])),
            dur,
          )
        : ''
    }</circle>`

  const view = anim.view ?? ([0, 0, VIEW_W, VIEW_H] as const)
  const props = (anim.props ?? []).map((p) => propSvg(p, propColor, view)).join('')
  const weights = (anim.props ?? [])
    .filter((p): p is Extract<Prop, { kind: 'dumbbell' }> => p.kind === 'dumbbell')
    .map((p) => point((f) => (p.at === 'hand' ? f.hand : f.hand2), 4.5, accent))
    .join('')

  const title = options.title ? `<title>${options.title.replace(/[<&>]/g, '')}</title>` : ''
  const cls = options.className ? ` class="${options.className}"` : ''
  const [vx, vy, vw, vh] = view
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}"${cls} role="img" aria-hidden="${title ? 'false' : 'true'}">` +
    title +
    `<g>${props}</g>` +
    `<g fill="none" stroke="${color}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">` +
    `<g opacity="${anim.frontal ? 1 : 0.38}">${limb('arm2')}${limb('leg2')}</g>` +
    limb('leg') +
    limb('body', ' stroke-width="6.5"') +
    limb('arm') +
    `</g>` +
    point((f) => f.head, 8.5, color) +
    weights +
    `</svg>`
  )
}
