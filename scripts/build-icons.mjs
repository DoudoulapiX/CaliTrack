// Génère le favicon et les icônes de l'appli (écran d'accueil iPhone, Android, manifeste).
// Usage : npm run data:icons
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const BG = '#0b0b0f'
const ACCENT = '#ff6a2b'
const INK = '#f5f5f7'

/** Silhouette suspendue à une barre de traction, centrée dans un carré de 512. */
function art(scale = 1) {
  const t = `translate(256 256) scale(${scale}) translate(-256 -294)`
  return `<g transform="${t}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M88 140 H424" stroke="${ACCENT}" stroke-width="30"/>
    <path d="M196 140 L218 262 H294 L316 140 M256 262 V368 M256 368 L222 448 M256 368 L290 448" stroke="${INK}" stroke-width="28"/>
    <circle cx="256" cy="212" r="30" fill="${INK}" stroke="none"/>
  </g>`
}

function svg({ scale = 1, radius = 0 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
  ${art(scale)}
</svg>
`
}

async function png(source, size, file) {
  await sharp(Buffer.from(source), { density: Math.ceil((72 * size) / 512) * 2 })
    .resize(size, size)
    .flatten({ background: BG })
    .png({ compressionLevel: 9 })
    .toFile(`${publicDir}${file}`)
  console.log(`public/${file}`)
}

await mkdir(`${publicDir}icons`, { recursive: true })
await writeFile(`${publicDir}favicon.svg`, svg({ radius: 112 }))
console.log('public/favicon.svg')
await png(svg({ scale: 0.86 }), 180, 'icons/apple-touch-icon.png')
await png(svg({ scale: 0.86 }), 192, 'icons/icon-192.png')
await png(svg({ scale: 0.86 }), 512, 'icons/icon-512.png')
await png(svg({ scale: 0.7 }), 512, 'icons/icon-maskable-512.png')
