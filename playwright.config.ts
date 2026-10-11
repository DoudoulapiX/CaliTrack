import { defineConfig, devices } from '@playwright/test'
import { FAKE_CAMERA_FILE } from './e2e/fake-camera'

const port = 4173
const base = process.env.VITE_BASE ?? '/CaliTrack/'
const isCI = Boolean(process.env.CI)

// Les tests visent un iPhone : Chromium en local, Chromium et WebKit (le moteur de Safari) en CI.
const iphone = devices['iPhone 13']

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : 4,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${port}${base}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // La fausse caméra de Chromium filme un code-barres (image créée avant les tests).
  globalSetup: './e2e/fake-camera.ts',
  projects: [
    {
      name: 'iphone-chromium',
      use: {
        ...iphone,
        browserName: 'chromium',
        permissions: ['camera'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${FAKE_CAMERA_FILE}`,
          ],
        },
      },
    },
    // WebKit n'a pas de fausse caméra dans Playwright : le scan par la caméra n'y est pas testé, le
    // code tapé à la main l'est (nutrition.spec.ts).
    ...(isCI
      ? [
          {
            name: 'iphone-webkit',
            use: { ...iphone, browserName: 'webkit' as const },
            testIgnore: 'camera.spec.ts',
          },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run preview',
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
