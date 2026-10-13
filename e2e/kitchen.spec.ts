import { expect, test, type Page } from '@playwright/test'
import { expectAccessible } from './a11y-helpers'
import { FRIDGE_ITEMS, IDEAS } from './coach-fixtures'
import { CLAUDE_KEY, collectErrors, fakeClaude, onboard, solidPng } from './nutrition-helpers'

// Sous WebKit, page.route ne voit pas les requêtes d'une page que le service worker contrôle : les
// services simulés (Open Food Facts, Claude, Oura) exigent de le bloquer.
test.use({ serviceWorkers: 'block' })

/** La même vérification en thème sombre puis clair (l'appli suit le réglage de l'iPhone). */
async function expectAccessibleInBothThemes(page: Page, screen: string) {
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme })
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
    await expectAccessible(page, `${screen} (${colorScheme === 'dark' ? 'sombre' : 'clair'})`)
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
}

/** Une demande envoyée à Claude, en texte, pour y chercher un passage. */
function sentText(body: unknown): string {
  return JSON.stringify(body)
}

test('frigo : photo vérifiée puis enregistrée, idée choisie puis ajoutée au déjeuner', async ({
  page,
  context,
}) => {
  // Long parcours (accueil, photo, idées, scans d'accessibilité dans les deux thèmes).
  test.slow()
  const errors = collectErrors(page)
  // Le mercredi 21 octobre 2026 à 12 h 30 : l'heure du déjeuner.
  await page.clock.setFixedTime(new Date('2026-10-21T12:30:00+02:00'))
  const sent = await fakeClaude(page, { fridge: FRIDGE_ITEMS, ideas: IDEAS })
  // Rien d'autre ne sort de l'appli que les demandes à l'API Claude (simulée). WebKit signale aussi
  // l'aperçu de la photo (adresse blob:), qui reste sur le téléphone : seuls http et https comptent.
  const outside: string[] = []
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    if (url.hostname !== 'localhost' && url.hostname !== 'api.anthropic.com') outside.push(request.url())
  })
  await onboard(page)

  // La clé, collée dans les réglages de l'IA.
  await page.goto('more/ai')
  await page.getByLabel('Clé API Claude').fill(CLAUDE_KEY)
  await page.getByRole('button', { name: 'Enregistrer la clé' }).click()
  await expect(page.getByText('sk-ant-…ghij')).toBeVisible()

  // Un frigo vide, rempli d'une photo.
  await page.goto('nutrition/kitchen')
  await expect(page.getByRole('heading', { name: 'Frigo et placards', level: 1 })).toBeVisible()
  await expect(
    page.getByText('Ton frigo est vide ici. Ajoute ce que tu as, ou prends-le en photo.'),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Photographier mon frigo' }).click()
  await expect(page.getByRole('heading', { name: 'Photo du frigo', level: 1 })).toBeVisible()
  await page.getByLabel('Prendre ou choisir une photo').setInputFiles({
    name: 'IMG_0002.png',
    mimeType: 'image/png',
    buffer: solidPng(1600, 1200, [230, 230, 220]),
  })
  await expect(page.getByRole('img', { name: 'Ta photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Analyser la photo' }).click()

  // Les sept aliments vus, à vérifier : pas de lait.
  const seen = page.getByRole('list', { name: 'Aliments vus' })
  await expect(seen.getByRole('group')).toHaveCount(7)
  const fridgeRequest = sent.find((request) => request.task === 'fridge')
  expect(fridgeRequest?.key).toBe(CLAUDE_KEY)
  expect(sentText(fridgeRequest?.body)).toContain('Voici une photo de mon frigo.')
  expect(sentText(fridgeRequest?.body)).toContain('"media_type":"image/jpeg"')
  await expectAccessibleInBothThemes(page, 'photo du frigo')
  await page.getByRole('checkbox', { name: 'Garder Lait demi-écrémé' }).uncheck()
  await page.getByRole('button', { name: 'Enregistrer 6 aliments' }).click()

  // De retour sur la liste : six aliments au frigo.
  await expect(page.getByText('6 aliments ajoutés au frigo')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Frigo et placards', level: 1 })).toBeVisible()
  const fridge = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Frigo', level: 2 }) })
  await expect(fridge.getByRole('button')).toHaveCount(6)
  await expect(fridge.getByRole('button', { name: /^Tomates\s*3$/ })).toBeVisible()
  await expect(fridge.getByRole('button', { name: /^Lait/ })).toHaveCount(0)
  await expectAccessibleInBothThemes(page, 'frigo et placards')

  // Des idées avec ce qu'il y a, pour le déjeuner.
  await page.getByRole('link', { name: 'Trouver des idées de repas' }).click()
  await expect(page.getByRole('heading', { name: 'Idées de repas', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reste pour aujourd’hui', level: 2 })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Déjeuner', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('switch', { name: 'Seulement avec ce que j’ai' })).toBeChecked()
  await page.getByRole('button', { name: 'Proposer des idées' }).click()

  const ideas = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Idées du coach', level: 2 }),
  })
  await expect(ideas.getByRole('heading', { level: 3 })).toHaveText([
    'Omelette aux courgettes',
    'Poulet, riz et tomates',
  ])
  const ideasRequest = sent.find((request) => request.task === 'ideas')
  expect(ideasRequest?.key).toBe(CLAUDE_KEY)
  const ideasText = sentText(ideasRequest?.body)
  expect(ideasText).toContain('Repas : déjeuner')
  expect(ideasText).toMatch(/Reste à manger pour la journée : \d+ kcal/)
  expect(ideasText).toContain('- Frigo : Tomates (3)')
  expect(ideasText).not.toContain('Lait demi-écrémé')
  await expectAccessibleInBothThemes(page, 'idées de repas')

  // L'idée choisie : ses ingrédients, à vérifier, puis ajoutés au déjeuner.
  await ideas.getByRole('button', { name: 'Choisir Poulet, riz et tomates' }).click()
  const ingredients = page.getByRole('list', { name: 'Ingrédients' })
  await expect(ingredients.getByRole('checkbox')).toHaveCount(3)
  await expect(ingredients.getByText('à acheter')).toHaveCount(1)
  await expectAccessibleInBothThemes(page, 'idée choisie')
  await page.getByRole('button', { name: 'Ajouter 3 aliments au déjeuner' }).click()

  await expect(page.getByText('3 aliments ajoutés au déjeuner')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nutrition', level: 1 })).toBeVisible()
  const lunch = page.getByRole('list', { name: 'Déjeuner' })
  await expect(lunch.getByRole('button')).toHaveCount(3)
  await expect(lunch.getByRole('button', { name: /^Blanc de poulet\s*150\sg · 248\skcal$/ })).toBeVisible()
  await expect(lunch.getByRole('button', { name: /^Riz blanc cuit\s*180\sg · 234\skcal$/ })).toBeVisible()
  await expect(lunch.getByRole('button', { name: /^Tomates\s*150\sg · 27\skcal$/ })).toBeVisible()

  // Les idées s'ouvrent aussi depuis l'ajout d'un aliment, pour le repas choisi.
  await page.goto('nutrition/add?day=2026-10-21&meal=dinner')
  await page.getByRole('link', { name: 'Idées avec mon frigo' }).click()
  await expect(page.getByRole('heading', { name: 'Idées de repas', level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/nutrition\/kitchen\/ideas\?day=2026-10-21&meal=dinner$/)
  await expect(page.getByRole('radio', { name: 'Dîner' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ajouter au dîner', level: 1 })).toBeVisible()

  // Deux demandes à Claude seulement, chacune après un geste.
  expect(sent.filter((request) => request.task !== null).map((request) => request.task)).toEqual([
    'fridge',
    'ideas',
  ])
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})
