import { isValidBarcode, lookupBarcode, offNutrients, offProductUrl, parseOffProduct } from './off'

const NOW = '2026-10-21T09:00:00.000Z'

/** Réponse d'Open Food Facts pour une pâte à tartiner (extrait). */
const nutella = {
  code: '3017620422003',
  status: 1,
  product: {
    product_name: 'Nutella',
    product_name_fr: 'Pâte à tartiner aux noisettes',
    brands: 'Nutella, Ferrero',
    serving_quantity: '15',
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      sugars_100g: 56.3,
      'saturated-fat_100g': 10.6,
      salt_100g: 0.107,
    },
  },
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('Open Food Facts', () => {
  it('vérifie la clé de contrôle des codes-barres', () => {
    expect(isValidBarcode('3017620422003')).toBe(true)
    expect(isValidBarcode('3017620422004')).toBe(false)
    expect(isValidBarcode('96385074')).toBe(true)
    expect(isValidBarcode('036000291452')).toBe(true)
    expect(isValidBarcode('12345')).toBe(false)
    expect(isValidBarcode('30176204220a3')).toBe(false)
  })

  it('demande seulement les champs utiles, en français', () => {
    expect(offProductUrl('3017620422003')).toBe(
      'https://world.openfoodfacts.org/api/v2/product/3017620422003?fields=code,product_name,product_name_fr,generic_name_fr,brands,nutriments,serving_quantity&lc=fr',
    )
  })

  it('lit un produit : nom français, première marque, portion et valeurs pour 100 g', () => {
    expect(parseOffProduct('3017620422003', nutella, NOW)).toEqual({
      status: 'found',
      food: {
        id: 'off:3017620422003',
        source: 'off',
        name: 'Pâte à tartiner aux noisettes',
        brand: 'Nutella',
        barcode: '3017620422003',
        per100: {
          kcal: 539,
          protein: 6.3,
          carbs: 57.5,
          fat: 30.9,
          fiber: null,
          sugars: 56.3,
          satFat: 10.6,
          salt: 0.11,
        },
        servingG: 15,
        createdAt: NOW,
        updatedAt: NOW,
      },
    })
  })

  it('convertit les kilojoules quand les kcal manquent', () => {
    const per100 = offNutrients({
      energy_100g: 418.4,
      proteins_100g: '3,5',
      carbohydrates_100g: 5,
      fat_100g: 1,
    })
    expect(per100).toMatchObject({ kcal: 100, protein: 3.5 })
  })

  it('distingue un produit sans valeurs et un produit inconnu', () => {
    const empty = { status: 1, product: { product_name: '  Biscuits  ', brands: '', nutriments: {} } }
    expect(parseOffProduct('3017620422003', empty, NOW)).toEqual({
      status: 'incomplete',
      name: 'Biscuits',
      brand: '',
    })
    expect(parseOffProduct('3017620422003', { status: 0 }, NOW)).toEqual({ status: 'notFound' })
    expect(parseOffProduct('3017620422003', null, NOW)).toEqual({ status: 'notFound' })
  })

  it('interroge le service et gère ses erreurs', async () => {
    const ok = await lookupBarcode('3017620422003', NOW, () => Promise.resolve(response(200, nutella)))
    expect(ok.status).toBe('found')
    const missing = await lookupBarcode('3017620422003', NOW, () =>
      Promise.resolve(response(404, { status: 0 })),
    )
    expect(missing).toEqual({ status: 'notFound' })
    const down = await lookupBarcode('3017620422003', NOW, () => Promise.resolve(response(503, {})))
    expect(down).toEqual({ status: 'offline' })
    const offline = await lookupBarcode('3017620422003', NOW, () =>
      Promise.reject(new TypeError('Failed to fetch')),
    )
    expect(offline).toEqual({ status: 'offline' })
    const garbage = await lookupBarcode('3017620422003', NOW, () => Promise.resolve(new Response('<html>')))
    expect(garbage).toEqual({ status: 'offline' })
  })
})
