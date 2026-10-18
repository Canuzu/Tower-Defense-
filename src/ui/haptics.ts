import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

let enabled = true;
export function setHaptics(on: boolean) {
  enabled = on;
}

let last = 0;
/** Light/medium/heavy taps. Native haptics inside the app, vibration API on the web. */
export function haptic(kind: 'light' | 'medium' | 'heavy') {
  if (!enabled) return;
  const now = performance.now();
  if (now - last < 60) return;
  last = now;
  if (Capacitor.isNativePlatform()) {
    const style = kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy;
    Haptics.impact({ style }).catch(() => {});
    return;
  }
  if ('vibrate' in navigator && matchMedia('(pointer: coarse)').matches) {
    try {
      navigator.vibrate(kind === 'light' ? 8 : kind === 'medium' ? 16 : 30);
    } catch {
      /* ignore */
    }
  }
}
