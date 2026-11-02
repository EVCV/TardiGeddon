import { describe, expect, it } from 'vitest';
import { APPS, androidOpenLink, appToSuggest, appleAppSiteAssociation, assetLinks, mobileOs } from '../src/apps';
import { gameLinkParams, isFriendCode } from '../src/account/links';

describe('links that open the app', () => {
  it('reads the game links people share, and nothing else', () => {
    expect(gameLinkParams('https://tardigeddon.com/play/?room=ABCD')?.get('room')).toBe('ABCD');
    expect(gameLinkParams('https://tardigeddon.com/play?friend=K7P2Q9XZ')?.get('friend')).toBe('K7P2Q9XZ');
    expect(gameLinkParams('https://www.tardigeddon.com/play/index.html?invite=sam-01')?.get('invite')).toBe('sam-01');
    expect(gameLinkParams('https://tardigeddon.com/play/?verify=tok')?.get('verify')).toBe('tok');
    // Only the settings the game acts on come through.
    expect([...gameLinkParams('https://tardigeddon.com/play/?room=AB&autostart=cpu&evil=1')!.keys()]).toEqual(['room']);
    expect(gameLinkParams('https://tardigeddon.com/play/')?.toString()).toBe('');
    // Other sites, other pages, other schemes, the Android sign-in return: not game links.
    for (const url of ['https://evil.example/play/?room=AB', 'https://tardigeddon.com.evil.example/play/?room=AB', 'http://tardigeddon.com/play/?room=AB', 'https://tardigeddon.com/news', 'com.tardigeddon.app://signin?token=x', 'not a url', undefined]) {
      expect(gameLinkParams(url), String(url)).toBeNull();
    }
  });

  it('checks friend codes', () => {
    expect(isFriendCode('K7P2Q9XZ')).toBe(true);
    expect(isFriendCode('<script>')).toBe(false);
    expect(isFriendCode('')).toBe(false);
    expect(isFriendCode(null)).toBe(false);
  });

  it("tells Apple which links open the iOS app, but not the return from paying on the website", () => {
    const aasa = appleAppSiteAssociation() as { applinks: { details: { appIDs: string[]; components: { '/': string; '?'?: object; exclude?: boolean }[] }[] } };
    const d = aasa.applinks.details[0];
    expect(d.appIDs).toEqual(['R3TQ7LC3G6.com.tardigeddon.app']);
    // Apple uses the first component that matches: the exclusions must come first.
    const firstInclude = d.components.findIndex((c) => !c.exclude);
    expect(d.components.slice(0, firstInclude).map((c) => Object.keys(c['?'] ?? {})[0])).toEqual(['shop', 'autostart']);
    expect(d.components.slice(firstInclude).map((c) => c['/'])).toContain('/play/');
  });

  it("tells Google which links open the Android app, for both signing keys", () => {
    const [entry] = assetLinks() as { relation: string[]; target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(entry.relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(entry.target.package_name).toBe('com.tardigeddon.app');
    expect(entry.target.sha256_cert_fingerprints).toHaveLength(2);
    for (const f of entry.target.sha256_cert_fingerprints) expect(f).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('opens the Android app at the same page, or falls back', () => {
    const link = androidOpenLink('https://tardigeddon.com/play/?room=ABCD', 'https://play.google.com/store/apps/details?id=com.tardigeddon.app');
    expect(link).toBe(
      'intent://tardigeddon.com/play/?room=ABCD#Intent;scheme=https;package=com.tardigeddon.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.tardigeddon.app;end',
    );
  });
});

describe('the app reminder in phone browsers', () => {
  const ua = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  };

  it('knows the phone or tablet', () => {
    expect(mobileOs({ userAgent: ua.iphone })).toBe('ios');
    expect(mobileOs({ userAgent: ua.ipad, maxTouchPoints: 5 })).toBe('ios'); // iPads say "Macintosh"
    expect(mobileOs({ userAgent: ua.ipad, maxTouchPoints: 0 })).toBeNull(); // a real Mac
    expect(mobileOs({ userAgent: ua.android })).toBe('android');
    expect(mobileOs({ userAgent: ua.windows })).toBeNull();
  });

  it('suggests the app only on its own phones, once it is out, once a visit, and never after "don\'t remind me"', () => {
    const live = { ios: { ...APPS.ios, live: true }, android: { ...APPS.android, live: true } };
    const base = { native: false, never: false, shownThisVisit: false, apps: live };
    expect(appToSuggest({ ...base, os: 'ios' })).toBe('ios');
    expect(appToSuggest({ ...base, os: 'android' })).toBe('android');
    expect(appToSuggest({ ...base, os: null })).toBeNull(); // a computer
    expect(appToSuggest({ ...base, os: 'ios', native: true })).toBeNull(); // in the app already
    expect(appToSuggest({ ...base, os: 'ios', never: true })).toBeNull();
    expect(appToSuggest({ ...base, os: 'ios', shownThisVisit: true })).toBeNull();
    expect(appToSuggest({ ...base, os: 'ios', apps: { ...live, ios: { ...live.ios, live: false } } })).toBeNull(); // not out yet
  });
});
