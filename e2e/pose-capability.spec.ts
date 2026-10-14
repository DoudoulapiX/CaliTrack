import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { collectErrors } from './nutrition-helpers'
import {
  clipFrames,
  clipFrameUrl,
  personCameraStopped,
  playPersonCamera,
  serveClipFrames,
  usePersonCamera,
  useReplayedPose,
} from './person-camera'

/*
 * Temporaire (étape 4, WP0) : MediaPipe tourne-t-il dans ce navigateur (Chromium, et WebKit en CI) avec les
 * fichiers de l'appli ? Remplacé par rep-counter-mediapipe.spec.ts quand le compteur sera branché.
 */

// page.route sert MediaPipe et les images : sous WebKit, il faut bloquer le service worker.
test.use({ serviceWorkers: 'block' })

const VISION = join(process.cwd(), 'node_modules/@mediapipe/tasks-vision')
const PROBE = '/__pose-probe/'
const FILES: Record<string, { path: string; type: string }> = {
  'index.html': { path: '', type: 'text/html' },
  'vision_bundle.mjs': { path: join(VISION, 'vision_bundle.mjs'), type: 'text/javascript' },
  'vision_wasm_internal.js': { path: join(VISION, 'wasm/vision_wasm_internal.js'), type: 'text/javascript' },
  'vision_wasm_internal.wasm': {
    path: join(VISION, 'wasm/vision_wasm_internal.wasm'),
    type: 'application/wasm',
  },
  'pose_landmarker_lite.task': {
    path: join(process.cwd(), 'src/assets/pose/pose_landmarker_lite.task'),
    type: 'application/octet-stream',
  },
}

/** Une page vide sous l'origine de l'appli, avec MediaPipe et le modèle servis depuis le disque. */
async function openProbe(page: Page): Promise<void> {
  await page.route(`**${PROBE}*`, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? ''
    const file = FILES[name]
    if (!file) return route.fulfill({ status: 404 })
    if (name === 'index.html') {
      return route.fulfill({
        body: '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Sonde</title><body></body></html>',
        contentType: file.type,
      })
    }
    return route.fulfill({ body: readFileSync(file.path), contentType: file.type })
  })
  await page.goto(`${PROBE}index.html`)
}

/** Les requêtes qui partent ailleurs que vers l'appli : il n'y en a aucune. */
function watchOutside(page: Page): string[] {
  const outside: string[] = []
  page.context().on('request', (request) => {
    if (new URL(request.url()).hostname !== 'localhost') outside.push(request.url())
  })
  return outside
}

interface Detection {
  readonly simd: boolean
  readonly found: readonly boolean[]
}

/** Crée le PoseLandmarker comme l'appli (options de pose-engine.ts) et analyse ces images une à une. */
async function detect(page: Page, frames: readonly string[]): Promise<Detection> {
  return page.evaluate(
    async ({ frames: urls, probe }) => {
      // Comme quietWasmConsole : la ligne INFO du WebAssembly ne va pas dans la console.
      ;(globalThis as { Module?: unknown }).Module = {
        print: () => undefined,
        printErr: (text: string) => {
          if (!text.startsWith('INFO:')) console.warn(text)
        },
      }
      const bundle = `${probe}vision_bundle.mjs`
      const { FilesetResolver, PoseLandmarker } = (await import(
        bundle
      )) as typeof import('@mediapipe/tasks-vision')
      const simd = await FilesetResolver.isSimdSupported()
      const landmarker = await PoseLandmarker.createFromOptions(
        {
          wasmLoaderPath: new URL(`${probe}vision_wasm_internal.js`, location.href).href,
          wasmBinaryPath: new URL(`${probe}vision_wasm_internal.wasm`, location.href).href,
        },
        {
          baseOptions: { modelAssetPath: `${probe}pose_landmarker_lite.task`, delegate: 'CPU' },
          runningMode: 'VIDEO',
          outputSegmentationMasks: false,
          canvas: document.createElement('canvas'),
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        },
      )
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Pas de canvas 2D')
      const found: boolean[] = []
      for (const [index, url] of urls.entries()) {
        const image = await createImageBitmap(await (await fetch(url)).blob())
        canvas.width = image.width
        canvas.height = image.height
        context.drawImage(image, 0, 0)
        image.close()
        found.push(landmarker.detectForVideo(canvas, (index + 1) * 100).landmarks.length > 0)
      }
      landmarker.close()
      return { simd, found }
    },
    { frames, probe: PROBE },
  )
}

test('MediaPipe : le squelette est trouvé sur une vraie vidéo, sans rien envoyer hors de l’appli', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  const outside = watchOutside(page)
  await serveClipFrames(page)
  await openProbe(page)
  // Les 20 premières images (2 s à 10 images par seconde) : une personne, de profil, sur un muret.
  const frames = clipFrames('sports2d-walk')
    .slice(0, 20)
    .map((file) => clipFrameUrl('sports2d-walk', file))
  const { simd, found } = await detect(page, frames)
  expect(simd).toBe(true)
  expect(found).toHaveLength(20)
  expect(found.filter(Boolean).length).toBeGreaterThanOrEqual(15)
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

/** Ouvre la caméra dans une vidéo de la page ; rend la taille de l'image. */
async function startVideo(page: Page): Promise<[number, number]> {
  return page.evaluate(async () => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.id = 'camera'
    document.body.append(video)
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    })
    await video.play()
    while (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return [video.videoWidth, video.videoHeight]
  })
}

/** Couleur moyenne de l'image affichée par la vidéo (r, g, b). */
async function videoColour(page: Page): Promise<[number, number, number]> {
  return page.evaluate(() => {
    const video = document.querySelector('video')
    const canvas = document.createElement('canvas')
    canvas.width = 48
    canvas.height = 27
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!video || !context) throw new Error('Pas de vidéo')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const sum = [0, 0, 0]
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0)
    }
    const pixels = data.length / 4
    return [(sum[0] ?? 0) / pixels, (sum[1] ?? 0) / pixels, (sum[2] ?? 0) / pixels]
  })
}

test('caméra des tests : le clip passe dans une vidéo, avance au signal et s’arrête', async ({ page }) => {
  const errors = collectErrors(page)
  const outside = watchOutside(page)
  await usePersonCamera(page, { clip: 'sports2d-walk', fps: 10 })
  await openProbe(page)
  expect(await startVideo(page)).toEqual([480, 270])

  // La première image reste affichée tant que le clip n'est pas lancé, puis l'image change.
  const first = await videoColour(page)
  await page.waitForTimeout(300)
  expect(await videoColour(page)).toEqual(first)
  await playPersonCamera(page)
  await expect.poll(async () => videoColour(page), { timeout: 5_000 }).not.toEqual(first)

  expect(await personCameraStopped(page)).toBe(false)
  await page.evaluate(() => {
    const video = document.querySelector('video')
    if (!(video?.srcObject instanceof MediaStream)) throw new Error('Pas de flux')
    for (const track of video.srcObject.getTracks()) track.stop()
  })
  expect(await personCameraStopped(page)).toBe(true)
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

test('caméra des tests : image grise sans clip, accès refusé, squelette rejoué', async ({ page }) => {
  await usePersonCamera(page)
  // Fichier de points minimal, au format de src/test/reps (le dossier se remplit avec le compteur).
  const dir = mkdtempSync(join(tmpdir(), 'calitrack-reps-'))
  const fixture = {
    format: 1,
    name: 'vide',
    movement: null,
    exerciseId: null,
    kind: 'negative',
    expected: { reps: 0 },
    split: 'check',
    source: 'test',
    licence: 'MIT',
    estimator: 'test',
    fps: 10,
    width: 480,
    height: 270,
    joints: [0, 11, 12],
    frames: [],
  }
  try {
    writeFileSync(join(dir, 'vide.json'), JSON.stringify(fixture))
    await useReplayedPose(page, 'vide', dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  await openProbe(page)
  expect(
    await page.evaluate(() => (globalThis as { __calitrackPoseReplay?: unknown }).__calitrackPoseReplay),
  ).toEqual(fixture)

  expect(await startVideo(page)).toEqual([640, 480])
  const [r, g, b] = await videoColour(page)
  for (const channel of [r, g, b]) expect(Math.abs(channel - 128)).toBeLessThan(8)

  const denied = await page.context().newPage()
  await usePersonCamera(denied, { deny: true })
  await openProbe(denied)
  const problem = await denied.evaluate(() =>
    navigator.mediaDevices.getUserMedia({ video: true }).then(
      () => 'ouverte',
      (error: unknown) => (error instanceof DOMException ? error.name : String(error)),
    ),
  )
  expect(problem).toBe('NotAllowedError')
  expect(await personCameraStopped(denied)).toBe(false)
})
