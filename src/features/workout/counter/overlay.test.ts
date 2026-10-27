import { FIXTURE_JOINTS } from '@/content/reps/fixture'
import type { ImagePoint, PoseFrame } from '@/content/reps/types'
import { emptyFrame } from '@/test/pose'
import {
  BONE_COLOR,
  containRect,
  drawSkeleton,
  JOINT_COLOR,
  paintOverlay,
  SKELETON_BONES,
  type Rect,
} from './overlay'

type Call = readonly [string, ...number[]] | readonly [string, ...unknown[]]

/** Un contexte 2D qui note ce qu'on lui demande de dessiner. */
function recordingContext(width = 300, height = 400) {
  const calls: Call[] = []
  const ctx = {
    canvas: { width, height },
    lineWidth: 1,
    lineCap: 'butt',
    strokeStyle: '#000',
    fillStyle: '#000',
    clearRect: (...args: number[]) => {
      calls.push(['clearRect', ...args])
    },
    beginPath: () => {
      calls.push(['beginPath'])
    },
    moveTo: (x: number, y: number) => {
      calls.push(['moveTo', x, y])
    },
    lineTo: (x: number, y: number) => {
      calls.push(['lineTo', x, y])
    },
    arc: (x: number, y: number, radius: number) => {
      calls.push(['arc', x, y, radius])
    },
    stroke: () => {
      calls.push(['stroke', ctx.strokeStyle, ctx.lineWidth, ctx.lineCap])
    },
    fill: () => {
      calls.push(['fill', ctx.fillStyle])
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

/** Une image de 640 × 480 : chaque point donné à sa place, les autres invisibles. */
function poseFrame(points: Readonly<Record<number, ImagePoint>>, width = 640, height = 480): PoseFrame {
  return {
    t: 0,
    width,
    height,
    image: Array.from({ length: 33 }, (_, joint): ImagePoint => points[joint] ?? [0, 0, 0]),
    world: Array.from({ length: 33 }, () => [0, 0, 0] as const),
  }
}

/** Tous les points utiles bien visibles, chacun à un endroit différent. */
function fullFrame(): PoseFrame {
  return poseFrame(
    Object.fromEntries(FIXTURE_JOINTS.map((joint) => [joint, [joint / 40, 1 - joint / 40, 0.9] as const])),
  )
}

/** Les segments tracés (de, vers), dans l'ordre. */
function segments(calls: readonly Call[]): [number, number, number, number][] {
  const found: [number, number, number, number][] = []
  for (const [index, call] of calls.entries()) {
    const next = calls[index + 1]
    if (call[0] === 'moveTo' && next?.[0] === 'lineTo') {
      found.push([call[1], call[2], next[1], next[2]] as [number, number, number, number])
    }
  }
  return found
}

const arcs = (calls: readonly Call[]) => calls.filter(([name]) => name === 'arc')

const RECT: Rect = { x: 10, y: 20, width: 200, height: 100 }
const at = ([x, y]: readonly number[]) => [RECT.x + x! * RECT.width, RECT.y + y! * RECT.height]

describe('rectangle de l’image dans son cadre', () => {
  it('remplit un cadre de même forme', () => {
    expect(containRect(480, 640, 300, 400)).toEqual({ x: 0, y: 0, width: 300, height: 400 })
  })

  it('centre une image paysage dans un cadre portrait', () => {
    expect(containRect(640, 480, 300, 400)).toEqual({ x: 0, y: 87.5, width: 300, height: 225 })
  })

  it('centre une image portrait dans un cadre paysage', () => {
    expect(containRect(480, 640, 400, 300)).toEqual({ x: 87.5, y: 0, width: 225, height: 300 })
  })

  it('prend tout le cadre quand la taille de l’image n’est pas connue', () => {
    expect(containRect(0, 480, 300, 400)).toEqual({ x: 0, y: 0, width: 300, height: 400 })
    expect(containRect(640, 0, 300, 400)).toEqual({ x: 0, y: 0, width: 300, height: 400 })
  })
})

describe('squelette dessiné sur l’image', () => {
  it('efface, puis trace les os et les points visibles dans le rectangle de l’image', () => {
    const { ctx, calls } = recordingContext()
    const frame = fullFrame()
    drawSkeleton(ctx, frame, RECT, FIXTURE_JOINTS)

    expect(calls[0]).toEqual(['clearRect', 0, 0, 300, 400])
    const image = frame.image!
    expect(segments(calls)).toEqual(SKELETON_BONES.map(([a, b]) => [...at(image[a]!), ...at(image[b]!)]))
    expect(SKELETON_BONES).toHaveLength(12)
    // Un point par point utile, nez compris.
    expect(arcs(calls).map(([, x, y]) => [x, y])).toEqual(FIXTURE_JOINTS.map((joint) => at(image[joint]!)))
    const stroke = calls.find(([name]) => name === 'stroke')
    expect(stroke).toEqual(['stroke', BONE_COLOR, 2, 'round'])
    expect(calls[calls.length - 1]).toEqual(['fill', JOINT_COLOR])
  })

  it('n’efface que quand personne n’est vu', () => {
    const { ctx, calls } = recordingContext()
    drawSkeleton(ctx, emptyFrame(0), RECT, FIXTURE_JOINTS)
    expect(calls).toEqual([['clearRect', 0, 0, 300, 400]])
  })

  it('laisse de côté les points peu visibles, et leurs os', () => {
    const { ctx, calls } = recordingContext()
    const frame = poseFrame({
      11: [0.4, 0.3, 0.9],
      13: [0.4, 0.5, 0.49],
      15: [0.4, 0.7, 0.9],
      12: [0.6, 0.3, 0.5],
    })
    drawSkeleton(ctx, frame, RECT, FIXTURE_JOINTS)
    expect(segments(calls)).toEqual([[...at([0.4, 0.3]), ...at([0.6, 0.3])]])
    expect(arcs(calls)).toHaveLength(3)
  })

  it('ne dessine que les points demandés', () => {
    const { ctx, calls } = recordingContext()
    drawSkeleton(ctx, fullFrame(), RECT, [11, 13])
    expect(segments(calls)).toHaveLength(1)
    expect(arcs(calls)).toHaveLength(2)
  })

  it('ignore un point sans position', () => {
    const { ctx, calls } = recordingContext()
    drawSkeleton(ctx, poseFrame({ 11: [Number.NaN, 0.3, 0.9], 12: [0.6, 0.3, 0.9] }), RECT, [11, 12])
    expect(segments(calls)).toEqual([])
    expect(arcs(calls)).toHaveLength(1)
  })

  it('épaissit les traits avec la taille de l’image affichée', () => {
    const { ctx, calls } = recordingContext(1170, 1560)
    drawSkeleton(ctx, fullFrame(), { x: 0, y: 0, width: 1170, height: 1560 }, FIXTURE_JOINTS)
    expect(calls.find(([name]) => name === 'stroke')?.[2]).toBe(13)
    expect(arcs(calls)[0]?.[3]).toBe(16.25)
  })
})

describe('calque du squelette', () => {
  /** Un canvas affiché dans un cadre de cette taille (en points CSS). */
  function laidOutCanvas(width: number, height: number) {
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { value: width })
    Object.defineProperty(canvas, 'clientHeight', { value: height })
    return canvas
  }

  it('prend la taille du cadre fois la densité de l’écran, puis dessine dans l’image', () => {
    const canvas = laidOutCanvas(300, 400)
    const { ctx, calls } = recordingContext(600, 800)
    const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(ctx)
    const frame = fullFrame()
    paintOverlay(canvas, frame, FIXTURE_JOINTS, 2)

    expect([canvas.width, canvas.height]).toEqual([600, 800])
    expect(getContext).toHaveBeenCalledWith('2d')
    // Image paysage 640 × 480 dans un cadre portrait 600 × 800 : bande centrée de 450 de haut.
    const reference = recordingContext(600, 800)
    drawSkeleton(reference.ctx, frame, { x: 0, y: 175, width: 600, height: 450 }, FIXTURE_JOINTS)
    expect(calls).toEqual(reference.calls)
  })

  it('suit la densité de l’écran par défaut', () => {
    vi.stubGlobal('devicePixelRatio', 3)
    try {
      const canvas = laidOutCanvas(100, 50)
      vi.spyOn(canvas, 'getContext').mockReturnValue(null)
      paintOverlay(canvas, null, FIXTURE_JOINTS)
      expect([canvas.width, canvas.height]).toEqual([300, 150])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ne retouche pas la taille quand elle n’a pas changé (ce qui effacerait le canvas)', () => {
    const canvas = laidOutCanvas(300, 400)
    const { ctx } = recordingContext(600, 800)
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx)
    paintOverlay(canvas, null, FIXTURE_JOINTS, 2)
    const width = vi.fn()
    Object.defineProperty(canvas, 'width', { get: () => 600, set: width })
    Object.defineProperty(canvas, 'height', { get: () => 800, set: width })
    paintOverlay(canvas, fullFrame(), FIXTURE_JOINTS, 2)
    expect(width).not.toHaveBeenCalled()
  })

  it('efface quand il n’y a plus d’image', () => {
    const canvas = laidOutCanvas(300, 400)
    const { ctx, calls } = recordingContext(600, 800)
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx)
    paintOverlay(canvas, null, FIXTURE_JOINTS, 2)
    expect(calls).toEqual([['clearRect', 0, 0, 600, 800]])
  })

  it('ne fait rien quand le cadre n’est pas affiché ou que le canvas ne dessine pas', () => {
    const hidden = laidOutCanvas(0, 0)
    const getContext = vi.spyOn(hidden, 'getContext')
    paintOverlay(hidden, fullFrame(), FIXTURE_JOINTS, 2)
    expect(getContext).not.toHaveBeenCalled()

    const blind = laidOutCanvas(300, 400)
    vi.spyOn(blind, 'getContext').mockReturnValue(null)
    expect(() => {
      paintOverlay(blind, fullFrame(), FIXTURE_JOINTS, 2)
    }).not.toThrow()
  })
})
