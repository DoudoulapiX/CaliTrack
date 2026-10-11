import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

/** Ce qu'il faut d'un lecteur de codes-barres : lire les codes visibles sur une image de la caméra. */
export interface BarcodeReader {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

interface NativeDetector {
  new (options: { formats: string[] }): BarcodeReader
  getSupportedFormats(): Promise<string[]>
}

/** Les codes des produits alimentaires : EAN-13, EAN-8 et UPC-A. */
export const FOOD_FORMATS = ['ean_13', 'ean_8', 'upc_a'] as const

/**
 * Le lecteur de codes-barres : celui du navigateur s'il lit ces codes, sinon ZXing (Safari sur iPhone),
 * dont le fichier WebAssembly est servi par l'appli elle-même (pas de dépendance à un autre site).
 */
export async function createBarcodeReader(
  native: NativeDetector | undefined = (globalThis as { BarcodeDetector?: NativeDetector }).BarcodeDetector,
): Promise<BarcodeReader> {
  if (native) {
    try {
      const supported = await native.getSupportedFormats()
      if (FOOD_FORMATS.every((format) => supported.includes(format)))
        return new native({ formats: [...FOOD_FORMATS] })
    } catch {
      // Lecteur du navigateur inutilisable : on passe à ZXing.
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
  })
  return new BarcodeDetector({ formats: [...FOOD_FORMATS] })
}

export type CameraProblem = 'denied' | 'unavailable' | 'error'

/** Pourquoi la caméra n'a pas démarré : accès refusé, pas de caméra, ou autre souci. */
export function cameraProblem(error: unknown): CameraProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
    return 'unavailable'
  }
  return 'error'
}
