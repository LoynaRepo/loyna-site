// Automatisations : les messages et avantages qui partent tout seuls (table merchant_settings, droit
// settings.manage). Toutes les offres : notification après chaque passage, délai entre deux messages
// commerciaux. Premium : anniversaire, relance des inactifs, « Plus qu'un passage ! », avis Google, double
// tampon. Pro : niveaux VIP, parrainage. Sans la fonction (carte features), la carte est verrouillée.
// Chaque carte s'enregistre seule ; les aperçus reprennent les textes du serveur (scheduled-customer-engagement).
import type {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, feature, includedIn, merchant, toast} from '../state';
import {Badge, Btn, ErrorBox, Field, LockBadge, NotifPreview, OffersLink, PageHead, Spinner, Toggle, useBusy, useLoad} from '../ui';
import {DAY_NAMES, formatHappyHours, joinUrl, renderTemplate, type HappySlot} from '../util';

interface Settings {
  merchant_id: string;
  enrollment_collect_birthday: boolean;
  notify_balance_updates: boolean;
  marketing_min_interval_hours: number;
  birthday_enabled: boolean;
  birthday_message: string;
  inactive_enabled: boolean;
  inactive_after_days: number;
  inactive_message: string;
  reengagement_cooldown_days: number;
  near_reward_enabled: boolean;
  near_reward_after_days: number;
  near_reward_remaining: number | null;
  near_reward_message: string;
  review_enabled: boolean;
  review_url: string | null;
  review_after_visits: number;
  review_message: string;
  happy_hours_enabled: boolean;
  happy_hours: HappySlot[];
  tiers_enabled: boolean;
  tier_thresholds: number[];
  tier_perks: {BRONZE?: string; SILVER?: string; GOLD?: string};
  referral_enabled: boolean;
  referral_bonus: number;
}
interface Program {
  type: 'VISITS' | 'POINTS' | 'SPEND';
  points_per_event: number;
  reward_threshold: number;
  unit_label_singular: string;
  unit_label_plural: string;
  status: string;
}
interface Ctx {
  s: Settings;
  program: Program | null;
  reward: string; // première récompense (aperçus)
  onSaved: (s: Settings) => void;
}
type Set = <K extends keyof Settings>(k: K, v: Settings[K]) => void;

const SAMPLE = 'Léa';
const TIERS = [
  {key: 'BRONZE', name: 'Bronze'},
  {key: 'SILVER', name: 'Argent'},
  {key: 'GOLD', name: 'Or'},
] as const;

export function Automatisations() {
  const m = merchant.value!;
  const data = useLoad(async () => {
    const [set, progs, rewards] = await Promise.all([
      api.select<Settings>('merchant_settings', {eq: {merchant_id: m.merchant_id}}),
      api.select<Program>('loyalty_programs', {eq: {merchant_id: m.merchant_id}, order: ['created_at', true]}),
      api.select<{name: string; threshold: number; status: string}>('rewards', {eq: {merchant_id: m.merchant_id, status: 'ACTIVE'}, order: ['threshold', true]}),
    ]);
    return {settings: set[0] ?? null, program: progs.find((p) => p.status === 'ACTIVE') ?? progs[0] ?? null, reward: rewards[0]?.name ?? 'Votre récompense'};
  }, [m.merchant_id]);
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => setS(data.data?.settings ?? null), [data.data]);

  if (data.error) return <ErrorBox error={data.error} retry={data.reload} />;
  if (!data.data) return <Spinner />;
  if (!s)
    return (
      <div class="page">
        <PageHead eyebrow={m.merchant_name} title="Automatisations" />
        <p class="muted">Réglages introuvables : écrivez à contact@loyna.fr.</p>
      </div>
    );

  const ctx: Ctx = {s, program: data.data.program, reward: data.data.reward, onSaved: setS};
  const premium = feature('automation.birthday') || feature('automation.near_reward');
  const pro = feature('loyalty.tiers') || feature('referral');
  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Automatisations" />
      <p class="lead-sm">
        Les bons messages partent tout seuls, au bon moment, sur l’écran de vos clients. Vous choisissez le texte et l’avantage ; ces messages automatiques ne sont jamais décomptés de vos notifications.
      </p>

      <div class="auto-grid">
        <PassNotif ctx={ctx} />
        <Pace ctx={ctx} />
      </div>

      <section class="auto-sec">
        <header class="auto-sec-h">
          <div>
            <p class="eyebrow">Premium</p>
            <h2>Les automatisations qui font revenir vos clients</h2>
          </div>
          {premium ? <Badge tone="green">Inclus dans votre offre</Badge> : <LockBadge feature="automation.birthday" />}
        </header>
        <div class="auto-grid">
          <Birthday ctx={ctx} />
          <Inactive ctx={ctx} />
          <NearReward ctx={ctx} />
          <Review ctx={ctx} />
          <HappyHours ctx={ctx} />
        </div>
        <p class="auto-more">
          <Icon name="sparkles" size={16} />
          <span>
            Aussi avec Premium : <a href="#/campagnes">campagnes programmées et groupes de clients</a>, <a href="#/rapport">rapport mensuel avec 3 conseils</a> et statistiques avancées.
          </span>
        </p>
      </section>

      <section class="auto-sec">
        <header class="auto-sec-h">
          <div>
            <p class="eyebrow">Pro</p>
            <h2>LOYNA travaille avec vous</h2>
          </div>
          {pro ? <Badge tone="green">Inclus dans votre offre</Badge> : <LockBadge feature="loyalty.tiers" />}
        </header>
        <div class="auto-grid">
          <Tiers ctx={ctx} />
          <Referral ctx={ctx} />
        </div>
        <p class="auto-more">
          <Icon name="sparkles" size={16} />
          <span>
            Aussi avec Pro : <a href="#/campagnes">campagnes clés en main préparées par LOYNA</a>, un point mensuel de 30 minutes avec LOYNA, <a href="#/reglages">jusqu’à 3 boutiques</a> et le kit comptoir imprimé.
          </span>
        </p>
        {!pro && (
          <div class="btn-row">
            <OffersLink label="Découvrir l’offre Pro" />
          </div>
        )}
      </section>
    </div>
  );
}

// --- Carte d'une automatisation ---------------------------------------------------------------------------
function Auto<K extends keyof Settings>(props: {
  ctx: Ctx;
  feature?: string; // absente de l'offre : carte verrouillée
  keys: K[];
  toggle?: K; // interrupteur (booléen)
  icon: string;
  title: string;
  text: (s: Settings) => ComponentChildren;
  body?: (s: Settings, set: Set) => ComponentChildren;
  bodyAlways?: boolean; // réglages visibles même désactivée
  preview?: (s: Settings) => ComponentChildren;
  validate?: (s: Settings) => string | null;
  saved?: string;
}) {
  const {ctx, keys, toggle} = props;
  const m = merchant.value!;
  const pick = (s: Settings) => Object.fromEntries(keys.map((k) => [k, s[k]])) as Pick<Settings, K>;
  const [d, setD] = useState(() => pick(ctx.s));
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  useEffect(() => setD(pick(ctx.s)), [ctx.s]);
  const locked = !!props.feature && !feature(props.feature);
  const s: Settings = {...ctx.s, ...d};
  const on = toggle ? !!s[toggle] : true;
  const dirty = JSON.stringify(d) !== JSON.stringify(pick(ctx.s));
  const set: Set = (k, v) => {
    setD((x) => ({...x, [k]: v}));
    setError('');
  };

  const save = () =>
    run(async () => {
      const problem = props.validate?.(s) ?? null;
      if (problem) return setError(problem);
      try {
        const r = await api.update<Settings>('merchant_settings', {merchant_id: m.merchant_id}, d);
        ctx.onSaved({...ctx.s, ...r});
        toast(props.saved ?? 'Automatisation enregistrée');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
      }
    });

  return (
    <article class={`auto ${locked ? 'is-locked' : ''} ${on && !locked ? 'is-on' : ''}`}>
      <div class="auto-h">
        <span class="auto-i">
          <Icon name={props.icon} />
        </span>
        {!locked && toggle ? (
          <Toggle checked={on} onChange={(v) => set(toggle, v as Settings[K])} label={props.title} hint={props.text(s)} />
        ) : (
          <div class="auto-t">
            <span class="tgl-l">{props.title}</span>
            <span class="tgl-h">{props.text(s)}</span>
          </div>
        )}
        {locked && <LockBadge feature={props.feature!} />}
      </div>
      {!locked && props.body && (on || props.bodyAlways) && <div class="auto-b">{props.body(s, set)}</div>}
      {props.preview && <div class="auto-p">{props.preview(s)}</div>}
      {locked ? (
        <div class="auto-f">
          <span class="muted small">{includedIn(props.feature!)}</span>
          <OffersLink />
        </div>
      ) : (
        (dirty || error) && (
          <div class="auto-f">
            {error && (
              <p class="form-err" role="alert">
                {error}
              </p>
            )}
            <Btn kind="ghost" small onClick={() => setD(pick(ctx.s))} disabled={busy}>
              Annuler
            </Btn>
            <Btn kind="gold" small icon="check" busy={busy} disabled={!dirty} onClick={save}>
              Enregistrer
            </Btn>
          </div>
        )
      )}
    </article>
  );
}

const sample = (t: string, extra: Parameters<typeof renderTemplate>[1] = {}) => renderTemplate(t, {prenom: SAMPLE, commerce: merchant.value!.merchant_name, ...extra});
/** Nombre entier saisi (champ vidé : valeur précédente, comme ailleurs dans les réglages). */
const intOf = (e: Event, fallback: number) => {
  const raw = (e.target as HTMLInputElement).value;
  const v = Math.round(Number(raw));
  return raw !== '' && Number.isFinite(v) ? v : fallback;
};
/** Contrôles des bornes de la table merchant_settings, avant l'envoi. */
const outOf = (v: number, min: number, max: number, label: string) => (v >= min && v <= max ? null : `${label} : entre ${min} et ${max}.`);
const firstOf = (...checks: (string | null)[]) => checks.find(Boolean) ?? null;
function Chips({tokens, onAdd}: {tokens: [string, string][]; onAdd: (t: string) => void}) {
  return (
    <div class="btn-row">
      {tokens.map(([t, label]) => (
        <button type="button" class="chip" onClick={() => onAdd(t)}>
          + {label}
        </button>
      ))}
    </div>
  );
}
const append = (text: string, token: string, max: number) => (text + (text && !/\s$/.test(text) ? ' ' : '') + token).slice(0, max);
const Example = () => <p class="muted small">Exemple avec la cliente « {SAMPLE} ».</p>;

// --- Toutes les offres -------------------------------------------------------------------------------------
function PassNotif({ctx}: {ctx: Ctx}) {
  const p = ctx.program;
  const total = p?.reward_threshold ?? 10;
  const now = Math.max(1, Math.round(total * 0.6));
  return (
    <Auto
      ctx={ctx}
      keys={['notify_balance_updates']}
      toggle="notify_balance_updates"
      icon="bell"
      title="Notification après chaque passage"
      text={() => 'Incluse dans toutes les offres : le client voit son nouveau solde s’afficher sur son téléphone.'}
      preview={(s) =>
        s.notify_balance_updates ? (
          <NotifPreview body={p?.type === 'VISITS' || !p ? `Passage enregistré : ${now} / ${total}` : `Votre solde : ${now}`} />
        ) : (
          <p class="muted small">Désactivée : le solde se met à jour sur la carte, sans notification.</p>
        )
      }
      saved="Réglage enregistré"
    />
  );
}

function Pace({ctx}: {ctx: Ctx}) {
  return (
    <Auto
      ctx={ctx}
      keys={['marketing_min_interval_hours']}
      icon="shield-check"
      title="Pour ne pas lasser vos clients"
      text={(s) =>
        s.marketing_min_interval_hours > 0
          ? `Un même client reçoit au plus un message commercial (campagne, relance, rappel, demande d’avis) toutes les ${s.marketing_min_interval_hours} heures.`
          : 'Aucun délai entre deux messages commerciaux : 48 heures sont conseillées.'
      }
      bodyAlways
      body={(s, set) => (
        <Field label="Délai minimum entre deux messages commerciaux (heures)" hint="De 0 à 720 heures ; 48 h conseillées. Les messages de service (passage, récompense, niveau VIP, parrainage) ne sont pas concernés.">
          <input type="number" min={0} max={720} value={s.marketing_min_interval_hours} onInput={(e) => set('marketing_min_interval_hours', intOf(e, 0))} />
        </Field>
      )}
      validate={(s) => outOf(s.marketing_min_interval_hours, 0, 720, 'Délai entre deux messages commerciaux (heures)')}
      saved="Réglage enregistré"
    />
  );
}

// --- Premium ------------------------------------------------------------------------------------------------
function Birthday({ctx}: {ctx: Ctx}) {
  return (
    <Auto
      ctx={ctx}
      feature="automation.birthday"
      keys={['birthday_enabled', 'birthday_message']}
      toggle="birthday_enabled"
      icon="cake"
      title="Anniversaire"
      text={() => 'Un message le jour de l’anniversaire du client, avec la surprise de votre choix.'}
      body={(s, set) => (
        <>
          <Field label="Message" hint={`${s.birthday_message.length} / 500 · {prenom} et {commerce} sont remplacés`}>
            <textarea rows={3} maxLength={500} value={s.birthday_message} onInput={(e) => set('birthday_message', (e.target as HTMLTextAreaElement).value)} />
          </Field>
          <Chips tokens={[['{prenom}', 'prénom du client'], ['{commerce}', 'nom du commerce']]} onAdd={(t) => set('birthday_message', append(s.birthday_message, t, 500))} />
          {!s.enrollment_collect_birthday && (
            <p class="note">
              La date d’anniversaire n’est pas demandée à l’inscription : activez-la dans <a href="#/reglages">Réglages › Inscription des clients</a>.
            </p>
          )}
        </>
      )}
      validate={(s) => (!s.birthday_message.trim() ? 'Écrivez le message d’anniversaire.' : null)}
      preview={(s) => (
        <>
          <NotifPreview title="Joyeux anniversaire 🎂" body={sample(s.birthday_message)} when="le jour J" />
          <Example />
        </>
      )}
    />
  );
}

function Inactive({ctx}: {ctx: Ctx}) {
  return (
    <Auto
      ctx={ctx}
      feature="automation.inactive"
      keys={['inactive_enabled', 'inactive_after_days', 'inactive_message', 'reengagement_cooldown_days']}
      toggle="inactive_enabled"
      icon="rotate-ccw"
      title="Relance des clients qui ne reviennent plus"
      text={(s) => `Un rappel aux clients qui ne sont pas revenus depuis ${s.inactive_after_days} jours.`}
      body={(s, set) => (
        <>
          <div class="row2">
            <Field label="Après combien de jours d’absence" hint="De 14 à 365 jours.">
              <input type="number" min={14} max={365} value={s.inactive_after_days} onInput={(e) => set('inactive_after_days', intOf(e, 60))} />
            </Field>
            <Field label="Pas de nouvelle relance avant (jours)" hint="De 7 à 365 jours.">
              <input type="number" min={7} max={365} value={s.reengagement_cooldown_days} onInput={(e) => set('reengagement_cooldown_days', intOf(e, 30))} />
            </Field>
          </div>
          <Field label="Message" hint={`${s.inactive_message.length} / 500 · {prenom} et {commerce} sont remplacés`}>
            <textarea rows={3} maxLength={500} value={s.inactive_message} onInput={(e) => set('inactive_message', (e.target as HTMLTextAreaElement).value)} />
          </Field>
          <Chips tokens={[['{prenom}', 'prénom du client'], ['{commerce}', 'nom du commerce']]} onAdd={(t) => set('inactive_message', append(s.inactive_message, t, 500))} />
        </>
      )}
      validate={(s) =>
        firstOf(
          outOf(s.inactive_after_days, 14, 365, 'Jours d’absence avant la relance'),
          outOf(s.reengagement_cooldown_days, 7, 365, 'Délai avant une nouvelle relance (jours)'),
          !s.inactive_message.trim() ? 'Écrivez le message de relance.' : null,
        )
      }
      preview={(s) => (
        <>
          <NotifPreview body={sample(s.inactive_message)} when={`après ${s.inactive_after_days} j`} />
          <Example />
        </>
      )}
    />
  );
}

function NearReward({ctx}: {ctx: Ctx}) {
  const p = ctx.program;
  const one = p?.unit_label_singular ?? 'passage';
  const many = p?.unit_label_plural ?? 'passages';
  // Seuil automatique du serveur : un passage (points par passage), ou 10 % du seuil pour un programme au montant
  const auto = p?.type === 'SPEND' ? Math.max(1, Math.ceil((p.reward_threshold ?? 10) * 0.1)) : (p?.points_per_event ?? 1);
  return (
    <Auto
      ctx={ctx}
      feature="automation.near_reward"
      keys={['near_reward_enabled', 'near_reward_after_days', 'near_reward_remaining', 'near_reward_message']}
      toggle="near_reward_enabled"
      icon="hourglass"
      title="« Plus qu’un passage ! »"
      text={(s) => `Un rappel aux clients tout proches de leur récompense qui ne sont pas revenus depuis ${s.near_reward_after_days} jours. Il part une fois par récompense.`}
      body={(s, set) => (
        <>
          <div class="row2">
            <Field label="Absents depuis (jours)" hint="De 2 à 60 jours.">
              <input type="number" min={2} max={60} value={s.near_reward_after_days} onInput={(e) => set('near_reward_after_days', intOf(e, 7))} />
            </Field>
            <Field label={`Proches de leur récompense : au plus (${many})`} hint={`Vide = automatique (${auto} ${auto > 1 ? many : one}).`}>
              <input
                type="number"
                min={1}
                max={100000}
                placeholder={`Automatique (${auto})`}
                value={s.near_reward_remaining ?? ''}
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  set('near_reward_remaining', v === '' ? null : intOf(e, 1));
                }}
              />
            </Field>
          </div>
          <Field label="Message" hint={`${s.near_reward_message.length} / 300`}>
            <textarea rows={3} maxLength={300} value={s.near_reward_message} onInput={(e) => set('near_reward_message', (e.target as HTMLTextAreaElement).value)} />
          </Field>
          <Chips
            tokens={[['{prenom}', 'prénom'], ['{reste}', 'nombre restant'], ['{unite}', many], ['{recompense}', 'récompense'], ['{commerce}', 'commerce']]}
            onAdd={(t) => set('near_reward_message', append(s.near_reward_message, t, 300))}
          />
        </>
      )}
      validate={(s) =>
        firstOf(
          outOf(s.near_reward_after_days, 2, 60, 'Jours d’absence avant le rappel'),
          s.near_reward_remaining === null ? null : outOf(s.near_reward_remaining, 1, 100000, `Proches de leur récompense (${many})`),
          !s.near_reward_message.trim() ? 'Écrivez le message du rappel.' : null,
        )
      }
      preview={(s) => {
        const reste = Math.min(s.near_reward_remaining ?? auto, auto);
        return (
          <>
            <NotifPreview title="Plus qu’un passage !" body={sample(s.near_reward_message, {reste, unite: reste > 1 ? many : one, recompense: ctx.reward})} when={`après ${s.near_reward_after_days} j`} />
            <Example />
          </>
        );
      }}
    />
  );
}

function Review({ctx}: {ctx: Ctx}) {
  return (
    <Auto
      ctx={ctx}
      feature="automation.review"
      keys={['review_enabled', 'review_url', 'review_after_visits', 'review_message']}
      toggle="review_enabled"
      icon="star"
      title="Demande d’avis Google"
      text={(s) => `Après la ${s.review_after_visits}e visite, quelques heures après le passage, une invitation à laisser un avis Google. Le lien reste aussi au dos de la carte.`}
      body={(s, set) => (
        <>
          <Field label="Lien de votre page d’avis Google" hint="Il commence par https://">
            <input type="url" inputMode="url" maxLength={500} placeholder="https://g.page/r/…" value={s.review_url ?? ''} onInput={(e) => set('review_url', (e.target as HTMLInputElement).value.trim() || null)} />
          </Field>
          <details class="help">
            <summary>Où trouver le lien d’avis de votre fiche Google ?</summary>
            <ol>
              <li>Connectez-vous au compte Google qui gère la fiche de votre commerce, puis recherchez le nom du commerce sur Google (ou ouvrez business.google.com).</li>
              <li>
                Dans le panneau de gestion de la fiche, touchez « Demander des avis » (selon l’appareil : « Recueillir plus d’avis »).
              </li>
              <li>Copiez le lien proposé (souvent de la forme https://g.page/r/…/review) et collez-le ci-dessus.</li>
            </ol>
            <p class="muted small">Ouvrez le lien une fois pour vérifier qu’il affiche bien la fenêtre « Donner un avis » de votre commerce.</p>
          </details>
          <div class="row2">
            <Field label="Après combien de visites" hint="De la 2e à la 20e visite.">
              <input type="number" min={2} max={20} value={s.review_after_visits} onInput={(e) => set('review_after_visits', intOf(e, 3))} />
            </Field>
          </div>
          <Field label="Message" hint={`${s.review_message.length} / 300 · {prenom} et {commerce} sont remplacés`}>
            <textarea rows={3} maxLength={300} value={s.review_message} onInput={(e) => set('review_message', (e.target as HTMLTextAreaElement).value)} />
          </Field>
        </>
      )}
      validate={(s) => {
        if (s.review_url && !/^https:\/\/\S+$/.test(s.review_url)) return 'Le lien d’avis doit commencer par https://';
        if (s.review_enabled && !s.review_url) return 'Collez le lien de votre page d’avis Google pour activer la demande d’avis.';
        return firstOf(outOf(s.review_after_visits, 2, 20, 'Visite de la demande d’avis'), !s.review_message.trim() ? 'Écrivez le message de la demande d’avis.' : null);
      }}
      preview={(s) => (
        <>
          <NotifPreview title="Votre avis compte" body={sample(s.review_message)} when="après la visite" />
          <Example />
        </>
      )}
    />
  );
}

function HappyHours({ctx}: {ctx: Ctx}) {
  return (
    <Auto
      ctx={ctx}
      feature="automation.happy_hours"
      keys={['happy_hours_enabled', 'happy_hours']}
      toggle="happy_hours_enabled"
      icon="clock"
      title="Double tampon aux heures creuses"
      text={() => 'Pendant ces créneaux, chaque passage compte double : de quoi remplir vos heures creuses.'}
      body={(s, set) => <SlotsEditor slots={s.happy_hours} onChange={(v) => set('happy_hours', v)} />}
      validate={(s) => {
        if (s.happy_hours_enabled && !s.happy_hours.length) return 'Ajoutez au moins un créneau.';
        for (const [i, x] of s.happy_hours.entries()) {
          if (!x.days.length) return `Créneau ${i + 1} : choisissez au moins un jour.`;
          if (!x.start || !x.end || x.start >= x.end) return `Créneau ${i + 1} : l’heure de début doit précéder l’heure de fin.`;
        }
        return null;
      }}
      preview={(s) =>
        s.happy_hours.length ? (
          <div class="back-field">
            <span class="back-l">Au dos de la carte · Double tampon</span>
            <span class="back-v">{formatHappyHours(s.happy_hours)}</span>
            <span class="scan-pill">
              <Icon name="zap" size={14} /> Double tampon !
            </span>
            <span class="muted small">Ce que voit l’équipe au scanner pendant un créneau.</span>
          </div>
        ) : (
          <p class="muted small">Aucun créneau pour le moment.</p>
        )
      }
    />
  );
}

/** Éditeur de 3 créneaux au plus : jours (1 = lundi) et heures, « 24:00 » pour finir à minuit. */
function SlotsEditor({slots, onChange}: {slots: HappySlot[]; onChange: (s: HappySlot[]) => void}) {
  const upd = (i: number, x: Partial<HappySlot>) => onChange(slots.map((y, k) => (k === i ? {...y, ...x} : y)));
  return (
    <div class="slots">
      {slots.map((x, i) => (
        <div class="slot">
          <div class="slot-h">
            <strong>Créneau {i + 1}</strong>
            <Btn kind="quiet" small icon="trash-2" title={`Retirer le créneau ${i + 1}`} onClick={() => onChange(slots.filter((_, k) => k !== i))} />
          </div>
          <div class="days" role="group" aria-label={`Jours du créneau ${i + 1}`}>
            {DAY_NAMES.map((n, k) => {
              const day = k + 1;
              const on = x.days.includes(day);
              return (
                <button type="button" class={`day ${on ? 'on' : ''}`} aria-pressed={on} title={n} onClick={() => upd(i, {days: on ? x.days.filter((y) => y !== day) : [...x.days, day].sort((a, b) => a - b)})}>
                  {n.slice(0, 3)}.
                </button>
              );
            })}
          </div>
          <div class="slot-t">
            <label class="fld">
              <span class="fld-l">De</span>
              <input type="time" step={900} value={x.start} onInput={(e) => upd(i, {start: (e.target as HTMLInputElement).value})} />
            </label>
            <label class="fld">
              <span class="fld-l">À</span>
              <input type="time" step={900} value={x.end === '24:00' ? '' : x.end} disabled={x.end === '24:00'} onInput={(e) => upd(i, {end: (e.target as HTMLInputElement).value})} />
            </label>
            <label class="check">
              <input type="checkbox" checked={x.end === '24:00'} onChange={(e) => upd(i, {end: (e.target as HTMLInputElement).checked ? '24:00' : '23:00'})} />
              jusqu’à minuit
            </label>
          </div>
        </div>
      ))}
      {slots.length < 3 && (
        <Btn kind="ghost" small icon="plus" onClick={() => onChange([...slots, {days: [2, 3, 4], start: '14:00', end: '16:00'}])}>
          Ajouter un créneau
        </Btn>
      )}
      {slots.length >= 3 && <p class="muted small">Trois créneaux au plus.</p>}
    </div>
  );
}

// --- Pro ----------------------------------------------------------------------------------------------------
function Tiers({ctx}: {ctx: Ctx}) {
  return (
    <Auto
      ctx={ctx}
      feature="loyalty.tiers"
      keys={['tiers_enabled', 'tier_thresholds', 'tier_perks']}
      toggle="tiers_enabled"
      icon="crown"
      title="Niveaux VIP bronze, argent et or"
      text={() => 'Vos clients montent de niveau avec leurs passages. Le niveau s’affiche sur la carte avec l’avantage choisi, et une notification part à chaque nouveau niveau.'}
      body={(s, set) => (
        <div class="tiers">
          {TIERS.map((t, i) => (
            <div class={`tier tier--${t.key.toLowerCase()}`}>
              <span class="tier-n">
                <Icon name="crown" size={16} />
                {t.name}
              </span>
              <label class="tier-th">
                <span>À partir de</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  aria-label={`Passages pour le niveau ${t.name}`}
                  value={s.tier_thresholds[i]}
                  onInput={(e) => set('tier_thresholds', s.tier_thresholds.map((v, k) => (k === i ? intOf(e, v) : v)))}
                />
                <span>passages</span>
              </label>
              <label class="fld tier-perk">
                <span class="fld-l">Avantage (facultatif)</span>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="Ex. : une boisson offerte"
                  value={s.tier_perks[t.key] ?? ''}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    const next = {...s.tier_perks};
                    if (v.trim()) next[t.key] = v;
                    else delete next[t.key];
                    set('tier_perks', next);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}
      validate={(s) => {
        const [a, b, c] = s.tier_thresholds;
        return a >= 1 && a < b && b < c && c <= 100000 ? null : 'Les seuils doivent augmenter : bronze, puis argent, puis or (par exemple 5, 15 et 30 passages).';
      }}
      preview={(s) => {
        const perk = s.tier_perks.SILVER?.trim();
        return (
          <>
            <NotifPreview title="Niveau Argent" body={sample(`Félicitations {prenom} ! Vous passez au niveau Argent chez {commerce}.${perk ? ` Votre avantage : ${perk}.` : ''}`)} when={`au ${s.tier_thresholds[1]}e passage`} />
            <Example />
          </>
        );
      }}
    />
  );
}

function Referral({ctx}: {ctx: Ctx}) {
  const m = merchant.value!;
  const p = ctx.program;
  const unit = (n: number) => (n > 1 ? (p?.unit_label_plural ?? 'passages') : (p?.unit_label_singular ?? 'passage'));
  const link = `${joinUrl(m.merchant_slug)}?parrain=K7M2P9QX`;
  return (
    <Auto
      ctx={ctx}
      feature="referral"
      keys={['referral_enabled', 'referral_bonus']}
      toggle="referral_enabled"
      icon="share-2"
      title="Parrainage"
      text={(s) => `Chaque client a son lien de parrainage au dos de sa carte. À la première visite de l’ami parrainé, chacun reçoit ${s.referral_bonus} ${unit(s.referral_bonus)} de bonus, et le parrain est prévenu.`}
      body={(s, set) => (
        <div class="row2">
          <Field label={`Bonus pour chacun (${p?.unit_label_plural ?? 'passages'})`} hint="De 1 à 1 000.">
            <input type="number" min={1} max={1000} value={s.referral_bonus} onInput={(e) => set('referral_bonus', intOf(e, 1))} />
          </Field>
        </div>
      )}
      validate={(s) => outOf(s.referral_bonus, 1, 1000, 'Bonus de parrainage')}
      preview={(s) => (
        <>
          <div class="back-field">
            <span class="back-l">Au dos de la carte · Parrainez un proche</span>
            <span class="back-v">
              Partagez ce lien : à sa première visite, vous gagnez chacun {s.referral_bonus} {unit(s.referral_bonus)}. {link}
            </span>
          </div>
          <NotifPreview title="Merci pour votre parrainage" body={sample(`Merci {prenom} ! Grâce à votre parrainage, vous gagnez ${s.referral_bonus} ${unit(s.referral_bonus)} chez {commerce}.`)} when="1re visite de l’ami" />
          <Example />
        </>
      )}
    />
  );
}
