// Génère le favicon et les icônes de l'appli (écran d'accueil iPhone, Android, manifeste) depuis
// src/lib/app-icon.ts. Usage : npm run data:icons
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { APP_ICON_BG, APP_ICON_FILES, FAVICON_RADIUS, appIconSvg } from '../src/lib/app-icon.ts'

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

await mkdir(`${publicDir}icons`, { recursive: true })
await writeFile(`${publicDir}favicon.svg`, appIconSvg({ radius: FAVICON_RADIUS }))
console.log('public/favicon.svg')

for (const { file, size, scale } of APP_ICON_FILES) {
  await sharp(Buffer.from(appIconSvg({ scale })), { density: Math.ceil((72 * size) / 512) * 2 })
    .resize(size, size)
    .flatten({ background: APP_ICON_BG })
    .png({ compressionLevel: 9 })
    .toFile(`${publicDir}${file}`)
  console.log(`public/${file}`)
}
