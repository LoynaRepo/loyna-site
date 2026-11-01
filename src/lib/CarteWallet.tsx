// Aperçu d'une carte de fidélité telle qu'elle s'affiche dans Apple Wallet ou Google Wallet, dans un téléphone :
// section « Préparer une carte » du panel commercial et panier du commerçant (Ewan, 2026-10-30). Même disposition que
// les maquettes des prospects : logo et nom, tampons (dernier tampon = cadeau), récompense, QR code.
// Au-delà de 20 passages, une jauge remplace les tampons, comme sur la vraie carte.
import type {JSX} from 'preact';
import {contrast, initials, qrSvg} from '../app/util';
import './carte-wallet.css';

const TEXTE_CLAIR = '#fbf7ee';
const TEXTE_SOMBRE = '#16130e';
const QR_EXEMPLE = qrSvg('https://loyna.fr/', '#000', 0);
const BLANC = '#ffffff';
const NOIR = '#111111';
const simple = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Barbiers et coiffure : cachets aux initiales sur la vraie carte (isSalonActivity, dépôt LOYNA, _shared/wallet-design.ts). */
const estSalon = (activite?: string) => /(^|[^a-z])(barbiers?|barbers?|barbershops?|coiff\w*|hair\w*)([^a-z]|$)/.test(simple(activite ?? ''));
/** Lettre du logo généré par le serveur quand il n'y a pas de logo (initialOf, _shared/png.ts). */
const initiale = (nom: string) => /[A-Z0-9]/.exec(simple(nom).toUpperCase())?.[0] ?? '?';

/** Largeur approchée d'un texte (em), comme textWidthEm (dépôt LOYNA, _shared/apple-wallet.ts). */
function largeurEm(texte: string) {
  let w = 0;
  for (const c of texte) w += c === ' ' ? 0.28 : /[0-9]/.test(c) ? 0.6 : /[A-ZÀ-ÖØ-Þ€%]/.test(c) ? 0.68 : /[a-zß-öø-ÿ]/.test(c) ? 0.53 : 0.36;
  return w;
}
/** Même règle que nameFitsLogoText (dépôt LOYNA) : le nom tient-il dans le texte de l'en-tête iPhone ? */
const tientSurIphone = (nom: string, logo: boolean) => largeurEm(nom) * 18 + (logo ? 50 : 0) + 8 + 64 <= 311;
const GOOGLE_NOM_MAX = 20; // au-delà, Google peut le couper : le nom passe dans le logo large
/** Corps du nom dessiné (nameLockup) dans sa boîte, en em de la carte : la meilleure répartition sur 1 à 4 lignes. */
function corpsDessine(nom: string, largeur: number, hauteur: number) {
  const n = Math.max(1, nom.length);
  let mieux = 0;
  for (const lignes of [1, 2, 3, 4]) mieux = Math.max(mieux, Math.min((hauteur * 0.8) / (lignes * 1.05), largeur / (Math.ceil(n / lignes) * 0.74)));
  return mieux;
}

function Cadeau() {
  return (
    <svg viewBox="-12 -12 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
        <rect x="-8" y="-2" width="16" height="10" rx="1.2" />
        <rect x="-9.5" y="-6" width="19" height="4.2" rx="1" />
        <path d="M0 -6 V8 M0 -6 C-2 -10 -7 -10 -5.5 -6.6 M0 -6 C2 -10 7 -10 5.5 -6.6" />
      </g>
    </svg>
  );
}

export interface PropsCarte {
  nom: string;
  activite?: string;
  recompense: string;
  fond: string;
  tampons: string;
  passages: number;
  obtenus: number;
  logo?: string | null;
  systeme?: 'apple' | 'google';
  prenom?: string;
}

export function CarteWallet({nom, activite, recompense, fond, tampons, passages, obtenus, logo, systeme = 'apple', prenom = 'Camille'}: PropsCarte) {
  const total = Math.max(1, passages || 1);
  const faits = Math.min(Math.max(0, obtenus), total);
  // Couleurs de la vraie carte (buildPassContent et stripStyle, dépôt LOYNA) : texte Apple dans la couleur des tampons si elle se lit (contraste de 3),
  // sinon blanc ou noir ; tampons peu visibles (moins de 1,6) dans cette même couleur. Sur Android, Google choisit seul le texte, clair ou sombre.
  const avant = contrast(fond, tampons) >= 3 ? tampons : contrast(fond, BLANC) >= contrast(fond, NOIR) ? BLANC : NOIR;
  const texte = systeme === 'apple' ? avant : contrast(fond, TEXTE_CLAIR) >= contrast(fond, TEXTE_SOMBRE) ? TEXTE_CLAIR : TEXTE_SOMBRE;
  const accent = contrast(fond, tampons) < 1.6 ? avant : tampons;
  const salon = estSalon(activite);
  const style = {'--cw-fond': fond, '--cw-accent': accent, '--cw-texte': texte} as JSX.CSSProperties;
  // Même grille que l'image de la carte : stampGrid pour les salons, stampStripPng pour les autres.
  const colonnes = salon ? (total <= 6 ? total : Math.ceil(total / 2)) : Math.min(total, 10);
  const restants = total - faits;
  const reste = faits >= total ? 'À retirer !' : `${restants} passage${restants > 1 ? 's' : ''}`;
  const qr = (
    <div class="cw-qr">
      <span dangerouslySetInnerHTML={{__html: QR_EXEMPLE}} />
      <small>
        {prenom} · n° 0042
      </small>
    </div>
  );
  const leNom = nom || 'Votre commerce';
  // Nom trop long pour le texte de l'en-tête : le nom dessiné de la vraie carte, en capitales et jamais coupé.
  const dessineApple = !tientSurIphone(leNom, Boolean(logo));
  const dessineGoogle = leNom.length > GOOGLE_NOM_MAX;
  const nomDessine = (largeur: number, hauteur: number) => {
    const avecLogo = logo ? hauteur * 0.8 : 0;
    return (
      <span class="cw-dessine" style={{width: `${largeur}em`, height: `${hauteur}em`}}>
        {logo && <img src={logo} alt="" style={{width: `${hauteur * 0.64}em`, height: `${hauteur * 0.64}em`}} />}
        <span style={{fontSize: `${Math.min(corpsDessine(leNom, largeur - avecLogo, hauteur), 1.6).toFixed(3)}em`}}>{leNom}</span>
      </span>
    );
  };
  // Sans logo : le nom seul sur iPhone (rien à gauche), une lettre sur Android, comme la carte.
  const marque = logo ? (
    <span class="cw-logo">
      <img src={logo} alt="" />
    </span>
  ) : systeme === 'google' ? (
    <span class="cw-logo">{initiale(nom)}</span>
  ) : null;
  const lesTampons =
    total > 20 ? (
      <div class="cw-jauge" aria-hidden="true">
        <span style={{width: `${Math.round((faits / total) * 100)}%`}} />
      </div>
    ) : (
      <div class="cw-tampons" style={{gridTemplateColumns: `repeat(${colonnes}, 1fr)`}} aria-hidden="true">
        {Array.from({length: total}, (_, k) => (
          <span class={`${k < faits ? 'on' : ''} ${k === total - 1 ? 'fin' : ''}`}>{k === total - 1 ? <Cadeau /> : salon && k < faits ? <b class="cw-sceau">{initials(nom)}</b> : null}</span>
        ))}
      </div>
    );

  if (systeme === 'google')
    return (
      <div class="cw cw--google" style={style} role="img" aria-label={`Carte Google Wallet de ${nom}, ${faits} passages sur ${total}, récompense : ${recompense}`}>
        <div class="cw-g-h">
          {dessineGoogle ? (
            nomDessine(16, 5)
          ) : (
            <>
              {marque}
              <span class="cw-g-n">{leNom}</span>
            </>
          )}
        </div>
        <p class="cw-g-t">Carte de fidélité</p>
        {activite && <p class="cw-g-a">{activite}</p>}
        <div class="cw-champs">
          <div>
            <small>Passages</small>
            <b>
              {faits} / {total}
            </b>
          </div>
          <div class="d">
            <small>Récompense</small>
            <b>{recompense || 'Votre récompense'}</b>
          </div>
        </div>
        {qr}
        <div class="cw-bande">{lesTampons}</div>
      </div>
    );

  return (
    <div class="cw cw--apple" style={style} role="img" aria-label={`Carte Apple Wallet de ${nom}, ${faits} passages sur ${total}, récompense : ${recompense}`}>
      <div class="cw-a-h">
        {dessineApple ? (
          nomDessine(10.2, 3.2)
        ) : (
          <>
            {marque}
            <span class="cw-a-n">{leNom}</span>
          </>
        )}
        <span class="cw-a-c">
          <small>PASSAGES</small>
          <b>
            {faits}/{total}
          </b>
        </span>
      </div>
      <div class="cw-bande">{lesTampons}</div>
      <div class="cw-champs">
        <div>
          <small>RÉCOMPENSE</small>
          <b>{recompense || 'Votre récompense'}</b>
        </div>
        <div class="d">
          <small>ENCORE</small>
          <b>{reste}</b>
        </div>
      </div>
      {qr}
    </div>
  );
}

/** Le même aperçu dans un téléphone (cadre et fond de l'application Wallet). */
export function TelephoneWallet(props: PropsCarte) {
  const {systeme = 'apple'} = props;
  return (
    <div class={`cw-tel cw-tel--${systeme}`}>
      <div class="cw-tel-e">
        <div class="cw-tel-s">
          <span>12:41</span>
          <i aria-hidden="true" />
        </div>
        <CarteWallet {...props} />
      </div>
    </div>
  );
}
