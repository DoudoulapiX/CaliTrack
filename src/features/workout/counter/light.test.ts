import { stubCanvas2d, stubVideo } from '@/test/pose'
import { LIGHT_HEIGHT, LIGHT_WIDTH, meanLuma, sampleLight } from './light'

/** Des pixels RGBA tous de cette couleur. */
function pixels(count: number, [r, g, b, a = 255]: readonly number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < data.length; i += 4) data.set([r!, g!, b!, a], i)
  return data
}

describe('luminance moyenne', () => {
  it('va de 0 (noir) à 255 (blanc)', () => {
    expect(meanLuma(pixels(4, [0, 0, 0]))).toBe(0)
    expect(meanLuma(pixels(4, [255, 255, 255]))).toBeCloseTo(255)
  })

  it('pèse le vert plus que le rouge, et le rouge plus que le bleu (Rec. 601)', () => {
    expect(meanLuma(pixels(1, [255, 0, 0]))).toBeCloseTo(76.245)
    expect(meanLuma(pixels(1, [0, 255, 0]))).toBeCloseTo(149.685)
    expect(meanLuma(pixels(1, [0, 0, 255]))).toBeCloseTo(29.07)
  })

  it('fait la moyenne des pixels sans tenir compte de la transparence', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 0, 0, 0, 0, 255])
    expect(meanLuma(data)).toBeCloseTo(127.5)
  })

  it('rend 0 sans pixel', () => {
    expect(meanLuma(new Uint8ClampedArray(0))).toBe(0)
  })
})

describe('lumière de l’image de la caméra', () => {
  /** Un contexte 2D qui « lit » des pixels de cette couleur. */
  function fakeContext(color: readonly number[]) {
    return {
      drawImage: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
        data: pixels(width * height, color),
      })),
    }
  }

  it('lit une copie de 32 × 24 de l’image et rend sa luminance', () => {
    stubVideo({ width: 640, height: 480 })
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = fakeContext([100, 100, 100])
    const getContext = vi
      .spyOn(canvas, 'getContext')
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D)

    expect(sampleLight(video, canvas)).toBeCloseTo(100)
    expect([canvas.width, canvas.height]).toEqual([LIGHT_WIDTH, LIGHT_HEIGHT])
    expect([LIGHT_WIDTH, LIGHT_HEIGHT]).toEqual([32, 24])
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 32, 24)
    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 32, 24)
  })

  it('crée son propre canvas sans canvas donné', () => {
    stubVideo()
    const ctx = fakeContext([0, 0, 0])
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    )
    expect(sampleLight(document.createElement('video'))).toBe(0)
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
  })

  it('rend null tant que la vidéo n’a pas d’image', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    const video = document.createElement('video')
    expect(sampleLight(video)).toBeNull()
    stubVideo({ width: 0, height: 0 })
    expect(sampleLight(video)).toBeNull()
    expect(getContext).not.toHaveBeenCalled()
  })

  it('rend null quand le canvas ne dessine pas, ou que l’image ne se lit pas', () => {
    stubVideo()
    const video = document.createElement('video')
    stubCanvas2d()
    expect(sampleLight(video)).toBeNull()

    const canvas = document.createElement('canvas')
    const ctx = fakeContext([255, 255, 255])
    ctx.drawImage.mockImplementation(() => {
      throw new DOMException('Image pas prête', 'InvalidStateError')
    })
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    expect(sampleLight(video, canvas)).toBeNull()
  })
})
