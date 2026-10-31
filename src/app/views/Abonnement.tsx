// Abonnement : offre actuelle, quotas consommés (my_plan_usage : cartes, campagnes de la semaine), résumé Stripe
// (my_subscription), option « +500 cartes » (packs.tsx, décision d'Ewan du 2026-10-30), Parrainage LOYNA entre
// commerçants (my_referral, décision d'Ewan du 2026-10-27) et comparaison des offres Starter, Premium et Pro (prix et
// contenu : PLANS de src/data/site.ts). Factures, carte bancaire, changement d'offre et résiliation : portail Stripe.
import {CARD_PACK, PLANS, SITE, euro, nombre, quotas, type Plan} from '../../data/site';
import {Icon} from '../icons';
import {PacksPanel, packsOffered, type PackSubscription} from '../packs';
import {api, can, loadUsage, merchant, planLabel, readOnly, session, toast} from '../state';
import {Badge, Btn, ErrorBox, PageHead, Panel, Spinner, UsageMeter, useLoad} from '../ui';
import {copy, date, mondayLabel, num} from '../util';

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

// --- Parrainage LOYNA (my_referral) -------------------------------------------------------------------
interface Referral {
  status: 'OK' | 'NO_ACCOUNT';
  code?: string;
  link?: string;
  eligibility?: 'ACTIVE' | 'YEARLY' | 'NO_SUBSCRIPTION';
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
  const message = `Je vous recommande LOYNA, la carte de fidélité dans Apple Wallet et Google Wallet. Avec mon code ${r.code}, votre premier mois est offert (abonnement mensuel) : ${r.link}`;
  const doCopy = async (text: string, what: string) => toast((await copy(text)) ? `${what} copié.` : 'Copie impossible : sélectionnez le texte à la main.', 'info');
  const list = r.referrals ?? [];
  return (
    <Panel title="Parrainez un commerçant" sub="Parrainage LOYNA : 1 mois offert au parrain et au filleul, abonnements mensuels" class="ref-card">
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
          {r.eligibility === 'YEARLY'
            ? 'Le parrainage LOYNA est réservé aux abonnements mensuels : votre code sera utilisable si vous passez au paiement mensuel.'
            : 'Votre code sera utilisable dès que votre abonnement mensuel sera actif.'}{' '}
          Votre code : <b>{r.code}</b>.
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
        Le filleul saisit votre code dans le panier de loyna.fr, ou ouvre votre lien. Votre mois offert s’applique à votre facture suivante dès que votre filleul a payé sa première mensualité, en général son 2e mois ; il ne s’applique que sur un abonnement mensuel en cours, sinon il reste en attente. Conditions :{' '}
        <a href="/cgv/">CGV, article 4.8</a>.
      </p>
    </Panel>
  );
}

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
  const ro = readOnly(); // consultation opérateur : ni portail Stripe, ni changement d'offre, ni parrainage du compte

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Abonnement" />
      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Spinner />
      ) : (
        <>
          <div class={`sub-grid ${packsOffered() ? 'sub-grid--packs' : ''}`}>
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
              {ro ? (
                <p class="plan-note">Portail Stripe réservé au client{sub?.customer_email ? ` (adresse de la commande : ${sub.customer_email})` : ''}.</p>
              ) : (
                <>
                  <Btn kind="gold" icon="credit-card" href={portalUrl} block>
                    Factures, carte bancaire et offre
                  </Btn>
                  <p class="plan-note">
                    Portail sécurisé Stripe : saisissez l’adresse utilisée lors de votre commande{email ? ` (${email})` : ''}, vous recevez un lien de connexion par e-mail.
                  </p>
                </>
              )}
            </Panel>

            <Panel title="Votre consommation" sub={plan ? quotas(plan) : undefined}>
              {u ? (
                <div class="meters meters--stack">
                  <UsageMeter
                    label="Cartes"
                    used={u.cards.used}
                    limit={u.cards.limit}
                    extra={(u.cards.packs ?? 0) > 0 ? ` · dont +${nombre((u.cards.packs ?? 0) * (u.cards.pack_size ?? CARD_PACK.cards))} avec vos packs` : undefined}
                  />
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
                <li>Une carte = un client inscrit au programme (les clients supprimés ne comptent plus). Une fois la limite atteinte, les nouvelles inscriptions sont refusées.</li>
                <li>Une campagne = un envoi de notification à vos clients, quel que soit leur nombre. Le compteur repart chaque lundi. Les messages automatiques et les notifications de proximité ne sont jamais décomptés.</li>
              </ul>
            </Panel>

            <PacksPanel usage={u ?? null} sub={(sub as PackSubscription) ?? null} onDone={data.reload} />

            {!ro && <Parrainage />}

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
                  {i > current && current >= 0 && !ro && (
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
