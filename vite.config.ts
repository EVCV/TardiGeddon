import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any path (GitHub Pages, Capacitor).
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
