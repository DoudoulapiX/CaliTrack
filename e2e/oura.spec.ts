import { expect, test } from '@playwright/test'
import { collectErrors, onboard } from './nutrition-helpers'
import { configureOura, fakeOura, OURA_TOKEN } from './oura-helpers'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T11:00:00+02:00'))
})

test('Oura : relais vérifié, bague connectée, récupération sur l’accueil', async ({ page }) => {
  const errors = collectErrors(page)
  const sent = await fakeOura(page)
  await onboard(page)
  await configureOura(page)

  // Aller-retour chez Oura : l'accès est gardé, l'adresse nettoyée, les données lues aussitôt.
  await page.getByRole('button', { name: 'Connecter ma bague' }).click()
  await expect(page.getByText('Bague connectée')).toBeVisible()
  await expect(page).toHaveURL(/\/CaliTrack\/more\/oura$/)
  await expect(page.getByText('Synchronisée aujourd’hui à 11:00')).toBeVisible()
  await expect(page.getByText('Accès valable jusqu’au 20 novembre')).toBeVisible()
  expect(sent.at(-1)).toBe(`Bearer ${OURA_TOKEN}`)

  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Aujourd’hui' })
    .click()
  const card = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Récupération', level: 2 }) })
  await expect(card.getByText('82', { exact: true })).toBeVisible()
  await expect(card.getByText('Bonne', { exact: true })).toBeVisible()
  await expect(card.getByText('Cette nuit')).toBeVisible()
  await expect(card).toContainText(/Sommeil7\sh\s20/)
  await expect(card.getByRole('progressbar', { name: 'Score de récupération' })).toHaveAttribute(
    'aria-valuenow',
    '82',
  )
  expect(errors).toEqual([])
})

test('Oura : retour ouvert hors de l’appli, lien copié puis collé', async ({ page }) => {
  const errors = collectErrors(page)
  await fakeOura(page)
  await onboard(page)
  await configureOura(page)

  // Le retour s'ouvre là où la demande n'est pas connue (Safari) : la page propose de copier le lien.
  await page.goto(
    `oura/callback#access_token=${OURA_TOKEN}&token_type=bearer&expires_in=2592000&state=ailleurs`,
  )
  await expect(page.getByRole('heading', { name: 'Dernière étape', level: 2 })).toBeVisible()
  const link = await page.getByLabel('Lien de retour').inputValue()
  expect(link).toMatch(/\/CaliTrack\/oura\/callback#access_token=jeton-e2e&/)

  await page.goto('more/oura')
  await page.getByLabel('Lien de retour').fill(link)
  await page.getByRole('button', { name: 'Valider le lien' }).click()
  await expect(page.getByText('Bague connectée')).toBeVisible()
  await expect(page.getByText('Synchronisée aujourd’hui à 11:00')).toBeVisible()
  expect(errors).toEqual([])
})
