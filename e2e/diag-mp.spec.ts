import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { playPersonCamera, usePersonCamera } from './person-camera'

// Diagnostic jetable (branche diag-counter-webkit) : coût de l'image de la caméra des tests sous WebKit.
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

test('diag sonde video', async ({ page }) => {
  test.skip(!process.env.DIAG_SONDE, 'diagnostic seulement')
  test.setTimeout(150_000)
  await usePersonCamera(page, { clip: 'sports2d-walk', fps: 10 })
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
  const setup = await page.evaluate(async (probe) => {
    ;(globalThis as { Module?: unknown }).Module = { print: () => undefined, printErr: () => undefined }
    const { PoseLandmarker } = (await import(
      `${probe}vision_bundle.mjs`
    )) as typeof import('@mediapipe/tasks-vision')
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
      },
    )
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.style.width = '390px'
    document.body.append(video)
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    await video.play()
    while (video.readyState < 2 || video.videoWidth === 0) await new Promise((r) => setTimeout(r, 20))
    ;(window as unknown as { __diag: unknown }).__diag = { landmarker, video }
    return `${String(video.videoWidth)}x${String(video.videoHeight)}`
  }, PROBE)
  await playPersonCamera(page)
  const result = await page.evaluate(async () => {
    const { landmarker, video } = (
      window as unknown as {
        __diag: { landmarker: import('@mediapipe/tasks-vision').PoseLandmarker; video: HTMLVideoElement }
      }
    ).__diag
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d')
    const med = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b)
      return `${s[Math.floor(s.length / 2)]?.toFixed(0) ?? '?'} (max ${s.at(-1)?.toFixed(0) ?? '?'})`
    }
    // Cadence de la vidéo seule.
    let frames = 0
    const t0 = performance.now()
    await new Promise<void>((resolve) => {
      const tick = () => {
        frames++
        if (performance.now() - t0 < 2000) video.requestVideoFrameCallback(tick)
        else resolve()
      }
      video.requestVideoFrameCallback(tick)
    })
    let rafs = 0
    const t1 = performance.now()
    await new Promise<void>((resolve) => {
      const tick = () => {
        rafs++
        if (performance.now() - t1 < 1000) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    const draw: number[] = []
    const onCanvas: number[] = []
    const onVideo: number[] = []
    let t = 1
    let found = 0
    for (let i = 0; i < 30; i++) {
      let s = performance.now()
      context.drawImage(video, 0, 0)
      draw.push(performance.now() - s)
      s = performance.now()
      landmarker.detectForVideo(canvas, (t += 50))
      onCanvas.push(performance.now() - s)
      s = performance.now()
      if (landmarker.detectForVideo(video, (t += 50)).landmarks.length > 0) found++
      onVideo.push(performance.now() - s)
      await new Promise((r) => setTimeout(r, 30))
    }
    return `rVFC ${String(frames / 2)}/s raf ${String(rafs)}/s ; drawImage(video) ${med(draw)} ; detect(canvas) ${med(onCanvas)} ; detect(video) ${med(onVideo)} found ${String(found)}/30`
  })
  expect(`${setup} draw ${process.env.DIAG_DRAW_FPS ?? '30'} ; ${result}`).toBe('DIAG')
})
