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
    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    expect(window.location.pathname).toBe(`${BASENAME}/`)
  })
})
