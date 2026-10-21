import { describe, expect, it } from 'vitest';
import { serviceWorker } from '../scripts/offline';

describe('offline play (service worker)', () => {
  it('keeps every built file under a cache named for the build, and never touches other sites', () => {
    const sw = serviceWorker(['assets/index-abc.js', 'icon.svg'], 'v123');
    expect(sw).toContain("const CACHE = 'tardigeddon-v123';");
    expect(sw).toContain('["./","assets/index-abc.js","icon.svg"]');
    expect(sw).toContain('url.origin !== location.origin');
    expect(sw).toContain("req.method !== 'GET'");
    // Old versions are cleared out when a new one takes over.
    expect(sw).toContain("k.startsWith('tardigeddon-') && k !== CACHE");
    // It must be valid JavaScript.
    expect(() => new Function(sw)).not.toThrow();
  });
});
