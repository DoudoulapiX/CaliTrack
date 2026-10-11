import { defaultGradeScales, GRADE_COLORS } from '@/content/grades'
import { contrast, hexToRgb, hslToHex, mix, readableOn, rgbToHex } from './color'

describe('couleurs', () => {
  it('passe de l’hexadécimal au RVB et du TSL à l’hexadécimal', () => {
    expect(hexToRgb('#2563eb')).toEqual([37, 99, 235])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('pas une couleur')).toEqual([0, 0, 0])
    expect(rgbToHex([37, 99, 235])).toBe('#2563eb')
    expect(rgbToHex([300, -4, 127.6])).toBe('#ff0080')
    expect(hslToHex(0, 100, 50)).toBe('#ff0000')
    expect(hslToHex(120, 100, 50)).toBe('#00ff00')
    expect(hslToHex(240, 100, 50)).toBe('#0000ff')
    expect(hslToHex(-120, 100, 50)).toBe('#0000ff')
    expect(hslToHex(0, 0, 50)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('écrit lisiblement sur n’importe quelle couleur de niveau, même choisie à la main', () => {
    const colors = [
      ...GRADE_COLORS.map((c) => c.color),
      ...defaultGradeScales().flatMap((scale) => scale.grades.map((g) => g.color)),
    ]
    // Toutes les teintes, de la plus sombre à la plus claire, et tous les gris.
    for (let hue = 0; hue < 360; hue += 10) {
      for (let lightness = 0; lightness <= 100; lightness += 1) colors.push(hslToHex(hue, 80, lightness))
    }
    for (let v = 0; v < 256; v++) colors.push(rgbToHex([v, v, v]))
    const unreadable = colors.filter((color) => contrast(color, readableOn(color)) < 4.5)
    expect(unreadable).toEqual([])
  })
})
