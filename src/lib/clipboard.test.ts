import { stubProperty } from '@/test/stub'
import { copyText } from './clipboard'

describe('copie dans le presse-papiers', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('copie le texte', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubProperty(navigator, 'clipboard', { writeText })
    expect(await copyText('bonjour')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('bonjour')
  })

  it('répond false quand la copie est refusée ou impossible', async () => {
    stubProperty(navigator, 'clipboard', { writeText: () => Promise.reject(new Error('NotAllowedError')) })
    expect(await copyText('bonjour')).toBe(false)
    stubProperty(navigator, 'clipboard', undefined)
    expect(await copyText('bonjour')).toBe(false)
  })
})
