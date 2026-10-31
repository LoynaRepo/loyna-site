// Option « +500 cartes » (décision d'Ewan du 2026-10-30, dépôt LOYNA docs/OFFRES.md, CGV article 4.9) : Starter et
// Premium, 4,99 € par mois et par pack (abonnement mensuel) ou 50,90 € par an (abonnement annuel), cumulable, cartes
// seulement. Ajout et retrait par la fonction card-packs du dépôt LOYNA : propriétaire ou administrateur du commerce,
// jamais en consultation opérateur (boutons masqués ici, accès refusé par readOnlyBackend et par le serveur). Le
// retrait prend effet à la fin de la période payée ; il est refusé si les cartes utilisées dépassent la limite sans
// le pack (règle vérifiée par le serveur, montrée ici avant l'envoi).
import {useEffect, useState} from 'preact/hooks';
import {CARD_PACK, euro, nombre} from '../data/site';
import {Icon} from './icons';
import {api, can, feature, merchant, readOnly, toast, toastError, type PlanUsage} from './state';
import {Badge, Btn, Modal, Panel, Spinner, useBusy, useLoad} from './ui';
import {date} from './util';

/** Résumé Stripe du commerce (RPC my_subscription), champs utiles à l'option. */
export interface PackSubscription {
  status: 'OK' | 'NONE' | 'FORBIDDEN' | 'ERROR';
  billing_period?: 'monthly' | 'yearly';
  subscription_status?: string;
  current_period_end?: string | null;
  card_packs?: number;
  card_packs_usable?: number;
  card_packs_kept_until?: string | null;
}

/** Option proposée à cette offre (fonction cards.pack, comme le serveur). */
export const packsOffered = () => feature('cards.pack');
/** Le compte connecté peut ajouter ou retirer des packs (jamais en consultation opérateur). */
export function canManagePacks(): boolean {
  const m = merchant.value;
  return !!m && !readOnly() && (m.role === 'OWNER' || m.role === 'ADMIN') && can('settings.manage') && packsOffered();
}

const yearly = (s: PackSubscription | null | undefined) => s?.billing_period === 'yearly';
/** « 4,99 € par mois » / « 50,90 € par an » pour `n` packs. */
export const packPrice = (s: PackSubscription | null | undefined, n = 1) =>
  yearly(s) ? `${euro(Math.round(CARD_PACK.yearly * n * 100) / 100)} par an` : `${euro(Math.round(CARD_PACK.monthly * n * 100) / 100)} par mois`;
const packs = (n: number) => `${nombre(n)} pack${n > 1 ? 's' : ''}`;
const plusCartes = (n: number) => `+${nombre(n * CARD_PACK.cards)} cartes`;
const pending = (s: PackSubscription | null | undefined) => !!s?.card_packs_kept_until && (s.card_packs_usable ?? 0) > (s.card_packs ?? 0);
const requestId = () => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : undefined);

export const loadPackSubscription = () =>
  api.rpc<PackSubscription>('my_subscription', {p_merchant_id: merchant.value?.merchant_id}).catch(() => ({status: 'ERROR'}) as PackSubscription);

/**
 * Confirmation d'un ajout ou d'un retrait : prix, effet sur la limite, règles ; puis appel à card-packs.
 * `usage` : consommation (cartes utilisées, limite de l'offre) ; `sub` : abonnement (période, packs).
 */
export function PackDialog({mode, usage, sub, onClose, onDone}: {mode: 'add' | 'remove' | null; usage: PlanUsage | null; sub: PackSubscription | null; onClose: () => void; onDone: () => void}) {
  const [busy, run] = useBusy();
  const [reqId, setReqId] = useState<string | undefined>(undefined);
  const billed = sub?.card_packs ?? 0;
  const base = usage?.cards.base_limit ?? null;
  const used = usage?.cards.used ?? 0;
  const size = usage?.cards.pack_size ?? CARD_PACK.cards;
  const restore = mode === 'add' && pending(sub);
  const limitNow = usage?.cards.limit ?? null;
  const limitAfterAdd = base === null ? null : base + size * (billed + 1);
  const limitAfterRemove = base === null ? null : base + size * Math.max(billed - 1, 0);
  const blocked = mode === 'remove' && limitAfterRemove !== null && used > limitAfterRemove;
  const open = mode !== null;
  // Une confirmation = une clé d'idempotence (un double clic n'ajoute pas deux packs).
  useEffect(() => setReqId(mode ? requestId() : undefined), [mode]);

  const confirm = () =>
    run(async () => {
      try {
        const r = await api.edge<{status: string; change: string; card_packs_kept_until?: string | null}>('card-packs', {
          merchant_id: merchant.value!.merchant_id,
          action: mode,
          ...(reqId ? {request_id: reqId} : {}),
        });
        toast(
          r.change === 'remove'
            ? `Retrait prévu${r.card_packs_kept_until ? ` le ${date(r.card_packs_kept_until)}` : ''} : le pack reste utilisable jusque-là.`
            : r.change === 'restore'
              ? 'Retrait annulé : votre pack est gardé.'
              : `${plusCartes(1)} ajoutées : elles sont disponibles tout de suite.`,
        );
        onDone();
      } catch (e) {
        toastError(e);
      }
    });
  const close = () => onClose();

  return (
    <Modal
      open={open}
      onClose={close}
      title={mode === 'remove' ? `Retirer un pack de ${nombre(size)} cartes` : restore ? 'Garder votre pack' : `Ajouter ${nombre(size)} cartes`}
      footer={
        <>
          <Btn kind="ghost" onClick={close}>
            Annuler
          </Btn>
          {mode === 'remove' ? (
            <Btn kind="danger" icon="minus" busy={busy} disabled={blocked} onClick={confirm}>
              Retirer le pack
            </Btn>
          ) : (
            <Btn kind="gold" icon="plus" busy={busy} onClick={confirm}>
              {restore ? 'Garder le pack' : `Confirmer l’ajout · ${packPrice(sub)}`}
            </Btn>
          )}
        </>
      }
    >
      {mode === 'add' && restore && (
        <div class="pack-confirm">
          <p>
            Le retrait de votre pack était prévu le <b>{date(sub?.card_packs_kept_until)}</b>. En le gardant, ce retrait est annulé : rien de plus à payer pour la période en cours, puis{' '}
            <b>{packPrice(sub)}</b>, sans TVA, comme avant.
          </p>
        </div>
      )}
      {mode === 'add' && !restore && (
        <div class="pack-confirm">
          <p class="pack-price">
            <b>{packPrice(sub)}</b>, sans TVA, ajoutés à votre abonnement
          </p>
          <ul class="plain small">
            {limitNow !== null && limitAfterAdd !== null && (
              <li>
                Votre limite passe de <b>{nombre(limitNow)}</b> à <b>{nombre(limitAfterAdd)}</b> cartes, tout de suite.
              </li>
            )}
            {yearly(sub) ? (
              <li>Pour l’année en cours, vous payez tout de suite le prorata des mois restants ; ensuite {euro(CARD_PACK.yearly)} par an, à chaque échéance.</li>
            ) : (
              <li>Ce mois-ci, vous ne payez que les jours restants : ils sont ajoutés à votre prochaine facture. Ensuite {euro(CARD_PACK.monthly)} par mois, avec votre abonnement.</li>
            )}
            <li>
              Vous pouvez le retirer depuis cette page : il reste actif jusqu’à la fin {yearly(sub) ? 'de l’année payée' : 'du mois payé'}, si vos clients inscrits tiennent dans la limite sans ce pack.
            </li>
            <li>Il ajoute des cartes, pas de campagnes.</li>
          </ul>
          <p class="muted small">
            Prélevé sur le moyen de paiement de votre abonnement. Conditions : <a href="/cgv/">CGV, article 4.9</a>.
          </p>
        </div>
      )}
      {mode === 'remove' && (
        <div class="pack-confirm">
          {blocked ? (
            <p class="form-err">
              Vous avez {nombre(used)} clients inscrits : sans ce pack, votre offre en compte {nombre(limitAfterRemove ?? 0)}. Vous pourrez le retirer quand vos cartes tiendront dans cette limite (les clients supprimés ne comptent plus).
            </p>
          ) : (
            <ul class="plain small">
              <li>
                Le pack reste utilisable jusqu’au <b>{date(sub?.current_period_end)}</b>, fin de la période payée{limitAfterRemove !== null ? (
                  <>
                    , puis votre limite passe à <b>{nombre(limitAfterRemove)}</b> cartes
                  </>
                ) : ''}
                .
              </li>
              <li>Votre prochaine facture ne le comptera plus ; la période en cours n’est pas remboursée.</li>
              <li>Vous changez d’avis ? Ajoutez un pack avant cette date : le retrait est annulé, sans frais.</li>
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Bouton « Ajouter 500 cartes · 4,99 € par mois » (jauge des cartes, alertes 80 % et 100 %), avec sa confirmation. */
export function AddPackButton({usage, onDone, kind = 'gold', small = true}: {usage: PlanUsage; onDone: () => void; kind?: 'gold' | 'primary' | 'ghost'; small?: boolean}) {
  const sub = useLoad(loadPackSubscription, [merchant.value?.merchant_id]);
  const [mode, setMode] = useState<'add' | null>(null);
  if (!canManagePacks() || !sub.data || sub.data.status !== 'OK') return null;
  if (!['active', 'trialing'].includes(sub.data.subscription_status ?? '')) return null;
  if ((sub.data.card_packs ?? 0) >= CARD_PACK.maxPacks) return null;
  return (
    <>
      <Btn kind={kind} small={small} icon="plus" onClick={() => setMode('add')}>
        {pending(sub.data) ? 'Garder mon pack' : `Ajouter ${nombre(CARD_PACK.cards)} cartes · ${packPrice(sub.data)}`}
      </Btn>
      <PackDialog
        mode={mode}
        usage={usage}
        sub={sub.data}
        onClose={() => setMode(null)}
        onDone={() => {
          setMode(null);
          sub.reload();
          onDone();
        }}
      />
    </>
  );
}

/** Abonnement : panneau « Cartes supplémentaires » (packs actuels, ajout, retrait). */
export function PacksPanel({usage, sub, onDone}: {usage: PlanUsage | null; sub: PackSubscription | null; onDone: () => void}) {
  const [mode, setMode] = useState<'add' | 'remove' | null>(null);
  if (!packsOffered()) return null;
  const ok = sub?.status === 'OK';
  const billed = ok ? (sub?.card_packs ?? 0) : 0;
  const usable = ok ? (sub?.card_packs_usable ?? billed) : 0;
  const manage = canManagePacks() && ok;
  const active = ok && ['active', 'trialing'].includes(sub?.subscription_status ?? '');
  return (
    <Panel title="Cartes supplémentaires" sub={`+${nombre(CARD_PACK.cards)} cartes pour ${packPrice(sub)}, sans TVA`} class="packs-card">
      {!usage || (ok && !sub) ? (
        <Spinner />
      ) : (
        <>
          <div class="packs-now">
            <span class="packs-n">{packs(usable)}</span>
            <span class="muted small">
              {usable > 0 ? `${plusCartes(usable)} sur votre limite` : 'Aucun pack pour le moment'}
              {usage.cards.base_limit !== null && usage.cards.base_limit !== undefined && usage.cards.limit !== null
                ? ` · ${nombre(usage.cards.limit)} cartes en tout (${nombre(usage.cards.base_limit)} avec votre offre)`
                : ''}
            </span>
          </div>
          {pending(sub) && (
            <p class="packs-pending">
              <Badge tone="amber">Retrait prévu le {date(sub?.card_packs_kept_until)}</Badge>
              <span class="small">
                {usable > 1 ? `Jusque-là, vos ${packs(usable)} restent utilisables` : 'Jusque-là, votre pack reste utilisable'}
                {billed > 0 ? ` ; ensuite ${packs(billed)}.` : ', puis l’option s’arrête.'}
              </span>
            </p>
          )}
          {billed > 0 && (
            <p class="small">
              Prix de l’option : <b>{packPrice(sub, billed)}</b>, sans TVA, avec votre abonnement.
            </p>
          )}
          {manage && active ? (
            <div class="btn-row">
              {billed < CARD_PACK.maxPacks && (
                <Btn kind="gold" icon="plus" onClick={() => setMode('add')}>
                  {pending(sub) ? 'Garder mon pack' : `Ajouter ${nombre(CARD_PACK.cards)} cartes · ${packPrice(sub)}`}
                </Btn>
              )}
              {billed > 0 && (
                <Btn kind="ghost" icon="minus" onClick={() => setMode('remove')}>
                  Retirer un pack
                </Btn>
              )}
            </div>
          ) : manage && ok ? (
            <p class="note">Votre abonnement a un paiement en attente : réglez-le depuis le portail Stripe pour ajouter des cartes.</p>
          ) : readOnly() ? null : !ok ? (
            <p class="note">
              <Icon name="info" size={16} /> Aucun abonnement n’est encore relié à ce commerce : écrivez à contact@loyna.fr pour ajouter des cartes.
            </p>
          ) : (
            <p class="muted small">Le propriétaire ou un administrateur du commerce peut ajouter ou retirer des packs.</p>
          )}
          <ul class="plain small">
            <li>Cumulable : 2 packs = {plusCartes(2)}. Les cartes sont disponibles dès l’ajout.</li>
            <li>
              {yearly(sub)
                ? `Abonnement annuel : ${euro(CARD_PACK.yearly)} par an et par pack, prorata de l’année en cours facturé à l’ajout. Retrait à l’échéance annuelle.`
                : `Premier mois au prorata des jours restants, sur la facture suivante. Retrait à la fin d’un mois.`}
            </li>
            <li>
              Retrait possible si vos clients inscrits tiennent dans la limite sans le pack. Conditions : <a href="/cgv/">CGV, article 4.9</a>.
            </li>
          </ul>
        </>
      )}
      {manage && (
        <PackDialog
          mode={mode}
          usage={usage}
          sub={sub}
          onClose={() => setMode(null)}
          onDone={() => {
            setMode(null);
            onDone();
          }}
        />
      )}
    </Panel>
  );
}
