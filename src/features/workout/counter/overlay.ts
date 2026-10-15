import type { PoseFrame } from '@/content/reps/types'

/*
 * Le squelette dessiné par-dessus l'image de la caméra. Le canvas a la taille du cadre (fois la densité de
 * l'écran) ; la vidéo y est affichée entière (object-contain), donc le squelette est dessiné dans le rectangle
 * qu'elle occupe. Le miroir de la caméra de face est fait en CSS sur la vidéo et le canvas ensemble : on dessine
 * ici en coordonnées de l'image, sans miroir.
 */

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Le rectangle qu'occupe une image affichée entière, centrée, dans un cadre (comme object-contain). */
export function containRect(videoW: number, videoH: number, boxW: number, boxH: number): Rect {
  if (videoW <= 0 || videoH <= 0) return { x: 0, y: 0, width: boxW, height: boxH }
  const scale = Math.min(boxW / videoW, boxH / videoH)
  const width = videoW * scale
  const height = videoH * scale
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height }
}

/** Os du squelette (numérotation MediaPipe) : épaules, bras, buste, hanches, jambes. */
export const SKELETON_BONES: readonly (readonly [number, number])[] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
]

/** Un point moins visible n'est pas dessiné (comme le compteur, qui ne s'en sert pas). */
export const OVERLAY_MIN_VISIBILITY = 0.5
/** Os blancs et points orange (couleur d'accent de l'appli), lisibles sur toute image. */
export const BONE_COLOR = 'rgba(255, 255, 255, 0.85)'
export const JOINT_COLOR = '#ff6a2b'

/**
 * Efface le canvas et dessine le squelette de l'image : les os dont les deux bouts sont dans `joints` et
 * visibles, puis ces points. Rien d'autre quand personne n'est vu.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  rect: Rect,
  joints: readonly number[],
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const image = frame.image
  if (!image) return
  const shown = new Map<number, readonly [number, number]>()
  for (const joint of joints) {
    const point = image[joint]
    if (!point || point[2] < OVERLAY_MIN_VISIBILITY) continue
    const [x, y] = point
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    shown.set(joint, [rect.x + x * rect.width, rect.y + y * rect.height])
  }
  if (shown.size === 0) return
  // Traits proportionnels à l'image affichée : environ 3 points CSS sur un téléphone.
  const line = Math.max(2, Math.min(rect.width, rect.height) / 90)

  ctx.lineWidth = line
  ctx.lineCap = 'round'
  ctx.strokeStyle = BONE_COLOR
  ctx.beginPath()
  for (const [a, b] of SKELETON_BONES) {
    const from = shown.get(a)
    const to = shown.get(b)
    if (!from || !to) continue
    ctx.moveTo(from[0], from[1])
    ctx.lineTo(to[0], to[1])
  }
  ctx.stroke()

  const radius = line * 1.25
  ctx.fillStyle = JOINT_COLOR
  ctx.beginPath()
  for (const [x, y] of shown.values()) {
    ctx.moveTo(x + radius, y)
    ctx.arc(x, y, radius, 0, 2 * Math.PI)
  }
  ctx.fill()
}

/**
 * Met le canvas à la taille de son cadre (fois la densité de l'écran), puis y dessine le squelette de l'image,
 * ou l'efface (`frame` null). Rien quand le cadre n'est pas affiché ou que le canvas ne dessine pas.
 */
export function paintOverlay(
  canvas: HTMLCanvasElement,
  frame: PoseFrame | null,
  joints: readonly number[],
  ratio: number = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1,
): void {
  const width = Math.round(canvas.clientWidth * ratio)
  const height = Math.round(canvas.clientHeight * ratio)
  if (width <= 0 || height <= 0) return
  // Changer la taille efface le canvas : seulement quand elle change.
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  if (!frame) {
    ctx.clearRect(0, 0, width, height)
    return
  }
  drawSkeleton(ctx, frame, containRect(frame.width, frame.height, width, height), joints)
}
