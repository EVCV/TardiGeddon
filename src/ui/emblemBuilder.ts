// The team emblem builder: pick a shape, a picture, two colours and a
// pattern from ready-made parts, or roll the dice. Free for everyone.

import { EMBLEM_COLORS, EMBLEM_ICONS, EMBLEM_PATTERNS, EMBLEM_SHAPES, emblemString, emblemSvg, parseEmblem, randomEmblem, type Emblem } from '../render/emblems';
import { hex } from '../render/palette';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PATTERN_NAMES: Record<(typeof EMBLEM_PATTERNS)[number], string> = {
  plain: 'Plain', stripes: 'Stripes', dots: 'Dots', split: 'Half and half', chevron: 'Chevron', rays: 'Rays', checks: 'Checks', ring: 'Ring',
};

/** Draw the builder into `box`; `onChange` gets the new emblem string. */
export function renderEmblemBuilder(box: HTMLElement, current: string, onChange: (e: string) => void): void {
  const e: Emblem = parseEmblem(current) ?? parseEmblem(randomEmblem())!;
  box.innerHTML = '';
  const set = (k: keyof Emblem, v: number) => onChange(emblemString({ ...e, [k]: v }));

  const top = el('div', 'emblem-top');
  const preview = el('div', 'emblem-preview');
  preview.innerHTML = emblemSvg(current, 'Your team emblem');
  const dice = el('button', 'hud-btn', '🎲 Surprise me');
  dice.onclick = () => onChange(randomEmblem());
  top.append(preview, dice);
  box.append(top);

  const row = (title: string, items: HTMLElement[]) => {
    const r = el('div', 'emblem-row');
    r.setAttribute('role', 'group');
    r.setAttribute('aria-label', title);
    r.append(el('span', 'emblem-label', title), ...items);
    box.append(r);
  };
  const choice = (on: boolean, label: string, inner: string | null, click: () => void, cls = '') => {
    const b = el('button', 'emblem-part' + cls + (on ? ' on' : ''));
    if (inner === null) b.textContent = label;
    else b.innerHTML = inner;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(on));
    b.onclick = click;
    return b;
  };
  row('Shape', EMBLEM_SHAPES.map((name, i) => choice(i === e.shape, name, emblemSvg(emblemString({ ...e, shape: i }), name), () => set('shape', i))));
  row('Picture', EMBLEM_ICONS.map((icon, i) => {
    const b = choice(i === e.icon, `Picture ${i + 1}`, null, () => set('icon', i), ' emblem-icon');
    b.textContent = icon;
    return b;
  }));
  const swatches = (k: 'bg' | 'fg') => EMBLEM_COLORS.map((c, i) => {
    const b = choice(i === e[k], `Colour ${hex(c)}`, '', () => set(k, i), ' swatch');
    b.style.background = hex(c);
    return b;
  });
  row('Colour', swatches('bg'));
  row('Pattern colour', swatches('fg'));
  row('Pattern', EMBLEM_PATTERNS.map((p, i) => choice(i === e.pattern, PATTERN_NAMES[p], emblemSvg(emblemString({ ...e, pattern: i }), PATTERN_NAMES[p]), () => set('pattern', i))));
}
