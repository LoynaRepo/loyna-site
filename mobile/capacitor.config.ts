// Application Loyna (iPhone, puis Android) : l'espace client de loyna.fr compilé dans l'application (dossier dist/,
// fabriqué par vite.config.ts à partir de ../src/app/), jamais une simple fenêtre sur le site en ligne (règle 4.2 d'Apple).
import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  // Identifiant proposé, à confirmer par Ewan AVANT de créer l'app dans App Store Connect (il ne change plus ensuite)
  appId: 'fr.loyna',
  appName: 'Loyna',
  webDir: 'dist',
  // Aucune adresse distante : tout est dans l'application ; les liens vers loyna.fr s'ouvrent dans le navigateur intégré
  server: {
    iosScheme: 'capacitor',
    androidScheme: 'https',
  },
  ios: {
    // Le contenu va jusque sous la barre d'état : les marges viennent de env(safe-area-inset-*) (web/native.css)
    contentInset: 'never',
    backgroundColor: '#111316',
    // Pas de lien partagé par aperçu 3D Touch, pas de zoom
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#111316',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK', // texte clair sur fond foncé
      backgroundColor: '#111316',
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
