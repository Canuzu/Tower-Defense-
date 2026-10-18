import { Capacitor } from '@capacitor/core';

/**
 * On iOS/Android, WebView localStorage can be evicted by the OS under storage pressure.
 * We mirror every game key into native Preferences and restore them at boot, so progress
 * survives. On the web this is a no-op.
 */
const PREFIX = 'gloop-guardians/';

export async function restoreFromNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { keys } = await Preferences.keys();
    for (const k of keys) {
      if (!k.startsWith(PREFIX)) continue;
      if (localStorage.getItem(k) !== null) continue;
      const { value } = await Preferences.get({ key: k });
      if (value !== null) localStorage.setItem(k, value);
    }
  } catch {
    /* native storage unavailable: localStorage still works */
  }
}

export function mirrorToNative(key: string, value: string | null) {
  if (!Capacitor.isNativePlatform() || !key.startsWith(PREFIX)) return;
  import('@capacitor/preferences')
    .then(({ Preferences }) => (value === null ? Preferences.remove({ key }) : Preferences.set({ key, value })))
    .catch(() => {});
}
