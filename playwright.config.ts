import { defineConfig, devices } from '@playwright/test';

// Software WebGL so the game renders on headless CI machines.
const launchOptions = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  // Optional: point at a preinstalled Chromium (e.g. in sandboxes).
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
};

/** Tests that try many screen sizes: their own project, run last (see projects). */
const SCREENS = /(foldable|tablet)\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Online game server, for the online e2e test.
      command: 'npm run server',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions }, testIgnore: SCREENS },
    { name: 'phone', use: { ...devices['Pixel 7 landscape'], launchOptions }, testIgnore: SCREENS },
    // The screen-size tests make their own tablets and foldables and start several
    // matches each. Run alongside the online tests they starved those of CPU (two
    // browsers playing in real time), which then timed out on CI; so they run after.
    { name: 'screens', use: { ...devices['Desktop Chrome'], launchOptions }, testMatch: SCREENS, dependencies: ['desktop', 'phone'] },
  ],
});
