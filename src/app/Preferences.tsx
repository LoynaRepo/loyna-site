// Préférences d'un client final (lien signé « Mes préférences » au dos de sa carte Wallet) :
// accords Wallet / SMS et suppression de ses données, sans compte ni mot de passe.
import type {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {publicEdge} from './http';
import {Icon} from './icons';

interface Prefs {
  status: 'OK' | 'NOT_FOUND';
  first_name: string;
  merchant_name: string;
  sms_available: boolean;
  marketing_wallet: boolean;
  marketing_sms: boolean;
}

export default function Preferences() {
  const [token] = useState(() => {
    const t = new URLSearchParams(location.search).get('t');
    if (t) return t;
    try {
      return sessionStorage.getItem('loyna-pref-t') ?? ''; // page rechargée après retrait du lien de l'adresse
    } catch {
      return '';
    }
  });
  const [p, setP] = useState<Prefs | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error' | 'deleted'>('loading');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(0);

  const load = () => {
    if (token.length < 20) return setState('invalid');
    setState('loading');
    publicEdge<Prefs>('customer-privacy', {body: {action: 'get_preferences', token}}).then(
      (r) => {
        if (r.status !== 'OK') return setState('invalid');
        setP(r);
        setState('ready');
        try {
          sessionStorage.setItem('loyna-pref-t', token);
          history.replaceState(null, '', location.pathname); // le lien personnel ne reste pas dans l'historique
        } catch {
          /* stockage indisponible : le lien reste dans l'adresse */
        }
      },
      (e) => {
        setMsg(e?.message ?? '');
        setState(e?.status === 401 || e?.status === 400 || e?.status === 403 ? 'invalid' : 'error');
      },
    );
  };
  useEffect(load, []);

  const update = async (changes: {marketing_wallet?: boolean; marketing_sms?: boolean; delete_account?: boolean}) => {
    setSaving(true);
    setMsg('');
    try {
      const r = await publicEdge<{status: string}>('customer-privacy', {body: {action: 'update_preferences', token, ...changes}});
      if (r.status === 'DELETED') setState('deleted');
      else {
        setP((x) => (x ? {...x, ...changes} : x));
        setMsg('Vos préférences sont enregistrées.');
      }
    } catch (e: any) {
      setMsg(e?.message ?? 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell>
      {state === 'loading' && (
        <div class="spin-wrap" role="status">
          <span class="spin" />
          <span class="sr-only">Chargement…</span>
        </div>
      )}
      {state === 'invalid' && (
        <>
          <h1>Lien non valide</h1>
          <p>Ce lien de préférences est incomplet ou a expiré. Ouvrez votre carte de fidélité dans votre Wallet, puis le lien « Mes préférences » au dos de la carte.</p>
        </>
      )}
      {state === 'error' && (
        <>
          <h1>Connexion impossible</h1>
          <p>{msg || 'Réessayez dans un instant.'}</p>
          <button type="button" class="b b--primary" onClick={load}>
            Réessayer
          </button>
        </>
      )}
      {state === 'deleted' && (
        <>
          <span class="j-done-i">
            <Icon name="circle-check" size={34} />
          </span>
          <h1>Vos données ont été supprimées</h1>
          <p>Votre carte de fidélité est désactivée : vous pouvez la retirer de votre Wallet.</p>
        </>
      )}
      {state === 'ready' && p && (
        <>
          <p class="eyebrow">{p.merchant_name}</p>
          <h1>Bonjour {p.first_name}</h1>
          <p>Choisissez les messages que vous acceptez de recevoir de {p.merchant_name}. Votre carte et vos avantages restent actifs dans tous les cas.</p>
          <div class="toggles">
            <label class="tgl">
              <span class="tgl-t">
                <span class="tgl-l">Offres dans mon Wallet</span>
                <span class="tgl-h">Notifications sur l’écran de votre téléphone, via votre carte.</span>
              </span>
              <input type="checkbox" role="switch" checked={p.marketing_wallet} disabled={saving} onChange={(e) => update({marketing_wallet: (e.target as HTMLInputElement).checked})} />
              <span class="tgl-s" aria-hidden="true" />
            </label>
            {p.sms_available && (
              <label class="tgl">
                <span class="tgl-t">
                  <span class="tgl-l">Offres par SMS</span>
                </span>
                <input type="checkbox" role="switch" checked={p.marketing_sms} disabled={saving} onChange={(e) => update({marketing_sms: (e.target as HTMLInputElement).checked})} />
                <span class="tgl-s" aria-hidden="true" />
              </label>
            )}
          </div>
          {msg && (
            <p class="note" role="status">
              {msg}
            </p>
          )}
          <div class="danger-zone">
            <h2>Supprimer mes données</h2>
            <p>Vos coordonnées et votre historique sont effacés, votre carte est désactivée. Cette action est définitive.</p>
            {confirm === 0 && (
              <button type="button" class="b b--danger" onClick={() => setConfirm(1)}>
                <Icon name="trash-2" size={18} />
                <span>Supprimer mes données</span>
              </button>
            )}
            {confirm === 1 && (
              <div class="confirm-box">
                <p>
                  <strong>Confirmez-vous la suppression définitive ?</strong> Vos {p.merchant_name ? `avantages chez ${p.merchant_name}` : 'avantages'} seront perdus.
                </p>
                <div class="btn-row">
                  <button type="button" class="b b--ghost" onClick={() => setConfirm(0)}>
                    Annuler
                  </button>
                  <button type="button" class={`b b--danger ${saving ? 'is-busy' : ''}`} disabled={saving} onClick={() => update({delete_account: true})}>
                    <span>Oui, tout supprimer</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({children}: {children: ComponentChildren}) {
  return (
    <div class="j">
      <div class="j-box j-prefs">{children}</div>
      <footer class="j-foot">
        Carte de fidélité propulsée par <a href="/">LOYNA</a>
      </footer>
    </div>
  );
}
