// Rapport mensuel (Premium et Pro, fonction reports.monthly) : RPC monthly_report, mois en cours ou l'un
// des 11 précédents. Indicateurs comparés au mois précédent, passages par jour de la semaine, heures les plus
// fréquentées, clients à relancer et 3 conseils (calculés par le serveur). Version verrouillée sinon.
import {useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, can, feature, merchant} from '../state';
import {Btn, ErrorBox, Kpi, LockBadge, OffersLink, PageHead, Panel, Spinner, useLoad} from '../ui';
import {DAY_NAMES, date, num, plural} from '../util';

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
interface Report {
  status: 'OK' | 'FEATURE_NOT_AVAILABLE';
  month: string;
  label: string;
  complete: boolean;
  current: Period;
  previous: Period;
  by_day: {day: number; label: string; visits: number}[];
  top_hours: {hour: number; visits: number}[];
  best_day: string | null;
  customers_total: number;
  customers_to_win_back: number;
  rewards_waiting: number;
  tips: string[];
}

const KPIS: {key: keyof Period; label: string; def: string; pct?: boolean}[] = [
  {key: 'visits', label: 'Passages', def: 'Passages validés et non annulés dans le mois.'},
  {key: 'customers_active', label: 'Clients venus', def: 'Clients différents venus au moins une fois dans le mois.'},
  {key: 'returning_customers', label: 'Clients revenus', def: 'Clients venus au moins deux fois dans le mois.'},
  {key: 'new_customers', label: 'Nouveaux clients', def: 'Clients inscrits dans le mois.'},
  {key: 'return_rate', label: 'Taux de retour', def: 'Part des clients venus dans le mois qui sont venus au moins deux fois.', pct: true},
  {key: 'rewards_unlocked', label: 'Récompenses débloquées', def: 'Récompenses débloquées dans le mois.'},
  {key: 'rewards_redeemed', label: 'Récompenses utilisées', def: 'Récompenses utilisées en caisse dans le mois.'},
  {key: 'campaigns_sent', label: 'Campagnes envoyées', def: 'Campagnes envoyées dans le mois.'},
  {key: 'wallet_notifications_sent', label: 'Notifications Wallet', def: 'Notifications reçues par vos clients dans le mois (campagnes et messages automatiques).'},
];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Le mois en cours et les 11 précédents : valeur « AAAA-MM-01 ». */
function months(): {value: string; label: string; short: string}[] {
  const now = new Date();
  return Array.from({length: 12}, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}${k === 0 ? ' (en cours)' : ''}`,
      short: MONTHS[d.getMonth()],
    };
  });
}

export function Rapport() {
  const m = merchant.value!;
  const list = months();
  const [month, setMonth] = useState(list[0].value);
  const on = feature('reports.monthly');
  const r = useLoad(() => (on ? api.rpc<Report>('monthly_report', {p_month: month, p_merchant_id: m.merchant_id}) : Promise.resolve(null)), [month, m.merchant_id, on]);
  const prevLabel = MONTHS[(Number(month.slice(5, 7)) + 10) % 12];

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Rapport mensuel">
        {on && (
          <select class="sel-sm" value={month} onChange={(e) => setMonth((e.target as HTMLSelectElement).value)} aria-label="Mois du rapport">
            {list.map((x) => (
              <option value={x.value}>{x.label}</option>
            ))}
          </select>
        )}
      </PageHead>

      {!on ? (
        <Locked />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Spinner />
      ) : r.data.status !== 'OK' ? (
        <Locked />
      ) : (
        <>
          <p class="lead-sm">
            {r.data.complete ? `Votre mois de ${r.data.label}, comparé à ${prevLabel}.` : `Mois en cours : chiffres arrêtés au ${date(new Date().toISOString(), false)}, comparés à tout le mois de ${prevLabel}.`} Le 1er de chaque mois, le rapport du mois écoulé est aussi
            envoyé par e-mail au propriétaire du commerce.
          </p>
          <div class="kpis">
            {KPIS.map((k) => (
              <Kpi label={k.label} def={k.def} cur={r.data!.current[k.key] as number | null} prev={r.data!.previous[k.key] as number | null} pct={k.pct} vs={`vs ${prevLabel}`} />
            ))}
          </div>

          <div class="dash-grid">
            <Panel title="Passages par jour de la semaine" sub={r.data.best_day ? `Votre meilleur jour : le ${r.data.best_day}.` : 'Aucun passage ce mois-ci.'}>
              <DayBars days={r.data.by_day} />
            </Panel>
            <Panel title="Heures les plus fréquentées">
              {r.data.top_hours.length ? (
                <ol class="hours">
                  {r.data.top_hours.map((h) => (
                    <li>
                      <span>
                        {h.hour} h – {h.hour + 1} h
                      </span>
                      <b>{plural(h.visits, 'passage', 'passages')}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p class="muted">Aucun passage ce mois-ci.</p>
              )}
            </Panel>
          </div>

          <div class="dash-grid">
            <Panel title="À faire ce mois-ci" sub="Conseils calculés à partir de vos chiffres.">
              {r.data.tips.length ? (
                <ol class="tips">
                  {r.data.tips.map((t) => (
                    <li>
                      <span class="tips-i">
                        <Icon name="lightbulb" size={18} />
                      </span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p class="muted">Rien à signaler : continuez comme ça.</p>
              )}
            </Panel>
            <Panel title="Vos clients">
              <dl class="totals">
                <div>
                  <dt>Bons clients à relancer</dt>
                  <dd>{num(r.data.customers_to_win_back)}</dd>
                </div>
                <div>
                  <dt>Récompenses en attente</dt>
                  <dd>{num(r.data.rewards_waiting)}</dd>
                </div>
                <div>
                  <dt>Clients inscrits</dt>
                  <dd>{num(r.data.customers_total)}</dd>
                </div>
              </dl>
              <p class="muted small">« Bons clients à relancer » : venus au moins deux fois, mais pas depuis plus de 30 jours.</p>
              {r.data.customers_to_win_back > 0 && can('campaigns.manage') && (
                <div class="btn-row">
                  <Btn kind="primary" small icon="megaphone" href="#/campagne/nouvelle">
                    Leur écrire
                  </Btn>
                  {feature('automation.inactive') && can('settings.manage') && (
                    <Btn kind="ghost" small icon="zap" href="#/automatisations">
                      Relance automatique
                    </Btn>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/** Passages par jour de la semaine (lundi → dimanche), barres simples avec la valeur au-dessus. */
function DayBars({days}: {days: Report['by_day']}) {
  const v = DAY_NAMES.map((_, k) => days.find((x) => x.day === k + 1)?.visits ?? 0);
  const max = Math.max(1, ...v);
  const best = v.indexOf(Math.max(...v));
  return (
    <div class="bars" role="img" aria-label={`Passages par jour : ${DAY_NAMES.map((n, k) => `${n} ${v[k]}`).join(', ')}`}>
      {v.map((n, k) => (
        <div class={`bar-c ${k === best && n > 0 ? 'is-best' : ''}`}>
          <span class="bar-v">{num(n)}</span>
          <span class="bar-t">
            <span style={{height: `${Math.round((n / max) * 100)}%`}} />
          </span>
          <span class="bar-l">{DAY_NAMES[k].slice(0, 3)}.</span>
        </div>
      ))}
    </div>
  );
}

function Locked() {
  return (
    <Panel class="report-lock">
      <div class="report-lock-h">
        <span class="auto-i">
          <Icon name="file-chart-column" />
        </span>
        <div>
          <h2>Votre rapport du mois, avec 3 conseils concrets</h2>
          <p class="muted">Chaque 1er du mois, dans votre espace et par e-mail au propriétaire.</p>
        </div>
        <LockBadge feature="reports.monthly" />
      </div>
      <ul class="feat-list">
        {[
          'Nouveaux clients, passages, clients revenus et récompenses',
          'Comparaison avec le mois précédent',
          'Vos meilleurs jours et vos heures les plus fréquentées',
          'Les bons clients à relancer',
          '3 conseils concrets, calculés à partir de vos chiffres',
        ].map((t) => (
          <li>
            <Icon name="circle-check" size={18} />
            {t}
          </li>
        ))}
      </ul>
      <div class="btn-row">
        <OffersLink />
      </div>
    </Panel>
  );
}
