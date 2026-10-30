import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.polka.reader',
  appName: 'Полка',
  webDir: 'dist',
  android: {
    // фон до загрузки страницы — как у полки / background before the page loads — shelf color
    backgroundColor: '#e3e5dc',
  },
};

export default config;
