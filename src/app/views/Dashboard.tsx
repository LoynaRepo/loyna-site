// Accueil : indicateurs de la période (avec la période précédente), consommation de l'offre (cartes,
// notifications du mois) avec alertes à 80 % et 100 %, courbe quotidienne et suivi LOYNA (Pro).
// Définitions des indicateurs : en-tête de supabase/migrations/…_analytics.sql (dépôt LOYNA).
import {useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, can, feature, includedIn, loadUsage, merchant, planLabel, type PlanUsage} from '../state';
import {Btn, ErrorBox, Kpi, LinkBox, Panel, Segmented, Spinner, UsageMeter, useLoad} from '../ui';
import {date, joinUrl, num, resetDay} from '../util';

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

export function Dashboard() {
  const m = merchant.value!;
  const [days, setDays] = useState(30);
  const k = useLoad(() => api.rpc<Kpis>('dashboard_kpis', {p_days: days, p_merchant_id: m.merchant_id}), [days, m.merchant_id]);
  const usage = useLoad(() => loadUsage().catch(() => null), [m.merchant_id]);
  const hour = new Date().getHours();
  const hello = hour < 5 || hour >= 18 ? 'Bonsoir' : 'Bonjour';

  return (
    <div class="page">
      <header class="ph">
        <div class="ph-t">
          <p class="eyebrow">{m.merchant_name}</p>
          <h1>
            {hello} {m.display_name}
          </h1>
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

      {can('scan.validate') && (
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

      {usage.data && <QuotaAlerts u={usage.data} />}

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

      <Panel title="Inscription de nouveaux clients" sub="À afficher au comptoir : le client scanne ce QR code avec son téléphone et ajoute sa carte en quelques secondes.">
        <LinkBox url={joinUrl(m.merchant_slug)} note={can('settings.manage') ? <a href="#/reglages">Télécharger l’affiche du comptoir</a> : undefined} />
      </Panel>
    </div>
  );
}

const ratio = (used: number, limit: number | null) => (limit ? used / limit : 0);

/** Alertes à 80 % et 100 % des cartes et des notifications du mois (inscriptions et campagnes refusées au-delà). */
function QuotaAlerts({u}: {u: PlanUsage}) {
  const link = can('settings.manage') ? (
    <a href="#/abonnement" class="alert-a">
      Voir les offres
    </a>
  ) : null;
  const out = [];
  const c = ratio(u.cards.used, u.cards.limit);
  if (u.cards.limit && c >= 1)
    out.push(
      <div class="alert alert--full" role="alert">
        <Icon name="triangle-alert" />
        <p>
          <strong>
            Toutes les cartes de votre offre sont utilisées ({num(u.cards.used)} / {num(u.cards.limit)}).
          </strong>{' '}
          Les nouvelles inscriptions sont refusées : passez à l’offre supérieure pour accueillir de nouveaux clients. {link}
        </p>
      </div>,
    );
  else if (u.cards.limit && c >= 0.8)
    out.push(
      <div class="alert" role="status">
        <Icon name="triangle-alert" />
        <p>
          <strong>
            {Math.floor(c * 100)} % de vos cartes sont utilisées ({num(u.cards.used)} / {num(u.cards.limit)}).
          </strong>{' '}
          Au-delà de {num(u.cards.limit)}, les nouvelles inscriptions seront refusées. {link}
        </p>
      </div>,
    );
  const n = ratio(u.notifications.used, u.notifications.limit);
  if (u.notifications.limit && n >= 1)
    out.push(
      <div class="alert alert--full" role="alert">
        <Icon name="triangle-alert" />
        <p>
          <strong>Quota de notifications du mois atteint ({num(u.notifications.limit)}).</strong> Les campagnes sont refusées jusqu’au {resetDay(u.notifications.resets_at)} ; les messages automatiques continuent de partir. {link}
        </p>
      </div>,
    );
  else if (u.notifications.limit && n >= 0.8)
    out.push(
      <div class="alert" role="status">
        <Icon name="triangle-alert" />
        <p>
          <strong>
            {Math.floor(n * 100)} % de vos notifications du mois sont utilisées ({num(u.notifications.used)} / {num(u.notifications.limit)}).
          </strong>{' '}
          Une campagne qui dépasse le reste ({num(u.notifications.remaining ?? 0)}) sera refusée. Recharge le {resetDay(u.notifications.resets_at)}. {link}
        </p>
      </div>,
    );
  return out.length ? <div class="alerts">{out}</div> : null;
}

function UsagePanel({u}: {u: PlanUsage}) {
  return (
    <Panel
      title={`Votre offre ${planLabel(u.plan)}`}
      sub="Une carte = un client inscrit. Une notification = un message de campagne reçu par une carte : les messages automatiques et la proximité ne sont jamais décomptés."
      actions={
        can('settings.manage') ? (
          <Btn kind="ghost" small href="#/abonnement" icon="arrow-right">
            Abonnement
          </Btn>
        ) : undefined
      }
    >
      <div class="meters">
        <UsageMeter label="Cartes" used={u.cards.used} limit={u.cards.limit} />
        <UsageMeter
          label="Notifications ce mois-ci"
          used={u.notifications.used}
          limit={u.notifications.limit}
          extra={u.notifications.limit !== null ? ` · recharge le ${resetDay(u.notifications.resets_at)}` : undefined}
        />
      </div>
    </Panel>
  );
}

/** Pro : suivi personnalisé, un point mensuel de 30 minutes avec LOYNA. */
function FollowUp() {
  const m = merchant.value!;
  const subject = encodeURIComponent(`Point mensuel LOYNA Pro · ${m.merchant_name}`);
  return (
    <Panel dark class="follow">
      <p class="eyebrow">LOYNA Pro</p>
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
