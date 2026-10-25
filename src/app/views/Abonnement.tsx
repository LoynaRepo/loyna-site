// Abonnement : offre actuelle, quotas consommés (my_plan_usage), résumé Stripe (my_subscription) et
// comparaison des offres Starter, Premium et Pro (prix et contenu : PLANS de src/data/site.ts). Factures,
// carte bancaire, changement d'offre et résiliation : portail Stripe, comme avant.
import {PLANS, SITE, euro, quotas, type Plan} from '../../data/site';
import {Icon} from '../icons';
import {api, can, loadUsage, merchant, planLabel, session} from '../state';
import {Badge, Btn, ErrorBox, PageHead, Panel, Spinner, UsageMeter, useLoad} from '../ui';
import {date, num, resetDay} from '../util';

const SUB_STATUS: Record<string, [string, 'green' | 'amber' | 'red' | 'neutral']> = {
  active: ['Actif', 'green'],
  trialing: ['Période d’essai', 'green'],
  past_due: ['Paiement en retard', 'amber'],
  unpaid: ['Impayé', 'red'],
  canceled: ['Résilié', 'neutral'],
  incomplete: ['Paiement à finaliser', 'amber'],
  incomplete_expired: ['Paiement non abouti', 'red'],
  paused: ['En pause', 'neutral'],
};

/** Contenu d'une offre tel que présenté sur loyna.fr/tarifs/ (« Tout Starter, plus : … »). */
function planContent(p: Plan): string[] {
  return [...(p.focus?.items ?? []), ...p.features];
}

export function Abonnement({portal}: {portal: string}) {
  const m = merchant.value!;
  const data = useLoad(async () => {
    const [sub, usage] = await Promise.all([
      api.rpc<any>('my_subscription', {p_merchant_id: m.merchant_id}).catch(() => ({status: 'ERROR'})),
      loadUsage().catch(() => null),
    ]);
    return {sub, usage};
  }, [m.merchant_id]);

  const email = data.data?.sub?.customer_email || session.value?.email || '';
  const portalUrl = email ? `${portal}?prefilled_email=${encodeURIComponent(email)}` : portal;
  const current = PLANS.findIndex((p) => p.id === m.subscription_plan.toLowerCase());
  const plan = PLANS[current];
  const sub = data.data?.sub;
  const u = data.data?.usage;

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Abonnement" />
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Spinner />
      ) : (
        <>
          <div class="sub-grid">
            <Panel dark class="plan-card">
              <p class="eyebrow">Votre offre</p>
              <h2 class="plan-name">LOYNA {planLabel(m.subscription_plan)}</h2>
              {plan && <p class="plan-note">{plan.pitch}</p>}
              {sub?.status === 'OK' ? (
                <>
                  <div class="plan-meta">
                    <Badge tone={SUB_STATUS[sub.subscription_status]?.[1] ?? 'neutral'}>{SUB_STATUS[sub.subscription_status]?.[0] ?? sub.subscription_status}</Badge>
                    <span>{sub.billing_period === 'yearly' ? 'Paiement annuel' : 'Paiement mensuel'}</span>
                  </div>
                  <dl class="plan-dl">
                    {sub.current_period_end && !sub.cancel_at_period_end && (
                      <div>
                        <dt>Prochaine échéance</dt>
                        <dd>{date(sub.current_period_end)}</dd>
                      </div>
                    )}
                    {sub.commitment_end && new Date(sub.commitment_end) > new Date() && (
                      <div>
                        <dt>Engagement jusqu’au</dt>
                        <dd>{date(sub.commitment_end)}</dd>
                      </div>
                    )}
                    {(sub.cancel_at || sub.cancel_at_period_end) && (
                      <div>
                        <dt>Fin d’abonnement prévue</dt>
                        <dd>{date(sub.cancel_at ?? sub.current_period_end)}</dd>
                      </div>
                    )}
                  </dl>
                </>
              ) : (
                <p class="plan-note">Le détail de votre abonnement (échéances, engagement) est disponible sur le portail sécurisé.</p>
              )}
              <Btn kind="gold" icon="credit-card" href={portalUrl} block>
                Factures, carte bancaire et offre
              </Btn>
              <p class="plan-note">
                Portail sécurisé Stripe : saisissez l’adresse utilisée lors de votre commande{email ? ` (${email})` : ''}, vous recevez un lien de connexion par e-mail.
              </p>
            </Panel>

            <Panel title="Votre consommation" sub={plan ? quotas(plan) : undefined}>
              {u ? (
                <div class="meters meters--stack">
                  <UsageMeter label="Cartes" used={u.cards.used} limit={u.cards.limit} />
                  <UsageMeter
                    label="Notifications ce mois-ci"
                    used={u.notifications.used}
                    limit={u.notifications.limit}
                    extra={u.notifications.limit !== null ? ` · recharge le ${resetDay(u.notifications.resets_at)}` : undefined}
                  />
                  <p class="meter-t">
                    Boutiques (notification de proximité) : <b>{num(u.locations.used)}</b>
                    {u.locations.limit === null ? '' : ` / ${num(u.locations.limit)}`}
                    {can('settings.manage') && (
                      <>
                        {' '}
                        · <a href="#/reglages">gérer</a>
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <p class="muted small">Consommation indisponible pour le moment.</p>
              )}
              <ul class="plain small">
                <li>Une carte = un client inscrit au programme (les clients supprimés ne comptent plus). Une fois la limite atteinte, les nouvelles inscriptions sont refusées.</li>
                <li>Une notification = un message de campagne reçu par une carte. Les messages automatiques et les notifications de proximité ne sont jamais décomptés.</li>
              </ul>
            </Panel>

            <Panel title="Bon à savoir">
              <ul class="plain small">
                <li>Paiement mensuel : engagement de 12 mois, puis résiliable à la fin de chaque mois, sans frais.</li>
                <li>Paiement annuel : 12 mois payés d’avance, reconduits sauf résiliation avant l’échéance.</li>
                <li>Changement d’offre depuis le portail : la différence est calculée au prorata.</li>
                <li>
                  Une question sur votre facture ? Écrivez à <a href={`mailto:${SITE.email}`}>{SITE.email}</a> en précisant le nom de votre commerce.
                </li>
              </ul>
              <p class="muted small">
                LOYNA, une marque de KOVA Elec : prix sans TVA ({SITE.vatNote}). Détails : <a href="/cgv/">conditions générales de vente</a>.
              </p>
            </Panel>
          </div>

          <section class="offers" aria-labelledby="offers-h">
            <div class="offers-h">
              <h2 id="offers-h">Les offres LOYNA</h2>
              <a href="/tarifs/" class="small">
                Comparatif détaillé sur loyna.fr
              </a>
            </div>
            <div class="offers-grid">
              {PLANS.map((p, i) => (
                <article class={`offer ${i === current ? 'is-current' : ''} ${p.highlight ? 'is-hl' : ''}`}>
                  <div class="offer-top">
                    <h3>{p.name}</h3>
                    {i === current ? <Badge tone="dark">Votre offre</Badge> : p.badge ? <Badge tone="gold">{p.badge}</Badge> : null}
                  </div>
                  <p class="offer-pitch">{p.pitch}</p>
                  <p class="offer-price">
                    <b>{euro(p.monthly)}</b> par mois, sans TVA
                    <small>ou {euro(p.yearly)} par an (−15 %)</small>
                  </p>
                  <p class="offer-q">{quotas(p)}</p>
                  {p.intro && <p class="offer-intro">{p.intro}</p>}
                  <ul class="feat-list">
                    {planContent(p).map((f) => (
                      <li>
                        <Icon name="circle-check" size={18} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {i > current && current >= 0 && (
                    <Btn kind={p.highlight ? 'gold' : 'primary'} href={portalUrl} block icon="arrow-right">
                      Passer à {p.name}
                    </Btn>
                  )}
                </article>
              ))}
            </div>
            <p class="muted small">Le changement d’offre se fait sur le portail sécurisé Stripe, avec la même adresse e-mail : la différence est calculée au prorata.</p>
          </section>
        </>
      )}
    </div>
  );
}
