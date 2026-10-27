// Confirmation de l'adresse e-mail d'un compte créé dans le panier de loyna.fr :
// /espace-client/confirmer/?token_hash=…&type=signup (lien de l'e-mail « Confirmez votre adresse e-mail – LOYNA »,
// envoyé par la fonction checkout-create du dépôt LOYNA). Le jeton est vérifié par Supabase Auth (verifyOtp), ce qui
// ouvre la session : le compte n'a plus qu'à ouvrir son espace client, où sa commande apparaît.
import {useEffect, useState} from 'preact/hooks';
import {linkError, verifySignupLink} from './backend';
import {Icon} from './icons';
import {Btn, Spinner} from './ui';
import {frenchTypography} from './typo';

export default function Confirmer({logo}: {logo: string}) {
  const [state, setState] = useState<'loading' | 'done' | 'invalid' | 'error' | 'nolink'>('loading');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => frenchTypography(), []);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const token = q.get('token_hash') ?? '';
    const type = q.get('type') ?? 'signup';
    if (linkError()) return setState('invalid');
    if (!token || type !== 'signup' || !/^[A-Za-z0-9_-]{8,200}$/.test(token)) return setState('nolink');
    verifySignupLink(token).then(
      (address) => {
        setEmail(address);
        setState('done');
        history.replaceState(null, '', location.pathname); // le jeton ne reste pas dans l'adresse
      },
      (e) => {
        if (e?.code === 'LINK_INVALID') return setState('invalid');
        setMessage(e?.message || 'La confirmation n’a pas abouti. Réessayez dans un instant.');
        setState('error');
      },
    );
  }, []);

  return (
    <div class="center-screen">
      <a href="/" class="center-logo" aria-label="loyna.fr" dangerouslySetInnerHTML={{__html: logo}} />
      <div class="center-card">
        {state === 'loading' && <Spinner label="Confirmation de votre adresse…" />}
        {state === 'done' && (
          <>
            <span class="done-i">
              <Icon name="circle-check" size={34} />
            </span>
            <h1>Adresse confirmée</h1>
            <p class="muted">
              Votre compte {email ? <strong>{email}</strong> : 'LOYNA'} est activé et vous êtes connecté. Votre commande apparaît dans votre espace client dès que le paiement est enregistré : LOYNA
              prépare votre carte et vous écrit dès qu’elle est prête.
            </p>
            <Btn kind="gold" href="/espace-client/" icon="arrow-right">
              Ouvrir mon espace client
            </Btn>
          </>
        )}
        {state === 'invalid' && (
          <>
            <h1>Ce lien n’est plus valide</h1>
            <p class="muted">
              Un lien de confirmation ne sert qu’une fois et pendant une durée limitée. Si vous avez déjà confirmé votre adresse, connectez-vous simplement. Sinon, écrivez à{' '}
              <a href="mailto:contact@loyna.fr?subject=Confirmation%20de%20mon%20adresse%20LOYNA">contact@loyna.fr</a> depuis l’adresse de votre compte : nous vous enverrons un nouveau lien.
            </p>
            <Btn kind="ghost" href="/espace-client/" icon="arrow-right">
              Aller à la connexion
            </Btn>
          </>
        )}
        {state === 'error' && (
          <>
            <h1>Confirmation interrompue</h1>
            <p class="muted" role="alert">
              {message}
            </p>
            <Btn icon="refresh-cw" onClick={() => location.reload()}>
              Réessayer
            </Btn>
          </>
        )}
        {state === 'nolink' && (
          <>
            <h1>Confirmer mon adresse</h1>
            <p class="muted">Ouvrez le lien reçu par e-mail après la création de votre compte LOYNA : il vous amène ici pour confirmer votre adresse.</p>
            <Btn kind="ghost" href="/espace-client/" icon="arrow-right">
              Aller à la connexion
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}
