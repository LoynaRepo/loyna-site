// Essai gratuit depuis le site (/essai/, décision d'Ewan du 2026-10-31) : 1 mois de Starter, sans carte bancaire, 1 par personne.
// La carte reprend le configurateur (brouillon « loyna-config », logo gardé dans l'onglet), une carte préparée dans le panel
// (?carte=<id>) ou les réglages du lien. Carte préparée : seulement le compte, puis l'aperçu et « Démarrer » (Ewan, 2026-11-05).
// Plus de SIRET (Ewan, 2026-11-05). Le serveur (Edge Function trial, dépôt LOYNA) contrôle tout : champ piège, limites, 1 essai par e-mail et téléphone,
// plafond d'essais. Rien n'est créé avant la confirmation de l'adresse e-mail.
// `TRIAL.open` faux (site construit sans l'essai) ou `GET trial` fermé ou complet : l'abonnement et « Recevoir un aperçu ».
// Funnel (Ewan, 2026-11-07) : une question simple par écran (métier, nom, récompense, coordonnées, mot de passe), pas d'étape logo
// (le logo du configurateur ou d'une carte préparée part quand même ; sinon il se met plus tard dans l'espace client).
import {useEffect, useRef, useState} from 'preact/hooks';
import {ACTIVITES_EN_PLUS, CARD_ACCENTS, CARD_ACTIVITES, CARD_BGS, CGV_VERSION, PHRASES, TRIAL} from '../data/site';
import {ApiError, publicEdge} from './http';
import {frenchTypography} from './typo';
import {logoToFiles} from './logo-png';
import {CarteWallet, TelephoneWallet} from '../lib/CarteWallet';
import {lireCartePreparee, MONTANT, RE_ID_CARTE} from '../lib/carte-preparee';
import {CLE_LOGO, EMAIL_RE, REFERRAL_ERRORS, TELEPHONE_RE, lireLogoGarde, normalizeReferral, store, track, urlLogo, type LogoGarde} from '../lib/compte-regles';

type Etat = 'attente' | 'ouvert' | 'ferme' | 'confirmer' | 'active';
type Raison = 'CLOSED' | 'FULL' | 'RESEAU';
interface Ouverture {
  open: boolean;
  reason?: 'CLOSED' | 'FULL';
}
type Reponse = {status: 'CONFIRM_EMAIL'; confirmation_sent?: boolean} | {status: 'ACTIVATED'; merchant_id: string; slug: string; join_url: string; trial_ends_at: string};

const AUTRE = 'Autre';
const PASSAGES = {min: 4, max: 15};
const PARRAIN_KEY = 'loyna-essai-parrain'; // lu par le panier à la souscription (src/app/Panier.tsx, même nom)
const RE_COULEUR = /^#[0-9a-f]{6}$/i;
const RE_NOM_LISIBLE = /[\p{Script=Latin}\p{N}]/u; // même règle que le serveur : sans cela, un « ? » sur la carte
const NOMS_PAR_DEFAUT = ['Maison Lumière', 'Votre commerce']; // valeurs de départ du configurateur : pas le nom d'un vrai commerce
const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris'});
const simplifier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const modele = (nom: string) => CARD_ACTIVITES.find((a) => simplifier(a.nom) === simplifier(nom));
const borner = (n: number) => Math.min(PASSAGES.max, Math.max(PASSAGES.min, Math.round(n) || 10));
const bornerMontant = (n: number) => Math.min(MONTANT.max, Math.max(MONTANT.min, Math.round(n) || MONTANT.defaut));

// Réponses du serveur : texte d'ici pour les cas prévus, le champ concerné quand il y en a un.
const MESSAGES: Record<string, string> = {
  INVALID_PHONE: 'Indiquez un numéro de téléphone valide.',
  TRIAL_ALREADY_USED: 'Un essai a déjà eu lieu ou attend sa confirmation pour cette adresse e-mail ou ce numéro de téléphone : c’est 1 essai par personne. Vous pouvez choisir votre offre. Ce n’est pas vous ? Écrivez à contact@loyna.fr.',
  ACCOUNT_EXISTS: 'Un compte LOYNA existe déjà avec cette adresse : indiquez son mot de passe, ou demandez-en un nouveau.',
  ACCOUNT_HAS_MERCHANT: 'Ce compte a déjà un commerce ou un abonnement. Ouvrez votre espace client pour choisir votre offre.',
  RATE_LIMITED: 'Trop de demandes en peu de temps : réessayez dans une heure.',
};

interface Carte {
  name: string;
  activity: string; // nom de la liste, ou AUTRE
  other: string; // activité libre, si AUTRE
  bg: string;
  accent: string;
  total: number;
  /** Carte au montant dépensé (2026-11-04) : euros à dépenser pour la récompense ; null : carte aux passages (`total`). */
  montant: number | null;
  reward: string;
}
type Touche = {reward: boolean; bg: boolean; accent: boolean};

/** Carte de départ : brouillon du configurateur, puis réglages du lien (mêmes noms que /creer-ma-carte/). */
function carteDeDepart(): {carte: Carte; touche: Touche} {
  const carte: Carte = {name: '', activity: '', other: '', bg: '#1f1c17', accent: '#d9b27a', total: 10, montant: null, reward: ''};
  const touche: Touche = {reward: false, bg: false, accent: false};
  const reprendre = (activite: string) => {
    if (!activite || activite === 'Votre activité') return;
    const m = modele(activite);
    carte.activity = m ? m.nom : AUTRE;
    carte.other = m ? '' : activite.slice(0, 40);
  };
  try {
    const d = JSON.parse(store('local', 'loyna-config') || 'null');
    if (d) {
      if (d.name && !NOMS_PAR_DEFAUT.includes(d.name)) carte.name = String(d.name).slice(0, 60);
      reprendre(String(d.activity ?? ''));
      if (RE_COULEUR.test(d.bg)) carte.bg = d.bg;
      if (RE_COULEUR.test(d.accent)) carte.accent = d.accent;
      if (d.total) carte.total = borner(Number(d.total));
      if (d.reward) carte.reward = String(d.reward).slice(0, 40);
      Object.assign(touche, {reward: !!d.touche?.reward, bg: !!d.touche?.bg, accent: !!d.touche?.accent});
    }
  } catch {
    /* brouillon illisible : on repart de zéro */
  }
  const q = new URLSearchParams(location.search);
  const hexa = (v: string | null) => {
    const h = (v || '').trim().replace(/^#/, '').toLowerCase();
    return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : '';
  };
  const nom = (q.get('nom') || '').trim();
  if (nom) carte.name = nom.slice(0, 60);
  const activite = (q.get('activite') || '').trim();
  if (activite) {
    reprendre(activite);
    Object.assign(touche, {reward: false, bg: false, accent: false});
  }
  const m = modele(carte.activity === AUTRE ? '' : carte.activity);
  if (m && !touche.reward && !carte.reward) carte.reward = m.recompense;
  if (m && activite) Object.assign(carte, {reward: m.recompense, bg: m.fond, accent: m.tampons});
  const recompense = (q.get('recompense') || '').trim();
  if (recompense) {
    carte.reward = recompense.slice(0, 40);
    touche.reward = true;
  }
  if (hexa(q.get('fond'))) {
    carte.bg = hexa(q.get('fond'));
    touche.bg = true;
  }
  if (hexa(q.get('tampons'))) {
    carte.accent = hexa(q.get('tampons'));
    touche.accent = true;
  }
  const passages = Number(q.get('passages'));
  if (passages) carte.total = borner(passages);
  const montant = Number(q.get('montant'));
  if (montant) carte.montant = bornerMontant(montant);
  return {carte, touche};
}

function idCarteDuLien(): string | null {
  const id = new URLSearchParams(location.search).get('carte');
  return id && RE_ID_CARTE.test(id) ? id : null;
}

/** Image d'une carte préparée (data:image/png;base64,…) rendue sous forme de fichier, pour passer par logoToFiles comme un logo choisi. */
function fichierDepuisDataUrl(dataUrl: string): File {
  const [entete, donnees] = dataUrl.split(',');
  const octets = Uint8Array.from(atob(donnees), (c) => c.charCodeAt(0));
  return new File([octets], 'logo.png', {type: /image\/[a-z+]+/.exec(entete)?.[0] ?? 'image/png'});
}

// Écrans du funnel et champs qu'ils contrôlent : une erreur du serveur ramène à l'écran de son champ.
type Ecran = 'activite' | 'nom' | 'recompense' | 'contact';
const CHAMPS: Record<Ecran, string[]> = {
  activite: ['activity'],
  nom: ['name'],
  recompense: ['reward'],
  contact: ['first_name', 'last_name', 'email', 'phone', 'referral', 'cgv'],
};
const ORDRE_CHAMPS = Object.values(CHAMPS).flat();

export default function Essai() {
  const racine = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<Etat>(TRIAL.open ? 'attente' : 'ferme');
  const [raison, setRaison] = useState<Raison>('CLOSED');
  const depart = useRef(carteDeDepart());
  const [carte, setCarte] = useState<Carte>(depart.current.carte);
  const touche = useRef<Touche>(depart.current.touche);
  const [logo, setLogo] = useState<LogoGarde | null>(lireLogoGarde);
  const [systeme, setSysteme] = useState<'apple' | 'google'>('apple');
  const [preparee, setPreparee] = useState(false);
  const [etape, setEtape] = useState(0);
  const [f, setF] = useState({first_name: '', last_name: '', email: '', phone: ''});
  const [cgv, setCgv] = useState(false);
  const [website, setWebsite] = useState(''); // champ piège
  const [referral, setReferral] = useState(() => (new URLSearchParams(location.search).get('parrain') ?? '').trim().slice(0, 20));
  const [voirParrain, setVoirParrain] = useState(() => !!referral);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<{code: string; message: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const envoye = useRef(false);
  const aFocaliser = useRef<string | null>(null);

  // Carte préparée : déjà réglée, il ne reste que le compte
  const ecrans: Ecran[] = preparee ? ['contact'] : ['activite', 'nom', 'recompense', 'contact'];
  const ecran = ecrans[Math.min(etape, ecrans.length - 1)];

  useEffect(() => (racine.current ? frenchTypography(racine.current) : undefined), [etat, ecran]);
  // Après l'envoi, le formulaire laisse place à un écran bien plus court : il vient sous les yeux, et le focus aussi
  useEffect(() => {
    if (!envoye.current || etat === 'ouvert') return;
    racine.current?.scrollIntoView({block: 'center'});
    racine.current?.focus({preventScroll: true});
  }, [etat]);
  // Nouvel écran : le champ en erreur, sinon le premier champ, sinon la question (pas au premier affichage : la page reste en haut)
  const premierAffichage = useRef(true);
  useEffect(() => {
    if (etat !== 'ouvert') return;
    if (premierAffichage.current) {
      premierAffichage.current = false;
      return;
    }
    const cible = aFocaliser.current ? document.getElementById(`es-${aFocaliser.current}`) : racine.current?.querySelector<HTMLElement>('.es-q [data-premier]');
    aFocaliser.current = null;
    const question = racine.current?.querySelector<HTMLElement>('.es-q h2');
    question?.scrollIntoView({block: 'nearest'});
    (cible ?? question)?.focus({preventScroll: true});
  }, [ecran, etat]);

  // L'essai est-il ouvert ? (interrupteur et plafond, côté serveur)
  useEffect(() => {
    if (!TRIAL.open) return;
    let actif = true;
    publicEdge<Ouverture>('trial', {method: 'GET'}).then(
      (o) => {
        if (!actif) return;
        if (o?.open) setEtat('ouvert');
        else {
          setRaison(o?.reason === 'FULL' ? 'FULL' : 'CLOSED');
          setEtat('ferme');
        }
      },
      () => {
        if (!actif) return;
        setRaison('RESEAU');
        setEtat('ferme');
      },
    );
    return () => {
      actif = false;
    };
  }, []);

  // Carte préparée dans le panel commercial : réglages et logo
  useEffect(() => {
    const id = idCarteDuLien();
    if (!id) return;
    let actif = true;
    lireCartePreparee(id)
      .then(async (c) => {
        if (!c || !actif) return;
        const m = modele(c.activite || '');
        touche.current = {reward: true, bg: true, accent: true};
        setCarte({
          name: c.nom.slice(0, 60),
          activity: m ? m.nom : c.activite ? AUTRE : '',
          other: m ? '' : (c.activite || '').slice(0, 40),
          bg: RE_COULEUR.test(c.fond) ? c.fond : '#1f1c17',
          accent: RE_COULEUR.test(c.tampons) ? c.tampons : '#d9b27a',
          total: borner(c.passages),
          montant: c.montant ? bornerMontant(c.montant) : null,
          reward: c.recompense.slice(0, 40),
        });
        setPreparee(true);
        setEtape(0);
        if (c.logo) {
          const fichier = fichierDepuisDataUrl(c.logo);
          garderLogo(await logoToFiles(fichier), 'Logo préparé avec vous');
        } else {
          // Carte sans logo : pas celui d'une carte ouverte avant dans le même onglet (le commercial en prépare plusieurs à la suite).
          retirerLogo();
        }
      })
      .catch(() => {
        /* carte introuvable ou logo illisible : le formulaire reste utilisable */
      });
    return () => {
      actif = false;
    };
  }, []);

  // La carte suit le brouillon du configurateur : même aperçu en revenant sur /creer-ma-carte/, une fois un nom saisi
  useEffect(() => {
    if (etat !== 'ouvert' || !carte.name.trim()) return;
    try {
      const avant = JSON.parse(store('local', 'loyna-config') || 'null') ?? {};
      store(
        'local',
        'loyna-config',
        JSON.stringify({...avant, name: carte.name || avant.name || 'Votre commerce', activity: activiteCarte(carte) || avant.activity || 'Votre activité', bg: carte.bg, accent: carte.accent, total: carte.total, filled: Math.min(Number(avant.filled ?? 0), carte.total), reward: carte.reward || avant.reward || '', variant: avant.variant || 'apple', touche: touche.current}),
      );
    } catch {
      /* stockage indisponible : sans conséquence */
    }
  }, [carte, etat]);

  function activiteCarte(c: Carte) {
    return c.activity === AUTRE ? c.other.trim() : c.activity;
  }
  function garderLogo(l: {logo_png: string; icon_png: string}, nom: string) {
    const garde: LogoGarde = {logo_png: l.logo_png, icon_png: l.icon_png, nom};
    store('session', CLE_LOGO, JSON.stringify(garde));
    setLogo(garde);
  }
  const retirerLogo = () => {
    store('session', CLE_LOGO, null);
    setLogo(null);
  };
  const changer = (patch: Partial<Carte>, cle?: string) => {
    setCarte((c) => ({...c, ...patch}));
    if (cle && errors[cle]) setErrors((e) => ({...e, [cle]: ''}));
  };
  // Changer d'activité : le modèle du métier, sauf ce que le visiteur a déjà modifié
  const choisirActivite = (nom: string) => {
    const m = modele(nom);
    const patch: Partial<Carte> = {activity: nom};
    if (m && !touche.current.reward) patch.reward = m.recompense;
    if (m && !touche.current.bg) patch.bg = m.fond;
    if (m && !touche.current.accent) patch.accent = m.tampons;
    changer(patch, 'activity');
  };
  const setField = (k: keyof typeof f, v: string) => {
    setF((x) => ({...x, [k]: v}));
    if (errors[k]) setErrors((e) => ({...e, [k]: ''}));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!carte.name.trim()) e.name = 'Indiquez le nom de votre commerce.';
    else if (!RE_NOM_LISIBLE.test(carte.name)) e.name = 'Indiquez un nom avec au moins une lettre de notre alphabet ou un chiffre : il s’affiche sur la carte.';
    if (!activiteCarte(carte)) e.activity = 'Indiquez votre activité.';
    if (!carte.reward.trim()) e.reward = 'Indiquez la récompense de vos clients.';
    if (!f.first_name.trim()) e.first_name = 'Indiquez votre prénom.';
    if (!f.last_name.trim()) e.last_name = 'Indiquez votre nom.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Indiquez une adresse e-mail valide.';
    if (!TELEPHONE_RE.test(f.phone.trim())) e.phone = 'Indiquez un numéro de téléphone valide.';
    if (referral.trim() && !normalizeReferral(referral)) e.referral = 'Code de parrainage inconnu ou expiré.';
    if (!cgv) e.cgv = 'Acceptez les conditions générales de vente pour continuer.';
    return e;
  };
  // Ramène à l'écran du premier champ en erreur et y met le focus
  const montrerErreurs = (e: Record<string, string>) => {
    const first = ORDRE_CHAMPS.find((k) => e[k]);
    if (!first) return;
    if (first === 'referral') setVoirParrain(true);
    const i = ecrans.findIndex((x) => CHAMPS[x].includes(first));
    if (i >= 0 && i !== etape) {
      aFocaliser.current = first;
      setEtape(i);
    } else setTimeout(() => document.getElementById(`es-${first}`)?.focus(), 0);
  };

  const retour = () => {
    setFormErr(null);
    setEtape((n) => Math.max(0, n - 1));
  };
  // « Continuer » : seulement les champs de cet écran ; au dernier, tout est revu puis envoyé
  const suivant = (ev?: Event) => {
    ev?.preventDefault();
    if (ecran === 'contact') return submit();
    const tout = validate();
    const e = Object.fromEntries(CHAMPS[ecran].filter((k) => tout[k]).map((k) => [k, tout[k]]));
    setErrors((x) => ({...x, ...Object.fromEntries(CHAMPS[ecran].map((k) => [k, e[k] ?? '']))}));
    if (Object.keys(e).length) return montrerErreurs(e);
    setEtape((n) => Math.min(ecrans.length - 1, n + 1));
  };

  const submit = async () => {
    if (busy) return;
    setFormErr(null);
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return montrerErreurs(e);
    setBusy(true);
    envoye.current = true;
    const code = referral.trim() ? normalizeReferral(referral) : null;
    const body = {
      action: 'start',
      account: {email: f.email.trim().toLowerCase(), first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone.trim()},
      business: {name: carte.name.trim(), activity: activiteCarte(carte)},
      card: carte.montant
        ? {bg: carte.bg, accent: carte.accent, mode: 'SPEND', total: carte.montant, reward: carte.reward.trim()}
        : {bg: carte.bg, accent: carte.accent, total: carte.total, reward: carte.reward.trim()},
      ...(logo ? {logo_png: logo.logo_png, icon_png: logo.icon_png} : {}),
      ...(code ? {referral_code: code} : {}),
      cgv_version: CGV_VERSION,
      website,
    };
    try {
      const r = await publicEdge<Reponse>('trial', {body});
      if (code) store('local', PARRAIN_KEY, code);
      store('session', CLE_LOGO, null);
      track('trial_start', {items: [{item_id: 'starter-essai'}]});
      setReponse(r);
      setEtat(r.status === 'ACTIVATED' ? 'active' : 'confirmer');
    } catch (err) {
      const c = err instanceof ApiError ? err.code : '';
      const message = MESSAGES[c] ?? (err instanceof Error && err.message ? err.message : 'L’opération n’a pas abouti. Réessayez dans un instant.');
      const zone = REFERRAL_ERRORS.has(c) ? 'referral' : {INVALID_PHONE: 'phone', INVALID_EMAIL: 'email'}[c];
      if (c === 'TRIAL_CLOSED' || c === 'TRIAL_FULL') {
        setRaison(c === 'TRIAL_FULL' ? 'FULL' : 'CLOSED');
        setEtat('ferme');
      } else if (zone) {
        setErrors({[zone]: message});
        montrerErreurs({[zone]: message});
      } else setFormErr({code: c, message});
    } finally {
      setBusy(false);
    }
  };

  const fieldProps = (k: keyof typeof f) => ({
    id: `es-${k}`,
    value: f[k],
    onInput: (e: Event) => setField(k, (e.target as HTMLInputElement).value),
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `es-${k}-err` : undefined,
  });
  const err = (k: string) =>
    errors[k] ? (
      <p class="pn-err" id={`es-${k}-err`} role="alert">
        {errors[k]}
      </p>
    ) : null;

  const nomAffiche = carte.name.trim() || 'Votre commerce';
  const propsCarte = {
    nom: nomAffiche,
    activite: activiteCarte(carte),
    recompense: carte.reward.trim() || 'Votre récompense',
    fond: carte.bg,
    tampons: carte.accent,
    passages: carte.total,
    montant: carte.montant,
    obtenus: carte.montant ? Math.round(carte.montant * 0.35) : Math.min(3, carte.total),
    logo: urlLogo(logo),
    systeme,
  };

  if (etat === 'attente')
    return (
      <div class="pn-wait" role="status" ref={racine}>
        Chargement de l’essai…
      </div>
    );

  // --- Essai fermé ou complet : l'abonnement et « Recevoir un aperçu » --------------------------------------------------------
  if (etat === 'ferme')
    return (
      <div class="es-fin" ref={racine} tabIndex={-1}>
        <h2>{raison === 'FULL' ? 'Tous les essais sont pris pour le moment' : raison === 'RESEAU' ? 'L’essai ne répond pas pour le moment' : 'L’essai n’est pas ouvert pour le moment'}</h2>
        <p>Vous pouvez prendre votre abonnement dès maintenant, sans engagement si vous le souhaitez, ou recevoir un aperçu de votre carte : nous vous répondons.</p>
        <div class="btn-row">
          <a class="btn btn--gold" href="/tarifs/?carte=1">
            Choisir mon offre
          </a>
          <a class="btn btn--ghost" href="/creer-ma-carte/#send-preview">
            Recevoir un aperçu
          </a>
        </div>
      </div>
    );

  // --- Demande enregistrée : il reste à confirmer l'adresse e-mail ------------------------------------------------------------
  if (etat === 'confirmer')
    return (
      <div class="es-fin" ref={racine} role="status" tabIndex={-1}>
        <h2>Vérifiez votre boîte mail</h2>
        {reponse?.status === 'CONFIRM_EMAIL' && reponse.confirmation_sent === false ? (
          <p>
            L’e-mail d’activation n’a pas pu partir vers <strong>{f.email.trim()}</strong>. Réessayez avec le bouton ci-dessous, ou écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a> depuis cette adresse : nous vous l’enverrons.
          </p>
        ) : (
          <>
            <p>
              Nous venons d’envoyer un lien à <strong>{f.email.trim()}</strong>. Ouvrez-le et choisissez votre mot de passe : votre carte <strong>{nomAffiche}</strong> est créée à ce moment-là, et votre mois d’essai commence.
            </p>
            <p class="pn-muted">Pas dans votre boîte de réception ? Regardez dans les courriers indésirables (spam) et, sur Gmail, dans l’onglet « Promotions ». Sans activation sous 7 jours, la demande est supprimée.</p>
          </>
        )}
        <Renvoi email={f.email.trim().toLowerCase()} />
      </div>
    );

  // --- Compte existant, mot de passe vérifié : la carte est déjà créée --------------------------------------------------------
  if (etat === 'active' && reponse?.status === 'ACTIVATED')
    return (
      <div class="es-fin" ref={racine} role="status" tabIndex={-1}>
        <h2>Votre carte est prête</h2>
        <p>
          Votre essai court jusqu’au <strong>{dateFr(reponse.trial_ends_at)}</strong>, sans aucun prélèvement à la fin. Votre lien d’inscription, pour vos clients : <a href={reponse.join_url}>{reponse.join_url}</a>
        </p>
        <div class="btn-row">
          <a class="btn btn--gold" href="/espace-client/?bienvenue=1">
            Ouvrir mon espace client
          </a>
        </div>
      </div>
    );

  // --- Funnel : une question par écran -------------------------------------------------------------------------------------------
  const dernier = ecran === 'contact';
  const miniCarte = ecran === 'nom' || ecran === 'recompense' || (preparee && dernier);
  return (
    <div ref={racine} class="es-funnel">
      <div class="es-q">
        {ecrans.length > 1 && (
          <div class="es-prog">
            <div class="es-prog-l">
              {etape > 0 ? (
                <button type="button" class="es-retour" onClick={retour}>
                  <span aria-hidden="true">←</span> Retour
                </button>
              ) : (
                <span />
              )}
              <span class="es-prog-n">
                Étape {etape + 1} sur {ecrans.length}
              </span>
            </div>
            <div class="es-barre" role="progressbar" aria-label="Avancement" aria-valuemin={1} aria-valuemax={ecrans.length} aria-valuenow={etape + 1}>
              <span style={{width: `${((etape + 1) / ecrans.length) * 100}%`}} />
            </div>
          </div>
        )}

        <form class="pn es-form" onSubmit={suivant} noValidate>
          {/* --- Métier : un clic choisit et passe à la suite ---- */}
          {ecran === 'activite' && (
            <>
              <h2 tabIndex={-1}>Quel est votre commerce ?</h2>
              <p class="es-sous">Un clic : on prépare votre carte avec la récompense et les couleurs de votre métier.</p>
              <div class="es-choix" id="es-activity" role="group" aria-label="Votre activité" tabIndex={-1} aria-describedby={errors.activity ? 'es-activity-err' : undefined}>
                {CARD_ACTIVITES.map((a, i) => (
                  <button
                    type="button"
                    data-premier={i === 0 ? true : undefined}
                    aria-pressed={carte.activity === a.nom}
                    onClick={() => {
                      choisirActivite(a.nom);
                      if (a.nom !== AUTRE) setEtape((n) => n + 1);
                      else setTimeout(() => document.getElementById('es-activity-autre')?.focus(), 0);
                    }}
                  >
                    {a.nom}
                  </button>
                ))}
              </div>
              {carte.activity === AUTRE && (
                <div class="field">
                  <label for="es-activity-autre">Votre activité</label>
                  <input
                    id="es-activity-autre"
                    type="text"
                    maxLength={40}
                    placeholder={`${ACTIVITES_EN_PLUS[0].nom}, tatoueur…`}
                    value={carte.other}
                    onInput={(e) => changer({other: (e.target as HTMLInputElement).value}, 'activity')}
                  />
                </div>
              )}
              {err('activity')}
              {carte.activity && (
                <button type="submit" class="btn btn--gold es-go">
                  Continuer
                </button>
              )}
            </>
          )}

          {/* --- Nom ---- */}
          {ecran === 'nom' && (
            <>
              <h2 tabIndex={-1}>Comment s’appelle votre commerce ?</h2>
              <p class="es-sous">Il s’affiche en haut de votre carte.</p>
              <div class="field">
                <label for="es-name" class="sr-only">
                  Nom du commerce
                </label>
                <input
                  id="es-name"
                  data-premier
                  class="es-grand"
                  type="text"
                  autocomplete="organization"
                  maxLength={60}
                  required
                  placeholder="Ex. : Le Fournil de Léa"
                  value={carte.name}
                  onInput={(e) => changer({name: (e.target as HTMLInputElement).value}, 'name')}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? 'es-name-err' : undefined}
                />
                {err('name')}
              </div>
              {miniCarte && <MiniCarte {...propsCarte} />}
              <button type="submit" class="btn btn--gold es-go">
                Continuer
              </button>
            </>
          )}

          {/* --- Récompense, passages, couleurs (déjà proposés selon le métier) ---- */}
          {ecran === 'recompense' && (
            <>
              <h2 tabIndex={-1}>Que gagnent vos clients fidèles ?</h2>
              <p class="es-sous">Nous avons mis ce qui marche le mieux pour votre métier : changez ce que vous voulez.</p>
              <div class="field">
                <label for="es-reward">Récompense</label>
                <input
                  id="es-reward"
                  data-premier
                  type="text"
                  maxLength={40}
                  required
                  value={carte.reward}
                  onInput={(e) => {
                    touche.current.reward = true;
                    changer({reward: (e.target as HTMLInputElement).value}, 'reward');
                  }}
                  aria-invalid={errors.reward ? true : undefined}
                  aria-describedby={errors.reward ? 'es-reward-err' : undefined}
                />
                {err('reward')}
              </div>
              <div class="pn-period es-mode" role="radiogroup" aria-label="Ce que compte la carte">
                {([false, true] as const).map((euros) => (
                  <label class={!!carte.montant === euros ? 'on' : ''}>
                    <input type="radio" name="es-mode" checked={!!carte.montant === euros} onChange={() => changer({montant: euros ? (carte.montant ?? MONTANT.defaut) : null})} />
                    {euros ? 'Au montant dépensé' : 'Au passage'}
                  </label>
                ))}
              </div>
              {carte.montant ? (
                <div class="field">
                  <label for="es-montant">Offerte après {carte.montant} € dépensés</label>
                  <input
                    id="es-montant"
                    class="es-curseur"
                    style={`--p:${((carte.montant - MONTANT.min) / (MONTANT.max - MONTANT.min)) * 100}%`}
                    type="range"
                    min={MONTANT.min}
                    max={MONTANT.max}
                    step={10}
                    value={carte.montant}
                    onInput={(e) => changer({montant: bornerMontant(Number((e.target as HTMLInputElement).value))})}
                  />
                  <small class="es-aide">1 € dépensé = 1 point : vous tapez le montant de l’achat au moment de scanner la carte.</small>
                </div>
              ) : (
                <div class="field">
                  <label for="es-total">Offerte au {carte.total}e passage</label>
                  <input id="es-total" class="es-curseur" style={`--p:${((carte.total - PASSAGES.min) / (PASSAGES.max - PASSAGES.min)) * 100}%`} type="range" min={PASSAGES.min} max={PASSAGES.max} value={carte.total} onInput={(e) => changer({total: Number((e.target as HTMLInputElement).value)})} />
                </div>
              )}
              <details class="es-couleurs">
                <summary>Changer les couleurs</summary>
                <div class="pn-row">
                  <div class="field">
                    <span class="es-label" id="es-lbl-bg">
                      Couleur de la carte
                    </span>
                    <Couleurs
                      etiquette="es-lbl-bg"
                      liste={CARD_BGS}
                      valeur={carte.bg}
                      libre="Couleur de carte personnalisée"
                      choisir={(c) => {
                        touche.current.bg = true;
                        changer({bg: c});
                      }}
                    />
                  </div>
                  <div class="field">
                    <span class="es-label" id="es-lbl-accent">
                      Couleur des tampons
                    </span>
                    <Couleurs
                      etiquette="es-lbl-accent"
                      liste={CARD_ACCENTS}
                      valeur={carte.accent}
                      libre="Couleur des tampons personnalisée"
                      choisir={(c) => {
                        touche.current.accent = true;
                        changer({accent: c});
                      }}
                    />
                  </div>
                </div>
              </details>
              {miniCarte && <MiniCarte {...propsCarte} />}
              <button type="submit" class="btn btn--gold es-go">
                Continuer
              </button>
            </>
          )}

          {/* --- Coordonnées ---- */}
          {ecran === 'contact' && (
            <>
              <h2 tabIndex={-1}>Votre carte est prête. À qui envoie-t-on l’accès ?</h2>
              <p class="es-sous">Vous recevez un e-mail pour choisir votre mot de passe : votre carte est créée à ce moment-là.</p>
              {miniCarte && <MiniCarte {...propsCarte} />}
              <div class="pn-row">
                <div class="field">
                  <label for="es-first_name">Prénom</label>
                  <input type="text" data-premier autocomplete="given-name" maxLength={60} required {...fieldProps('first_name')} />
                  {err('first_name')}
                </div>
                <div class="field">
                  <label for="es-last_name">Nom</label>
                  <input type="text" autocomplete="family-name" maxLength={80} required {...fieldProps('last_name')} />
                  {err('last_name')}
                </div>
              </div>
              <div class="field">
                <label for="es-email">E-mail</label>
                <input type="email" autocomplete="email" inputMode="email" maxLength={254} required {...fieldProps('email')} />
                {err('email')}
              </div>
              <div class="field">
                <label for="es-phone">Téléphone</label>
                <input type="tel" autocomplete="tel" inputMode="tel" maxLength={30} required {...fieldProps('phone')} />
                {err('phone')}
              </div>
              {!preparee &&
                (voirParrain ? (
                  <div class="pn-ref">
                    <label for="es-referral">
                      Code de parrainage <span class="pn-opt">(facultatif)</span>
                    </label>
                    <input
                      id="es-referral"
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
                      aria-describedby={`es-referral-help${errors.referral ? ' es-referral-err' : ''}`}
                    />
                    <p class="pn-muted pn-small" id="es-referral-help">
                      Parrainé par un commerçant client de LOYNA ? Votre premier mois d’abonnement sera offert si vous souscrivez ensuite.
                    </p>
                    {err('referral')}
                  </div>
                ) : (
                  <button type="button" class="pn-link es-parrain" onClick={() => setVoirParrain(true)}>
                    J’ai un code de parrainage
                  </button>
                ))}
              <div class="pn-cgv">
                <label class="pn-check">
                  <input
                    id="es-cgv"
                    type="checkbox"
                    checked={cgv}
                    required
                    onChange={(e) => {
                      setCgv((e.target as HTMLInputElement).checked);
                      if (errors.cgv) setErrors((x) => ({...x, cgv: ''}));
                    }}
                    aria-invalid={errors.cgv ? true : undefined}
                    aria-describedby={errors.cgv ? 'es-cgv-err' : undefined}
                  />
                  <span>
                    J’accepte les{' '}
                    <a href="/cgv/" target="_blank" rel="noopener">
                      conditions générales de vente
                    </a>
                  </span>
                </label>
                {err('cgv')}
                <p class="pn-muted pn-small">1 essai par personne : un nouvel essai demandé par la même personne échoue (article 4.9 des conditions).</p>
                <p class="pn-muted pn-small">
                  Vos coordonnées servent à créer votre compte et à vous contacter au sujet de votre essai ; elles ne sont jamais vendues ni louées. Voir notre{' '}
                  <a href="/confidentialite/" target="_blank" rel="noopener">
                    politique de confidentialité
                  </a>
                  .
                </p>
              </div>
              <div class="pn-hp" aria-hidden="true">
                <label for="es-website">Ne pas remplir</label>
                <input id="es-website" name="website" type="text" tabIndex={-1} autocomplete="off" value={website} onInput={(e) => setWebsite((e.target as HTMLInputElement).value)} />
              </div>
              {formErr && (
                <div class="pn-alert" role="alert">
                  <p>{formErr.message}</p>
                  {formErr.code === 'TRIAL_ALREADY_USED' && (
                    <p>
                      <a href="/tarifs/">Choisir mon offre</a>
                    </p>
                  )}
                  {formErr.code === 'ACCOUNT_EXISTS' && (
                    <p>
                      <a href="/espace-client/?oubli=1" target="_blank" rel="noopener">
                        Recevoir un nouveau mot de passe
                      </a>
                    </p>
                  )}
                  {formErr.code === 'ACCOUNT_HAS_MERCHANT' && (
                    <p>
                      <a href="/espace-client/">Mon espace client</a>
                    </p>
                  )}
                </div>
              )}
              <button type="submit" class={`btn btn--gold es-go es-envoi ${busy ? 'is-loading' : ''}`} disabled={busy} aria-busy={busy || undefined}>
                {busy ? 'Envoi en cours…' : preparee ? 'Démarrer mon essai gratuit' : 'Essayer 1 mois gratuitement'}
              </button>
              <p class="pn-muted pn-small es-fin-note">Sans carte bancaire. À la fin du mois, aucun prélèvement : la carte se met en pause tant que vous n’avez pas choisi votre offre.</p>
            </>
          )}
        </form>
      </div>

      {/* --- Aperçu (ordinateur) ---------------------------------------------------------------------- */}
      <aside class="pn-sum es-sum" aria-labelledby="es-sum-t">
        <h2 id="es-sum-t">Votre carte</h2>
        <div class="es-apercu">
          <TelephoneWallet {...propsCarte} />
          <div class="pn-prep-sys" role="radiogroup" aria-label="Téléphone de l’aperçu">
            <button type="button" role="radio" aria-checked={systeme === 'apple'} class={systeme === 'apple' ? 'on' : ''} onClick={() => setSysteme('apple')}>
              iPhone
            </button>
            <button type="button" role="radio" aria-checked={systeme === 'google'} class={systeme === 'google' ? 'on' : ''} onClick={() => setSysteme('google')}>
              Android
            </button>
          </div>
        </div>
        <p class="pn-then">{PHRASES.essai}</p>
        <p class="pn-then">L’essai donne l’offre Starter complète : la relance et « Plus qu’un passage ! » sont actifs, l’anniversaire et l’avis Google s’activent en un réglage. À la fin, aucun prélèvement : la carte se met en pause tant que vous n’avez pas choisi votre offre.</p>
      </aside>
    </div>
  );
}

const ATTENTE_RENVOI = 60; // secondes entre deux renvois
const MAX_RENVOIS = 3; // comme la limite du serveur (3 par heure par adresse)

/**
 * « Renvoyer le lien par e-mail » (Ewan, 2026-11-07) : trial {action: 'resend'} envoie un lien neuf, à usage unique. Le serveur répond pareil
 * dans tous les cas et borne les renvois ; ici, un compte à rebours de 60 s après chaque envoi et 3 renvois au plus.
 */
function Renvoi({email}: {email: string}) {
  const [envois, setEnvois] = useState(0);
  const [attente, setAttente] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ok: boolean; texte: string} | null>(null);
  useEffect(() => {
    if (attente <= 0) return;
    const t = setTimeout(() => setAttente((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);
  const renvoyer = async () => {
    if (busy || attente > 0 || envois >= MAX_RENVOIS) return;
    setBusy(true);
    setMsg(null);
    try {
      await publicEdge('trial', {body: {action: 'resend', email}});
      setEnvois((n) => n + 1);
      setAttente(ATTENTE_RENVOI);
      setMsg({ok: true, texte: `Nouveau lien envoyé à ${email}. Seul le dernier lien reçu fonctionne.`});
    } catch (err) {
      setMsg({ok: false, texte: err instanceof Error && err.message ? err.message : 'L’envoi n’a pas abouti. Réessayez dans un instant.'});
    } finally {
      setBusy(false);
    }
  };
  const fini = envois >= MAX_RENVOIS;
  return (
    <div class="es-renvoi">
      <button type="button" class={`btn btn--gold es-renvoi-b ${busy ? 'is-loading' : ''}`} onClick={renvoyer} disabled={busy || attente > 0 || fini} aria-busy={busy || undefined}>
        {busy ? 'Envoi en cours…' : attente > 0 ? `Renvoyer le lien (${attente} s)` : 'Renvoyer le lien par e-mail'}
      </button>
      {msg && (
        <p class={msg.ok ? 'es-renvoi-ok' : 'pn-err'} role={msg.ok ? 'status' : 'alert'}>
          {msg.texte}
        </p>
      )}
      {fini && (
        <p class="pn-muted pn-small">
          Toujours rien ? Écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a> : nous activons votre essai avec vous.
        </p>
      )}
      <p class="pn-muted pn-small">
        Mauvaise adresse ? Écrivez à <a href={`mailto:contact@loyna.fr?subject=${encodeURIComponent('Essai LOYNA : mauvaise adresse e-mail')}`}>contact@loyna.fr</a> avec la bonne adresse : nous corrigeons votre demande.
      </p>
    </div>
  );
}

/** Carte seule, dans l'écran : sur téléphone, où l'aperçu complet n'a pas la place. */
function MiniCarte(props: Parameters<typeof CarteWallet>[0]) {
  return (
    <div class="es-mini" aria-hidden="true">
      <CarteWallet {...props} />
    </div>
  );
}

/** Ronds de couleur, avec un dernier rond pour une couleur libre (mêmes couleurs que le configurateur). */
function Couleurs({etiquette, liste, valeur, libre, choisir}: {etiquette: string; liste: {c: string; nom: string}[]; valeur: string; libre: string; choisir: (c: string) => void}) {
  const predefini = liste.some((x) => x.c.toLowerCase() === valeur.toLowerCase());
  return (
    <div class="es-sw" role="group" aria-labelledby={etiquette}>
      {liste.map((x) => (
        <button type="button" class="es-rond" style={{'--c': x.c}} aria-label={x.nom} title={x.nom} aria-pressed={x.c.toLowerCase() === valeur.toLowerCase()} onClick={() => choisir(x.c)} />
      ))}
      <label class={`es-rond es-libre ${predefini ? '' : 'is-picked'}`} style={{'--pick': valeur}} title="Couleur personnalisée">
        <input type="color" value={valeur} aria-label={libre} onInput={(e) => choisir((e.target as HTMLInputElement).value)} />
      </label>
    </div>
  );
}
