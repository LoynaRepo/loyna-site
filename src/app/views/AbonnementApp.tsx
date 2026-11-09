// Abonnement dans l'application mobile (iPhone, Android) : lecture seule. Offre, état du service, échéance, engagement et
// campagnes de la semaine ; aucun bouton ni lien de paiement, d'offre ou de portail (règle 3.1.1 d'Apple, paiements de
// Google Play). Sur loyna.fr, c'est toujours views/Abonnement.tsx qui s'affiche (App.tsx choisit selon noPurchaseUI()).
import {api, loadService, loadUsage, merchant, planLabel, type ServiceState} from '../state';
import {Badge, ErrorBox, PageHead, Panel, Spinner, UsageMeter, useLoad} from '../ui';
import {dayLong, mondayLabel} from '../util';
import {MANAGED_OUTSIDE} from '../native';

interface Sub {
  status: string;
  subscription_status?: string;
  cancel_at_period_end?: boolean;
  cancel_at?: string | null;
  current_period_end?: string | null;
  commitment_end?: string | null;
}

const STATE_LABEL: Record<string, [string, 'green' | 'amber' | 'red' | 'gold' | 'neutral']> = {
  TRIAL: ['Essai gratuit', 'gold'],
  ACTIVE: ['Abonnement actif', 'green'],
  GRACE: ['Paiement en attente', 'amber'],
  STOPPED: ['Carte en pause', 'red'],
  SUSPENDED_MANUAL: ['Compte suspendu', 'red'],
  EXEMPT: ['Compte offert par LOYNA', 'green'],
};

export function AbonnementApp() {
  const m = merchant.value!;
  const data = useLoad(async () => {
    const [sub, usage, st] = await Promise.all([
      api.rpc<Sub>('my_subscription', {p_merchant_id: m.merchant_id}).catch(() => ({status: 'ERROR'}) as Sub),
      loadUsage().catch(() => null),
      loadService(),
    ]);
    return {sub, usage, st};
  }, [m.merchant_id, m.subscription_plan]);

  if (data.error) return <ErrorBox error={data.error} retry={data.reload} />;
  if (!data.data) return <Spinner />;
  const {sub, usage, st} = data.data;
  const s: ServiceState | null = st;
  const [label, tone] = STATE_LABEL[s?.state ?? ''] ?? ['Abonnement', 'neutral'];
  const lines: [string, string][] = [];
  if (s?.state === 'TRIAL' && s.trial_ends_at) lines.push(['Fin de l’essai', dayLong(s.trial_ends_at)]);
  if (sub.status === 'OK') {
    if (sub.cancel_at_period_end || sub.cancel_at) lines.push(['Fin de l’abonnement', dayLong(sub.cancel_at ?? sub.current_period_end)]);
    else if (sub.current_period_end && s?.state !== 'STOPPED') lines.push(['Prochaine échéance', dayLong(sub.current_period_end)]);
  }
  const commitment = s?.commitment_end ?? (sub.status === 'OK' ? sub.commitment_end : null);
  if (commitment && new Date(commitment).getTime() > Date.now()) lines.push(['Engagement jusqu’au', dayLong(commitment)]);
  if (s?.state === 'GRACE' && s.stop_at) lines.push(['Mise en pause prévue le', dayLong(s.stop_at)]);
  if (s?.state === 'STOPPED' && s.data_delete_after) lines.push(['Données conservées jusqu’au', dayLong(s.data_delete_after)]);

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Abonnement" />
      <Panel title={`LOYNA ${planLabel(s?.plan ?? m.subscription_plan)}`}>
        <p>
          <Badge tone={tone}>{label}</Badge>
        </p>
        {lines.length > 0 && (
          <dl class="plan-dl">
            {lines.map(([k, v]) => (
              <div>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p class="note">{MANAGED_OUTSIDE}</p>
      </Panel>
      {usage?.campaigns && (
        <Panel title="Votre offre cette semaine">
          <UsageMeter
            label="Campagnes cette semaine"
            used={usage.campaigns.used}
            limit={usage.campaigns.limit}
            extra={usage.campaigns.limit !== null ? ` · le compteur repart le ${mondayLabel(usage.campaigns.resets_at)}` : undefined}
          />
        </Panel>
      )}
      <Panel title="Une question ?">
        <p class="muted">
          Écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a> en précisant le nom de votre commerce.
        </p>
      </Panel>
    </div>
  );
}
