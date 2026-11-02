import { cssAnimations } from './motion'

describe('animations', () => {
  it('ne trouve rien là où le navigateur ne connaît pas Web Animations', () => {
    expect(cssAnimations(document.createElement('div'), 'app-icon-fill')).toEqual([])
  })

  it('garde seulement les animations CSS du nom demandé', () => {
    const element = document.createElement('div')
    const fill = { animationName: 'app-icon-fill' } as unknown as Animation
    const other = { animationName: 'ct-flip' } as unknown as Animation
    const script = {} as Animation
    Object.assign(element, { getAnimations: () => [fill, other, script] })
    expect(cssAnimations(element, 'app-icon-fill')).toEqual([fill])
  })
})
