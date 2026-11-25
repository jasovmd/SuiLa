import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.suila.app',
  appName: '水啦 SuiLa',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#123d72',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_suila',
      iconColor: '#123D72',
    },
  },
}

export default config
