import { test, type Page } from '@playwright/test'

/** Diagnostic jetable : l'état du compteur quand un test échoue, dans le journal de la CI. */
async function dump(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('dialog[open] video')
      const v = video
        ? {
            rs: video.readyState,
            paused: video.paused,
            t: Math.round(video.currentTime * 100) / 100,
            w: video.videoWidth,
            tracks: (video.srcObject as MediaStream | null)
              ?.getTracks()
              .map((track) => `${track.readyState}/${String(track.muted)}/${String(track.enabled)}`),
          }
        : null
      const dialog = document.querySelector('dialog[open]')
      return JSON.stringify({
        now: Math.round(performance.now()),
        vis: document.visibilityState,
        focus: document.hasFocus(),
        video: v,
        loop: (globalThis as { __diagLoop?: unknown }).__diagLoop ?? null,
        text: (dialog?.textContent ?? '').slice(0, 900),
      })
    })
    .catch((error: unknown) => `dump impossible : ${String(error)}`)
}

export function dumpOnFailure(): void {
  test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) console.log(`DIAGDUMP ${info.title} :: ${await dump(page)}`)
  })
}

/** Toutes les 2 s pendant le test : la boucle du compteur. */
export function sampleLoop(page: Page): () => string[] {
  const out: string[] = []
  const timer = setInterval(() => {
    void page
      .evaluate(() => JSON.stringify((globalThis as { __diagLoop?: unknown }).__diagLoop ?? null))
      .then((text) => out.push(text))
      .catch(() => undefined)
  }, 2000)
  return () => {
    clearInterval(timer)
    return out
  }
}
