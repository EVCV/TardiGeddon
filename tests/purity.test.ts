import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The simulation must be deterministic across devices: no transcendental
// Math functions (not guaranteed bit-identical), no randomness or clocks,
// and no DOM/rendering imports.
const FORBIDDEN = [
  /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|cbrt|hypot|random|sinh|cosh|tanh)\b/,
  /[\w)\]]\s*\*\*\s*[\w(]/, // exponent operator
  /Date\.now|performance\.now|new Date/,
  /from ['"]pixi/,
  /\b(window|document)\./,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('sim purity', () => {
  for (const file of files('src/sim')) {
    it(file, () => {
      // Strip comments so documentation can mention forbidden calls.
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const re of FORBIDDEN) expect(src, `${file} matches ${re}`).not.toMatch(re);
    });
  }
});
