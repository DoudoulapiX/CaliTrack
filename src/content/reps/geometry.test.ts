import {
  clamp,
  DEG,
  distance,
  isInside,
  jointAngle,
  median,
  midpoint,
  smoothingWeight,
  tiltFromVertical,
  toPixel,
} from './geometry'

describe('jointAngle', () => {
  it('mesure un bras tendu, un angle droit et un angle aigu, en 2D comme en 3D', () => {
    expect(jointAngle([0, 0], [1, 0], [2, 0])).toBeCloseTo(180)
    expect(jointAngle([0, 1], [0, 0], [1, 0])).toBeCloseTo(90)
    expect(jointAngle([1, 0, 0], [0, 0, 0], [1, 1, 0])).toBeCloseTo(45)
    expect(jointAngle([0, 0, 1], [0, 0, 0], [0, 0, 1])).toBeCloseTo(0)
    expect(jointAngle([1, 0, 0], [0, 0, 0], [0, 0, 2])).toBeCloseTo(90)
  })

  it('rend NaN quand un segment est nul', () => {
    expect(jointAngle([1, 1], [1, 1], [2, 3])).toBeNaN()
    expect(jointAngle([0, 0, 0], [1, 2, 3], [1, 2, 3])).toBeNaN()
  })
})

describe('points sur l’image', () => {
  it('passent en pixels : une image en hauteur ne déforme pas les angles', () => {
    // Un coude à angle droit sur une image de 480 × 640 : en coordonnées normalisées, il ne l'est plus.
    const shoulder = toPixel([0.5, 0.25, 1], 480, 640)
    const elbow = toPixel([0.5, 0.5, 1], 480, 640)
    const wrist = toPixel([0.5 + (0.25 * 640) / 480, 0.5, 1], 480, 640)
    expect(shoulder).toEqual([240, 160])
    expect(jointAngle(shoulder, elbow, wrist)).toBeCloseTo(90)
    expect(jointAngle([0.5, 0.25], [0.5, 0.5], [0.5 + (0.25 * 640) / 480, 0.5])).toBeCloseTo(90)
    expect(distance([0, 0], [3, 4])).toBe(5)
    expect(midpoint([0, 2], [4, 6])).toEqual([2, 4])
  })

  it('sortent de l’image près du bord', () => {
    expect(isInside([0.5, 0.5, 1], 0.02)).toBe(true)
    expect(isInside([0.02, 0.98, 1], 0.02)).toBe(true)
    expect(isInside([0.019, 0.5, 1], 0.02)).toBe(false)
    expect(isInside([0.5, 0.981, 1], 0.02)).toBe(false)
    expect(isInside([-0.1, 0.5, 1], 0)).toBe(false)
  })

  it('mesurent l’inclinaison depuis la verticale', () => {
    expect(tiltFromVertical([0, 0], [0, 10])).toBeCloseTo(0)
    expect(tiltFromVertical([0, 0], [10, 10])).toBeCloseTo(45)
    expect(tiltFromVertical([0, 0], [-10, 0])).toBeCloseTo(90)
    expect(tiltFromVertical([0, 10], [0, 0])).toBeCloseTo(180)
  })
})

describe('outils', () => {
  it('médiane haute', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(3)
    expect(median([])).toBeNaN()
  })

  it('lissage indépendant de la cadence des images', () => {
    expect(smoothingWeight(0, 80)).toBe(0)
    expect(smoothingWeight(80, 80)).toBeCloseTo(1 - 1 / Math.E)
    // Deux pas de 40 ms valent un pas de 80 ms.
    const half = smoothingWeight(40, 80)
    expect(1 - (1 - half) * (1 - half)).toBeCloseTo(smoothingWeight(80, 80))
  })

  it('borne et convertit', () => {
    expect(clamp(5, 6, 12)).toBe(6)
    expect(clamp(13, 6, 12)).toBe(12)
    expect(clamp(7, 6, 12)).toBe(7)
    expect(Math.PI * DEG).toBeCloseTo(180)
  })
})
