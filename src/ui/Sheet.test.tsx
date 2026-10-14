import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sheet } from './Sheet'

/** L'évènement que le navigateur envoie à la boîte de dialogue sur Échap. */
function pressEscape(dialog: HTMLElement): Event {
  const cancel = new Event('cancel', { cancelable: true })
  fireEvent(dialog, cancel)
  return cancel
}

describe('Sheet', () => {
  it('ferme par le bouton Fermer', async () => {
    const onClose = vi.fn()
    render(
      <Sheet open title="Réglages" onClose={onClose}>
        <p>Contenu</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Réglages' })
    expect(dialog).toHaveTextContent('Contenu')
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('laisse Échap fermer la boîte d’elle-même par défaut', () => {
    const onClose = vi.fn()
    render(
      <Sheet open title="Réglages" onClose={onClose}>
        <p>Contenu</p>
      </Sheet>,
    )
    expect(pressEscape(screen.getByRole('dialog', { name: 'Réglages' })).defaultPrevented).toBe(false)
    // Le navigateur ferme alors la boîte, et c'est l'évènement « close » qui prévient onClose.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('avec guardClose, Échap demande à onClose, qui peut refuser', () => {
    const onClose = vi.fn()
    render(
      <Sheet open guardClose title="Compteur" onClose={onClose}>
        <p>7 répétitions</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Compteur' })
    expect(pressEscape(dialog).defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog).toHaveAttribute('open')
  })
})
