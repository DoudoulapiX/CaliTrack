import { DEFAULT_COUNTER_PREFS, readCounterPrefs, writeCounterPrefs } from './counter-prefs'

const KEY = 'calitrack.counter'

describe('préférences du compteur caméra', () => {
  it('valent les réglages par défaut tant que rien n’est gardé', () => {
    expect(readCounterPrefs()).toEqual({ guides: [], facing: 'user', debug: false, delegate: 'CPU' })
    expect(DEFAULT_COUNTER_PREFS).toEqual(readCounterPrefs())
  })

  it('se gardent sur le téléphone et se relisent', () => {
    const first = writeCounterPrefs(readCounterPrefs(), { guides: ['squat'], debug: true })
    expect(first).toEqual({
      guides: ['squat'],
      facing: 'user',
      debug: true,
      delegate: 'CPU',
    })
    // Chaque écriture part des préférences en cours ; un mouvement n'est noté qu'une fois.
    writeCounterPrefs(first, { facing: 'environment', delegate: 'GPU', guides: ['squat', 'pullup', 'squat'] })
    expect(readCounterPrefs()).toEqual({
      guides: ['squat', 'pullup'],
      facing: 'environment',
      debug: true,
      delegate: 'GPU',
    })
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(readCounterPrefs())
  })

  it('complètent un fichier incomplet, et ignorent un fichier abîmé', () => {
    localStorage.setItem(KEY, JSON.stringify({ debug: true }))
    expect(readCounterPrefs()).toEqual({ ...DEFAULT_COUNTER_PREFS, debug: true })
    localStorage.setItem(KEY, '{pas du json')
    expect(readCounterPrefs()).toEqual(DEFAULT_COUNTER_PREFS)
    localStorage.setItem(KEY, JSON.stringify({ facing: 'side', guides: ['plank'] }))
    expect(readCounterPrefs()).toEqual(DEFAULT_COUNTER_PREFS)
    localStorage.setItem(KEY, 'null')
    expect(readCounterPrefs()).toEqual(DEFAULT_COUNTER_PREFS)
  })

  it('font sans stockage quand il refuse d’écrire ou de lire', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Plein', 'QuotaExceededError')
    })
    const debug = writeCounterPrefs(DEFAULT_COUNTER_PREFS, { debug: true })
    expect(debug).toEqual({ ...DEFAULT_COUNTER_PREFS, debug: true })
    expect(readCounterPrefs()).toEqual(DEFAULT_COUNTER_PREFS)
    // Rien de gardé : la suite part quand même des préférences en cours, pas des valeurs par défaut.
    expect(writeCounterPrefs(debug, { facing: 'environment' })).toEqual({
      ...DEFAULT_COUNTER_PREFS,
      debug: true,
      facing: 'environment',
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Interdit', 'SecurityError')
    })
    expect(readCounterPrefs()).toEqual(DEFAULT_COUNTER_PREFS)
    expect(writeCounterPrefs(DEFAULT_COUNTER_PREFS, { facing: 'environment' }).facing).toBe('environment')
  })
})
