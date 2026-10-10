import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '@/test/db'
import { BASENAME } from './router'
import { App } from './App'

describe('App', () => {
  beforeEach(async () => {
    await resetDb()
    window.history.replaceState(null, '', `${BASENAME}/`)
  })

  it('accueille au premier lancement puis ouvre l’appli', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Commencer' }))
    // Les réponses par défaut suffisent : on passe chaque étape.
    for (let step = 1; step <= 4; step++) {
      expect(await screen.findByText(`Étape ${step} sur 5`)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Continuer' }))
    }
    await user.click(await screen.findByRole('button', { name: 'Terminer' }))
    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    expect(window.location.pathname).toBe(`${BASENAME}/`)
  })
})
