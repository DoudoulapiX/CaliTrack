import { choice } from './choice'

describe('valeur parmi des choix permis', () => {
  it('garde une valeur permise, sinon la valeur de repli', () => {
    expect(choice('rest', ['asPlanned', 'lighter', 'rest'], 'asPlanned')).toBe('rest')
    expect(choice('REST', ['asPlanned', 'lighter', 'rest'], 'asPlanned')).toBe('asPlanned')
    expect(choice('', ['asPlanned', 'lighter', 'rest'], 'lighter')).toBe('lighter')
  })
})
