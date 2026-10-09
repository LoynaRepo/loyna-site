// Campagnes Wallet et SMS : brouillons dans la table campaigns (RLS), aperçu, envoi et suivi
// par la fonction campaign-send. Le texte SMS optimisé n'est jamais appliqué sans confirmation.
import {useEffect, useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, can, feature, featureLimit, go, includedIn, merchant, toast, toastError} from '../state';
import {Badge, Btn, Empty, ErrorBox, Field, Modal, PageHead, Panel, Segmented, Spinner, useBusy, useLoad} from '../ui';
import {date, dateTime, num} from '../util';

type Channel = 'WALLET' | 'SMS';
type Audience = 'ALL' | 'ACTIVE' | 'INACTIVE_30' | 'INACTIVE_60' | 'INACTIVE_90' | 'BIRTHDAY' | 'REWARD_AVAILABLE' | 'CUSTOM';
interface Campaign {
  id: string;
  name: string;
  channel: Channel;
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
}
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
  NO_PHONE: 'sans numéro de téléphone',
  SMS_OPT_OUT: 'désinscrits des SMS (STOP)',
  FREQUENCY_CAP: 'déjà sollicités récemment',
};

export function Campagnes({id}: {id?: string}) {
  if (id) return <Editor id={id} />;
  return <List />;
}

function List() {
  const m = merchant.value!;
  const list = useLoad(() => api.select<Campaign>('campaigns', {eq: {merchant_id: m.merchant_id}, order: ['created_at', false], limit: 100}), [m.merchant_id]);
  const enabled = feature('campaigns.wallet') || feature('sms');
  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Campagnes">
        {enabled && (
          <Btn kind="gold" icon="plus" onClick={() => go('campagne/nouvelle')}>
            Nouvelle campagne
          </Btn>
        )}
      </PageHead>
      {!enabled && (
        <div class="upsell upsell--wide">
          <Icon name="megaphone" size={26} />
          <p>Campagnes : un message affiché sur le téléphone de vos clients, via leur carte. {includedIn('campaigns.wallet')}</p>
          {can('settings.manage') && (
            <Btn kind="ghost" small href="#/abonnement" icon="arrow-right">
              Voir mon abonnement
            </Btn>
          )}
        </div>
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
              <a href={`#/campagne/${c.id}`} class="camp">
                <span class={`camp-i camp-i--${c.channel.toLowerCase()}`}>
                  <Icon name={c.channel === 'SMS' ? 'message-square' : 'bell'} />
                </span>
                <span class="camp-t">
                  <strong>{c.name}</strong>
                  <small>
                    {c.channel === 'SMS' ? 'SMS' : 'Notification Wallet'} · {AUDIENCES.find((a) => a.value === c.audience_type)?.label ?? c.audience_type}
                  </small>
                </span>
                <span class="camp-s">
                  <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
                  <small>
                    {c.status === 'SENT' && c.sent_at
                      ? `Envoyée le ${date(c.sent_at)}${typeof c.stats?.sent === 'number' ? ` · ${num(c.stats.sent)} destinataires` : ''}`
                      : c.status === 'SCHEDULED' && c.scheduled_at
                        ? `Prévue le ${dateTime(c.scheduled_at)}`
                        : `Créée le ${date(c.created_at)}`}
                  </small>
                </span>
                <Icon name="chevron-right" size={18} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
};

function Editor({id}: {id: string}) {
  const m = merchant.value!;
  const isNew = id === 'nouvelle';
  const load = useLoad(async () => (isNew ? null : ((await api.select<Campaign>('campaigns', {eq: {id}}))[0] ?? null)), [id]);
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
    } else if (isNew) {
      setC({...EMPTY, channel: feature('campaigns.wallet') ? 'WALLET' : 'SMS'});
      setSaved(false);
    }
    setPreview(null);
  }, [load.data, isNew]);

  if (load.error) return <ErrorBox error={load.error} retry={load.reload} />;
  if (!isNew && load.loading) return <Spinner />;
  if (!isNew && !load.data)
    return (
      <div class="page">
        <PageHead title="Campagne introuvable" back={{href: '#/campagnes', label: 'Campagnes'}} />
      </div>
    );

  const draft = c.status === 'DRAFT';
  const set = <K extends keyof Campaign>(k: K, v: Campaign[K]) => {
    setC((x) => ({...x, [k]: v}));
    setSaved(false);
    setPreview(null);
  };
  const setFilter = (k: string, v: any) => set('audience_filter', {...c.audience_filter, [k]: v === '' || v === null ? undefined : v});
  const maxLen = c.channel === 'SMS' ? 1000 : 300;

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
      channel: c.channel,
      audience_type: c.audience_type,
      audience_filter: Object.fromEntries(Object.entries(c.audience_filter).filter(([, v]) => v !== undefined)),
      message_title: c.channel === 'WALLET' ? c.message_title?.trim() || null : null,
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
        if (r.status === 'SENDING') toast(`Envoi lancé à ${num(r.eligible ?? 0)} clients`);
        else if (r.status === 'SCHEDULED') toast(`Campagne programmée le ${dateTime(r.scheduled_at)}`);
        else if (r.status === 'FEATURE_NOT_AVAILABLE') return setError('Cette campagne utilise une fonction non incluse dans votre formule.');
        else return setError('Envoi impossible : la campagne n’est plus un brouillon.');
        go('campagnes');
      } catch (e) {
        setConfirm(false);
        setError(e instanceof Error ? e.message : 'Envoi impossible.');
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
  const insert = (token: string) => set('message_body', (c.message_body + (c.message_body && !/\s$/.test(c.message_body) ? ' ' : '') + token).slice(0, maxLen));

  return (
    <div class="page">
      <PageHead eyebrow={draft ? (isNew ? 'Nouvelle campagne' : 'Brouillon') : STATUS[c.status][0]} title={c.name || 'Nouvelle campagne'} back={{href: '#/campagnes', label: 'Campagnes'}}>
        {draft && c.id && (
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

      {!draft ? (
        <Sent c={c as Campaign} />
      ) : (
        <div class="camp-grid">
          <Panel>
            <div class="form">
              <Field label="Nom de la campagne" hint="Pour vous retrouver : il n’est pas montré aux clients.">
                <input type="text" maxLength={120} value={c.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} />
              </Field>
              <div class="fld">
                <span class="fld-l">Canal</span>
                <Segmented
                  label="Canal"
                  value={c.channel}
                  onChange={(v) => set('channel', v)}
                  options={[
                    {value: 'WALLET', label: 'Notification Wallet', disabled: !feature('campaigns.wallet')},
                    {value: 'SMS', label: 'SMS', disabled: !feature('sms')},
                  ]}
                />
                <span class="fld-h">
                  {c.channel === 'WALLET'
                    ? 'Gratuit et illimité : le message s’affiche sur l’écran du téléphone, via la carte de fidélité.'
                    : `Décompté de votre quota de SMS${featureLimit('sms.monthly_quota') ? ` (${num(featureLimit('sms.monthly_quota'))} par mois)` : ''}. Mention STOP ajoutée automatiquement.`}
                </span>
              </div>
              <Field label="Destinataires" hint={feature('segmentation') ? undefined : `Ciblage par segment. ${includedIn('segmentation')}`}>
                <select value={c.audience_type} onChange={(e) => set('audience_type', (e.target as HTMLSelectElement).value as Audience)}>
                  {AUDIENCES.filter((a) => !a.segment || feature('segmentation') || a.value === c.audience_type).map((a) => (
                    <option value={a.value}>{a.label}</option>
                  ))}
                </select>
              </Field>
              {c.audience_type === 'BIRTHDAY' && (
                <Field label="Période">
                  <select value={c.audience_filter.birthday_window ?? 'THIS_WEEK'} onChange={(e) => setFilter('birthday_window', (e.target as HTMLSelectElement).value)}>
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
              {c.channel === 'WALLET' && (
                <Field label="Titre (facultatif)" hint={`${(c.message_title ?? '').length} / 60`}>
                  <input type="text" maxLength={60} value={c.message_title ?? ''} onInput={(e) => set('message_title', (e.target as HTMLInputElement).value)} />
                </Field>
              )}
              <Field label="Message" hint={`${c.message_body.length} / ${maxLen} · {prenom} et {commerce} sont remplacés automatiquement`}>
                <textarea rows={5} maxLength={maxLen} value={c.message_body} onInput={(e) => set('message_body', (e.target as HTMLTextAreaElement).value)} />
              </Field>
              <div class="btn-row">
                <button type="button" class="chip" onClick={() => insert('{prenom}')}>
                  + prénom du client
                </button>
                <button type="button" class="chip" onClick={() => insert('{commerce}')}>
                  + nom du commerce
                </button>
              </div>
              {c.channel === 'SMS' && <SmsTools text={c.message_body} onReplace={(t) => set('message_body', t)} />}
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
              {c.channel === 'WALLET' ? (
                <div class="notif">
                  <span class="notif-app" style={{background: m.primary_color, color: m.secondary_color}}>
                    {m.logo_url ? <img src={m.logo_url} alt="" /> : m.merchant_name.slice(0, 1)}
                  </span>
                  <span class="notif-t">
                    <strong>{c.message_title ? sample(c.message_title) : m.merchant_name}</strong>
                    <span>{c.message_body ? sample(c.message_body) : 'Votre message apparaîtra ici.'}</span>
                  </span>
                  <small>maintenant</small>
                </div>
              ) : (
                <div class="sms">
                  <span class="sms-from">{m.merchant_name}</span>
                  <p class="sms-bubble">
                    {c.message_body ? sample(c.message_body) : 'Votre message apparaîtra ici.'}
                    <br />
                    STOP 00000
                  </p>
                </div>
              )}
              <p class="muted small">Exemple avec la cliente « Léa ».</p>
            </Panel>

            {preview && (
              <Panel title="Destinataires">
                <div class="pv-big">
                  <b>{num(preview.eligible)}</b>
                  <span>client{preview.eligible > 1 ? 's' : ''} recevr{preview.eligible > 1 ? 'ont' : 'a'} ce message</span>
                </div>
                <p class="muted small">Sur {num(preview.audience_total)} client{preview.audience_total > 1 ? 's' : ''} dans la sélection.</p>
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
                {preview.sms && (
                  <dl class="totals totals--small">
                    <div>
                      <dt>SMS par destinataire</dt>
                      <dd>{num(preview.sms.segments_per_recipient)}</dd>
                    </div>
                    <div>
                      <dt>SMS au total</dt>
                      <dd>{num(preview.sms.total_sms_estimated)}</dd>
                    </div>
                    <div>
                      <dt>Quota restant ce mois-ci</dt>
                      <dd>{preview.sms.quota_remaining === null ? 'illimité' : num(preview.sms.quota_remaining)}</dd>
                    </div>
                  </dl>
                )}
                {preview.sms && !preview.sms.quota_ok && <p class="form-err">Quota de SMS insuffisant pour cet envoi.</p>}
                {preview.sms && !preview.sms.within_sending_hours && <p class="note">Hors des horaires d’envoi autorisés pour les SMS commerciaux : l’envoi sera décalé ou programmez-le.</p>}
                {preview.feature_missing && <p class="form-err">Fonction non incluse dans votre formule : {String(preview.feature_missing)}.</p>}
                {can('campaigns.send') ? (
                  <div class="form">
                    {feature('campaigns.scheduled') && (
                      <Field label="Programmer (facultatif)" hint="Vide = envoi immédiat.">
                        <input type="datetime-local" value={when} min={new Date(Date.now() + 10 * 60000).toISOString().slice(0, 16)} onInput={(e) => setWhen((e.target as HTMLInputElement).value)} />
                      </Field>
                    )}
                    <Btn kind="gold" icon="send" block disabled={!preview.eligible || !!preview.feature_missing || (preview.sms && !preview.sms.quota_ok)} onClick={() => setConfirm(true)}>
                      {when ? 'Programmer l’envoi' : 'Envoyer maintenant'}
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
              {when ? 'Programmer' : 'Envoyer'}
            </Btn>
          </>
        }
      >
        <p>
          {c.channel === 'SMS' ? 'Le SMS' : 'La notification'} « {c.name} » sera envoyé{c.channel === 'SMS' ? '' : 'e'} à <strong>{num(preview?.eligible ?? 0)} client{(preview?.eligible ?? 0) > 1 ? 's' : ''}</strong>
          {when ? ` le ${dateTime(new Date(when).toISOString())}` : ' immédiatement'}. Un envoi ne peut pas être rappelé.
        </p>
      </Modal>
    </div>
  );
}

function numOrNull(e: Event): number | null {
  const v = (e.target as HTMLInputElement).value;
  return v === '' ? null : Number(v);
}

function SmsTools({text, onReplace}: {text: string; onReplace: (t: string) => void}) {
  const [a, setA] = useState<any>(null);
  const [opt, setOpt] = useState<any>(null);
  const [busy, run] = useBusy();
  useEffect(() => {
    if (!text.trim()) return setA(null);
    const t = setTimeout(() => {
      api.edge('sms-send', {action: 'analyze', text}).then(setA, () => setA(null));
    }, 400);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <div class="smsbox">
      {a && (
        <>
          <p class="smsbox-s">
            <Icon name="message-square" size={16} />
            <strong>{a.summary}</strong> <span class="muted">({a.encoding === 'GSM7' ? 'caractères standards' : 'Unicode'})</span>
          </p>
          {a.warnings?.length > 0 && (
            <ul class="plain small warn">
              {a.warnings.map((w: string) => (
                <li>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <Btn
        kind="ghost"
        small
        icon="sparkles"
        busy={busy}
        disabled={!text.trim()}
        onClick={() =>
          run(async () => {
            try {
              setOpt(await api.edge('sms-send', {action: 'optimize', text}));
            } catch (e) {
              toastError(e);
            }
          })
        }
      >
        Optimiser le message
      </Btn>
      <Modal
        open={!!opt}
        onClose={() => setOpt(null)}
        title="Version optimisée"
        wide
        footer={
          opt?.changed ? (
            <>
              <Btn kind="ghost" onClick={() => setOpt(null)}>
                Garder mon texte
              </Btn>
              <Btn
                kind="gold"
                icon="check"
                onClick={() => {
                  onReplace(opt.optimized);
                  setOpt(null);
                }}
              >
                Remplacer mon texte
              </Btn>
            </>
          ) : (
            <Btn onClick={() => setOpt(null)}>Fermer</Btn>
          )
        }
      >
        {opt && !opt.changed ? (
          <p>Votre message est déjà optimisé : {opt.before?.summary?.toLowerCase()}</p>
        ) : (
          opt && (
            <>
              <div class="row2">
                <div>
                  <p class="eyebrow">Avant · {opt.before.segments} SMS</p>
                  <p class="sms-bubble">{opt.original}</p>
                </div>
                <div>
                  <p class="eyebrow">Après · {opt.after.segments} SMS</p>
                  <p class="sms-bubble">{opt.optimized}</p>
                </div>
              </div>
              {opt.changes?.length > 0 && (
                <ul class="plain small">
                  {opt.changes.map((ch: any) => (
                    <li>
                      « {ch.from} » → « {ch.to} » ({ch.count}×) : {ch.reason}
                    </li>
                  ))}
                </ul>
              )}
              {opt.savedSegmentsPerRecipient > 0 && <p class="note">Économie : {opt.savedSegmentsPerRecipient} SMS par destinataire.</p>}
            </>
          )
        )}
      </Modal>
    </div>
  );
}

function Sent({c}: {c: Campaign}) {
  const perf = useLoad(() => (c.status === 'SENT' || c.status === 'SENDING' ? api.edge('campaign-send', {action: 'performance', campaign_id: c.id}) : Promise.resolve(null)), [c.id]);
  const s = c.stats ?? {};
  return (
    <div class="camp-grid">
      <Panel title="Message">
        {c.message_title && <p class="eyebrow">{c.message_title}</p>}
        <p class="sent-msg">{c.message_body}</p>
        <p class="muted small">
          {c.channel === 'SMS' ? 'SMS' : 'Notification Wallet'} · {AUDIENCES.find((a) => a.value === c.audience_type)?.label}
          {c.sent_at ? ` · envoyée le ${dateTime(c.sent_at)}` : c.scheduled_at ? ` · prévue le ${dateTime(c.scheduled_at)}` : ''}
        </p>
        {c.error && <p class="form-err">{c.error}</p>}
      </Panel>
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
        <p class="muted small">« Revenus sous 7 jours » : destinataires venus au moins une fois dans les 7 jours suivant l’envoi.</p>
      </Panel>
    </div>
  );
}
