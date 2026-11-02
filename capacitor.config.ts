import type { CapacitorConfig } from '@capacitor/cli';

// Android wrapper around the built site (ADR-003). Build with `npm run apk:debug`.
const config: CapacitorConfig = {
  appId: 'io.github.saturnskies.swapsmith',
  appName: 'Swapsmith',
  webDir: 'dist',
  backgroundColor: '#000000',
};

export default config;
