import { z } from 'zod'
import { userMessage } from './errors'

describe('messages d’erreur', () => {
  it('garde nos messages et masque les erreurs techniques', () => {
    expect(userMessage(new Error('Donne un nom à ce lieu.'), 'Échec')).toBe('Donne un nom à ce lieu.')
    expect(userMessage(z.number().safeParse('x').error, 'Échec')).toBe('Échec')
    expect(userMessage(new TypeError('x is undefined'), 'Échec')).toBe('Échec')
    expect(userMessage(new DOMException('Quota', 'QuotaExceededError'), 'Échec')).toBe('Échec')
    expect(userMessage('oups', 'Échec')).toBe('Échec')
    expect(userMessage(new Error(''), 'Échec')).toBe('Échec')
  })
})
