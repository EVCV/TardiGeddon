// The TardiGeddon website (home page, how to play, legal pages). A small
// React app, separate from the game itself; built into dist-site/.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: { outDir: '../dist-site', emptyOutDir: true },
  server: { port: 5174 },
});
