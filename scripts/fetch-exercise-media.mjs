// Télécharge la base libre free-exercise-db (domaine public) et convertit ses images en WebP
// dans public/ex/<id>/<n>.webp. À relancer seulement pour mettre à jour la base.
//
// Usage : node scripts/fetch-exercise-media.mjs [--width=560] [--quality=64] [--force]
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'scripts', '.cache', 'fedb')
const outDir = join(root, 'public', 'ex')
const sourceDir = join(root, 'scripts', 'source')
const RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? 'true']
  }),
)
const WIDTH = Number(args.width ?? 560)
const QUALITY = Number(args.quality ?? 64)
const FORCE = args.force === 'true'
const CONCURRENCY = 8

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function fetchWithRetry(url, tries = 5) {
  let lastError
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (error) {
      lastError = error
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
    }
  }
  throw lastError
}

async function main() {
  await mkdir(cacheDir, { recursive: true })
  await mkdir(sourceDir, { recursive: true })
  const datasetPath = join(sourceDir, 'free-exercise-db.json')
  if (FORCE || !(await exists(datasetPath))) {
    const buf = await fetchWithRetry(`${RAW}/dist/exercises.json`)
    JSON.parse(buf.toString('utf8'))
    await writeFile(datasetPath, buf)
    console.log('Base téléchargée :', datasetPath)
  }
  const exercises = JSON.parse(await readFile(datasetPath, 'utf8'))
  const jobs = []
  for (const ex of exercises) {
    ex.images.forEach((img, index) => jobs.push({ id: ex.id, img, index }))
  }
  console.log(`${exercises.length} exercices, ${jobs.length} images`)

  let done = 0
  let converted = 0
  let failed = 0
  let bytes = 0
  async function worker() {
    for (;;) {
      const job = jobs.shift()
      if (!job) return
      const target = join(outDir, job.id, `${job.index}.webp`)
      try {
        if (FORCE || !(await exists(target))) {
          const cached = join(cacheDir, job.img)
          let input
          if (await exists(cached)) {
            input = await readFile(cached)
          } else {
            input = await fetchWithRetry(`${RAW}/exercises/${job.img}`)
            await mkdir(dirname(cached), { recursive: true })
            await writeFile(cached, input)
          }
          const out = await sharp(input)
            .resize({ width: WIDTH, withoutEnlargement: true })
            .webp({ quality: QUALITY, effort: 5 })
            .toBuffer()
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, out)
          bytes += out.length
          converted++
        }
      } catch (error) {
        failed++
        console.error('Échec', job.img, error instanceof Error ? error.message : error)
      }
      done++
      if (done % 100 === 0) console.log(`${done}/${done + jobs.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(
    `Terminé : ${converted} converties, ${failed} échecs, ${(bytes / 1024 / 1024).toFixed(1)} Mo écrits`,
  )
  if (failed > 0) process.exitCode = 1
}

await main()
