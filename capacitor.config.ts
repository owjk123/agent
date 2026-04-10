import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flashplayer.app',
  appName: 'FlashPlayer',
  webDir: 'dist',
  android: {
    backgroundColor: '#0d0d14',
    allowMixedContent: true,
    captureInput: true,
  },
};

export default config;
