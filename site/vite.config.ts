// The TardiGeddon website (home page, how to play, legal pages). A small
// React app, separate from the game itself; built into dist-site/.
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { APPS, APP_STORE_ID, appleAppSiteAssociation, assetLinks } from '../src/apps';

/** The app-link files at /.well-known/, from src/apps.ts (docs/APPS.md, "App links"). */
function appLinks(): Plugin {
  return {
    name: 'app-links',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '.well-known/apple-app-site-association', source: JSON.stringify(appleAppSiteAssociation()) });
      const android = assetLinks();
      if (android) this.emitFile({ type: 'asset', fileName: '.well-known/assetlinks.json', source: JSON.stringify(android) });
    },
    // Safari on iPhone and iPad: its own "Open / Get" banner for the app, once it's on the App Store.
    transformIndexHtml(html) {
      return APPS.ios.live ? html.replace('</head>', `  <meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}" />\n  </head>`) : html;
    },
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [react(), appLinks()],
  build: { outDir: '../dist-site', emptyOutDir: true },
  server: { port: 5174 },
});
