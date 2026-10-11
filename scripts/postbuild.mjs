// GitHub Pages renvoie 404.html pour une adresse inconnue : en copiant index.html,
// un lien direct vers /CaliTrack/calendar ouvre quand même l'appli.
import { copyFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
await access(`${dist}index.html`)
await copyFile(`${dist}index.html`, `${dist}404.html`)
console.log('dist/404.html créé')
