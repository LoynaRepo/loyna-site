// Programme de fidélité (update_loyalty_program) et récompenses (table rewards : jamais de
// suppression, une récompense retirée passe en « archivée »). Les cartes installées se mettent à jour seules.
import {useEffect, useState} from 'preact/hooks';
import {ApiError} from '../backend';
import {Icon} from '../icons';
import {api, can, canSee, feature, includedIn, merchant, toast, toastError} from '../state';
import {Badge, Btn, CardPreview, Empty, ErrorBox, Field, Modal, PageHead, Panel, ReadOnlyZone, Spinner, useBusy, useLoad} from '../ui';
import {euros, num} from '../util';

interface Program {
  id: string;
  name: string;
  type: 'VISITS' | 'POINTS' | 'SPEND';
  points_per_event: number;
  spend_points_per_unit: number | null;
  spend_rounding: 'FLOOR' | 'ROUND' | 'CEIL';
  reward_threshold: number;
  reset_behavior: 'RESET_ON_REWARD' | 'DEDUCT_ON_REDEEM' | 'NEVER';
  scan_cooldown_minutes: number;
  unit_label_singular: string;
  unit_label_plural: string;
  wallet_description: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'ARCHIVED';
}
interface Reward {
  id: string;
  name: string;
  description: string | null;
  threshold: number;
  reward_type: 'FREE_ITEM' | 'DISCOUNT_PERCENT' | 'DISCOUNT_AMOUNT' | 'CUSTOM';
  value: number | null;
  validity_days: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  sort_order: number;
}

const TYPES = [
  {value: 'VISITS', label: 'Au passage', hint: 'Un tampon par visite', feature: 'loyalty.visits'},
  {value: 'POINTS', label: 'À points', hint: 'Un nombre de points fixe par visite', feature: 'loyalty.points'},
  {value: 'SPEND', label: 'Au montant dépensé', hint: 'Des points selon le montant de l’achat', feature: 'loyalty.spend'},
] as const;
const RESETS = [
  {value: 'RESET_ON_REWARD', label: 'Carte à tampons', hint: 'La carte repart à zéro quand la récompense est débloquée.'},
  {value: 'DEDUCT_ON_REDEEM', label: 'Cagnotte', hint: 'Les points sont déduits quand le client utilise sa récompense.'},
  {value: 'NEVER', label: 'Paliers', hint: 'Le solde n’est jamais remis à zéro : les récompenses se débloquent par palier.'},
] as const;
const RTYPES: Record<Reward['reward_type'], string> = {FREE_ITEM: 'Produit ou service offert', DISCOUNT_PERCENT: 'Remise en %', DISCOUNT_AMOUNT: 'Remise en €', CUSTOM: 'Autre'};
const PROGRAM_STATUS: Record<string, string> = {
  PROGRAM_HAS_ACTIVITY: 'Le type et le fonctionnement ne sont modifiables qu’avant le premier passage.',
  REWARD_THRESHOLD_ABOVE_CYCLE: 'Une récompense active a un seuil plus élevé que la longueur de la carte : baissez son seuil d’abord.',
  FEATURE_NOT_AVAILABLE: 'Ce type de programme n’est pas inclus dans votre offre.',
  FORBIDDEN: 'Vous n’avez pas l’autorisation de modifier le programme.',
  INVALID_STATUS: 'Statut invalide.',
  NOT_FOUND: 'Programme introuvable.',
};

export function Programme() {
  const m = merchant.value!;
  const prog = useLoad(async () => {
    const list = await api.select<Program>('loyalty_programs', {eq: {merchant_id: m.merchant_id}, order: ['created_at', true]});
    return list.find((p) => p.status === 'ACTIVE') ?? list.find((p) => p.status === 'PAUSED') ?? null;
  }, [m.merchant_id]);
  const rewards = useLoad(
    () => (prog.data ? api.select<Reward>('rewards', {eq: {program_id: prog.data.id}, neq: {status: 'ARCHIVED'}, order: ['threshold', true]}) : Promise.resolve([] as Reward[])),
    [prog.data?.id],
  );

  if (prog.error) return <ErrorBox error={prog.error} retry={prog.reload} />;
  if (prog.loading && !prog.data) return <Spinner />;
  if (!prog.data)
    return (
      <div class="page">
        <PageHead eyebrow={m.merchant_name} title="Programme" />
        <Empty icon="gift" title="Aucun programme actif">
          Votre programme est créé par LOYNA à la mise en service. Écrivez à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a>.
        </Empty>
      </div>
    );

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Programme et récompenses" />
      {/* consultation opérateur : programme et récompenses affichés, champs et actions désactivés */}
      <ReadOnlyZone>
        {canSee('program.manage') && <ProgramForm program={prog.data} rewards={rewards.data ?? []} onSaved={(p) => prog.set(p)} />}
        {canSee('rewards.manage') && <Rewards program={prog.data} list={rewards.data} error={rewards.error} reload={rewards.reload} />}
      </ReadOnlyZone>
    </div>
  );
}

function ProgramForm({program, rewards, onSaved}: {program: Program; rewards: Reward[]; onSaved: (p: Program) => void}) {
  const m = merchant.value!;
  const [f, setF] = useState<Program>(program);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  useEffect(() => setF(program), [program]);
  const set = <K extends keyof Program>(k: K, v: Program[K]) => setF((x) => ({...x, [k]: v}));
  const changes = Object.fromEntries(
    (['name', 'type', 'points_per_event', 'spend_points_per_unit', 'spend_rounding', 'reward_threshold', 'reset_behavior', 'scan_cooldown_minutes', 'unit_label_singular', 'unit_label_plural', 'wallet_description', 'status'] as const)
      .filter((k) => (f[k] ?? null) !== (program[k] ?? null))
      .map((k) => [k, f[k]]),
  );
  const dirty = Object.keys(changes).length > 0;
  const firstReward = rewards.find((r) => r.status === 'ACTIVE');

  const save = (e: Event) => {
    e.preventDefault();
    setError('');
    if (f.type === 'SPEND' && !(Number(f.spend_points_per_unit) > 0)) return setError('Indiquez le nombre de points gagnés par euro.');
    run(async () => {
      try {
        const r = await api.rpc<{status: string; program?: Program; hint?: string}>('update_loyalty_program', {p_program_id: program.id, p_changes: changes});
        if (r.status === 'OK' && r.program) {
          onSaved(r.program);
          toast('Programme enregistré : les cartes de vos clients se mettent à jour.');
        } else setError(r.hint ?? PROGRAM_STATUS[r.status] ?? 'Enregistrement impossible.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
      }
    });
  };

  return (
    <Panel title="Votre carte" sub="Les cartes déjà installées chez vos clients se mettent à jour automatiquement.">
      <form class="prog" onSubmit={save}>
        <div class="form">
          <Field label="Nom du programme">
            <input type="text" maxLength={60} required value={f.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} />
          </Field>
          <fieldset class="fs">
            <legend>Type de programme</legend>
            <div class="opt-grid">
              {TYPES.map((t) => {
                const off = !feature(t.feature) && program.type !== t.value;
                return (
                  <label class={`opt ${f.type === t.value ? 'on' : ''} ${off ? 'is-off' : ''}`}>
                    <input type="radio" name="type" value={t.value} checked={f.type === t.value} disabled={off} onChange={() => set('type', t.value)} />
                    <strong>{t.label}</strong>
                    <small>{off ? includedIn(t.feature) : t.hint}</small>
                  </label>
                );
              })}
            </div>
            <p class="fld-h">Le type et le fonctionnement ne sont modifiables qu’avant le premier passage.</p>
          </fieldset>
          <div class="row2">
            {f.type === 'SPEND' ? (
              <>
                <Field label="Points par euro dépensé" hint="Exemple : 1 € = 1 point">
                  <input type="number" min={0.01} step="0.01" value={f.spend_points_per_unit ?? ''} onInput={(e) => set('spend_points_per_unit', Number((e.target as HTMLInputElement).value) || null)} />
                </Field>
                <Field label="Arrondi">
                  <select value={f.spend_rounding} onChange={(e) => set('spend_rounding', (e.target as HTMLSelectElement).value as Program['spend_rounding'])}>
                    <option value="FLOOR">À l’inférieur</option>
                    <option value="ROUND">Au plus proche</option>
                    <option value="CEIL">Au supérieur</option>
                  </select>
                </Field>
              </>
            ) : (
              <Field label={f.type === 'VISITS' ? 'Tampons par passage' : 'Points par passage'}>
                <input type="number" min={1} max={1000} value={f.points_per_event} onInput={(e) => set('points_per_event', Number((e.target as HTMLInputElement).value) || 1)} />
              </Field>
            )}
            <Field label={f.reset_behavior === 'RESET_ON_REWARD' ? 'Longueur de la carte' : 'Seuil de référence'} hint={`En ${f.unit_label_plural}`}>
              <input type="number" min={1} max={1000000} value={f.reward_threshold} onInput={(e) => set('reward_threshold', Number((e.target as HTMLInputElement).value) || 1)} />
            </Field>
          </div>
          <fieldset class="fs">
            <legend>Fonctionnement</legend>
            <div class="opt-grid">
              {RESETS.map((t) => (
                <label class={`opt ${f.reset_behavior === t.value ? 'on' : ''}`}>
                  <input type="radio" name="reset" value={t.value} checked={f.reset_behavior === t.value} onChange={() => set('reset_behavior', t.value)} />
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <div class="row2">
            <Field label="Mot au singulier" hint="passage, tampon, point…">
              <input type="text" maxLength={20} value={f.unit_label_singular} onInput={(e) => set('unit_label_singular', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Mot au pluriel">
              <input type="text" maxLength={20} value={f.unit_label_plural} onInput={(e) => set('unit_label_plural', (e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <div class="row2">
            <Field label="Délai entre deux passages" hint="En minutes : évite qu’une carte soit scannée deux fois par erreur.">
              <input type="number" min={0} max={10080} value={f.scan_cooldown_minutes} onInput={(e) => set('scan_cooldown_minutes', Number((e.target as HTMLInputElement).value) || 0)} />
            </Field>
            <Field label="Statut">
              <select value={f.status} onChange={(e) => set('status', (e.target as HTMLSelectElement).value as Program['status'])}>
                <option value="ACTIVE">Actif</option>
                <option value="PAUSED">En pause (aucun passage validé)</option>
              </select>
            </Field>
          </div>
          <Field label="Texte « Comment ça marche » (au dos de la carte)" hint={`${(f.wallet_description ?? '').length} / 500`}>
            <textarea rows={3} maxLength={500} value={f.wallet_description ?? ''} onInput={(e) => set('wallet_description', (e.target as HTMLTextAreaElement).value || null)} />
          </Field>
          {error && (
            <p class="form-err" role="alert">
              {error}
            </p>
          )}
          <div class="btn-row">
            <Btn type="submit" kind="gold" icon="check" busy={busy} disabled={!dirty}>
              Enregistrer
            </Btn>
            {dirty && (
              <Btn kind="ghost" onClick={() => setF(program)}>
                Annuler les modifications
              </Btn>
            )}
          </div>
        </div>
        <div class="prog-preview">
          <span class="eyebrow">Aperçu</span>
          <CardPreview
            name={m.merchant_name}
            program={f.name}
            logo={m.logo_url}
            bg={m.primary_color}
            fg={m.secondary_color}
            total={f.reward_threshold}
            label={f.unit_label_plural}
            reward={firstReward?.name}
            stamps={f.type === 'VISITS' && f.reset_behavior === 'RESET_ON_REWARD' && f.reward_threshold <= 20}
          />
          <p class="muted small">Couleurs et logo : menu Réglages.</p>
        </div>
      </form>
    </Panel>
  );
}

function Rewards({program, list, error, reload}: {program: Program; list: Reward[] | null; error: string | null; reload: () => void}) {
  const [edit, setEdit] = useState<Partial<Reward> | null>(null);
  const [busy, run] = useBusy();
  const unit = program.unit_label_plural;

  const toggle = (r: Reward, status: Reward['status']) =>
    run(async () => {
      try {
        await api.update('rewards', {id: r.id}, {status});
        toast(status === 'ARCHIVED' ? 'Récompense retirée' : status === 'ACTIVE' ? 'Récompense activée' : 'Récompense désactivée');
        reload();
      } catch (e) {
        toastError(e instanceof ApiError && e.code === '23505' ? new Error('Une récompense active existe déjà à ce seuil.') : e);
      }
    });

  return (
    <Panel
      title="Récompenses"
      sub={program.reset_behavior === 'RESET_ON_REWARD' ? `Seuil maximum : ${num(program.reward_threshold)} ${unit} (longueur de la carte).` : 'Une récompense par seuil.'}
      actions={
        <Btn kind="primary" small icon="plus" onClick={() => setEdit({reward_type: 'FREE_ITEM', threshold: program.reward_threshold, status: 'ACTIVE'})}>
          Ajouter
        </Btn>
      }
    >
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !list ? (
        <Spinner />
      ) : !list.length ? (
        <Empty icon="gift" title="Aucune récompense">
          Ajoutez la récompense que vos clients débloquent (par exemple : un café offert à 10 passages).
        </Empty>
      ) : (
        <ul class="rewards">
          {list.map((r) => (
            <li class={r.status !== 'ACTIVE' ? 'is-off' : ''}>
              <span class="rw-th">
                <b>{num(r.threshold)}</b>
                <small>{unit}</small>
              </span>
              <span class="rw-t">
                <strong>{r.name}</strong>
                <small>
                  {RTYPES[r.reward_type]}
                  {r.reward_type === 'DISCOUNT_PERCENT' && r.value ? ` · ${num(r.value)} %` : ''}
                  {r.reward_type === 'DISCOUNT_AMOUNT' && r.value ? ` · ${euros(r.value)}` : ''}
                  {r.validity_days ? ` · valable ${r.validity_days} jours` : ''}
                </small>
              </span>
              {r.status !== 'ACTIVE' && <Badge>Désactivée</Badge>}
              <span class="rw-a">
                <Btn kind="quiet" small icon="pencil" title="Modifier" onClick={() => setEdit(r)} />
                <Btn kind="quiet" small icon={r.status === 'ACTIVE' ? 'eye-off' : 'eye'} title={r.status === 'ACTIVE' ? 'Désactiver' : 'Activer'} busy={busy} onClick={() => toggle(r, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')} />
                <Btn kind="quiet" small icon="archive" title="Retirer (archiver)" busy={busy} onClick={() => toggle(r, 'ARCHIVED')} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {edit && <RewardModal program={program} reward={edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </Panel>
  );
}

function RewardModal({program, reward, onClose, onSaved}: {program: Program; reward: Partial<Reward>; onClose: () => void; onSaved: () => void}) {
  const m = merchant.value!;
  const [r, setR] = useState<Partial<Reward>>(reward);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const set = <K extends keyof Reward>(k: K, v: Reward[K] | null) => setR((x) => ({...x, [k]: v}));
  const discount = r.reward_type === 'DISCOUNT_PERCENT' || r.reward_type === 'DISCOUNT_AMOUNT';

  const save = (e: Event) => {
    e.preventDefault();
    setError('');
    if (!r.name?.trim()) return setError('Donnez un nom à la récompense.');
    if (!r.threshold || r.threshold < 1) return setError('Indiquez le seuil.');
    if (discount && !(Number(r.value) > 0)) return setError('Indiquez la valeur de la remise.');
    if (r.reward_type === 'DISCOUNT_PERCENT' && Number(r.value) > 100) return setError('Une remise ne peut pas dépasser 100 %.');
    const row = {
      name: r.name.trim(),
      description: r.description?.trim() || null,
      threshold: r.threshold,
      reward_type: r.reward_type,
      value: discount ? Number(r.value) : null,
      validity_days: r.validity_days || null,
      status: r.status ?? 'ACTIVE',
    };
    run(async () => {
      try {
        if (r.id) await api.update('rewards', {id: r.id}, row);
        else await api.insert('rewards', {...row, merchant_id: m.merchant_id, program_id: program.id});
        toast('Récompense enregistrée');
        onClose();
        onSaved();
      } catch (err) {
        setError(err instanceof ApiError && err.code === '23505' ? 'Une récompense active existe déjà à ce seuil : choisissez un autre seuil.' : err instanceof Error ? err.message : 'Enregistrement impossible.');
      }
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={r.id ? 'Modifier la récompense' : 'Nouvelle récompense'}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>
            Annuler
          </Btn>
          <Btn kind="gold" icon="check" busy={busy} onClick={save as any}>
            Enregistrer
          </Btn>
        </>
      }
    >
      <form class="form" onSubmit={save}>
        <Field label="Nom" hint="Ce que le client voit sur sa carte, par exemple « Café offert ».">
          <input type="text" maxLength={80} value={r.name ?? ''} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} autoFocus />
        </Field>
        <div class="row2">
          <Field label={`Seuil (en ${program.unit_label_plural})`} hint={program.reset_behavior === 'RESET_ON_REWARD' ? `Maximum ${program.reward_threshold}` : undefined}>
            <input
              type="number"
              min={1}
              max={program.reset_behavior === 'RESET_ON_REWARD' ? program.reward_threshold : 1000000}
              value={r.threshold ?? ''}
              onInput={(e) => set('threshold', Number((e.target as HTMLInputElement).value) || null)}
            />
          </Field>
          <Field label="Validité après déblocage" hint="En jours ; vide = sans limite">
            <input type="number" min={1} max={3650} value={r.validity_days ?? ''} onInput={(e) => set('validity_days', Number((e.target as HTMLInputElement).value) || null)} />
          </Field>
        </div>
        <div class="row2">
          <Field label="Type">
            <select value={r.reward_type} onChange={(e) => set('reward_type', (e.target as HTMLSelectElement).value as Reward['reward_type'])}>
              {Object.entries(RTYPES).map(([v, l]) => (
                <option value={v}>{l}</option>
              ))}
            </select>
          </Field>
          {discount && (
            <Field label={r.reward_type === 'DISCOUNT_PERCENT' ? 'Remise (%)' : 'Remise (€)'}>
              <input type="number" min={0.01} step="0.01" max={r.reward_type === 'DISCOUNT_PERCENT' ? 100 : undefined} value={r.value ?? ''} onInput={(e) => set('value', Number((e.target as HTMLInputElement).value) || null)} />
            </Field>
          )}
        </div>
        <Field label="Description (facultatif)">
          <textarea rows={2} maxLength={500} value={r.description ?? ''} onInput={(e) => set('description', (e.target as HTMLTextAreaElement).value)} />
        </Field>
        {error && (
          <p class="form-err" role="alert">
            <Icon name="triangle-alert" size={16} /> {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
