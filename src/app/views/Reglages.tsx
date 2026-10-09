// Réglages : identité du commerce (cartes mises à jour automatiquement), formulaire d'inscription,
// messages automatiques, dos de la carte, et affiche du comptoir avec le QR code d'inscription.
import {useEffect, useState} from 'preact/hooks';
import {CARD_BGS} from '../../data/site';
import {Icon} from '../icons';
import {api, feature, includedIn, merchant, staffCtx, toast} from '../state';
import {Btn, CardPreview, ErrorBox, Field, LinkBox, PageHead, Panel, Spinner, Toggle, useBusy, useLoad} from '../ui';
import {contrast, download, joinUrl, qrSvg} from '../util';

interface Merchant {
  id: string;
  name: string;
  slug: string;
  business_type: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
}
interface Settings {
  enrollment_collect_last_name: boolean;
  enrollment_collect_phone: boolean;
  enrollment_require_phone: boolean;
  enrollment_collect_email: boolean;
  enrollment_collect_birthday: boolean;
  terms_url: string | null;
  privacy_url: string | null;
  wallet_back_text: string | null;
  notify_balance_updates: boolean;
  birthday_enabled: boolean;
  birthday_channel: 'WALLET' | 'SMS';
  birthday_message: string;
  inactive_enabled: boolean;
  inactive_after_days: number;
  inactive_channel: 'WALLET' | 'SMS';
  inactive_message: string;
  reengagement_cooldown_days: number;
  marketing_min_interval_hours: number;
  scan_undo_window_seconds: number;
}
const TEXT_COLORS = ['#ffffff', '#f8f4ec', '#121216', '#d9b27a'];

export function Reglages() {
  const m = merchant.value!;
  const data = useLoad(async () => {
    const [mer, set] = await Promise.all([api.select<Merchant>('merchants', {eq: {id: m.merchant_id}}), api.select<Settings>('merchant_settings', {eq: {merchant_id: m.merchant_id}})]);
    return {merchant: mer[0], settings: set[0]};
  }, [m.merchant_id]);

  if (data.error) return <ErrorBox error={data.error} retry={data.reload} />;
  if (!data.data) return <Spinner />;
  return (
    <div class="page">
      <PageHead eyebrow={m.merchant_name} title="Réglages" />
      <nav class="anchors" aria-label="Sections">
        <a href="#/reglages" onClick={jump('r-commerce')}>
          Commerce
        </a>
        <a href="#/reglages" onClick={jump('r-affiche')}>
          Affiche du comptoir
        </a>
        <a href="#/reglages" onClick={jump('r-inscription')}>
          Inscription
        </a>
        <a href="#/reglages" onClick={jump('r-messages')}>
          Messages automatiques
        </a>
        <a href="#/reglages" onClick={jump('r-carte')}>
          Carte et scanner
        </a>
      </nav>
      <Branding initial={data.data.merchant} />
      <Poster slug={data.data.merchant.slug} name={data.data.merchant.name} />
      {data.data.settings && <SettingsForm initial={data.data.settings} />}
    </div>
  );
}

function jump(id: string) {
  return (e: Event) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'});
  };
}

function Branding({initial}: {initial: Merchant}) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const set = <K extends keyof Merchant>(k: K, v: Merchant[K]) => setF((x) => ({...x, [k]: v}));
  const ratio = contrast(f.primary_color, f.secondary_color);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const upload = (file: File | undefined) =>
    file &&
    run(async () => {
      setError('');
      if (file.type !== 'image/png') return setError('Le logo doit être une image PNG (fond transparent conseillé).');
      if (file.size > 2 * 1024 * 1024) return setError('Logo trop lourd : 2 Mo maximum.');
      try {
        const url = await api.uploadPublic('merchant-assets', `${f.id}/logo.png`, file);
        set('logo_url', url.startsWith('http') ? `${url}?v=${Date.now()}` : url); // ?v : contourne le cache des cartes
        toast('Logo envoyé : enregistrez pour l’appliquer aux cartes.', 'info');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Envoi impossible.');
      }
    });

  const save = (e: Event) => {
    e.preventDefault();
    setError('');
    if (f.website && !/^https?:\/\//.test(f.website)) return setError('Le site doit commencer par https://');
    run(async () => {
      try {
        const saved = await api.update<Merchant>(
          'merchants',
          {id: f.id},
          {
            name: f.name.trim(),
            business_type: f.business_type?.trim() || null,
            logo_url: f.logo_url,
            primary_color: f.primary_color,
            secondary_color: f.secondary_color,
            address: f.address?.trim() || null,
            postal_code: f.postal_code?.trim() || null,
            city: f.city?.trim() || null,
            phone: f.phone?.trim() || null,
            website: f.website?.trim() || null,
          },
        );
        setF(saved);
        Object.assign(initial, saved);
        // Le menu affiche aussitôt le nouveau nom, logo et couleurs
        const cur = merchant.value!;
        const next = {...cur, merchant_name: saved.name, logo_url: saved.logo_url, primary_color: saved.primary_color, secondary_color: saved.secondary_color};
        merchant.value = next;
        if (staffCtx.value) staffCtx.value = {...staffCtx.value, memberships: staffCtx.value.memberships.map((x) => (x.merchant_id === next.merchant_id ? next : x))};
        toast('Enregistré : les cartes de vos clients se mettent à jour.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
      }
    });
  };

  return (
    <Panel title="Votre commerce" sub="Nom, logo et couleurs affichés sur les cartes de vos clients." class="anchor" >
      <span id="r-commerce" class="anchor-t" />
      <form class="prog" onSubmit={save}>
        <div class="form">
          <div class="row2">
            <Field label="Nom du commerce">
              <input type="text" maxLength={120} required value={f.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Activité" hint="Affichée sous le nom : Coiffure, Boulangerie…">
              <input type="text" maxLength={60} value={f.business_type ?? ''} onInput={(e) => set('business_type', (e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <div class="fld">
            <span class="fld-l">Logo</span>
            <div class="logo-up">
              <span class="logo-prev" style={{background: f.primary_color}}>
                {f.logo_url ? <img src={f.logo_url} alt="Logo actuel" /> : <Icon name="store" size={26} />}
              </span>
              <label class="b b--ghost b--sm">
                <Icon name="upload" size={16} />
                <span>{f.logo_url ? 'Changer le logo' : 'Ajouter un logo'}</span>
                <input type="file" accept="image/png" class="sr-only" onChange={(e) => upload((e.target as HTMLInputElement).files?.[0])} />
              </label>
              {f.logo_url && (
                <button type="button" class="linkish small" onClick={() => set('logo_url', null)}>
                  Retirer
                </button>
              )}
            </div>
            <span class="fld-h">PNG, carré de préférence, 2 Mo maximum.</span>
          </div>
          <div class="fld">
            <span class="fld-l">Couleur de la carte</span>
            <div class="swatch-row">
              {CARD_BGS.map((c) => (
                <button type="button" class={`sw ${f.primary_color.toLowerCase() === c.c ? 'on' : ''}`} style={{'--c': c.c} as any} title={c.nom} aria-label={c.nom} aria-pressed={f.primary_color.toLowerCase() === c.c} onClick={() => set('primary_color', c.c)} />
              ))}
              <label class="sw sw--custom" title="Couleur personnalisée">
                <input type="color" value={f.primary_color} onInput={(e) => set('primary_color', (e.target as HTMLInputElement).value)} aria-label="Couleur de la carte personnalisée" />
              </label>
            </div>
          </div>
          <div class="fld">
            <span class="fld-l">Couleur du texte</span>
            <div class="swatch-row">
              {TEXT_COLORS.map((c) => (
                <button type="button" class={`sw ${f.secondary_color.toLowerCase() === c ? 'on' : ''}`} style={{'--c': c} as any} aria-label={c} aria-pressed={f.secondary_color.toLowerCase() === c} onClick={() => set('secondary_color', c)} />
              ))}
              <label class="sw sw--custom" title="Couleur personnalisée">
                <input type="color" value={f.secondary_color} onInput={(e) => set('secondary_color', (e.target as HTMLInputElement).value)} aria-label="Couleur du texte personnalisée" />
              </label>
            </div>
            {ratio < 4.5 && (
              <span class={ratio < 3 ? 'fld-err' : 'fld-h warn'}>
                {ratio < 3 ? 'Texte difficile à lire sur cette couleur : choisissez un contraste plus fort.' : 'Contraste un peu faible : le texte reste lisible mais pourrait l’être davantage.'}
              </span>
            )}
          </div>
          <div class="row2">
            <Field label="Adresse">
              <input type="text" maxLength={200} value={f.address ?? ''} onInput={(e) => set('address', (e.target as HTMLInputElement).value)} />
            </Field>
            <div class="row2 row2--tight">
              <Field label="Code postal">
                <input type="text" maxLength={20} value={f.postal_code ?? ''} onInput={(e) => set('postal_code', (e.target as HTMLInputElement).value)} />
              </Field>
              <Field label="Ville">
                <input type="text" maxLength={100} value={f.city ?? ''} onInput={(e) => set('city', (e.target as HTMLInputElement).value)} />
              </Field>
            </div>
          </div>
          <div class="row2">
            <Field label="Téléphone">
              <input type="tel" maxLength={30} value={f.phone ?? ''} onInput={(e) => set('phone', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Site internet">
              <input type="url" placeholder="https://" value={f.website ?? ''} onInput={(e) => set('website', (e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          {error && (
            <p class="form-err" role="alert">
              {error}
            </p>
          )}
          <div class="btn-row">
            <Btn type="submit" kind="gold" icon="check" busy={busy} disabled={!dirty}>
              Enregistrer
            </Btn>
          </div>
        </div>
        <div class="prog-preview">
          <span class="eyebrow">Aperçu</span>
          <CardPreview name={f.name} program={f.business_type || 'Carte de fidélité'} logo={f.logo_url} bg={f.primary_color} fg={f.secondary_color} total={10} filled={6} />
        </div>
      </form>
    </Panel>
  );
}

function Poster({slug, name}: {slug: string; name: string}) {
  const url = joinUrl(slug);
  const print = () => {
    document.documentElement.classList.add('print-poster');
    const done = () => {
      document.documentElement.classList.remove('print-poster');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };
  return (
    <Panel title="Affiche du comptoir" sub="Vos clients scannent ce QR code avec l’appareil photo de leur téléphone pour ajouter leur carte.">
      <span id="r-affiche" class="anchor-t" />
      <LinkBox url={url} />
      <div class="btn-row">
        <Btn kind="primary" icon="download" onClick={print}>
          Imprimer l’affiche (A4)
        </Btn>
        <Btn kind="ghost" icon="qr-code" onClick={() => download(`qr-inscription-${slug}.svg`, qrSvg(url), 'image/svg+xml')}>
          Télécharger le QR code (SVG)
        </Btn>
      </div>
      <div class="poster" aria-hidden="true">
        <p class="poster-k">Carte de fidélité</p>
        <h2>{name}</h2>
        <p class="poster-l">Scannez, ajoutez votre carte au Wallet, cumulez vos avantages à chaque visite.</p>
        <div class="poster-qr" dangerouslySetInnerHTML={{__html: qrSvg(url)}} />
        <p class="poster-s">Appareil photo du téléphone → QR code → « Ajouter »</p>
        <p class="poster-u">{url.replace('https://', '')}</p>
        <p class="poster-b">Apple Wallet · Google Wallet · sans application</p>
      </div>
    </Panel>
  );
}

function SettingsForm({initial}: {initial: Settings & {merchant_id?: string}}) {
  const m = merchant.value!;
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  useEffect(() => {
    setS(initial);
    setSaved(initial);
  }, [initial]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({...x, [k]: v}));
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  const save = () =>
    run(async () => {
      setError('');
      for (const k of ['terms_url', 'privacy_url'] as const) if (s[k] && !/^https:\/\//.test(s[k]!)) return setError('Les liens des conditions doivent commencer par https://');
      const {
        enrollment_collect_last_name,
        enrollment_collect_phone,
        enrollment_require_phone,
        enrollment_collect_email,
        enrollment_collect_birthday,
        terms_url,
        privacy_url,
        wallet_back_text,
        notify_balance_updates,
        birthday_enabled,
        birthday_channel,
        birthday_message,
        inactive_enabled,
        inactive_after_days,
        inactive_channel,
        inactive_message,
        reengagement_cooldown_days,
        marketing_min_interval_hours,
        scan_undo_window_seconds,
      } = s;
      try {
        const r = await api.update<Settings>(
          'merchant_settings',
          {merchant_id: m.merchant_id},
          {
            enrollment_collect_last_name,
            enrollment_collect_phone,
            enrollment_require_phone: enrollment_collect_phone && enrollment_require_phone,
            enrollment_collect_email,
            enrollment_collect_birthday,
            terms_url: terms_url?.trim() || null,
            privacy_url: privacy_url?.trim() || null,
            wallet_back_text: wallet_back_text?.trim() || null,
            notify_balance_updates,
            birthday_enabled,
            birthday_channel,
            birthday_message,
            inactive_enabled,
            inactive_after_days,
            inactive_channel,
            inactive_message,
            reengagement_cooldown_days,
            marketing_min_interval_hours,
            scan_undo_window_seconds,
          },
        );
        setS(r);
        setSaved(r);
        toast('Réglages enregistrés');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
      }
    });

  const bar = (
    <div class={`savebar ${dirty ? 'is-on' : ''}`}>
      {error && <span class="form-err">{error}</span>}
      <Btn kind="gold" icon="check" busy={busy} disabled={!dirty} onClick={save}>
        Enregistrer les réglages
      </Btn>
    </div>
  );

  return (
    <>
      <Panel title="Inscription des clients" sub="Champs demandés sur la page d’inscription. Moins de champs = plus d’inscriptions.">
        <span id="r-inscription" class="anchor-t" />
        <div class="toggles">
          <Toggle checked label="Prénom" hint="Toujours demandé" disabled onChange={() => {}} />
          <Toggle checked={s.enrollment_collect_last_name} onChange={(v) => set('enrollment_collect_last_name', v)} label="Nom" />
          <Toggle checked={s.enrollment_collect_phone} onChange={(v) => set('enrollment_collect_phone', v)} label="Téléphone" hint="Nécessaire pour les SMS" />
          {s.enrollment_collect_phone && <Toggle checked={s.enrollment_require_phone} onChange={(v) => set('enrollment_require_phone', v)} label="Téléphone obligatoire" />}
          <Toggle checked={s.enrollment_collect_email} onChange={(v) => set('enrollment_collect_email', v)} label="E-mail" />
          <Toggle checked={s.enrollment_collect_birthday} onChange={(v) => set('enrollment_collect_birthday', v)} label="Date d’anniversaire" hint="Pour un message le jour J" />
        </div>
        <div class="row2">
          <Field label="Lien de vos conditions du programme (facultatif)" hint="https://…">
            <input type="url" value={s.terms_url ?? ''} onInput={(e) => set('terms_url', (e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Lien de votre politique de confidentialité (facultatif)" hint="https://…">
            <input type="url" value={s.privacy_url ?? ''} onInput={(e) => set('privacy_url', (e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        {bar}
      </Panel>

      <Panel title="Messages automatiques">
        <span id="r-messages" class="anchor-t" />
        <div class="toggles">
          <Toggle checked={s.notify_balance_updates} onChange={(v) => set('notify_balance_updates', v)} label="Notification après chaque passage" hint="Le client voit son nouveau solde s’afficher sur son téléphone." />
          <Toggle
            checked={s.birthday_enabled}
            disabled={!feature('automation.birthday')}
            onChange={(v) => set('birthday_enabled', v)}
            label="Message d’anniversaire"
            hint={feature('automation.birthday') ? 'Envoyé le jour de l’anniversaire du client.' : includedIn('automation.birthday')}
          />
        </div>
        {s.birthday_enabled && feature('automation.birthday') && (
          <div class="sub-form">
            <Field label="Canal">
              <select value={s.birthday_channel} onChange={(e) => set('birthday_channel', (e.target as HTMLSelectElement).value as any)}>
                <option value="WALLET">Notification Wallet</option>
                {feature('sms') && <option value="SMS">SMS</option>}
              </select>
            </Field>
            <Field label="Message" hint={`${s.birthday_message.length} / 500 · {prenom} et {commerce} sont remplacés`}>
              <textarea rows={2} maxLength={500} value={s.birthday_message} onInput={(e) => set('birthday_message', (e.target as HTMLTextAreaElement).value)} />
            </Field>
          </div>
        )}
        <div class="toggles">
          <Toggle
            checked={s.inactive_enabled}
            disabled={!feature('automation.inactive')}
            onChange={(v) => set('inactive_enabled', v)}
            label="Relance des clients absents"
            hint={feature('automation.inactive') ? 'Un message quand un client ne revient plus.' : includedIn('automation.inactive')}
          />
        </div>
        {s.inactive_enabled && feature('automation.inactive') && (
          <div class="sub-form">
            <div class="row2">
              <Field label="Après combien de jours d’absence">
                <input type="number" min={14} max={365} value={s.inactive_after_days} onInput={(e) => set('inactive_after_days', Number((e.target as HTMLInputElement).value) || 60)} />
              </Field>
              <Field label="Canal">
                <select value={s.inactive_channel} onChange={(e) => set('inactive_channel', (e.target as HTMLSelectElement).value as any)}>
                  <option value="WALLET">Notification Wallet</option>
                  {feature('sms') && <option value="SMS">SMS</option>}
                </select>
              </Field>
            </div>
            <Field label="Message" hint={`${s.inactive_message.length} / 500`}>
              <textarea rows={2} maxLength={500} value={s.inactive_message} onInput={(e) => set('inactive_message', (e.target as HTMLTextAreaElement).value)} />
            </Field>
            <Field label="Pas de nouvelle relance avant (jours)">
              <input type="number" min={7} max={365} value={s.reengagement_cooldown_days} onInput={(e) => set('reengagement_cooldown_days', Number((e.target as HTMLInputElement).value) || 30)} />
            </Field>
          </div>
        )}
        <Field label="Délai minimum entre deux messages commerciaux à un même client" hint="En heures (protège vos clients des sollicitations répétées).">
          <input type="number" min={0} max={720} value={s.marketing_min_interval_hours} onInput={(e) => set('marketing_min_interval_hours', Number((e.target as HTMLInputElement).value) || 0)} />
        </Field>
        {bar}
      </Panel>

      <Panel title="Carte et scanner">
        <span id="r-carte" class="anchor-t" />
        <Field label="Texte au dos de la carte" hint={`${(s.wallet_back_text ?? '').length} / 1000 · horaires, conditions, adresse…`}>
          <textarea rows={4} maxLength={1000} value={s.wallet_back_text ?? ''} onInput={(e) => set('wallet_back_text', (e.target as HTMLTextAreaElement).value)} />
        </Field>
        <Field label="Délai pour annuler un passage après un scan" hint="En secondes (bouton « Annuler » du scanner).">
          <input type="number" min={0} max={3600} value={s.scan_undo_window_seconds} onInput={(e) => set('scan_undo_window_seconds', Number((e.target as HTMLInputElement).value) || 0)} />
        </Field>
        {bar}
      </Panel>
    </>
  );
}
