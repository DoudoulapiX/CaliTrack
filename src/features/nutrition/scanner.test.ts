import { cameraProblem, createBarcodeReader, FOOD_FORMATS, type BarcodeReader } from './scanner'

/** Un faux lecteur du navigateur, qui note les formats demandés. */
function fakeNative(supported: string[] | Error) {
  const created: { formats: string[] }[] = []
  class FakeDetector implements BarcodeReader {
    constructor(options: { formats: string[] }) {
      created.push(options)
    }
    static getSupportedFormats(): Promise<string[]> {
      return supported instanceof Error ? Promise.reject(supported) : Promise.resolve(supported)
    }
    detect(): Promise<{ rawValue: string }[]> {
      return Promise.resolve([{ rawValue: '3017620422003' }])
    }
  }
  return { FakeDetector, created }
}

describe('lecteur de codes-barres', () => {
  it('prend le lecteur du navigateur s’il lit les codes des produits', async () => {
    const { FakeDetector, created } = fakeNative(['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'])
    const reader = await createBarcodeReader(FakeDetector)
    expect(reader).toBeInstanceOf(FakeDetector)
    expect(created).toEqual([{ formats: [...FOOD_FORMATS] }])
  })

  it('passe à ZXing quand le navigateur ne lit pas tous ces codes', async () => {
    const { FakeDetector, created } = fakeNative(['qr_code', 'ean_13'])
    const reader = await createBarcodeReader(FakeDetector)
    expect(reader).not.toBeInstanceOf(FakeDetector)
    expect(typeof reader.detect).toBe('function')
    expect(created).toEqual([])
  })

  it('passe à ZXing quand le lecteur du navigateur échoue ou n’existe pas', async () => {
    const { FakeDetector } = fakeNative(new Error('indisponible'))
    expect(await createBarcodeReader(FakeDetector)).not.toBeInstanceOf(FakeDetector)
    const reader = await createBarcodeReader(undefined)
    expect(typeof reader.detect).toBe('function')
  })
})

describe('problèmes de caméra', () => {
  it('reconnaît un accès refusé', () => {
    expect(cameraProblem(new DOMException('refusé', 'NotAllowedError'))).toBe('denied')
    expect(cameraProblem(new DOMException('hors HTTPS', 'SecurityError'))).toBe('denied')
  })

  it('reconnaît l’absence de caméra utilisable', () => {
    expect(cameraProblem(new DOMException('aucune', 'NotFoundError'))).toBe('unavailable')
    expect(cameraProblem(new DOMException('contraintes', 'OverconstrainedError'))).toBe('unavailable')
    expect(cameraProblem(new DOMException('occupée', 'NotReadableError'))).toBe('unavailable')
  })

  it('classe le reste comme une erreur', () => {
    expect(cameraProblem(new DOMException('arrêt', 'AbortError'))).toBe('error')
    expect(cameraProblem(new Error('autre'))).toBe('error')
    expect(cameraProblem('texte')).toBe('error')
  })
})
