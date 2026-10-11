import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Fausse caméra pour Chromium : une image fixe d'un code-barres EAN-13, au format vidéo brut Y4M que
 * Chromium lit en boucle (`--use-file-for-fake-video-capture`). Créée avant les tests, sans fichier
 * binaire dans le dépôt.
 */
export const FAKE_CAMERA_FILE = join(tmpdir(), 'calitrack-fake-camera.y4m')

/** Le code-barres filmé : une pâte à tartiner bien connue. */
export const FAKE_CAMERA_BARCODE = '3017620422003'

const L_CODES = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
]
/** Le premier chiffre choisit, pour chacun des six suivants, le jeu L ou G. */
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
]

const invert = (bits: string) => bits.replace(/[01]/g, (bit) => (bit === '0' ? '1' : '0'))
const reverse = (bits: string) =>
  Array.from({ length: bits.length }, (_, i) => bits.charAt(bits.length - 1 - i)).join('')

/** Les 95 modules d'un EAN-13 : « 1 » pour une barre noire. */
export function ean13Modules(code: string): string {
  const digits = Array.from({ length: code.length }, (_, i) => Number(code.charAt(i)))
  const [first = 0, ...rest] = digits
  const parity = PARITY[first] ?? ''
  const left = rest.slice(0, 6).map((digit, i) => {
    const l = L_CODES[digit] ?? ''
    return parity.charAt(i) === 'G' ? reverse(invert(l)) : l
  })
  const right = rest.slice(6).map((digit) => invert(L_CODES[digit] ?? ''))
  return `101${left.join('')}01010${right.join('')}101`
}

export default function writeFakeCamera(): void {
  const width = 640
  const height = 480
  const moduleWidth = 4
  const modules = ean13Modules(FAKE_CAMERA_BARCODE)
  const left = (width - modules.length * moduleWidth) / 2
  // Luminance : fond blanc, barres noires sur la bande centrale.
  const luma = Buffer.alloc(width * height, 235)
  for (let y = 150; y < 330; y++) {
    for (let x = 0; x < modules.length * moduleWidth; x++) {
      if (modules.charAt(Math.floor(x / moduleWidth)) === '1') luma[y * width + left + x] = 16
    }
  }
  // Pas de couleur : les deux plans de chrominance (réduits de moitié) restent neutres.
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128)
  const header = Buffer.from(`YUV4MPEG2 W${String(width)} H${String(height)} F5:1 Ip A1:1 C420jpeg\nFRAME\n`)
  writeFileSync(FAKE_CAMERA_FILE, Buffer.concat([header, luma, chroma]))
}
