import { fireEvent, render, screen } from '@testing-library/react'
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
