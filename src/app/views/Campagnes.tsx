// Campagnes de notifications Wallet : brouillons dans la table campaigns (RLS), aperçu, envoi et suivi par
// la fonction campaign-send. Campagnes par semaine (décision d'Ewan du 2026-10-30, chiffres de la grille du 2026-10-31 :
// Starter 5, Pro illimitées, quel que soit le nombre de destinataires ; le compteur repart chaque lundi) affichées avant
// l'envoi ; au-delà, le serveur refuse (QUOTA_EXCEEDED, avec son message en français et la date du lundi). Une campagne
// programmée compte dans la semaine de son envoi. Toutes les offres : calendrier des temps forts. Pro : campagnes préparées
// par LOYNA (prepared_by_loyna), qui ne partent jamais sans la validation du commerçant, en 2 gestes. Carte en pause : les
// brouillons restent, l'envoi est refusé (MERCHANT_PAUSED).
import {useEffect, useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, can, feature, go, includedIn, loadUsage, merchant, readOnly, servicePaused, toast, toastError, type CampaignQuota, type PlanUsage} from '../state';
import {campaignName, sendAt, tempsForts, type TempsFort} from '../temps-forts';
import {Badge, Btn, Empty, ErrorBox, Field, LockBadge, Modal, NotifPreview, OffersLink, PageHead, Panel, Spinner, useBusy, useLoad} from '../ui';
import {date, dateTime, localInput, mondayLabel, num, plural} from '../util';

type Audience = 'ALL' | 'ACTIVE' | 'INACTIVE_30' | 'INACTIVE_60' | 'INACTIVE_90' | 'BIRTHDAY' | 'REWARD_AVAILABLE' | 'CUSTOM';
interface Campaign {
  id: string;
  name: string;
  channel: 'WALLET';
  audience_type: Audience;
  audience_filter: Record<string, any>;
  message_title: string | null;
  message_body: string;
  scheduled_at: string | null;
  sent_at: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED' | 'FAILED';
  stats: Record<string, any>;
  error: string | null;
  created_at: string;
  prepared_by_loyna?: boolean;
}
type Quota = CampaignQuota;
const STATUS: Record<Campaign['status'], [string, 'neutral' | 'blue' | 'amber' | 'green' | 'red' | 'gold']> = {
  DRAFT: ['Brouillon', 'neutral'],
  SCHEDULED: ['Programmée', 'blue'],
  SENDING: ['Envoi en cours', 'amber'],
  SENT: ['Envoyée', 'green'],
  CANCELLED: ['Annulée', 'neutral'],
  FAILED: ['Échec', 'red'],
};
const AUDIENCES: {value: Audience; label: string; segment?: boolean}[] = [
  {value: 'ALL', label: 'Tous les clients'},
  {value: 'ACTIVE', label: 'Clients venus ces 30 derniers jours', segment: true},
  {value: 'INACTIVE_30', label: 'Absents depuis 30 jours', segment: true},
  {value: 'INACTIVE_60', label: 'Absents depuis 60 jours', segment: true},
  {value: 'INACTIVE_90', label: 'Absents depuis 90 jours', segment: true},
  {value: 'REWARD_AVAILABLE', label: 'Avec une récompense à utiliser', segment: true},
  {value: 'BIRTHDAY', label: 'Anniversaires', segment: true},
  {value: 'CUSTOM', label: 'Sélection personnalisée', segment: true},
];
const SKIPS: Record<string, string> = {
  NO_CONSENT: 'sans accord pour recevoir des offres',
  NO_WALLET: 'sans carte installée dans le Wallet',
  FREQUENCY_CAP: 'déjà sollicités récemment',
};
const FEATURES: Record<string, string> = {
  segmentation: 'groupes de clients',
  'campaigns.scheduled': 'campagnes programmées',
  'campaigns.wallet': 'campagnes',
  'wallet.notifications': 'notifications Wallet',
};
const MAX_LEN = 300;
const PAUSED_TEXT = 'Votre carte est en pause : aucune campagne ne part pour le moment. Ce brouillon reste enregistré, vous pourrez l’envoyer après la reprise.';
const prepared =(c: Pick<Campaign, 'prepared_by_loyna' | 'status'>) => !!c.prepared_by_loyna && c.status === 'DRAFT';

/** « Campagnes cette semaine : 1 / 2 · il en reste 1 · le compteur repart le lundi 2 novembre » */
function quotaText(q: Quota): string {
  if (q.limit === null) return `Campagnes cette semaine : ${num(q.used)} · illimitées avec votre offre`;
  const left = q.remaining ?? 0;
  return `Campagnes cette semaine : ${num(q.used)} / ${num(q.limit)} · ${left > 0 ? `il en reste ${num(left)}` : 'toutes utilisées'} · le compteur repart le ${mondayLabel(q.resets_at)}`;
}

export function Campagnes({id}: {id?: string}) {
  if (id) return <Editor id={id} />;
  return <List />;
}

function List() {
  const m = merchant.value!;
  const list = useLoad(() => api.select<Campaign>('campaigns', {eq: {merchant_id: m.merchant_id}, order: ['created_at', false], limit: 100}), [m.merchant_id]);
  const usage = useLoad(() => loadUsage().catch(() => null), [m.merchant_id]);
  const enabled = feature('campaigns.wallet');
  const toValidate = (list.data ?? []).filter(prepared);
  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Campagnes">
        {enabled && !readOnly() && (
          <Btn kind="gold" icon="plus" onClick={() => go('campagne/nouvelle')}>
            Nouvelle campagne
          </Btn>
        )}
      </PageHead>
      {usage.data?.campaigns && enabled && (
        <p class="quota-line">
          <Icon name="bell" size={16} />
          {quotaText(usage.data.campaigns)}
        </p>
      )}
      {!enabled && (
        <div class="upsell upsell--wide">
          <Icon name="megaphone" size={26} />
          <p>Campagnes : un message affiché sur le téléphone de vos clients, via leur carte. {includedIn('campaigns.wallet')}</p>
          <OffersLink label="Voir mon abonnement" />
        </div>
      )}
      {toValidate.length > 0 && (
        <a class="validate-bar" href={`#/campagne/${toValidate[0].id}`}>
          <Icon name="badge-check" />
          <span>
            <strong>{toValidate.length > 1 ? `${toValidate.length} campagnes préparées par LOYNA attendent votre validation` : 'Une campagne préparée par LOYNA attend votre validation'}</strong>
            <small>Relisez-la puis validez : elle ne part jamais sans votre accord.</small>
          </span>
          <Icon name="arrow-right" size={18} />
        </a>
      )}
      {list.error ? (
        <ErrorBox error={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Spinner />
      ) : !list.data.length ? (
        enabled && (
          <Empty icon="megaphone" title="Aucune campagne pour le moment">
            Prévenez vos clients d’une nouveauté ou d’une offre : le message s’affiche sur l’écran de leur téléphone, via leur carte de fidélité.
          </Empty>
        )
      ) : (
        <ul class="camps">
          {list.data.map((c) => (
            <li>
              <a href={`#/campagne/${c.id}`} class={`camp ${prepared(c) ? 'camp--todo' : ''}`}>
                <span class="camp-i">
                  <Icon name={c.prepared_by_loyna ? 'badge-check' : 'bell'} />
                </span>
                <span class="camp-t">
                  <strong>{c.name}</strong>
                  <small>
                    {AUDIENCES.find((a) => a.value === c.audience_type)?.label ?? c.audience_type}
                    {c.prepared_by_loyna && !prepared(c) ? ' · préparée par LOYNA' : ''}
                  </small>
                </span>
                <span class="camp-s">
                  {prepared(c) ? <Badge tone="gold">Préparée par LOYNA · à valider</Badge> : <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>}
                  <small>
                    {c.status === 'SENT' && c.sent_at
                      ? `Envoyée le ${date(c.sent_at)}${typeof c.stats?.sent === 'number' ? ` · ${num(c.stats.sent)} destinataires` : ''}`
                      : c.status === 'SCHEDULED' && c.scheduled_at
                        ? `Prévue le ${dateTime(c.scheduled_at)}`
                        : c.status === 'DRAFT' && c.scheduled_at
                          ? `Proposée pour le ${dateTime(c.scheduled_at)}`
                          : `Créée le ${date(c.created_at)}`}
                  </small>
                </span>
                <Icon name="chevron-right" size={18} />
              </a>
            </li>
          ))}
        </ul>
      )}
      {enabled && list.data && !readOnly() && <Calendar campaigns={list.data} onCreated={list.reload} />}
    </div>
  );
}

// --- Toutes les offres : calendrier des temps forts des 60 prochains jours ------------------------------------
function Calendar({campaigns, onCreated}: {campaigns: Campaign[]; onCreated: () => void}) {
  const m = merchant.value!;
  const [busy, run] = useBusy();
  const [doing, setDoing] = useState('');
  const items = tempsForts(new Date(), 60);
  const existing = (t: TempsFort) => campaigns.find((c) => c.status !== 'CANCELLED' && c.name === campaignName(t));

  const prepare = (t: TempsFort) =>
    run(async () => {
      setDoing(t.key);
      try {
        const at = sendAt(t);
        const created = await api.insert<Campaign>('campaigns', {
          merchant_id: m.merchant_id,
          name: campaignName(t),
          channel: 'WALLET',
          audience_type: 'ALL',
          audience_filter: {},
          message_title: t.title,
          message_body: t.message,
          scheduled_at: at && feature('campaigns.scheduled') ? at.toISOString() : null,
        });
        toast(at ? `Brouillon prêt : envoi proposé le ${dateTime(at.toISOString())}` : 'Brouillon prêt : relisez-le et envoyez-le dès que possible');
        onCreated();
        go(`campagne/${created.id}`);
      } catch (e) {
        toastError(e);
      } finally {
        setDoing('');
      }
    });

  return (
    <Panel title="Vos temps forts des 60 prochains jours" sub="Fêtes, saisons, soldes et événements : chaque temps fort a un message prêt. « Préparer » crée un brouillon programmé deux jours avant, à 10 h, que vous relisez avant de valider.">
      {items.length ? (
        <ul class="tf">
          {items.map((t) => {
            const done = existing(t);
            const days = Math.round((t.date.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
            return (
              <li class="tf-i">
                <span class="tf-d">
                  <b>{t.date.getDate()}</b>
                  <small>{t.date.toLocaleDateString('fr-FR', {month: 'short'})}</small>
                </span>
                <span class="tf-t">
                  <strong>{t.label}</strong>
                  <small>
                    {t.date.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})} · {days === 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`}
                  </small>
                  <span class="tf-m">« {t.message.replace(/\{prenom\}/g, 'Léa').replace(/\{commerce\}/g, m.merchant_name)} »</span>
                  {t.hint && <small class="tf-h">{t.hint}</small>}
                </span>
                {done ? (
                  <Btn kind="ghost" small icon="check" href={`#/campagne/${done.id}`}>
                    Déjà préparée
                  </Btn>
                ) : (
                  <Btn kind="primary" small icon="calendar-heart" busy={busy && doing === t.key} disabled={busy} onClick={() => prepare(t)}>
                    Préparer
                  </Btn>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="muted">Aucun temps fort dans les 60 prochains jours.</p>
      )}
      {feature('campaigns.prepared') ? (
        <p class="muted small">LOYNA écrit aussi vos messages : ils apparaissent dans la liste ci-dessus, avec la mention « Préparée par LOYNA · à valider ». Rien ne part sans vous.</p>
      ) : (
        <div class="upsell upsell--wide upsell--pro">
          <p>
            <strong>Avec Pro, LOYNA écrit ces messages pour vous et les programme.</strong> Vous n’avez plus qu’à valider : rien ne part sans vous.
          </p>
          <div class="btn-row">
            <LockBadge feature="campaigns.prepared" />
            <OffersLink />
          </div>
        </div>
      )}
    </Panel>
  );
}

// --- Éditeur -------------------------------------------------------------------------------------------------
const EMPTY: Omit<Campaign, 'id' | 'created_at'> = {
  name: '',
  channel: 'WALLET',
  audience_type: 'ALL',
  audience_filter: {},
  message_title: '',
  message_body: '',
  scheduled_at: null,
  sent_at: null,
  status: 'DRAFT',
  stats: {},
  error: null,
  prepared_by_loyna: false,
};

function Editor({id}: {id: string}) {
  const m = merchant.value!;
  const isNew = id === 'nouvelle';
  const load = useLoad(async () => (isNew ? null : ((await api.select<Campaign>('campaigns', {eq: {id}}))[0] ?? null)), [id]);
  const usage = useLoad<PlanUsage | null>(() => loadUsage().catch(() => null), [m.merchant_id]);
  const [c, setC] = useState<Omit<Campaign, 'id' | 'created_at'> & {id?: string}>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [when, setWhen] = useState('');
  const [busy, run] = useBusy();

  useEffect(() => {
    if (load.data) {
      setC(load.data);
      setSaved(true);
      // brouillon programmé (temps fort, campagne préparée par LOYNA) : date proposée reprise si elle est à venir
      const at = load.data.scheduled_at ? new Date(load.data.scheduled_at) : null;
      setWhen(at && at.getTime() > Date.now() + 10 * 60000 ? localInput(at) : '');
    } else if (isNew) {
      setC({...EMPTY});
      setSaved(false);
      setWhen('');
    }
    setPreview(null);
  }, [load.data, isNew]);
  // Campagne préparée par LOYNA : destinataires vérifiés d'office, il reste 2 gestes (valider, confirmer)
  const toCheck = load.data?.prepared_by_loyna && load.data.status === 'DRAFT' && !readOnly() ? load.data.id : null;
  useEffect(() => {
    if (!toCheck) return;
    let alive = true;
    api.edge('campaign-send', {action: 'preview', campaign_id: toCheck}).then(
      (r) => alive && setPreview(r),
      () => {}, // le bouton « Vérifier les destinataires » reste là
    );
    return () => {
      alive = false;
    };
  }, [toCheck]);

  if (load.error) return <ErrorBox error={load.error} retry={load.reload} />;
  if (!isNew && load.loading) return <Spinner />;
  if (!isNew && !load.data)
    return (
      <div class="page">
        <PageHead title="Campagne introuvable" back={{href: '#/campagnes', label: 'Campagnes'}} />
      </div>
    );
  const ro = readOnly();
  if (ro && isNew)
    return (
      <div class="page">
        <PageHead title="Nouvelle campagne" back={{href: '#/campagnes', label: 'Campagnes'}} />
        <p class="muted">Consultation en lecture seule : aucune campagne ne peut être créée dans l’espace de ce commerce.</p>
      </div>
    );

  const draft = c.status === 'DRAFT';
  const byLoyna = !!c.prepared_by_loyna;
  const set = <K extends keyof Campaign>(k: K, v: Campaign[K]) => {
    setC((x) => ({...x, [k]: v}));
    setSaved(false);
    setPreview(null);
  };
  const setFilter = (k: string, v: any) => set('audience_filter', {...c.audience_filter, [k]: v === '' || v === null ? undefined : v});
  const pastProposal = !!c.scheduled_at && !when && new Date(c.scheduled_at).getTime() <= Date.now() + 10 * 60000;

  const save = async (): Promise<string | null> => {
    setError('');
    if (!c.name.trim()) {
      setError('Donnez un nom à la campagne (il n’est pas montré aux clients).');
      return null;
    }
    if (!c.message_body.trim()) {
      setError('Écrivez le message.');
      return null;
    }
    const row = {
      name: c.name.trim(),
      channel: 'WALLET',
      audience_type: c.audience_type,
      audience_filter: Object.fromEntries(Object.entries(c.audience_filter).filter(([, v]) => v !== undefined)),
      message_title: c.message_title?.trim() || null,
      message_body: c.message_body.trim(),
    };
    try {
      if (c.id) {
        await api.update('campaigns', {id: c.id}, row);
        setSaved(true);
        return c.id;
      }
      const created = await api.insert<Campaign>('campaigns', {...row, merchant_id: m.merchant_id});
      setC(created);
      setSaved(true);
      history.replaceState(null, '', `#/campagne/${created.id}`);
      return created.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
      return null;
    }
  };

  const doPreview = () =>
    run(async () => {
      const cid = saved && c.id ? c.id : await save();
      if (!cid) return;
      try {
        setPreview(await api.edge('campaign-send', {action: 'preview', campaign_id: cid}));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Aperçu impossible.');
      }
    });

  const launch = () =>
    run(async () => {
      if (!c.id) return;
      try {
        const body: Record<string, unknown> = {action: 'launch', campaign_id: c.id};
        if (when) body.scheduled_at = new Date(when).toISOString();
        const r = await api.edge('campaign-send', body);
        setConfirm(false);
        if (r.status === 'SENDING') toast(`Envoi lancé à ${plural(r.eligible ?? 0, 'client', 'clients')}`);
        else if (r.status === 'SCHEDULED') toast(`Campagne programmée le ${dateTime(r.scheduled_at)}`);
        else if (r.status === 'QUOTA_EXCEEDED')
          return setError(r.message ?? `Toutes les campagnes de la semaine sont utilisées. Le compteur repart le ${mondayLabel(r.resets_at)}.`);
        else if (r.status === 'FEATURE_NOT_AVAILABLE') return setError(`Cette campagne utilise une fonction non incluse dans votre offre${FEATURES[r.feature] ? ` (${FEATURES[r.feature]})` : ''}.`);
        else if (r.status === 'MERCHANT_PAUSED') return setError(PAUSED_TEXT);
        else return setError('Envoi impossible : la campagne n’est plus un brouillon.');
        go('campagnes');
      } catch (e: any) {
        setConfirm(false);
        setError(e?.code === 'MERCHANT_PAUSED' ? PAUSED_TEXT : e instanceof Error ? e.message : 'Envoi impossible.');
      }
    });

  const cancel = () =>
    run(async () => {
      try {
        await api.edge('campaign-send', {action: 'cancel', campaign_id: c.id});
        toast('Campagne annulée');
        load.reload();
      } catch (e) {
        toastError(e);
      }
    });

  const remove = () =>
    run(async () => {
      if (!c.id) return go('campagnes');
      try {
        await api.remove('campaigns', {id: c.id});
        toast('Brouillon supprimé');
        go('campagnes');
      } catch (e) {
        toastError(e);
      }
    });

  const sample = (t: string) => t.replace(/\{prenom\}/g, 'Léa').replace(/\{commerce\}/g, m.merchant_name);
  const insert = (token: string) => set('message_body', (c.message_body + (c.message_body && !/\s$/.test(c.message_body) ? ' ' : '') + token).slice(0, MAX_LEN));
  const q: Quota | null = preview?.campaigns_quota ?? usage.data?.campaigns ?? null;
  const sendLabel = byLoyna ? (when ? 'Valider et programmer' : 'Valider et envoyer') : when ? 'Programmer l’envoi' : 'Envoyer maintenant';
  const paused = servicePaused();

  return (
    <div class="page">
      <PageHead eyebrow={draft ? (isNew ? 'Nouvelle campagne' : 'Brouillon') : STATUS[c.status][0]} title={c.name || 'Nouvelle campagne'} back={{href: '#/campagnes', label: 'Campagnes'}}>
        {draft && c.id && !ro && (
          <Btn kind="ghost" icon="trash-2" busy={busy} onClick={remove}>
            Supprimer
          </Btn>
        )}
        {c.status === 'SCHEDULED' && can('campaigns.send') && (
          <Btn kind="ghost" icon="x" busy={busy} onClick={cancel}>
            Annuler l’envoi
          </Btn>
        )}
      </PageHead>

      {draft && byLoyna && (
        <div class="validate-note">
          <Badge tone="gold">
            <Icon name="badge-check" size={14} /> Préparée par LOYNA · à valider
          </Badge>
          <p>
            LOYNA a rédigé cette campagne pour vous{c.scheduled_at ? ` et propose de l’envoyer le ${dateTime(c.scheduled_at)}` : ''}. Relisez le message et les destinataires, modifiez-les si besoin, puis validez : elle ne part jamais sans votre accord.
          </p>
        </div>
      )}

      {!draft || ro ? (
        <Sent c={c as Campaign} />
      ) : (
        <div class="camp-grid">
          <Panel>
            <div class="form">
              <Field label="Nom de la campagne" hint="Pour vous retrouver : il n’est pas montré aux clients.">
                <input type="text" maxLength={120} value={c.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} />
              </Field>
              <Field label="Destinataires" hint={feature('segmentation') ? undefined : `Ciblage par groupe de clients. ${includedIn('segmentation')}`}>
                <select value={c.audience_type} onChange={(e) => set('audience_type', (e.target as HTMLSelectElement).value as Audience)}>
                  {AUDIENCES.filter((a) => !a.segment || feature('segmentation') || a.value === c.audience_type).map((a) => (
                    <option value={a.value}>{a.label}</option>
                  ))}
                </select>
              </Field>
              {c.audience_type === 'BIRTHDAY' && (
                <Field label="Période">
                  <select value={c.audience_filter.birthday_window ?? 'THIS_MONTH'} onChange={(e) => setFilter('birthday_window', (e.target as HTMLSelectElement).value)}>
                    <option value="TODAY">Aujourd’hui</option>
                    <option value="THIS_WEEK">Cette semaine</option>
                    <option value="THIS_MONTH">Ce mois-ci</option>
                  </select>
                </Field>
              )}
              {c.audience_type === 'CUSTOM' && (
                <div class="row2">
                  <Field label="Solde minimum">
                    <input type="number" min={0} value={c.audience_filter.min_balance ?? ''} onInput={(e) => setFilter('min_balance', numOrNull(e))} />
                  </Field>
                  <Field label="Passages minimum">
                    <input type="number" min={0} value={c.audience_filter.min_visits ?? ''} onInput={(e) => setFilter('min_visits', numOrNull(e))} />
                  </Field>
                  <Field label="Absents depuis (jours)">
                    <input type="number" min={1} value={c.audience_filter.inactive_days ?? ''} onInput={(e) => setFilter('inactive_days', numOrNull(e))} />
                  </Field>
                  <Field label="Venus ces X derniers jours">
                    <input type="number" min={1} value={c.audience_filter.active_within_days ?? ''} onInput={(e) => setFilter('active_within_days', numOrNull(e))} />
                  </Field>
                  <Field label="Inscrits ces X derniers jours">
                    <input type="number" min={1} value={c.audience_filter.enrolled_within_days ?? ''} onInput={(e) => setFilter('enrolled_within_days', numOrNull(e))} />
                  </Field>
                  <label class="check">
                    <input type="checkbox" checked={!!c.audience_filter.has_reward_available} onChange={(e) => setFilter('has_reward_available', (e.target as HTMLInputElement).checked || undefined)} />
                    Avec une récompense à utiliser
                  </label>
                </div>
              )}
              <Field label="Titre (facultatif)" hint={`${(c.message_title ?? '').length} / 60`}>
                <input type="text" maxLength={60} value={c.message_title ?? ''} onInput={(e) => set('message_title', (e.target as HTMLInputElement).value)} />
              </Field>
              <Field label="Message" hint={`${c.message_body.length} / ${MAX_LEN} · {prenom} et {commerce} sont remplacés automatiquement`}>
                <textarea rows={5} maxLength={MAX_LEN} value={c.message_body} onInput={(e) => set('message_body', (e.target as HTMLTextAreaElement).value)} />
              </Field>
              <div class="btn-row">
                <button type="button" class="chip" onClick={() => insert('{prenom}')}>
                  + prénom du client
                </button>
                <button type="button" class="chip" onClick={() => insert('{commerce}')}>
                  + nom du commerce
                </button>
              </div>
              {q && (
                <p class="quota-line">
                  <Icon name="bell" size={16} />
                  <span>
                    {q.limit === null
                      ? 'Campagnes illimitées avec votre offre.'
                      : `${quotaText(q)}. Une campagne compte une fois, quel que soit le nombre de clients ; les messages automatiques ne sont jamais décomptés.`}
                  </span>
                </p>
              )}
              {error && (
                <p class="form-err" role="alert">
                  {error}
                </p>
              )}
              <div class="btn-row">
                <Btn kind="ghost" icon="check" busy={busy} disabled={saved} onClick={() => run(save)}>
                  {saved ? 'Brouillon enregistré' : 'Enregistrer le brouillon'}
                </Btn>
                <Btn kind="primary" icon="users" busy={busy} onClick={doPreview}>
                  Vérifier les destinataires
                </Btn>
              </div>
            </div>
          </Panel>

          <div class="stack">
            <Panel title="Aperçu" class="msg-preview">
              <NotifPreview title={c.message_title ? sample(c.message_title) : null} body={c.message_body ? sample(c.message_body) : 'Votre message apparaîtra ici.'} />
              <p class="muted small">Exemple avec la cliente « Léa ».</p>
            </Panel>

            {preview && (
              <Panel title="Destinataires">
                <div class="pv-big">
                  <b>{num(preview.eligible)}</b>
                  <span>
                    client{preview.eligible > 1 ? 's' : ''} recevr{preview.eligible > 1 ? 'ont' : 'a'} ce message
                  </span>
                </div>
                <p class="muted small">
                  Sur {num(preview.audience_total)} client{preview.audience_total > 1 ? 's' : ''} dans la sélection.
                </p>
                {Object.entries(preview.skipped ?? {}).filter(([, n]) => Number(n) > 0).length > 0 && (
                  <ul class="plain small">
                    {Object.entries(preview.skipped ?? {})
                      .filter(([, n]) => Number(n) > 0)
                      .map(([k, n]) => (
                        <li>
                          {num(Number(n))} {SKIPS[k] ?? k}
                        </li>
                      ))}
                  </ul>
                )}
                {preview.campaigns_quota && (
                  <dl class="totals totals--small">
                    <div>
                      <dt>Campagnes cette semaine</dt>
                      <dd>{preview.campaigns_quota.limit === null ? num(preview.campaigns_quota.used) : `${num(preview.campaigns_quota.used)} / ${num(preview.campaigns_quota.limit)}`}</dd>
                    </div>
                    <div>
                      <dt>Restantes</dt>
                      <dd>{preview.campaigns_quota.remaining === null ? 'illimitées' : num(preview.campaigns_quota.remaining)}</dd>
                    </div>
                  </dl>
                )}
                {preview.quota_ok === false && (
                  <div class="form-err" role="alert">
                    <span>Toutes les campagnes de la semaine sont utilisées. Le compteur repart le {mondayLabel(preview.campaigns_quota?.resets_at)} : choisissez une date à partir de ce jour-là, ou passez à Pro, où les campagnes sont illimitées.</span>
                  </div>
                )}
                {preview.quota_ok === false && (
                  <div class="btn-row pv-cta">
                    <OffersLink />
                  </div>
                )}
                {preview.feature_missing && (
                  <p class="form-err">Fonction non incluse dans votre offre : {FEATURES[String(preview.feature_missing)] ?? String(preview.feature_missing)}.</p>
                )}
                {paused ? (
                  <p class="note">{PAUSED_TEXT}</p>
                ) : can('campaigns.send') ? (
                  <div class="form">
                    {feature('campaigns.scheduled') && (
                      <Field label={byLoyna ? 'Envoi proposé (modifiable)' : 'Programmer (facultatif)'} hint={pastProposal ? 'La date proposée est passée : vide = envoi immédiat, ou choisissez une nouvelle date.' : 'Vide = envoi immédiat.'}>
                        <input type="datetime-local" value={when} min={localInput(new Date(Date.now() + 10 * 60000))} onInput={(e) => setWhen((e.target as HTMLInputElement).value)} />
                      </Field>
                    )}
                    <Btn kind="gold" icon={when ? 'calendar-clock' : 'send'} block disabled={!preview.eligible || !!preview.feature_missing || (preview.quota_ok === false && !when)} onClick={() => setConfirm(true)}>
                      {sendLabel}
                    </Btn>
                  </div>
                ) : (
                  <p class="muted small">L’envoi est réservé aux responsables autorisés.</p>
                )}
              </Panel>
            )}
          </div>
        </div>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={when ? 'Programmer cette campagne ?' : 'Envoyer cette campagne ?'}
        footer={
          <>
            <Btn kind="ghost" onClick={() => setConfirm(false)}>
              Annuler
            </Btn>
            <Btn kind="gold" icon="send" busy={busy} onClick={launch}>
              {byLoyna ? 'Je valide' : when ? 'Programmer' : 'Envoyer'}
            </Btn>
          </>
        }
      >
        <p>
          La notification « {c.name} » sera envoyée à <strong>{plural(preview?.eligible ?? 0, 'client', 'clients')}</strong>
          {when ? ` le ${dateTime(new Date(when).toISOString())}` : ' immédiatement'}.
          {q && q.limit !== null ? (when ? ' Elle compte pour une campagne dans la semaine de son envoi.' : ' Elle compte pour une campagne de la semaine.') : ''} Un envoi ne peut pas être rappelé
          {when ? ' (une campagne programmée peut être annulée jusqu’à son envoi)' : ''}.
        </p>
      </Modal>
    </div>
  );
}

function numOrNull(e: Event): number | null {
  const v = (e.target as HTMLInputElement).value;
  return v === '' ? null : Number(v);
}

function Sent({c}: {c: Campaign}) {
  const perf = useLoad(() => ((c.status === 'SENT' || c.status === 'SENDING') && !readOnly() ? api.edge('campaign-send', {action: 'performance', campaign_id: c.id}) : Promise.resolve(null)), [c.id]);
  const s = c.stats ?? {};
  return (
    <div class="camp-grid">
      <Panel title="Message">
        {c.message_title && <p class="eyebrow">{c.message_title}</p>}
        <p class="sent-msg">{c.message_body}</p>
        <p class="muted small">
          Notification Wallet · {AUDIENCES.find((a) => a.value === c.audience_type)?.label}
          {c.sent_at ? ` · envoyée le ${dateTime(c.sent_at)}` : c.scheduled_at ? ` · prévue le ${dateTime(c.scheduled_at)}` : ''}
          {c.prepared_by_loyna ? ' · préparée par LOYNA' : ''}
        </p>
        {c.error && (
          <p class="form-err">
            {c.error === 'QUOTA_EXCEEDED'
              ? 'Non envoyée : les campagnes de la semaine étaient toutes utilisées à l’heure prévue.'
              : c.error === 'MERCHANT_PAUSED'
                ? 'Interrompue : la carte est passée en pause pendant l’envoi, le reste n’est pas parti.'
                : c.error}
          </p>
        )}
      </Panel>
      {c.status === 'DRAFT' ? (
        <Panel title="Résultats">
          <p class="muted">Brouillon : pas encore envoyé.</p>
        </Panel>
      ) : (
        <Panel title="Résultats">
          <dl class="totals">
            <div>
              <dt>Destinataires</dt>
              <dd>{num(typeof s.sent === 'number' ? s.sent : (s.eligible ?? 0))}</dd>
            </div>
            {typeof s.failed === 'number' && (
              <div>
                <dt>Échecs</dt>
                <dd>{num(s.failed)}</dd>
              </div>
            )}
            {perf.data?.status === 'OK' && (
              <div>
                <dt>Revenus sous 7 jours</dt>
                <dd>
                  {num(perf.data.returned_within_7_days)}
                  {perf.data.return_rate_7_days !== null && <small> ({num(perf.data.return_rate_7_days)} %)</small>}
                </dd>
              </div>
            )}
          </dl>
          <p class="muted small">
            {readOnly()
              ? '« Revenus sous 7 jours » (destinataires revenus dans la semaine) n’est pas affiché en consultation opérateur.'
              : '« Revenus sous 7 jours » : destinataires venus au moins une fois dans les 7 jours suivant l’envoi.'}
          </p>
        </Panel>
      )}
    </div>
  );
}
