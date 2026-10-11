import { clearOuraState, newOuraState, storedOuraState, storeOuraState } from './oura-state'

describe('state de la demande d’accès', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('est aléatoire, gardé puis effacé', () => {
    const state = newOuraState()
    expect(state).toMatch(/^[0-9a-f]{32}$/)
    expect(newOuraState()).not.toBe(state)
    expect(storedOuraState()).toBeNull()
    storeOuraState(state)
    expect(storedOuraState()).toBe(state)
    clearOuraState()
    expect(storedOuraState()).toBeNull()
  })

  it('fait sans stockage quand le navigateur le refuse', () => {
    const refuse = () => {
      throw new DOMException('Accès refusé', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse)
    expect(() => {
      storeOuraState('abc')
      clearOuraState()
    }).not.toThrow()
    expect(storedOuraState()).toBeNull()
  })
})
