// Abonnement : formule et fonctions incluses, résumé Stripe (my_subscription), accès au portail
// Stripe pour les factures, la carte bancaire, le changement de formule et la résiliation.
import {Icon} from '../icons';
import {api, merchant, session} from '../state';
import {Badge, Btn, ErrorBox, PageHead, Panel, Spinner, useLoad} from '../ui';
import {date, num} from '../util';

const PLAN = {ESSENTIEL: 'Essentiel', GROWTH: 'Growth', PRO: 'Pro'} as const;
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
// Fonctions techniques non pertinentes pour le commerçant
const HIDDEN = new Set(['sms.monthly_quota', 'scanner', 'dashboard', 'rewards', 'enrollment.qr']);

export function Abonnement({portal}: {portal: string}) {
  const m = merchant.value!;
  const data = useLoad(async () => {
    const [sub, catalog] = await Promise.all([
      api.rpc<any>('my_subscription', {p_merchant_id: m.merchant_id}).catch(() => ({status: 'ERROR'})),
      api.select<{feature: string; description: string}>('features_catalog'),
    ]);
    return {sub, catalog};
  }, [m.merchant_id]);

  const email = data.data?.sub?.customer_email || session.value?.email || '';
  const portalUrl = email ? `${portal}?prefilled_email=${encodeURIComponent(email)}` : portal;
  const quota = m.features['sms.monthly_quota'];

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Abonnement" />
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Spinner />
      ) : (
        <div class="sub-grid">
          <Panel dark class="plan-card">
            <p class="eyebrow">Votre formule</p>
            <h2 class="plan-name">LOYNA {PLAN[m.subscription_plan]}</h2>
            {data.data.sub.status === 'OK' ? (
              <>
                <div class="plan-meta">
                  <Badge tone={SUB_STATUS[data.data.sub.subscription_status]?.[1] ?? 'neutral'}>{SUB_STATUS[data.data.sub.subscription_status]?.[0] ?? data.data.sub.subscription_status}</Badge>
                  <span>{data.data.sub.billing_period === 'yearly' ? 'Paiement annuel' : 'Paiement mensuel'}</span>
                </div>
                <dl class="plan-dl">
                  {data.data.sub.current_period_end && !data.data.sub.cancel_at_period_end && (
                    <div>
                      <dt>Prochaine échéance</dt>
                      <dd>{date(data.data.sub.current_period_end)}</dd>
                    </div>
                  )}
                  {data.data.sub.commitment_end && new Date(data.data.sub.commitment_end) > new Date() && (
                    <div>
                      <dt>Engagement jusqu’au</dt>
                      <dd>{date(data.data.sub.commitment_end)}</dd>
                    </div>
                  )}
                  {(data.data.sub.cancel_at || data.data.sub.cancel_at_period_end) && (
                    <div>
                      <dt>Fin d’abonnement prévue</dt>
                      <dd>{date(data.data.sub.cancel_at ?? data.data.sub.current_period_end)}</dd>
                    </div>
                  )}
                </dl>
              </>
            ) : (
              <p class="plan-note">Le détail de votre abonnement (échéances, engagement) est disponible sur le portail sécurisé.</p>
            )}
            <Btn kind="gold" icon="credit-card" href={portalUrl} block>
              Factures, carte bancaire et formule
            </Btn>
            <p class="plan-note">
              Portail sécurisé Stripe : saisissez l’adresse utilisée lors de votre commande{email ? ` (${email})` : ''}, vous recevez un lien de connexion par e-mail.
            </p>
          </Panel>

          <Panel title="Inclus dans votre formule">
            <ul class="feat-list">
              {data.data.catalog
                .filter((f) => m.features[f.feature]?.enabled && !HIDDEN.has(f.feature))
                .map((f) => (
                  <li>
                    <Icon name="circle-check" size={18} />
                    {f.description}
                    {f.feature === 'sms' && quota?.limit ? ` (${num(quota.limit)} SMS par mois)` : ''}
                  </li>
                ))}
            </ul>
            <div class="btn-row">
              <Btn kind="ghost" small icon="arrow-right" href="/tarifs/">
                Comparer les formules
              </Btn>
            </div>
          </Panel>

          <Panel title="Bon à savoir">
            <ul class="plain small">
              <li>Formule mensuelle : engagement de 12 mois, puis résiliable à la fin de chaque mois, sans frais.</li>
              <li>Formule annuelle : résiliation effective à la fin de la période payée.</li>
              <li>Changement de formule depuis le portail : la différence est calculée au prorata.</li>
              <li>
                Une question sur votre facture ? Écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a> en précisant le nom de votre commerce.
              </li>
            </ul>
            <p class="muted small">
              Détails : <a href="/cgv/">conditions générales de vente</a>.
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
