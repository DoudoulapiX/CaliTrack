// Construit src/data/ciqual.json à partir de la table Ciqual 2025 de l'Anses et des portions INCA3.
// Sources (licence ouverte Etalab 2.0) recopiées dans scripts/source : ciqual-2025.json et
// inca3-portions.json, tirées du fichier xlsx de l'Anses (https://ciqual.anses.fr) par le projet
// https://github.com/ar11tehau/food (data/ciqual.json et data/portions.json).
//
// Usage : node scripts/build-foods.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCiqual,
  serializeCiqual,
  type CiqualSource,
  type PortionSource,
} from '../src/content/nutrition/ciqual-build.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'))
const file = buildCiqual(
  read('scripts/source/ciqual-2025.json') as CiqualSource,
  read('scripts/source/inca3-portions.json') as PortionSource,
)
writeFileSync(join(root, 'src/data/ciqual.json'), serializeCiqual(file))
const withPortion = file.foods.filter((row) => row[11] !== null).length
console.log(
  `${file.foods.length} aliments écrits dans src/data/ciqual.json, dont ${withPortion} avec une portion habituelle.`,
)
