// Application mobile Loyna (Capacitor, dossier mobile/ du dépôt) : ce que l'espace client sait du téléphone.
// Le site ne contient aucun code Capacitor : l'application installe elle-même ce pont (mobile/web/bridge.ts) dans
// window.__loynaNative avant d'afficher l'espace client. Sur loyna.fr, native() vaut toujours null et rien ne change.

export type ScanTone = 'success' | 'reward' | 'warning' | 'error' | 'info';
export type CameraPermission = 'granted' | 'denied' | 'prompt';

export interface NativeBridge {
  platform: 'ios' | 'android';
  /** Version de l'application (CFBundleShortVersionString) et numéro de build. */
  version: string;
  build: string;
  /** Stockage de la session Supabase dans le trousseau (iPhone) ou le Keystore (Android). */
  authStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
  /** Scanner natif (ML Kit) : caméra affichée derrière la page, lecture en continu des QR codes. */
  scanner: {
    supported(): Promise<boolean>;
    permission(): Promise<CameraPermission>;
    request(): Promise<CameraPermission>;
    start(onCode: (value: string) => void): Promise<{torch: boolean}>;
    stop(): Promise<void>;
    torch(on: boolean): Promise<void>;
    openSettings(): Promise<void>;
  };
  /** Vibration au résultat d'un scan. */
  haptic(tone: ScanTone): void;
  /** Face ID / Touch ID / empreinte. */
  biometry: {
    status(): Promise<{available: boolean; label: string}>;
    verify(reason: string): Promise<boolean>;
  };
  /** Fichier fabriqué dans la page (export CSV, QR code SVG…) : feuille de partage (Enregistrer, AirDrop, Mail…). */
  shareFile(name: string, blob: Blob): Promise<void>;
  /** Ouvre une adresse dans le navigateur intégré (SFSafariViewController / Custom Tabs). */
  openUrl(url: string): Promise<void>;
  /** Notifications : préparées, désactivées tant que la clé APNs n'est pas en place (mobile/web/config.ts). */
  push: {
    enabled: boolean;
    status(): Promise<'granted' | 'denied' | 'prompt' | 'off'>;
    enable(): Promise<'granted' | 'denied' | 'off'>;
  };
}

export function native(): NativeBridge | null {
  return typeof window === 'undefined' ? null : ((window as any).__loynaNative ?? null);
}
export const isNativeApp = (): boolean => native() !== null;

/**
 * Aucun achat d'abonnement dans l'application (règle 3.1.1 d'Apple, paiements de Google Play) : ni bouton, ni lien vers le
 * panier, les offres ou le portail Stripe. La Boutique (objets physiques, règle 3.1.5) reste ouverte.
 */
export const noPurchaseUI = (): boolean => isNativeApp();

/** Phrase neutre affichée à la place des boutons de paiement dans l'application. */
export const MANAGED_OUTSIDE = 'Votre abonnement se gère depuis votre compte LOYNA.';

// --- Préférences de l'appareil (non secrètes : localStorage de l'application) -----------------------------------------
export const PREF_BIOMETRY = 'loyna-app-biometrie';
export const PREF_CAISSE = 'loyna-app-caisse';
export function appPref(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
export function setAppPref(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* préférence non mémorisée */
  }
}

/** Adresses que l'application iPhone/Android n'ouvre jamais : achat ou gestion d'abonnement, création de compte payant. */
const BLOCKED = [/^\/panier\b/, /^\/tarifs\b/, /^\/creer-ma-carte\b/, /^\/essai\b/,/^\/espace-client\/demo\b/];
const BLOCKED_HOSTS = ['billing.stripe.com', 'buy.stripe.com'];

/** Adresse absolue sur loyna.fr pour un lien relatif du site (« /cgv/ »), ou null si elle est interdite dans l'application. */
export function appLinkTarget(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href, 'https://loyna.fr');
  } catch {
    return null;
  }
  if (BLOCKED_HOSTS.includes(u.hostname)) return null;
  if ((u.hostname === 'loyna.fr' || u.hostname === 'www.loyna.fr') && BLOCKED.some((re) => re.test(u.pathname))) return null;
  return u.toString();
}
