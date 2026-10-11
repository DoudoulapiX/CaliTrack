import { crc32, deflateSync } from 'node:zlib'
import { expect, type Page } from '@playwright/test'

/** Réponse d'Open Food Facts pour une pâte à tartiner (extrait). */
export const NUTELLA_PRODUCT = {
  code: '3017620422003',
  status: 1,
  product: {
    product_name_fr: 'Pâte à tartiner aux noisettes',
    brands: 'Nutella, Ferrero',
    serving_quantity: '15',
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
  },
}

/** Les erreurs de la page (exceptions et console), qui doivent rester vides. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

/** Premier lancement rapide : 30 ans, 1,80 m, 80 kg, le reste par défaut. */
export async function onboard(page: Page): Promise<void> {
  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByLabel('Année de naissance').fill('1996')
  await page.getByLabel('Taille').fill('180')
  await page.getByLabel('Poids').fill('80')
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
}

/** Une image PNG unie de la taille voulue, fabriquée sans bibliothèque (pour simuler une photo). */
export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // 8 bits par couleur
  header[9] = 2 // RVB
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Largeur et hauteur d'un JPEG, lues dans son en-tête (marqueur SOF). */
export function jpegSize(jpeg: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) return null
    const marker = jpeg[offset + 1] ?? 0
    const length = jpeg.readUInt16BE(offset + 2)
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}
