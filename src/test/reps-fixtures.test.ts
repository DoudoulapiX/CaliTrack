import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodeFixture, type FixtureMeta } from '@/content/reps/fixture'
import { loadRepFixture, loadRepFixtures } from './reps-fixtures'

const META: FixtureMeta = {
  name: 'synth-essai',
  movement: 'squat',
  exerciseId: 'squat',
  kind: 'set',
  expected: { reps: 0 },
  split: 'tune',
  source: 'test',
  licence: 'MIT',
  estimator: 'test',
  fps: 15,
  width: 480,
  height: 640,
}

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'calitrack-reps-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(file: string, content: unknown): void {
  writeFileSync(join(dir, file), typeof content === 'string' ? content : JSON.stringify(content))
}

describe('loadRepFixtures', () => {
  it('lit et valide chaque fichier .json du dossier, par ordre de nom', () => {
    const empty = { t: 0, width: 480, height: 640, image: null, world: null }
    write('b-second.json', encodeFixture({ ...META, name: 'b-second' }, [empty]))
    write('a-premier.json', encodeFixture({ ...META, name: 'a-premier' }, []))
    write('README.md', '# Crédits')
    const fixtures = loadRepFixtures(dir)
    expect(fixtures.map((f) => f.name)).toEqual(['a-premier', 'b-second'])
    expect(fixtures[1]?.frames).toEqual([[0, 0, 0]])
    expect(loadRepFixture('b-second', dir).name).toBe('b-second')
  })

  it('nomme le fichier fautif', () => {
    write('casse.json', { ...encodeFixture({ ...META, name: 'casse' }, []), format: 2 })
    expect(() => loadRepFixtures(dir)).toThrow(/^casse\.json : /)
  })

  it('exige le même nom dans le fichier et sur le disque', () => {
    write('autre.json', encodeFixture(META, []))
    expect(() => loadRepFixture('autre', dir)).toThrow(
      'autre.json : le nom dans le fichier est « synth-essai »',
    )
  })
})
