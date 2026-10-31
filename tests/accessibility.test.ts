// Larger text, dark mode and team symbols (ui/textSize.ts, ui/access.ts,
// ui/device.ts, render/arenas.ts shownArena): the parts Apple's
// accessibility labels ask for, checked without a browser.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARENAS, shownArena } from '../src/render/arenas';
import { VIEW } from '../src/render/palette';

/** A fake page: screen size, device preferences and storage. */
function page(opts: { w: number; h: number; coarse?: boolean; dark?: boolean; contrast?: boolean; store?: Record<string, string> }) {
  const store = new Map(Object.entries(opts.store ?? {}));
  const attrs = new Set<string>();
  const classes = new Set<string>();
  const props = new Map<string, string>();
  const root = {
    style: { setProperty: (k: string, v: string) => props.set(k, v), colorScheme: '' },
    toggleAttribute: (a: string, on: boolean) => (on ? attrs.add(a) : attrs.delete(a)),
    hasAttribute: (a: string) => attrs.has(a),
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
  };
  const media = (q: string) => {
    // Just enough of the queries the game asks.
    if (q.includes('prefers-color-scheme: dark')) return !!opts.dark;
    if (q.includes('prefers-contrast: more')) return !!opts.contrast;
    if (q.includes('prefers-reduced-motion')) return false;
    if (q.startsWith('(max-height: 500px)')) return opts.h <= 500 || (!!opts.coarse && opts.w > opts.h && opts.h <= 900);
    return false;
  };
  vi.stubGlobal('innerWidth', opts.w);
  vi.stubGlobal('innerHeight', opts.h);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: media(q), addEventListener() {} }));
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  vi.stubGlobal('document', { documentElement: root, addEventListener() {}, hidden: false });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
  vi.stubGlobal('addEventListener', () => {});
  return { attrs, classes, props, store };
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  VIEW.dark = false;
  VIEW.symbols = true;
  VIEW.colourBlind = false;
  VIEW.highContrast = false;
});

describe('larger text', () => {
  it('goes up to 200%', async () => {
    page({ w: 1920, h: 1080 });
    const ts = await import('../src/ui/textSize');
    expect(ts.TEXT_SIZES.map(([id]) => id)).toContain('2');
    ts.setTextSize('2');
    expect(ts.menuScale()).toBe(2);
    expect(ts.uiScale()).toBe(2);
  });

  it('on a phone: menus at the full size and scrolling, the match HUD only as big as the screen has room for', async () => {
    const p = page({ w: 915, h: 412, coarse: true });
    const ts = await import('../src/ui/textSize');
    ts.setTextSize('2');
    expect(ts.menuScale()).toBe(2);
    expect(ts.uiScale()).toBeCloseTo(412 / 300, 2);
    expect(p.props.get('--menu-scale')).toBe('2');
    expect(Number(p.props.get('--ui-scale')) * Number(p.props.get('--menu-boost'))).toBeCloseTo(2, 1);
    expect(p.attrs.has('data-phone-menu')).toBe(true);
    expect(p.attrs.has('data-big-text')).toBe(true);
    // At the normal size the phone menu fits the screen, as before.
    ts.setTextSize('1');
    expect(p.attrs.has('data-big-text')).toBe(false);
    expect(p.attrs.has('data-phone-menu')).toBe(true);
  });

  it('on a computer: the full menu until the text is too big for its columns, then the phone menu', async () => {
    const p = page({ w: 1280, h: 800 });
    const ts = await import('../src/ui/textSize');
    ts.setTextSize('1');
    expect(p.attrs.has('data-phone-menu')).toBe(false);
    ts.setTextSize('1.15');
    expect(p.attrs.has('data-phone-menu')).toBe(false);
    ts.setTextSize('2');
    expect(p.attrs.has('data-phone-menu')).toBe(true);
    expect(p.attrs.has('data-big-text')).toBe(false); // 640×400 after scaling: the phone menu fits
    expect(ts.phoneMenu()).toBe(true);
  });

  it('Auto is 100% in a browser (the browser zooms by itself)', async () => {
    page({ w: 1280, h: 800 });
    const ts = await import('../src/ui/textSize');
    expect(ts.textSize()).toBe('auto');
    expect(ts.menuScale()).toBe(1);
  });
});

describe('dark mode', () => {
  it('Auto follows the device, and On or Off overrides it', async () => {
    const p = page({ w: 1280, h: 800, dark: true });
    const access = await import('../src/ui/access');
    const { VIEW: view } = await import('../src/render/palette'); // the copy access.ts sees
    access.applyAccess();
    expect(access.accessSettings().dark).toBe('auto');
    expect(p.classes.has('dark')).toBe(true);
    expect(view.dark).toBe(true);
    access.saveAccessSettings({ ...access.accessSettings(), dark: 'off' });
    expect(p.classes.has('dark')).toBe(false);
    expect(JSON.parse(p.store.get('tardigeddon.access')!)).toEqual({ dark: 'off' });
  });

  it('dims every world toward night, and leaves it alone otherwise', () => {
    const lum = (c: number) => (((c >> 16) & 255) * 0.2126 + ((c >> 8) & 255) * 0.7152 + (c & 255) * 0.0722) / 255;
    const css = (c: string) => parseInt(c.slice(1), 16);
    for (const a of ARENAS) {
      expect(shownArena(a)).toBe(a);
      VIEW.dark = true;
      const d = shownArena(a);
      VIEW.dark = false;
      expect(lum(css(d.skyTop))).toBeLessThan(0.4);
      expect(lum(css(d.skyBottom))).toBeLessThan(0.45);
      expect(lum(d.hillFar)).toBeLessThan(0.45);
      expect(d.grass).toHaveLength(3);
      expect(d.soil).toHaveLength(4);
    }
  });
});

describe('telling things apart without colour', () => {
  it('team symbols are on unless turned off; colour-blind colours and high contrast follow the device', async () => {
    const p = page({ w: 1280, h: 800, contrast: true });
    const access = await import('../src/ui/access');
    const { VIEW: view } = await import('../src/render/palette');
    access.applyAccess();
    const a = access.accessSettings();
    expect(a.symbols).toBe(true);
    expect(view.symbols).toBe(true);
    expect(a.colourBlind).toBe(false); // a browser can't see Differentiate Without Color; the apps can
    expect(a.highContrast).toBe(true);
    expect(p.classes.has('hc')).toBe(true);
    // Turned back to what the device asks for: follows the device again (nothing saved).
    access.saveAccessSettings({ ...a, highContrast: false });
    expect(JSON.parse(p.store.get('tardigeddon.access')!)).toEqual({ highContrast: false });
    access.saveAccessSettings({ ...access.accessSettings(), highContrast: true });
    expect(JSON.parse(p.store.get('tardigeddon.access')!)).toEqual({});
  });

  it('keeps the settings saved by older versions', async () => {
    page({ w: 1280, h: 800, store: { 'tardigeddon.access': JSON.stringify({ colourBlind: true, highContrast: false, calm: false, captions: true, hints: false }) } });
    const access = await import('../src/ui/access');
    expect(access.accessSettings()).toMatchObject({ symbols: true, colourBlind: true, captions: true, hints: false, dark: 'auto' });
  });
});
