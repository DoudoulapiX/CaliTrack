import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { ZERO_NUTRIENTS } from '@/content/nutrition/nutrients'
import { db } from '@/db/db'
import { saveFood } from '@/db/nutrition'
import { updateProfile } from '@/db/settings'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

const NUTELLA = '3017620422003'
const SCAN = '/nutrition/scan?day=2026-10-21&meal=breakfast'

/** Réponse d'Open Food Facts pour une pâte à tartiner (extrait). */
const nutella = {
  code: NUTELLA,
  status: 1,
  product: {
    product_name: 'Nutella',
    product_name_fr: 'Pâte à tartiner aux noisettes',
    brands: 'Nutella, Ferrero',
    serving_quantity: '15',
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
  },
}

const charles = () => updateProfile({ sex: 'male', birthYear: 1996, heightCm: 180, weightKg: 80 })

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Remplace l'accès au réseau : chaque appel reçoit la réponse suivante (une erreur = pas de réseau). */
function stubFetch(...answers: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const answer of answers) {
    if (answer instanceof Error) fetchMock.mockRejectedValueOnce(answer)
    else fetchMock.mockResolvedValueOnce(answer)
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function typeCode(user: UserEvent, code: string) {
  await user.type(await screen.findByLabelText('Ou tape le code'), code)
  await user.click(screen.getByRole('button', { name: 'Chercher' }))
}

describe('scan des codes-barres', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 8, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('trouve un produit sur Open Food Facts, l’ajoute, puis le reconnaît sans internet', async () => {
    const fetchMock = stubFetch(json(200, nutella))
    const { user, router } = await renderApp(SCAN, { setup: charles })
    expect(await screen.findByRole('heading', { name: 'Scanner un produit', level: 1 })).toBeInTheDocument()
    // Pas de caméra dans les tests : l'écran le dit et propose de taper le code.
    expect(
      await screen.findByText('Pas de caméra disponible : tape le code-barres ci-dessous.'),
    ).toBeInTheDocument()
    expectFrenchSpacing()

    await typeCode(user, '3017 6204 2200 3')
    const sheet = await screen.findByRole('dialog', { name: 'Pâte à tartiner aux noisettes' })
    expect(screen.getByText('Produit trouvé')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nutrition/add')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/product/${NUTELLA}?`), expect.anything())
    // La portion indiquée par Open Food Facts est proposée.
    expect(within(sheet).getByLabelText('Quantité')).toHaveValue('15')
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter au petit-déjeuner' }))
    expect(await db.foodEntries.toArray()).toMatchObject([
      { meal: 'breakfast', date: '2026-10-21', source: 'off', grams: 15 },
    ])

    // Deuxième scan : le produit est déjà dans le téléphone, aucune requête.
    await router.navigate(SCAN)
    await typeCode(user, NUTELLA)
    expect(await screen.findByRole('dialog', { name: 'Pâte à tartiner aux noisettes' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('préfère un aliment perso qui porte le même code-barres', async () => {
    const fetchMock = stubFetch()
    const { user } = await renderApp(SCAN, {
      setup: async () => {
        await charles()
        await saveFood({
          id: 'perso',
          source: 'custom',
          name: 'Pâte à tartiner de Charles',
          brand: '',
          barcode: NUTELLA,
          per100: { ...ZERO_NUTRIENTS, kcal: 530 },
          servingG: null,
          createdAt: '2026-10-01T08:00:00.000Z',
          updatedAt: '2026-10-01T08:00:00.000Z',
        })
      },
    })
    await typeCode(user, NUTELLA)
    expect(await screen.findByRole('dialog', { name: 'Pâte à tartiner de Charles' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fait créer un produit inconnu avec son code-barres, puis l’ajoute', async () => {
    stubFetch(json(404, { status: 0, status_verbose: 'product not found' }))
    const { user, router } = await renderApp(SCAN, { setup: charles })
    await typeCode(user, NUTELLA)
    expect(await screen.findByRole('heading', { name: 'Produit inconnu', level: 2 })).toBeInTheDocument()
    expect(screen.getByText(`Code ${NUTELLA}`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    expectFrenchSpacing()

    await user.click(screen.getByRole('link', { name: 'Créer le produit' }))
    expect(await screen.findByRole('heading', { name: 'Nouvel aliment', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('Code-barres (facultatif)')).toHaveValue(NUTELLA)
    expect(screen.getByLabelText('Nom')).toHaveValue('')
    await user.type(screen.getByLabelText('Nom'), 'Pâte à tartiner')
    await user.type(screen.getByLabelText('Calories'), '539')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('dialog', { name: 'Pâte à tartiner' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nutrition/add')
    expect(await db.foods.toArray()).toMatchObject([{ source: 'custom', barcode: NUTELLA }])
  })

  it('fait compléter un produit connu sans valeurs nutritionnelles', async () => {
    stubFetch(json(200, { ...nutella, product: { ...nutella.product, nutriments: {} } }))
    const { user } = await renderApp(SCAN, { setup: charles })
    await typeCode(user, NUTELLA)
    expect(await screen.findByRole('heading', { name: 'Valeurs manquantes', level: 2 })).toBeInTheDocument()
    expect(
      screen.getByText(/^« Pâte à tartiner aux noisettes » est dans Open Food Facts/),
    ).toBeInTheDocument()
    expectFrenchSpacing()

    await user.click(screen.getByRole('link', { name: 'Compléter le produit' }))
    expect(await screen.findByRole('heading', { name: 'Nouvel aliment', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('Nom')).toHaveValue('Pâte à tartiner aux noisettes')
    expect(screen.getByLabelText('Marque (facultatif)')).toHaveValue('Nutella')
    expect(screen.getByLabelText('Code-barres (facultatif)')).toHaveValue(NUTELLA)
  })

  it('propose de réessayer sans connexion', async () => {
    const fetchMock = stubFetch(new TypeError('Failed to fetch'), json(200, nutella))
    const { user } = await renderApp(SCAN, { setup: charles })
    await typeCode(user, NUTELLA)
    expect(await screen.findByRole('heading', { name: 'Pas de connexion', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Créer le produit' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('dialog', { name: 'Pâte à tartiner aux noisettes' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refuse un code mal tapé et permet de scanner un autre produit', async () => {
    const fetchMock = stubFetch(json(404, { status: 0 }))
    const { user } = await renderApp(SCAN, { setup: charles })
    await typeCode(user, '3017620422004')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ce code-barres n’est pas valable : vérifie les chiffres sous les barres.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
    // Corriger le code efface l'erreur.
    await user.clear(screen.getByLabelText('Ou tape le code'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await typeCode(user, NUTELLA)
    await user.click(await screen.findByRole('button', { name: 'Scanner un autre produit' }))
    expect(await screen.findByLabelText('Ou tape le code')).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Produit inconnu' })).not.toBeInTheDocument()
  })
})
