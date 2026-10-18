import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gloopguardians.game',
  appName: 'Star Bandits',
  webDir: 'dist',
  backgroundColor: '#2b1a4b',
  ios: {
    contentInset: 'never',
    backgroundColor: '#2b1a4b',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#2b1a4b',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#2b1a4b',
      showSpinner: false,
    },
  },
};

export default config;
