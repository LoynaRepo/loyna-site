// Boutique (demandes d'Ewan du 2026-11-04) : les petits achats pour le commerce, payés seuls par la fonction qr-order du
// dépôt LOYNA (Stripe Checkout, paiement unique, livraison sous 15 jours à l'adresse de facturation) :
//  - QR codes d'inscription personnalisés sous verre : mêmes articles et mêmes prix que le panier (QR_VERRE) ;
//  - QR codes avis Google sous verre (QR_AVIS), vendus ici seulement, avec le lien de la page d'avis : prérempli depuis les
//    Automatisations (merchant_settings.review_url), facultatif (sinon LOYNA le retrouve).
// La commande part par e-mail à LOYNA, qui fabrique et livre. Propriétaire seulement, carte active (essai compris).
import {useEffect, useState} from 'preact/hooks';
import {QR_AVIS, QR_VERRE, euro} from '../../data/site';
import {Icon} from '../icons';
import {api, loadService, merchant, readOnly, toast} from '../state';
import {Btn, Field, PageHead, Panel, useBusy, useLoad} from '../ui';

type Item = 'unit' | 'pack5' | 'pack10';
type Family = 'qr' | 'avis';
type Prices = typeof QR_VERRE;
const ITEMS: {key: Item; label: string; size: number; discount: number}[] = [
  {key: 'unit', label: 'À l’unité', size: 1, discount: 0},
  {key: 'pack5', label: 'Pack de 5', size: 5, discount: 15},
  {key: 'pack10', label: 'Pack de 10', size: 10, discount: 25},
];
const PRODUCTS: {key: Family; title: string; short: string; text: string; prices: Prices; plaque: string}[] = [
  {
    key: 'qr',
    title: 'QR code d’inscription personnalisé',
    short: 'QR code d’inscription',
    text: 'Le QR code d’inscription à votre carte de fidélité, à vos couleurs, présenté sous verre. Posé sur le comptoir ou à l’entrée, vos clients le scannent avec l’appareil photo et ajoutent leur carte, sans application.',
    prices: QR_VERRE,
    plaque: 'Votre carte de fidélité',
  },
  {
    key: 'avis',
    title: 'QR code avis Google',
    short: 'QR code avis Google',
    text: 'Un QR code présenté sous verre qui ouvre directement votre page d’avis Google : vos clients n’ont plus à chercher votre fiche pour laisser un avis.',
    prices: QR_AVIS,
    plaque: 'Votre avis compte',
  },
];
const EMPTY: Record<Item, number> = {unit: 0, pack5: 0, pack10: 0};
const REFUSED: Record<string, string> = {
  MERCHANT_STOPPED: 'Votre carte est en pause : reprenez votre abonnement avant de commander.',
  FORBIDDEN: 'Seul le propriétaire du commerce peut commander dans la Boutique.',
  EMPTY_ORDER: 'Choisissez au moins un QR code.',
};
const REVIEW_URL = /^https:\/\/\S+$/;

const priceOf = (p: Prices, k: Item) => p[k];
const cents = (n: number) => Math.round(n * 100);
const qrWord = (n: number) => `${n} QR code${n > 1 ? 's' : ''}`;

// Retour de la page de paiement Stripe (success_url de qr-order) : lu une fois, puis retiré de l'adresse.
function paidReturn(): boolean {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('boutique') !== 'merci') return false;
    q.delete('boutique');
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`);
    return true;
  } catch {
    return false;
  }
}

/** Petite plaque sous verre dessinée, pour reconnaître l'article. */
function Plaque({kind, label}: {kind: Family; label: string}) {
  return (
    <div class={`bq-plaque bq-plaque--${kind}`} aria-hidden="true">
      <span class="bq-plaque-t">{label}</span>
      <Icon name="qr-code" size={46} />
      {kind === 'avis' ? <span class="bq-etoiles">★★★★★</span> : <span class="bq-plaque-s">Scannez-moi</span>}
    </div>
  );
}

// +/− : un pas à partir de la valeur du moment (deux appuis rapides comptent pour deux) ; saisie : la valeur tapée
function Stepper({id, value, max, disabled, name, onStep, onChange}: {id: string; value: number; max: number; disabled: boolean; name: string; onStep: (delta: number) => void; onChange: (v: number) => void}) {
  return (
    <div class="qrv-stepper">
      <button type="button" onClick={() => onStep(-1)} disabled={disabled || value <= 0} aria-label={`Retirer ${name}`}>
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        value={String(value)}
        disabled={disabled}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onFocus={(e) => (e.target as HTMLInputElement).select()}
      />
      <button type="button" onClick={() => onStep(1)} disabled={disabled || value >= max} aria-label={`Ajouter ${name}`}>
        +
      </button>
    </div>
  );
}

export function Boutique() {
  const m = merchant.value!;
  const ro = readOnly(); // consultation opérateur : on regarde, on ne commande pas
  const owner = !ro && m.role === 'OWNER';
  const [order, setOrder] = useState<Record<Family, Record<Item, number>>>({qr: {...EMPTY}, avis: {...EMPTY}});
  const [reviewUrl, setReviewUrl] = useState('');
  const [reviewTouched, setReviewTouched] = useState(false);
  const [paid] = useState(paidReturn);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const ctx = useLoad(async () => {
    const [st, settings] = await Promise.all([
      loadService().catch(() => null),
      api.select<{review_url: string | null}>('merchant_settings', {eq: {merchant_id: m.merchant_id}}).catch(() => []),
    ]);
    return {st, review: settings[0]?.review_url ?? ''};
  }, [m.merchant_id]);
  // Lien d'avis déjà saisi dans les Automatisations : repris tant que le champ n'a pas été modifié
  useEffect(() => {
    if (!reviewTouched && ctx.data?.review) setReviewUrl(ctx.data.review);
  }, [ctx.data?.review]);

  const paused = ctx.data?.st?.state === 'STOPPED' || ctx.data?.st?.state === 'SUSPENDED_MANUAL';
  const canOrder = owner && !paused;
  const set = (f: Family, k: Item, v: number | ((cur: number) => number)) => {
    const prices = PRODUCTS.find((p) => p.key === f)!.prices;
    const max = k === 'unit' ? prices.maxUnit : prices.maxPack;
    setOrder((o) => {
      const n = typeof v === 'function' ? v(o[f][k]) : v;
      return {...o, [f]: {...o[f], [k]: Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : 0)))}};
    });
  };
  const lines = PRODUCTS.flatMap((p) =>
    ITEMS.filter((it) => order[p.key][it.key] > 0).map((it) => ({
      key: `${p.key}-${it.key}`,
      text: it.key === 'unit' ? `${order[p.key].unit} × ${p.short}` : `${order[p.key][it.key]} × pack de ${it.size} · ${p.short}`,
      cents: order[p.key][it.key] * cents(priceOf(p.prices, it.key)),
    })),
  );
  const total = lines.reduce((s, l) => s + l.cents, 0);
  const countOf = (f: Family) => ITEMS.reduce((s, it) => s + order[f][it.key] * it.size, 0);
  const count = countOf('qr') + countOf('avis');
  const url = reviewUrl.trim();
  const urlError = countOf('avis') > 0 && url && !REVIEW_URL.test(url) ? 'Le lien doit commencer par https://' : '';

  const pay = () =>
    run(async () => {
      setError('');
      if (urlError) return setError(urlError);
      try {
        const body = {merchant_id: m.merchant_id, qr: order.qr, avis: order.avis, ...(countOf('avis') > 0 && url ? {review_url: url} : {})};
        const r = await api.edge<{status: string; url?: string}>('qr-order', body);
        if (r.status === 'OK' && r.url) {
          if (api.demo) return toast('Démonstration : la commande ouvrirait ici la page de paiement sécurisée Stripe.', 'info');
          location.href = r.url;
          return;
        }
        setError(REFUSED[r.status] ?? 'Commande impossible. Réessayez dans un instant.');
      } catch (e: any) {
        setError(REFUSED[e?.code] ?? e?.message ?? 'Commande impossible. Réessayez dans un instant.');
      }
    });

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Boutique" />
      <p class="bq-intro">Les compléments pour votre commerce : achat unique, sans TVA, fabriqués par LOYNA et livrés sous {QR_VERRE.deliveryDays}&nbsp;jours à votre adresse de facturation.</p>
      {paid && (
        <p class="qrv-ok bq-ok" role="status">
          <Icon name="circle-check" size={18} /> Merci, votre commande est enregistrée. Vos QR codes arrivent sous {QR_VERRE.deliveryDays}&nbsp;jours ; vous recevez le reçu de Stripe par e-mail.
        </p>
      )}
      <div class="bq-grid">
        <div class="bq-prods">
          {PRODUCTS.map((p) => (
            <Panel class={`bq-prod ${countOf(p.key) > 0 ? 'on' : ''}`}>
              <div class="bq-top">
                <Plaque kind={p.key} label={p.plaque} />
                <div class="bq-desc">
                  <h2>{p.title}</h2>
                  <p class="bq-from">
                    <b>{euro(p.prices.unit)}</b> l’unité · sous verre
                  </p>
                  <p class="bq-text">{p.text}</p>
                </div>
              </div>
              <div class="qrv-rows">
                {ITEMS.map((it) => {
                  const v = order[p.key][it.key];
                  const price = priceOf(p.prices, it.key);
                  const id = `bq-${p.key}-${it.key}`;
                  return (
                    <div class={`qrv-row ${v > 0 ? 'on' : ''}`}>
                      <div class="qrv-t">
                        <label for={id}>{it.label}</label>
                        <span>
                          {it.size === 1 ? `${euro(price)} le QR code` : `${euro(price)} le pack, soit ${euro(price / it.size)} le QR code (−${it.discount} %)`}
                        </span>
                      </div>
                      <Stepper
                        id={id}
                        value={v}
                        max={it.key === 'unit' ? p.prices.maxUnit : p.prices.maxPack}
                        disabled={!canOrder}
                        name={it.key === 'unit' ? `un ${p.short}` : `un pack de ${it.size}`}
                        onStep={(d) => set(p.key, it.key, (cur) => cur + d)}
                        onChange={(x) => set(p.key, it.key, x)}
                      />
                    </div>
                  );
                })}
              </div>
              {p.key === 'avis' && countOf('avis') > 0 && (
                <Field
                  label="Lien de votre page d’avis Google (facultatif)"
                  error={urlError || undefined}
                  hint={
                    ctx.data?.review && url === ctx.data.review
                      ? 'Repris de vos Automatisations (demande d’avis Google).'
                      : 'Dans votre fiche Google, « Demander des avis » donne ce lien (https://g.page/r/…). Laissé vide, LOYNA le retrouve à partir du nom et de l’adresse de votre commerce, et vous le confirme avant la fabrication.'
                  }
                >
                  <input
                    type="url"
                    inputMode="url"
                    maxLength={500}
                    placeholder="https://g.page/r/…"
                    value={reviewUrl}
                    disabled={!canOrder}
                    onInput={(e) => {
                      setReviewTouched(true);
                      setReviewUrl((e.target as HTMLInputElement).value);
                    }}
                  />
                </Field>
              )}
            </Panel>
          ))}
        </div>

        <Panel title="Votre commande" class="bq-cart">
          {lines.length === 0 ? (
            <p class="muted small bq-empty">Aucun article pour le moment. Choisissez vos QR codes avec les boutons + et −.</p>
          ) : (
            <ul class="bq-lines">
              {lines.map((l) => (
                <li key={l.key}>
                  <span>{l.text}</span>
                  <b>{euro(l.cents / 100)}</b>
                </li>
              ))}
            </ul>
          )}
          <p class="bq-total" aria-live="polite">
            <span>{count === 0 ? 'Total' : `Total · ${qrWord(count)}`}</span>
            <b>{euro(total / 100)}</b>
          </p>
          <p class="muted small bq-m0">Sans TVA (TVA non applicable, art. 293 B du CGI). Livraison comprise, sous {QR_VERRE.deliveryDays}&nbsp;jours.</p>
          {error && (
            <p class="form-err bq-m0" role="alert">
              {error}
            </p>
          )}
          {ro ? (
            <p class="muted small bq-m0">Consultation : la commande est réservée au client.</p>
          ) : !owner ? (
            <p class="muted small bq-m0">Seul le propriétaire du commerce peut commander dans la Boutique.</p>
          ) : paused ? (
            <>
              <p class="form-err bq-m0">{REFUSED.MERCHANT_STOPPED}</p>
              <Btn kind="ghost" icon="credit-card" block href="#/abonnement">
                Voir Abonnement
              </Btn>
            </>
          ) : (
            <Btn kind="gold" icon="credit-card" block busy={busy} disabled={count === 0} onClick={pay}>
              {count === 0 ? 'Commander' : `Commander et payer · ${euro(total / 100)}`}
            </Btn>
          )}
          <p class="muted small bq-m0">
            Paiement sécurisé par Stripe : votre adresse de livraison vous est demandée sur la page de paiement. Conditions : <a href="/cgv/">CGV, article 4.7</a>.
          </p>
        </Panel>
      </div>
    </div>
  );
}
