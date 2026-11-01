// Accueil : indicateurs de la période (avec la période précédente), campagnes de la semaine avec alertes à 80 % et 100 %,
// courbe quotidienne et suivi LOYNA (Pro). Pendant l'essai : panneau de démarrage (affiche, adresse, première carte, guide) ;
// /espace-client/?bienvenue=1 l'accueille juste après l'activation.
// Parrainage LOYNA (29/10/2026, Ewan : le montrer aux commerçants déjà clients) :
// bandeau « Parrainez un commerçant » pour le propriétaire d'un abonnement actif (my_referral, CGV 4.8),
// masquable 30 jours ; le détail (filleuls, mois obtenus) reste dans Abonnement.
// Définitions des indicateurs : en-tête de supabase/migrations/…_analytics.sql (dépôt LOYNA).
import {useEffect, useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, can, feature, includedIn, loadUsage, merchant, planLabel, readOnly, service, servicePaused, toast, type PlanUsage} from '../state';
import {Btn, ErrorBox, Kpi, LinkBox, Panel, Segmented, Spinner, UsageMeter, useLoad} from '../ui';
import {copy, date, dayLong, joinUrl, mondayLabel, num} from '../util';

interface Period {
  visits: number;
  customers_active: number;
  returning_customers: number;
  return_rate: number | null;
  new_customers: number;
  rewards_unlocked: number;
  rewards_redeemed: number;
  campaigns_sent: number;
  wallet_notifications_sent: number;
}
interface Kpis {
  period_days: number;
  current: Period;
  previous: Period;
  totals: {customers: number; rewards_available: number; wallet_passes: number; apple_wallet_installed: number; google_wallet_objects: number};
}

const MAIN: {key: keyof Period; label: string; def: string; pct?: boolean}[] = [
  {key: 'visits', label: 'Passages', def: 'Passages validés et non annulés sur la période.'},
  {key: 'customers_active', label: 'Clients venus', def: 'Clients différents venus au moins une fois sur la période.'},
  {key: 'new_customers', label: 'Nouveaux clients', def: 'Clients inscrits sur la période.'},
  {key: 'rewards_redeemed', label: 'Récompenses utilisées', def: 'Récompenses utilisées en caisse sur la période.'},
  {key: 'return_rate', label: 'Taux de retour', def: 'Part des clients venus sur la période qui sont venus au moins deux fois.', pct: true},
];
const MORE: {key: keyof Period; label: string}[] = [
  {key: 'rewards_unlocked', label: 'Récompenses débloquées'},
  {key: 'campaigns_sent', label: 'Campagnes envoyées'},
  {key: 'wallet_notifications_sent', label: 'Notifications Wallet'},
];
const METRICS = [
  {value: 'visits', label: 'Passages'},
  {value: 'new_customers', label: 'Nouveaux clients'},
  {value: 'rewards_redeemed', label: 'Récompenses utilisées'},
] as const;

// --- Parrainage LOYNA (CGV 4.8 : premier mois offert au filleul ; pour le parrain, son mois suivant offert
// et 1 QR code sous verre offert par filleul qui paie sa première mensualité) -------------------------------------
const MASQUE = 'loyna_parrainage_masque_jusqua';
const masqueJusqua = () => {
  try {
    return Number(localStorage.getItem(MASQUE) || 0);
  } catch {
    return 0;
  }
};

function ParrainageAccueil() {
  const [masque, setMasque] = useState(() => masqueJusqua() > Date.now());
  const data = useLoad(() => (masque ? Promise.resolve(null) : api.rpc<{status: string; code?: string; link?: string; eligibility?: string; months_waiting?: number}>('my_referral').catch(() => null)), [masque]);
  const r = data.data;
  if (masque || !r || r.status !== 'OK' || r.eligibility !== 'ACTIVE' || !r.code || !r.link) return null;
  const message = `Je vous recommande LOYNA, la carte de fidélité dans Apple Wallet et Google Wallet. Avec mon code ${r.code}, votre premier mois est offert : ${r.link}`;
  const cacher = () => {
    try {
      localStorage.setItem(MASQUE, String(Date.now() + 30 * 86400000));
    } catch {
      /* stockage indisponible : masqué jusqu'au rechargement */
    }
    setMasque(true);
  };
  return (
    <section class="ref-banner" aria-label="Parrainage LOYNA">
      <span class="rb-i">
        <Icon name="gift" size={26} />
      </span>
      <div class="rb-t">
        <strong>Parrainez un commerçant : 1 mois offert à chacun.</strong>
        <small>
          Son premier mois est offert. Pour vous, votre mois suivant offert et 1 QR code sous verre, dès qu’il a payé sa première mensualité.
          {(r.months_waiting ?? 0) > 0 ? ` ${num(r.months_waiting!)} mois offert${r.months_waiting! > 1 ? 's' : ''} à venir.` : ''}
        </small>
        <div class="rb-a">
          <span class="ref-code">{r.code}</span>
          <Btn kind="primary" small icon="message-square" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank">
            WhatsApp
          </Btn>
          <Btn kind="ghost" small icon="copy" onClick={async () => toast((await copy(r.link!)) ? 'Lien de parrainage copié.' : 'Copie impossible : votre lien est dans Abonnement.', 'info')}>
            Copier le lien
          </Btn>
          <a href="#/abonnement" class="rb-l">
            Mes parrainages <Icon name="arrow-right" size={15} />
          </a>
        </div>
      </div>
      <button type="button" class="rb-x" aria-label="Masquer pendant 30 jours" title="Masquer pendant 30 jours" onClick={cacher}>
        <Icon name="x" size={18} />
      </button>
    </section>
  );
}

/**
 * Essai : les gestes qui font vivre la carte dès le premier jour. Seul ce qui se vérifie est coché (adresse enregistrée,
 * premier client inscrit). `bienvenue` : juste après l'activation (/espace-client/?bienvenue=1).
 */
function TrialStart({customers, locations, bienvenue}: {customers: number | null; locations: number | null; bienvenue: boolean}) {
  const m = merchant.value!;
  const s = service.value;
  const steps: {done?: boolean; title: string; text: string; href: string; label: string; external?: boolean}[] = [
    {title: 'Imprimez l’affiche du comptoir', text: 'Vos clients la scannent et ajoutent leur carte à leur téléphone, sans application.', href: '#/reglages/affiche', label: 'Affiche du comptoir'},
    {done: !!locations, title: 'Ajoutez l’adresse de votre boutique', text: 'Votre carte s’affiche sur l’écran verrouillé d’un client qui passe près de chez vous.', href: '#/reglages/boutique', label: 'Boutique et proximité'},
    {done: !!customers, title: 'Créez votre première carte', text: 'Inscrivez-vous comme un client : vous verrez la carte telle qu’ils la reçoivent, puis scannez-la.', href: joinUrl(m.merchant_slug), label: 'Page d’inscription', external: true},
    {title: 'Activez l’anniversaire et l’avis Google', text: 'La relance et « Plus qu’un passage ! » sont déjà actifs. Ces deux-là attendent votre surprise et votre lien d’avis.', href: '#/automatisations', label: 'Automatisations'},
    {title: 'Parcourez le guide de démarrage', text: 'Chaque partie de votre espace, en 2 minutes.', href: '/espace-client/guide/', label: 'Guide de démarrage', external: true},
  ];
  return (
    <Panel
      class="trial-start"
      title={bienvenue ? 'Votre carte est prête : 5 gestes pour démarrer' : 'Votre essai : 5 gestes pour démarrer'}
      sub={s?.trial_ends_at ? `Essai gratuit jusqu’au ${dayLong(s.trial_ends_at)}, sans carte bancaire : aucun prélèvement à la fin.` : undefined}
    >
      <ol class="ts-list">
        {steps.map((x) => (
          <li class={x.done ? 'is-done' : ''}>
            <span class="ts-i">
              <Icon name={x.done ? 'circle-check' : 'arrow-right'} size={18} />
            </span>
            <span class="ts-t">
              <strong>{x.title}</strong>
              <small>{x.text}</small>
            </span>
            <Btn kind="ghost" small href={x.href} target={x.external ? '_blank' : undefined}>
              {x.label}
            </Btn>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function Dashboard() {
  const m = merchant.value!;
  const [days, setDays] = useState(30);
  const k = useLoad(() => api.rpc<Kpis>('dashboard_kpis', {p_days: days, p_merchant_id: m.merchant_id}), [days, m.merchant_id]);
  const usage = useLoad(() => loadUsage().catch(() => null), [m.merchant_id]);
  const hour = new Date().getHours();
  const hello = hour < 5 || hour >= 18 ? 'Bonsoir' : 'Bonjour';
  // ?bienvenue=1 : retour de la confirmation d'adresse (Confirmer.tsx), retiré de l'adresse une fois lu
  const [bienvenue] = useState(() => new URLSearchParams(location.search).has('bienvenue'));
  useEffect(() => {
    if (!bienvenue) return;
    const u = new URL(location.href);
    u.searchParams.delete('bienvenue');
    history.replaceState(null, '', u);
  }, []);
  const paused = servicePaused();

  return (
    <div class="page">
      <header class="ph">
        <div class="ph-t">
          <p class="eyebrow">{m.merchant_name}</p>
          {/* consultation opérateur : pas de « Bonjour » au nom de l'opérateur */}
          <h1>{readOnly() ? 'Tableau de bord' : `${hello} ${m.display_name}`}</h1>
        </div>
        <div class="ph-a">
          <Segmented
            label="Période"
            value={days}
            onChange={setDays}
            options={[
              {value: 7, label: '7 jours'},
              {value: 30, label: '30 jours'},
              {value: 90, label: '90 jours'},
            ]}
          />
        </div>
      </header>

      {service.value?.state === 'TRIAL' && can('settings.manage') && !readOnly() && <TrialStart customers={k.data?.totals.customers ?? null} locations={usage.data?.locations.used ?? null} bienvenue={bienvenue} />}

      {can('scan.validate') && !paused && (
        <a href="#/scanner" class="quick-scan">
          <span class="qs-i">
            <Icon name="scan-line" size={28} />
          </span>
          <span>
            <strong>Scanner une carte</strong>
            <small>Le passage est validé dès la lecture du QR code</small>
          </span>
          <Icon name="arrow-right" />
        </a>
      )}

      {usage.data && !paused && <QuotaAlerts u={usage.data} />}

      {can('settings.manage') && <ParrainageAccueil />}

      {k.error ? (
        <ErrorBox error={k.error} retry={k.reload} />
      ) : !k.data ? (
        <Spinner />
      ) : (
        <>
          <div class="kpis">
            {MAIN.map((it) => (
              <Kpi label={it.label} def={it.def} cur={k.data!.current[it.key] as number | null} prev={k.data!.previous[it.key] as number | null} pct={it.pct} vs={`vs ${days} j précédents`} />
            ))}
          </div>

          <div class="dash-grid">
            {feature('analytics.advanced') ? (
              <TimeChart days={days} />
            ) : (
              <Panel title="Évolution jour par jour">
                <div class="upsell">
                  <Icon name="chart-column" size={26} />
                  <p>Courbes détaillées jour par jour (passages, nouveaux clients, récompenses). {includedIn('analytics.advanced')}</p>
                  {can('settings.manage') && (
                    <Btn kind="ghost" small href="#/abonnement" icon="arrow-right">
                      Voir mon abonnement
                    </Btn>
                  )}
                </div>
              </Panel>
            )}
            <Panel title="Votre programme aujourd’hui">
              <dl class="totals">
                <div>
                  <dt>Clients inscrits</dt>
                  <dd>{num(k.data.totals.customers)}</dd>
                </div>
                <div>
                  <dt>Cartes Wallet actives</dt>
                  <dd>{num(k.data.totals.wallet_passes)}</dd>
                </div>
                <div>
                  <dt>Récompenses à utiliser</dt>
                  <dd>{num(k.data.totals.rewards_available)}</dd>
                </div>
              </dl>
              <dl class="totals totals--small">
                {MORE.map((it) => (
                  <div>
                    <dt>{it.label}</dt>
                    <dd>{num(k.data!.current[it.key] as number)}</dd>
                  </div>
                ))}
              </dl>
              <p class="muted small">Sur les {days} derniers jours, sauf les trois premiers chiffres (au total).</p>
            </Panel>
          </div>
        </>
      )}

      <div class={`dash-grid dash-grid--top ${feature('support.followup') ? '' : 'dash-grid--one'}`}>
        {usage.data && <UsagePanel u={usage.data} />}
        {feature('support.followup') && <FollowUp />}
      </div>

      {!paused && (
        <Panel title="Inscription de nouveaux clients" sub="À afficher au comptoir : le client scanne ce QR code avec son téléphone et ajoute sa carte en quelques secondes.">
          <LinkBox url={joinUrl(m.merchant_slug)} note={can('settings.manage') ? <a href="#/reglages/affiche">Télécharger l’affiche du comptoir</a> : undefined} />
        </Panel>
      )}
    </div>
  );
}

const ratio = (used: number, limit: number | null) => (limit ? used / limit : 0);

/** Alertes à 80 % et 100 % des campagnes de la semaine (refusées au-delà, jusqu'à lundi). */
function QuotaAlerts({u}: {u: PlanUsage}) {
  const link = can('settings.manage') ? (
    <a href="#/abonnement" class="alert-a">
      Voir les offres
    </a>
  ) : null;
  const out = [];
  const q = u.campaigns;
  const n = q ? ratio(q.used, q.limit) : 0;
  if (q && q.limit && n >= 1)
    out.push(
      <div class="alert alert--full" role="alert">
        <Icon name="triangle-alert" />
        <p>
          <strong>
            Toutes les campagnes de la semaine sont utilisées ({num(q.used)} / {num(q.limit)}).
          </strong>{' '}
          La prochaine campagne pourra partir à partir du {mondayLabel(q.resets_at)} ; les messages automatiques continuent de partir. {link}
        </p>
      </div>,
    );
  else if (q && q.limit && n >= 0.8)
    out.push(
      <div class="alert" role="status">
        <Icon name="triangle-alert" />
        <p>
          <strong>
            {q.limit - q.used > 1 ? `Plus que ${num(q.limit - q.used)} campagnes cette semaine` : 'Plus qu’une campagne cette semaine'} ({num(q.used)} / {num(q.limit)}).
          </strong>{' '}
          Le compteur repart le {mondayLabel(q.resets_at)}. {link}
        </p>
      </div>,
    );
  return out.length ? <div class="alerts">{out}</div> : null;
}

function UsagePanel({u}: {u: PlanUsage}) {
  return (
    <Panel
      title={`Votre offre ${planLabel(u.plan)}`}
      sub="Clients et cartes illimités. Une campagne = un envoi à vos clients, quel que soit leur nombre : les messages automatiques et la proximité ne sont jamais décomptés."
      actions={
        can('settings.manage') ? (
          <Btn kind="ghost" small href="#/abonnement" icon="arrow-right">
            Abonnement
          </Btn>
        ) : undefined
      }
    >
      <div class="meters">
        {u.campaigns && (
          <UsageMeter
            label="Campagnes cette semaine"
            used={u.campaigns.used}
            limit={u.campaigns.limit}
            extra={u.campaigns.limit !== null ? ` · le compteur repart le ${mondayLabel(u.campaigns.resets_at)}` : undefined}
          />
        )}
      </div>
    </Panel>
  );
}

/** Pro : suivi personnalisé, un point mensuel de 30 minutes avec LOYNA. */
function FollowUp() {
  const m = merchant.value!;
  const offre = `LOYNA ${planLabel(m.subscription_plan)}`; // Premium (Barber Kong) a le même suivi, sous son nom
  const subject = encodeURIComponent(`Point mensuel ${offre} · ${m.merchant_name}`);
  return (
    <Panel dark class="follow">
      <p class="eyebrow">{offre}</p>
      <h2>Votre suivi LOYNA : point mensuel de 30 min</h2>
      <p class="muted">Chaque mois, faites le point avec LOYNA : vos chiffres, vos objectifs, les réglages de la récompense, et un plan d’action.</p>
      <div class="btn-row">
        <Btn kind="gold" icon="calendar-check" href={`mailto:contact@loyna.fr?subject=${subject}`}>
          Fixer mon point du mois
        </Btn>
      </div>
      <p class="plan-note">Par e-mail à contact@loyna.fr, pour fixer le rendez-vous du mois.</p>
    </Panel>
  );
}

// Colonnes quotidiennes (une seule série : le titre la nomme, pas de légende), info-bulle au survol,
// tableau équivalent pour les lecteurs d'écran.
function TimeChart({days}: {days: number}) {
  const m = merchant.value!;
  const [metric, setMetric] = useState<(typeof METRICS)[number]['value']>('visits');
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const s = useLoad(
    () => api.rpc<{status: string; points: {date: string; value: number}[]}>('analytics_timeseries', {p_metric: metric, p_days: days, p_merchant_id: m.merchant_id}),
    [metric, days, m.merchant_id],
  );
  const pts = s.data?.points ?? [];
  const max = Math.max(1, ...pts.map((p) => p.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({length: Math.round(top / step) + 1}, (_, i) => i * step);
  const W = 640;
  const H = 220;
  const L = 34;
  const B = 24;
  const band = (W - L) / Math.max(1, pts.length);
  const bw = Math.min(24, Math.max(2, band - 2));
  const y = (v: number) => H - B - (v / top) * (H - B - 10);
  const label = METRICS.find((x) => x.value === metric)!.label;
  const total = pts.reduce((a, p) => a + p.value, 0);

  return (
    <Panel
      title={`${label} par jour`}
      sub={`${num(total)} sur ${days} jours`}
      actions={
        <select class="sel-sm" value={metric} onChange={(e) => setMetric((e.target as HTMLSelectElement).value as any)} aria-label="Indicateur affiché">
          {METRICS.map((x) => (
            <option value={x.value}>{x.label}</option>
          ))}
        </select>
      }
    >
      {s.error ? (
        <ErrorBox error={s.error} retry={s.reload} />
      ) : !s.data ? (
        <Spinner />
      ) : (
        <div class="chart" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} par jour sur ${days} jours, total ${total}`}>
            {ticks.map((t) => (
              <g>
                <line x1={L} x2={W} y1={y(t)} y2={y(t)} class="grid" />
                <text x={L - 8} y={y(t) + 4} class="tick" text-anchor="end">
                  {num(t)}
                </text>
              </g>
            ))}
            {pts.map((p, i) => {
              const x = L + i * band + (band - bw) / 2;
              const h = Math.max(0, H - B - y(p.value));
              const r = Math.min(4, bw / 2, h);
              return (
                <g onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}>
                  <rect x={L + i * band} y={0} width={band} height={H - B} fill="transparent" />
                  {h > 0 && (
                    <path
                      class={`bar ${hover === i ? 'on' : ''}`}
                      d={`M${x},${H - B} V${H - B - h + r} Q${x},${H - B - h} ${x + r},${H - B - h} H${x + bw - r} Q${x + bw},${H - B - h} ${x + bw},${H - B - h + r} V${H - B} Z`}
                    />
                  )}
                </g>
              );
            })}
            <line x1={L} x2={W} y1={H - B} y2={H - B} class="axis" />
            {pts.map((p, i) =>
              i === 0 || i === pts.length - 1 || (pts.length > 10 && i === Math.floor(pts.length / 2)) ? (
                <text x={L + i * band + band / 2} y={H - 6} class="tick" text-anchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}>
                  {date(p.date, false)}
                </text>
              ) : null,
            )}
          </svg>
          {hover !== null && pts[hover] && (
            <div class="tip" style={{left: `${((L + hover * band + band / 2) / W) * 100}%`}}>
              <strong>{num(pts[hover].value)}</strong> {label.toLowerCase()}
              <span>{new Date(pts[hover].date).toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})}</span>
            </div>
          )}
          <button type="button" class="linkish small" onClick={() => setTable(!table)} aria-expanded={table}>
            {table ? 'Masquer le tableau' : 'Voir les chiffres en tableau'}
          </button>
          {table && (
            <table class="tbl tbl--compact">
              <thead>
                <tr>
                  <th>Jour</th>
                  <th class="r">{label}</th>
                </tr>
              </thead>
              <tbody>
                {pts.map((p) => (
                  <tr>
                    <td>{date(p.date)}</td>
                    <td class="r">{num(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Panel>
  );
}

function niceStep(max: number): number {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return Math.max(1, m * p);
  return 10 * p;
}
