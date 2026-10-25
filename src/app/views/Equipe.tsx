// Équipe : un compte par personne, jamais de mot de passe partagé. L'invitation crée un lien
// d'activation à remettre à l'employé, qui choisit lui-même son mot de passe.
import {useState} from 'preact/hooks';
import {api, merchant, toast, toastError} from '../state';
import {Badge, Btn, ErrorBox, Field, LinkBox, Modal, PageHead, Panel, Spinner, Toggle, useBusy, useLoad} from '../ui';
import {ago} from '../util';

type Role = 'OWNER' | 'ADMIN' | 'STAFF';
interface Staff {
  id: string;
  user_id: string;
  role: Role;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  display_name: string;
  email: string | null;
  permissions: Record<string, boolean>;
  last_seen_at: string | null;
}
const ROLES: Record<Role, string> = {OWNER: 'Propriétaire', ADMIN: 'Responsable', STAFF: 'Employé'};
const ROLE_HINT: Record<Role, string> = {
  STAFF: 'Scanner, voir les clients (sans leurs coordonnées), utiliser les récompenses.',
  ADMIN: 'Tout gérer sauf les intégrations ; peut gérer les employés.',
  OWNER: 'Accès complet, y compris l’équipe et les responsables.',
};

export function Equipe() {
  const m = merchant.value!;
  const data = useLoad(async () => {
    const [staff, catalog, roles] = await Promise.all([
      api.select<Staff>('merchant_staff', {eq: {merchant_id: m.merchant_id}, order: ['created_at', true]}),
      api.select<{permission: string; description: string}>('permissions_catalog', {order: ['permission', true]}),
      api.select<{role: Role; permission: string}>('role_permissions'),
    ]);
    return {staff, catalog, roles};
  }, [m.merchant_id]);
  const [invite, setInvite] = useState(false);
  const [link, setLink] = useState<{name: string; url: string} | null>(null);
  const [edit, setEdit] = useState<Staff | null>(null);
  const [busy, run] = useBusy();

  const isOwner = m.role === 'OWNER';
  const canManage = (s: Staff) => s.id !== m.staff_id && (isOwner || s.role === 'STAFF');

  const resetLink = (s: Staff) =>
    run(async () => {
      try {
        const r = await api.edge('staff-manage', {action: 'reset_link', staff_id: s.id});
        setLink({name: s.display_name, url: r.setup_link});
      } catch (e) {
        toastError(e);
      }
    });
  const setStatus = (s: Staff, status: 'ACTIVE' | 'DISABLED') =>
    run(async () => {
      try {
        await api.edge('staff-manage', status === 'DISABLED' ? {action: 'remove', staff_id: s.id} : {action: 'update', staff_id: s.id, status});
        toast(status === 'DISABLED' ? `${s.display_name} n’a plus accès` : `${s.display_name} a de nouveau accès`);
        data.reload();
      } catch (e) {
        toastError(e);
      }
    });

  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Équipe">
        <Btn kind="gold" icon="user-plus" onClick={() => setInvite(true)}>
          Inviter un membre
        </Btn>
      </PageHead>
      <p class="lead-sm">Un compte par personne : chacun choisit son mot de passe, et vous pouvez retirer un accès à tout moment. Ne partagez jamais votre propre mot de passe.</p>

      {data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Spinner />
      ) : (
        <Panel>
          <ul class="team">
            {data.data.staff.map((s) => (
              <li class={s.status === 'DISABLED' ? 'is-off' : ''}>
                <span class="avatar">{s.display_name.slice(0, 1).toUpperCase()}</span>
                <span class="team-t">
                  <strong>
                    {s.display_name}
                    {s.id === m.staff_id && <small> (vous)</small>}
                  </strong>
                  <small>{s.email ?? '–'}</small>
                </span>
                <span class="team-b">
                  <Badge tone={s.role === 'OWNER' ? 'dark' : s.role === 'ADMIN' ? 'gold' : 'neutral'}>{ROLES[s.role]}</Badge>
                  {s.status === 'INVITED' && <Badge tone="amber">Invitation en attente</Badge>}
                  {s.status === 'DISABLED' && <Badge tone="red">Désactivé</Badge>}
                </span>
                <span class="team-d">{s.status === 'ACTIVE' ? `Vu ${ago(s.last_seen_at)}` : ''}</span>
                {canManage(s) && (
                  <span class="team-a">
                    {s.status !== 'DISABLED' && (
                      <>
                        <Btn kind="quiet" small icon="key-round" busy={busy} onClick={() => resetLink(s)} title="Nouveau lien de connexion">
                          Lien
                        </Btn>
                        <Btn kind="quiet" small icon="pencil" onClick={() => setEdit(s)} title="Rôle et droits" />
                        <Btn kind="quiet" small icon="power" busy={busy} onClick={() => setStatus(s, 'DISABLED')} title="Désactiver l’accès" />
                      </>
                    )}
                    {s.status === 'DISABLED' && (
                      <Btn kind="ghost" small icon="rotate-ccw" busy={busy} onClick={() => setStatus(s, 'ACTIVE')}>
                        Réactiver
                      </Btn>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {invite && (
        <InviteModal
          isOwner={isOwner}
          onClose={() => setInvite(false)}
          onDone={(name, url) => {
            setInvite(false);
            setLink({name, url});
            data.reload();
          }}
        />
      )}
      {link && (
        <Modal open onClose={() => setLink(null)} title={`Lien de connexion de ${link.name}`} wide footer={<Btn onClick={() => setLink(null)}>J’ai transmis le lien</Btn>}>
          <p>
            Remettez ce lien à <strong>{link.name}</strong> (par message, ou faites-lui scanner le QR code). Il l’ouvre pour choisir son mot de passe, puis se connecte sur loyna.fr/espace-client. Le lien ne sert qu’une fois.
          </p>
          <LinkBox url={link.url} note="Lien personnel : ne le publiez pas." />
        </Modal>
      )}
      {edit && data.data && <EditModal staff={edit} isOwner={isOwner} catalog={data.data.catalog} roles={data.data.roles} onClose={() => setEdit(null)} onSaved={data.reload} />}
    </div>
  );
}

function InviteModal({isOwner, onClose, onDone}: {isOwner: boolean; onClose: () => void; onDone: (name: string, url: string) => void}) {
  const m = merchant.value!;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const submit = (e: Event) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Indiquez le prénom de la personne.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Adresse e-mail invalide.');
    run(async () => {
      try {
        const r = await api.edge('staff-manage', {action: 'invite', email: email.trim(), display_name: name.trim(), role, merchant_id: m.merchant_id});
        onDone(name.trim(), r.setup_link);
      } catch (err: any) {
        setError(err?.status === 409 ? 'Cette personne fait déjà partie de l’équipe.' : (err?.message ?? 'Invitation impossible.'));
      }
    });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Inviter un membre"
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>
            Annuler
          </Btn>
          <Btn kind="gold" icon="user-plus" busy={busy} onClick={submit as any}>
            Créer le lien d’accès
          </Btn>
        </>
      }
    >
      <form class="form" onSubmit={submit}>
        <Field label="Prénom (ou nom affiché)">
          <input type="text" maxLength={80} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} autoFocus />
        </Field>
        <Field label="Adresse e-mail" hint="Elle servira d’identifiant de connexion.">
          <input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
        </Field>
        <fieldset class="fs">
          <legend>Rôle</legend>
          <div class="opt-grid">
            {(['STAFF', 'ADMIN', 'OWNER'] as Role[])
              .filter((r) => r === 'STAFF' || isOwner)
              .map((r) => (
                <label class={`opt ${role === r ? 'on' : ''}`}>
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                  <strong>{ROLES[r]}</strong>
                  <small>{ROLE_HINT[r]}</small>
                </label>
              ))}
          </div>
        </fieldset>
        {error && (
          <p class="form-err" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function EditModal({
  staff,
  isOwner,
  catalog,
  roles,
  onClose,
  onSaved,
}: {
  staff: Staff;
  isOwner: boolean;
  catalog: {permission: string; description: string}[];
  roles: {role: Role; permission: string}[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = merchant.value!;
  const [role, setRole] = useState<Role>(staff.role);
  const [name, setName] = useState(staff.display_name);
  const [over, setOver] = useState<Record<string, boolean>>(staff.permissions ?? {});
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const defaults = new Set(roles.filter((r) => r.role === role).map((r) => r.permission));
  const effective = (p: string) => over[p] ?? defaults.has(p);
  // Un responsable ne peut accorder que les droits qu'il possède lui-même.
  const grantable = (p: string) => isOwner || m.permissions.includes(p);

  const toggle = (p: string, v: boolean) => {
    const next = {...over};
    if (v === defaults.has(p)) delete next[p];
    else next[p] = v;
    setOver(next);
  };
  const save = () =>
    run(async () => {
      setError('');
      const clean = Object.fromEntries(Object.entries(over).filter(([p, v]) => v !== defaults.has(p)));
      try {
        await api.edge('staff-manage', {action: 'update', staff_id: staff.id, role: role !== staff.role ? role : undefined, permissions: clean, display_name: name.trim() || undefined});
        toast('Droits enregistrés');
        onClose();
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
      }
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Rôle et droits de ${staff.display_name}`}
      wide
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>
            Annuler
          </Btn>
          <Btn kind="gold" icon="check" busy={busy} onClick={save}>
            Enregistrer
          </Btn>
        </>
      }
    >
      <div class="form">
        <Field label="Nom affiché">
          <input type="text" maxLength={80} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>
        {isOwner && (
          <Field label="Rôle" hint={ROLE_HINT[role]}>
            <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as Role)}>
              {(Object.keys(ROLES) as Role[]).map((r) => (
                <option value={r}>{ROLES[r]}</option>
              ))}
            </select>
          </Field>
        )}
        <fieldset class="fs">
          <legend>Droits</legend>
          <p class="fld-h">Par défaut, les droits suivent le rôle. Modifiez-les un par un si besoin.</p>
          <div class="perm-list">
            {catalog.map((c) => (
              <Toggle checked={effective(c.permission)} disabled={!grantable(c.permission) && !effective(c.permission)} onChange={(v) => toggle(c.permission, v)} label={c.description} hint={over[c.permission] !== undefined ? 'Modifié pour cette personne' : undefined} />
            ))}
          </div>
        </fieldset>
        {error && (
          <p class="form-err" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
