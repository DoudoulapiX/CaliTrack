// Planche-contact de toutes les animations (images clés côte à côte) pour vérifier les postures.
// Usage : node scripts/figures-sheet.ts [sortie.png] [filtre]
import sharp from 'sharp'
import { FIGURES } from '../src/content/figures/library.ts'
import { renderFigureSvg } from '../src/content/figures/render.ts'

const out = process.argv[2] ?? 'figures.png'
const filter = process.argv[3]
const CELL_W = 200
const CELL_H = 175
const entries = Object.entries(FIGURES).filter(([id]) => !filter || id.includes(filter))
const maxFrames = Math.max(...entries.map(([, a]) => a.frames.length))
const width = CELL_W * maxFrames
const height = CELL_H * entries.length

let body = ''
entries.forEach(([id, anim], row) => {
  anim.frames.forEach((_, i) => {
    const svg = renderFigureSvg(anim, {
      animate: false,
      frame: i,
      color: '#111111',
      propColor: '#999999',
      accent: '#ff6a2b',
    }).replace('<svg ', `<svg x="${i * CELL_W}" y="${row * CELL_H + 15}" width="${CELL_W}" height="160" `)
    body += svg
  })
  body += `<text x="4" y="${row * CELL_H + 12}" font-size="12" font-family="sans-serif" fill="#c00">${id}</text>`
  body += `<line x1="0" y1="${row * CELL_H}" x2="${width}" y2="${row * CELL_H}" stroke="#ddd"/>`
})
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`
await sharp(Buffer.from(sheet)).png().toFile(out)
console.log(`${out} : ${entries.length} animations`)
