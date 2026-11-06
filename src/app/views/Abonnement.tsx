// Abonnement : offre et état du service (my_service_state : essai, abonnement actif, sursis, arrêt, suspension à la main,
// compte offert, un bloc par état), quotas de la semaine (my_plan_usage), résumé Stripe (my_subscription), Parrainage LOYNA
// entre commerçants (my_referral, décision d'Ewan du 2026-10-27) et comparaison des offres Starter et Pro (prix et contenu :
// PLANS de src/data/site.ts). Le changement d'offre passe par la fonction subscription-change, qui applique le tableau de la
// section 2.4 du cahier des charges : il est fermé dans le portail Stripe, qui garde factures, carte bancaire et résiliation.
// Premium : offre historique, sans grille ni changement (section 2.7), plus aucun commerce depuis le 2026-11-01.
// QR codes sous verre : commandés dans la page Boutique (views/Boutique.tsx, 2026-11-04), un lien y mène d'ici.
import {useEffect, useState} from 'preact/hooks';
import {ENGAGEMENT, LEGACY_PLANS, PHRASES, PLANS, QR_VERRE, SITE, TRIAL, euro, quotas, type Plan} from '../../data/site';
import {Icon} from '../icons';
import {api, can, choisirUrl, engagedNow, loadService, loadUsage, merchant, planLabel, portalUrl, readOnly, refreshMerchant, session, toast, type PlanCode, type ServiceState} from '../state';
import {Badge, Btn, ErrorBox, Modal, PageHead, Panel, Spinner, UsageMeter, useBusy, useLoad} from '../ui';
import {copy, date, dayLong, dayNum, mondayLabel, num} from '../util';

const SUB_STATUS: Record<string, [string, 'green' | 'amber' | 'red' | 'neutral']> = {
  active: ['Actif', 'green'],
  trialing: ['Actif', 'green'], // statut Stripe, aucun abonnement n'en a (l'essai de 1 mois se passe de Stripe)
  past_due: ['Paiement en retard', 'amber'],
  unpaid: ['Impayé', 'red'],
  canceled: ['Résilié', 'neutral'],
  incomplete: ['Paiement à finaliser', 'amber'],
  incomplete_expired: ['Paiement non abouti', 'red'],
  paused: ['En pause', 'neutral'],
};

// --- Parrainage LOYNA (my_referral) -------------------------------------------------------------------
interface Referral {
  status: 'OK' | 'NO_ACCOUNT';
  code?: string;
  link?: string;
  eligibility?: 'ACTIVE' | 'NO_SUBSCRIPTION';
  months_applied?: number;
  months_waiting?: number;
  referrals?: {name: string; status: 'en_attente_paiement' | 'gagne' | 'applique'; created_at: string; won_at: string | null; applied_at: string | null}[];
}
const REFERRAL_STATUS: Record<string, [string, 'neutral' | 'gold' | 'green']> = {
  en_attente_paiement: ['En attente de sa 1re mensualité', 'neutral'],
  gagne: ['Payé : votre mois offert arrive', 'gold'],
  applique: ['Mois offert appliqué', 'green'],
};
const mois = (n: number) => `${num(n)} mois`;

function Parrainage() {
  const data = useLoad(() => api.rpc<Referral>('my_referral'), []);
  const r = data.data;
  if (data.error) return <ErrorBox error={data.error} retry={data.reload} />;
  if (!r) return <Spinner />;
  if (r.status !== 'OK' || !r.code || !r.link) return null;
  const message = `Je vous recommande LOYNA, la carte de fidélité dans Apple Wallet et Google Wallet. Avec mon code ${r.code}, votre premier mois est offert : ${r.link}`;
  const doCopy = async (text: string, what: string) => toast((await copy(text)) ? `${what} copié.` : 'Copie impossible : sélectionnez le texte à la main.', 'info');
  const list = r.referrals ?? [];
  return (
    <Panel title="Parrainez un commerçant" sub={PHRASES.parrainage} class="ref-card">
      <ul class="ref-gains">
        <li>
          <b>1 mois offert</b>
          <span>à votre filleul : son premier mois</span>
        </li>
        <li>
          <b>1 mois offert</b>
          <span>pour vous : votre mois suivant, dès que votre filleul a payé sa première mensualité</span>
        </li>
        <li class="ref-gain-large">
          <b>+ 1 QR code offert</b>
          <span>personnalisé sous verre, à poser dans votre commerce, pour chaque filleul qui paie sa première mensualité (livré sous 15 jours)</span>
        </li>
      </ul>
      {r.eligibility === 'ACTIVE' ? (
        <>
          <div class="ref-code-row">
            <span class="ref-code" aria-label={`Votre code de parrainage : ${r.code}`}>
              {r.code}
            </span>
            <Btn kind="ghost" small icon="copy" onClick={() => doCopy(r.code!, 'Code')}>
              Copier
            </Btn>
          </div>
          <label class="fld">
            <span class="fld-l">Votre lien de parrainage</span>
            <span class="ref-link">
              <input type="text" readOnly value={r.link} onFocus={(e) => (e.target as HTMLInputElement).select()} />
              <Btn kind="ghost" small icon="copy" title="Copier le lien" onClick={() => doCopy(r.link!, 'Lien')} />
            </span>
          </label>
          <div class="btn-row">
            <Btn kind="primary" small icon="mail" href={`mailto:?subject=${encodeURIComponent('Une carte de fidélité pour votre commerce')}&body=${encodeURIComponent(message)}`}>
              Par e-mail
            </Btn>
            <Btn kind="primary" small icon="message-square" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank">
              Par WhatsApp
            </Btn>
          </div>
        </>
      ) : (
        <p class="note">
          Votre code sera utilisable dès que votre abonnement sera actif. Votre code : <b>{r.code}</b>.
        </p>
      )}
      <p class="ref-months">
        Mois offerts : <b>{mois(r.months_applied ?? 0)}</b> obtenu{(r.months_applied ?? 0) > 1 ? 's' : ''}, <b>{mois(r.months_waiting ?? 0)}</b> à venir
        {(r.months_waiting ?? 0) > 1 ? ' (un par facture, les mois s’enchaînent)' : ''}.
      </p>
      {list.length > 0 ? (
        <ul class="ref-list">
          {list.map((x) => (
            <li>
              <span>
                <strong>{x.name}</strong>
                <small>depuis le {date(x.created_at)}</small>
              </span>
              <Badge tone={REFERRAL_STATUS[x.status]?.[1] ?? 'neutral'}>{REFERRAL_STATUS[x.status]?.[0] ?? x.status}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted small">Aucun filleul pour le moment.</p>
      )}
      <p class="muted small">
        Le filleul saisit votre code dans le panier de loyna.fr{TRIAL.open ? ' ou en démarrant son essai' : ''}, ou ouvre votre lien. Votre mois offert s’applique à votre facture suivante dès que votre filleul a payé sa première mensualité, en général son 2e mois ; il ne s’applique que sur un abonnement en cours, sinon il reste en attente. Conditions :{' '}
        <a href="/cgv/">CGV, article 4.8</a>.
      </p>
    </Panel>
  );
}

/** Contenu d'une offre tel que présenté sur loyna.fr/tarifs/ (« Tout Starter, plus : … »). */
function planContent(p: Plan): string[] {
  return [...(p.focus?.items ?? []), ...p.features];
}

/** Phrase fixe des prix (au mot près sur tous les écrans), montants en gras. */
const boldPrices = (t: string) => t.split(/(\d+(?:,\d+)?\s€)/).map((x, i) => (i % 2 ? <b>{x}</b> : x));

/** Date de fin d'un engagement pris aujourd'hui. */
function inTwelveMonths(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + ENGAGEMENT.months);
  return d.toISOString();
}

// --- Changement d'offre (tableau de la section 2.4, le serveur applique les mêmes règles) -----------------------
interface Choice {
  plan: Plan;
  engage: boolean;
}
/** Choix proposés pour une offre à un abonnement `cur`. Engagement terminé : comme sans engagement, sans en reprendre un pour le même prix. */
function changeChoices(p: Plan, cur: Plan, engaged: boolean, commitmentOver: boolean): Choice[] {
  if (engaged) return cur.id === 'starter' && p.id === 'pro' ? [{plan: p, engage: true}] : [];
  if (p.id === cur.id) return commitmentOver ? [] : [{plan: p, engage: true}];
  return [
    {plan: p, engage: false},
    {plan: p, engage: true},
  ];
}

const CHANGE_REFUSED: Record<string, string> = {
  COMMITMENT_ACTIVE: 'Votre engagement est en cours : ce changement sera possible à sa fin.',
  LEGACY_PLAN: 'Votre offre historique ne se change pas ici : écrivez à contact@loyna.fr.',
  NO_SUBSCRIPTION: 'Aucun abonnement à changer pour ce commerce : choisissez une offre.',
  FORBIDDEN: 'Seul le propriétaire du commerce peut changer d’offre.',
};

function ChangeDialog({choice, cur, s, onClose, onDone}: {choice: Choice | null; cur: Plan | undefined; s: ServiceState | null; onClose: () => void; onDone: (code: PlanCode) => Promise<void>}) {
  const [busy, run] = useBusy();
  const [error, setError] = useState('');
  useEffect(() => setError(''), [choice]);
  if (!choice || !cur) return <Modal open={false} onClose={onClose} title=""><span /></Modal>;
  const {plan: p, engage} = choice;
  const engagedBefore = engagedNow(s);
  const price = engage ? p.engaged : p.monthly;
  const samePlan = p.id === cur.id;
  const down = cur.id === 'pro' && p.id === 'starter';
  const code = p.id.toUpperCase() as PlanCode;
  const confirm = () =>
    run(async () => {
      setError('');
      try {
        const r = await api.edge<{status: string; price_cents?: number; commitment_end?: string | null}>('subscription-change', {merchant_id: merchant.value!.merchant_id, plan: code, engagement: engage});
        if (r.status !== 'OK') return setError(CHANGE_REFUSED[r.status] ?? 'Changement impossible. Réessayez dans un instant.');
        toast(`C’est fait : LOYNA ${p.name}, ${euro(typeof r.price_cents === 'number' ? r.price_cents / 100 : price)} par mois, sans TVA.`);
        await onDone(code);
      } catch (e: any) {
        setError(CHANGE_REFUSED[e?.code] ?? e?.message ?? 'Changement impossible. Réessayez dans un instant.');
      }
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={samePlan ? `Prendre ${ENGAGEMENT.months} mois d’engagement` : `Passer à ${p.name}`}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>
            Annuler
          </Btn>
          <Btn kind="gold" icon="check" busy={busy} onClick={confirm}>
            {engage && !engagedBefore ? `Je m’engage pour ${ENGAGEMENT.months} mois` : `Confirmer · ${euro(price)} par mois`}
          </Btn>
        </>
      }
    >
      <div class="change-confirm">
        <p class="change-price">
          LOYNA {p.name} : <b>{euro(price)}</b> par mois, sans TVA, {engage ? `avec ${ENGAGEMENT.months} mois d’engagement` : 'sans engagement'}
        </p>
        <ul class="plain small">
          {engage && !engagedBefore && (
            <li>
              L’engagement court à partir d’aujourd’hui, jusqu’au <b>{dayLong(inTwelveMonths())}</b>. {PHRASES.engagement}
            </li>
          )}
          {engagedBefore && (
            <li>
              Votre engagement garde sa date de fin : le <b>{dayLong(s?.commitment_end)}</b>.
            </li>
          )}
          {!samePlan && <li>Le changement est immédiat : la différence est calculée au prorata, sur votre prochaine facture.</li>}
          {samePlan && <li>Le nouveau prix s’applique tout de suite, au prorata, sur votre prochaine facture.</li>}
          {down && <li>Avec Starter : plus de parrainage entre vos clients ni de messages écrits par LOYNA, 5 campagnes par semaine et 1 adresse pour la notification de proximité.</li>}
          <li>Aucune mise en service n’est facturée à un changement d’offre.</li>
        </ul>
        {error && (
          <p class="form-err" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

// --- Boutique (QR codes sous verre, page Boutique depuis le 2026-11-04) ------------------------------------------------
// Ancien retour de paiement des QR codes (?qr=merci, sessions ouvertes avant la Boutique) : lu une fois, puis retiré.
function qrPaid(): boolean {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('qr') !== 'merci') return false;
    q.delete('qr');
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`);
    return true;
  } catch {
    return false;
  }
}

function BoutiqueLink() {
  const [paid] = useState(qrPaid);
  return (
    <Panel
      title="Boutique"
      sub={`QR codes sous verre pour votre commerce : l’inscription à votre carte, à vos couleurs, et vos avis Google. Achat unique, sans TVA, livrés sous ${QR_VERRE.deliveryDays} jours.`}
      class="qrv-card"
    >
      {paid && (
        <p class="qrv-ok" role="status">
          <Icon name="circle-check" size={18} /> Merci, votre commande est enregistrée. Vos QR codes arrivent sous {QR_VERRE.deliveryDays} jours.
        </p>
      )}
      <Btn kind="ghost" icon="shopping-bag" block href="#/boutique">
        Ouvrir la Boutique
      </Btn>
    </Panel>
  );
}

// --- Bloc de l'état du service, dans le panneau « Votre offre » -------------------------------------------------
const STOP_LABEL: Record<string, string> = {
  TRIAL_ENDED: 'essai terminé',
  PAYMENT_FAILED: 'paiement non régularisé',
  SUBSCRIPTION_ENDED: 'abonnement terminé',
};

function StateBlock({s, sub, plan, manage, owner, portalLink}: {s: ServiceState; sub: any; plan: Plan | undefined; manage: boolean; owner: boolean; portalLink: string}) {
  const m = merchant.value!;
  const panier = (label: string, offer = 'starter') => (
    <Btn kind="gold" icon="arrow-right" block href={api.demo ? '/tarifs/' : choisirUrl(m.merchant_id, offer)}>
      {label}
    </Btn>
  );
  const pay = (
    <Btn kind="gold" icon="credit-card" block href={s.pay_url || portalLink} target="_blank">
      Régler ma facture
    </Btn>
  );
  switch (s.state) {
    case 'TRIAL':
      return (
        <>
          <div class="plan-meta">
            <Badge tone="gold">Essai gratuit</Badge>
            <span>sans carte bancaire</span>
          </div>
          <dl class="plan-dl">
            <div>
              <dt>Fin de l’essai</dt>
              <dd>{dayLong(s.trial_ends_at)}</dd>
            </div>
            <div>
              <dt>Jours restants</dt>
              <dd>{num(s.trial_days_left ?? 0)}</dd>
            </div>
          </dl>
          {owner && panier('Choisir mon offre')}
          <p class="plan-note">Aucun prélèvement à la fin de l’essai : sans abonnement, votre carte se met en pause. Si vous souscrivez avant, le premier paiement a lieu le jour de la souscription et les jours restants ne sont pas reportés.</p>
        </>
      );
    case 'GRACE':
      return (
        <>
          <div class="plan-meta">
            <Badge tone="amber">Paiement en retard</Badge>
            <span>votre carte fonctionne toujours</span>
          </div>
          <dl class="plan-dl">
            <div>
              <dt>Mise en pause le</dt>
              <dd>{dayLong(s.stop_at)}</dd>
            </div>
          </dl>
          {manage && pay}
          <p class="plan-note">Réglez votre facture avant cette date : la carte de vos clients continue de fonctionner sans interruption.</p>
        </>
      );
    case 'STOPPED':
      return (
        <>
          <div class="plan-meta">
            <Badge tone="red">Carte en pause</Badge>
            <span>{STOP_LABEL[s.stop_reason ?? ''] ?? ''}</span>
          </div>
          <dl class="plan-dl">
            <div>
              <dt>Depuis le</dt>
              <dd>{dayLong(s.stopped_at)}</dd>
            </div>
            <div>
              <dt>Données conservées jusqu’au</dt>
              <dd>{dayLong(s.data_delete_after)}</dd>
            </div>
          </dl>
          {s.stop_reason === 'PAYMENT_FAILED' ? manage && pay : owner && (s.stop_reason === 'SUBSCRIPTION_ENDED' ? panier('Reprendre mon abonnement', plan?.id ?? 'starter') : panier('Choisir mon offre'))}
          <p class="plan-note">
            La carte reste dans le téléphone de vos clients, avec leur solde, mais elle ne crédite plus. Tout repart automatiquement{' '}
            {s.stop_reason === 'PAYMENT_FAILED' ? 'dès que la facture est réglée' : s.stop_reason === 'SUBSCRIPTION_ENDED' ? 'dès que l’abonnement est repris' : 'dès que vous avez choisi votre offre'}.
            {manage && (
              <>
                {' '}
                <a href="#/clients">Exporter mes clients</a>
              </>
            )}
          </p>
        </>
      );
    case 'SUSPENDED_MANUAL':
      return (
        <>
          <div class="plan-meta">
            <Badge tone="red">Suspendu</Badge>
          </div>
          <p class="plan-note">
            Votre compte est suspendu par LOYNA. Écrivez à <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>
        </>
      );
    case 'EXEMPT':
      return (
        <>
          <div class="plan-meta">
            <Badge tone="green">Compte offert</Badge>
          </div>
          <p class="plan-note">Aucun abonnement à régler pour ce commerce.</p>
        </>
      );
    default:
      return <SubSummary sub={sub} s={s} plan={plan} />;
  }
}

// Prix réservé hors grille, en Pro seulement : Barber Kong, 39,99 € (prix Stripe archivé, docs/OFFRES.md § 13 du dépôt LOYNA).
// my_subscription ne donne aucun montant : le cas est écrit ici, pour éviter une migration et un commerce unique.
const PRIX_RESERVES_PRO: Record<string, number> = {'barber-kong': 39.99};

/** Résumé d'un abonnement en cours : statut, prix, échéance, engagement, fin prévue. Sans `plan` (Premium) : statut et échéances, le reste est dans sa phrase. */
function SubSummary({sub, s, plan}: {sub: any; s: ServiceState | null; plan: Plan | undefined}) {
  const reserve = plan?.id === 'pro' ? PRIX_RESERVES_PRO[merchant.value?.merchant_slug ?? ''] : undefined;
  if (sub?.status === 'NONE')
    return (
      <p class="plan-note">
        Aucun abonnement n’est encore relié à ce commerce. Une question ? Écrivez à <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
      </p>
    );
  if (sub?.status !== 'OK') return <p class="plan-note">Le détail de votre abonnement (échéances, engagement) est disponible sur le portail sécurisé.</p>;
  const commitment = s?.commitment_end ?? sub.commitment_end ?? null;
  return (
    <>
      <div class="plan-meta">
        <Badge tone={SUB_STATUS[sub.subscription_status]?.[1] ?? 'neutral'}>{SUB_STATUS[sub.subscription_status]?.[0] ?? sub.subscription_status}</Badge>
        {plan && <span>{commitment && new Date(commitment) > new Date() ? `Réglé chaque mois, ${ENGAGEMENT.months} mois d’engagement` : 'Réglé chaque mois, sans engagement'}</span>}
      </div>
      <dl class="plan-dl">
        {plan && (
          <div>
            <dt>Prix</dt>
            <dd>{euro(reserve ?? (commitment ? plan.engaged : plan.monthly))} par mois, sans TVA</dd>
          </div>
        )}
        {sub.current_period_end && !sub.cancel_at_period_end && (
          <div>
            <dt>Prochaine échéance</dt>
            <dd>{date(sub.current_period_end)}</dd>
          </div>
        )}
        {plan && commitment && new Date(commitment) > new Date() && (
          <div>
            <dt>Engagement jusqu’au</dt>
            <dd>{date(commitment)}</dd>
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
  );
}

export function Abonnement() {
  const m = merchant.value!;
  const data = useLoad(async () => {
    const [sub, usage, st] = await Promise.all([api.rpc<any>('my_subscription', {p_merchant_id: m.merchant_id}).catch(() => ({status: 'ERROR'})), loadUsage().catch(() => null), loadService()]);
    return {sub, usage, st};
  }, [m.merchant_id, m.subscription_plan]);
  const [choice, setChoice] = useState<Choice | null>(null);

  const sub = data.data?.sub;
  const u = data.data?.usage;
  const s = data.data?.st ?? null;
  const email = sub?.customer_email || session.value?.email || '';
  const portalLink = portalUrl(email);
  const current = PLANS.findIndex((p) => p.id === m.subscription_plan.toLowerCase());
  const plan = PLANS[current];
  const legacy = current === -1; // Premium : offre historique
  // Prix réservé (Barber Kong) : son offre et son prix seulement, ni grille, ni changement, ni textes de la grille
  const horsGrille = legacy || PRIX_RESERVES_PRO[m.merchant_slug ?? ''] !== undefined;
  const ro = readOnly(); // consultation opérateur : ni portail Stripe, ni changement d'offre, ni parrainage du compte
  const manage = !ro && can('settings.manage');
  const owner = !ro && m.role === 'OWNER';
  const hasSub = sub?.status === 'OK';
  const commitment = s?.commitment_end ?? (hasSub ? sub.commitment_end : null) ?? null;
  const engaged = engagedNow(s ?? {engaged: !!commitment, commitment_end: commitment});
  const commitmentOver = !!commitment && !engaged;
  const state = s?.state;
  const canChange = owner && state === 'ACTIVE' && !!s?.can_change && !!plan;
  // Pas d'abonnement à changer : l'offre se choisit au panier, relié à ce commerce (checkout-create le réserve au propriétaire)
  const noSub = state === 'TRIAL' || (state === 'STOPPED' && s?.stop_reason !== 'PAYMENT_FAILED');
  const toPanier = owner && noSub;
  const payFirst = state === 'GRACE' || (state === 'STOPPED' && s?.stop_reason === 'PAYMENT_FAILED');

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
            <div class="sub-col">
              <Panel dark class="plan-card">
                <p class="eyebrow">Votre offre</p>
                <h2 class="plan-name">LOYNA {planLabel(m.subscription_plan)}</h2>
                {legacy ? (
                  // Texte de la section 2.7 : le prix et la date qui le concernent, rien de plus
                  <p class="plan-legacy">
                    Votre offre : {LEGACY_PLANS.premium.name} (offre historique), {euro(LEGACY_PLANS.premium.monthly)} par mois
                    {commitment && engaged ? `, engagement jusqu’au ${dayNum(commitment)}` : ''}. Vous avez tout le contenu de Pro.
                  </p>
                ) : (
                  plan && <p class="plan-note">{plan.pitch}</p>
                )}
                {s ? <StateBlock s={s} sub={sub} plan={plan} manage={manage} owner={owner} portalLink={portalLink} /> : <SubSummary sub={sub} s={null} plan={plan} />}
                {(hasSub || sub?.status === 'ERROR') &&
                  (ro ? (
                    <p class="plan-note">Portail Stripe réservé au client{sub?.customer_email ? ` (adresse de la commande : ${sub.customer_email})` : ''}.</p>
                  ) : (
                    manage && (
                      <>
                        <Btn kind={payFirst ? 'ghost' : 'gold'} class={payFirst ? 'plan-portal' : undefined} icon="credit-card" href={portalLink} block>
                          {state === 'STOPPED' ? 'Factures et carte bancaire' : 'Factures, carte bancaire et résiliation'}
                        </Btn>
                        <p class="plan-note">
                          Portail sécurisé Stripe : saisissez l’adresse utilisée lors de votre commande{email ? ` (${email})` : ''}, vous recevez un lien de connexion par e-mail.
                        </p>
                      </>
                    )
                  ))}
              </Panel>

              {engaged && !horsGrille && (
                <Panel title="Mon commerce ferme" sub="Si votre commerce cesse définitivement son activité, l’engagement s’arrête." class="sub-last">
                  <ol class="plain-ol small">
                    <li>
                      Envoyez à <a href={`mailto:${SITE.email}?subject=${encodeURIComponent(`Fermeture de ${m.merchant_name} : justificatif de radiation`)}`}>{SITE.email}</a> un justificatif de radiation : extrait du Registre national des entreprises ou avis de situation INSEE.
                    </li>
                    <li>LOYNA vérifie le document et met fin à l’engagement.</li>
                    <li>Votre abonnement s’arrête à la fin du mois en cours : rien n’est dû ensuite.</li>
                  </ol>
                </Panel>
              )}

              <Panel title="Bon à savoir" class="sub-last">
                <ul class="plain small">
                  {!horsGrille && hasSub && (
                    <li>
                      {engaged
                        ? `Votre engagement court jusqu’au ${dayLong(commitment)} : une résiliation prend effet à cette date. Ensuite, même prix, résiliable à la fin de n’importe quel mois, sans nouvelle durée.`
                        : 'Résiliable à la fin de n’importe quel mois, depuis le portail sécurisé Stripe. Le mois entamé reste dû.'}
                    </li>
                  )}
                  {!horsGrille && state === 'ACTIVE' && hasSub && <li>Changement d’offre : depuis cette page, sans mise en service à payer. La différence est calculée au prorata.</li>}
                  {!horsGrille && <li>{PHRASES.arret}</li>}
                  <li>
                    Une question sur votre facture ? Écrivez à <a href={`mailto:${SITE.email}`}>{SITE.email}</a> en précisant le nom de votre commerce.
                  </li>
                </ul>
                <p class="muted small">
                  LOYNA, une marque de KOVA Elec : prix sans TVA ({SITE.vatNote}). Détails : <a href="/cgv/">conditions générales de vente</a>.
                </p>
              </Panel>
            </div>

            <div class="sub-col">
              <Panel title="Votre consommation" sub={quotas(plan ?? PLANS[PLANS.length - 1])}>
                {u ? (
                  <div class="meters meters--stack">
                    <p class="meter-t">
                      Clients inscrits : <b>{num(u.cards.used)}</b> · illimités
                    </p>
                    {u.campaigns && (
                      <UsageMeter
                        label="Campagnes cette semaine"
                        used={u.campaigns.used}
                        limit={u.campaigns.limit}
                        extra={u.campaigns.limit !== null ? ` · le compteur repart le ${mondayLabel(u.campaigns.resets_at)}` : undefined}
                      />
                    )}
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
                  <li>Une campagne = un envoi de notification à vos clients, quel que soit leur nombre. Le compteur repart chaque lundi. Les messages automatiques et les notifications de proximité ne sont jamais décomptés.</li>
                </ul>
              </Panel>

              {!ro && <Parrainage />}

              {!ro && <BoutiqueLink />}
            </div>
          </div>

          {/* Premium et prix réservé : pas de grille ni de changement. Compte offert ou suspendu à la main : rien à choisir. */}
          {!horsGrille && state !== 'EXEMPT' && state !== 'SUSPENDED_MANUAL' && (
            <section class="offers" aria-labelledby="offers-h">
              <div class="offers-h">
                <h2 id="offers-h">Les offres LOYNA</h2>
                <a href="/tarifs/" class="small">
                  Comparatif détaillé sur loyna.fr
                </a>
              </div>
              <div class="offers-grid">
                {PLANS.map((p, i) => (
                  <article class={`offer ${i === current && !noSub ? 'is-current' : ''} ${p.highlight ? 'is-hl' : ''}`}>
                    <div class="offer-top">
                      <h3>{p.name}</h3>
                      {i === current && !noSub ? <Badge tone="dark">Votre offre</Badge> : i === current && state === 'TRIAL' ? <Badge tone="dark">Votre essai</Badge> : <Badge tone="gold">{p.badge}</Badge>}
                    </div>
                    <p class="offer-pitch">{p.pitch}</p>
                    <p class="offer-price">{boldPrices(PHRASES.prix(p))}</p>
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
                    {canChange && plan && (
                      <div class="offer-b">
                        {changeChoices(p, plan, engaged, commitmentOver).map((c) => (
                          <Btn kind={c.engage ? 'ghost' : 'gold'} block icon={c.engage ? 'calendar-check' : 'arrow-right'} onClick={() => setChoice(c)}>
                            {p.id === plan.id ? `Prendre ${ENGAGEMENT.months} mois d’engagement · ${euro(p.engaged)}` : c.engage ? `Passer à ${p.name} avec engagement · ${euro(p.engaged)}` : `Passer à ${p.name} · ${euro(p.monthly)}`}
                          </Btn>
                        ))}
                      </div>
                    )}
                    {toPanier && (
                      <div class="offer-b">
                        <Btn kind="gold" block icon="arrow-right" href={api.demo ? '/tarifs/' : choisirUrl(m.merchant_id, p.id)}>
                          Choisir {p.name} · {euro(p.monthly)}
                        </Btn>
                        <Btn kind="ghost" block icon="calendar-check" href={api.demo ? '/tarifs/' : choisirUrl(m.merchant_id, p.id, true)}>
                          Avec {ENGAGEMENT.months} mois d’engagement · {euro(p.engaged)}
                        </Btn>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <ul class="plain small offers-notes">
                {plan?.id !== 'pro' && <li>{PHRASES.pourquoiPro}</li>}
                <li>{PHRASES.engagement}</li>
                {toPanier && (
                  <li>
                    {state === 'STOPPED' && s?.stop_reason === 'SUBSCRIPTION_ENDED' ? 'La mise en service n’est jamais refacturée à qui reprend un abonnement.' : `Mise en service : ${PHRASES.miseEnService}`}
                  </li>
                )}
                {manage && state === 'ACTIVE' && engaged && (
                  <li>
                    Pendant votre engagement (jusqu’au {dayLong(commitment)}), {plan?.id === 'starter' ? 'vous pouvez passer à Pro avec engagement, à la même date de fin. Le retour à Starter ou la sortie de l’engagement sont possibles' : 'le retour à Starter ou la sortie de l’engagement sont possibles'} à partir de cette date.
                  </li>
                )}
                {!ro && !owner && (state === 'ACTIVE' || noSub) && <li>Seul le propriétaire du commerce peut choisir ou changer l’offre.</li>}
                {manage && payFirst && <li>Réglez d’abord votre facture pour changer d’offre.</li>}
              </ul>
            </section>
          )}

          <ChangeDialog
            choice={choice}
            cur={plan}
            s={s}
            onClose={() => setChoice(null)}
            onDone={async (code) => {
              setChoice(null);
              await refreshMerchant(code).catch(() => {});
              data.reload();
            }}
          />
        </>
      )}
    </div>
  );
}
