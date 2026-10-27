// Ajoute une série aux fichiers de points du compteur caméra (src/test/reps) : depuis une vidéo, passée dans le
// même MediaPipe que l'appli (Chromium de Playwright, rien ne sort de la machine), ou depuis un fichier exporté
// par l'appli (« Exporter les points de la série »). Seuls les points du squelette sont gardés, jamais la vidéo
// ni ses images. Puis le compteur rejoue le fichier, pour voir tout de suite si les seuils doivent bouger.
//
// Usage : voir USAGE plus bas, ou npm run reps:add -- --help
// Il faut ffmpeg et le Chromium de Playwright (dossier PLAYWRIGHT_BROWSERS_PATH, comme pour les tests).
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import {
  decodeFixture,
  encodeFixture,
  repFixtureSchema,
  type FixtureMeta,
  type RepFixture,
} from '../src/content/reps/fixture.ts'
import { COUNTED_EXERCISES } from '../src/content/reps/movements.ts'
import { createRepCounter, type RepCounter, type RepCounterOptions } from '../src/content/reps/rep-counter.ts'
import type {
  CountedMovement,
  CountedVariant,
  CounterResult,
  ImagePoint,
  PoseFrame,
  WorldPoint,
} from '../src/content/reps/types.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Images analysées par seconde, comme le compteur sur le téléphone. */
export const FIXTURE_FPS = 15
/** Plus grand côté des images analysées, en pixels (la caméra du compteur filme en 640 × 480). */
export const FRAME_SIZE = 640
export const DEFAULT_OUT = 'src/test/reps'
export const DEFAULT_LICENCE = 'Charles, avec son accord'
/** Temps laissé au compteur après la dernière image pour finir la série tout seul (comme runFixture). */
export const AFTER_LAST_FRAME_MS = 25_000
/** Sous cette part d'images où une personne est vue, la vidéo convient mal (cadrage, lumière). */
export const MIN_DETECTED_SHARE = 0.9

const MOVEMENTS = ['squat', 'pushup', 'dip', 'pullup', 'curl'] as const satisfies readonly CountedMovement[]

const MOVEMENT_NAMES: Readonly<Record<CountedMovement, string>> = {
  squat: 'squats',
  pushup: 'pompes',
  dip: 'dips',
  pullup: 'tractions',
  curl: 'curls',
}

export const USAGE = `Ajoute une série aux fichiers de points du compteur caméra (${DEFAULT_OUT}).

Depuis une vidéo (jamais gardée) :
  npm run reps:add -- --video ~/Downloads/tractions-1.MOV --movement pullup --exercise pullup --reps 8 \\
    --name charles-pullup-1 [--start 2 --end 31.5] [--licence "${DEFAULT_LICENCE}"]
  npm run reps:add -- --video marche.mp4 --negative --name charles-marche-1   (rien ne doit être compté)

Depuis un fichier exporté par l'appli (Infos de réglage › Exporter les points de la série) :
  npm run reps:add -- --trace ~/Downloads/calitrack-points-pullup-2026-10-21-1130.json --name charles-pullup-2 [--reps 8]

Options :
  --movement squat|pushup|dip|pullup|curl   mouvement filmé (déduit de --exercise s'il est compté)
  --exercise <id>     exercice du catalogue (par exemple pullup, Dumbbell_Bicep_Curl)
  --reps <n>          vrai nombre de répétitions (série ratée exprès comprise)
  --start, --end      début et fin de la série dans la vidéo, en secondes
  --licence <texte>   « ${DEFAULT_LICENCE} » par défaut
  --source, --notes   d'où vient la série, remarques
  --split check|tune  check par défaut (sert à vérifier les seuils, pas à les régler)
  --out <dossier>     ${DEFAULT_OUT} par défaut
  --force             remplace un fichier du même nom`

/** Erreur dans la commande : le message est montré avec le mode d'emploi. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

interface Common {
  readonly name: string
  /** Dossier où écrire ; null : src/test/reps. */
  readonly out: string | null
  readonly force: boolean
}

export interface VideoJob extends Common {
  readonly mode: 'video'
  readonly video: string
  /** Début et fin de la série dans la vidéo, en secondes. */
  readonly start: number | null
  readonly end: number | null
  /** Tout le fichier sauf l'outil de mesure, la cadence et la taille des images (connus après l'analyse). */
  readonly meta: Omit<FixtureMeta, 'estimator' | 'fps' | 'width' | 'height'>
}

export interface TraceJob extends Common {
  readonly mode: 'trace'
  readonly trace: string
  readonly reps: number | null
  readonly licence: string
  readonly split: RepFixture['split'] | null
  readonly source: string | null
  readonly notes: string | null
}

export type ScriptJob = { readonly mode: 'help' } | VideoJob | TraceJob

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Un nombre de secondes, avec une virgule ou un point (« 31,5 »). */
function seconds(option: string, value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value.replace(',', '.'))
  if (value.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
    throw new UsageError(`--${option} : un nombre de secondes, par exemple 2 ou 31,5 (reçu « ${value} »)`)
  }
  return parsed
}

function count(value: string | undefined): number | null {
  if (value === undefined) return null
  if (!/^\d+$/.test(value)) throw new UsageError(`--reps : un nombre entier (reçu « ${value} »)`)
  return Number(value)
}

function isMovement(value: string): value is CountedMovement {
  return (MOVEMENTS as readonly string[]).includes(value)
}

/** « 31,5 s » */
function secondsText(value: number): string {
  return `${String(value).replace('.', ',')} s`
}

const OPTIONS = {
  video: { type: 'string' },
  trace: { type: 'string' },
  movement: { type: 'string' },
  exercise: { type: 'string' },
  reps: { type: 'string' },
  name: { type: 'string' },
  start: { type: 'string' },
  end: { type: 'string' },
  licence: { type: 'string' },
  source: { type: 'string' },
  notes: { type: 'string' },
  split: { type: 'string' },
  out: { type: 'string' },
  negative: { type: 'boolean' },
  force: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const

function readOptions(argv: readonly string[]) {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, strict: true, allowPositionals: false }).values
  } catch (error) {
    throw new UsageError(`Commande mal comprise : ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Ce que la commande demande ; erreur claire sinon. Les chemins restent tels que donnés. */
export function parseJob(argv: readonly string[]): ScriptJob {
  const values = readOptions(argv)
  if (values.help) return { mode: 'help' }
  if ((values.video === undefined) === (values.trace === undefined)) {
    throw new UsageError('Il faut --video ou --trace (un seul des deux).')
  }
  const name = values.name
  if (name === undefined) throw new UsageError('Il faut --name, par exemple --name charles-pullup-1.')
  if (!NAME.test(name)) {
    throw new UsageError(
      `--name : lettres minuscules, chiffres et tirets, par exemple charles-pullup-1 (reçu « ${name} »).`,
    )
  }
  const split = values.split ?? null
  if (split !== null && split !== 'check' && split !== 'tune') {
    throw new UsageError(`--split : check ou tune (reçu « ${split} »).`)
  }
  const reps = count(values.reps)
  const common = { name, out: values.out ?? null, force: values.force ?? false }

  if (values.trace !== undefined) {
    for (const option of ['movement', 'exercise', 'start', 'end', 'negative'] as const) {
      if (values[option] !== undefined) throw new UsageError(`--${option} ne sert qu’avec --video.`)
    }
    return {
      mode: 'trace',
      trace: values.trace,
      reps,
      licence: values.licence ?? DEFAULT_LICENCE,
      split,
      source: values.source ?? null,
      notes: values.notes ?? null,
      ...common,
    }
  }

  const video = values.video ?? ''
  const start = seconds('start', values.start)
  const end = seconds('end', values.end)
  if (start !== null && end !== null && end <= start) throw new UsageError('--end doit venir après --start.')
  const exerciseId = values.exercise ?? null
  let movement: CountedMovement | null = null
  if (values.negative) {
    if (values.movement !== undefined || exerciseId !== null) {
      throw new UsageError('--negative : rien n’est compté, donc ni --movement ni --exercise.')
    }
    if (reps !== null && reps !== 0) throw new UsageError('--negative : le compte attendu est 0.')
  } else {
    const counted =
      exerciseId !== null && Object.hasOwn(COUNTED_EXERCISES, exerciseId)
        ? COUNTED_EXERCISES[exerciseId]
        : undefined
    const asked = values.movement
    if (asked !== undefined && !isMovement(asked)) {
      throw new UsageError(`--movement : ${MOVEMENTS.join(', ')} (reçu « ${asked} »).`)
    }
    movement = asked ?? counted?.movement ?? null
    if (movement === null) throw new UsageError('Il faut --movement (ou un --exercise compté par la caméra).')
    if (counted && counted.movement !== movement) {
      throw new UsageError(
        `--exercise ${String(exerciseId)} se compte comme ${counted.movement}, pas ${movement}.`,
      )
    }
    if (reps === null) throw new UsageError('Il faut --reps : le vrai nombre de répétitions de la série.')
  }
  const cut =
    start === null && end === null
      ? ''
      : `, ${start === null ? 'du début' : `de ${secondsText(start)}`} ${end === null ? 'à la fin' : `à ${secondsText(end)}`}`
  return {
    mode: 'video',
    video,
    start,
    end,
    ...common,
    meta: {
      name,
      movement,
      exerciseId,
      kind: movement === null ? 'negative' : 'set',
      expected: { reps: reps ?? 0 },
      split: split ?? 'check',
      source: values.source ?? `Vidéo ${basename(video)}${cut}`,
      licence: values.licence ?? DEFAULT_LICENCE,
      ...(values.notes === undefined ? {} : { notes: values.notes }),
    },
  }
}

/** ffmpeg : 15 images par seconde, plus grand côté 640 px (vidéo de l'iPhone redressée), en JPEG numérotés. */
export function ffmpegArgs(job: Pick<VideoJob, 'video' | 'start' | 'end'>, dir: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    ...(job.start === null ? [] : ['-ss', String(job.start)]),
    ...(job.end === null ? [] : ['-to', String(job.end)]),
    '-i',
    job.video,
    '-an',
    '-vf',
    `fps=${String(FIXTURE_FPS)},scale=w=${String(FRAME_SIZE)}:h=${String(FRAME_SIZE)}:force_original_aspect_ratio=decrease`,
    '-q:v',
    '3',
    join(dir, '%05d.jpg'),
  ]
}

/** Temps de l'image i (à partir de 0), en millisecondes entières : i × 1000 / 15. */
export function frameTime(index: number, fps: number = FIXTURE_FPS): number {
  return Math.round((index * 1000) / fps)
}

/** Ce que rend la page pour une image : les 33 points de la personne vue, ou null. */
export interface Detection {
  readonly image: readonly (readonly number[])[] | null
  readonly world: readonly (readonly number[])[] | null
  /** Durée de l'analyse, en millisecondes. */
  readonly ms: number
}

/** Les images analysées, à leur temps (i × 1000 / 15). */
export function framesFromDetections(
  detections: readonly Detection[],
  width: number,
  height: number,
  fps: number = FIXTURE_FPS,
): PoseFrame[] {
  return detections.map((detection, index) => ({
    t: frameTime(index, fps),
    width,
    height,
    image: detection.image?.map((p): ImagePoint => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]) ?? null,
    world: detection.world?.map((p): WorldPoint => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]) ?? null,
  }))
}

/** Nom de l'outil de mesure noté dans le fichier : « mediapipe-0.10.35-lite-cpu ». */
export function estimatorName(version: string): string {
  return `mediapipe-${version}-lite-cpu`
}

/** Le fichier tiré d'une vidéo analysée. */
export function videoFixture(job: VideoJob, frames: readonly PoseFrame[], version: string): RepFixture {
  const first = frames[0]
  return encodeFixture(
    {
      ...job.meta,
      estimator: estimatorName(version),
      fps: FIXTURE_FPS,
      width: first?.width ?? FRAME_SIZE,
      height: first?.height ?? FRAME_SIZE,
    },
    frames,
  )
}

/** Un fichier exporté par l'appli, validé, renommé, avec le compte, la licence et les notes demandés. */
export function traceFixture(job: TraceJob, raw: unknown): RepFixture {
  const parsed = repFixtureSchema.safeParse(raw)
  if (!parsed.success) {
    throw new UsageError(
      `${basename(job.trace)} n’est pas un fichier de points du compteur : ${parsed.error.message}`,
    )
  }
  const fixture = parsed.data
  if (fixture.kind === 'negative' && job.reps !== null && job.reps !== 0) {
    throw new UsageError('Ce fichier ne compte rien : --reps doit être 0.')
  }
  return {
    ...fixture,
    name: job.name,
    expected: job.reps === null ? fixture.expected : { ...fixture.expected, reps: job.reps },
    licence: job.licence,
    ...(job.split === null ? {} : { split: job.split }),
    ...(job.source === null ? {} : { source: job.source }),
    ...(job.notes === null ? {} : { notes: job.notes }),
  }
}

/** La variante comptée : celle de l'exercice du fichier, sinon celle de base du mouvement. */
export function fixtureVariant(fixture: RepFixture, movement: CountedMovement): CountedVariant {
  const id = fixture.exerciseId
  const counted = id !== null && Object.hasOwn(COUNTED_EXERCISES, id) ? COUNTED_EXERCISES[id] : undefined
  return counted?.movement === movement ? counted : { movement, overrides: {} }
}

/**
 * Rejoue le fichier dans le compteur, comme runFixture (src/content/reps/evaluate.ts) : chaque image, puis le
 * temps qui passe jusqu'à 25 s, puis « Terminer la série ».
 */
export function replayFixture(
  fixture: RepFixture,
  variant: CountedVariant,
  create: (options: RepCounterOptions) => RepCounter = createRepCounter,
): CounterResult {
  const frames = decodeFixture(fixture)
  const counter = create({ variant })
  for (const frame of frames) {
    counter.push(frame)
    if (counter.result) return counter.result
  }
  const last = frames[frames.length - 1]?.t ?? 0
  // Une image manquée toutes les 1000 / fps ms (k × 1000 ≤ 25 s × fps : sans erreur d'arrondi).
  for (let k = 1; k * 1000 <= AFTER_LAST_FRAME_MS * fixture.fps; k++) {
    counter.tick(Math.round(last + (k * 1000) / fixture.fps))
    if (counter.result) return counter.result
  }
  return counter.finish(last + AFTER_LAST_FRAME_MS, 'manual')
}

export interface Replay {
  readonly movement: CountedMovement
  readonly result: CounterResult
}

/** Une série avec son mouvement ; un moment sans exercice avec les cinq. */
export function replayAll(
  fixture: RepFixture,
  create?: (options: RepCounterOptions) => RepCounter,
): Replay[] {
  const movements = fixture.movement === null ? MOVEMENTS : [fixture.movement]
  return movements.map((movement) => ({
    movement,
    result: replayFixture(fixture, fixtureVariant(fixture, movement), create),
  }))
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n > 1 ? many : one}`
const percent = (share: number) => `${String(Math.round(share * 100))} %`

/** Ce que la commande affiche à la fin : le fichier, les silhouettes trouvées, et ce que compte le compteur. */
export function summaryLines(path: string, fixture: RepFixture, replays: readonly Replay[]): string[] {
  const frames = fixture.frames.length
  const seen = fixture.frames.filter(([, image]) => image !== 0).length
  const share = frames === 0 ? 0 : seen / frames
  const lines = [
    `${path} écrit : ${plural(frames, 'image', 'images')} (${String(fixture.fps)} par seconde, ${String(fixture.width)} × ${String(fixture.height)}), silhouette trouvée sur ${String(seen)} (${percent(share)}).`,
  ]
  if (share < MIN_DETECTED_SHARE) {
    lines.push(
      `Attention : silhouette trouvée sur moins de ${percent(MIN_DETECTED_SHARE)} des images. Vérifie le cadrage (corps entier) et la lumière.`,
    )
  }
  const expected = fixture.expected.reps
  let mismatch = false
  for (const { movement, result } of replays) {
    if (result.reps !== expected) mismatch = true
    const verdict = result.confident ? 'sûr' : `à vérifier (${result.reasons.join(', ')})`
    lines.push(
      `Compteur, ${MOVEMENT_NAMES[movement]} : ${plural(result.reps, 'répétition comptée', 'répétitions comptées')} sur ${String(expected)} attendue${expected > 1 ? 's' : ''}, ${verdict}, fin : ${result.endedBy}.`,
    )
  }
  lines.push(
    mismatch
      ? 'Écart avec le compte attendu : règle src/content/reps/specs.ts (jamais expected), puis npm run reps:eval.'
      : 'Le compteur trouve le compte attendu.',
  )
  return lines
}

/* ------------------------------------------------------------------ */
/* Ce qui suit touche au disque, à ffmpeg et au navigateur                */
/* ------------------------------------------------------------------ */

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((done, fail) => {
    execFile(command, [...args], (error, _stdout, stderr) => {
      if (error) fail(new Error(`${command} a échoué : ${stderr.trim() || error.message}`))
      else done()
    })
  })
}

const VISION = join(ROOT, 'node_modules/@mediapipe/tasks-vision')
const BASE = 'http://localhost/__reps-fixture/'
/** Les fichiers servis à la page, depuis le disque : MediaPipe, son modèle, et les images extraites. */
function servedFile(path: string, framesDir: string): { file: string; type: string } | null {
  const files: Record<string, { file: string; type: string }> = {
    'vision_bundle.mjs': { file: join(VISION, 'vision_bundle.mjs'), type: 'text/javascript' },
    'vision_wasm_internal.js': {
      file: join(VISION, 'wasm/vision_wasm_internal.js'),
      type: 'text/javascript',
    },
    'vision_wasm_internal.wasm': {
      file: join(VISION, 'wasm/vision_wasm_internal.wasm'),
      type: 'application/wasm',
    },
    'pose_landmarker_lite.task': {
      file: join(ROOT, 'src/assets/pose/pose_landmarker_lite.task'),
      type: 'application/octet-stream',
    },
  }
  const frame = /^frames\/(\d{5}\.jpg)$/.exec(path)
  if (frame?.[1]) return { file: join(framesDir, frame[1]), type: 'image/jpeg' }
  return files[path] ?? null
}

/** Dans la page : crée le PoseLandmarker comme l'appli (options de pose-engine.ts, processeur, mode VIDEO). */
async function createLandmarker(base: string): Promise<boolean> {
  // Comme quietWasmConsole : la ligne INFO du WebAssembly ne va pas dans la console.
  ;(globalThis as { Module?: unknown }).Module = {
    print: () => undefined,
    printErr: (text: string) => {
      if (!text.startsWith('INFO:')) console.warn(text)
    },
  }
  const vision = (await import(`${base}vision_bundle.mjs`)) as typeof import('@mediapipe/tasks-vision')
  if (!(await vision.FilesetResolver.isSimdSupported())) return false
  const landmarker = await vision.PoseLandmarker.createFromOptions(
    {
      wasmLoaderPath: `${base}vision_wasm_internal.js`,
      wasmBinaryPath: `${base}vision_wasm_internal.wasm`,
    },
    {
      baseOptions: { modelAssetPath: `${base}pose_landmarker_lite.task`, delegate: 'CPU' },
      runningMode: 'VIDEO',
      outputSegmentationMasks: false,
      canvas: document.createElement('canvas'),
      // POSE_OPTIONS de src/features/workout/counter/pose-engine.ts.
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    },
  )
  ;(globalThis as { __repsLandmarker?: unknown }).__repsLandmarker = landmarker
  return true
}

/** Dans la page : analyse les images [from, to) au temps i × 1000 / fps ; rend aussi la taille des images. */
async function detectFrames({
  base,
  from,
  to,
  fps,
}: {
  base: string
  from: number
  to: number
  fps: number
}): Promise<{ detections: Detection[]; width: number; height: number }> {
  const landmarker = (globalThis as { __repsLandmarker?: import('@mediapipe/tasks-vision').PoseLandmarker })
    .__repsLandmarker
  if (!landmarker) throw new Error('PoseLandmarker pas créé')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Pas de canvas 2D')
  const detections: Detection[] = []
  for (let index = from; index < to; index++) {
    const response = await fetch(`${base}frames/${String(index + 1).padStart(5, '0')}.jpg`)
    const bitmap = await createImageBitmap(await response.blob())
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const started = performance.now()
    const result = landmarker.detectForVideo(canvas, Math.round((index * 1000) / fps))
    const ms = performance.now() - started
    const image = result.landmarks[0]
    const world = result.worldLandmarks[0]
    detections.push({
      image: image ? image.map((p) => [p.x, p.y, Number.isFinite(p.visibility) ? p.visibility : 0]) : null,
      world: world ? world.map((p) => [p.x, p.y, p.z]) : null,
      ms,
    })
  }
  return { detections, width: canvas.width, height: canvas.height }
}

interface Analysis {
  readonly frames: PoseFrame[]
  readonly msP50: number
  readonly warnings: readonly string[]
}

/** Passe les images du dossier dans MediaPipe, dans Chromium, sans aucune requête hors de la page. */
async function analyseFrames(framesDir: string, count: number): Promise<Analysis> {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const outside: string[] = []
  const warnings: string[] = []
  try {
    const context = await browser.newContext()
    await context.route('**/*', async (route) => {
      const url = route.request().url()
      if (!url.startsWith(BASE)) {
        outside.push(url)
        await route.abort()
        return
      }
      const path = url.slice(BASE.length)
      if (path === 'index.html') {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Points du compteur</title><body></body></html>',
        })
        return
      }
      const served = servedFile(path, framesDir)
      if (!served) {
        await route.fulfill({ status: 404 })
        return
      }
      await route.fulfill({ contentType: served.type, body: readFileSync(served.file) })
    })
    const page = await context.newPage()
    page.on('console', (message) => {
      // Les avertissements de MediaPipe et du WebGL logiciel de Chromium ne disent rien d'utile ici.
      if (message.type() === 'error') warnings.push(message.text())
    })
    page.on('pageerror', (error) => warnings.push(error.message))
    await page.goto(`${BASE}index.html`)
    if (!(await page.evaluate(createLandmarker, BASE))) {
      throw new Error('Ce Chromium ne fait pas tourner MediaPipe (pas de WebAssembly SIMD).')
    }
    const detections: Detection[] = []
    let width = 0
    let height = 0
    const batch = 30
    for (let from = 0; from < count; from += batch) {
      const part = await page.evaluate(detectFrames, {
        base: BASE,
        from,
        to: Math.min(count, from + batch),
        fps: FIXTURE_FPS,
      })
      detections.push(...part.detections)
      width = part.width
      height = part.height
      console.log(`Images analysées : ${String(detections.length)} sur ${String(count)}`)
    }
    if (outside.length > 0) throw new Error(`La page a voulu sortir de la machine : ${outside.join(', ')}`)
    const durations = detections.map((detection) => detection.ms).sort((a, b) => a - b)
    return {
      frames: framesFromDetections(detections, width, height),
      msP50: durations[Math.floor(durations.length / 2)] ?? 0,
      warnings,
    }
  } finally {
    await browser.close()
  }
}

async function fromVideo(job: VideoJob): Promise<RepFixture> {
  if (!existsSync(job.video)) throw new UsageError(`Vidéo introuvable : ${job.video}`)
  const dir = mkdtempSync(join(tmpdir(), 'calitrack-reps-'))
  try {
    await run('ffmpeg', ffmpegArgs(job, dir))
    const count = readdirSync(dir).filter((file) => /^\d{5}\.jpg$/.test(file)).length
    if (count === 0) throw new UsageError('ffmpeg n’a sorti aucune image : vérifie --start et --end.')
    console.log(
      `${String(count)} images extraites (${String(FIXTURE_FPS)} par seconde), analyse par MediaPipe…`,
    )
    const { frames, msP50, warnings } = await analyseFrames(dir, count)
    console.log(`Analyse : ${String(Math.round(msP50))} ms par image (médiane).`)
    for (const warning of warnings) console.warn(`Page : ${warning}`)
    const { version } = JSON.parse(readFileSync(join(VISION, 'package.json'), 'utf8')) as { version: string }
    return videoFixture(job, frames, version)
  } finally {
    // Les images de la vidéo ne restent jamais sur le disque.
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main(argv: readonly string[]): Promise<void> {
  const job = parseJob(argv)
  if (job.mode === 'help') {
    console.log(USAGE)
    return
  }
  // npm run part du dossier du dépôt : les chemins donnés partent de là où la commande a été tapée.
  const here = process.env['INIT_CWD'] ?? process.cwd()
  const out = job.out === null ? join(ROOT, DEFAULT_OUT) : resolve(here, job.out)
  const path = join(out, `${job.name}.json`)
  if (existsSync(path) && !job.force) {
    throw new UsageError(
      `${path} existe déjà : choisis un autre --name, ou ajoute --force pour le remplacer.`,
    )
  }
  const fixture =
    job.mode === 'video'
      ? await fromVideo({ ...job, video: resolve(here, job.video) })
      : traceFixture(job, JSON.parse(readFileSync(resolve(here, job.trace), 'utf8')) as unknown)
  const valid = repFixtureSchema.parse(fixture)
  mkdirSync(out, { recursive: true })
  writeFileSync(path, `${JSON.stringify(valid)}\n`)
  for (const line of summaryLines(path, valid, replayAll(valid))) console.log(line)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof UsageError) console.error(`${error.message}\n\n${USAGE}`)
    else console.error(error)
    process.exitCode = 1
  })
}
