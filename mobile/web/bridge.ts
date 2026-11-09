// Pont entre l'espace client (src/app/native.ts) et les extensions Capacitor. Installé par main.tsx avant l'affichage,
// seulement dans l'application iPhone/Android : dans un navigateur (npm run dev), l'espace client se comporte comme le site.
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {Directory, Filesystem} from '@capacitor/filesystem';
import {Haptics, ImpactStyle, NotificationType} from '@capacitor/haptics';
import {PushNotifications} from '@capacitor/push-notifications';
import {Share} from '@capacitor/share';
import {StatusBar, Style} from '@capacitor/status-bar';
import {BarcodeFormat, BarcodeScanner} from '@capacitor-mlkit/barcode-scanning';
import {BiometricAuth, BiometryType} from '@aparajita/capacitor-biometric-auth';
import {SecureStorage} from '@aparajita/capacitor-secure-storage';
import type {CameraPermission, NativeBridge, ScanTone} from '../../src/app/native';
import {api, merchant} from '../../src/app/state';
import {APP_ID, KEYCHAIN_PREFIX, PUSH_ENABLED} from './config';

const INSTALLED = 'loyna-app-installee';

const camera = (s: string): CameraPermission => (s === 'granted' || s === 'limited' ? 'granted' : s === 'denied' ? 'denied' : 'prompt');

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function biometryLabel(t: BiometryType): string {
  switch (t) {
    case BiometryType.faceId:
      return 'Face ID';
    case BiometryType.touchId:
      return 'Touch ID';
    case BiometryType.faceAuthentication:
      return 'la reconnaissance faciale';
    case BiometryType.irisAuthentication:
      return 'l’iris';
    default:
      return 'l’empreinte';
  }
}

/** Jeton APNs de ce téléphone, transmis au serveur (fonction push-register du dépôt LOYNA, à mettre en ligne). */
async function registerPush(): Promise<'granted' | 'denied' | 'off'> {
  if (!PUSH_ENABLED) return 'off';
  let p = await PushNotifications.checkPermissions();
  if (p.receive !== 'granted') p = await PushNotifications.requestPermissions();
  if (p.receive !== 'granted') return 'denied';
  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener('registration', (t) => {
    api.edge('push-register', {token: t.value, platform: Capacitor.getPlatform(), app_id: APP_ID, merchant_id: merchant.value?.merchant_id ?? null}).catch(() => {});
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    // Notification touchée : écran indiqué par le serveur (« clients », « campagnes »…)
    const route = (a.notification.data as {route?: unknown} | undefined)?.route;
    if (typeof route === 'string' && /^[a-z0-9/-]+$/.test(route)) location.hash = `#/${route}`;
  });
  await PushNotifications.register();
  return 'granted';
}

export async function installBridge(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const platform = Capacitor.getPlatform() as 'ios' | 'android';

  await SecureStorage.setKeyPrefix(KEYCHAIN_PREFIX);
  // Le trousseau de l'iPhone survit à la désinstallation : une application réinstallée repart sans session
  try {
    if (!localStorage.getItem(INSTALLED)) {
      await SecureStorage.clear();
      localStorage.setItem(INSTALLED, '1');
    }
  } catch {
    /* rien à nettoyer */
  }
  StatusBar.setStyle({style: Style.Dark}).catch(() => {});
  const info = await App.getInfo().catch(() => ({version: '', build: ''}));

  const bridge: NativeBridge = {
    platform,
    version: info.version,
    build: info.build,
    authStorage: {
      getItem: (k) => SecureStorage.getItem(k),
      setItem: (k, v) => SecureStorage.setItem(k, v),
      removeItem: (k) => SecureStorage.removeItem(k),
    },
    scanner: {
      supported: async () => (await BarcodeScanner.isSupported()).supported,
      permission: async () => camera((await BarcodeScanner.checkPermissions()).camera),
      request: async () => camera((await BarcodeScanner.requestPermissions()).camera),
      async start(onCode) {
        await BarcodeScanner.removeAllListeners();
        await BarcodeScanner.addListener('barcodesScanned', (e) => {
          const v = e.barcodes?.[0]?.rawValue;
          if (v) onCode(v);
        });
        await BarcodeScanner.startScan({formats: [BarcodeFormat.QrCode]});
        const torch = await BarcodeScanner.isTorchAvailable().then(
          (r) => r.available,
          () => false,
        );
        return {torch};
      },
      async stop() {
        await BarcodeScanner.removeAllListeners().catch(() => {});
        await BarcodeScanner.stopScan();
      },
      torch: (on) => (on ? BarcodeScanner.enableTorch() : BarcodeScanner.disableTorch()),
      openSettings: () => BarcodeScanner.openSettings(),
    },
    haptic(tone: ScanTone) {
      const go = (p: Promise<void>) => p.catch(() => {});
      if (tone === 'success') go(Haptics.notification({type: NotificationType.Success}));
      else if (tone === 'reward') go(Haptics.notification({type: NotificationType.Success}).then(() => Haptics.impact({style: ImpactStyle.Heavy})));
      else if (tone === 'warning') go(Haptics.notification({type: NotificationType.Warning}));
      else if (tone === 'error') go(Haptics.notification({type: NotificationType.Error}));
      else go(Haptics.impact({style: ImpactStyle.Light}));
    },
    biometry: {
      async status() {
        const r = await BiometricAuth.checkBiometry().catch(() => null);
        return {available: !!r?.isAvailable, label: biometryLabel(r?.biometryType ?? BiometryType.none)};
      },
      async verify(reason) {
        try {
          await BiometricAuth.authenticate({
            reason,
            cancelTitle: 'Annuler',
            allowDeviceCredential: true, // code du téléphone si Face ID échoue
            iosFallbackTitle: 'Saisir le code',
            androidTitle: 'Loyna',
            androidSubtitle: reason,
          });
          return true;
        } catch {
          return false;
        }
      },
    },
    async shareFile(name, blob) {
      const safe = name.replace(/[^\w.-]+/g, '-');
      const {uri} = await Filesystem.writeFile({path: safe, data: await blobToBase64(blob), directory: Directory.Cache});
      await Share.share({title: name, files: [uri]});
    },
    openUrl: (url) => Browser.open({url, presentationStyle: 'fullscreen'}),
    push: {
      enabled: PUSH_ENABLED,
      async status() {
        if (!PUSH_ENABLED) return 'off';
        const p = await PushNotifications.checkPermissions();
        return p.receive === 'granted' ? 'granted' : p.receive === 'denied' ? 'denied' : 'prompt';
      },
      enable: registerPush,
    },
  };
  (window as unknown as {__loynaNative: NativeBridge}).__loynaNative = bridge;
  document.documentElement.classList.add('native-app', `native-${platform}`);
  return true;
}
