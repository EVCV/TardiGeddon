// The phone apps on the website: a button for each store, "Coming soon" until
// the app is live there (src/apps.ts, one switch per store), and on a phone
// or tablet, the button for that device's store beside Play now.

import { useEffect, useState } from 'react';
import { APPS, mobileOs, type AppOs } from '../../../src/apps';

const STORE: Record<AppOs, { name: string; device: string; get: string }> = {
  ios: { name: 'App Store', device: 'iPhone & iPad', get: 'Download on the' },
  android: { name: 'Google Play', device: 'Android', get: 'Get it on' },
};

/** The visitor's phone or tablet (iOS or Android), once the page is running; null on computers and while prerendering. */
export function useMobileOs(): AppOs | null {
  const [os, setOs] = useState<AppOs | null>(null);
  useEffect(() => setOs(mobileOs()), []);
  return os;
}

/** One store's button: a link once the app is live, a "Coming soon" badge before. */
export function StoreButton({ os, big = false }: { os: AppOs; big?: boolean }) {
  const s = STORE[os];
  const cls = `store-btn store-${os}${big ? ' store-big' : ''}`;
  if (APPS[os].live) {
    return (
      <a className={cls} href={APPS[os].url} rel="noopener">
        <span className="store-small">{s.get}</span>
        <span className="store-name">{s.name}</span>
      </a>
    );
  }
  return (
    <span className={`${cls} store-soon`} role="note" aria-label={`${s.device}: coming soon to the ${s.name}`}>
      <span className="store-small">Coming soon · {s.device}</span>
      <span className="store-name">{s.name}</span>
    </span>
  );
}

/** Both stores (the iPhone's first on an iPhone, Android's first on Android). */
export function StoreButtons() {
  const os = useMobileOs();
  const order: AppOs[] = os === 'android' ? ['android', 'ios'] : ['ios', 'android'];
  return (
    <div className="store-buttons">
      {order.map((o) => (
        <StoreButton key={o} os={o} />
      ))}
    </div>
  );
}

/** On a phone or tablet: its store's button, for the hero beside Play now. Nothing on computers. */
export function DeviceStoreButton() {
  const os = useMobileOs();
  return os ? <StoreButton os={os} big /> : null;
}

/** One line saying where the apps are, kept true by the live switches. */
export function appsLine(): string {
  const { ios, android } = APPS;
  if (ios.live && android.live) return 'Also an app for iPhone, iPad and Android.';
  if (ios.live) return 'Also an app for iPhone and iPad; Android app coming soon.';
  if (android.live) return 'Also an app for Android; iPhone and iPad app coming soon.';
  return 'Apps for iPhone, iPad and Android coming soon.';
}
