// LOYNA Business dans l'espace client de loyna.fr : connexion, choix du commerce, menu et pages.
import type {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {Icon} from './icons';
import {api, can, go, loadPlans, merchant, rememberMerchant, rememberedMerchant, route, session, setBackend, staffCtx, toastError, type Membership, type StaffContext} from './state';
import {Btn, Field, Spinner, Toasts} from './ui';
import {Dashboard} from './views/Dashboard';
import {Scanner} from './views/Scanner';
import {Clients} from './views/Clients';
import {ClientDetail} from './views/ClientDetail';
import {Programme} from './views/Programme';
import {Campagnes} from './views/Campagnes';
import {Equipe} from './views/Equipe';
import {Reglages} from './views/Reglages';
import {Abonnement} from './views/Abonnement';

const PORTAL = 'https://billing.stripe.com/p/login/28E28u2vEcIt4tvbiw5Ne00';
const PLAN_LABEL = {ESSENTIEL: 'Essentiel', GROWTH: 'Growth', PRO: 'Pro'} as const;
const ROLE_LABEL = {OWNER: 'Propriétaire', ADMIN: 'Responsable', STAFF: 'Employé'} as const;

interface NavItem {
  view: string;
  label: string;
  icon: string;
  show: () => boolean;
}
const NAV: NavItem[] = [
  {view: 'accueil', label: 'Accueil', icon: 'layout-dashboard', show: () => can('analytics.read')},
  {view: 'scanner', label: 'Scanner', icon: 'scan-line', show: () => can('scan.validate')},
  {view: 'clients', label: 'Clients', icon: 'users', show: () => can('customers.read_basic')},
  {view: 'programme', label: 'Programme', icon: 'gift', show: () => can('program.manage') || can('rewards.manage')},
  {view: 'campagnes', label: 'Campagnes', icon: 'megaphone', show: () => can('campaigns.manage')},
  {view: 'equipe', label: 'Équipe', icon: 'users-round', show: () => can('team.manage')},
  {view: 'reglages', label: 'Réglages', icon: 'settings', show: () => can('settings.manage')},
  {view: 'abonnement', label: 'Abonnement', icon: 'credit-card', show: () => can('settings.manage')},
];

/** Un logo par emplacement : chaque copie reçoit son propre identifiant de dégradé. */
function logoFor(logo: string, where: string): string {
  return logo.replace(/id="([^"]+)"/, `id="$1-${where}"`).replace(/url\(#([^)]+)\)/, `url(#$1-${where})`);
}

function defaultView(): string {
  return can('analytics.read') ? 'accueil' : can('scan.validate') ? 'scanner' : (NAV.find((n) => n.show())?.view ?? 'accueil');
}

export default function App({logo}: {logo: string}) {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    (async () => {
      // Démonstration locale (données fictives) : uniquement en développement, avec ?demo dans l'adresse.
      if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
        const {mockBackend} = await import('./mock');
        setBackend(mockBackend);
      }
      api.onAuthChange((event, signedIn) => {
        if (event === 'SIGNED_OUT' || !signedIn) {
          session.value = null;
          staffCtx.value = null;
          merchant.value = null;
        }
      });
      session.value = await api.getSession().catch(() => null);
      setBooted(true);
    })();
  }, []);

  if (!booted || session.value === undefined) return <Splash />;
  if (!session.value) return <Login logo={logo} />;
  return <Workspace logo={logo} />;
}

function Splash() {
  return (
    <div class="splash">
      <Spinner label="Ouverture de votre espace…" />
    </div>
  );
}

// --- Connexion ------------------------------------------------------------------------------------
function Login({logo}: {logo: string}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.signIn(email, password);
      session.value = await api.getSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="login">
      <aside class="login-side">
        <a href="/" class="login-logo" aria-label="Retour au site loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'login')}} />
        <div class="login-pitch">
          <p class="eyebrow">LOYNA Business</p>
          <h1>Votre espace commerçant</h1>
          <ul class="login-list">
            <li>
              <Icon name="scan-line" /> Scannez les cartes de vos clients depuis votre téléphone
            </li>
            <li>
              <Icon name="users" /> Suivez vos clients, leurs passages et leurs récompenses
            </li>
            <li>
              <Icon name="megaphone" /> Envoyez une offre dans leur Wallet en quelques secondes
            </li>
          </ul>
        </div>
        <a class="login-portal" href={PORTAL} rel="nofollow">
          <Icon name="credit-card" />
          <span>
            <strong>Abonnement et factures</strong>
            <small>Portail sécurisé Stripe : factures, carte bancaire, formule</small>
          </span>
          <Icon name="arrow-right" size={18} />
        </a>
      </aside>
      <main class="login-main" id="contenu">
        <form class="login-card" onSubmit={submit} noValidate={false}>
          <h2>Connexion</h2>
          <p class="muted">Utilisez l’adresse e-mail et le mot de passe choisis à l’activation de votre compte.</p>
          <Field label="Adresse e-mail">
            <input type="email" name="email" autocomplete="username" required value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Mot de passe">
            <span class="pw">
              <input
                type={show ? 'text' : 'password'}
                name="password"
                autocomplete="current-password"
                required
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              />
              <button type="button" class="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                <Icon name={show ? 'eye-off' : 'eye'} size={18} />
              </button>
            </span>
          </Field>
          {error && (
            <p class="form-err" role="alert">
              {error}
            </p>
          )}
          <Btn type="submit" kind="gold" block busy={busy} icon="lock">
            Se connecter
          </Btn>
          <button type="button" class="linkish" onClick={() => setHelp(!help)} aria-expanded={help}>
            Mot de passe oublié ou première connexion ?
          </button>
          {help && (
            <div class="login-help">
              <p>
                <strong>Employé :</strong> demandez à votre responsable un nouveau lien depuis le menu <em>Équipe</em>. Vous y choisirez vous-même votre mot de passe.
              </p>
              <p>
                <strong>Propriétaire :</strong> votre lien d’activation vous a été envoyé à la mise en service de votre carte. Pour en recevoir un nouveau, écrivez à{' '}
                <a href="mailto:contact@loyna.fr?subject=Nouveau%20lien%20de%20connexion%20LOYNA%20Business">contact@loyna.fr</a> depuis l’adresse de votre compte.
              </p>
            </div>
          )}
        </form>
        <p class="login-foot">
          Vous êtes client d’un commerce ? Vos préférences de messages se gèrent depuis le lien « Mes préférences » au dos de votre carte, dans votre Wallet.
        </p>
      </main>
    </div>
  );
}

// --- Espace connecté ------------------------------------------------------------------------------
function Workspace({logo}: {logo: string}) {
  const [error, setError] = useState('');
  const ctx = staffCtx.value;

  const loadCtx = async () => {
    setError('');
    try {
      const c = await api.rpc<StaffContext>('my_staff_context');
      staffCtx.value = c;
      loadPlans();
      const list = c.memberships ?? [];
      const keep = list.find((m) => m.merchant_id === rememberedMerchant());
      merchant.value = list.length === 1 ? list[0] : (keep ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    }
  };
  useEffect(() => {
    if (!ctx) loadCtx();
  }, []);

  if (error)
    return (
      <Center logo={logo}>
        <h1>Connexion interrompue</h1>
        <p class="muted">{error}</p>
        <div class="btn-row">
          <Btn icon="refresh-cw" onClick={loadCtx}>
            Réessayer
          </Btn>
          <Btn kind="ghost" icon="log-out" onClick={() => api.signOut().then(() => (session.value = null))}>
            Se déconnecter
          </Btn>
        </div>
      </Center>
    );
  if (!ctx) return <Splash />;
  if (!ctx.memberships.length)
    return (
      <Center logo={logo}>
        <h1>Compte non rattaché à un commerce</h1>
        <p class="muted">
          Vous êtes connecté avec <strong>{session.value?.email}</strong>, mais ce compte n’a accès à aucun commerce. Demandez à votre responsable de vous inviter depuis le menu Équipe, ou écrivez à{' '}
          <a href="mailto:contact@loyna.fr">contact@loyna.fr</a>.
        </p>
        <Btn kind="ghost" icon="log-out" onClick={() => api.signOut().then(() => (session.value = null))}>
          Se déconnecter
        </Btn>
      </Center>
    );
  if (!merchant.value) return <MerchantPicker logo={logo} list={ctx.memberships} />;
  return <Shell logo={logo} />;
}

function Center({logo, children}: {logo: string; children: ComponentChildren}) {
  return (
    <div class="center-screen">
      <a href="/" class="center-logo" aria-label="loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'center')}} />
      <div class="center-card">{children}</div>
    </div>
  );
}

function MerchantPicker({logo, list}: {logo: string; list: Membership[]}) {
  const pick = (m: Membership) => {
    rememberMerchant(m.merchant_id);
    merchant.value = m;
    go(can('analytics.read') ? 'accueil' : 'scanner');
  };
  return (
    <Center logo={logo}>
      <h1>Choisissez un commerce</h1>
      <div class="picker">
        {list.map((m) => (
          <button type="button" class="picker-i" onClick={() => pick(m)}>
            <span class="picker-logo" style={{background: m.primary_color, color: m.secondary_color}}>
              {m.logo_url ? <img src={m.logo_url} alt="" /> : m.merchant_name.slice(0, 1)}
            </span>
            <span>
              <strong>{m.merchant_name}</strong>
              <small>
                {ROLE_LABEL[m.role]} · LOYNA {PLAN_LABEL[m.subscription_plan]}
              </small>
            </span>
            <Icon name="chevron-right" />
          </button>
        ))}
      </div>
    </Center>
  );
}

function Shell({logo}: {logo: string}) {
  const m = merchant.value!;
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => n.show());
  let view = route.value.view || defaultView();
  if (!items.some((n) => n.view === view) && view !== 'client' && view !== 'campagne') view = defaultView();

  useEffect(() => setMore(false), [route.value]);

  const logout = async () => {
    try {
      await api.signOut();
    } catch (e) {
      toastError(e);
    }
    session.value = null;
    staffCtx.value = null;
    merchant.value = null;
  };
  const switchMerchant = () => {
    merchant.value = null;
  };
  const multi = (staffCtx.value?.memberships.length ?? 0) > 1;

  // Barre du bas (téléphone) : deux raccourcis, le scanner au centre, un raccourci, puis « Plus ».
  const others = items.filter((n) => n.view !== 'scanner');
  const scanner = items.find((n) => n.view === 'scanner');
  const left = others.slice(0, 2);
  const right = others.slice(2, 3);
  const rest = others.slice(3);

  const active = (v: string) => view === v || (v === 'clients' && view === 'client') || (v === 'campagnes' && view === 'campagne');

  return (
    <div class={`app ${view === 'scanner' ? 'app--scan' : ''}`}>
      <aside class="side">
        <a href="/" class="side-logo" aria-label="Retour au site loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'side')}} />
        <button type="button" class="side-merchant" onClick={multi ? switchMerchant : undefined} disabled={!multi} title={multi ? 'Changer de commerce' : undefined}>
          <span class="side-m-logo" style={{background: m.primary_color, color: m.secondary_color}}>
            {m.logo_url ? <img src={m.logo_url} alt="" /> : m.merchant_name.slice(0, 1)}
          </span>
          <span class="side-m-t">
            <strong>{m.merchant_name}</strong>
            <small>LOYNA {PLAN_LABEL[m.subscription_plan]}</small>
          </span>
          {multi && <Icon name="chevron-down" size={16} />}
        </button>
        <nav class="side-nav" aria-label="LOYNA Business">
          {items.map((n) => (
            <a href={`#/${n.view}`} class={active(n.view) ? 'on' : ''} aria-current={active(n.view) ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
        </nav>
        <div class="side-foot">
          <div class="side-user">
            <span class="side-avatar">{m.display_name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{m.display_name}</strong>
              <small>{ROLE_LABEL[m.role]}</small>
            </span>
          </div>
          <button type="button" class="side-out" onClick={logout}>
            <Icon name="log-out" size={18} />
            Se déconnecter
          </button>
        </div>
      </aside>

      <header class="top">
        <a href="/" class="top-logo" aria-label="loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'top')}} />
        <button type="button" class="top-merchant" onClick={multi ? switchMerchant : undefined} disabled={!multi}>
          {m.merchant_name}
          {multi && <Icon name="chevron-down" size={14} />}
        </button>
      </header>

      <main class="main" id="contenu">
        {m.merchant_status === 'SUSPENDED' && (
          <div class="banner">
            <Icon name="triangle-alert" />
            Votre compte est suspendu : les passages ne peuvent plus être validés. Écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a>.
          </div>
        )}
        <View view={view} id={route.value.id} />
      </main>

      <nav class="tabbar" aria-label="Navigation">
        {left.map((n) => (
          <a href={`#/${n.view}`} class={active(n.view) ? 'on' : ''}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </a>
        ))}
        {scanner && (
          <a href="#/scanner" class={`tab-scan ${active('scanner') ? 'on' : ''}`} aria-label="Scanner">
            <span>
              <Icon name="scan-line" size={26} />
            </span>
          </a>
        )}
        {right.map((n) => (
          <a href={`#/${n.view}`} class={active(n.view) ? 'on' : ''}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </a>
        ))}
        <button type="button" class={more ? 'on' : ''} onClick={() => setMore(!more)} aria-expanded={more}>
          <Icon name="ellipsis" size={22} />
          <span>Plus</span>
        </button>
      </nav>
      {more && (
        <div class="sheet-bg" onClick={() => setMore(false)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Plus">
            {rest.map((n) => (
              <a href={`#/${n.view}`} class={active(n.view) ? 'on' : ''}>
                <Icon name={n.icon} />
                {n.label}
              </a>
            ))}
            {multi && (
              <button type="button" onClick={switchMerchant}>
                <Icon name="store" />
                Changer de commerce
              </button>
            )}
            <a href="/">
              <Icon name="external-link" />
              Retour au site loyna.fr
            </a>
            <button type="button" onClick={logout}>
              <Icon name="log-out" />
              Se déconnecter ({m.display_name})
            </button>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
}

function View({view, id}: {view: string; id?: string}) {
  switch (view) {
    case 'accueil':
      return <Dashboard />;
    case 'scanner':
      return <Scanner />;
    case 'clients':
      return <Clients />;
    case 'client':
      return id ? <ClientDetail id={id} /> : <Clients />;
    case 'programme':
      return <Programme />;
    case 'campagnes':
      return <Campagnes />;
    case 'campagne':
      return <Campagnes id={id} />;
    case 'equipe':
      return <Equipe />;
    case 'reglages':
      return <Reglages />;
    case 'abonnement':
      return <Abonnement portal={PORTAL} />;
    default:
      return <Dashboard />;
  }
}
