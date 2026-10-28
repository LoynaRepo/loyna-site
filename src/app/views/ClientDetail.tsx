// Fiche client : solde, récompenses, niveau VIP (Premium et Pro) et parrainage (Pro), historique, carte Wallet,
// consentements et RGPD. Les boutons suivent les droits renvoyés par le serveur (permissions de la fiche).
import {useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, feature, go, merchant, toast, toastError} from '../state';
import {Badge, Btn, ErrorBox, Field, LinkBox, Modal, PageHead, Panel, Spinner, Toggle, useBusy, useLoad} from '../ui';
import {ago, copy, date, dateTime, download, euros, initials, joinUrl, num, plural, shortDateTime, uuid} from '../util';

interface Detail {
  status: 'OK' | 'NOT_FOUND';
  customer: {id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null; birthday: string | null; status: string; source: string | null; created_at: string; last_activity_at: string | null};
  account: null | {
    loyalty_account_id: string;
    balance: number;
    lifetime_balance: number;
    visits_count: number;
    program: {name: string; type: string; unit_singular: string; unit_plural: string; reward_threshold: number};
    progress: {current: number; target: number | null; remaining: number; label: string};
    next_reward: null | {name: string; remaining: number};
    available_rewards: {customer_reward_id: string; name: string; expires_at: string | null}[];
  };
  tier?: null | {level: 1 | 2 | 3; name: string; reached_at: string | null};
  referral?: null | {code: string | null; referred_by: {id: string; first_name: string} | null; referrals: number; rewarded_at: string | null};
  transactions: {id: string; type: string; source: string; points_delta: number; balance_after: number; amount: number | null; note: string | null; created_at: string; staff_name: string | null; reversed: boolean}[];
  rewards: {id: string; name: string; status: string; earned_at: string; redeemed_at: string | null; expires_at: string | null}[];
  consents: null | {loyalty_terms: boolean; marketing_wallet: boolean; consent_timestamp: string | null; consent_version: string | null};
  wallet: {pass_status: string | null; apple_devices: number; google_object: boolean; google_has_users: boolean | null};
  permissions: {can_adjust: boolean; can_reverse_any: boolean; can_manage: boolean; can_redeem: boolean; can_reissue_card: boolean};
}

const TX: Record<string, string> = {EARN: 'Passage', REDEEM: 'Récompense utilisée', REVERSAL: 'Annulation', ADJUSTMENT: 'Ajustement manuel'};
const txLabel = (t: {type: string; source: string}) => (t.source === 'REFERRAL' ? 'Bonus de parrainage' : (TX[t.type] ?? t.type));
const REWARD_STATUS: Record<string, [string, 'gold' | 'green' | 'neutral' | 'red']> = {
  AVAILABLE: ['À utiliser', 'gold'],
  REDEEMED: ['Utilisée', 'green'],
  EXPIRED: ['Expirée', 'neutral'],
  CANCELLED: ['Annulée', 'red'],
};

export function ClientDetail({id}: {id: string}) {
  const d = useLoad(() => api.rpc<Detail>('get_customer_detail', {p_customer_id: id}), [id]);
  const [modal, setModal] = useState<'' | 'adjust' | 'card' | 'delete'>('');
  const [busy, run] = useBusy();

  if (d.error) return <ErrorBox error={d.error} retry={d.reload} />;
  if (!d.data) return <Spinner />;
  if (d.data.status !== 'OK')
    return (
      <div class="page">
        <PageHead title="Client introuvable" back={{href: '#/clients', label: 'Clients'}} />
        <p class="muted">Ce client n’existe pas ou a été supprimé.</p>
      </div>
    );

  const {customer: c, account: a, permissions: p} = d.data;
  const unit = (n: number) => (Math.abs(n) > 1 ? a?.program.unit_plural : a?.program.unit_singular) ?? 'points';
  const pct = a?.progress.target ? Math.min(100, Math.round((a.progress.current / a.progress.target) * 100)) : null;

  const redeem = (rid: string) =>
    run(async () => {
      try {
        const r = await api.edge('redeem-reward', {customer_reward_id: rid});
        toast(r.display?.title?.replace(/^✓\s*/, '') ?? 'Récompense utilisée', r.status === 'REDEEMED' ? 'ok' : 'info');
        d.reload();
      } catch (e) {
        toastError(e);
      }
    });

  return (
    <div class="page">
      <PageHead eyebrow="Fiche client" title={`${c.first_name} ${c.last_name ?? ''}`.trim()} back={{href: '#/clients', label: 'Clients'}}>
        {p.can_adjust && a && (
          <Btn kind="ghost" icon="pencil" onClick={() => setModal('adjust')}>
            Ajuster le solde
          </Btn>
        )}
        {p.can_reissue_card && (
          <Btn kind="primary" icon="wallet" onClick={() => setModal('card')}>
            Renvoyer la carte
          </Btn>
        )}
      </PageHead>

      <div class="cd-grid">
        <Panel class="cd-main" dark>
          <div class="cd-id">
            <span class="avatar avatar--lg">{initials(`${c.first_name} ${c.last_name ?? ''}`)}</span>
            <div>
              <strong>{a?.program.name ?? 'Sans carte active'}</strong>
              <small>
                Inscrit le {date(c.created_at)} · dernière visite {ago(c.last_activity_at)}
              </small>
            </div>
            {d.data.tier && feature('loyalty.tiers') && (
              <span class={`vip vip--${d.data.tier.level}`} title={d.data.tier.reached_at ? `Niveau atteint le ${date(d.data.tier.reached_at)}` : undefined}>
                <Icon name="crown" size={15} />
                Niveau {d.data.tier.name}
              </span>
            )}
            {c.status !== 'ACTIVE' && <Badge tone="red">{c.status === 'BLOCKED' ? 'Bloqué' : 'Supprimé'}</Badge>}
          </div>
          {a ? (
            <>
              <div class="cd-balance">
                <b>{num(a.balance)}</b>
                <span>{unit(a.balance)}</span>
              </div>
              {pct !== null && (
                <div class="progress" role="progressbar" aria-valuenow={a.progress.current} aria-valuemax={a.progress.target ?? undefined} aria-label={a.progress.label}>
                  <span style={{width: `${pct}%`}} />
                </div>
              )}
              <p class="cd-next">{a.next_reward ? `Encore ${num(a.next_reward.remaining)} ${unit(a.next_reward.remaining)} avant « ${a.next_reward.name} »` : a.progress.label}</p>
              <div class="cd-stats">
                <span>
                  <b>{num(a.visits_count)}</b> passages au total
                </span>
                <span>
                  <b>{num(a.lifetime_balance)}</b> {unit(a.lifetime_balance)} cumulés
                </span>
              </div>
            </>
          ) : (
            <p class="muted">Aucun compte fidélité actif pour ce client.</p>
          )}
        </Panel>

        <Panel title="Récompenses à utiliser">
          {a?.available_rewards.length ? (
            <ul class="rw-list">
              {a.available_rewards.map((r) => (
                <li>
                  <span class="rw-i">
                    <Icon name="gift" />
                  </span>
                  <span class="rw-t">
                    <strong>{r.name}</strong>
                    <small>{r.expires_at ? `Valable jusqu’au ${date(r.expires_at)}` : 'Sans date limite'}</small>
                  </span>
                  {p.can_redeem && (
                    <Btn kind="gold" small busy={busy} onClick={() => redeem(r.customer_reward_id)}>
                      Utiliser
                    </Btn>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p class="muted">Aucune récompense en attente.</p>
          )}
        </Panel>
      </div>

      <div class="cd-grid cd-grid--b">
        <Panel title="Historique" sub="50 derniers mouvements">
          {d.data.transactions.length ? (
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opération</th>
                    <th class="r">Points</th>
                    <th class="r">Solde</th>
                    <th class="hide-sm">Par</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.transactions.map((t) => (
                    <tr class={t.reversed ? 'is-rev' : ''}>
                      <td class="nowrap">{shortDateTime(t.created_at)}</td>
                      <td>
                        {txLabel(t)}
                        {t.amount ? ` · ${euros(t.amount)}` : ''}
                        {t.reversed && <Badge tone="neutral">annulé</Badge>}
                        {t.note && <small class="tx-note">{t.note}</small>}
                      </td>
                      <td class={`r ${t.points_delta > 0 ? 'pos' : 'neg'}`}>
                        {t.points_delta > 0 ? '+' : ''}
                        {num(t.points_delta)}
                      </td>
                      <td class="r">{num(t.balance_after)}</td>
                      <td class="hide-sm">{t.staff_name ?? (t.source === 'QR_SCAN' ? 'Scanner' : '–')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p class="muted">Aucun passage pour le moment.</p>
          )}
          {d.data.rewards.length > 0 && (
            <details class="more">
              <summary>Toutes les récompenses ({d.data.rewards.length})</summary>
              <ul class="plain">
                {d.data.rewards.map((r) => (
                  <li>
                    <Badge tone={REWARD_STATUS[r.status]?.[1] ?? 'neutral'}>{REWARD_STATUS[r.status]?.[0] ?? r.status}</Badge> {r.name} · débloquée le {date(r.earned_at)}
                    {r.redeemed_at ? `, utilisée le ${date(r.redeemed_at)}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>

        <div class="stack">
          <Panel title="Coordonnées">
            {c.phone || c.email || c.birthday ? (
              <ul class="contact">
                {c.phone && (
                  <li>
                    <Icon name="phone" size={18} />
                    <a href={`tel:${c.phone}`}>{c.phone}</a>
                  </li>
                )}
                {c.email && (
                  <li>
                    <Icon name="mail" size={18} />
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  </li>
                )}
                {c.birthday && (
                  <li>
                    <Icon name="cake" size={18} />
                    {new Date(c.birthday).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}
                  </li>
                )}
              </ul>
            ) : (
              <p class="muted small">Coordonnées non renseignées ou réservées aux responsables.</p>
            )}
          </Panel>

          <Panel title="Carte Wallet">
            <ul class="contact">
              <li>
                <Icon name="smartphone" size={18} />
                Apple Wallet : {d.data.wallet.apple_devices > 0 ? `installée (${d.data.wallet.apple_devices} appareil${d.data.wallet.apple_devices > 1 ? 's' : ''})` : 'non installée'}
              </li>
              <li>
                <Icon name="smartphone" size={18} />
                Google Wallet : {d.data.wallet.google_has_users ? 'enregistrée' : d.data.wallet.google_object ? 'créée, pas encore enregistrée' : 'non installée'}
              </li>
            </ul>
            {d.data.wallet.pass_status === 'VOIDED' && <p class="muted small">Cette carte a été désactivée.</p>}
          </Panel>

          {d.data.referral && feature('referral') && <Referral r={d.data.referral} />}

          {d.data.consents && <Consents id={c.id} consents={d.data.consents} canManage={p.can_manage} reload={d.reload} />}

          {p.can_manage && (
            <Panel title="Données personnelles (RGPD)">
              <div class="btn-row">
                <Btn
                  kind="ghost"
                  small
                  icon="download"
                  busy={busy}
                  onClick={() =>
                    run(async () => {
                      try {
                        const data = await api.edge('customer-privacy', {action: 'export', customer_id: c.id});
                        download(`client-${c.first_name.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
                      } catch (e) {
                        toastError(e);
                      }
                    })
                  }
                >
                  Exporter
                </Btn>
                <Btn kind="danger" small icon="trash-2" onClick={() => setModal('delete')}>
                  Supprimer le client
                </Btn>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {a && <AdjustModal open={modal === 'adjust'} onClose={() => setModal('')} accountId={a.loyalty_account_id} unit={a.program.unit_plural} onDone={d.reload} />}
      <CardModal open={modal === 'card'} onClose={() => setModal('')} customerId={c.id} canRotate={p.can_manage} name={c.first_name} />
      <DeleteModal open={modal === 'delete'} onClose={() => setModal('')} id={c.id} name={c.first_name} />
    </div>
  );
}

/** Parrainage (Pro) : code du client, ses filleuls, son parrain éventuel. */
function Referral({r}: {r: NonNullable<Detail['referral']>}) {
  const m = merchant.value!;
  const link = r.code ? `${joinUrl(m.merchant_slug)}?parrain=${r.code}` : null;
  return (
    <Panel title="Parrainage">
      <ul class="contact">
        {r.code && (
          <li>
            <Icon name="share-2" size={18} />
            <span>
              Code <code class="code">{r.code}</code>
            </span>
            {link && (
              <button type="button" class="linkish small" onClick={async () => toast((await copy(link)) ? 'Lien de parrainage copié' : 'Copie impossible : le lien est au dos de la carte du client.', 'info')}>
                Copier le lien
              </button>
            )}
          </li>
        )}
        <li>
          <Icon name="users" size={18} />
          {r.referrals > 0 ? `${plural(r.referrals, 'ami parrainé', 'amis parrainés')}` : 'Aucun ami parrainé pour le moment'}
        </li>
        {r.referred_by && (
          <li>
            <Icon name="user-plus" size={18} />
            <span>
              Parrainé par <a href={`#/client/${r.referred_by.id}`}>{r.referred_by.first_name}</a>
              {r.rewarded_at ? ` · bonus versé le ${date(r.rewarded_at)}` : ' · bonus versé à sa première visite'}
            </span>
          </li>
        )}
      </ul>
      <p class="muted small">Le lien de parrainage est au dos de la carte du client.</p>
    </Panel>
  );
}

function Consents({id, consents: k, canManage, reload}: {id: string; consents: NonNullable<Detail['consents']>; canManage: boolean; reload: () => void}) {
  const [busy, run] = useBusy();
  // Le commerce peut retirer un accord, jamais en donner un : RPC update_customer_consents (2 arguments)
  const withdraw = () =>
    run(async () => {
      try {
        const r = await api.rpc<{status: string; hint?: string}>('update_customer_consents', {p_customer_id: id, p_marketing_wallet: false});
        if (r?.status && r.status !== 'OK') return toast(r.status === 'FORBIDDEN' ? 'Vous n’avez pas l’autorisation de modifier ce client.' : (r.hint ?? 'Retrait impossible.'), 'error');
        toast('Consentement retiré');
        reload();
      } catch (e) {
        toastError(e);
      }
    });
  const row = (label: string, on: boolean, removable = false) => (
    <li>
      <Icon name={on ? 'circle-check' : 'circle-x'} size={18} class={on ? 'ok' : 'off'} />
      <span>{label}</span>
      {on && removable && canManage && (
        <button type="button" class="linkish small" disabled={busy} onClick={withdraw}>
          Retirer
        </button>
      )}
    </li>
  );
  return (
    <Panel title="Consentements">
      <ul class="contact consents">
        {row('Programme de fidélité', k.loyalty_terms)}
        {row('Offres dans le Wallet', k.marketing_wallet, true)}
      </ul>
      {k.consent_timestamp && (
        <p class="muted small">
          Recueillis le {dateTime(k.consent_timestamp)}
          {k.consent_version ? ` (version ${k.consent_version})` : ''}. Seul le client peut redonner son accord, depuis sa carte.
        </p>
      )}
    </Panel>
  );
}

function AdjustModal({open, onClose, accountId, unit, onDone}: {open: boolean; onClose: () => void; accountId: string; unit: string; onDone: () => void}) {
  const [sign, setSign] = useState<1 | -1>(1);
  const [n, setN] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const [key] = useState(uuid);
  const submit = (e: Event) => {
    e.preventDefault();
    const v = parseInt(n, 10);
    if (!v || v < 1) return setError('Indiquez un nombre supérieur à 0.');
    if (!reason.trim()) return setError('Indiquez le motif (il est conservé dans l’historique).');
    setError('');
    run(async () => {
      try {
        const r = await api.rpc('adjust_points', {p_loyalty_account_id: accountId, p_points_delta: sign * v, p_reason: reason.trim(), p_idempotency_key: key});
        if (r.status === 'OK' || r.status === 'ALREADY_APPLIED') {
          toast('Solde ajusté');
          onClose();
          onDone();
        } else if (r.status === 'INSUFFICIENT_BALANCE') setError('Le solde du client est insuffisant pour ce retrait.');
        else if (r.status === 'FORBIDDEN') setError('Vous n’avez pas l’autorisation d’ajuster un solde.');
        else setError('Ajustement impossible.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ajustement impossible.');
      }
    });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajuster le solde"
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>
            Annuler
          </Btn>
          <Btn kind="gold" busy={busy} type="submit" onClick={submit as any}>
            Enregistrer
          </Btn>
        </>
      }
    >
      <form onSubmit={submit} class="form">
        <div class="seg" role="radiogroup" aria-label="Sens">
          <button type="button" role="radio" aria-checked={sign === 1} class={sign === 1 ? 'on' : ''} onClick={() => setSign(1)}>
            Ajouter
          </button>
          <button type="button" role="radio" aria-checked={sign === -1} class={sign === -1 ? 'on' : ''} onClick={() => setSign(-1)}>
            Retirer
          </button>
        </div>
        <Field label={`Nombre de ${unit}`}>
          <input type="number" min={1} max={100000} inputMode="numeric" value={n} onInput={(e) => setN((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Motif" hint="Exemple : passage oublié le 12 octobre.">
          <input type="text" maxLength={200} value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
        </Field>
        {error && <p class="form-err">{error}</p>}
      </form>
    </Modal>
  );
}

function CardModal({open, onClose, customerId, canRotate, name}: {open: boolean; onClose: () => void; customerId: string; canRotate: boolean; name: string}) {
  const [links, setLinks] = useState<{apple?: string; google?: string}>({});
  const [rotate, setRotate] = useState(false);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const make = (platform: 'apple' | 'google') =>
    run(async () => {
      setError('');
      try {
        if (platform === 'apple') {
          const r = await api.edge('apple-pass-create', {customer_id: customerId, rotate_qr: rotate});
          setLinks((l) => ({...l, apple: r.apple_pass_url}));
          if (r.qr_rotated) toast('Nouveau QR code créé : l’ancienne carte est refusée au scan.', 'info');
        } else {
          const r = await api.edge('google-wallet-create', {customer_id: customerId});
          setLinks((l) => ({...l, google: r.google_save_url}));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lien indisponible.');
      }
    });
  return (
    <Modal open={open} onClose={onClose} title="Renvoyer la carte" wide>
      <p class="muted">Créez un lien d’ajout de la carte de {name}, puis faites scanner le QR code avec son téléphone (ou envoyez-lui le lien).</p>
      {canRotate && (
        <Toggle
          checked={rotate}
          onChange={setRotate}
          label="Carte perdue ou partagée"
          hint="Génère un nouveau QR code pour la carte Apple : l’ancien est refusé immédiatement au scan."
        />
      )}
      <div class="btn-row">
        <Btn kind="primary" icon="smartphone" busy={busy} onClick={() => make('apple')}>
          Lien Apple Wallet
        </Btn>
        <Btn kind="primary" icon="smartphone" busy={busy} onClick={() => make('google')}>
          Lien Google Wallet
        </Btn>
      </div>
      {error && <p class="form-err">{error}</p>}
      {links.apple && (
        <div class="sub-block">
          <h3>Apple Wallet (iPhone)</h3>
          <LinkBox url={links.apple} />
        </div>
      )}
      {links.google && (
        <div class="sub-block">
          <h3>Google Wallet (Android)</h3>
          <LinkBox url={links.google} />
        </div>
      )}
    </Modal>
  );
}

function DeleteModal({open, onClose, id, name}: {open: boolean; onClose: () => void; id: string; name: string}) {
  const [typed, setTyped] = useState('');
  const [busy, run] = useBusy();
  const ok = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const del = () =>
    run(async () => {
      try {
        const r = await api.edge('customer-privacy', {action: 'delete', customer_id: id, reason: 'Suppression depuis LOYNA Business'});
        if (r.status === 'DELETED' || r.status === 'ALREADY_DELETED') {
          toast('Client supprimé : données anonymisées et carte désactivée');
          onClose();
          go('clients');
        } else toast('Suppression impossible.', 'error');
      } catch (e) {
        toastError(e);
      }
    });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Supprimer ce client ?"
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>
            Annuler
          </Btn>
          <Btn kind="danger" icon="trash-2" disabled={!ok} busy={busy} onClick={del}>
            Supprimer définitivement
          </Btn>
        </>
      }
    >
      <p>
        Ses coordonnées sont effacées, sa carte Wallet est désactivée et son QR code refusé. Les statistiques restent, sans aucune donnée personnelle. <strong>Cette action est irréversible.</strong>
      </p>
      <Field label={`Pour confirmer, tapez le prénom du client : ${name}`}>
        <input type="text" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} autoComplete="off" />
      </Field>
    </Modal>
  );
}
