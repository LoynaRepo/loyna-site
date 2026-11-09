// « Mon compte » : page de l'application mobile seulement (menu affiché quand native() existe), pour tous les profils.
//  - Face ID / Touch ID / empreinte pour rouvrir l'application (verrou de mobile/web/gate.tsx) ;
//  - mode caisse : ouverture directe sur le scanner, réglage de ce téléphone ;
//  - notifications : affichées seulement une fois activées dans mobile/web/config.ts (clé APNs en place) ;
//  - suppression du compte (règle 5.1.1(v) d'Apple) : vraie demande enregistrée et transmise à LOYNA par la fonction
//    account-deletion du dépôt LOYNA, sans rien effacer automatiquement ; LOYNA confirme par e-mail.
import {useState} from 'preact/hooks';
import {Icon} from '../icons';
import {api, can, merchant, session, toast} from '../state';
import {Btn, Field, Modal, PageHead, Panel, Toggle, useBusy, useLoad} from '../ui';
import {date} from '../util';
import {appPref, native, PREF_BIOMETRY, PREF_CAISSE, setAppPref} from '../native';

interface DeletionStatus {
  status: 'NONE' | 'PENDING' | 'DONE';
  requested_at?: string;
}

const LINKS: [string, string][] = [
  ['Guide de démarrage', '/espace-client/guide/'],
  ['Politique de confidentialité', '/confidentialite/'],
  ['Conditions générales de vente', '/cgv/'],
  ['Conditions générales d’utilisation', '/cgu/'],
  ['Mentions légales', '/mentions-legales/'],
];

export function Appareil() {
  const app = native()!;
  const m = merchant.value!;
  const email = session.value?.email ?? '';
  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Mon compte" />
      <Panel title="Connexion" sub={email ? `Connecté avec ${email}` : undefined}>
        <Biometry />
      </Panel>
      {can('scan.validate') && <Caisse />}
      {app.push.enabled && <Notifications />}
      <Panel title="Informations">
        <ul class="app-links">
          {LINKS.map(([label, href]) => (
            <li>
              <a href={href}>
                {label} <Icon name="external-link" size={15} />
              </a>
            </li>
          ))}
          <li>
            <a href="mailto:contact@loyna.fr">
              Écrire à LOYNA (contact@loyna.fr) <Icon name="mail" size={15} />
            </a>
          </li>
        </ul>
        <p class="muted small">
          Loyna {app.version} ({app.build})
        </p>
      </Panel>
      <Deletion email={email} />
    </div>
  );
}

function Biometry() {
  const app = native()!;
  const st = useLoad(() => app.biometry.status(), []);
  const [on, setOn] = useState(() => appPref(PREF_BIOMETRY));
  if (!st.data) return null;
  if (!st.data.available) return <p class="muted small">Face ID, Touch ID ou l’empreinte ne sont pas configurés sur ce téléphone.</p>;
  const label = st.data.label;
  const change = async (v: boolean) => {
    // Activer demande une première reconnaissance : on vérifie que le téléphone sait le faire
    if (v && !(await app.biometry.verify(`Activer ${label} pour Loyna`))) return;
    setAppPref(PREF_BIOMETRY, v);
    setOn(v);
    toast(v ? `${label} activé sur ce téléphone.` : `${label} désactivé.`, 'info');
  };
  return <Toggle checked={on} onChange={change} label={`Déverrouiller avec ${label}`} hint="Demandé à l’ouverture de l’application et après quelques minutes en arrière-plan. Votre session reste ouverte." />;
}

function Caisse() {
  const [on, setOn] = useState(() => appPref(PREF_CAISSE));
  return (
    <Panel title="Ce téléphone">
      <Toggle
        checked={on}
        onChange={(v) => {
          setAppPref(PREF_CAISSE, v);
          setOn(v);
        }}
        label="Mode caisse : ouvrir sur le scanner"
        hint="Pratique pour le téléphone ou la tablette du comptoir."
      />
    </Panel>
  );
}

function Notifications() {
  const app = native()!;
  const st = useLoad(() => app.push.status(), []);
  const [busy, run] = useBusy();
  const enable = () =>
    run(async () => {
      const r = await app.push.enable();
      if (r === 'denied') toast('Notifications refusées : autorisez-les dans les réglages du téléphone.', 'error');
      else if (r === 'granted') toast('Notifications activées sur ce téléphone.');
      st.reload();
    });
  return (
    <Panel title="Notifications" sub="Nouveau client inscrit, récompense gagnée, campagne envoyée, rapport de la semaine.">
      {st.data === 'granted' ? (
        <p>
          <Icon name="circle-check" size={18} /> Activées sur ce téléphone.
        </p>
      ) : (
        <Btn kind="gold" icon="bell" busy={busy} onClick={enable}>
          Activer les notifications
        </Btn>
      )}
    </Panel>
  );
}

function Deletion({email}: {email: string}) {
  const app = native()!;
  const m = merchant.value!;
  const owner = m.role === 'OWNER';
  const st = useLoad(() => api.edge<DeletionStatus>('account-deletion', {action: 'status'}).catch(() => ({status: 'NONE'}) as DeletionStatus), []);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const mail = `mailto:contact@loyna.fr?subject=${encodeURIComponent('Demande de suppression de mon compte LOYNA')}&body=${encodeURIComponent(
    `Bonjour,\n\nJe demande la suppression de mon compte LOYNA (${email}${owner ? `, commerce ${m.merchant_name}` : ''}).\n\nMerci.`,
  )}`;

  const send = () =>
    run(async () => {
      setError('');
      try {
        await api.edge('account-deletion', {action: 'request', reason: reason.trim() || null, source: `app_${app.platform}`});
        setOpen(false);
        toast('Demande envoyée. LOYNA vous confirme la suite par e-mail.');
        st.reload();
      } catch (e: any) {
        // Fonction pas encore en ligne ou réseau coupé : la demande part par e-mail
        if (e?.status === 404 || e?.code === 'NETWORK' || e?.code === 'HTTP_404') setFallback(true);
        else setError(e?.message ?? 'Envoi impossible. Réessayez dans un instant.');
      }
    });

  const pending = st.data?.status === 'PENDING';
  return (
    <Panel title="Supprimer mon compte">
      {pending ? (
        <p role="status">
          <Icon name="circle-check" size={18} /> Demande de suppression envoyée{st.data?.requested_at ? ` le ${date(st.data.requested_at)}` : ''}. LOYNA la traite et vous écrit à {email}.
        </p>
      ) : (
        <>
          <p class="muted">
            {owner
              ? `Supprime votre compte LOYNA et les données de ${m.merchant_name} : clients, cartes, passages, campagnes. Les cartes de vos clients cessent de fonctionner.`
              : 'Supprime votre accès à l’espace de ce commerce et votre compte LOYNA.'}
          </p>
          <Btn kind="danger" icon="trash-2" onClick={() => setOpen(true)}>
            Supprimer mon compte
          </Btn>
        </>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Supprimer mon compte"
        footer={
          fallback ? (
            <Btn kind="danger" icon="mail" href={mail}>
              Envoyer la demande par e-mail
            </Btn>
          ) : (
            <Btn kind="danger" icon="trash-2" busy={busy} disabled={!sure} onClick={send}>
              Envoyer la demande
            </Btn>
          )
        }
      >
        <p>
          Votre demande est enregistrée et transmise à LOYNA, qui vous confirme la suppression par e-mail à <strong>{email}</strong>, sous 30 jours au plus.
          {owner ? ' Si un abonnement est en cours, LOYNA vous indique d’abord comment il prend fin, selon les conditions générales de vente.' : ''}
        </p>
        {fallback ? (
          <p class="form-err" role="alert">
            La demande ne peut pas partir d’ici pour le moment : envoyez-la par e-mail, le message est déjà rédigé.
          </p>
        ) : (
          <>
            <Field label="Pourquoi partez-vous ? (facultatif)">
              <textarea rows={3} maxLength={1000} value={reason} onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)} />
            </Field>
            <label class="chk">
              <input type="checkbox" checked={sure} onChange={(e) => setSure((e.target as HTMLInputElement).checked)} />
              <span>Je comprends que la suppression est définitive.</span>
            </label>
            {error && (
              <p class="form-err" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </Modal>
    </Panel>
  );
}
