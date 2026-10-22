import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { offline } from './scripts/offline';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative base so the build works from any path (GitHub Pages, Capacitor).
  base: './',
  // Shown in the menu's footer.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Offline play: a service worker that keeps the built game on the device.
  plugins: [offline()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
