// Choix du mot de passe (lien d'activation d'un nouveau membre ou lien de réinitialisation).
// Lien ?token_hash=…&type=recovery (depuis le 2026-10-27) : la page vérifie le jeton (verifyOtp), ce qui ouvre la
// session. Ancien lien (jetons après #, via /set-password) : Supabase Auth ouvre la session à partir de l'adresse.
// Il ne reste qu'à enregistrer le mot de passe.
import {useEffect, useState} from 'preact/hooks';
import {linkError, supabaseBackend, verifyRecoveryLink} from './backend';
import {Icon} from './icons';
import {Btn, Field, Spinner} from './ui';

const RULES = [
  {test: (p: string) => p.length >= 10, label: '10 caractères minimum'},
  {test: (p: string) => /[A-Z]/.test(p), label: 'une majuscule'},
  {test: (p: string) => /[a-z]/.test(p), label: 'une minuscule'},
  {test: (p: string) => /\d/.test(p), label: 'un chiffre'},
];

export default function Password({logo}: {logo: string}) {
  const api = supabaseBackend;
  const [state, setState] = useState<'loading' | 'ready' | 'nolink' | 'error' | 'done'>('loading');
  const [linkErr, setLinkErr] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const err = linkError();
    if (err) {
      setLinkErr(err);
      setState('error');
      return;
    }
    const q = new URLSearchParams(location.search);
    const token = q.get('token_hash') ?? '';
    if (token && q.get('type') === 'recovery') {
      if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) {
        setLinkErr('Ce lien n’est plus valide (il a peut-être déjà été utilisé).');
        setState('error');
        return;
      }
      verifyRecoveryLink(token).then(
        (address) => {
          setEmail(address);
          setState('ready');
          history.replaceState(null, '', location.pathname); // le jeton ne reste pas dans l'adresse
        },
        (e) => {
          setLinkErr(e?.code === 'LINK_INVALID' ? 'Ce lien n’est plus valide (il a peut-être déjà été utilisé, ou il a expiré).' : (e?.message ?? 'Vérification du lien impossible.'));
          setState('error');
        },
      );
      return;
    }
    // Laisse le client Supabase lire le jeton présent dans l'adresse, puis vérifie la session.
    const t = setTimeout(async () => {
      const s = await api.getSession().catch(() => null);
      if (s) {
        setEmail(s.email);
        setState('ready');
        history.replaceState(null, '', location.pathname);
      } else setState('nolink');
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const ok = RULES.every((r) => r.test(pw)) && pw === pw2;
  const submit = async (e: Event) => {
    e.preventDefault();
    setError('');
    if (!RULES.every((r) => r.test(pw))) return setError('Le mot de passe ne respecte pas encore toutes les règles.');
    if (pw !== pw2) return setError('Les deux mots de passe sont différents.');
    setBusy(true);
    try {
      await api.updatePassword(pw);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="center-screen">
      <a href="/" class="center-logo" aria-label="loyna.fr" dangerouslySetInnerHTML={{__html: logo}} />
      <div class="center-card">
        {state === 'loading' && <Spinner label="Vérification du lien…" />}
        {state === 'error' && (
          <>
            <h1>{linkErr}</h1>
            <p class="muted">
              Pour des raisons de sécurité, un lien de connexion ne sert qu’une fois et pendant une durée limitée. Demandez-en un nouveau à votre responsable (menu Équipe de LOYNA Business), ou écrivez à{' '}
              <a href="mailto:contact@loyna.fr">contact@loyna.fr</a> si vous êtes le propriétaire du commerce.
            </p>
            <Btn kind="ghost" href="/espace-client/" icon="arrow-right">
              Aller à la connexion
            </Btn>
          </>
        )}
        {state === 'nolink' && (
          <>
            <h1>Choisir mon mot de passe</h1>
            <p class="muted">Ouvrez le lien personnel qui vous a été transmis (par votre responsable ou par LOYNA) : il vous amène ici pour choisir votre mot de passe.</p>
            <Btn kind="ghost" href="/espace-client/" icon="arrow-right">
              J’ai déjà un mot de passe
            </Btn>
          </>
        )}
        {state === 'ready' && (
          <form class="form" onSubmit={submit}>
            <p class="eyebrow">LOYNA Business</p>
            <h1>Choisissez votre mot de passe</h1>
            {email && (
              <p class="muted">
                Compte : <strong>{email}</strong>
              </p>
            )}
            <input type="email" autoComplete="username" value={email} hidden readOnly />
            <Field label="Nouveau mot de passe">
              <span class="pw">
                <input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} autoFocus />
                <button type="button" class="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Masquer' : 'Afficher'}>
                  <Icon name={show ? 'eye-off' : 'eye'} size={18} />
                </button>
              </span>
            </Field>
            <ul class="pw-rules" aria-live="polite">
              {RULES.map((r) => (
                <li class={r.test(pw) ? 'ok' : ''}>
                  <Icon name={r.test(pw) ? 'circle-check' : 'circle-x'} size={16} />
                  {r.label}
                </li>
              ))}
            </ul>
            <Field label="Confirmez le mot de passe" error={pw2 && pw !== pw2 ? 'Les deux mots de passe sont différents.' : undefined}>
              <input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onInput={(e) => setPw2((e.target as HTMLInputElement).value)} />
            </Field>
            {error && (
              <p class="form-err" role="alert">
                {error}
              </p>
            )}
            <Btn type="submit" kind="gold" block busy={busy} disabled={!ok} icon="lock">
              Enregistrer mon mot de passe
            </Btn>
          </form>
        )}
        {state === 'done' && (
          <>
            <span class="done-i">
              <Icon name="circle-check" size={34} />
            </span>
            <h1>Mot de passe enregistré</h1>
            <p class="muted">Vous êtes connecté. Gardez ce mot de passe pour vous : chaque membre de l’équipe a le sien.</p>
            <Btn kind="gold" href="/espace-client/" icon="arrow-right">
              Ouvrir mon espace
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}
