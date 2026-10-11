import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NBSP } from '@/lib/typography'
import {
  buildCiqual,
  ciqualNumber,
  cleanName,
  serializeCiqual,
  type CiqualFile,
  type CiqualSource,
  type PortionSource,
} from './ciqual-build'

const root = process.cwd()
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'))

describe('table Ciqual', () => {
  it('lit les valeurs : traces et valeurs sous le seuil de mesure comptent pour 0', () => {
    expect(ciqualNumber(12.5)).toBe(12.5)
    expect(ciqualNumber('tr')).toBe(0)
    expect(ciqualNumber('<0.5')).toBe(0)
    expect(ciqualNumber('3,2')).toBe(3.2)
    expect(ciqualNumber(null)).toBeNull()
    expect(ciqualNumber('-')).toBeNull()
  })

  it('met les noms à la typographie de l’appli', () => {
    expect(cleanName("Sauté d'agneau  au curry ")).toBe('Sauté d’agneau au curry')
    expect(cleanName('Boeuf, steak haché 5% MG cru')).toBe(`Boeuf, steak haché 5${NBSP}% MG cru`)
    expect(cleanName('Melon (par ex.: Charentais )')).toBe(`Melon (par ex.${NBSP}: Charentais)`)
  })

  it('garde l’énergie, les macronutriments et la portion de chaque aliment', () => {
    const source: CiqualSource = {
      source: 'test',
      nutriments: ['kcal', 'eau', 'prot', 'gluc', 'lip', 'fibres', 'sel', 'alcool', 'sucres', 'ags'],
      groupes: { '02': 'fruits et légumes', '0204': 'fruits', '04': 'viandes' },
      aliments: [
        [
          13000,
          'Pomme, crue',
          '02',
          '0204',
          '000000',
          null,
          [52, 85, 0.3, 11.6, 0.2, 1.4, 'tr', 0, 10.3, '<0.05'],
        ],
        // Énergie absente : calculée à partir des macronutriments.
        [
          6000,
          'Brochette, crue',
          '04',
          '0000',
          '000000',
          null,
          [null, 70, 20, 0, 10, null, 1.234, 0, null, 4],
        ],
        // Ni énergie ni macronutriments : laissé de côté.
        [
          9000,
          'Inconnu',
          '04',
          '0000',
          '000000',
          null,
          [null, null, null, null, null, null, null, null, null, null],
        ],
      ],
    }
    const portions: PortionSource = { source: 'test', portions: { '13000': [150, 'a'], '6000': [75, 'g'] } }
    const file = buildCiqual(source, portions)
    expect(file.foods).toEqual([
      [6000, 'Brochette, crue', '04', 170, 20, 0, 10, null, null, 4, 1.23, 75],
      [13000, 'Pomme, crue', '0204', 52, 0.3, 11.6, 0.2, 1.4, 10.3, 0, 0, 150],
    ])
    expect(file.groups).toEqual({ '04': 'viandes', '0204': 'fruits' })
    // Le fichier écrit se relit à l'identique.
    expect(JSON.parse(serializeCiqual(file))).toEqual(file)
  })

  it('src/data/ciqual.json correspond aux sources', () => {
    const built = buildCiqual(
      read('scripts/source/ciqual-2025.json') as CiqualSource,
      read('scripts/source/inca3-portions.json') as PortionSource,
    )
    const committed = readFileSync(join(root, 'src/data/ciqual.json'), 'utf8')
    expect(committed).toBe(serializeCiqual(built))
    const file = JSON.parse(committed) as CiqualFile
    expect(file.foods.length).toBeGreaterThan(3000)
    for (const row of file.foods) {
      expect(row[1]).not.toContain("'")
      expect(row[3]).toBeGreaterThanOrEqual(0)
    }
  })
})
