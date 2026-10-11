/** Faux contexte audio : compte les sons joués. */
class FakeAudioContext {
  static started = 0
  state: AudioContextState = 'suspended'
  currentTime = 0
  destination = {}

  resume(): Promise<void> {
    this.state = 'running'
    return Promise.resolve()
  }

  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect: (node: unknown) => node,
      start: () => {
        FakeAudioContext.started++
      },
      stop: () => undefined,
    }
  }

  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: (node: unknown) => node,
    }
  }
}

class FakeUtterance {
  text: string
  lang = ''
  rate = 1
  volume = 1
  constructor(text: string) {
    this.text = text
  }
}

const speech = { speak: vi.fn(), cancel: vi.fn() }
const vibrate = vi.fn()

beforeEach(() => {
  vi.resetModules()
  FakeAudioContext.started = 0
  speech.speak.mockClear()
  speech.cancel.mockClear()
  vibrate.mockClear()
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('speechSynthesis', speech)
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'vibrate')
})

describe('signaux de séance', () => {
  it('ne joue rien avant d’être débloqué par un toucher, puis bipe, vibre et parle', async () => {
    const { cue, unlockCues } = await import('./cues')
    cue('go', { sound: true, voice: false })
    expect(FakeAudioContext.started).toBe(0)

    unlockCues({ sound: true, voice: true })
    await Promise.resolve()
    // Une phrase muette pendant le toucher débloque la voix ; une seule fois.
    expect(speech.speak).toHaveBeenCalledTimes(1)
    unlockCues({ sound: true, voice: true })
    expect(speech.speak).toHaveBeenCalledTimes(1)

    cue('tick', { sound: true, voice: false })
    expect(FakeAudioContext.started).toBe(1)
    expect(vibrate).toHaveBeenLastCalledWith(60)

    cue('go', { sound: true, voice: true }, 'C’est reparti')
    expect(FakeAudioContext.started).toBe(3)
    expect(vibrate).toHaveBeenLastCalledWith([200, 100, 200])
    const said = speech.speak.mock.lastCall?.[0] as FakeUtterance
    expect(said).toMatchObject({ text: 'C’est reparti', lang: 'fr-FR' })
    expect(speech.cancel).toHaveBeenCalled()
  })

  it('respecte les réglages : sans son ni voix, rien ne se passe', async () => {
    const { cue, unlockCues } = await import('./cues')
    unlockCues({ sound: false, voice: false })
    cue('go', { sound: false, voice: false }, 'C’est parti')
    expect(FakeAudioContext.started).toBe(0)
    expect(vibrate).not.toHaveBeenCalled()
    expect(speech.speak).not.toHaveBeenCalled()
  })

  it('se passe du son et de la voix quand le navigateur ne les connaît pas', async () => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'vibrate')
    const { cue, speak, unlockCues } = await import('./cues')
    expect(() => {
      unlockCues({ sound: true, voice: true })
      cue('go', { sound: true, voice: true }, 'C’est parti')
      speak('Bonjour')
    }).not.toThrow()
  })
})
