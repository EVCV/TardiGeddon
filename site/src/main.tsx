import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/luckiest-guy';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import { App } from './App';
import { noteStart } from './boot';

// The build writes each page's HTML (site/prerender.mjs), so the page is
// usually on screen already; React then takes over and draws it afresh.
const root = document.getElementById('root')!;
noteStart(root.hasChildNodes());
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
