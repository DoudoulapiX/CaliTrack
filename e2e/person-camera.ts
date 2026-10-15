import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

/**
 * Caméra filmant une personne, pour Chromium et WebKit (qui n'a pas de fausse caméra dans Playwright) :
 * getUserMedia rend une vidéo faite des images d'un clip de e2e/media, dessinées sur un canvas.
 * Les specs qui s'en servent bloquent le service worker (`test.use({ serviceWorkers: 'block' })`) : sous WebKit,
 * page.route ne voit pas les requêtes d'une page qu'il contrôle.
 */

/** Les clips : un dossier d'images numérotées (00001.jpg…) et leur SOURCE.txt. */
const MEDIA_DIR = join(process.cwd(), 'e2e/media')
/** Les fichiers de points des vraies séries (src/test/reps), rejoués à la place de MediaPipe. */
const REPS_DIR = join(process.cwd(), 'src/test/reps')

const FRAME_ROUTE = '/__person-camera/'

export interface PersonCameraOptions {
  /** Dossier d'images numérotées sous e2e/media ; sans dossier : image grise. */
  clip?: string
  /** Images par seconde une fois le clip lancé (10 par défaut). */
  fps?: number
  /** Refuser l'accès, comme « Ne pas autoriser » sur l'iPhone (NotAllowedError). */
  deny?: boolean
}

interface PersonCameraSetup {
  readonly frames: readonly string[]
  readonly fps: number
  readonly drawFps: number
  readonly deny: boolean
}

/** Ce que la page expose aux tests (`window.__personCamera`). */
interface PersonCameraControl {
  play(): void
  stopped(): boolean
}

/** Les images d'un clip, dans l'ordre. */
export function clipFrames(clip: string): string[] {
  const files = readdirSync(join(MEDIA_DIR, clip))
    .filter((file) => /^\d{5}\.jpg$/.test(file))
    .sort()
  if (files.length === 0) throw new Error(`Aucune image dans e2e/media/${clip}`)
  return files
}

/** Adresse (même origine que l'appli) d'une image de clip, servie par usePersonCamera. */
function clipFrameUrl(clip: string, file: string): string {
  return `${FRAME_ROUTE}${clip}/${file}`
}

/** Sert les images des clips depuis le disque, sous l'origine de l'appli (jamais « à l'extérieur »). */
async function serveClipFrames(page: Page): Promise<void> {
  await page.route(`**${FRAME_ROUTE}**`, (route) => {
    const match = /\/__person-camera\/([\w-]+)\/(\d{5}\.jpg)$/.exec(new URL(route.request().url()).pathname)
    if (!match?.[1] || !match[2]) return route.fulfill({ status: 404 })
    return route.fulfill({
      body: readFileSync(join(MEDIA_DIR, match[1], match[2])),
      contentType: 'image/jpeg',
    })
  })
}

/** Exécuté dans la page avant l'appli : remplace getUserMedia. Autonome (aucune variable du test). */
function installPersonCamera({ frames, fps, drawFps, deny }: PersonCameraSetup): void {
  const tracks: MediaStreamTrack[] = []
  const stoppedTracks = new WeakSet<MediaStreamTrack>()
  let startedAt: number | null = null
  let bitmaps: Promise<ImageBitmap[]> | null = null

  const load = async (url: string) => createImageBitmap(await (await fetch(url)).blob())

  async function getUserMedia(): Promise<MediaStream> {
    if (deny) throw new DOMException('Permission refusée', 'NotAllowedError')
    bitmaps ??= Promise.all(frames.map(load))
    const images = await bitmaps
    const canvas = document.createElement('canvas')
    canvas.width = images[0]?.width ?? 640
    canvas.height = images[0]?.height ?? 480
    const context = canvas.getContext('2d')
    if (!context) throw new DOMException('Pas de canvas', 'NotReadableError')
    const draw = () => {
      const index =
        startedAt === null
          ? 0
          : Math.min(images.length - 1, Math.floor(((performance.now() - startedAt) * fps) / 1000))
      const image = images[index]
      if (image) {
        context.drawImage(image, 0, 0)
      } else {
        context.fillStyle = '#808080'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
    }
    draw()
    // Redessinée sans cesse : le flux d'un canvas n'envoie une image que quand il change.
    const timer = setInterval(draw, 1000 / drawFps)
    const stream = canvas.captureStream(drawFps)
    const own = stream.getTracks()
    for (const track of own) {
      const stop = track.stop.bind(track)
      track.stop = () => {
        stoppedTracks.add(track)
        stop()
        if (own.every((other) => stoppedTracks.has(other))) clearInterval(timer)
      }
      tracks.push(track)
    }
    return stream
  }

  if ('mediaDevices' in navigator) {
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
      configurable: true,
      writable: true,
      value: getUserMedia,
    })
  } else {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  }
  const control: PersonCameraControl = {
    play: () => {
      startedAt ??= performance.now()
    },
    stopped: () => tracks.length > 0 && tracks.every((track) => stoppedTracks.has(track)),
  }
  Object.defineProperty(window, '__personCamera', { configurable: true, value: control })
}

/**
 * La caméra de la page filme le clip (sa première image reste affichée jusqu'à playPersonCamera, le temps
 * de se mettre en place), ou une image grise sans clip. `deny` : accès refusé.
 */
export async function usePersonCamera(
  page: Page,
  { clip, fps = 10, deny = false }: PersonCameraOptions = {},
): Promise<void> {
  const frames = clip ? clipFrames(clip).map((file) => clipFrameUrl(clip, file)) : []
  if (clip) await serveClipFrames(page)
  const drawFps = Number(process.env.DIAG_DRAW_FPS ?? 30)
  await page.addInitScript(installPersonCamera, { frames, fps, drawFps, deny })
}

/** Lance le clip, à sa cadence ; sa dernière image reste ensuite affichée. */
export async function playPersonCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    const found = (window as { __personCamera?: PersonCameraControl }).__personCamera
    if (!found) throw new Error('usePersonCamera n’a pas été appelé')
    found.play()
  })
}

/** Une caméra a été ouverte, et toutes ses pistes sont arrêtées. */
export async function personCameraStopped(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const found = (window as { __personCamera?: PersonCameraControl }).__personCamera
    if (!found) throw new Error('usePersonCamera n’a pas été appelé')
    return found.stopped()
  })
}

/**
 * Les requêtes web parties ailleurs que vers l'appli (localhost), de toutes les pages du test : le compteur
 * caméra n'en fait aucune.
 */
export function watchOutside(page: Page): string[] {
  const outside: string[] = []
  page.context().on('request', (request) => {
    const url = new URL(request.url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== 'localhost') {
      outside.push(request.url())
    }
  })
  return outside
}

/** L'appli rejouera ce fichier de points (src/test/reps/<nom>.json) à la place de MediaPipe. */
export async function useReplayedPose(page: Page, fixtureName: string): Promise<void> {
  const fixture: unknown = JSON.parse(readFileSync(join(REPS_DIR, `${fixtureName}.json`), 'utf8'))
  await page.addInitScript((data) => {
    ;(globalThis as { __calitrackPoseReplay?: unknown }).__calitrackPoseReplay = data
  }, fixture)
}
