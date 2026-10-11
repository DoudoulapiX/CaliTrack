import { fitWithin, PHOTO_MAX_SIDE } from './photo'

describe('photo de repas', () => {
  it('réduit une grande photo sans la déformer', () => {
    expect(fitWithin(4032, 3024, PHOTO_MAX_SIDE)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin(3024, 4032, PHOTO_MAX_SIDE)).toEqual({ width: 960, height: 1280 })
    expect(fitWithin(5000, 10, 1280)).toEqual({ width: 1280, height: 3 })
    expect(fitWithin(10000, 1, 1280)).toEqual({ width: 1280, height: 1 })
  })

  it('n’agrandit jamais une petite photo', () => {
    expect(fitWithin(800, 600, PHOTO_MAX_SIDE)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1280, 1280, PHOTO_MAX_SIDE)).toEqual({ width: 1280, height: 1280 })
  })
})
