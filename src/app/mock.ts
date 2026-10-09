// Démonstration locale de LOYNA Business (npm run dev, adresse avec ?demo) : données fictives en
// mémoire, aucune requête réseau. Exclu de la version publiée (import.meta.env.DEV).
import {ApiError} from './http';
import type {Backend, Match, SelectOptions} from './backend';

const MID = 'demo-merchant';
const now = Date.now();
const day = 86400000;
const iso = (t: number) => new Date(t).toISOString();
const id = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

const FEATURES = [
  'wallet.apple', 'wallet.google', 'wallet.notifications', 'enrollment.qr', 'loyalty.visits', 'loyalty.points', 'rewards', 'scanner', 'dashboard',
  'loyalty.spend', 'campaigns.wallet', 'sms', 'sms.monthly_quota', 'automation.birthday', 'automation.inactive', 'segmentation', 'campaigns.scheduled', 'analytics.advanced',
];
const PERMS = [
  ['scan.validate', 'Scanner une carte et valider un passage'], ['scan.override_cooldown', 'Forcer un passage malgré le délai anti-double scan'],
  ['scan.custom_points', 'Saisir un nombre de points personnalisé'], ['transactions.reverse_own', 'Annuler son propre passage récent'],
  ['transactions.reverse_any', 'Annuler n’importe quel passage'], ['transactions.adjust', 'Ajuster manuellement un solde'],
  ['rewards.redeem', 'Valider l’utilisation d’une récompense'], ['customers.read_basic', 'Voir prénom, solde et récompenses des clients'],
  ['customers.read', 'Voir la fiche client complète (coordonnées)'], ['customers.manage', 'Modifier, exporter ou supprimer un client'],
  ['program.manage', 'Modifier le programme de fidélité'], ['rewards.manage', 'Gérer les récompenses'], ['campaigns.manage', 'Préparer des campagnes'],
  ['campaigns.send', 'Envoyer ou programmer des campagnes'], ['team.manage', 'Gérer l’équipe'], ['settings.manage', 'Modifier la configuration et le branding'],
  ['analytics.read', 'Consulter les statistiques'], ['audit.read', 'Consulter le journal d’audit'], ['wallet.reissue', 'Renvoyer le lien d’ajout de la carte Wallet'],
];
const STAFF_PERMS = ['scan.validate', 'transactions.reverse_own', 'rewards.redeem', 'customers.read_basic', 'wallet.reissue'];
const FIRST = ['Léa', 'Hugo', 'Chloé', 'Lucas', 'Manon', 'Nathan', 'Inès', 'Théo', 'Camille', 'Louis', 'Jade', 'Arthur', 'Zoé', 'Jules', 'Emma', 'Gabriel', 'Sarah', 'Adam', 'Lina', 'Raphaël', 'Alice', 'Noah', 'Rose', 'Tom'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent'];

const db: Record<string, any[]> = {
  merchants: [
    {id: MID, name: 'Maison Lumière', slug: 'maison-lumiere', business_type: 'Coiffure', logo_url: null, primary_color: '#1f1c17', secondary_color: '#f8f4ec', address: '12 rue de la Loge', postal_code: '34000', city: 'Montpellier', phone: '04 00 00 00 00', website: null},
  ],
  merchant_settings: [
    {merchant_id: MID, enrollment_collect_last_name: false, enrollment_collect_phone: true, enrollment_require_phone: false, enrollment_collect_email: false, enrollment_collect_birthday: true, terms_url: null, privacy_url: null, wallet_back_text: 'Du mardi au samedi, 9 h – 19 h.', notify_balance_updates: true, birthday_enabled: true, birthday_channel: 'WALLET', birthday_message: 'Joyeux anniversaire {prenom} ! Une surprise vous attend chez {commerce}.', inactive_enabled: false, inactive_after_days: 60, inactive_channel: 'WALLET', inactive_message: '{prenom}, cela fait longtemps ! Revenez nous voir chez {commerce}.', reengagement_cooldown_days: 30, marketing_min_interval_hours: 48, scan_undo_window_seconds: 120},
  ],
  loyalty_programs: [
    {id: 'prog1', merchant_id: MID, name: 'Carte fidélité Maison Lumière', type: 'VISITS', points_per_event: 1, spend_points_per_unit: null, spend_rounding: 'FLOOR', reward_threshold: 10, reset_behavior: 'RESET_ON_REWARD', scan_cooldown_minutes: 60, unit_label_singular: 'passage', unit_label_plural: 'passages', wallet_description: 'Un tampon à chaque visite, un brushing offert au 10e.', status: 'ACTIVE', created_at: iso(now - 90 * day)},
  ],
  rewards: [
    {id: 'rw1', merchant_id: MID, program_id: 'prog1', name: 'Brushing offert', description: null, threshold: 10, reward_type: 'FREE_ITEM', value: null, validity_days: 90, status: 'ACTIVE', sort_order: 0},
    {id: 'rw2', merchant_id: MID, program_id: 'prog1', name: '-10 % sur les soins', description: null, threshold: 5, reward_type: 'DISCOUNT_PERCENT', value: 10, validity_days: null, status: 'ACTIVE', sort_order: 1},
  ],
  campaigns: [
    {id: 'c1', merchant_id: MID, name: 'Nouveaux soins d’automne', channel: 'WALLET', audience_type: 'ALL', audience_filter: {}, message_title: 'Nouveau chez Maison Lumière', message_body: '{prenom}, découvrez nos soins d’automne : -15 % toute la semaine.', scheduled_at: null, sent_at: iso(now - 12 * day), status: 'SENT', stats: {total: 64, sent: 61, failed: 0, skipped: 3}, error: null, created_at: iso(now - 13 * day)},
    {id: 'c2', merchant_id: MID, name: 'Relance clients absents', channel: 'SMS', audience_type: 'INACTIVE_60', audience_filter: {}, message_title: null, message_body: 'Bonjour {prenom}, -10 % sur votre prochaine visite chez {commerce}.', scheduled_at: null, sent_at: null, status: 'DRAFT', stats: {}, error: null, created_at: iso(now - 2 * day)},
  ],
  merchant_staff: [
    {id: 'st1', merchant_id: MID, user_id: 'u1', role: 'OWNER', status: 'ACTIVE', display_name: 'Camille', email: 'camille@exemple.test', permissions: {}, last_seen_at: iso(now - 60000), created_at: iso(now - 90 * day)},
    {id: 'st2', merchant_id: MID, user_id: 'u2', role: 'STAFF', status: 'ACTIVE', display_name: 'Yanis', email: 'yanis@exemple.test', permissions: {}, last_seen_at: iso(now - 2 * day), created_at: iso(now - 40 * day)},
    {id: 'st3', merchant_id: MID, user_id: 'u3', role: 'STAFF', status: 'INVITED', display_name: 'Sofia', email: 'sofia@exemple.test', permissions: {}, last_seen_at: null, created_at: iso(now - day)},
  ],
  permissions_catalog: PERMS.map(([permission, description]) => ({permission, description})),
  role_permissions: [
    ...PERMS.map(([p]) => ({role: 'OWNER', permission: p})),
    ...PERMS.map(([p]) => ({role: 'ADMIN', permission: p})),
    ...STAFF_PERMS.map((p) => ({role: 'STAFF', permission: p})),
  ],
  plan_entitlements: [
    ...['wallet.apple', 'wallet.google', 'wallet.notifications', 'enrollment.qr', 'loyalty.visits', 'loyalty.points', 'loyalty.spend', 'rewards', 'scanner', 'dashboard', 'campaigns.wallet'].flatMap((f) =>
      ['ESSENTIEL', 'GROWTH', 'PRO'].map((plan) => ({plan, feature: f, enabled: true})),
    ),
    ...['analytics.advanced', 'automation.birthday', 'automation.inactive', 'campaigns.scheduled', 'segmentation', 'sms', 'sms.monthly_quota'].flatMap((f) => ['GROWTH', 'PRO'].map((plan) => ({plan, feature: f, enabled: true}))),
    ...['api.webhooks', 'automation.advanced', 'integrations', 'support.priority', 'validation.automatic'].map((f) => ({plan: 'PRO', feature: f, enabled: true})),
  ],
  features_catalog: [
    ['wallet.apple', 'Carte Apple Wallet'], ['wallet.google', 'Carte Google Wallet'], ['wallet.notifications', 'Notifications Wallet'], ['enrollment.qr', 'Inscription par QR code'],
    ['loyalty.visits', 'Programme au passage'], ['loyalty.points', 'Programme à points'], ['loyalty.spend', 'Programme au montant dépensé'], ['rewards', 'Récompenses'],
    ['scanner', 'Scanner LOYNA Business'], ['dashboard', 'Tableau de bord'], ['campaigns.wallet', 'Campagnes par notification Wallet'], ['sms', 'Envoi de SMS'],
    ['sms.monthly_quota', 'Quota mensuel de SMS (segments)'], ['segmentation', 'Segmentation des campagnes'], ['automation.birthday', 'Automatisation anniversaires'],
    ['automation.inactive', 'Relance des clients inactifs'], ['campaigns.scheduled', 'Campagnes programmées'], ['analytics.advanced', 'Statistiques avancées'],
  ].map(([feature, description]) => ({feature, description})),
};

// Clients et historiques fictifs
interface Cust {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  created_at: string;
  last: string;
  balance: number;
  visits: number;
  rewards: {id: string; name: string; status: string; earned_at: string; redeemed_at: string | null}[];
  tx: any[];
  consents: {marketing_wallet: boolean; marketing_sms: boolean};
  deleted?: boolean;
}
let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const customers: Cust[] = Array.from({length: 64}, (_, i) => {
  const created = now - Math.floor(rnd() * 90) * day - Math.floor(rnd() * day);
  const visits = Math.floor(rnd() * 24);
  const last = created + Math.floor(rnd() * (now - created));
  const c: Cust = {
    id: `cu${i}`,
    first_name: FIRST[i % FIRST.length],
    last_name: LAST[(i * 7) % LAST.length],
    phone: rnd() > 0.2 ? `06 ${String(10 + i).padStart(2, '0')} ${String((i * 37) % 100).padStart(2, '0')} 00 00` : null,
    email: rnd() > 0.6 ? `${FIRST[i % FIRST.length].toLowerCase()}@exemple.test` : null,
    birthday: rnd() > 0.5 ? `199${i % 10}-0${(i % 9) + 1}-1${i % 10}` : null,
    created_at: iso(created),
    last: iso(last),
    balance: visits % 10,
    visits,
    rewards: [],
    tx: [],
    consents: {marketing_wallet: rnd() > 0.2, marketing_sms: rnd() > 0.6},
  };
  for (let v = 0; v < Math.min(visits, 12); v++) {
    c.tx.push({id: id(), seq: v + 1, type: 'EARN', source: 'QR_SCAN', points_delta: 1, balance_after: (v + 1) % 10, amount: null, note: null, created_at: iso(last - (visits - v) * 3 * day), staff_name: v % 3 ? 'Yanis' : 'Camille', reversed: false});
  }
  if (visits >= 10) c.rewards.push({id: id(), name: 'Brushing offert', status: i % 3 ? 'REDEEMED' : 'AVAILABLE', earned_at: iso(last - 20 * day), redeemed_at: i % 3 ? iso(last - 10 * day) : null});
  return c;
});

function membership(): any {
  return {
    staff_id: 'st1', merchant_id: MID, merchant_name: db.merchants[0].name, merchant_slug: db.merchants[0].slug, merchant_status: 'ACTIVE',
    logo_url: db.merchants[0].logo_url, primary_color: db.merchants[0].primary_color, secondary_color: db.merchants[0].secondary_color,
    subscription_plan: 'GROWTH', role: 'OWNER', display_name: 'Camille', permissions: PERMS.map(([p]) => p),
    features: Object.fromEntries(FEATURES.map((f) => [f, {enabled: true, limit: f === 'sms.monthly_quota' ? 200 : null}])),
  };
}

function summary(c: Cust) {
  const prog = db.loyalty_programs[0];
  const target = prog.reward_threshold;
  const next = db.rewards.filter((r) => r.status === 'ACTIVE' && r.threshold > c.balance).sort((a, b) => a.threshold - b.threshold)[0];
  return {
    loyalty_account_id: `acc-${c.id}`,
    balance: c.balance,
    lifetime_balance: c.visits,
    visits_count: c.visits,
    program: {name: prog.name, type: prog.type, unit_singular: prog.unit_label_singular, unit_plural: prog.unit_label_plural, reward_threshold: target},
    progress: {current: c.balance, target, remaining: target - c.balance, label: `${c.balance} / ${target} passages`},
    next_reward: next ? {name: next.name, remaining: next.threshold - c.balance} : null,
    available_rewards: c.rewards.filter((r) => r.status === 'AVAILABLE').map((r) => ({customer_reward_id: r.id, name: r.name, expires_at: null})),
  };
}

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
let lastTx: {cust: Cust; txId: string} | null = null;
let scanCount = 0;

function scanDisplay(c: Cust, unlocked: boolean) {
  const s = summary(c);
  const lines = [s.progress.label];
  if (s.next_reward) lines.push(`Prochaine récompense : ${s.next_reward.remaining} passages (${s.next_reward.name})`);
  const actions: any[] = [{type: 'UNDO', label: 'Annuler', until: iso(Date.now() + 120000)}];
  for (const r of s.available_rewards) actions.push({type: 'REDEEM', label: `Utiliser « ${r.name} »`, customer_reward_id: r.customer_reward_id});
  return unlocked
    ? {tone: 'reward', title: '🎁 Récompense débloquée', subtitle: c.first_name, lines: ['Brushing offert', ...lines], vibrate: [80, 60, 80], actions}
    : {tone: 'success', title: '✓ Passage validé', subtitle: c.first_name, lines, vibrate: [80], actions};
}

export const mockBackend = {
  demo: true,
  async getSession() {
    try {
      return sessionStorage.getItem('demo-session') ? {email: 'camille@exemple.test'} : null;
    } catch {
      return null;
    }
  },
  onAuthChange() {},
  async signIn(email: string) {
    await wait(400);
    if (!email.includes('@')) throw new ApiError('AUTH', 'E-mail ou mot de passe incorrect.');
    sessionStorage.setItem('demo-session', '1');
  },
  async signOut() {
    sessionStorage.removeItem('demo-session');
  },
  async updatePassword() {
    await wait();
  },
  async rpc(fn: string, a: any = {}): Promise<any> {
    await wait();
    switch (fn) {
      case 'my_staff_context':
        return {user_id: 'u1', is_platform_admin: false, memberships: [membership()]};
      case 'search_customers': {
        const q = (a.p_query ?? '').toLowerCase();
        let list = customers.filter((c) => !c.deleted && (!q || `${c.first_name} ${c.last_name} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q)));
        const age = (t: string) => (now - new Date(t).getTime()) / day;
        if (a.p_filter === 'ACTIVE') list = list.filter((c) => age(c.last) <= 30);
        if (a.p_filter === 'INACTIVE') list = list.filter((c) => age(c.last) > 60);
        if (a.p_filter === 'NEW') list = list.filter((c) => age(c.created_at) <= 30);
        if (a.p_filter === 'REWARD_AVAILABLE') list = list.filter((c) => c.rewards.some((r) => r.status === 'AVAILABLE'));
        list.sort((x, y) => y.last.localeCompare(x.last));
        return {
          total: list.length,
          contact_visible: true,
          items: list.slice(a.p_offset, a.p_offset + a.p_limit).map((c) => ({
            id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, status: 'ACTIVE', balance: c.balance,
            visits_count: c.visits, rewards_available: c.rewards.filter((r) => r.status === 'AVAILABLE').length, last_activity_at: c.last, created_at: c.created_at,
          })),
        };
      }
      case 'get_customer_detail': {
        const c = customers.find((x) => x.id === a.p_customer_id && !x.deleted);
        if (!c) return {status: 'NOT_FOUND'};
        return {
          status: 'OK',
          customer: {id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, birthday: c.birthday, status: 'ACTIVE', source: 'JOIN_PAGE', created_at: c.created_at, last_activity_at: c.last},
          account: summary(c),
          transactions: [...c.tx].reverse(),
          rewards: c.rewards,
          consents: {loyalty_terms: true, ...c.consents, consent_timestamp: c.created_at, consent_version: 'loyna-2026-09'},
          wallet: {pass_status: 'ACTIVE', apple_devices: c.visits % 2, apple_last_fetched_at: null, google_object: c.visits % 2 === 0, google_has_users: c.visits % 2 === 0},
          permissions: {can_adjust: true, can_reverse_any: true, can_manage: true, can_redeem: true, can_reissue_card: true},
        };
      }
      case 'dashboard_kpis': {
        const k = (f: number) => ({visits: Math.round(140 * f), points_earned: Math.round(140 * f), customers_active: Math.round(52 * f), returning_customers: Math.round(31 * f), return_rate: 59.6, new_customers: Math.round(18 * f), rewards_unlocked: Math.round(9 * f), rewards_redeemed: Math.round(7 * f), campaigns_sent: 1, wallet_notifications_sent: Math.round(61 * f), sms_segments_sent: 0});
        const f = a.p_days / 30;
        return {merchant_id: MID, period_days: a.p_days, current: k(f), previous: {...k(f * 0.82), return_rate: 54.1}, totals: {customers: customers.length, rewards_available: 6, wallet_passes: 58, apple_wallet_installed: 31, google_wallet_objects: 24}};
      }
      case 'analytics_timeseries': {
        const base = a.p_metric === 'visits' ? 5 : a.p_metric === 'new_customers' ? 1 : 0.4;
        return {
          status: 'OK',
          metric: a.p_metric,
          points: Array.from({length: a.p_days}, (_, i) => {
            const d = new Date(now - (a.p_days - 1 - i) * day);
            const wk = d.getDay();
            return {date: iso(d.setHours(0, 0, 0, 0)), value: wk === 0 || wk === 1 ? 0 : Math.round(base * (0.6 + rnd() * 0.9) * (wk === 6 ? 1.6 : 1))};
          }),
        };
      }
      case 'update_loyalty_program': {
        const p = db.loyalty_programs.find((x) => x.id === a.p_program_id);
        if ((a.p_changes.type && a.p_changes.type !== p.type) || (a.p_changes.reset_behavior && a.p_changes.reset_behavior !== p.reset_behavior))
          return {status: 'PROGRAM_HAS_ACTIVITY', hint: 'Le type et le mode de remise à zéro ne sont modifiables qu’avant le premier passage.'};
        Object.assign(p, a.p_changes);
        return {status: 'OK', program: {...p}};
      }
      case 'adjust_points': {
        const c = customers.find((x) => `acc-${x.id}` === a.p_loyalty_account_id)!;
        if (c.balance + a.p_points_delta < 0) return {status: 'INSUFFICIENT_BALANCE'};
        c.balance += a.p_points_delta;
        c.tx.push({id: id(), seq: c.tx.length + 1, type: 'ADJUSTMENT', source: 'MANUAL', points_delta: a.p_points_delta, balance_after: c.balance, amount: null, note: a.p_reason, created_at: iso(Date.now()), staff_name: 'Camille', reversed: false});
        return {status: 'OK'};
      }
      case 'my_subscription':
        return {status: 'OK', plan: 'GROWTH', billing_period: 'monthly', subscription_status: 'active', cancel_at_period_end: false, cancel_at: null, current_period_end: iso(now + 21 * day), commitment_end: iso(now + 330 * day), customer_email: 'camille@exemple.test'};
    }
    throw new ApiError('UNKNOWN', `Fonction ${fn} non simulée.`);
  },
  async edge(fn: string, b: any): Promise<any> {
    await wait(350);
    switch (fn) {
      case 'validate-visit': {
        if (b.action === 'undo') {
          if (!lastTx) return {status: 'NOT_FOUND', display: {tone: 'error', title: 'Annulation impossible', lines: [], actions: []}};
          const {cust} = lastTx;
          cust.balance = Math.max(0, cust.balance - 1);
          cust.visits--;
          cust.tx[cust.tx.length - 1].reversed = true;
          lastTx = null;
          return {status: 'REVERSED', display: {tone: 'info', title: 'Passage annulé', subtitle: cust.first_name, lines: [summary(cust).progress.label], actions: []}};
        }
        if (!/^loyna:v1:/.test(b.qr)) return {status: 'INVALID_QR', display: {tone: 'error', title: 'QR code non reconnu', subtitle: 'Ce n’est pas une carte LOYNA.', lines: [], vibrate: [200], actions: []}};
        if (b.qr.includes('montant') && !b.amount) return {status: 'AMOUNT_REQUIRED', display: {tone: 'info', title: 'Montant de l’achat', subtitle: 'Léa', lines: ['Saisissez le montant pour créditer les points.'], actions: [{type: 'ENTER_AMOUNT', label: 'Saisir le montant'}]}};
        if (b.qr.includes('delai') && !b.override_cooldown)
          return {status: 'COOLDOWN', retry_after_seconds: 2400, can_override: true, display: {tone: 'warning', title: 'Passage déjà enregistré', subtitle: 'Hugo', lines: ['Dernier passage il y a 20 min', 'Nouveau passage possible dans 40 min'], vibrate: [120, 80, 120], actions: [{type: 'OVERRIDE', label: 'Forcer le passage'}]}};
        const c = customers[scanCount++ % 6];
        c.balance += 1;
        c.visits += 1;
        c.last = iso(Date.now());
        let unlocked = false;
        if (c.balance >= 10) {
          c.balance = 0;
          unlocked = true;
          c.rewards.push({id: id(), name: 'Brushing offert', status: 'AVAILABLE', earned_at: iso(Date.now()), redeemed_at: null});
        }
        const txId = id();
        c.tx.push({id: txId, seq: c.tx.length + 1, type: 'EARN', source: 'QR_SCAN', points_delta: 1, balance_after: c.balance, amount: b.amount ?? null, note: null, created_at: iso(Date.now()), staff_name: 'Camille', reversed: false});
        lastTx = {cust: c, txId};
        return {status: 'OK', transaction_id: txId, customer: {id: c.id, first_name: c.first_name}, display: scanDisplay(c, unlocked)};
      }
      case 'redeem-reward': {
        for (const c of customers) {
          const r = c.rewards.find((x) => x.id === b.customer_reward_id);
          if (r) {
            r.status = 'REDEEMED';
            r.redeemed_at = iso(Date.now());
            return {status: 'REDEEMED', display: {tone: 'reward', title: 'Récompense utilisée', subtitle: c.first_name, lines: [r.name], actions: []}};
          }
        }
        return {status: 'NOT_AVAILABLE', display: {tone: 'error', title: 'Récompense indisponible', lines: [], actions: []}};
      }
      case 'campaign-send': {
        const c = db.campaigns.find((x) => x.id === b.campaign_id);
        if (b.action === 'preview') {
          const base = {status: 'OK', campaign_id: c.id, channel: c.channel, audience_type: c.audience_type, audience_total: 64, eligible: c.channel === 'SMS' ? 22 : 51, skipped: c.channel === 'SMS' ? {NO_CONSENT: 30, NO_PHONE: 12} : {NO_CONSENT: 9, NO_WALLET: 4}, feature_missing: null};
          if (c.channel !== 'SMS') return base;
          const segs = c.message_body.length > 150 ? 2 : 1;
          return {...base, sms: {summary: `Ce message représente ${segs} SMS par destinataire.`, segments_per_recipient: segs, total_sms_estimated: segs * 22, quota_remaining: 188, quota_ok: true, within_sending_hours: true}};
        }
        if (b.action === 'launch') {
          c.status = b.scheduled_at ? 'SCHEDULED' : 'SENT';
          c.scheduled_at = b.scheduled_at ?? null;
          c.sent_at = b.scheduled_at ? null : iso(Date.now());
          c.stats = {eligible: 51};
          return b.scheduled_at ? {status: 'SCHEDULED', scheduled_at: b.scheduled_at} : {status: 'SENDING', eligible: 51};
        }
        if (b.action === 'cancel') {
          c.status = 'CANCELLED';
          return {status: 'CANCELLED'};
        }
        return {status: 'OK', recipients_sent: 61, returned_within_7_days: 14, return_rate_7_days: 23};
      }
      case 'sms-send': {
        const t: string = b.text;
        const uni = /[^\x00-\x7FàâäéèêëïîôöùûüçÀÉÈ€]/.test(t);
        const segs = Math.max(1, Math.ceil((t.length + 11) / (uni ? 67 : 153)));
        const analysis = {encoding: uni ? 'UCS2' : 'GSM7', segments: segs, summary: `Ce message représente ${segs} SMS par destinataire.`, warnings: uni ? ['Caractères spéciaux ou emojis détectés : le message passe en Unicode (70 caractères par SMS au lieu de 160).'] : []};
        if (b.action === 'analyze') return analysis;
        const optimized = t.replace(/[’‘]/g, "'").replace(/[«»]/g, '"').replace(/\p{Extended_Pictographic}/gu, '');
        return {original: t, optimized, changed: optimized !== t, changes: optimized !== t ? [{from: '’', to: "'", count: 1, reason: 'apostrophe typographique (Unicode)'}] : [], before: analysis, after: {...analysis, segments: 1}, savedSegmentsPerRecipient: Math.max(0, segs - 1)};
      }
      case 'staff-manage':
        if (b.action === 'invite') {
          db.merchant_staff.push({id: id(), merchant_id: MID, user_id: id(), role: b.role, status: 'INVITED', display_name: b.display_name, email: b.email, permissions: {}, last_seen_at: null, created_at: iso(Date.now())});
          return {status: 'ADDED', setup_link: 'https://exemple.test/lien-d-activation-fictif'};
        }
        if (b.action === 'reset_link') return {setup_link: 'https://exemple.test/lien-d-activation-fictif'};
        {
          const s = db.merchant_staff.find((x) => x.id === b.staff_id);
          if (b.action === 'remove') s.status = 'DISABLED';
          if (b.status) s.status = b.status;
          if (b.role) s.role = b.role;
          if (b.permissions) s.permissions = b.permissions;
          if (b.display_name) s.display_name = b.display_name;
          return {status: 'OK'};
        }
      case 'apple-pass-create':
        return {apple_pass_url: 'https://exemple.test/carte-apple-fictive', qr_rotated: !!b.rotate_qr};
      case 'google-wallet-create':
        return {google_save_url: 'https://exemple.test/carte-google-fictive'};
      case 'customer-privacy': {
        const c = customers.find((x) => x.id === b.customer_id)!;
        if (b.action === 'export') return {customer: {first_name: c.first_name}, transactions: c.tx};
        if (b.action === 'delete') {
          c.deleted = true;
          return {status: 'DELETED'};
        }
        if (b.marketing_wallet === false) c.consents.marketing_wallet = false;
        if (b.marketing_sms === false) c.consents.marketing_sms = false;
        return {status: 'OK'};
      }
    }
    throw new ApiError('UNKNOWN', `Fonction ${fn} non simulée.`);
  },
  async select(table: string, opts: SelectOptions = {}): Promise<any[]> {
    await wait(150);
    let rows = [...(db[table] ?? [])];
    for (const [k, v] of Object.entries(opts.eq ?? {})) rows = rows.filter((r) => r[k] === v);
    for (const [k, v] of Object.entries(opts.neq ?? {})) rows = rows.filter((r) => r[k] !== v);
    if (opts.order) {
      const [col, asc = true] = opts.order;
      rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    return JSON.parse(JSON.stringify(opts.limit ? rows.slice(0, opts.limit) : rows));
  },
  async insert(table: string, row: any): Promise<any> {
    await wait(200);
    if (table === 'rewards' && row.status === 'ACTIVE' && db.rewards.some((r) => r.status === 'ACTIVE' && r.threshold === row.threshold)) throw new ApiError('23505', 'Cet élément existe déjà (doublon).');
    const r = {id: id(), created_at: iso(Date.now()), status: 'DRAFT', stats: {}, ...row};
    db[table].push(r);
    return {...r};
  },
  async update(table: string, match: Match, changes: any): Promise<any> {
    await wait(200);
    const r = db[table].find((x) => Object.entries(match).every(([k, v]) => x[k] === v));
    if (!r) throw new ApiError('PGRST116', 'Élément introuvable.');
    Object.assign(r, changes);
    return JSON.parse(JSON.stringify(r));
  },
  async remove(table: string, match: Match) {
    await wait(150);
    db[table] = db[table].filter((x) => !Object.entries(match).every(([k, v]) => x[k] === v));
  },
  async uploadPublic(_b: string, _p: string, file: Blob) {
    await wait(300);
    return URL.createObjectURL(file);
  },
} as unknown as Backend;
