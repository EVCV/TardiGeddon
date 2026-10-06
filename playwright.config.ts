import { defineConfig, devices } from '@playwright/test';

// Software WebGL so the game renders on headless CI machines.
const launchOptions = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  // Optional: point at a preinstalled Chromium (e.g. in sandboxes).
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'phone', use: { ...devices['Pixel 7 landscape'], launchOptions } },
  ],
});
