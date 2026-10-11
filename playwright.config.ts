import { defineConfig, devices } from '@playwright/test'

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
  projects: [
    { name: 'iphone-chromium', use: { ...iphone, browserName: 'chromium' } },
    ...(isCI ? [{ name: 'iphone-webkit', use: { ...iphone, browserName: 'webkit' as const } }] : []),
  ],
  webServer: {
    command: 'npm run preview',
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
