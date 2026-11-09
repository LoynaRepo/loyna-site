// Réglages de l'application mobile Loyna.

/**
 * Notifications push : DÉSACTIVÉES tant qu'Ewan n'a pas créé la clé APNs (.p8) dans son compte Apple Developer et que la
 * fonction push-register (dépôt LOYNA, docs/app-mobile/) n'est pas en ligne. Passer à true, reconstruire, renvoyer sur
 * TestFlight : le bloc « Notifications » apparaît alors dans « Mon compte ». Aucune bibliothèque Firebase : APNs en direct
 * (Firebase est exclu de la pile LOYNA, CLAUDE.md du dépôt LOYNA).
 */
export const PUSH_ENABLED = false;

/** Identifiant de l'application (même valeur que capacitor.config.ts et codemagic.yaml). */
export const APP_ID = 'fr.loyna';

/** Verrou Face ID : redemandé après ce délai passé en arrière-plan (millisecondes). */
export const LOCK_AFTER_MS = 2 * 60 * 1000;

/** Préfixe des clés du trousseau (session Supabase). */
export const KEYCHAIN_PREFIX = 'loyna_';
