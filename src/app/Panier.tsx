// Panier de loyna.fr (/panier/, décision d'Ewan du 2026-10-27) : offre et période, QR codes sous verre en quantité
// libre, compte LOYNA créé AVANT le paiement (il reçoit la commande et l'espace client), puis paiement Stripe.
// Parrainage LOYNA (même jour) : code facultatif, pré-rempli par ?parrain=, premier mois offert en mensuel (décision d'Ewan du 2026-10-31).
// Mise en service : offerte d'office jusqu'à la fin de l'offre de lancement (aucun code à saisir).
// Le serveur (Edge Function checkout-create, dépôt LOYNA) crée ou vérifie le compte et la session de paiement ;
// s'il ne peut pas créer la session, il répond CHECKOUT_FALLBACK et on passe par le lien de paiement de l'offre.
// Session de l'espace client : même client Supabase que LOYNA Business (src/app/backend.ts), chargé seulement si
// une session est enregistrée dans ce navigateur. Aucun script externe.
import {useEffect, useRef, useState} from 'preact/hooks';
import {LAUNCH_OFFER, PLANS, QR_VERRE, SETUP_FEE, euro, offerActive, quotas, type Periode, type PlanId} from '../data/site';
import {ApiError, publicEdge} from './http';
import {frenchTypography} from './typo';
import {TelephoneWallet} from '../lib/CarteWallet';
import {lireCartePreparee, RE_ID_CARTE, type CartePreparee} from '../lib/carte-preparee';

type QrKey = 'unit' | 'pack5' | 'pack10';
type Qr = Record<QrKey, number>;
interface Account {
  id: string;
  email: string;
  created: boolean;
  confirmation_sent: boolean;
}
interface CheckoutReply {
  status: 'OK' | 'CHECKOUT_FALLBACK';
  url?: string;
  account: Account;
  warnings?: string[];
  referral?: {code: string; applied: boolean};
}

// name : pour les lecteurs d'écran (« Ajouter un pack de 5 »)
const QR_ROWS: {key: QrKey; id: string; label: string; name: string; detail: string; price: number; max: number; size: number}[] = [
  {key: 'unit', id: 'pn-qr-unit', label: 'À l’unité', name: 'un QR code à l’unité', detail: `${euro(QR_VERRE.unit)} le QR code`, price: QR_VERRE.unit, max: QR_VERRE.maxUnit, size: 1},
  {key: 'pack5', id: 'pn-qr-5', label: 'Pack de 5', name: 'un pack de 5 QR codes', detail: `${euro(QR_VERRE.pack5)} le pack (−15 %)`, price: QR_VERRE.pack5, max: QR_VERRE.maxPack, size: 5},
  {key: 'pack10', id: 'pn-qr-10', label: 'Pack de 10', name: 'un pack de 10 QR codes', detail: `${euro(QR_VERRE.pack10)} le pack (−25 %)`, price: QR_VERRE.pack10, max: QR_VERRE.maxPack, size: 10},
];
// Règles de mot de passe de l'espace client (Supabase Auth, comme la page « Choisir mon mot de passe »)
const RULES = [
  {test: (p: string) => p.length >= 10, label: '10 caractères minimum'},
  {test: (p: string) => /[A-Z]/.test(p), label: 'une majuscule'},
  {test: (p: string) => /[a-z]/.test(p), label: 'une minuscule'},
  {test: (p: string) => /\d/.test(p), label: 'un chiffre'},
];
const AUTH_KEY = 'loyna-business-auth'; // session de l'espace client (src/app/backend.ts)
const FORM_KEY = 'loyna-panier'; // champs du compte, sans le mot de passe (retour depuis Stripe)
const COMPTE_KEY = 'loyna-panier-compte'; // compte créé avant un paiement par lien : lu par /merci/ (même nom)
const CARTE_KEY = 'loyna-panier-carte'; // carte préparée : gardée pour le retour depuis Stripe, dont l'adresse ne la porte pas
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Parrainage LOYNA : « LOYNA- » + 6 caractères sans 0, O, 1 ni I (comme le serveur, _shared/referral.ts)
const REFERRAL_RE = /^LOYNA-[A-HJ-NP-Z2-9]{6}$/;
function normalizeReferral(value: string): string | null {
  const raw = value.toUpperCase().replace(/[\s_.-]+/g, '');
  const code = `LOYNA-${raw.startsWith('LOYNA') ? raw.slice(5) : raw}`;
  return REFERRAL_RE.test(code) ? code : null;
}
const REFERRAL_ERRORS = new Set(['REFERRAL_INVALID', 'REFERRAL_SELF', 'REFERRAL_NOT_NEW', 'REFERRAL_ALREADY', 'REFERRAL_MONTHLY_ONLY']);

const cents = (n: number) => Math.round(n * 100);
const eur = (c: number) => euro(c / 100);
const clamp = (v: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.trunc(v))) : 0);
const backend = () => import('./backend');
const track = (name: string, params: object) => (window as unknown as {loynaTrack?: (n: string, p?: object) => void}).loynaTrack?.(name, params);

function store(kind: 'local' | 'session', key: string, value?: string | null): string | null {
  try {
    const s = kind === 'local' ? localStorage : sessionStorage;
    if (value === undefined) return s.getItem(key);
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* stockage indisponible (navigation privée) */
  }
  return null;
}

function initialChoice() {
  const q = new URLSearchParams(location.search);
  const plan = (PLANS.find((p) => p.id === q.get('offre'))?.id ?? PLANS.find((p) => p.highlight)?.id ?? PLANS[0].id) as PlanId;
  const periode: Periode = q.get('periode') === 'annuel' ? 'annuel' : 'mensuel';
  const qr: Qr = {
    unit: clamp(Number(q.get('qr') ?? 0), QR_VERRE.maxUnit),
    pack5: clamp(Number(q.get('pack5') ?? 0), QR_VERRE.maxPack),
    pack10: clamp(Number(q.get('pack10') ?? 0), QR_VERRE.maxPack),
  };
  return {plan, periode, qr};
}

/**
 * Carte préparée pour un prospect, passée dans le lien du panier (Ewan, 29/10/2026) :
 * /panier/?offre=starter&periode=mensuel&nom=…&activite=…&recompense=…&fond=0d0d10&tampons=7d75ff&passages=5
 * Les réglages vont dans le brouillon du configurateur (« loyna-config ») : la page /merci/ en remplit le formulaire
 * de la carte après le paiement (même navigateur), et le nom du commerce pré-remplit le compte. Rien n'est envoyé ici.
 */
type CarteLien = {name: string; activity: string; reward: string; bg: string; accent: string; total: number};
function carteDuLien(): CarteLien | null {
  const q = new URLSearchParams(location.search);
  const hexa = (v: string | null) => {
    const h = (v || '').trim().replace(/^#/, '').toLowerCase();
    return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : '';
  };
  const nom = (q.get('nom') || '').trim().slice(0, 40);
  if (!nom) return null;
  const passages = Math.trunc(Number(q.get('passages')));
  const carte: CarteLien = {
    name: nom,
    activity: (q.get('activite') || '').trim().slice(0, 40),
    reward: (q.get('recompense') || '').trim().slice(0, 60),
    bg: hexa(q.get('fond')),
    accent: hexa(q.get('tampons')),
    total: Number.isFinite(passages) && passages >= 2 && passages <= 50 ? passages : 0,
  };
  try {
    const avant = JSON.parse(store('local', 'loyna-config') || 'null') ?? {};
    const garde = (v: string | number, ancien: unknown) => v || ancien || '';
    store('local', 'loyna-config', JSON.stringify({
      ...avant,
      name: carte.name,
      activity: garde(carte.activity, avant.activity),
      reward: garde(carte.reward, avant.reward),
      bg: garde(carte.bg, avant.bg),
      accent: garde(carte.accent, avant.accent),
      total: garde(carte.total, avant.total) || 10,
      filled: 0,
      variant: avant.variant || 'apple',
    }));
  } catch {
    /* brouillon illisible : on le remplace au prochain passage */
  }
  return carte;
}

/**
 * Carte préparée avec le commerçant dans le panel commercial (Ewan, 2026-10-30) : /panier/?carte=<id>. Le lien reprend
 * la carte, le logo, l'offre et les QR codes (cartes.php) ; le commerçant n'a plus qu'à créer son compte et à payer.
 */
function idCarteInitial(): string | null {
  const id = new URLSearchParams(location.search).get('carte') || store('session', CARTE_KEY);
  return id && RE_ID_CARTE.test(id) ? id : null;
}

/** Code de parrainage du lien partagé (?parrain=…), gardé si l'on change d'offre ou de période. */
function initialReferral(): string {
  return (new URLSearchParams(location.search).get('parrain') ?? '').trim().slice(0, 20);
}

function initialFields() {
  const f = {first_name: '', last_name: '', business_name: '', email: '', phone: ''};
  try {
    Object.assign(f, JSON.parse(store('session', FORM_KEY) || '{}'));
    // nom du commerce saisi dans le configurateur (/creer-ma-carte/), dans ce navigateur
    const c = JSON.parse(store('local', 'loyna-config') || 'null');
    if (!f.business_name && c?.name && c.name !== 'Votre commerce') f.business_name = String(c.name).slice(0, 120);
  } catch {
    /* rien à reprendre */
  }
  return f;
}

export default function Panier() {
  const root = useRef<HTMLFormElement>(null);
  const [choice, setChoice] = useState(initialChoice);
  const [carte] = useState(carteDuLien); // avant initialFields : le nom du commerce en vient
  const [prepId] = useState(idCarteInitial);
  const [prep, setPrep] = useState<CartePreparee | null>(null);
  const [prepEtat, setPrepEtat] = useState<'attente' | 'ok' | 'non'>(prepId ? 'attente' : 'non');
  const [changerOffre, setChangerOffre] = useState(false);
  const [systeme, setSysteme] = useState<'apple' | 'google'>('apple');
  const avaitOffre = useRef(new URLSearchParams(location.search).has('offre')); // choix déjà fait (rechargement, retour de Stripe)
  const [f, setF] = useState(initialFields);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [cgv, setCgv] = useState(false);
  const [website, setWebsite] = useState(''); // champ piège
  const [referral, setReferral] = useState(initialReferral);
  const [session, setSession] = useState<{email: string} | null | undefined>(undefined);
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [login, setLogin] = useState({email: '', password: ''});
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginErr, setLoginErr] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<{url: string; email: string; warning: boolean; referralLost: boolean} | null>(null);
  const offer = offerActive();

  useEffect(() => (root.current ? frenchTypography(root.current) : undefined), [prepEtat]);
  useEffect(() => {
    if (!prepId) return;
    let actif = true;
    lireCartePreparee(prepId)
      .then((c) => {
        if (!actif) return;
        if (!c) {
          store('session', CARTE_KEY, null);
          return setPrepEtat('non');
        }
        store('session', CARTE_KEY, prepId);
        setPrep(c);
        if (!avaitOffre.current) setChoice((x) => ({...x, plan: c.offre, periode: c.periode, qr: {...c.qr}}));
        setF((x) => (x.business_name && x.business_name !== 'Votre commerce' ? x : {...x, business_name: c.nom.slice(0, 120)}));
        // Lu par /merci/ : le formulaire des éléments n'a plus à être rempli (le logo reste sur le serveur)
        store('local', 'loyna-config', JSON.stringify({name: c.nom, activity: c.activite, reward: c.recompense, bg: c.fond, accent: c.tampons, total: c.passages, filled: 0, variant: 'apple', preparee: prepId}));
        const titre = document.querySelector('.pn-hero h1');
        const intro = document.querySelector('.pn-hero .lead');
        if (titre) titre.textContent = 'Votre commande';
        if (intro) intro.textContent = 'Votre carte est préparée. Il reste à créer votre compte LOYNA, puis à valider votre commande sur la page sécurisée de Stripe.';
        setPrepEtat('ok');
      })
      .catch(() => actif && setPrepEtat('non'));
    return () => {
      actif = false;
    };
  }, [prepId]);
  // Session de l'espace client déjà ouverte dans ce navigateur : « Connecté en tant que … »
  useEffect(() => {
    if (!store('local', AUTH_KEY)) return setSession(null);
    backend()
      .then((b) => b.supabaseBackend.getSession())
      .then((s) => setSession(s && s.email ? s : null), () => setSession(null));
  }, []);
  // Le choix reste dans l'adresse (rechargement, partage, retour depuis Stripe)
  useEffect(() => {
    const q = new URLSearchParams({offre: choice.plan, periode: choice.periode});
    (Object.keys(choice.qr) as QrKey[]).forEach((k) => choice.qr[k] > 0 && q.set(k === 'unit' ? 'qr' : k, String(choice.qr[k])));
    if (referral.trim()) q.set('parrain', normalizeReferral(referral) ?? referral.trim());
    // carte préparée (carteDuLien) : ses réglages restent dans l'adresse, pour un rechargement ou un partage
    const avant = new URLSearchParams(location.search);
    ['nom', 'activite', 'recompense', 'fond', 'tampons', 'passages'].forEach((k) => avant.get(k) && q.set(k, avant.get(k)!));
    if (prepId && prepEtat !== 'non') q.set('carte', prepId);
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }, [choice, referral, prepEtat]);

  const plan = PLANS.find((p) => p.id === choice.plan)!;
  const monthly = choice.periode === 'mensuel';
  const subCents = cents(monthly ? plan.monthly : plan.yearly);
  const setupDue = monthly && !offer ? cents(SETUP_FEE) : 0;
  const qrLines = QR_ROWS.filter((r) => choice.qr[r.key] > 0);
  const qrCents = qrLines.reduce((s, r) => s + choice.qr[r.key] * cents(r.price), 0);
  const qrCount = QR_ROWS.reduce((s, r) => s + choice.qr[r.key] * r.size, 0);
  // Parrainage LOYNA : le prix de l'offre du premier mois est offert (ni mise en service, ni QR codes), mensuel seulement
  const referralCode = referral.trim() ? normalizeReferral(referral) : null;
  const referralOn = monthly && !!referralCode;
  const referralCents = referralOn ? subCents : 0;
  const todayCents = subCents + setupDue + qrCents - referralCents;

  const setQr = (k: QrKey, v: number) => setChoice((c) => ({...c, qr: {...c.qr, [k]: clamp(v, QR_ROWS.find((r) => r.key === k)!.max)}}));
  const setField = (k: keyof typeof f, v: string) => {
    setF((x) => ({...x, [k]: v}));
    if (errors[k]) setErrors((e) => ({...e, [k]: ''}));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!session) {
      if (!f.first_name.trim()) e.first_name = 'Indiquez votre prénom.';
      if (!f.last_name.trim()) e.last_name = 'Indiquez votre nom.';
      if (!f.business_name.trim()) e.business_name = 'Indiquez le nom de votre commerce.';
      if (!EMAIL_RE.test(f.email.trim())) e.email = 'Indiquez une adresse e-mail valide.';
      if (f.phone.trim() && !/^[0-9+ ().-]{8,30}$/.test(f.phone.trim())) e.phone = 'Ce numéro semble incomplet.';
      if (!RULES.every((r) => r.test(pw))) e.password = 'Le mot de passe ne respecte pas encore toutes les règles.';
      else if (pw !== pw2) e.password2 = 'Les deux mots de passe sont différents.';
    }
    if (!cgv) e.cgv = 'Acceptez les conditions générales de vente pour continuer.';
    if (monthly && referral.trim() && !referralCode) e.referral = 'Code de parrainage inconnu ou expiré.';
    return e;
  };

  const focusFirstError = (e: Record<string, string>) => {
    const first = ['referral', 'first_name', 'last_name', 'business_name', 'email', 'phone', 'password', 'password2', 'cgv'].find((k) => e[k]);
    if (first) setTimeout(() => (document.getElementById(`pn-${first}`) as HTMLElement | null)?.focus(), 0);
  };

  const doLogin = async () => {
    setLoginErr('');
    if (!EMAIL_RE.test(login.email.trim()) || !login.password) return setLoginErr('Indiquez votre adresse e-mail et votre mot de passe.');
    setLoginBusy(true);
    try {
      const b = await backend();
      await b.supabaseBackend.signIn(login.email, login.password);
      const s = await b.supabaseBackend.getSession();
      setSession(s);
      setLogin({email: '', password: ''});
      setFormErr('');
      setExists(false);
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    try {
      await (await backend()).supabaseBackend.signOut();
    } catch {
      /* session déjà fermée */
    }
    setSession(null);
    setMode('create');
  };

  const submit = async (ev: Event) => {
    ev.preventDefault();
    if (busy) return;
    if (!session && mode === 'login') return doLogin();
    setFormErr('');
    setExists(false);
    const e = validate();
    setErrors(e);
    if (e.referral) setChangerOffre(true); // le champ du code est dans l'étape repliée d'une carte préparée
    if (Object.values(e).some(Boolean)) return focusFirstError(e);
    setBusy(true);
    const body = {
      plan: plan.id.toUpperCase(),
      period: monthly ? 'monthly' : 'yearly',
      qr: choice.qr,
      website,
      ...(referralOn ? {referral_code: referralCode} : {}),
      ...(session
        ? {}
        : {
            account: {
              email: f.email.trim().toLowerCase(),
              password: pw,
              first_name: f.first_name.trim(),
              last_name: f.last_name.trim(),
              business_name: f.business_name.trim(),
              phone: f.phone.trim(),
            },
          }),
    };
    try {
      const reply = session
        ? await (await backend()).supabaseBackend.edge<CheckoutReply>('checkout-create', body)
        : await publicEdge<CheckoutReply>('checkout-create', {body});
      store('session', FORM_KEY, JSON.stringify(f));
      track('begin_checkout', {currency: 'EUR', value: todayCents / 100, items: [{item_id: `${plan.id}-${choice.periode}`}]});
      if (reply.status === 'OK' && reply.url) {
        location.assign(reply.url);
        return; // le bouton reste occupé pendant la redirection
      }
      // Paiement par le lien de l'offre : e-mail du compte prérempli, commande reliée au compte
      const link = new URL(monthly ? plan.links.monthly : plan.links.yearly);
      link.searchParams.set('locale', 'fr');
      link.searchParams.set('prefilled_email', reply.account.email);
      link.searchParams.set('client_reference_id', reply.account.id);
      if (monthly && offerActive()) link.searchParams.set('prefilled_promo_code', LAUNCH_OFFER.code);
      store('session', COMPTE_KEY, '1');
      setFallback({
        url: link.toString(),
        email: reply.account.email,
        warning: !!reply.warnings?.includes('CONFIRMATION_NOT_SENT'),
        referralLost: !!reply.referral && !reply.referral.applied,
      });
      setBusy(false);
      setTimeout(() => document.getElementById('pn-fallback')?.focus(), 0);
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiError ? err.code : '';
      const msg = err instanceof Error && err.message ? err.message : 'L’opération n’a pas abouti. Réessayez dans un instant.';
      if (REFERRAL_ERRORS.has(code)) {
        setChangerOffre(true);
        setErrors({referral: msg});
        focusFirstError({referral: msg});
      } else if (code === 'ACCOUNT_EXISTS') {
        setExists(true);
        setFormErr(msg);
        setLogin({email: f.email.trim(), password: ''});
      } else if (code === 'WEAK_PASSWORD') {
        setErrors({password: msg});
        focusFirstError({password: msg});
      } else if (code === 'INVALID_PHONE') {
        setErrors({phone: msg});
        focusFirstError({phone: msg});
      } else if (code === 'INVALID_EMAIL') {
        setErrors({email: msg});
        focusFirstError({email: msg});
      } else if (session && (code === 'UNAUTHORIZED' || (err as ApiError)?.status === 401)) {
        setSession(null);
        setMode('login');
        setFormErr('Votre session a expiré : reconnectez-vous pour continuer.');
      } else setFormErr(msg);
    }
  };

  const fieldProps = (k: keyof typeof f) => ({
    id: `pn-${k}`,
    value: f[k],
    onInput: (e: Event) => setField(k, (e.target as HTMLInputElement).value),
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `pn-${k}-err` : undefined,
  });
  const err = (k: string) =>
    errors[k] ? (
      <p class="pn-err" id={`pn-${k}-err`} role="alert">
        {errors[k]}
      </p>
    ) : null;

  if (prepEtat === 'attente')
    return (
      <div class="pn-wait" role="status">
        Chargement de votre carte…
      </div>
    );
  const replie = prepEtat === 'ok' && !changerOffre;

  return (
    <form class="pn" ref={root} onSubmit={submit} noValidate>
      {carte && (
        <div class="pn-carte" style="display:flex;align-items:center;gap:14px;padding:14px 18px;margin-bottom:18px;border-radius:16px;border:1px solid rgba(0,0,0,.1);background:#fff">
          <span aria-hidden="true" style={`flex:none;width:46px;height:30px;border-radius:7px;background:${carte.bg || '#121216'};box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);display:flex;align-items:center;justify-content:center`}>
            <span style={`width:12px;height:12px;border-radius:50%;background:${carte.accent || '#d9b27a'}`} />
          </span>
          <span style="line-height:1.35">
            <strong>Votre carte : {carte.name}</strong>
            <br />
            <span class="pn-muted pn-small">
              {[carte.total ? `${carte.total} passages` : '', carte.reward].filter(Boolean).join(' · ') || 'réglages repris après la commande'}
              {' '}: vous les retrouverez après votre commande, prêts à valider.
            </span>
          </span>
        </div>
      )}
      <div class="pn-steps">
        {prep && (
          <section class="pn-prep" aria-labelledby="pn-prep-t">
            <TelephoneWallet nom={prep.nom} activite={prep.activite} recompense={prep.recompense} fond={prep.fond} tampons={prep.tampons} passages={prep.passages} obtenus={Math.min(3, prep.passages)} logo={prep.logo} systeme={systeme} />
            <div class="pn-prep-d">
              <p class="eyebrow">Préparée pour vous</p>
              <h2 id="pn-prep-t">La carte de {prep.nom}</h2>
              <p>
                {prep.passages} passages · {prep.recompense}
              </p>
              <p class="pn-muted">Votre carte sera créée avec ces réglages après votre commande, en principe sous 24 h. Aperçu sur un exemple de client.</p>
              <div class="pn-prep-sys" role="radiogroup" aria-label="Téléphone de l’aperçu">
                <button type="button" role="radio" aria-checked={systeme === 'apple'} class={systeme === 'apple' ? 'on' : ''} onClick={() => setSysteme('apple')}>
                  iPhone
                </button>
                <button type="button" role="radio" aria-checked={systeme === 'google'} class={systeme === 'google' ? 'on' : ''} onClick={() => setSysteme('google')}>
                  Android
                </button>
              </div>
              {replie && (
                <p>
                  <button type="button" class="pn-link" onClick={() => setChangerOffre(true)}>
                    Changer d’offre ou de QR codes
                  </button>
                  {' · '}
                  <button
                    type="button"
                    class="pn-link"
                    onClick={() => {
                      setChangerOffre(true);
                      setTimeout(() => document.getElementById('pn-referral')?.focus());
                    }}
                  >
                    J’ai un code de parrainage
                  </button>
                </p>
              )}
            </div>
          </section>
        )}
        {/* --- 1. Offre ------------------------------------------------------------------------- */}
        {!replie && (
        <fieldset class="pn-step">
          <legend>
            <span class="pn-num">1</span> Votre offre
          </legend>
          <div class="pn-period" role="radiogroup" aria-label="Période de facturation">
            {(['mensuel', 'annuel'] as Periode[]).map((p) => (
              <label class={choice.periode === p ? 'on' : ''}>
                <input type="radio" name="periode" value={p} checked={choice.periode === p} onChange={() => setChoice((c) => ({...c, periode: p}))} />
                {p === 'mensuel' ? 'Mensuel' : 'Annuel'}
                {p === 'annuel' && <span class="pn-save">−15 %</span>}
              </label>
            ))}
          </div>
          <div class="pn-plans">
            {PLANS.map((p) => (
              <label class={`pn-plan ${choice.plan === p.id ? 'on' : ''}`}>
                <input type="radio" name="offre" value={p.id} checked={choice.plan === p.id} onChange={() => setChoice((c) => ({...c, plan: p.id}))} />
                <span class="pn-plan-head">
                  <strong>{p.name}</strong>
                  {p.badge && <span class="pn-badge">{p.badge}</span>}
                </span>
                <span class="pn-plan-price">
                  {monthly ? euro(p.monthly) : euro(p.yearly)} <small>{monthly ? '/ mois' : '/ an'}, sans TVA</small>
                </span>
                <span class="pn-plan-pitch">{p.pitch}</span>
                <span class="pn-plan-quota">{quotas(p)}</span>
              </label>
            ))}
          </div>
          <p class="pn-note">
            {monthly ? (
              offer ? (
                <>
                  Mise en service <s>{euro(SETUP_FEE)}</s> offerte jusqu’au {LAUNCH_OFFER.untilLabel}, en mensuel comme en annuel. <strong>Engagement de 12 mois</strong>, {referralOn ? 'dont le premier offert' : 'réglés chaque mois'}, puis
                  résiliable à la fin de n’importe quel mois, sans frais.
                </>
              ) : (
                <>
                  + {euro(SETUP_FEE)} de mise en service, une seule fois. <strong>Engagement de 12 mois</strong>, {referralOn ? 'dont le premier offert' : 'réglés chaque mois'}, puis résiliable à la fin de n’importe quel mois, sans frais.
                </>
              )
            ) : (
              <>
                Soit {euro(Math.round((plan.yearly / 12) * 100) / 100)} / mois · <strong>mise en service offerte</strong>. 12 mois payés en une fois, renouvelables.
              </>
            )}{' '}
            <a href="/tarifs/">Comparer les offres</a>
          </p>
          <div class="pn-ref">
            <label for="pn-referral">
              Code de parrainage <span class="pn-opt">(facultatif)</span>
            </label>
            <input
              id="pn-referral"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck={false}
              maxLength={20}
              placeholder="LOYNA-XXXXXX"
              value={referral}
              onInput={(e) => {
                setReferral((e.target as HTMLInputElement).value);
                if (errors.referral) setErrors((x) => ({...x, referral: ''}));
              }}
              aria-invalid={errors.referral ? true : undefined}
              aria-describedby={`pn-referral-help${errors.referral ? ' pn-referral-err' : ''}`}
            />
            <p class="pn-muted pn-small" id="pn-referral-help">
              {monthly
                ? 'Parrainé par un commerçant client de LOYNA ? Votre premier mois est offert, en paiement mensuel.'
                : referral.trim()
                  ? 'Le parrainage s’applique au paiement mensuel : choisissez « Mensuel » pour en profiter.'
                  : 'Le parrainage LOYNA s’applique au paiement mensuel.'}
            </p>
            {err('referral')}
          </div>
        </fieldset>
        )}

        {/* --- 2. QR codes sous verre ------------------------------------------------------------ */}
        {!replie && (
        <fieldset class="pn-step">
          <legend>
            <span class="pn-num">2</span> QR codes sous verre <span class="pn-opt">(option)</span>
          </legend>
          <p class="pn-intro">
            Le QR code d’inscription à votre carte de fidélité, personnalisé à vos couleurs et présenté sous verre, à poser sur le comptoir. Achat unique, livré sous {QR_VERRE.deliveryDays}&nbsp;jours
            maximum à votre adresse de facturation.
          </p>
          <div class="pn-qr">
            {QR_ROWS.map((r) => {
              const v = choice.qr[r.key];
              return (
                <div class={`pn-qr-row ${v > 0 ? 'on' : ''}`}>
                  <div class="pn-qr-t">
                    <label for={r.id}>{r.label}</label>
                    <span>{r.detail}</span>
                  </div>
                  <div class="pn-stepper">
                    <button type="button" onClick={() => setQr(r.key, v - 1)} disabled={v <= 0} aria-label={`Retirer ${r.name}`}>
                      −
                    </button>
                    <input
                      id={r.id}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={r.max}
                      step={1}
                      value={String(v)}
                      onInput={(e) => setQr(r.key, Number((e.target as HTMLInputElement).value))}
                      onFocus={(e) => (e.target as HTMLInputElement).select()}
                      aria-describedby={`${r.id}-max`}
                    />
                    <button type="button" onClick={() => setQr(r.key, v + 1)} disabled={v >= r.max} aria-label={`Ajouter ${r.name}`}>
                      +
                    </button>
                  </div>
                  <span class="sr-only" id={`${r.id}-max`}>
                    {r.detail}, de 0 à {r.max}.
                  </span>
                </div>
              );
            })}
          </div>
          <p class="pn-qr-total" aria-live="polite">
            {qrCount === 0 ? 'Aucun QR code sous verre ajouté.' : `${qrCount} QR code${qrCount > 1 ? 's' : ''} sous verre : ${eur(qrCents)}, sans TVA.`}
          </p>
        </fieldset>
        )}

        {/* --- 3. Compte LOYNA ------------------------------------------------------------------- */}
        <fieldset class="pn-step">
          <legend>
            <span class="pn-num">{replie ? 1 : 3}</span> Votre compte LOYNA
          </legend>
          <p class="pn-intro">Ce compte reçoit votre commande et vous donne accès à votre espace client.</p>
          {session === undefined && <p class="pn-muted">Vérification de votre connexion…</p>}
          {session && (
            <div class="pn-session">
              <p>
                Connecté en tant que <strong>{session.email}</strong>. Votre commande sera rattachée à ce compte.
              </p>
              <button type="button" class="pn-link" onClick={logout}>
                Utiliser un autre compte
              </button>
            </div>
          )}
          {session === null && mode === 'create' && (
            <div class="pn-fields">
              <div class="pn-row">
                <div class="field">
                  <label for="pn-first_name">Prénom *</label>
                  <input type="text" autocomplete="given-name" maxLength={60} required {...fieldProps('first_name')} />
                  {err('first_name')}
                </div>
                <div class="field">
                  <label for="pn-last_name">Nom *</label>
                  <input type="text" autocomplete="family-name" maxLength={80} required {...fieldProps('last_name')} />
                  {err('last_name')}
                </div>
              </div>
              <div class="field">
                <label for="pn-business_name">Nom du commerce *</label>
                <input type="text" autocomplete="organization" maxLength={120} required {...fieldProps('business_name')} />
                {err('business_name')}
              </div>
              <div class="pn-row">
                <div class="field">
                  <label for="pn-email">E-mail *</label>
                  <input type="email" autocomplete="email" inputMode="email" maxLength={254} required {...fieldProps('email')} />
                  {err('email')}
                </div>
                <div class="field">
                  <label for="pn-phone">
                    Téléphone <span class="pn-opt">(facultatif)</span>
                  </label>
                  <input type="tel" autocomplete="tel" maxLength={30} {...fieldProps('phone')} />
                  {err('phone')}
                </div>
              </div>
              <div class="pn-row">
                <div class="field">
                  <label for="pn-password">Mot de passe *</label>
                  <span class="pn-pw">
                    <input
                      id="pn-password"
                      type={showPw ? 'text' : 'password'}
                      autocomplete="new-password"
                      maxLength={72}
                      required
                      value={pw}
                      onInput={(e) => {
                        setPw((e.target as HTMLInputElement).value);
                        if (errors.password) setErrors((x) => ({...x, password: ''}));
                      }}
                      aria-invalid={errors.password ? true : undefined}
                      aria-describedby={`pn-pw-rules${errors.password ? ' pn-password-err' : ''}`}
                    />
                    <button type="button" class="pn-eye" onClick={() => setShowPw(!showPw)} aria-pressed={showPw}>
                      {showPw ? 'Masquer' : 'Afficher'}
                    </button>
                  </span>
                  {err('password')}
                </div>
                <div class="field">
                  <label for="pn-password2">Confirmez le mot de passe *</label>
                  <input
                    id="pn-password2"
                    type={showPw ? 'text' : 'password'}
                    autocomplete="new-password"
                    maxLength={72}
                    required
                    value={pw2}
                    onInput={(e) => {
                      setPw2((e.target as HTMLInputElement).value);
                      if (errors.password2) setErrors((x) => ({...x, password2: ''}));
                    }}
                    aria-invalid={errors.password2 ? true : undefined}
                    aria-describedby={errors.password2 ? 'pn-password2-err' : undefined}
                  />
                  {err('password2')}
                </div>
              </div>
              <ul class="pn-rules" id="pn-pw-rules" aria-label="Règles du mot de passe">
                {RULES.map((r) => (
                  <li class={r.test(pw) ? 'ok' : ''}>
                    <span aria-hidden="true">{r.test(pw) ? '✓' : '•'}</span> {r.label}
                    <span class="sr-only">{r.test(pw) ? ' : respectée' : ' : à respecter'}</span>
                  </li>
                ))}
              </ul>
              <p class="pn-muted">
                Déjà un compte ?{' '}
                <button
                  type="button"
                  class="pn-link"
                  onClick={() => {
                    setMode('login');
                    setLogin((l) => ({...l, email: l.email || f.email}));
                  }}
                >
                  Connectez-vous
                </button>
              </p>
            </div>
          )}
          {session === null && mode === 'login' && (
            <div class="pn-fields pn-login">
              <div class="pn-row">
                <div class="field">
                  <label for="pn-login-email">E-mail</label>
                  <input id="pn-login-email" type="email" autocomplete="username" value={login.email} onInput={(e) => setLogin((l) => ({...l, email: (e.target as HTMLInputElement).value}))} />
                </div>
                <div class="field">
                  <label for="pn-login-password">Mot de passe</label>
                  <input
                    id="pn-login-password"
                    type="password"
                    autocomplete="current-password"
                    value={login.password}
                    onInput={(e) => setLogin((l) => ({...l, password: (e.target as HTMLInputElement).value}))}
                  />
                </div>
              </div>
              {loginErr && (
                <p class="pn-err" role="alert">
                  {loginErr}
                </p>
              )}
              <div class="pn-login-a">
                <button type="button" class={`btn btn--primary ${loginBusy ? 'is-loading' : ''}`} onClick={doLogin} disabled={loginBusy} aria-busy={loginBusy || undefined}>
                  Se connecter
                </button>
                <button
                  type="button"
                  class="pn-link"
                  onClick={() => {
                    setMode('create');
                    setLoginErr('');
                  }}
                >
                  Créer un compte
                </button>
              </div>
              <p class="pn-muted">
                Mot de passe oublié ? Écrivez à <a href="mailto:contact@loyna.fr?subject=Nouveau%20lien%20de%20connexion%20LOYNA">contact@loyna.fr</a> depuis l’adresse de votre compte : nous vous
                envoyons un lien pour en choisir un nouveau.
              </p>
            </div>
          )}
          <div class="pn-cgv">
            <label class="pn-check">
              <input
                id="pn-cgv"
                type="checkbox"
                checked={cgv}
                required
                onChange={(e) => {
                  setCgv((e.target as HTMLInputElement).checked);
                  if (errors.cgv) setErrors((x) => ({...x, cgv: ''}));
                }}
                aria-invalid={errors.cgv ? true : undefined}
                aria-describedby={errors.cgv ? 'pn-cgv-err' : undefined}
              />
              <span>
                J’accepte les{' '}
                <a href="/cgv/" target="_blank" rel="noopener">
                  conditions générales de vente
                </a>{' '}
                *
              </span>
            </label>
            {err('cgv')}
            <p class="pn-muted pn-small">
              Vos coordonnées servent à créer votre compte, à traiter votre commande et à vous contacter à son sujet ; elles ne sont jamais vendues ni louées. Voir notre{' '}
              <a href="/confidentialite/" target="_blank" rel="noopener">
                politique de confidentialité
              </a>
              .
            </p>
          </div>
          <div class="pn-hp" aria-hidden="true">
            <label for="pn-website">Ne pas remplir</label>
            <input id="pn-website" name="website" type="text" tabIndex={-1} autocomplete="off" value={website} onInput={(e) => setWebsite((e.target as HTMLInputElement).value)} />
          </div>
        </fieldset>
      </div>

      {/* --- Récapitulatif ------------------------------------------------------------------------- */}
      <aside class="pn-sum" aria-labelledby="pn-sum-t">
        <h2 id="pn-sum-t">Récapitulatif</h2>
        <dl class="pn-lines">
          <div>
            <dt>
              LOYNA {plan.name}
              <small>{monthly ? 'paiement mensuel, engagement de 12 mois' : 'paiement annuel (−15 %)'}</small>
            </dt>
            <dd>{eur(subCents)}</dd>
          </div>
          <div>
            <dt>Mise en service</dt>
            <dd>
              {monthly ? (
                offer ? (
                  <>
                    <s>{euro(SETUP_FEE)}</s> offerte
                  </>
                ) : (
                  euro(SETUP_FEE)
                )
              ) : (
                'offerte'
              )}
            </dd>
          </div>
          {referralOn && (
            <div>
              <dt>
                Parrainage LOYNA
                <small>Premier mois offert ({referralCode})</small>
              </dt>
              <dd>−{eur(referralCents)}</dd>
            </div>
          )}
          {qrLines.map((r) => (
            <div>
              <dt>
                {choice.qr[r.key]} × {r.key === 'unit' ? `QR code${choice.qr[r.key] > 1 ? 's' : ''} sous verre` : `pack${choice.qr[r.key] > 1 ? 's' : ''} de ${r.size} QR codes sous verre`}
              </dt>
              <dd>{eur(choice.qr[r.key] * cents(r.price))}</dd>
            </div>
          ))}
        </dl>
        <p class="pn-total">
          <span>Total à payer aujourd’hui</span>
          <strong>{eur(todayCents)}</strong>
        </p>
        <p class="pn-then">
          {referralOn
            ? `Votre carte bancaire est demandée pour les mois suivants : le prélèvement de l’abonnement commence le mois prochain, à ${euro(plan.monthly)} par mois. Le mois offert compte dans l’engagement de 12 mois ; ensuite, l’abonnement est résiliable à la fin de n’importe quel mois. Un changement d’offre pendant le mois offert est facturé au prorata du temps restant.`
            : monthly
              ? `Puis ${euro(plan.monthly)} par mois pendant la durée de l’engagement de 12 mois, résiliable ensuite à la fin de n’importe quel mois.`
              : `Puis ${euro(plan.yearly)} par an, à chaque échéance, sauf résiliation avant cette date.`}
        </p>
        <p class="pn-vat">Prix sans TVA (art. 293 B du CGI) : le prix affiché est le prix payé.</p>
        {!monthly && referral.trim() && <p class="pn-then">Le parrainage s’applique au paiement mensuel : il n’est pas appliqué en paiement annuel.</p>}
        {formErr && (
          <div class="pn-alert" role="alert">
            <p>{formErr}</p>
            {exists && session === null && (
              <p>
                <button type="button" class="pn-link" onClick={() => setMode('login')}>
                  Me connecter avec ce compte
                </button>{' '}
                ou écrivez à <a href="mailto:contact@loyna.fr?subject=Nouveau%20lien%20de%20connexion%20LOYNA">contact@loyna.fr</a> pour recevoir un nouveau mot de passe.
              </p>
            )}
          </div>
        )}
        {fallback ? (
          <div class="pn-fallback" id="pn-fallback" tabIndex={-1} role="status">
            <p>
              <strong>Votre compte LOYNA ({fallback.email}) est prêt.</strong> Le paiement se fait sur la page sécurisée Stripe de l’offre {plan.name} :{' '}
              {qrCount > 0 ? <strong>vous choisirez vos QR codes sous verre sur la page de paiement.</strong> : 'vous pourrez y ajouter des QR codes sous verre.'}
              {monthly && offer ? ` Le code ${LAUNCH_OFFER.code} y est déjà saisi : la mise en service est offerte.` : ''}
            </p>
            {fallback.referralLost && (
              <p>
                <strong>Le code de parrainage ne peut pas s’appliquer sur cette page de paiement.</strong> Écrivez-nous à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a> avant de payer.
              </p>
            )}
            {fallback.warning && <p>L’e-mail de confirmation de votre adresse n’a pas pu partir : nous vous l’enverrons. En cas de besoin, écrivez à contact@loyna.fr.</p>}
            <a class="btn btn--gold btn--block" href={fallback.url} rel="nofollow">
              Continuer vers le paiement sécurisé
            </a>
          </div>
        ) : (
          <button type="submit" class={`btn btn--gold btn--block ${busy ? 'is-loading' : ''}`} disabled={busy || session === undefined} aria-busy={busy || undefined}>
            {busy ? 'Préparation de la page sécurisée…' : todayCents === 0 ? 'Continuer vers la page sécurisée' : 'Continuer vers le paiement sécurisé'}
          </button>
        )}
        <p class="pn-muted pn-small">
          {todayCents === 0 ? 'Carte bancaire à saisir sur la page sécurisée de Stripe' : 'Paiement par carte bancaire sur la page sécurisée de Stripe'}, au nom de KOVA Elec (LOYNA, une marque de KOVA Elec). Factures et abonnement se gèrent ensuite depuis votre espace client.
        </p>
      </aside>
    </form>
  );
}
