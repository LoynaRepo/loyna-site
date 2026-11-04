// Essai gratuit depuis le site (/essai/, décision d'Ewan du 2026-10-31) : 1 mois de Starter, sans carte bancaire, 1 par commerce.
// La carte reprend le configurateur (brouillon « loyna-config », logo gardé dans l'onglet), une carte préparée dans le panel
// (?carte=<id>) ou les réglages du lien ; le SIRET se retrouve par une recherche sur l'API publique des entreprises, appelée d'ici.
// Le serveur (Edge Function trial, dépôt LOYNA) contrôle tout : champ piège, limites, SIRET, 1 essai par SIRET, e-mail et téléphone,
// plafond d'essais. Rien n'est créé avant la confirmation de l'adresse e-mail.
// `TRIAL.open` faux (site construit sans l'essai) ou `GET trial` fermé ou complet : l'abonnement et « Recevoir un aperçu ».
import {useEffect, useRef, useState} from 'preact/hooks';
import {ACTIVITES_EN_PLUS, CARD_ACCENTS, CARD_ACTIVITES, CARD_BGS, CGV_VERSION, PHRASES, TRIAL} from '../data/site';
import {ApiError, publicEdge} from './http';
import {frenchTypography} from './typo';
import {couleurVisible, LOGO_ACCEPT, LOGO_MIN_SIDE, logoToFiles, partLogoConfondue} from './logo-png';
import {contrast} from './util';
import {CarteWallet, TelephoneWallet} from '../lib/CarteWallet';
import {lireCartePreparee, MONTANT, RE_ID_CARTE} from '../lib/carte-preparee';
import {CLE_LOGO, EMAIL_RE, REFERRAL_ERRORS, RULES, TELEPHONE_RE, chercherEtablissements, lireLogoGarde, normalizeReferral, siretValide, store, track, urlLogo, type Etablissement, type LogoGarde} from '../lib/compte-regles';

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
  TRIAL_ALREADY_USED: 'Un essai a déjà eu lieu ou attend sa confirmation pour ce commerce, cette adresse e-mail ou ce numéro de téléphone : c’est 1 essai par commerce. Vous pouvez choisir votre offre. Ce n’est pas vous ? Écrivez à contact@loyna.fr.',
  SIRET_INVALID: 'Ce numéro de SIRET n’existe pas. Vérifiez-le, ou retrouvez-le avec la recherche ci-dessous.',
  SIRET_CLOSED: 'Cet établissement est indiqué comme fermé au répertoire des entreprises. Vérifiez le numéro, ou écrivez à contact@loyna.fr.',
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

export default function Essai() {
  const racine = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<Etat>(TRIAL.open ? 'attente' : 'ferme');
  const [raison, setRaison] = useState<Raison>('CLOSED');
  const depart = useRef(carteDeDepart());
  const [carte, setCarte] = useState<Carte>(depart.current.carte);
  const touche = useRef<Touche>(depart.current.touche);
  const [logo, setLogo] = useState<LogoGarde | null>(lireLogoGarde);
  const [logoMsg, setLogoMsg] = useState('');
  const [logoPeuVisible, setLogoPeuVisible] = useState(false);
  // Fichier choisi ici et son fond retiré ou non : permet de revenir au fond d'origine
  const [logoFichier, setLogoFichier] = useState<{fichier: File; fondRetire: boolean; fondGarde: boolean} | null>(null);
  const [systeme, setSysteme] = useState<'apple' | 'google'>('apple');
  const [preparee, setPreparee] = useState(false);
  const [siret, setSiret] = useState('');
  const [cherche, setCherche] = useState('');
  const [resultats, setResultats] = useState<Etablissement[] | null>(null);
  const [recherche, setRecherche] = useState<'' | 'encours' | 'panne'>('');
  const [f, setF] = useState({first_name: '', last_name: '', email: '', phone: ''});
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [cgv, setCgv] = useState(false);
  const [website, setWebsite] = useState(''); // champ piège
  const [referral, setReferral] = useState(() => (new URLSearchParams(location.search).get('parrain') ?? '').trim().slice(0, 20));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<{code: string; message: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const envoye = useRef(false);

  useEffect(() => (racine.current ? frenchTypography(racine.current) : undefined), [etat]);
  // Après l'envoi, le formulaire laisse place à un écran bien plus court : il vient sous les yeux, et le focus aussi
  useEffect(() => {
    if (!envoye.current || etat === 'ouvert') return;
    racine.current?.scrollIntoView({block: 'center'});
    racine.current?.focus({preventScroll: true});
  }, [etat]);

  // Logo, ou une bonne partie de ses tracés (texte foncé d'un logo dont le fond a été retiré), de la même teinte que la carte : autant le dire
  useEffect(() => {
    const src = urlLogo(logo);
    if (!src) return setLogoPeuVisible(false);
    let actif = true;
    Promise.all([couleurVisible(src), partLogoConfondue(src, carte.bg)]).then(
      ([c, part]) => actif && setLogoPeuVisible(!c || contrast(c, carte.bg) < 1.35 || part > 0.15),
      () => actif && setLogoPeuVisible(false),
    );
    return () => {
      actif = false;
    };
  }, [logo, carte.bg]);

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
    setLogoMsg('');
  }
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
  const preparerLogo = async (fichier: File, garderFond: boolean) => {
    setLogoMsg('Préparation du logo…');
    try {
      const fichiers = await logoToFiles(fichier, {garderFond});
      garderLogo(fichiers, fichier.name);
      setLogoFichier({fichier, fondRetire: fichiers.fond_retire, fondGarde: garderFond});
      if (Math.max(fichiers.width, fichiers.height) < LOGO_MIN_SIDE / 2) setLogoMsg('Logo accepté, mais petit : il peut paraître flou sur la carte. Une image plus grande sera plus nette.');
    } catch (err) {
      setLogoMsg(err instanceof Error ? err.message : 'Cette image est illisible.');
    }
  };
  const choisirLogo = (e: Event) => {
    const fichier = (e.target as HTMLInputElement).files?.[0];
    if (fichier) preparerLogo(fichier, false);
  };
  const retirerLogo = () => {
    store('session', CLE_LOGO, null);
    setLogo(null);
    setLogoFichier(null);
    setLogoMsg('');
  };
  const setField = (k: keyof typeof f, v: string) => {
    setF((x) => ({...x, [k]: v}));
    if (errors[k]) setErrors((e) => ({...e, [k]: ''}));
  };

  // Recherche du SIRET : nom et ville, ou numéro de SIREN ; seuls les établissements ouverts sont proposés
  const lancerRecherche = async () => {
    const texte = (cherche || carte.name).trim();
    if (texte.length < 3) return setRecherche('');
    setCherche(texte);
    setRecherche('encours');
    setResultats(null);
    try {
      setResultats(await chercherEtablissements(texte));
      setRecherche('');
    } catch {
      setRecherche('panne');
    }
  };
  const choisirEtablissement = (e: Etablissement) => {
    setSiret(e.siret);
    setResultats(null);
    if (errors.siret) setErrors((x) => ({...x, siret: ''}));
    setTimeout(() => document.getElementById('es-siret')?.focus(), 0);
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!carte.name.trim()) e.name = 'Indiquez le nom de votre commerce.';
    else if (!RE_NOM_LISIBLE.test(carte.name)) e.name = 'Indiquez un nom avec au moins une lettre de notre alphabet ou un chiffre : il s’affiche sur la carte.';
    if (!activiteCarte(carte)) e.activity = 'Indiquez votre activité.';
    if (!carte.reward.trim()) e.reward = 'Indiquez la récompense de vos clients.';
    if (!siretValide(siret)) e.siret = 'Indiquez les 14 chiffres de votre SIRET : la recherche ci-dessous peut vous aider.';
    if (!f.first_name.trim()) e.first_name = 'Indiquez votre prénom.';
    if (!f.last_name.trim()) e.last_name = 'Indiquez votre nom.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Indiquez une adresse e-mail valide.';
    if (!TELEPHONE_RE.test(f.phone.trim())) e.phone = 'Indiquez un numéro de téléphone valide.';
    if (!RULES.every((r) => r.test(pw))) e.password = 'Le mot de passe ne respecte pas encore toutes les règles.';
    else if (pw !== pw2) e.password2 = 'Les deux mots de passe sont différents.';
    if (referral.trim() && !normalizeReferral(referral)) e.referral = 'Code de parrainage inconnu ou expiré.';
    if (!cgv) e.cgv = 'Acceptez les conditions générales de vente pour continuer.';
    return e;
  };
  const focusFirstError = (e: Record<string, string>) => {
    const first = ['name', 'activity', 'reward', 'siret', 'first_name', 'last_name', 'email', 'phone', 'password', 'password2', 'referral', 'cgv'].find((k) => e[k]);
    if (first) setTimeout(() => (document.getElementById(`es-${first}`) as HTMLElement | null)?.focus(), 0);
  };

  const submit = async (ev: Event) => {
    ev.preventDefault();
    if (busy) return;
    setFormErr(null);
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return focusFirstError(e);
    setBusy(true);
    envoye.current = true;
    const code = referral.trim() ? normalizeReferral(referral) : null;
    const body = {
      action: 'start',
      account: {email: f.email.trim().toLowerCase(), password: pw, first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone.trim()},
      business: {name: carte.name.trim(), activity: activiteCarte(carte), siret: siret.replace(/\s/g, '')},
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
      if (c === 'TRIAL_CLOSED' || c === 'TRIAL_FULL') {
        setRaison(c === 'TRIAL_FULL' ? 'FULL' : 'CLOSED');
        setEtat('ferme');
      } else if (c === 'SIRET_INVALID' || c === 'SIRET_CLOSED') {
        setErrors({siret: message});
        focusFirstError({siret: message});
      } else if (REFERRAL_ERRORS.has(c)) {
        setErrors({referral: message});
        focusFirstError({referral: message});
      } else if (c === 'WEAK_PASSWORD') {
        setErrors({password: message});
        focusFirstError({password: message});
      } else if (c === 'INVALID_PHONE') {
        setErrors({phone: message});
        focusFirstError({phone: message});
      } else if (c === 'INVALID_EMAIL') {
        setErrors({email: message});
        focusFirstError({email: message});
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
            L’e-mail de confirmation n’a pas pu partir. Écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a> depuis l’adresse <strong>{f.email.trim()}</strong> : nous vous l’enverrons.
          </p>
        ) : (
          <>
            <p>
              Nous venons d’envoyer un lien à <strong>{f.email.trim()}</strong>. Ouvrez-le pour confirmer votre adresse : votre carte <strong>{nomAffiche}</strong> est créée à ce moment-là, et votre mois d’essai commence.
            </p>
            <p class="pn-muted">Pensez à regarder dans les courriers indésirables. Sans confirmation sous 7 jours, la demande est supprimée.</p>
          </>
        )}
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

  // --- Formulaire ---------------------------------------------------------------------------------------------------------------
  return (
    <div ref={racine}>
      <form class="pn" onSubmit={submit} noValidate>
        <div class="pn-steps">
          {/* --- 1. La carte --------------------------------------------------------------------------- */}
          <fieldset class="pn-step">
            <legend>
              <span class="pn-num">1</span> Votre carte
            </legend>
            <div class="pn-fields">
              {preparee && <p class="pn-intro">Votre carte est préparée : vérifiez ses réglages, il reste à créer votre compte.</p>}
              <div class="es-mini" aria-hidden="true">
                <CarteWallet {...propsCarte} />
              </div>
              <div class="pn-row">
                <div class="field">
                  <label for="es-name">Nom du commerce *</label>
                  <input
                    id="es-name"
                    type="text"
                    autocomplete="organization"
                    maxLength={60}
                    required
                    value={carte.name}
                    onInput={(e) => changer({name: (e.target as HTMLInputElement).value}, 'name')}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? 'es-name-err' : undefined}
                  />
                  {err('name')}
                </div>
                <div class="field">
                  <label for="es-activity">Activité *</label>
                  <select
                    id="es-activity"
                    required
                    value={carte.activity}
                    onChange={(e) => choisirActivite((e.target as HTMLSelectElement).value)}
                    aria-invalid={errors.activity ? true : undefined}
                    aria-describedby={errors.activity ? 'es-activity-err' : undefined}
                  >
                    <option value="">Choisissez…</option>
                    {CARD_ACTIVITES.map((a) => (
                      <option value={a.nom}>{a.nom}</option>
                    ))}
                  </select>
                  {carte.activity === AUTRE && (
                    <input
                      id="es-activity-autre"
                      class="es-autre"
                      type="text"
                      maxLength={40}
                      placeholder={`Votre activité : ${ACTIVITES_EN_PLUS[0].nom.toLowerCase()}, tatoueur…`}
                      aria-label="Votre activité"
                      value={carte.other}
                      onInput={(e) => changer({other: (e.target as HTMLInputElement).value}, 'activity')}
                    />
                  )}
                  {err('activity')}
                </div>
              </div>
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
              <div class="pn-period es-mode" role="radiogroup" aria-label="Ce que compte la carte">
                {([false, true] as const).map((euros) => (
                  <label class={!!carte.montant === euros ? 'on' : ''}>
                    <input type="radio" name="es-mode" checked={!!carte.montant === euros} onChange={() => changer({montant: euros ? (carte.montant ?? MONTANT.defaut) : null})} />
                    {euros ? 'Au montant dépensé' : 'Au passage'}
                  </label>
                ))}
              </div>
              <div class="pn-row">
                {carte.montant ? (
                  <div class="field">
                    <label for="es-montant">Montant dépensé pour la récompense : {carte.montant} €</label>
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
                    <label for="es-total">Passages pour la récompense : {carte.total}</label>
                    <input id="es-total" class="es-curseur" style={`--p:${((carte.total - PASSAGES.min) / (PASSAGES.max - PASSAGES.min)) * 100}%`} type="range" min={PASSAGES.min} max={PASSAGES.max} value={carte.total} onInput={(e) => changer({total: Number((e.target as HTMLInputElement).value)})} />
                  </div>
                )}
                <div class="field">
                  <label for="es-reward">Récompense *</label>
                  <input
                    id="es-reward"
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
              </div>
              <div class="field">
                <span class="es-label">
                  Votre logo <span class="pn-opt">(facultatif ; sans logo, votre nom sur iPhone et son initiale sur Android)</span>
                </span>
                <div class="es-logo">
                  <label class="btn btn--ghost es-logo-b">
                    <input type="file" accept={LOGO_ACCEPT} onChange={choisirLogo} />
                    Choisir une image
                  </label>
                  {logo ? (
                    <span class="pn-small">
                      {logo.nom}{' '}
                      <button type="button" class="pn-link" onClick={retirerLogo}>
                        Retirer
                      </button>
                    </span>
                  ) : (
                    <span class="pn-muted pn-small">{logoMsg || 'PNG, JPG, WEBP ou SVG'}</span>
                  )}
                </div>
                {logo && logoMsg && <p class="pn-muted pn-small">{logoMsg}</p>}
                {logo && logoFichier && (logoFichier.fondRetire || logoFichier.fondGarde) && (
                  <p class="pn-muted pn-small es-logo-fond">
                    {logoFichier.fondGarde ? 'Fond d’origine gardé. ' : 'Le fond de votre logo a été retiré : vérifiez le résultat sur l’aperçu. '}
                    <button type="button" class="pn-link" onClick={() => preparerLogo(logoFichier.fichier, !logoFichier.fondGarde)}>
                      {logoFichier.fondGarde ? 'Retirer le fond' : 'Garder le fond d’origine'}
                    </button>
                  </p>
                )}
                {logo && logoPeuVisible && (
                  <p class="pn-small es-logo-alerte" role="status">
                    Votre logo se voit peu sur cette couleur de carte : choisissez une autre couleur ou une version plus contrastée du logo.
                  </p>
                )}
              </div>
            </div>
          </fieldset>

          {/* --- 2. Le commerce ------------------------------------------------------------------------ */}
          <fieldset class="pn-step">
            <legend>
              <span class="pn-num">2</span> Votre SIRET
            </legend>
            <p class="pn-intro">1 essai par commerce : le numéro de SIRET de votre établissement sert à le vérifier.</p>
            <div class="field">
              <label for="es-siret">Numéro de SIRET *</label>
              <input
                id="es-siret"
                type="text"
                inputMode="numeric"
                autocomplete="off"
                maxLength={20}
                required
                value={siret}
                onInput={(e) => {
                  setSiret((e.target as HTMLInputElement).value);
                  if (errors.siret) setErrors((x) => ({...x, siret: ''}));
                }}
                aria-invalid={errors.siret ? true : undefined}
                aria-describedby={errors.siret ? 'es-siret-err' : undefined}
              />
              {err('siret')}
            </div>
            <div class="es-cherche">
              <label for="es-cherche">Vous ne l’avez pas sous la main ? Cherchez votre commerce par son nom et sa ville</label>
              <div class="es-cherche-l">
                <input
                  id="es-cherche"
                  type="search"
                  autocomplete="off"
                  maxLength={100}
                  placeholder="Ex. : Le Fournil d’Albane Montpellier"
                  value={cherche}
                  onInput={(e) => setCherche((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      lancerRecherche();
                    }
                  }}
                />
                <button type="button" class="btn btn--ghost" onClick={lancerRecherche} disabled={recherche === 'encours'}>
                  Chercher
                </button>
              </div>
              <div aria-live="polite">
                {recherche === 'encours' && <p class="pn-muted pn-small">Recherche en cours…</p>}
                {recherche === 'panne' && (
                  <p class="pn-muted pn-small">
                    La recherche ne répond pas. Votre SIRET figure sur vos factures et sur{' '}
                    <a href="https://annuaire-entreprises.data.gouv.fr/" target="_blank" rel="noopener">
                      annuaire-entreprises.data.gouv.fr
                    </a>
                    .
                  </p>
                )}
                {resultats?.length === 0 && <p class="pn-muted pn-small">Aucun établissement ouvert ne correspond. Essayez avec le nom officiel de votre entreprise, ou le nom du dirigeant.</p>}
                {!!resultats?.length && (
                  <ul class="es-resultats">
                    {resultats.map((r) => (
                      <li>
                        <button type="button" onClick={() => choisirEtablissement(r)}>
                          <strong>{r.nom}</strong>
                          <span>{r.adresse}</span>
                          <small>SIRET {r.siret}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </fieldset>

          {/* --- 3. Le compte -------------------------------------------------------------------------- */}
          <fieldset class="pn-step">
            <legend>
              <span class="pn-num">3</span> Votre compte LOYNA
            </legend>
            <p class="pn-intro">Ce compte vous donne accès à votre espace client. Vous recevez un e-mail pour confirmer votre adresse : votre carte est créée à ce moment-là.</p>
            <div class="pn-fields">
              <div class="pn-row">
                <div class="field">
                  <label for="es-first_name">Prénom *</label>
                  <input type="text" autocomplete="given-name" maxLength={60} required {...fieldProps('first_name')} />
                  {err('first_name')}
                </div>
                <div class="field">
                  <label for="es-last_name">Nom *</label>
                  <input type="text" autocomplete="family-name" maxLength={80} required {...fieldProps('last_name')} />
                  {err('last_name')}
                </div>
              </div>
              <div class="pn-row">
                <div class="field">
                  <label for="es-email">E-mail *</label>
                  <input type="email" autocomplete="email" inputMode="email" maxLength={254} required {...fieldProps('email')} />
                  {err('email')}
                </div>
                <div class="field">
                  <label for="es-phone">Téléphone *</label>
                  <input type="tel" autocomplete="tel" maxLength={30} required {...fieldProps('phone')} />
                  {err('phone')}
                </div>
              </div>
              <div class="pn-row">
                <div class="field">
                  <label for="es-password">Mot de passe *</label>
                  <span class="pn-pw">
                    <input
                      id="es-password"
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
                      aria-describedby={`es-pw-rules${errors.password ? ' es-password-err' : ''}`}
                    />
                    <button type="button" class="pn-eye" onClick={() => setShowPw(!showPw)} aria-pressed={showPw}>
                      {showPw ? 'Masquer' : 'Afficher'}
                    </button>
                  </span>
                  {err('password')}
                </div>
                <div class="field">
                  <label for="es-password2">Confirmez le mot de passe *</label>
                  <input
                    id="es-password2"
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
                    aria-describedby={errors.password2 ? 'es-password2-err' : undefined}
                  />
                  {err('password2')}
                </div>
              </div>
              <ul class="pn-rules" id="es-pw-rules" aria-label="Règles du mot de passe">
                {RULES.map((r) => (
                  <li class={r.test(pw) ? 'ok' : ''}>
                    <span aria-hidden="true">{r.test(pw) ? '✓' : '•'}</span> {r.label}
                    <span class="sr-only">{r.test(pw) ? ' : respectée' : ' : à respecter'}</span>
                  </li>
                ))}
              </ul>
              <p class="pn-muted">
                Déjà un compte, sans commerce ? Indiquez son adresse et son mot de passe. Mot de passe oublié ?{' '}
                <a href="/espace-client/?oubli=1" target="_blank" rel="noopener">
                  Recevoir un lien
                </a>
              </p>
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
                    </a>{' '}
                    *
                  </span>
                </label>
                {err('cgv')}
                <p class="pn-muted pn-small">
                  Vos coordonnées servent à créer votre compte et à vous contacter au sujet de votre essai ; elles ne sont jamais vendues ni louées. Voir notre{' '}
                  <a href="/confidentialite/" target="_blank" rel="noopener">
                    politique de confidentialité
                  </a>
                  .
                </p>
              </div>
            </div>
            <div class="pn-hp" aria-hidden="true">
              <label for="es-website">Ne pas remplir</label>
              <input id="es-website" name="website" type="text" tabIndex={-1} autocomplete="off" value={website} onInput={(e) => setWebsite((e.target as HTMLInputElement).value)} />
            </div>
          </fieldset>
        </div>

        {/* --- Aperçu et envoi --------------------------------------------------------------------------- */}
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
          <button type="submit" class={`btn btn--gold btn--block ${busy ? 'is-loading' : ''}`} disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Envoi en cours…' : 'Essayer 1 mois gratuitement'}
          </button>
          <p class="pn-muted pn-small">Vous pourrez choisir votre offre à tout moment depuis votre espace client.</p>
        </aside>
      </form>
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
