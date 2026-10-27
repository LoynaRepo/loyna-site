// Panel commercial privé (loyna.fr/espace-commercial/) : connexion, déchiffrement des données de prospection
// dans le navigateur, puis sept onglets. Aucune donnée de prospect n'est dans le code ni dans le HTML de la page.
import type {ComponentChildren} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {accesMemorise, deriverAcces, ErreurAcces, memoriserAcces, oublierCle, ouvrir, sessionOuverte, telecharger, type Acces} from './crypto';
import {initialiserNotes, notesEtat, oublierNotes, type Note} from './notes';
import {clientsAffiches} from './clients';
import {dateHeure} from './format';
import {Icon} from './icons';
import {aller, donnees, filtres, filtresClients, FILTRES_CLIENTS_VIDES, FILTRES_VIDES, route} from './store';
import type {FaqSite, Suivi} from './types';
import {Btn, Field, Spinner, Toasts} from './ui';
import {Tableau} from './views/Tableau';
import {Prospects} from './views/Prospects';
import {Fiche} from './views/Fiche';
import {Appeler} from './views/Appeler';
import {Tarifs} from './views/Tarifs';
import {Questions} from './views/Questions';
import {Aide} from './views/Aide';
import {Clients} from './views/Clients';
import {ClientFiche} from './views/ClientFiche';

interface NavItem {
  vue: string;
  label: string;
  court?: string;
  icon: string;
}
const NAV: NavItem[] = [
  {vue: 'tableau', label: 'Tableau de bord', court: 'Tableau', icon: 'layout-dashboard'},
  {vue: 'prospects', label: 'Prospects', icon: 'users'},
  {vue: 'appeler', label: 'À appeler', icon: 'phone-call'},
  {vue: 'clients', label: 'Clients', icon: 'handshake'},
  {vue: 'questions', label: 'Questions clients', court: 'Questions', icon: 'message-circle-question'},
  {vue: 'tarifs', label: 'Tarifs', icon: 'euro'},
  {vue: 'aide', label: 'Aide à la prospection', court: 'Aide', icon: 'book-open'},
];

/** Après déchiffrement : les notes se chargent en arrière-plan (celles de la publication servent de secours). */
function demarrerNotes(d: Suivi, acces: Acces) {
  const publiees: Record<string, Note[]> = {};
  for (const p of d.prospects) if (p.notes?.length) publiees[p.id] = p.notes;
  for (const c of d.clients ?? []) if (c.notes?.length) publiees[c.id] = c.notes;
  for (const o of d.notes_orphelines ?? []) publiees[o.prospect] = o.notes;
  initialiserNotes(d.notes_panel?.cle, acces.jeton, publiees).catch(() => {});
}

function logoFor(logo: string, where: string): string {
  return logo.replace(/id="([^"]+)"/, `id="$1-${where}"`).replace(/url\(#([^)]+)\)/, `url(#$1-${where})`);
}

export default function Commercial({logo, faq}: {logo: string; faq: FaqSite[]}) {
  const [pret, setPret] = useState(false);

  useEffect(() => {
    // Onglet resté connecté (option cochée à la connexion) : la clé gardée dans l'onglet ouvre les données du jour.
    (async () => {
      if (sessionOuverte()) {
        try {
          const e = await telecharger();
          const acces = await accesMemorise(e);
          if (acces) {
            const d = await ouvrir<Suivi>(e, acces.cle);
            donnees.value = d;
            demarrerNotes(d, acces);
          } else oublierCle();
        } catch {
          oublierCle();
        }
      }
      setPret(true);
    })();
  }, []);

  if (!pret) return <Attente />;
  if (!donnees.value) return <Connexion logo={logo} />;
  return <Coque logo={logo} faq={faq} />;
}

function Attente() {
  return (
    <div class="splash">
      <Spinner label="Ouverture du panel…" />
    </div>
  );
}

// --- Connexion -------------------------------------------------------------------------------------
function Connexion({logo}: {logo: string}) {
  const [identifiant, setIdentifiant] = useState('');
  const [mdp, setMdp] = useState('');
  const [voir, setVoir] = useState(false);
  const [rester, setRester] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');

  const envoyer = async (ev: Event) => {
    ev.preventDefault();
    setErreur('');
    if (!identifiant.trim() || !mdp) {
      setErreur('Saisissez l’identifiant et le mot de passe.');
      return;
    }
    setBusy(true);
    try {
      const e = await telecharger();
      const acces = await deriverAcces(identifiant, mdp, e);
      const d = await ouvrir<Suivi>(e, acces.cle);
      if (rester) memoriserAcces(acces, e);
      setMdp('');
      filtres.value = {...FILTRES_VIDES};
      filtresClients.value = {...FILTRES_CLIENTS_VIDES};
      donnees.value = d;
      demarrerNotes(d, acces);
      if (!route.value.vue) aller('tableau');
    } catch (err) {
      setErreur(err instanceof ErreurAcces ? err.message : 'Ouverture impossible : réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="login cp-login">
      <aside class="login-side">
        <a href="/" class="login-logo" aria-label="Retour au site loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'login')}} />
        <div class="login-pitch">
          <p class="eyebrow">Espace commercial</p>
          <h1>Prospection LOYNA</h1>
          <ul class="login-list cp-login-list">
            <li>
              <Icon name="users" /> Le suivi de chaque prospect : mail envoyé, reçu, réponse, relance
            </li>
            <li>
              <Icon name="phone-call" /> La liste des appels du jour, avec ce qu’il faut dire
            </li>
            <li>
              <Icon name="message-circle-question" /> Les tarifs et les réponses aux questions des commerçants
            </li>
            <li>
              <Icon name="handshake" /> Les clients : commerce à créer, documents, QR codes à livrer
            </li>
          </ul>
        </div>
        <p class="cp-login-note">
          <Icon name="lock-keyhole" size={18} /> Accès réservé. Les données sont chiffrées et ne s’ouvrent que dans ce navigateur, avec vos identifiants.
        </p>
      </aside>
      <div class="login-main">
        <form class="login-card" onSubmit={envoyer} noValidate>
          <h2>Connexion</h2>
          <Field label="Identifiant">
            <input
              type="text"
              name="username"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck={false}
              value={identifiant}
              onInput={(e) => setIdentifiant((e.target as HTMLInputElement).value)}
            />
          </Field>
          <Field label="Mot de passe">
            <span class="pw">
              <input
                type={voir ? 'text' : 'password'}
                name="password"
                autocomplete="current-password"
                value={mdp}
                onInput={(e) => setMdp((e.target as HTMLInputElement).value)}
              />
              <button type="button" class="pw-eye" onClick={() => setVoir(!voir)} aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                <Icon name={voir ? 'eye-off' : 'eye'} size={18} />
              </button>
            </span>
          </Field>
          <label class="check">
            <input type="checkbox" checked={rester} onChange={(e) => setRester((e.target as HTMLInputElement).checked)} />
            <span>
              Rester connecté dans cet onglet <em>(jusqu’à sa fermeture)</em>
            </span>
          </label>
          {erreur && (
            <p class="form-err" role="alert">
              <Icon name="circle-alert" size={18} />
              {erreur}
            </p>
          )}
          <Btn type="submit" kind="gold" block busy={busy} icon="lock">
            Ouvrir le panel
          </Btn>
        </form>
      </div>
    </div>
  );
}

// --- Espace ouvert ---------------------------------------------------------------------------------
function Coque({logo, faq}: {logo: string; faq: FaqSite[]}) {
  const d = donnees.value!;
  const [plus, setPlus] = useState(false);
  const r = route.value;
  const vue = r.vue === 'prospect' || r.vue === 'client' ? r.vue : NAV.some((n) => n.vue === r.vue) ? r.vue : 'tableau';
  const blocs = notesEtat.value.blocs;
  const clientsATraiter = useMemo(() => clientsAffiches(d.clients, blocs).filter((c) => c.action.code !== 'aucune').length, [d, blocs]);
  useEffect(() => setPlus(false), [r]);

  const verrouiller = () => {
    oublierCle();
    oublierNotes();
    donnees.value = null;
    filtres.value = {...FILTRES_VIDES};
    filtresClients.value = {...FILTRES_CLIENTS_VIDES};
    history.replaceState(null, '', location.pathname);
    route.value = {vue: ''};
  };
  const actif = (v: string) => vue === v || (v === 'prospects' && vue === 'prospect') || (v === 'clients' && vue === 'client');
  const bas = NAV.filter((n) => ['tableau', 'prospects', 'questions'].includes(n.vue));
  const reste = NAV.filter((n) => ['clients', 'tarifs', 'aide'].includes(n.vue));
  const appels = d.totaux.a_appeler;

  return (
    <div class="app cp-app">
      <aside class="side">
        <a href="/" class="side-logo" aria-label="Retour au site loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'side')}} />
        <div class="side-merchant cp-side-data">
          <span class="side-m-logo cp-side-ic">
            <Icon name="lock-keyhole" size={20} />
          </span>
          <span class="side-m-t">
            <strong>Espace commercial</strong>
            <small>Données du {dateHeure(d.genere_le)}</small>
          </span>
        </div>
        {d.exemple && <p class="cp-fictif">Données fictives (test local)</p>}
        <nav class="side-nav" aria-label="Espace commercial">
          {NAV.map((n) => (
            <a href={`#/${n.vue}`} class={actif(n.vue) ? 'on' : ''} aria-current={actif(n.vue) ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
              {n.vue === 'appeler' && appels > 0 && <span class="cp-count">{appels}</span>}
              {n.vue === 'clients' && clientsATraiter > 0 && (
                <span class="cp-count" title="Clients avec une action à faire">
                  {clientsATraiter}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div class="side-foot">
          <button type="button" class="side-out" onClick={verrouiller}>
            <Icon name="lock" size={18} />
            Verrouiller
          </button>
        </div>
      </aside>

      <header class="top">
        <a href="/" class="top-logo" aria-label="loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'top')}} />
        <span class="top-merchant cp-top-data">{d.exemple ? 'Données fictives' : `Données du ${dateHeure(d.genere_le)}`}</span>
      </header>

      <div class="main">
        <Vue vue={vue} id={r.id} faq={faq} />
      </div>

      <nav class="tabbar" aria-label="Navigation">
        {bas.slice(0, 2).map((n) => (
          <a href={`#/${n.vue}`} class={actif(n.vue) ? 'on' : ''}>
            <Icon name={n.icon} size={22} />
            <span>{n.court ?? n.label}</span>
          </a>
        ))}
        <a href="#/appeler" class={`tab-scan ${actif('appeler') ? 'on' : ''}`} aria-label={`À appeler (${appels})`}>
          <span>
            <Icon name="phone-call" size={26} />
          </span>
        </a>
        {bas.slice(2).map((n) => (
          <a href={`#/${n.vue}`} class={actif(n.vue) ? 'on' : ''}>
            <Icon name={n.icon} size={22} />
            <span>{n.court ?? n.label}</span>
          </a>
        ))}
        <button type="button" class={plus || actif('clients') || actif('tarifs') || actif('aide') ? 'on' : ''} onClick={() => setPlus(!plus)} aria-expanded={plus}>
          <Icon name="ellipsis" size={22} />
          <span>Plus{clientsATraiter > 0 && <i class="cl-pastille" aria-label={`${clientsATraiter} clients à traiter`} />}</span>
        </button>
      </nav>
      {plus && (
        <div class="sheet-bg" onClick={() => setPlus(false)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Plus">
            {reste.map((n) => (
              <a href={`#/${n.vue}`} class={actif(n.vue) ? 'on' : ''}>
                <Icon name={n.icon} />
                {n.label}
                {n.vue === 'clients' && clientsATraiter > 0 && <span class="cp-count">{clientsATraiter}</span>}
              </a>
            ))}
            <a href="/">
              <Icon name="external-link" />
              Retour au site loyna.fr
            </a>
            <button type="button" onClick={verrouiller}>
              <Icon name="lock" />
              Verrouiller le panel
            </button>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
}

function Vue({vue, id, faq}: {vue: string; id?: string; faq: FaqSite[]}): ComponentChildren {
  switch (vue) {
    case 'prospects':
      return <Prospects />;
    case 'prospect':
      return <Fiche id={id ?? ''} />;
    case 'appeler':
      return <Appeler />;
    case 'clients':
      return <Clients />;
    case 'client':
      return <ClientFiche id={id ?? ''} />;
    case 'tarifs':
      return <Tarifs />;
    case 'questions':
      return <Questions faq={faq} />;
    case 'aide':
      return <Aide />;
    default:
      return <Tableau />;
  }
}
