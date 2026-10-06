// Title screen and match setup.

import { MASCOT_SVG } from './mascot';

export interface MatchSetup {
  mode: 'cpu' | 'hotseat';
  tardis: number;
  turnTime: number;
  roundTime: number;
  seed: number;
}

export function showMenu(root: HTMLElement, onStart: (s: MatchSetup) => void): void {
  root.innerHTML = `
    <div class="menu">
      <div class="menu-card">
        <div class="mascot">${MASCOT_SVG}</div>
        <h1 class="title">Tardi<span>Geddon</span></h1>
        <p class="tagline">Tiny. Indestructible. Armed.</p>
        <div class="menu-buttons">
          <button class="big-btn" data-mode="cpu">Play vs CPU</button>
          <button class="big-btn secondary" data-mode="hotseat">2 Players (same device)</button>
        </div>
        <div class="menu-options">
          <label>Tardis per team
            <select name="tardis"><option>2</option><option>3</option><option selected>4</option></select>
          </label>
          <label>Turn time
            <select name="turn"><option value="30">30s</option><option value="45" selected>45s</option><option value="60">60s</option></select>
          </label>
          <label>Sudden death after
            <select name="round"><option value="5">5 min</option><option value="10" selected>10 min</option><option value="15">15 min</option></select>
          </label>
        </div>
        <details class="controls-help">
          <summary>Controls</summary>
          <p><b>Keyboard:</b> ←/→ walk · ↑/↓ aim · Enter jump (twice = backflip) · hold Space to charge, release to fire ·
          1–5 fuse · Tab or right-click for weapons · click map to target · drag to look around · wheel to zoom</p>
          <p><b>Touch:</b> on-screen pads · tap map to target · drag to look · pinch to zoom</p>
        </details>
      </div>
    </div>`;
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    b.onclick = () => {
      const tardis = Number(root.querySelector<HTMLSelectElement>('select[name=tardis]')!.value);
      const turnTime = Number(root.querySelector<HTMLSelectElement>('select[name=turn]')!.value);
      const roundTime = Number(root.querySelector<HTMLSelectElement>('select[name=round]')!.value);
      onStart({ mode: b.dataset.mode as MatchSetup['mode'], tardis, turnTime, roundTime, seed: (Math.random() * 1e9) | 0 });
    };
  }
}
