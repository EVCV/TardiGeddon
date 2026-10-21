// Sound captions (Settings → Accessibility): short words on screen for what
// the game's sounds are saying, so nothing is missed with the sound off.
// Shown bottom-left in a match, read out politely by screen readers.

import type { SimEvent } from '../sim/types';
import { WEAPONS } from '../sim/weapons';
import { accessSettings } from './access';

/** The caption for an event's sound, if it has one worth showing. */
export function captionFor(e: SimEvent): string | null {
  switch (e.t) {
    case 'explosion': return e.r >= 30 ? '💥 Big boom' : '💥 Boom';
    case 'fire': return `🚀 ${WEAPONS[e.weapon]?.name ?? 'Shot'} fired`;
    case 'shot': return '🔫 Bang';
    case 'splash': return '🌊 Splash';
    case 'teleport': return '✨ Zap';
    case 'mineArmed': return '⚠️ Mine ticking';
    case 'dud': return '🙄 Dud mine';
    case 'crateDrop': return '📦 Crate on its way down';
    case 'collect': return '🎁 Crate picked up';
    case 'heal': return '💚 Health back';
    case 'drown': return '🫧 Glug glug';
    case 'suddenDeath': return '⏰ Sudden death!';
    case 'waterRise': return '🌊 The water rises';
    case 'gas': return '🤢 Poison gas';
    case 'punch': return '👊 Pow';
    case 'rope': return '🕸️ Rope caught';
    case 'ropeMiss': return '🕸️ Rope missed';
    case 'tornado': return '🌪️ Tornado!';
    case 'turnStart': return '🔔 Next turn';
    case 'gameover': return '🎺 Match over';
    default: return null;
  }
}

export class Captions {
  readonly root = document.createElement('div');
  private lines: { el: HTMLElement; until: number }[] = [];

  constructor() {
    this.root.className = 'captions';
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-label', 'Sound captions');
  }

  /** Show a caption (if captions are on); the same words twice in a row just stay a little longer. */
  say(text: string | null): void {
    if (!text || !accessSettings().captions) return;
    const now = performance.now();
    const last = this.lines[this.lines.length - 1];
    if (last && last.el.textContent === text) {
      last.until = now + 2500;
      return;
    }
    const el = document.createElement('div');
    el.className = 'caption';
    el.textContent = text;
    this.root.append(el);
    this.lines.push({ el, until: now + 2500 });
    // At most three at a time.
    while (this.lines.length > 3) this.lines.shift()!.el.remove();
  }

  /** Clear old captions (call each frame). */
  update(): void {
    const now = performance.now();
    while (this.lines.length && this.lines[0].until < now) this.lines.shift()!.el.remove();
  }
}
