// The phone apps (Capacitor, docs/APPS.md): what differs from the web game.
// On the website none of this runs; Capacitor.isNativePlatform() is false there.

import { Capacitor, SystemBars } from '@capacitor/core';
import { App } from '@capacitor/app';

/** Running inside the Android or iOS app. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * The web game's address, for links meant for other people (room invites).
 * The app's own address only exists inside the phone.
 */
export function webGameUrl(): string {
  const env = import.meta.env.VITE_WEB_URL as string | undefined;
  return env && isNativeApp() ? env : `${location.origin}${location.pathname}`;
}

/** Android's back button or gesture. */
export interface NativeHooks {
  /** Go back one step. Return false when there's nowhere to go back to (the lobby): the app is sent to the background. */
  onBack: () => boolean;
  /** The app went to the background (true) or came back (false). */
  onPause: (paused: boolean) => void;
}

export function attachNative(hooks: NativeHooks): void {
  if (!isNativeApp()) return;
  // iOS: game sound mixes with the player's own music and follows the silent
  // switch (as AppDelegate.swift sets for the app; WebKit's own audio needs telling too).
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (Capacitor.getPlatform() === 'ios' && nav.audioSession) nav.audioSession.type = 'ambient';
  // iOS: the home bar fades away while playing (Android hides its bars in MainActivity).
  if (Capacitor.getPlatform() === 'ios') void SystemBars.hide().catch(() => {});
  void App.addListener('backButton', () => {
    // A dialog over the page closes first (they close on Escape, like on a computer).
    const overlay = document.querySelector('.editor-overlay');
    if (overlay) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (overlay.isConnected) overlay.remove();
      return;
    }
    if (!hooks.onBack()) void App.minimizeApp();
  });
  void App.addListener('pause', () => hooks.onPause(true));
  void App.addListener('resume', () => hooks.onPause(false));
}
