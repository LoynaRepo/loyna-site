// Confirmation de l'adresse e-mail d'un compte créé dans le panier de loyna.fr ou pour un essai depuis /essai/ :
// /espace-client/confirmer/?token_hash=…&type=signup (lien de l'e-mail « Confirmez votre adresse e-mail – LOYNA » ou
// « Confirmez votre adresse pour démarrer votre essai LOYNA », envoyé par les fonctions checkout-create et trial du dépôt
// LOYNA). Le jeton est vérifié par Supabase Auth (verifyOtp), ce qui ouvre la session ; puis `trial {action: 'activate'}` crée
// le commerce d'une demande d'essai (aucun commerce avant cette confirmation) et mène à /espace-client/?bienvenue=1. Compte du
// panier : réponse NONE, sa commande apparaît dans son espace client.
import {useEffect, useState} from 'preact/hooks';
import {linkError, supabaseBackend, verifySignupLink} from './backend';
import {Icon} from './icons';
import {Btn, Spinner} from './ui';
import {frenchTypography} from './typo';

/** Refus de l'activation d'un essai : l'adresse reste confirmée, le compte existe. */
const TRIAL_REFUSED: Record<string, string> = {
  TRIAL_CLOSED: 'Les essais gratuits sont fermés pour le moment.',
  TRIAL_FULL: 'Les essais gratuits sont complets pour le moment.',
  TRIAL_ALREADY_USED: 'Un essai a déjà été utilisé pour ce commerce, cet e-mail ou ce téléphone.',
  ACCOUNT_HAS_MERCHANT: 'Ce compte a déjà un commerce : ouvrez votre espace client.',
};

export default function Confirmer({logo}: {logo: string}) {
  const [state, setState] = useState<'loading' | 'done' | 'trial' | 'trial_refused' | 'trial_error' | 'invalid' | 'error' | 'nolink'>('loading');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => frenchTypography(), []);
  /** Session ouverte : active l'essai s'il y en a un d'attente ; relancer ne recrée rien (le jeton, lui, est déjà utilisé). */
  const activate = async () => {
    setState('loading');
    try {
      const r = await supabaseBackend.edge<{status: string}>('trial', {action: 'activate'});
      if (r?.status === 'ACTIVATED') {
        setState('trial');
        location.replace('/espace-client/?bienvenue=1');
      } else setState('done');
    } catch (e: any) {
      if (TRIAL_REFUSED[e?.code]) {
        setMessage(TRIAL_REFUSED[e.code]);
        return setState('trial_refused');
      }
      // Fonction indisponible ou réseau coupé : on ne sait pas s'il y a un essai, l'espace client réessaiera à l'ouverture
      setMessage(e?.message || 'L’activation n’a pas abouti. Réessayez dans un instant.');
      setState('trial_error');
    }
  };
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const token = q.get('token_hash') ?? '';
    const type = q.get('type') ?? 'signup';
    if (linkError()) return setState('invalid');
    if (!token || type !== 'signup' || !/^[A-Za-z0-9_-]{8,200}$/.test(token)) return setState('nolink');
    verifySignupLink(token).then(
      (address) => {
        setEmail(address);
        history.replaceState(null, '', location.pathname); // le jeton ne reste pas dans l'adresse
        return activate();
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
        {state === 'trial' && (
          <>
            <span class="done-i">
              <Icon name="circle-check" size={34} />
            </span>
            <h1>Votre carte est prête</h1>
            <p class="muted">Votre adresse est confirmée et votre essai a démarré : nous ouvrons votre espace client.</p>
            <Btn kind="gold" href="/espace-client/?bienvenue=1" icon="arrow-right">
              Ouvrir mon espace client
            </Btn>
          </>
        )}
        {state === 'trial_refused' && (
          <>
            <h1>Adresse confirmée</h1>
            <p class="muted" role="alert">
              {message} Votre compte {email ? <strong>{email}</strong> : 'LOYNA'} est bien activé : vous pouvez choisir une offre ou écrire à <a href="mailto:contact@loyna.fr">contact@loyna.fr</a>.
            </p>
            <div class="btn-row">
              <Btn kind="gold" href="/tarifs/" icon="arrow-right">
                Voir les offres
              </Btn>
              <Btn kind="ghost" href="/espace-client/" icon="arrow-right">
                Ouvrir mon espace client
              </Btn>
            </div>
          </>
        )}
        {state === 'trial_error' && (
          <>
            <h1>Adresse confirmée</h1>
            <p class="muted" role="alert">
              {message}
            </p>
            <div class="btn-row">
              <Btn icon="refresh-cw" onClick={activate}>
                Réessayer
              </Btn>
              <Btn kind="ghost" href="/espace-client/" icon="arrow-right">
                Ouvrir mon espace client
              </Btn>
            </div>
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
