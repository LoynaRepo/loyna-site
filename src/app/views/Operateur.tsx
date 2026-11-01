// Écran « Opérateur » (décision d'Ewan du 2026-10-27), réservé aux opérateurs LOYNA (table platform_admins du dépôt
// LOYNA) : commandes à traiter (RPC op_orders), création du commerce d'un client à partir de sa commande (formulaire
// prérempli, aperçu de la carte, logo, adresse d'inscription → Edge Function merchant-bootstrap), accès du
// propriétaire (lien « Choisir mon mot de passe », e-mail « Votre carte LOYNA est prête » : action send_access) et
// commerces existants (RPC op_merchants), dont l'espace s'ouvre en consultation, lecture seule (« Ouvrir son espace »,
// demande d'Ewan du 2026-10-29 : op_merchant_context). Le serveur contrôle chaque appel : l'onglet n'est qu'un affichage.
// Grille du 2026-10-31 : essais et arrêts visibles dans la liste, « Gérer » pour suspendre et lever, exempter (compte offert),
// prolonger l'essai ou la conservation, sortie d'engagement pour fermeture, préparer une campagne pour un Pro (RPC op_*,
// journal d'audit côté serveur). Création limitée à Starter et Pro.
import type {ComponentChildren} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {CARD_ACCENTS, CARD_ACTIVITES, CARD_BGS, normalizeOffer} from '../../data/site';
import {STATUS} from '../Commande';
import {Icon} from '../icons';
import {LOGO_ACCEPT, LOGO_MIN_SIDE, logoToFiles, type LogoFiles} from '../logo-png';
import {idDuLien, lireCartePreparee} from '../../lib/carte-preparee';
import {api, go, merchant, openConsultation, PLAN_ORDER, planLabel, rememberMerchant, staffCtx, toast, toastError, type PlanCode} from '../state';
import {campaignName, sendAt, tempsForts} from '../temps-forts';
import {Badge, Btn, CardPreview, Empty, ErrorBox, Field, LinkBox, Modal, PageHead, Panel, Segmented, Spinner, Toggle, useBusy, useLoad} from '../ui';
import {contrast, copy, date, dayLong, download, euros, initials, joinUrl, localInput, num, phoneFr, plural, qrSvg} from '../util';

interface OrderItem {
  lookup_key: string | null;
  label: string;
  quantity: number;
  amount: number | null;
}
interface OpAccount {
  user_id: string;
  email: string;
  email_confirmed: boolean;
  display_name: string | null;
  business_name: string | null;
  found_by: 'order' | 'email';
  owned_merchants: number;
}
interface OpReferral {
  code: string;
  status: 'en_attente_paiement' | 'gagne' | 'applique' | 'annule';
  referrer_name: string | null;
  referrer_email: string | null;
}
export interface OpOrder {
  id: string;
  business_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  plan: PlanCode;
  status: string;
  ordered_at: string;
  current_period_end: string | null;
  commitment_end: string | null;
  cancel_at: string | null;
  source: string | null;
  items: OrderItem[];
  account: OpAccount | null;
  referral: OpReferral | null;
}
export interface OpMerchant {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  business_type: string | null;
  subscription_plan: PlanCode;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  created_at: string;
  cards: number;
  owner_email: string | null;
  owner_status: 'INVITED' | 'ACTIVE' | 'DISABLED' | null;
  subscription_status: string | null;
  is_member: boolean;
  /** Date de fin de l'essai (passée si l'essai est terminé), null sans essai. */
  trial_ends_at: string | null;
  billing_exempt: boolean;
  service_stop_source: 'AUTO' | 'MANUAL' | null;
  service_stop_reason: 'TRIAL_ENDED' | 'PAYMENT_FAILED' | 'SUBSCRIPTION_ENDED' | 'OPERATOR' | null;
  data_delete_after: string | null;
  siret: string | null;
}
export interface Created {
  status: 'CREATED';
  merchant_id: string;
  slug: string;
  join_url: string;
  orders_linked: number;
  subscription_plan: PlanCode;
  owner: {user_id: string; account_created: boolean; setup_link: string};
}

const REF_STATUS: Record<OpReferral['status'], string> = {
  en_attente_paiement: 'premier mois offert, en attente de sa première mensualité',
  gagne: 'première mensualité payée : mois offert du parrain à venir',
  applique: 'mois offert du parrain posé',
  annule: 'annulé',
};
const STOP_REASON: Record<string, string> = {TRIAL_ENDED: 'essai terminé', PAYMENT_FAILED: 'paiement échoué', SUBSCRIPTION_ENDED: 'abonnement terminé', OPERATOR: 'suspendu à la main'};
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const MAX_STAMPS = 100;

/** « Barber & Co » → « barber-et-co » (adresse d'inscription loyna.fr/join/…). */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/, '');
}
/** Première adresse libre : barber-kong, barber-kong-2, barber-kong-3… */
function freeSlug(base: string, taken: Set<string>): string {
  if (!base) return '';
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now() % 10000}`;
}
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
/**
 * Type de la récompense déduit de son libellé : « -10 € » → remise de 10 €, « -15 % » → remise de 15 %, sinon
 * produit ou service offert. Affiché sous le champ : l'opérateur voit ce qui sera enregistré.
 */
export function rewardKind(label: string): {reward_type: 'FREE_ITEM' | 'DISCOUNT_AMOUNT' | 'DISCOUNT_PERCENT'; value?: number} {
  const t = label.trim();
  const eur = /^[-–]?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euros?)(?![a-zà-ÿ])/i.exec(t);
  if (eur) return {reward_type: 'DISCOUNT_AMOUNT', value: Number(eur[1].replace(',', '.'))};
  const pct = /^[-–]?\s*(\d{1,3}(?:[.,]\d)?)\s*%/.exec(t);
  if (pct && Number(pct[1].replace(',', '.')) <= 100) return {reward_type: 'DISCOUNT_PERCENT', value: Number(pct[1].replace(',', '.'))};
  return {reward_type: 'FREE_ITEM'};
}
/** Identifiant du futur commerce (UUID v4) : le logo est téléversé dans son dossier avant la création. */
function newMerchantId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function Operateur() {
  const [tab, setTab] = useState<'commandes' | 'commerces'>('commandes');
  const [creating, setCreating] = useState<{order: OpOrder | null} | null>(null);
  const data = useLoad(async () => {
    const [o, m] = await Promise.all([api.rpc<{orders: OpOrder[]}>('op_orders'), api.rpc<{merchants: OpMerchant[]}>('op_merchants')]);
    return {orders: o?.orders ?? [], merchants: m?.merchants ?? []};
  });
  useEffect(() => window.scrollTo({top: 0}), [creating]);

  if (data.error)
    return (
      <div class="page">
        <PageHead eyebrow="LOYNA" title="Opérateur" />
        <ErrorBox error={data.error} retry={data.reload} />
      </div>
    );
  if (!data.data) return <Spinner label="Chargement des commandes…" />;
  if (creating)
    return (
      <CreateMerchant
        order={creating.order}
        merchants={data.data.merchants}
        onClose={() => {
          setCreating(null);
          data.reload();
        }}
      />
    );

  const {orders, merchants} = data.data;
  return (
    <div class="page">
      <PageHead eyebrow="LOYNA · réservé aux opérateurs" title="Opérateur">
        <Btn kind="ghost" small icon="refresh-cw" busy={data.loading} onClick={data.reload}>
          Actualiser
        </Btn>
        <Btn kind="ghost" small icon="plus" onClick={() => setCreating({order: null})}>
          Commerce sans commande
        </Btn>
      </PageHead>
      <Segmented
        label="Affichage"
        value={tab}
        onChange={setTab}
        options={[
          {value: 'commandes', label: `Commandes à traiter (${orders.length})`},
          {value: 'commerces', label: `Commerces (${merchants.length})`},
        ]}
      />
      {tab === 'commandes' ? <Orders orders={orders} onCreate={(o) => setCreating({order: o})} /> : <Merchants list={merchants} reload={data.reload} />}
    </div>
  );
}

// --- Commandes à traiter --------------------------------------------------------------------------------
function Orders({orders, onCreate}: {orders: OpOrder[]; onCreate: (o: OpOrder) => void}) {
  if (!orders.length)
    return (
      <Empty icon="circle-check" title="Aucune commande à traiter">
        Les abonnements payés sur loyna.fr apparaissent ici tant que leur commerce n’est pas créé.
      </Empty>
    );
  return (
    <div class="op-list">
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} onCreate={() => onCreate(o)} />
      ))}
    </div>
  );
}

function Row({k, children}: {k: string; children: ComponentChildren}) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function OrderCard({order: o, onCreate}: {order: OpOrder; onCreate: () => void}) {
  const [label, tone] = STATUS[o.status] ?? [o.status, 'neutral'];
  const qr = (o.items ?? []).filter((i) => /^loyna_qr_verre/.test(i.lookup_key ?? ''));
  const paid = o.status === 'active' || o.status === 'trialing';
  const a = o.account;
  return (
    <article class="ord op-order">
      <header class="ord-h">
        <strong>{o.business_name || o.customer_name || o.customer_email || 'Commande sans nom'}</strong>
        <span class="op-badges">
          <Badge tone="gold">LOYNA {planLabel(o.plan)}</Badge>
          <Badge tone={tone}>{label}</Badge>
        </span>
      </header>
      <dl class="ord-dl">
        <Row k="Contact">{o.customer_name || '–'}</Row>
        <Row k="E-mail">{o.customer_email ? <a href={`mailto:${o.customer_email}`}>{o.customer_email}</a> : '–'}</Row>
        <Row k="Téléphone">{o.customer_phone ? <a href={`tel:${o.customer_phone}`}>{phoneFr(o.customer_phone)}</a> : '–'}</Row>
        <Row k="Offre">
          LOYNA {planLabel(o.plan)}, {o.commitment_end ? `avec 12 mois d’engagement (jusqu’au ${date(o.commitment_end)})` : 'sans engagement'}
        </Row>
        <Row k="Commande du">{date(o.ordered_at)}</Row>
        <Row k="QR codes sous verre">
          {qr.length ? qr.map((i) => `${i.quantity} × ${i.label}${i.amount ? ` (${euros(i.amount / 100)})` : ''}`).join(', ') : 'aucun'}
        </Row>
        <Row k="Compte LOYNA">
          {a ? (
            <>
              {a.email}
              <small class="op-sub">
                {a.found_by === 'order' ? 'a commandé avec ce compte' : 'même adresse que la commande'}
                {!a.email_confirmed && ' · adresse pas encore confirmée'}
                {a.owned_merchants > 0 && ` · déjà propriétaire de ${plural(a.owned_merchants, 'commerce', 'commerces')}`}
              </small>
            </>
          ) : (
            'aucun : il sera créé avec l’adresse choisie'
          )}
        </Row>
        {o.referral && (
          <Row k="Parrainage LOYNA">
            {o.referral.code}
            <small class="op-sub">
              parrain : {o.referral.referrer_name || o.referral.referrer_email || 'inconnu'}
              {o.referral.referrer_name && o.referral.referrer_email ? ` (${o.referral.referrer_email})` : ''} · {REF_STATUS[o.referral.status] ?? o.referral.status}
            </small>
          </Row>
        )}
      </dl>
      {!paid && <p class="fld-h warn">Paiement pas encore confirmé par Stripe : attendez qu’il le soit avant de créer le commerce.</p>}
      <div class="btn-row">
        <Btn kind="gold" icon="store" onClick={onCreate}>
          Créer le commerce
        </Btn>
      </div>
    </article>
  );
}

// --- Commerces existants --------------------------------------------------------------------------------
const LIVE_SUB = ['active', 'trialing', 'past_due', 'unpaid'];
/** Essai en cours : date à venir, sans abonnement vivant. */
const onTrial = (m: OpMerchant) => !LIVE_SUB.includes(m.subscription_status ?? '') && !!m.trial_ends_at && new Date(m.trial_ends_at).getTime() > Date.now();

/** État du service d'un commerce : compte offert, essai jusqu'au…, en pause (motif), suspendu à la main. */
function ServiceBadges({m}: {m: OpMerchant}) {
  return (
    <>
      {m.billing_exempt && <Badge tone="green">Compte offert</Badge>}
      {onTrial(m) && <Badge tone="blue">Essai jusqu’au {date(m.trial_ends_at)}</Badge>}
      {m.status === 'SUSPENDED' &&
        (m.service_stop_source === 'AUTO' ? <Badge tone="amber">En pause : {STOP_REASON[m.service_stop_reason ?? ''] ?? 'motif inconnu'}</Badge> : <Badge tone="red">Suspendu à la main</Badge>)}
      {m.status === 'CLOSED' && <Badge tone="red">Fermé</Badge>}
    </>
  );
}

function Merchants({list, reload}: {list: OpMerchant[]; reload: () => void}) {
  const [managing, setManaging] = useState<string | null>(null);
  const managed = list.find((m) => m.id === managing);
  if (!list.length) return <Empty icon="store" title="Aucun commerce pour l’instant" />;
  const open = (m: OpMerchant) => {
    const mine = staffCtx.value?.memberships.find((x) => x.merchant_id === m.id);
    if (!mine) return;
    rememberMerchant(mine.merchant_id);
    merchant.value = mine;
    go('accueil');
  };
  return (
    <Panel>
      <div class="tbl-wrap">
        <table class="tbl op-tbl">
          <thead>
            <tr>
              <th>Commerce</th>
              <th>Offre</th>
              <th class="r">Cartes</th>
              <th>
                <span class="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td>
                  <span class="op-m">
                    <span class="op-m-logo" style={{background: m.primary_color, color: m.secondary_color}}>
                      {m.logo_url ? <img src={m.logo_url} alt="" /> : initials(m.name)}
                    </span>
                    <span>
                      <strong>{m.name}</strong>
                      <small>
                        {m.business_type || 'Activité non renseignée'} · créé le {date(m.created_at)}
                      </small>
                      <small>
                        {m.owner_email ?? 'sans propriétaire'}
                        {m.owner_status === 'INVITED' && ' · pas encore connecté'}
                      </small>
                      {m.siret && <small>SIRET {m.siret}</small>}
                      <span class="op-join">
                        <a href={joinUrl(m.slug)} target="_blank" rel="noopener">
                          loyna.fr/join/{m.slug}
                        </a>
                        <button type="button" class="op-copy" title="Copier le lien" aria-label={`Copier le lien d’inscription de ${m.name}`} onClick={async () => toast((await copy(joinUrl(m.slug))) ? 'Lien copié' : 'Copie impossible : sélectionnez le lien.', 'info')}>
                          <Icon name="copy" size={16} />
                        </button>
                      </span>
                    </span>
                  </span>
                </td>
                <td class="op-offre">
                  <span class="op-badges">
                    <span class="nowrap">LOYNA {planLabel(m.subscription_plan)}</span>
                    <ServiceBadges m={m} />
                  </span>
                  <small class="op-sub">{m.subscription_status ? (STATUS[m.subscription_status]?.[0] ?? m.subscription_status) : onTrial(m) || m.billing_exempt ? 'pas d’abonnement Stripe à relier' : 'sans abonnement Stripe relié'}</small>
                  {m.data_delete_after && <small class="op-sub">Données supprimées le {date(m.data_delete_after)}</small>}
                </td>
                <td class="r">{num(m.cards)}</td>
                <td class="r">
                  <span class="op-actions">
                    <Btn kind="ghost" small icon="settings" onClick={() => setManaging(m.id)}>
                      Gérer
                    </Btn>
                    {m.owner_email && <EnvoyerAcces m={m} />}
                    <Btn kind="ghost" small icon="download" onClick={() => download(`qr-${m.slug}.svg`, qrSvg(joinUrl(m.slug)), 'image/svg+xml')}>
                      QR code
                    </Btn>
                    {m.is_member ? (
                      <Btn kind="ghost" small icon="arrow-right" onClick={() => open(m)}>
                        Ouvrir
                      </Btn>
                    ) : (
                      <OuvrirEspace m={m} />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="muted small op-foot">
        « Ouvrir son espace » affiche l’espace du commerce tel que son propriétaire le voit (statistiques, clients, campagnes, réglages), en lecture seule : rien ne peut y être modifié ni envoyé. Chaque ouverture est
        notée dans le journal du commerce. « Ouvrir » (commerces dont vous faites partie de l’équipe) donne votre accès habituel. « Gérer » : suspension, compte offert, prolongations, sortie d’engagement, campagne préparée.
      </p>
      {managed && <ManageMerchant key={managed.id} m={managed} onClose={() => setManaging(null)} onChanged={reload} />}
    </Panel>
  );
}

// --- Gérer un commerce : actions réservées aux opérateurs, chacune notée dans le journal d'audit par le serveur -------
const OP_REFUSED: Record<string, string> = {
  FORBIDDEN: 'Action réservée aux opérateurs LOYNA.',
  NOT_FOUND: 'Ce commerce est introuvable : actualisez la liste.',
  MERCHANT_CLOSED: 'Ce commerce est fermé.',
  REASON_REQUIRED: 'Indiquez le motif de la suspension.',
  NOT_SUSPENDED_MANUAL: 'Ce commerce n’est pas suspendu à la main : un arrêt automatique se lève par le paiement, l’exemption ou la prolongation de l’essai.',
  INVALID_DAYS: 'Nombre de jours : de 1 à 365.',
  SUBSCRIPTION_NOT_FOUND: 'Cet abonnement n’est pas connu de LOYNA : vérifiez l’identifiant (sub_…).',
  ALREADY_LINKED: 'Cet abonnement est déjà relié à un autre commerce.',
  SUBSCRIPTION_EXISTS: 'Ce commerce a déjà un abonnement en cours.',
  SIRET_INVALID: 'Ce SIRET n’est pas valable.',
  NOT_STOPPED: 'Aucune suppression n’est prévue pour ce commerce : il n’est pas à l’arrêt automatique.',
  NO_SUBSCRIPTION: 'Aucun abonnement Stripe relié à ce commerce.',
  MERCHANT_PAUSED: 'Ce commerce est en pause : la campagne ne pourrait pas partir.',
  FEATURE_NOT_AVAILABLE: 'Les campagnes préparées sont réservées à l’offre Pro.',
  INVALID_NAME: 'Nom de la campagne : 120 caractères au plus.',
  INVALID_TITLE: 'Titre : 60 caractères au plus.',
  INVALID_BODY: 'Message : 300 caractères au plus.',
  INVALID_AUDIENCE: 'Destinataires inconnus : rechargez la page.',
  INVALID_DATE: 'La date d’envoi proposée doit être à venir.',
};
const refused = (e: any) => OP_REFUSED[e?.code] ?? (e instanceof Error ? e.message : 'Action impossible.');

function ManageMerchant({m, onClose, onChanged}: {m: OpMerchant; onClose: () => void; onChanged: () => void}) {
  const [busy, run] = useBusy();
  const [reason, setReason] = useState('');
  const [trialDays, setTrialDays] = useState(7);
  const [keepDays, setKeepDays] = useState(30);
  const [proof, setProof] = useState('');
  const [subId, setSubId] = useState('');
  const [unlinked, setUnlinked] = useState<{stripe_subscription_id: string; customer_email: string | null; business_name: string | null; plan: string}[]>([]);
  const [siretReason, setSiretReason] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(''); // dans la fenêtre : un toast passerait derrière elle
  const manual = m.status === 'SUSPENDED' && m.service_stop_source !== 'AUTO';
  const liveSub = LIVE_SUB.includes(m.subscription_status ?? '');
  useEffect(() => {
    if (liveSub) return;
    api.rpc<{subscriptions?: typeof unlinked}>('op_unlinked_subscriptions', {}).then((r) => setUnlinked(r?.subscriptions ?? []), () => setUnlinked([]));
  }, [liveSub]);

  /** Appel d'une RPC op_* : `{status: 'OK'}` attendu, le reste est un refus du serveur. */
  const act = (fn: string, args: Record<string, unknown>, okText: string, after?: () => void) =>
    run(async () => {
      setError('');
      setDone('');
      try {
        const r = await api.rpc<{status?: string; message?: string}>(fn, {p_merchant_id: m.id, ...args});
        if (r?.status && r.status !== 'OK') return setError(OP_REFUSED[r.status] ?? r.message ?? 'Action refusée par le serveur.');
        setDone(okText);
        after?.();
        onChanged();
      } catch (e) {
        setError(refused(e));
      }
    });
  const suspend = () => {
    if (!reason.trim()) return setError('Indiquez le motif de la suspension.');
    if (!confirm(`Suspendre ${m.name} ?\nScan, inscriptions et messages s’arrêtent tout de suite. Seul un opérateur pourra lever la suspension.`)) return;
    act('op_set_merchant_suspension', {p_suspended: true, p_reason: reason.trim()}, `${m.name} est suspendu.`, () => setReason(''));
  };
  const attach = () => {
    if (!subId.trim()) return setError('Indiquez l’identifiant de l’abonnement (sub_…).');
    if (!confirm(`Relier l’abonnement ${subId.trim()} à ${m.name} ?\nSon offre s’applique et le service suit cet abonnement.`)) return;
    act('op_attach_subscription', {p_stripe_subscription_id: subId.trim()}, `Abonnement relié à ${m.name}.`, () => setSubId(''));
  };
  const releaseSiret = () => {
    if (!siretReason.trim()) return setError('Indiquez le motif : qui a réclamé ce SIRET, avec quel justificatif.');
    if (!confirm(`Libérer le SIRET ${m.siret} ?\n${m.name} le perd, et le vrai commerçant peut démarrer son essai.`)) return;
    run(async () => {
      setError('');
      setDone('');
      try {
        const r = await api.rpc<{status?: string}>('op_release_trial_siret', {p_siret: m.siret, p_reason: siretReason.trim()});
        if (r?.status && r.status !== 'OK') return setError(OP_REFUSED[r.status] ?? 'Action refusée par le serveur.');
        setDone('SIRET libéré.');
        setSiretReason('');
        onChanged();
      } catch (e) {
        setError(refused(e));
      }
    });
  };
  const lift = () => act('op_set_merchant_suspension', {p_suspended: false, p_reason: null}, `Suspension levée : ${m.name} suit de nouveau son abonnement ou son essai.`);
  const closure = () => {
    if (!proof.trim()) return setError('Décrivez le justificatif de radiation reçu.');
    if (!confirm(`Sortie pour fermeture de ${m.name} ?\nL’engagement s’arrête et l’abonnement prend fin à la fin du mois en cours : rien n’est dû ensuite.`)) return;
    run(async () => {
      setError('');
      setDone('');
      try {
        await api.edge('merchant-bootstrap', {action: 'commitment_exit', merchant_id: m.id, justificatif: proof.trim()});
        setDone('Sortie enregistrée : l’abonnement prend fin à la fin du mois en cours.');
        setProof('');
        onChanged();
      } catch (e) {
        setError(refused(e));
      }
    });
  };

  return (
    <Modal open onClose={onClose} wide title={`Gérer ${m.name}`}>
      <div class="op-manage">
        <dl class="ord-dl">
          <Row k="Offre">LOYNA {planLabel(m.subscription_plan)}</Row>
          <Row k="Abonnement">{m.subscription_status ? (STATUS[m.subscription_status]?.[0] ?? m.subscription_status) : 'aucun'}</Row>
          {m.trial_ends_at && <Row k="Fin de l’essai">{dayLong(m.trial_ends_at)}</Row>}
          {m.status !== 'ACTIVE' && <Row k="Arrêt">{m.service_stop_source === 'AUTO' ? `automatique : ${STOP_REASON[m.service_stop_reason ?? ''] ?? 'motif inconnu'}` : 'suspension à la main'}</Row>}
          {m.data_delete_after && <Row k="Données supprimées le">{dayLong(m.data_delete_after)}</Row>}
          {m.siret && <Row k="SIRET">{m.siret}</Row>}
        </dl>
        {error && (
          <p class="form-err" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p class="note" role="status">
            {done}
          </p>
        )}

        <section class="op-manage-s">
          <h3>Suspension</h3>
          {manual ? (
            <>
              <p class="muted small">La levée rend la main à la décision automatique : si rien n’est payé, l’arrêt automatique revient aussitôt.</p>
              <Btn kind="gold" small icon="rotate-ccw" busy={busy} onClick={lift}>
                Lever la suspension
              </Btn>
            </>
          ) : (
            <>
              <Field label="Motif" hint="Obligatoire, noté dans le journal. Aucune suppression automatique pendant une suspension.">
                <input type="text" maxLength={200} value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
              </Field>
              <Btn kind="danger" small icon="power" busy={busy} onClick={suspend}>
                Suspendre
              </Btn>
            </>
          )}
        </section>

        <section class="op-manage-s">
          <h3>Compte offert</h3>
          <Toggle
            checked={m.billing_exempt}
            disabled={busy}
            onChange={(v) => act('op_set_billing_exempt', {p_exempt: v}, v ? `${m.name} est exempté de tout arrêt.` : `${m.name} n’est plus exempté.`)}
            label="Exempter ce commerce"
            hint="Jamais arrêté ni supprimé automatiquement, aucun abonnement à régler."
          />
        </section>

        {m.trial_ends_at && !liveSub && (
          <section class="op-manage-s">
            <h3>Prolonger l’essai</h3>
            <div class="op-days">
              <Field label="Jours en plus">
                <input type="number" min={1} max={365} value={trialDays} onInput={(e) => setTrialDays(Math.round(Number((e.target as HTMLInputElement).value) || 0))} />
              </Field>
              <Btn kind="ghost" small icon="calendar-clock" busy={busy} disabled={trialDays < 1} onClick={() => act('op_extend_trial', {p_days: trialDays}, `Essai prolongé de ${plural(trialDays, 'jour', 'jours')}.`)}>
                Prolonger l’essai
              </Btn>
            </div>
          </section>
        )}

        {m.data_delete_after && (
          <section class="op-manage-s">
            <h3>Prolonger la conservation</h3>
            <p class="muted small">Quand un commerçant annonce son retour : la suppression de ses données est repoussée d’autant.</p>
            <div class="op-days">
              <Field label="Jours en plus">
                <input type="number" min={1} max={365} value={keepDays} onInput={(e) => setKeepDays(Math.round(Number((e.target as HTMLInputElement).value) || 0))} />
              </Field>
              <Btn kind="ghost" small icon="calendar-clock" busy={busy} disabled={keepDays < 1} onClick={() => act('op_extend_retention', {p_days: keepDays}, `Conservation prolongée de ${plural(keepDays, 'jour', 'jours')}.`)}>
                Prolonger la conservation
              </Btn>
            </div>
          </section>
        )}

        {!liveSub && (
          <section class="op-manage-s">
            <h3>Relier un abonnement</h3>
            <p class="muted small">Commande payée avec une autre adresse : Stripe prélève ce client, mais rien ne la relie à ce commerce.</p>
            <Field label="Identifiant de l’abonnement" hint="sub_…, donné par le mail « Commande non rattachée ».">
              <input type="text" maxLength={100} list="op-non-rattaches" value={subId} onInput={(e) => setSubId((e.target as HTMLInputElement).value)} />
            </Field>
            <datalist id="op-non-rattaches">
              {unlinked.map((s) => (
                <option value={s.stripe_subscription_id}>{[s.customer_email, s.business_name, s.plan].filter(Boolean).join(' · ')}</option>
              ))}
            </datalist>
            {unlinked.length > 0 && <p class="muted small">{plural(unlinked.length, 'commande non rattachée', 'commandes non rattachées')} : {unlinked.map((s) => `${s.customer_email ?? s.stripe_subscription_id}`).join(', ')}.</p>}
            <Btn kind="ghost" small icon="link" busy={busy} onClick={attach}>
              Relier cet abonnement
            </Btn>
          </section>
        )}

        {m.siret && (
          <section class="op-manage-s">
            <h3>SIRET usurpé</h3>
            <p class="muted small">Le vrai commerçant réclame le SIRET {m.siret} : après vérification, ce commerce le perd et l’essai redevient possible pour lui. Suspendez ce commerce à part s’il y a lieu.</p>
            <Field label="Motif" hint="Obligatoire, noté dans le journal.">
              <input type="text" maxLength={200} value={siretReason} onInput={(e) => setSiretReason((e.target as HTMLInputElement).value)} />
            </Field>
            <Btn kind="danger" small icon="link" busy={busy} onClick={releaseSiret}>
              Libérer ce SIRET
            </Btn>
          </section>
        )}

        {liveSub && (
          <section class="op-manage-s">
            <h3>Sortie pour fermeture</h3>
            <p class="muted small">Après vérification du justificatif de radiation (Registre national des entreprises ou avis de situation INSEE) : fin à la fin du mois en cours, rien de dû ensuite. La vente du fonds n’ouvre pas cette sortie.</p>
            <Field label="Justificatif reçu" hint="Décrivez-le : nature, date, numéro. Noté dans le journal.">
              <textarea rows={2} maxLength={500} value={proof} onInput={(e) => setProof((e.target as HTMLTextAreaElement).value)} />
            </Field>
            <Btn kind="danger" small icon="log-out" busy={busy} onClick={closure}>
              Sortie pour fermeture
            </Btn>
          </section>
        )}

        {m.subscription_plan !== 'STARTER' && <PrepareCampaign m={m} />}
      </div>
    </Modal>
  );
}

// « LOYNA écrit et programme vos messages » (Pro, et Premium comme un Pro) : un brouillon « à valider », jamais envoyé sans le commerçant
const CAMPAIGN_AUDIENCES: {value: string; label: string}[] = [
  {value: 'ALL', label: 'Tous les clients'},
  {value: 'ACTIVE', label: 'Clients venus ces 30 derniers jours'},
  {value: 'INACTIVE_30', label: 'Absents depuis 30 jours'},
  {value: 'INACTIVE_60', label: 'Absents depuis 60 jours'},
  {value: 'INACTIVE_90', label: 'Absents depuis 90 jours'},
  {value: 'REWARD_AVAILABLE', label: 'Avec une récompense à utiliser'},
];

function PrepareCampaign({m}: {m: OpMerchant}) {
  const empty = {name: '', title: '', body: '', audience: 'ALL', when: ''};
  const [f, setF] = useState(empty);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, run] = useBusy();
  const moments = tempsForts(new Date(), 60);
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((x) => ({...x, [k]: v}));
  const pickMoment = (key: string) => {
    const t = moments.find((x) => x.key === key);
    if (!t) return;
    const at = sendAt(t);
    setF((x) => ({...x, name: campaignName(t), title: t.title, body: t.message, when: at ? localInput(at) : ''}));
  };
  const submit = () => {
    if (!f.name.trim()) return setError('Donnez un nom à la campagne.');
    if (!f.body.trim()) return setError('Écrivez le message.');
    setError('');
    setDone('');
    run(async () => {
      try {
        const r = await api.rpc<{status?: string; message?: string}>('op_prepare_campaign', {
          p_merchant_id: m.id,
          p_name: f.name.trim(),
          p_title: f.title.trim() || null,
          p_body: f.body.trim(),
          p_audience: f.audience,
          p_scheduled_at: f.when ? new Date(f.when).toISOString() : null,
        });
        if (r?.status && r.status !== 'OK') return setError(OP_REFUSED[r.status] ?? r.message ?? 'Campagne refusée par le serveur.');
        setDone(`Campagne préparée pour ${m.name} : un e-mail lui demande de la valider.`);
        setF(empty);
      } catch (e) {
        setError(refused(e));
      }
    });
  };
  return (
    <section class="op-manage-s">
      <h3>Préparer une campagne</h3>
      <p class="muted small">Elle arrive dans son espace avec la mention « Préparée par LOYNA · à valider », et il reçoit un e-mail. Rien ne part sans sa validation.</p>
      <div class="form">
        {moments.length > 0 && (
          <Field label="Partir d’un temps fort (facultatif)">
            <select value="" onChange={(e) => pickMoment((e.target as HTMLSelectElement).value)}>
              <option value="">Choisir…</option>
              {moments.map((t) => (
                <option value={t.key}>
                  {t.label} ({t.date.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})})
                </option>
              ))}
            </select>
          </Field>
        )}
        <div class="row2">
          <Field label="Nom de la campagne" hint="Il n’est pas montré aux clients.">
            <input type="text" maxLength={120} value={f.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Titre (facultatif)" hint={`${f.title.length} / 60`}>
            <input type="text" maxLength={60} value={f.title} onInput={(e) => set('title', (e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        <Field label="Message" hint={`${f.body.length} / 300 · {prenom} et {commerce} sont remplacés`}>
          <textarea rows={3} maxLength={300} value={f.body} onInput={(e) => set('body', (e.target as HTMLTextAreaElement).value)} />
        </Field>
        <div class="row2">
          <Field label="Destinataires">
            <select value={f.audience} onChange={(e) => set('audience', (e.target as HTMLSelectElement).value)}>
              {CAMPAIGN_AUDIENCES.map((a) => (
                <option value={a.value}>{a.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Envoi proposé (facultatif)" hint="Il pourra le changer en validant.">
            <input type="datetime-local" value={f.when} onInput={(e) => set('when', (e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        {error && (
          <p class="form-err" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p class="note" role="status">
            {done}
          </p>
        )}
        <div class="btn-row">
          <Btn kind="gold" small icon="badge-check" busy={busy} onClick={submit}>
            Préparer la campagne
          </Btn>
        </div>
      </div>
    </section>
  );
}

/** Consultation de l'espace du commerce, en lecture seule (bandeau « Quitter » pour revenir ici). */
function OuvrirEspace({m}: {m: OpMerchant}) {
  const [busy, run] = useBusy();
  const open = () =>
    run(async () => {
      try {
        await openConsultation(m.id);
        go('accueil');
      } catch (e) {
        toastError(e);
      }
    });
  return (
    <Btn kind="ghost" small icon="eye" busy={busy} onClick={open} title={`Voir l’espace de ${m.name}, en lecture seule`}>
      Ouvrir son espace
    </Btn>
  );
}

/** E-mail « Votre carte LOYNA est prête » (lien neuf pour choisir le mot de passe) depuis la liste des commerces :
 *  l'écran qui suit la création ne s'affiche qu'une fois (demande du fondateur du 2026-10-28). */
function EnvoyerAcces({m}: {m: OpMerchant}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const send = () =>
    run(async () => {
      if (!confirm(`Envoyer l’accès de ${m.name} à ${m.owner_email} ?\nUn nouveau lien pour choisir le mot de passe part par e-mail ; l’ancien ne fonctionnera plus.`)) return;
      try {
        const s = await api.edge<{status: string; to: string; setup_link: string}>('merchant-bootstrap', {action: 'send_access', merchant_id: m.id});
        setSentTo(s.to);
        toast(`E-mail envoyé à ${s.to}.`);
      } catch (e) {
        toastError(e);
      }
    });
  return (
    <Btn kind={m.owner_status === 'INVITED' && !sentTo ? 'gold' : 'ghost'} small icon="send" busy={busy} onClick={send}>
      {sentTo ? 'Accès envoyé' : m.owner_status === 'INVITED' ? 'Envoyer l’accès' : 'Renvoyer l’accès'}
    </Btn>
  );
}

// --- Création du commerce -------------------------------------------------------------------------------
interface Form {
  name: string;
  business_type: string;
  siret: string;
  exempt: boolean; // compte offert : jamais arrêté, ni essai ni abonnement
  address: string;
  postal_code: string;
  city: string;
  owner_email: string;
  owner_name: string;
  plan: PlanCode;
  threshold: number;
  reward: string;
  bg: string;
  accent: string;
  slug: string;
}
type Touched = Partial<Record<'reward' | 'bg' | 'accent' | 'slug', true>>;

function initialForm(order: OpOrder | null, taken: Set<string>): Form {
  const acc = order?.account ?? null;
  const name = (order?.business_name || acc?.business_name || '').trim();
  return {
    name,
    business_type: '',
    siret: '',
    exempt: false,
    address: '',
    postal_code: '',
    city: '',
    owner_email: (acc?.email || order?.customer_email || '').trim().toLowerCase(),
    // nom de la personne (« Bonjour Benjamin » dans l'e-mail d'accès) : jamais le nom du commerce, que Stripe
    // enregistre parfois comme nom du client (paiement par lien, Barber Kong 2026-10-29)
    owner_name: [order?.customer_name, acc?.display_name].map((x) => (x || '').trim())
      .find((x) => x && x.toLowerCase() !== name.toLowerCase()) ?? '',
    plan: order && PLAN_ORDER.includes(order.plan) ? order.plan : 'STARTER',
    threshold: 10,
    reward: '',
    bg: '#121216',
    accent: '#d9b27a',
    slug: freeSlug(slugify(name), taken),
  };
}

function validate(f: Form): string | null {
  if (!f.name.trim()) return 'Indiquez le nom du commerce.';
  if (!SLUG_RE.test(f.slug)) return 'Adresse d’inscription invalide : lettres minuscules, chiffres et tirets seulement.';
  if (!EMAIL_RE.test(f.owner_email.trim())) return 'Adresse e-mail du propriétaire invalide.';
  if (f.siret.trim() && !/^\d{14}$/.test(f.siret.replace(/\s/g, ''))) return 'SIRET : 14 chiffres, ou laissez le champ vide.';
  if (!Number.isInteger(f.threshold) || f.threshold < 1 || f.threshold > MAX_STAMPS) return `Nombre de passages : de 1 à ${MAX_STAMPS}.`;
  if (!f.reward.trim()) return 'Indiquez la récompense (exemple : -10 €, Café offert).';
  if (!HEX_RE.test(f.bg) || !HEX_RE.test(f.accent)) return 'Couleurs attendues au format #RRGGBB.';
  return null;
}

function CreateMerchant({order, merchants, onClose}: {order: OpOrder | null; merchants: OpMerchant[]; onClose: () => void}) {
  const taken = useRef(new Set(merchants.map((m) => m.slug)));
  const [id] = useState(newMerchantId);
  const [f, setF] = useState<Form>(() => initialForm(order, taken.current));
  const [touched, setTouched] = useState<Touched>({});
  const [logo, setLogo] = useState<(LogoFiles & {url: string}) | null>(null);
  const [logoErr, setLogoErr] = useState('');
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<(Created & {name: string; email: string; exempt: boolean}) | null>(null);
  const [busy, run] = useBusy();
  const logoRef = useRef<{url: string} | null>(null);
  logoRef.current = logo;
  useEffect(() => () => logoRef.current && URL.revokeObjectURL(logoRef.current.url), []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({...x, [k]: v}));
  const touch = (k: keyof Touched) => setTouched((t) => ({...t, [k]: true}));

  const setName = (name: string) =>
    setF((x) => ({...x, name, slug: touched.slug ? x.slug : freeSlug(slugify(name), taken.current)}));
  // Activité connue du configurateur : sa récompense et ses couleurs, sauf ce que l'opérateur a déjà réglé.
  const setActivity = (business_type: string) =>
    setF((x) => {
      const a = CARD_ACTIVITES.find((c) => norm(c.nom) === norm(business_type));
      if (!a || a.nom === 'Autre') return {...x, business_type};
      return {...x, business_type, reward: touched.reward ? x.reward : a.recompense, bg: touched.bg ? x.bg : a.fond, accent: touched.accent ? x.accent : a.tampons};
    });

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoErr('');
    setConverting(true);
    try {
      const files = await logoToFiles(file);
      if (logo) URL.revokeObjectURL(logo.url);
      setLogo({...files, url: URL.createObjectURL(files.logo_blob)});
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : 'Ce logo est illisible.');
    } finally {
      setConverting(false);
    }
  };

  // Carte préparée avec le client dans le panel commercial : son lien de paiement remplit le formulaire et le logo
  const [lienCarte, setLienCarte] = useState('');
  const [carteErr, setCarteErr] = useState('');
  const [carteBusy, setCarteBusy] = useState(false);
  const reprendreCarte = async () => {
    const cid = idDuLien(lienCarte);
    if (!cid) return setCarteErr('Collez le lien de paiement de la carte (loyna.fr/panier/?carte=…).');
    setCarteErr('');
    setCarteBusy(true);
    try {
      const c = await lireCartePreparee(cid);
      if (!c) throw new Error('Aucune carte ne correspond à ce lien.');
      setF((x) => ({
        ...x,
        name: x.name || c.nom,
        slug: x.name || touched.slug ? x.slug : freeSlug(slugify(c.nom), taken.current),
        business_type: c.activite || x.business_type,
        threshold: c.passages,
        reward: c.recompense,
        bg: c.fond,
        accent: c.tampons,
        plan: order ? x.plan : (normalizeOffer(c.offre, c.periode, c.engagement).plan.toUpperCase() as PlanCode),
      }));
      setTouched((t) => ({...t, reward: true, bg: true, accent: true}));
      if (c.logo) {
        const octets = Uint8Array.from(atob(c.logo.split(',')[1]), (ch) => ch.charCodeAt(0));
        await pickLogo(new File([octets], 'logo.png', {type: 'image/png'}));
      }
      toast(`Carte de ${c.nom} reprise : vérifiez puis créez le commerce.`, 'info');
    } catch (e) {
      setCarteErr(e instanceof Error ? e.message : 'Lecture de la carte impossible.');
    } finally {
      setCarteBusy(false);
    }
  };

  const emails = [...new Set([order?.account?.email, order?.customer_email].filter((x): x is string => !!x).map((x) => x.trim().toLowerCase()))];
  const slugTaken = taken.current.has(f.slug);
  const kind = rewardKind(f.reward);
  const lowStamps = HEX_RE.test(f.bg) && HEX_RE.test(f.accent) && contrast(f.bg, f.accent) < 1.6;

  const submit = (e: Event) => {
    e.preventDefault();
    const problem = validate(f) ?? (slugTaken ? 'Cette adresse d’inscription est déjà utilisée : choisissez-en une autre.' : null);
    if (problem) return setError(problem);
    setError('');
    run(async () => {
      try {
        let logo_url: string | undefined;
        let icon_url: string | undefined;
        if (logo) {
          try {
            const fresh = (url: string) => (url.startsWith('http') ? `${url}?v=${Date.now()}` : url); // ?v : contourne le cache des cartes
            logo_url = fresh(await api.uploadPublic('merchant-assets', `${id}/logo.png`, logo.logo_blob));
            icon_url = fresh(await api.uploadPublic('merchant-assets', `${id}/icon.png`, logo.icon_blob));
          } catch (err) {
            throw new Error(`Logo non envoyé : ${err instanceof Error ? err.message : 'réessayez.'}`);
          }
        }
        const opt = (v: string) => (v.trim() ? v.trim() : undefined);
        const email = f.owner_email.trim().toLowerCase();
        const siret = f.siret.replace(/\s/g, '');
        // `exempt` et `siret` : contrat de merchant-bootstrap (cahier des charges, 4.1)
        const extra = {exempt: f.exempt, ...(siret ? {siret} : {})};
        const r = await api.edge<Created>('merchant-bootstrap', {
          ...extra,
          merchant: {
            ...extra,
            id,
            name: f.name.trim(),
            slug: f.slug,
            business_type: opt(f.business_type),
            address: opt(f.address),
            postal_code: opt(f.postal_code),
            city: opt(f.city),
            primary_color: f.bg.toLowerCase(),
            secondary_color: f.accent.toLowerCase(),
            subscription_plan: f.plan,
            logo_url,
            icon_url,
          },
          owner: {email, display_name: f.owner_name.trim() || 'Propriétaire'},
          program: {reward_threshold: f.threshold},
          rewards: [{name: f.reward.trim(), threshold: f.threshold, ...rewardKind(f.reward)}],
        });
        taken.current.add(r.slug);
        setResult({...r, name: f.name.trim(), email, exempt: f.exempt});
      } catch (err: any) {
        if (err?.code === 'SLUG_TAKEN') {
          taken.current.add(f.slug);
          touch('slug');
        }
        setError(err instanceof Error ? err.message : 'Création impossible.');
      }
    });
  };

  if (result) return <CreatedView r={result} onClose={onClose} />;

  return (
    <div class="page">
      <PageHead eyebrow={order ? `Commande du ${date(order.ordered_at)}` : 'Commerce sans commande'} title="Créer le commerce">
        <Btn kind="ghost" small icon="x" onClick={onClose}>
          Annuler
        </Btn>
      </PageHead>
      {order && (
        <p class="note op-recap">
          <strong>{order.business_name || order.customer_name || order.customer_email}</strong> · LOYNA {planLabel(order.plan)} {order.commitment_end ? 'avec engagement' : 'sans engagement'}
          {order.customer_email && ` · ${order.customer_email}`}
          {order.customer_phone && ` · ${phoneFr(order.customer_phone)}`}
        </p>
      )}
      <form class="prog op-form" onSubmit={submit} noValidate>
        <div class="form">
          <Panel title="Carte préparée avec le client (facultatif)">
            <div class="form">
              <Field label="Lien de paiement de la carte" hint="Depuis « Préparer une carte » de l’espace commercial : récompense, passages, couleurs et logo sont repris.">
                <input type="text" spellcheck={false} autoComplete="off" placeholder="https://loyna.fr/panier/?carte=…" value={lienCarte} onInput={(e) => setLienCarte((e.target as HTMLInputElement).value)} />
              </Field>
              {carteErr && <span class="fld-err">{carteErr}</span>}
              <div class="btn-row">
                <Btn kind="ghost" small icon="download" busy={carteBusy} onClick={reprendreCarte}>
                  Reprendre cette carte
                </Btn>
              </div>
            </div>
          </Panel>

          <Panel title="Commerce">
            <div class="form">
              <div class="row2">
                <Field label="Nom du commerce">
                  <input type="text" maxLength={120} required value={f.name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="Activité" hint="Affichée sous le nom : Barbier, Boulangerie…">
                  <input type="text" maxLength={60} list="op-activites" value={f.business_type} onInput={(e) => setActivity((e.target as HTMLInputElement).value)} />
                </Field>
              </div>
              <datalist id="op-activites">
                {CARD_ACTIVITES.filter((a) => a.nom !== 'Autre').map((a) => (
                  <option value={a.nom} />
                ))}
              </datalist>
              <Field label="SIRET (facultatif)" hint="14 chiffres. Un essai pris plus tard par ce commerce sera refusé.">
                <input type="text" maxLength={20} inputMode="numeric" autoComplete="off" value={f.siret} onInput={(e) => set('siret', (e.target as HTMLInputElement).value)} />
              </Field>
              <Field label="Adresse (facultatif)" hint="Le client place ensuite sa boutique pour la notification de proximité (Réglages).">
                <input type="text" maxLength={200} autoComplete="off" value={f.address} onInput={(e) => set('address', (e.target as HTMLInputElement).value)} />
              </Field>
              <div class="row2">
                <Field label="Code postal">
                  <input type="text" maxLength={20} inputMode="numeric" value={f.postal_code} onInput={(e) => set('postal_code', (e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="Ville">
                  <input type="text" maxLength={100} value={f.city} onInput={(e) => set('city', (e.target as HTMLInputElement).value)} />
                </Field>
              </div>
              <Field
                label="Adresse d’inscription des clients"
                error={slugTaken ? 'Déjà utilisée par un autre commerce.' : f.slug && !SLUG_RE.test(f.slug) ? 'Lettres minuscules, chiffres et tirets seulement.' : undefined}
                hint={`loyna.fr/join/${f.slug || '…'} (le QR code du comptoir y mène)`}
              >
                <span class="op-slug">
                  <span aria-hidden="true">loyna.fr/join/</span>
                  <input
                    type="text"
                    maxLength={64}
                    value={f.slug}
                    autoCapitalize="off"
                    spellcheck={false}
                    onInput={(e) => {
                      touch('slug');
                      set('slug', (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    }}
                  />
                </span>
              </Field>
            </div>
          </Panel>

          <Panel title="Propriétaire et offre">
            <div class="form">
              <div class="row2">
                <Field label="E-mail du propriétaire" hint={order?.account ? 'Gardez l’adresse du compte LOYNA : le client se connecte avec son mot de passe.' : 'Un compte LOYNA est créé avec cette adresse s’il n’existe pas.'}>
                  <input type="email" required autoComplete="off" value={f.owner_email} onInput={(e) => set('owner_email', (e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="Prénom et nom du propriétaire" hint="Pour « Bonjour Benjamin » dans l’e-mail d’accès, et affiché dans l’équipe du commerce. Pas le nom du commerce.">
                  <input type="text" maxLength={80} placeholder="ex. Benjamin Psaume" value={f.owner_name} onInput={(e) => set('owner_name', (e.target as HTMLInputElement).value)} />
                </Field>
              </div>
              {emails.length > 1 && (
                <div class="chips" role="radiogroup" aria-label="Adresse du propriétaire">
                  {emails.map((x) => (
                    <button type="button" role="radio" aria-checked={f.owner_email.trim().toLowerCase() === x} class={`chip ${f.owner_email.trim().toLowerCase() === x ? 'on' : ''}`} onClick={() => set('owner_email', x)}>
                      {x === order?.account?.email?.toLowerCase() ? 'Compte' : 'Commande'} : {x}
                    </button>
                  ))}
                </div>
              )}
              <div class="fld">
                <span class="fld-l">Offre</span>
                <Segmented label="Offre" value={f.plan} onChange={(p) => set('plan', p)} options={PLAN_ORDER.map((p) => ({value: p, label: planLabel(p)}))} />
                <span class="fld-h">{order ? `Payée : ${planLabel(order.plan)}. L’offre de la commande rattachée s’applique d’elle-même.` : 'Sans commande, l’offre choisie ici s’applique.'}</span>
              </div>
              <label class="check">
                <input type="checkbox" checked={f.exempt} onChange={(e) => set('exempt', (e.target as HTMLInputElement).checked)} />
                <span>Compte offert : jamais arrêté, aucun abonnement à régler</span>
              </label>
              {!order && !f.exempt && <span class="fld-h">Sans commande reliée ni cette case, le commerce reçoit un essai d’un mois.</span>}
            </div>
          </Panel>

          <Panel title="Programme et carte">
            <div class="form">
              <div class="row2">
                <Field label="Passages pour la récompense" hint="Au-delà de 20, la carte affiche une jauge.">
                  <input
                    type="number"
                    min={1}
                    max={MAX_STAMPS}
                    step={1}
                    inputMode="numeric"
                    value={f.threshold}
                    onInput={(e) => set('threshold', Math.round(Number((e.target as HTMLInputElement).value) || 0))}
                  />
                </Field>
                <Field
                  label="Récompense"
                  hint={
                    kind.reward_type === 'DISCOUNT_AMOUNT'
                      ? `Enregistrée comme remise de ${euros(kind.value ?? 0)}.`
                      : kind.reward_type === 'DISCOUNT_PERCENT'
                        ? `Enregistrée comme remise de ${num(kind.value ?? 0)} %.`
                        : 'Enregistrée comme produit ou service offert.'
                  }
                >
                  <input
                    type="text"
                    maxLength={80}
                    placeholder="-10 €, Café offert…"
                    value={f.reward}
                    onInput={(e) => {
                      touch('reward');
                      set('reward', (e.target as HTMLInputElement).value);
                    }}
                  />
                </Field>
              </div>
              <ColorRow
                label="Fond de la carte"
                value={f.bg}
                swatches={CARD_BGS}
                onChange={(c) => {
                  touch('bg');
                  set('bg', c);
                }}
              />
              <ColorRow
                label="Tampons"
                value={f.accent}
                swatches={CARD_ACCENTS}
                onChange={(c) => {
                  touch('accent');
                  set('accent', c);
                }}
              />
              {lowStamps && <p class="fld-h warn">Tampons peu visibles sur ce fond : la carte les dessinera dans la couleur du texte.</p>}
              <div class="fld">
                <span class="fld-l">Logo</span>
                <div class="logo-up">
                  <span class="logo-prev" style={{background: f.bg}}>
                    {logo ? <img src={logo.url} alt="Logo choisi" /> : <Icon name="store" size={26} />}
                  </span>
                  <label class={`b b--ghost b--sm ${converting ? 'is-busy' : ''}`}>
                    <Icon name="upload" size={16} />
                    <span>{logo ? 'Changer le logo' : 'Ajouter le logo'}</span>
                    <input
                      type="file"
                      accept={LOGO_ACCEPT}
                      class="sr-only"
                      onChange={(e) => {
                        const input = e.target as HTMLInputElement;
                        pickLogo(input.files?.[0]).finally(() => (input.value = ''));
                      }}
                    />
                  </label>
                  {logo && (
                    <button
                      type="button"
                      class="linkish small"
                      onClick={() => {
                        URL.revokeObjectURL(logo.url);
                        setLogo(null);
                      }}
                    >
                      Retirer
                    </button>
                  )}
                </div>
                {logoErr ? (
                  <span class="fld-err">{logoErr}</span>
                ) : logo ? (
                  <span class={`fld-h ${Math.max(logo.width, logo.height) < LOGO_MIN_SIDE ? 'warn' : ''}`}>
                    Converti en PNG, {logo.width} × {logo.height} px
                    {Math.max(logo.width, logo.height) < LOGO_MIN_SIDE ? ' : un peu petit, il pourrait paraître flou sur la carte Google.' : '.'} Envoyé à la création du commerce.
                  </span>
                ) : (
                  <span class="fld-h">PNG, JPG, WEBP ou SVG (converti en PNG), fond transparent conseillé.</span>
                )}
              </div>
            </div>
          </Panel>

          {error && (
            <p class="form-err" role="alert">
              {error}
            </p>
          )}
          <div class="btn-row">
            <Btn type="submit" kind="gold" icon="check" busy={busy} disabled={converting}>
              Créer le commerce
            </Btn>
            <Btn kind="ghost" onClick={onClose}>
              Annuler
            </Btn>
          </div>
        </div>
        <div class="prog-preview">
          <span class="eyebrow">Aperçu de la carte</span>
          <CardPreview name={f.name} program={f.business_type || 'Carte de fidélité'} logo={logo?.url} bg={HEX_RE.test(f.bg) ? f.bg : '#121216'} fg={HEX_RE.test(f.accent) ? f.accent : '#d9b27a'} total={Math.max(1, f.threshold || 1)} reward={f.reward} />
          <p class="muted small">Inscription des clients : loyna.fr/join/{f.slug || '…'}</p>
        </div>
      </form>
    </div>
  );
}

/** Pastilles de couleur, roue de couleur libre et saisie #RRGGBB. */
function ColorRow({label, value, swatches, onChange}: {label: string; value: string; swatches: {c: string; nom: string}[]; onChange: (c: string) => void}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const v = value.toLowerCase();
  return (
    <div class="op-color">
      <span class="fld-l">{label}</span>
      <div class="swatch-row">
        {swatches.map((s) => (
          <button type="button" class={`sw ${v === s.c ? 'on' : ''}`} style={{'--c': s.c} as any} title={s.nom} aria-label={s.nom} aria-pressed={v === s.c} onClick={() => onChange(s.c)} />
        ))}
        <label class={`sw sw--custom ${swatches.some((s) => s.c === v) ? '' : 'is-picked'}`} style={{'--pick': HEX_RE.test(value) ? value : '#121216'} as any} title="Couleur personnalisée">
          <input type="color" value={HEX_RE.test(value) ? value : '#121216'} onInput={(e) => onChange((e.target as HTMLInputElement).value)} aria-label={`${label} : couleur personnalisée`} />
        </label>
        <input
          class="op-hex"
          type="text"
          maxLength={7}
          spellcheck={false}
          aria-label={`${label} : code couleur`}
          value={text}
          onInput={(e) => {
            const t = (e.target as HTMLInputElement).value.trim();
            const hex = t.startsWith('#') ? t : `#${t}`;
            setText(t);
            if (HEX_RE.test(hex)) onChange(hex.toLowerCase());
          }}
        />
      </div>
    </div>
  );
}

// --- Commerce créé : inscription des clients et accès du propriétaire -----------------------------------
function CreatedView({r, onClose}: {r: Created & {name: string; email: string; exempt: boolean}; onClose: () => void}) {
  const [link, setLink] = useState(r.owner.setup_link);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const sendAccess = () =>
    run(async () => {
      try {
        const s = await api.edge<{status: string; to: string; setup_link: string}>('merchant-bootstrap', {action: 'send_access', merchant_id: r.merchant_id});
        if (s.setup_link) setLink(s.setup_link);
        setSentTo(s.to);
        toast(`E-mail envoyé à ${s.to}.`);
      } catch (e) {
        toastError(e);
      }
    });
  return (
    <div class="page">
      <PageHead eyebrow="Commerce créé" title={r.name}>
        <Btn kind="gold" small icon="arrow-right" onClick={onClose}>
          Retour aux commandes
        </Btn>
      </PageHead>
      <p class="note op-recap">
        <strong>LOYNA {planLabel(r.subscription_plan)}</strong> ·{' '}
        {r.orders_linked > 0
          ? `${plural(r.orders_linked, 'commande rattachée', 'commandes rattachées')} : l’offre payée est appliquée.`
          : r.exempt
            ? 'Compte offert : aucun abonnement à régler.'
            : 'Aucune commande rattachée : le commerce reçoit un essai d’un mois. Vérifiez l’adresse du propriétaire si le client a déjà payé.'}
      </p>
      <div class="op-done">
        <Panel title="Inscription des clients" sub="Lien et QR code du comptoir : le client final s’y inscrit et ajoute sa carte à son Wallet.">
          <LinkBox url={r.join_url} />
          <div class="btn-row">
            <Btn kind="ghost" small icon="download" onClick={() => download(`qr-${r.slug}.svg`, qrSvg(r.join_url), 'image/svg+xml')}>
              Télécharger le QR code (SVG)
            </Btn>
          </div>
        </Panel>
        <Panel title="Accès du propriétaire" sub={r.email}>
          {r.owner.account_created ? (
            <div class="form">
              <p>
                Compte créé. Le propriétaire choisit son mot de passe avec ce lien personnel, puis se connecte sur <strong>loyna.fr/espace-client</strong>.
              </p>
              <LinkBox url={link} qr={false} note="Lien personnel, à usage unique et valable peu de temps : envoyez-le sans attendre, ne le publiez pas." />
              <div class="btn-row">
                <Btn kind="gold" icon="send" busy={busy} onClick={sendAccess}>
                  {sentTo ? 'Renvoyer l’accès par e-mail' : 'Envoyer l’accès par e-mail'}
                </Btn>
              </div>
              <p class="muted small">
                {sentTo
                  ? `E-mail « Votre carte LOYNA est prête » envoyé à ${sentTo}, avec un nouveau lien (celui affiché ci-dessus) : l’ancien ne fonctionne plus.`
                  : 'L’e-mail « Votre carte LOYNA est prête » contient un nouveau lien pour choisir le mot de passe et l’adresse de l’espace client ; le lien ci-dessus ne fonctionnera alors plus.'}
              </p>
            </div>
          ) : (
            <p class="op-access">
              <Icon name="circle-check" size={18} />
              <span>
                Compte LOYNA déjà existant : <strong>le client se connecte avec son mot de passe</strong> sur loyna.fr/espace-client, avec l’adresse {r.email}. Son commerce s’ouvre à la connexion.
              </span>
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
