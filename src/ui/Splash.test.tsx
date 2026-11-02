import { act, fireEvent, render, screen } from '@testing-library/react'
import { Splash } from './Splash'

describe('écran de chargement', () => {
  it('montre l’icône de l’appli et annonce le chargement', () => {
    render(<Splash />)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…')
    expect(screen.getByTestId('app-icon-fill')).not.toHaveClass('app-icon-fill')
  })

  it('remplit l’anneau à l’ouverture et prévient au début et à la fin', () => {
    const onIntroStart = vi.fn()
    const onIntroEnd = vi.fn()
    render(<Splash intro onIntroStart={onIntroStart} onIntroEnd={onIntroEnd} />)
    const fill = screen.getByTestId('app-icon-fill')
    expect(fill).toHaveClass('app-icon-fill')
    fireEvent.animationStart(fill)
    expect(onIntroStart).toHaveBeenCalledTimes(1)
    expect(onIntroEnd).not.toHaveBeenCalled()
    fireEvent.animationEnd(fill)
    expect(onIntroEnd).toHaveBeenCalledTimes(1)
  })

  describe('dans un navigateur qui connaît Web Animations', () => {
    /** Fait rendre aux éléments SVG une animation « app-icon-fill » qui finit (ou est annulée) avec `finished`. */
    function stubAnimation(finished: Promise<Animation>) {
      const animation = { animationName: 'app-icon-fill', finished } as unknown as Animation
      Object.defineProperty(SVGElement.prototype, 'getAnimations', {
        configurable: true,
        value: () => [animation],
      })
    }

    afterEach(() => {
      Reflect.deleteProperty(SVGElement.prototype, 'getAnimations')
    })

    it('annonce le début dès l’affichage, sans attendre l’événement, puis la fin', async () => {
      let finish: (value: Animation) => void = () => undefined
      stubAnimation(
        new Promise<Animation>((resolve) => {
          finish = resolve
        }),
      )
      const onIntroStart = vi.fn()
      const onIntroEnd = vi.fn()
      render(<Splash intro onIntroStart={onIntroStart} onIntroEnd={onIntroEnd} />)
      expect(onIntroStart).toHaveBeenCalledTimes(1)
      expect(onIntroEnd).not.toHaveBeenCalled()
      await act(async () => {
        finish({} as Animation)
        await Promise.resolve()
      })
      expect(onIntroEnd).toHaveBeenCalledTimes(1)
    })

    it('ne dit rien d’une fin arrivée après le retrait de l’écran', async () => {
      let finish: (value: Animation) => void = () => undefined
      stubAnimation(
        new Promise<Animation>((resolve) => {
          finish = resolve
        }),
      )
      const onIntroEnd = vi.fn()
      const { unmount } = render(<Splash intro onIntroEnd={onIntroEnd} />)
      unmount()
      await act(async () => {
        finish({} as Animation)
        await Promise.resolve()
      })
      expect(onIntroEnd).not.toHaveBeenCalled()
    })

    it('ne dit rien quand l’animation est annulée, écran déjà retiré', async () => {
      let cancel: (reason: Error) => void = () => undefined
      stubAnimation(
        new Promise<Animation>((_, reject) => {
          cancel = reject
        }),
      )
      const onIntroEnd = vi.fn()
      const { unmount } = render(<Splash intro onIntroEnd={onIntroEnd} />)
      unmount()
      await act(async () => {
        cancel(new DOMException('Annulée', 'AbortError'))
        await Promise.resolve()
      })
      expect(onIntroEnd).not.toHaveBeenCalled()
    })
  })

  it('donne à chaque icône ses propres dégradés', () => {
    const { container } = render(
      <>
        <Splash />
        <Splash />
      </>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/)
  })
})
