import { act, fireEvent, render, screen } from '@testing-library/react'
import { ensureSeeded } from '@/db/seed'
import { resetDb } from '@/test/db'
import { DataProvider, INTRO_TIMEOUT_MS } from './DataProvider'

/**
 * Ouvre l'appli, et à côté une copie témoin dont l'anneau ne s'anime pas : quand le témoin s'affiche, les
 * données sont prêtes, et l'écran de chargement de l'appli ne tient plus qu'à son anneau.
 */
async function openApp({ withWitness = false } = {}) {
  await resetDb()
  await ensureSeeded()
  render(
    <>
      <DataProvider>
        <h1>Aujourd’hui</h1>
      </DataProvider>
      {withWitness && (
        <DataProvider>
          <p>Témoin prêt</p>
        </DataProvider>
      )}
    </>,
  )
  expect(screen.getAllByText('Chargement…')[0]).toBeInTheDocument()
  return screen.getAllByTestId('app-icon-fill')[0]!
}

async function waitForData() {
  expect(await screen.findByText('Témoin prêt')).toBeInTheDocument()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
}

describe('ouverture de l’appli', () => {
  it('s’ouvre dès que les données sont prêtes quand l’anneau ne s’anime pas', async () => {
    await openApp()
    expect(await screen.findByRole('heading', { name: 'Aujourd’hui' })).toBeInTheDocument()
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument()
  })

  it('laisse l’anneau finir de se remplir avant de montrer l’appli', async () => {
    const fill = await openApp({ withWitness: true })
    fireEvent.animationStart(fill)
    await waitForData()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Aujourd’hui' })).not.toBeInTheDocument()
    fireEvent.animationEnd(fill)
    expect(await screen.findByRole('heading', { name: 'Aujourd’hui' })).toBeInTheDocument()
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument()
  })

  it('montre l’appli quand même si la fin du remplissage n’arrive jamais', async () => {
    const fill = await openApp({ withWitness: true })
    fireEvent.animationStart(fill)
    await waitForData()
    expect(screen.queryByRole('heading', { name: 'Aujourd’hui' })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Aujourd’hui' }, { timeout: INTRO_TIMEOUT_MS + 1000 }),
    ).toBeInTheDocument()
  })
})
