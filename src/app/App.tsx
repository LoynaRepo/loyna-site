// LOYNA Business dans l'espace client de loyna.fr : connexion, choix du commerce, menu et pages.
import type {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {Icon} from './icons';
import {api, can, go, isOperator, loadPlans, merchant, PLAN_ORDER, planLabel, rememberMerchant, rememberedMerchant, route, session, setBackend, staffCtx, toastError, type Membership, type StaffContext} from './state';
import {Btn, Field, Spinner, Toasts} from './ui';
import {frenchTypography} from './util';
import {Commande} from './Commande';

// Écrans chargés à la demande : le téléphone ne télécharge que la page ouverte (le scanner en premier).
type ViewComp = (props: any) => any;
const LOADERS: Record<string, () => Promise<ViewComp>> = {
  accueil: () => import('./views/Dashboard').then((m) => m.Dashboard),
  scanner: () => import('./views/Scanner').then((m) => m.Scanner),
  clients: () => import('./views/Clients').then((m) => m.Clients),
  client: () => import('./views/ClientDetail').then((m) => m.ClientDetail),
  automatisations: () => import('./views/Automatisations').then((m) => m.Automatisations),
  programme: () => import('./views/Programme').then((m) => m.Programme),
  campagnes: () => import('./views/Campagnes').then((m) => m.Campagnes),
  rapport: () => import('./views/Rapport').then((m) => m.Rapport),
  equipe: () => import('./views/Equipe').then((m) => m.Equipe),
  reglages: () => import('./views/Reglages').then((m) => m.Reglages),
  abonnement: () => import('./views/Abonnement').then((m) => m.Abonnement),
  operateur: () => import('./views/Operateur').then((m) => m.Operateur),
};
const loaded: Record<string, ViewComp> = {};
function loadView(name: string): Promise<ViewComp> {
  return loaded[name] ? Promise.resolve(loaded[name]) : LOADERS[name]().then((c) => (loaded[name] = c));
}

const PORTAL = 'https://billing.stripe.com/p/login/28E28u2vEcIt4tvbiw5Ne00';
// Guide de démarrage (page publique imprimable, lien aussi dans l'e-mail « Votre carte LOYNA est prête »)
const GUIDE = '/espace-client/guide/';
const ROLE_LABEL = {OWNER: 'Propriétaire', ADMIN: 'Responsable', STAFF: 'Employé'} as const;

interface NavItem {
  view: string;
  label: string;
  icon: string;
  show: () => boolean;
  highlight?: boolean; // mis en avant (icône dorée) : les automatisations, demande d'Ewan du 2026-10-25
}
// Ordre du menu ; sur téléphone, les trois premiers (hors scanner) sont dans la barre du bas.
const NAV: NavItem[] = [
  {view: 'accueil', label: 'Accueil', icon: 'layout-dashboard', show: () => can('analytics.read')},
  {view: 'scanner', label: 'Scanner', icon: 'scan-line', show: () => can('scan.validate')},
  {view: 'clients', label: 'Clients', icon: 'users', show: () => can('customers.read_basic')},
  {view: 'automatisations', label: 'Automatisations', icon: 'zap', show: () => can('settings.manage'), highlight: true},
  {view: 'campagnes', label: 'Campagnes', icon: 'megaphone', show: () => can('campaigns.manage')},
  {view: 'rapport', label: 'Rapport', icon: 'file-chart-column', show: () => can('analytics.read')},
  {view: 'programme', label: 'Programme', icon: 'gift', show: () => can('program.manage') || can('rewards.manage')},
  {view: 'equipe', label: 'Équipe', icon: 'users-round', show: () => can('team.manage')},
  {view: 'reglages', label: 'Réglages', icon: 'settings', show: () => can('settings.manage')},
  {view: 'abonnement', label: 'Abonnement', icon: 'credit-card', show: () => can('settings.manage')},
  // Opérateur LOYNA (platform_admins, vérifié par le serveur) : commandes à traiter et création des commerces
  {view: 'operateur', label: 'Opérateur', icon: 'shield-check', show: isOperator},
];

/** Un logo par emplacement : chaque copie reçoit son propre identifiant de dégradé. */
function logoFor(logo: string, where: string): string {
  return logo.replace(/id="([^"]+)"/, `id="$1-${where}"`).replace(/url\(#([^)]+)\)/, `url(#$1-${where})`);
}

function defaultView(): string {
  return can('analytics.read') ? 'accueil' : can('scan.validate') ? 'scanner' : (NAV.find((n) => n.show())?.view ?? 'accueil');
}

export default function App({logo, demo = false, staticSide = false}: {logo: string; demo?: boolean; staticSide?: boolean}) {
  const [booted, setBooted] = useState(false);

  useEffect(() => frenchTypography(), []);
  useEffect(() => {
    (async () => {
      // Démonstration (données fictives tirées au hasard, rien n'est enregistré) : page /espace-client/demo/,
      // ou ?demo dans l'adresse en développement.
      if (demo || (import.meta.env.DEV && new URLSearchParams(location.search).has('demo'))) {
        const m = await import('./mock');
        setBackend(m.createMockBackend(m.demoSeed()));
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

  // Page /espace-client/ : la colonne de présentation est dans le HTML ; elle disparaît une fois connecté.
  useEffect(() => {
    if (staticSide) document.documentElement.classList.toggle('in-app', !!session.value);
  }, [session.value]);

  if (!booted || session.value === undefined) return staticSide ? <LoginWait /> : <Splash />;
  if (!session.value) return <Login logo={logo} withSide={!staticSide} />;
  return <Workspace logo={logo} />;
}

function LoginWait() {
  return (
    <div class="login-main">
      <div class="login-card login-card--wait">
        <Spinner label="Ouverture de votre espace…" />
      </div>
    </div>
  );
}

function Splash() {
  return (
    <div class="splash">
      <Spinner label="Ouverture de votre espace…" />
    </div>
  );
}

// --- Connexion ------------------------------------------------------------------------------------
function Login({logo, withSide = true}: {logo: string; withSide?: boolean}) {
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

  const form = (
    <div class="login-main">
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
              <strong>Propriétaire :</strong> connectez-vous avec l’adresse e-mail de votre commande et le mot de passe que vous avez choisi. Pas encore de mot de passe, ou vous l’avez oublié ? Écrivez à{' '}
              <a href="mailto:contact@loyna.fr?subject=Nouveau%20lien%20de%20connexion%20LOYNA%20Business">contact@loyna.fr</a> depuis cette adresse : nous vous envoyons un lien pour en choisir un.
            </p>
            <p>
              <strong>Pour bien démarrer :</strong> <a href={GUIDE}>le guide de démarrage</a> présente chaque partie de votre espace en 2 minutes.
            </p>
          </div>
        )}
      </form>
      <p class="login-foot">
        <a href="/espace-client/demo/">Découvrir LOYNA Business en démonstration →</a>
      </p>
      <p class="login-foot">
        Vous êtes client d’un commerce ? Vos préférences de messages se gèrent depuis le lien « Mes préférences » au dos de votre carte, dans votre Wallet.
      </p>
    </div>
  );
  if (!withSide) return form;
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
      {form}
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
  const operator = isOperator();
  // Opérateur LOYNA sans commerce à lui (ou sans commerce choisi) : écran Opérateur seul.
  if (operator && (!ctx.memberships.length || (!merchant.value && route.value.view === 'operateur'))) return <OperatorShell logo={logo} />;
  // Compte sans commerce (commande passée dans le panier de loyna.fr) : « Votre commande », LOYNA prépare la carte.
  if (!ctx.memberships.length)
    return (
      <Center logo={logo}>
        <Commande email={session.value?.email ?? ''} portal={PORTAL} onSignOut={() => api.signOut().then(() => (session.value = null))} />
      </Center>
    );
  if (!merchant.value) return <MerchantPicker logo={logo} list={ctx.memberships} operator={operator} />;
  return <Shell logo={logo} />;
}

/** Déconnexion (ou sortie de la démonstration en ligne). */
async function signOutAll() {
  if (api.demo && !import.meta.env.DEV) {
    location.href = '/'; // quitter la démonstration
    return;
  }
  try {
    await api.signOut();
  } catch (e) {
    toastError(e);
  }
  session.value = null;
  staffCtx.value = null;
  merchant.value = null;
}

/** Écran Opérateur hors d'un commerce : opérateur sans commerce à lui, ou avant d'en choisir un. */
function OperatorShell({logo}: {logo: string}) {
  const hasMerchants = (staffCtx.value?.memberships.length ?? 0) > 0;
  const email = session.value?.email ?? '';
  return (
    <div class="app">
      <aside class="side">
        <a href="/" class="side-logo" aria-label="Retour au site loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'side')}} />
        <div class="side-merchant side-merchant--op">
          <span class="side-m-logo op-mark">
            <Icon name="shield-check" size={22} />
          </span>
          <span class="side-m-t">
            <strong>Opérateur LOYNA</strong>
            <small>{email}</small>
          </span>
        </div>
        <nav class="side-nav" aria-label="LOYNA Business">
          <a href="#/operateur" class="on" aria-current="page">
            <Icon name="shield-check" />
            Opérateur
          </a>
          {hasMerchants && (
            <a href="#/">
              <Icon name="store" />
              Choisir un commerce
            </a>
          )}
        </nav>
        <div class="side-foot">
          <button type="button" class="side-out" onClick={signOutAll}>
            <Icon name="log-out" size={18} />
            {api.demo ? 'Quitter la démo' : 'Se déconnecter'}
          </button>
        </div>
      </aside>
      <header class="top">
        <a href="/" class="top-logo" aria-label="loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'top')}} />
        {hasMerchants ? (
          <a class="top-merchant" href="#/">
            <Icon name="store" size={14} />
            Mes commerces
          </a>
        ) : (
          <button type="button" class="top-merchant" onClick={signOutAll}>
            <Icon name="log-out" size={14} />
            Se déconnecter
          </button>
        )}
      </header>
      <div class="main">
        {api.demo && <DemoBar />}
        <View view="operateur" />
      </div>
      <Toasts />
    </div>
  );
}

function Center({logo, children}: {logo: string; children: ComponentChildren}) {
  return (
    <div class="center-screen">
      <a href="/" class="center-logo" aria-label="loyna.fr" dangerouslySetInnerHTML={{__html: logoFor(logo, 'center')}} />
      <div class="center-card">{children}</div>
    </div>
  );
}

function MerchantPicker({logo, list, operator = false}: {logo: string; list: Membership[]; operator?: boolean}) {
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
                {ROLE_LABEL[m.role]} · LOYNA {planLabel(m.subscription_plan)}
              </small>
            </span>
            <Icon name="chevron-right" />
          </button>
        ))}
        {operator && (
          <a class="picker-i" href="#/operateur">
            <span class="picker-logo op-mark">
              <Icon name="shield-check" size={22} />
            </span>
            <span>
              <strong>Écran opérateur</strong>
              <small>Commandes à traiter, création des commerces</small>
            </span>
            <Icon name="chevron-right" />
          </a>
        )}
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

  const logout = signOutAll;
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
            <small>LOYNA {planLabel(m.subscription_plan)}</small>
          </span>
          {multi && <Icon name="chevron-down" size={16} />}
        </button>
        <nav class="side-nav" aria-label="LOYNA Business">
          {items.map((n) => (
            <a href={`#/${n.view}`} class={`${active(n.view) ? 'on' : ''} ${n.highlight ? 'hl' : ''}`} aria-current={active(n.view) ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
        </nav>
        <div class="side-foot">
          <a class="side-out side-guide" href={GUIDE} target="_blank" rel="noopener">
            <Icon name="circle-help" size={18} />
            Guide de démarrage
          </a>
          <div class="side-user">
            <span class="side-avatar">{m.display_name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{m.display_name}</strong>
              <small>{ROLE_LABEL[m.role]}</small>
            </span>
          </div>
          <button type="button" class="side-out" onClick={logout}>
            <Icon name="log-out" size={18} />
            {api.demo ? 'Quitter la démo' : 'Se déconnecter'}
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

      <div class="main">
        {api.demo && <DemoBar />}
        {m.merchant_status === 'SUSPENDED' && (
          <div class="banner">
            <Icon name="triangle-alert" />
            Votre compte est suspendu : les passages ne peuvent plus être validés. Écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a>.
          </div>
        )}
        <View view={view} id={route.value.id} />
      </div>

      <nav class="tabbar" aria-label="Navigation">
        {left.map((n) => (
          <a href={`#/${n.view}`} class={`${active(n.view) ? 'on' : ''} ${n.highlight ? 'hl' : ''}`}>
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
          <a href={`#/${n.view}`} class={`${active(n.view) ? 'on' : ''} ${n.highlight ? 'hl' : ''}`}>
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
              <a href={`#/${n.view}`} class={`${active(n.view) ? 'on' : ''} ${n.highlight ? 'hl' : ''}`}>
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
            <a href={GUIDE} target="_blank" rel="noopener">
              <Icon name="circle-help" />
              Guide de démarrage
            </a>
            <a href="/">
              <Icon name="external-link" />
              Retour au site loyna.fr
            </a>
            <button type="button" onClick={logout}>
              <Icon name="log-out" />
              {api.demo ? 'Quitter la démo' : `Se déconnecter (${m.display_name})`}
            </button>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
}

function View({view, id}: {view: string; id?: string}) {
  // écran à charger et ses paramètres
  const [name, props]: [string, Record<string, unknown>] =
    view === 'client' && id
      ? ['client', {id}]
      : view === 'client'
        ? ['clients', {}]
        : view === 'campagne'
          ? ['campagnes', {id}]
          : view === 'abonnement'
            ? ['abonnement', {portal: PORTAL}]
            : LOADERS[view]
              ? [view, {}]
              : ['accueil', {}];
  const [, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!loaded[name]) loadView(name).then(() => setTick((t) => t + 1), () => setFailed(true));
  }, [name]);
  // les deux écrans les plus utilisés sont préchargés dès que le navigateur est libre
  useEffect(() => {
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200));
    idle(() => ['scanner', 'accueil', 'clients'].forEach((v) => loadView(v).catch(() => {})));
  }, []);
  const C = loaded[name];
  if (failed)
    return (
      <div class="errbox" role="alert">
        <Icon name="triangle-alert" />
        <span>Chargement impossible : vérifiez votre connexion.</span>
        <Btn kind="ghost" small icon="refresh-cw" onClick={() => location.reload()}>
          Recharger
        </Btn>
      </div>
    );
  return C ? <C {...props} /> : <Spinner />;
}

/** Bandeau de la démonstration : données fictives, rien n'est enregistré ; l'offre affichée se change ici. */
function DemoBar() {
  const plan = merchant.value?.subscription_plan ?? 'PRO';
  const switchPlan = (p: string) =>
    import('./mock').then((m) => {
      const seed = Number(merchant.value?.merchant_slug.replace(/^demo-/, '')) || m.demoSeed();
      m.setDemoPlan(p as typeof plan, seed);
    });
  return (
    <div class="demobar" role="note">
      <span class="demobar-t">
        <Icon name="sparkles" size={18} />
        <span>
          <strong>Démonstration</strong> · commerce et clients fictifs tirés au hasard, rien n’est enregistré.
        </span>
      </span>
      <span class="demobar-a">
        <label class="demobar-plan">
          <span>Offre</span>
          <select class="sel-sm" value={plan} onChange={(e) => switchPlan((e.target as HTMLSelectElement).value)} aria-label="Offre affichée dans la démonstration">
            {PLAN_ORDER.map((p) => (
              <option value={p}>{planLabel(p)}</option>
            ))}
          </select>
        </label>
        <button type="button" class="b b--sm b--ghost" onClick={() => import('./mock').then((m) => m.regenerateDemo())}>
          <Icon name="refresh-cw" size={16} />
          <span>Autres données</span>
        </button>
        <a class="b b--sm b--gold" href="/creer-ma-carte/">
          <span>Créer ma carte</span>
        </a>
      </span>
    </div>
  );
}
