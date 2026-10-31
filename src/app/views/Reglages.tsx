// Réglages : identité du commerce (cartes mises à jour automatiquement), boutique(s) et notification de
// proximité (adresse placée grâce à la Base adresse nationale, table merchant_locations), affiche du
// comptoir avec le QR code d'inscription, formulaire d'inscription, dos de la carte et scanner.
// Les messages automatiques sont dans le menu Automatisations.
import {useEffect, useState} from 'preact/hooks';
import {CARD_BGS} from '../../data/site';
import type {GeoResult} from '../backend';
import {Icon} from '../icons';
import {api, feature, featureLimit, lowestPlanAbove, maxAnyPlan, merchant, staffCtx, toast, toastError} from '../state';
import {Badge, Btn, CardPreview, ErrorBox, Field, LinkBox, LockBadge, Modal, PageHead, Panel, ReadOnlyZone, Segmented, Spinner, Toggle, useBusy, useLoad} from '../ui';
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
  latitude: number | null;
  longitude: number | null;
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
  scan_undo_window_seconds: number;
  proximity_message: string | null;
  proximity_enabled: boolean;
}
interface Shop {
  id?: string;
  label: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  sort_order?: number;
}
interface Program {
  type: 'VISITS' | 'POINTS' | 'SPEND';
  unit_label_plural: string;
  status: string;
}
const TEXT_COLORS = ['#ffffff', '#f8f4ec', '#121216', '#d9b27a'];

export function Reglages() {
  const m = merchant.value!;
  const data = useLoad(async () => {
    const [mer, set, shops, progs] = await Promise.all([
      api.select<Merchant>('merchants', {eq: {id: m.merchant_id}}),
      api.select<Settings>('merchant_settings', {eq: {merchant_id: m.merchant_id}}),
      api.select<Shop>('merchant_locations', {eq: {merchant_id: m.merchant_id}, order: ['sort_order', true]}).catch(() => [] as Shop[]),
      api.select<Program>('loyalty_programs', {eq: {merchant_id: m.merchant_id}}),
    ]);
    return {merchant: mer[0], settings: set[0], shops, program: progs.find((p) => p.status === 'ACTIVE') ?? progs[0] ?? null};
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
        <a href="#/reglages" onClick={jump('r-boutique')}>
          Boutique et proximité
        </a>
        <a href="#/reglages" onClick={jump('r-affiche')}>
          Affiche du comptoir
        </a>
        <a href="#/reglages" onClick={jump('r-inscription')}>
          Inscription
        </a>
        <a href="#/reglages" onClick={jump('r-carte')}>
          Carte et scanner
        </a>
        <a href="#/automatisations" class="anchors-go">
          Messages automatiques →
        </a>
      </nav>
      {/* consultation opérateur : réglages affichés, champs et boutons désactivés (l'affiche reste téléchargeable) */}
      <ReadOnlyZone>
        <Branding initial={data.data.merchant} />
        {data.data.settings && (
          <Boutique
            merchant={data.data.merchant}
            shops={data.data.shops}
            message={data.data.settings.proximity_message}
            enabled={data.data.settings.proximity_enabled !== false}
            program={data.data.program}
          />
        )}
      </ReadOnlyZone>
      <Poster slug={data.data.merchant.slug} name={data.data.merchant.name} />
      <ReadOnlyZone>{data.data.settings && <SettingsForm initial={data.data.settings} />}</ReadOnlyZone>
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
  const pick = (x: Merchant) => ({name: x.name, business_type: x.business_type, logo_url: x.logo_url, primary_color: x.primary_color, secondary_color: x.secondary_color, phone: x.phone, website: x.website});
  const [f, setF] = useState(() => pick(initial));
  const [base, setBase] = useState(() => pick(initial));
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({...x, [k]: v}));
  const ratio = contrast(f.primary_color, f.secondary_color);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  const upload = (file: File | undefined) =>
    file &&
    run(async () => {
      setError('');
      if (file.type !== 'image/png') return setError('Le logo doit être une image PNG (fond transparent conseillé).');
      if (file.size > 2 * 1024 * 1024) return setError('Logo trop lourd : 2 Mo maximum.');
      try {
        const url = await api.uploadPublic('merchant-assets', `${initial.id}/logo.png`, file);
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
          {id: initial.id},
          {
            name: f.name.trim(),
            business_type: f.business_type?.trim() || null,
            logo_url: f.logo_url,
            primary_color: f.primary_color,
            secondary_color: f.secondary_color,
            phone: f.phone?.trim() || null,
            website: f.website?.trim() || null,
          },
        );
        setF(pick(saved));
        setBase(pick(saved));
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
    <Panel title="Votre commerce" sub="Nom, logo et couleurs affichés sur les cartes de vos clients." class="anchor">
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
              <label class={`sw sw--custom ${CARD_BGS.some((c) => c.c === f.primary_color.toLowerCase()) ? '' : 'is-picked'}`} style={{'--pick': f.primary_color} as any} title="Couleur personnalisée">
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
              <label class={`sw sw--custom ${TEXT_COLORS.includes(f.secondary_color.toLowerCase()) ? '' : 'is-picked'}`} style={{'--pick': f.secondary_color} as any} title="Couleur personnalisée">
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
            <Field label="Téléphone">
              <input type="tel" maxLength={30} value={f.phone ?? ''} onInput={(e) => set('phone', (e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Site internet">
              <input type="url" placeholder="https://" value={f.website ?? ''} onInput={(e) => set('website', (e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <p class="fld-h">
            L’adresse se règle dans la section <a href="#/reglages" onClick={jump('r-boutique')}>Boutique et proximité</a>.
          </p>
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

// --- Boutique(s) et notification de proximité ------------------------------------------------------------
const osm = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
const placed = (s: Shop) => s.latitude !== null && s.longitude !== null;
const line = (s: Pick<Shop, 'address' | 'postal_code' | 'city'>) => [s.address, [s.postal_code, s.city].filter(Boolean).join(' ')].filter((x) => x && x.trim()).join(', ');

function Boutique(props: {merchant: Merchant; shops: Shop[]; message: string | null; enabled: boolean; program: Program | null}) {
  const {message, program} = props;
  // Rechargement limité à cette section : les modifications en cours ailleurs dans la page sont gardées
  const [mer, setMer] = useState(props.merchant);
  const [shops, setShops] = useState(props.shops);
  const [enabled, setEnabled] = useState(props.enabled);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [removing, setRemoving] = useState<Shop | null>(null);
  const [busy, run] = useBusy();
  const [switching, runSwitch] = useBusy();
  const limit = featureLimit('locations.max') ?? 1;
  const on = feature('wallet.proximity');
  const placedAny = shops.length > 0 || (mer.latitude !== null && mer.longitude !== null);
  const active = on && enabled && placedAny;

  /** Interrupteur (2026-10-27) : désactivée, les cartes ne portent plus d'adresse ; les boutiques restent enregistrées. */
  const switchProximity = (v: boolean) =>
    runSwitch(async () => {
      try {
        const r = await api.update<Settings>('merchant_settings', {merchant_id: mer.id}, {proximity_enabled: v});
        setEnabled(r.proximity_enabled !== false);
        toast(v ? 'Notification de proximité activée : les cartes de vos clients se mettent à jour.' : 'Notification de proximité désactivée : vos boutiques restent enregistrées.');
      } catch (e) {
        toastError(e);
      }
    });
  const many = limit > 1;
  const refresh = async () => setShops(await api.select<Shop>('merchant_locations', {eq: {merchant_id: mer.id}, order: ['sort_order', true]}));

  /** Boutique n° 1 : adresse du commerce + première ligne de merchant_locations ; les autres : merchant_locations seule. */
  const saveShop = async (index: number | 'new', s: Shop) => {
    const row = {label: s.label.trim().slice(0, 60) || mer.name.slice(0, 60), address: s.address, postal_code: s.postal_code, city: s.city, latitude: s.latitude, longitude: s.longitude};
    const first = index === 0 || (index === 'new' && shops.length === 0);
    if (first) setMer(await api.update<Merchant>('merchants', {id: mer.id}, {address: s.address, postal_code: s.postal_code, city: s.city, latitude: s.latitude, longitude: s.longitude}));
    const existing = typeof index === 'number' ? shops[index] : undefined;
    if (existing?.id) await api.update('merchant_locations', {id: existing.id}, row);
    else await api.insert('merchant_locations', {...row, merchant_id: mer.id, sort_order: shops.length});
    toast(first && enabled ? 'Adresse enregistrée : la notification de proximité est active sur les cartes.' : first ? 'Adresse enregistrée' : 'Boutique enregistrée');
    setEditing(null);
    await refresh().catch(() => {});
  };

  const remove = () =>
    run(async () => {
      if (!removing?.id) return;
      try {
        await api.remove('merchant_locations', {id: removing.id});
        toast('Boutique retirée');
        setRemoving(null);
        await refresh();
      } catch (e) {
        toastError(e);
      }
    });

  return (
    <Panel title="Votre boutique et la notification de proximité" sub="Quand un client passe près de votre boutique, sa carte s’affiche sur l’écran de verrouillage de son téléphone, avec un court message.">
      <span id="r-boutique" class="anchor-t" />
      {on && (
        <Toggle
          checked={enabled}
          disabled={switching}
          onChange={switchProximity}
          label="Notification de proximité"
          hint={enabled ? 'Activée : la carte s’affiche quand un client passe près de votre boutique.' : 'Désactivée : vos boutiques restent enregistrées, la carte ne s’affiche plus près de la boutique.'}
        />
      )}
      <div class="prox-state">
        {!on ? (
          <LockBadge feature="wallet.proximity" />
        ) : !enabled ? (
          <Badge tone="neutral">
            <Icon name="map-pin" size={14} /> Notification de proximité désactivée
          </Badge>
        ) : active ? (
          <Badge tone="green">
            <Icon name="map-pin-check" size={14} /> Notification de proximité active
          </Badge>
        ) : (
          <Badge tone="amber">
            <Icon name="map-pin" size={14} /> Adresse à placer
          </Badge>
        )}
        <span class="muted small">
          {!on || !enabled
            ? placedAny
              ? `${shops.length > 1 ? `${shops.length} boutiques enregistrées` : 'Boutique enregistrée'}.`
              : 'Saisissez l’adresse de la boutique : LOYNA la place sur les cartes de vos clients.'
            : active
              ? `${shops.length > 1 ? `${shops.length} boutiques placées` : 'Boutique placée'} sur les cartes de vos clients${many ? ` (${limit} au plus avec votre offre)` : ''}.`
              : 'Saisissez l’adresse de la boutique : LOYNA la place sur les cartes de vos clients.'}
        </span>
      </div>

      {shops.length === 0 ? (
        <AddressEditor
          shop={{label: mer.name.slice(0, 60), address: mer.address, postal_code: mer.postal_code, city: mer.city, latitude: mer.latitude, longitude: mer.longitude}}
          withLabel={many}
          onSave={(s) => saveShop('new', s)}
        />
      ) : (
        <ul class="shops">
          {shops.map((s, i) =>
            editing === i ? (
              <li class="shop shop--edit">
                <AddressEditor shop={s} withLabel={many} onSave={(x) => saveShop(i, x)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li class="shop">
                <span class="shop-i">
                  <Icon name={placed(s) ? 'map-pin-check' : 'map-pin'} />
                </span>
                <span class="shop-t">
                  <strong>
                    {many ? s.label : 'Adresse de la boutique'}
                    {many && i === 0 && <small> · boutique principale</small>}
                  </strong>
                  <span>{line(s) || 'Adresse non renseignée'}</span>
                  {placed(s) && (
                    <a href={osm(s.latitude!, s.longitude!)} target="_blank" rel="noopener" class="small">
                      Vérifier sur la carte
                    </a>
                  )}
                </span>
                <span class="shop-a">
                  <Btn kind="ghost" small icon="pencil" onClick={() => setEditing(i)}>
                    Modifier
                  </Btn>
                  {i > 0 && <Btn kind="quiet" small icon="trash-2" title={`Retirer ${s.label}`} onClick={() => setRemoving(s)} />}
                </span>
              </li>
            ),
          )}
          {editing === 'new' && (
            <li class="shop shop--edit">
              <AddressEditor shop={{label: '', address: '', postal_code: '', city: mer.city, latitude: null, longitude: null}} withLabel onSave={(x) => saveShop('new', x)} onCancel={() => setEditing(null)} />
            </li>
          )}
        </ul>
      )}
      {shops.length > 0 && editing === null && (
        <div class="btn-row">
          {shops.length < limit ? (
            <Btn kind="ghost" small icon="plus" onClick={() => setEditing('new')}>
              Ajouter une boutique ({shops.length} / {limit})
            </Btn>
          ) : !many ? (
            <p class="muted small shops-more">
              {lowestPlanAbove('locations.max', 1) ? (
                <span class="bdg bdg--lock">
                  <Icon name="lock" size={13} />
                  Inclus dans {lowestPlanAbove('locations.max', 1)}
                </span>
              ) : null}{' '}
              Plusieurs adresses ? Avec {lowestPlanAbove('locations.max', 1) || 'l’offre supérieure'} : jusqu’à {maxAnyPlan('locations.max') ?? 3} boutiques, chacune avec sa notification de proximité.
            </p>
          ) : (
            <p class="muted small">Votre offre inclut {limit} boutiques au plus.</p>
          )}
        </div>
      )}

      <ProximityMessage initial={message} program={program} />

      <p class="note prox-privacy">
        <Icon name="shield-check" size={18} />
        <span>
          LOYNA ne reçoit jamais la position de vos clients : c’est leur téléphone qui détecte qu’il est près de la boutique. La carte s’affiche si le client a activé la localisation et autorisé Wallet sur l’écran
          verrouillé : elle n’apparaît donc pas forcément à chaque passage.
        </span>
      </p>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Retirer cette boutique ?"
        footer={
          <>
            <Btn kind="ghost" onClick={() => setRemoving(null)}>
              Annuler
            </Btn>
            <Btn kind="danger" icon="trash-2" busy={busy} onClick={remove}>
              Retirer
            </Btn>
          </>
        }
      >
        <p>
          « {removing?.label} » ne déclenchera plus la notification de proximité. Les cartes de vos clients se mettent à jour ; vous pourrez l’ajouter de nouveau.
        </p>
      </Modal>
    </Panel>
  );
}

/** Saisie d'une adresse : recherche dans la Base adresse nationale, choix parmi les résultats, ou position saisie à la main. */
function AddressEditor({shop, withLabel, onSave, onCancel}: {shop: Shop; withLabel: boolean; onSave: (s: Shop) => Promise<void>; onCancel?: () => void}) {
  const [s, setS] = useState<Shop>(shop);
  const [q, setQ] = useState(() => line(shop));
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState(shop.latitude === null ? '' : String(shop.latitude));
  const [lon, setLon] = useState(shop.longitude === null ? '' : String(shop.longitude));
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, run] = useBusy();

  const search = async () => {
    setError('');
    if (q.trim().length < 3) return setError('Saisissez le numéro, la rue et la ville de la boutique.');
    setSearching(true);
    try {
      const r = await api.geocode(q);
      setResults(r);
      if (r.length === 1) choose(r[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recherche impossible.');
      setManual(true);
    } finally {
      setSearching(false);
    }
  };
  const choose = (r: GeoResult) => {
    setS((x) => ({...x, address: r.address, postal_code: r.postal_code, city: r.city, latitude: r.latitude, longitude: r.longitude}));
    setLat(String(r.latitude));
    setLon(String(r.longitude));
  };
  // « 43.6108, 3.8767 » collé dans le champ latitude : les deux valeurs sont réparties
  const onLat = (v: string) => {
    const two = v.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (two && v.includes(' ')) {
      setLat(two[1].replace(',', '.'));
      setLon(two[2].replace(',', '.'));
    } else setLat(v);
  };
  const toNum = (v: string) => (v.trim() === '' ? NaN : Number(v.trim().replace(',', '.')));

  const save = () =>
    run(async () => {
      setError('');
      const la = toNum(lat);
      const lo = toNum(lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return setError('Choisissez une adresse dans la liste, ou saisissez la latitude et la longitude de la boutique.');
      if (la < -90 || la > 90 || lo < -180 || lo > 180) return setError('Latitude entre -90 et 90, longitude entre -180 et 180.');
      if (withLabel && !s.label.trim()) return setError('Donnez un nom à la boutique (par exemple le quartier).');
      try {
        await onSave({...s, address: s.address?.trim() || null, postal_code: s.postal_code?.trim() || null, city: s.city?.trim() || null, latitude: la, longitude: lo});
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
      }
    });

  const la = toNum(lat);
  const lo = toNum(lon);
  return (
    <div class="geo form">
      {withLabel && (
        <Field label="Nom de la boutique" hint="Affiché au dos de la carte quand vous avez plusieurs boutiques.">
          <input type="text" maxLength={60} value={s.label} onInput={(e) => setS((x) => ({...x, label: (e.target as HTMLInputElement).value}))} />
        </Field>
      )}
      <div class="fld">
        <label class="fld-l" for="geo-q">
          Adresse de la boutique
        </label>
        <div class="geo-q">
          <input
            id="geo-q"
            type="search"
            autoComplete="street-address"
            placeholder="12 rue de la République, Montpellier"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search();
              }
            }}
          />
          <Btn kind="primary" icon="search" busy={searching} onClick={search}>
            Chercher
          </Btn>
        </div>
        <span class="fld-h">Numéro, rue et ville, puis choisissez la bonne adresse dans la liste (Base adresse nationale).</span>
      </div>
      {results &&
        (results.length ? (
          <ul class="geo-r" role="listbox" aria-label="Adresses trouvées">
            {results.map((r) => {
              const on = s.latitude === r.latitude && s.longitude === r.longitude;
              return (
                <li>
                  <button type="button" role="option" aria-selected={on} class={on ? 'on' : ''} onClick={() => choose(r)}>
                    <Icon name={on ? 'circle-check' : 'map-pin'} size={18} />
                    <span>
                      <strong>{r.label}</strong>
                      <small>{Math.round(r.score * 100)} % de correspondance</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p class="muted small">Aucune adresse trouvée : vérifiez la saisie, ou placez la boutique à la main ci-dessous.</p>
        ))}
      {results && api.demo && <p class="muted small">Démonstration : suggestions fictives, aucune adresse n’est envoyée.</p>}
      {Number.isFinite(la) && Number.isFinite(lo) && (
        <p class="geo-pos">
          <Icon name="map-pin-check" size={18} />
          <span>
            {line(s) || 'Position saisie à la main'} ·{' '}
            <a href={osm(la, lo)} target="_blank" rel="noopener">
              vérifier sur la carte
            </a>
          </span>
        </p>
      )}
      <details class="help" open={manual} onToggle={(e) => setManual((e.target as HTMLDetailsElement).open)}>
        <summary>Adresse introuvable ? Placer la boutique à la main</summary>
        <div class="form">
          <div class="row2">
            <Field label="Adresse">
              <input type="text" maxLength={200} value={s.address ?? ''} onInput={(e) => setS((x) => ({...x, address: (e.target as HTMLInputElement).value}))} />
            </Field>
            <div class="row2 row2--tight">
              <Field label="Code postal">
                <input type="text" maxLength={20} value={s.postal_code ?? ''} onInput={(e) => setS((x) => ({...x, postal_code: (e.target as HTMLInputElement).value}))} />
              </Field>
              <Field label="Ville">
                <input type="text" maxLength={100} value={s.city ?? ''} onInput={(e) => setS((x) => ({...x, city: (e.target as HTMLInputElement).value}))} />
              </Field>
            </div>
          </div>
          <div class="row2">
            <Field label="Latitude" hint="Exemple : 43.6108">
              <input type="text" inputMode="decimal" value={lat} onInput={(e) => onLat((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Longitude" hint="Exemple : 3.8767">
              <input type="text" inputMode="decimal" value={lon} onInput={(e) => setLon((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <p class="fld-h">Dans Google Maps sur ordinateur, faites un clic droit sur votre boutique : la première ligne du menu donne la latitude et la longitude. Cliquez dessus pour les copier, puis collez-les dans le champ Latitude.</p>
        </div>
      </details>
      {error && (
        <p class="form-err" role="alert">
          {error}
        </p>
      )}
      <div class="btn-row">
        <Btn kind="gold" icon="check" busy={busy} onClick={save}>
          Enregistrer l’adresse
        </Btn>
        {onCancel && (
          <Btn kind="ghost" onClick={onCancel}>
            Annuler
          </Btn>
        )}
      </div>
    </div>
  );
}

/** Message de l'écran verrouillé : même règle que le serveur (proximityText, carte Wallet). */
function ProximityMessage({initial, program}: {initial: string | null; program: Program | null}) {
  const m = merchant.value!;
  const [v, setV] = useState(initial ?? '');
  const [base, setBase] = useState(initial ?? '');
  const [state, setState] = useState<'reward' | 'near' | 'other'>('other');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  useEffect(() => {
    setV(initial ?? '');
    setBase(initial ?? '');
  }, [initial]);
  const spend = program?.type === 'SPEND';
  const unit = program?.unit_label_plural ?? 'passages';
  const text =
    state === 'reward'
      ? `Votre récompense vous attend chez ${m.merchant_name} !`
      : state === 'near' && !spend
        ? `Plus que 2 ${unit} avant votre récompense chez ${m.merchant_name} !`
        : v.trim() || `Vous passez près de ${m.merchant_name} : votre carte est prête.`;
  const now = new Date();

  const save = () =>
    run(async () => {
      setError('');
      try {
        const r = await api.update<Settings>('merchant_settings', {merchant_id: m.merchant_id}, {proximity_message: v.trim() || null});
        setV(r.proximity_message ?? '');
        setBase(r.proximity_message ?? '');
        toast('Message enregistré : les cartes de vos clients se mettent à jour.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
      }
    });

  return (
    <div class="prox-msg">
      <div class="form">
        <Field label="Votre message de proximité (facultatif)" hint={`${v.trim().length} / 90 · vide : « Vous passez près de ${m.merchant_name} : votre carte est prête. »`}>
          <input type="text" maxLength={90} placeholder="Envie d’une pause ? Votre carte est prête." value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} />
        </Field>
        <p class="fld-h">Le message suit la carte du client : s’il a une récompense à utiliser, ou s’il ne lui manque qu’un ou deux {unit}, la carte le lui dit à la place de votre message.</p>
        {error && (
          <p class="form-err" role="alert">
            {error}
          </p>
        )}
        <div class="btn-row">
          <Btn kind="gold" small icon="check" busy={busy} disabled={v.trim() === base.trim()} onClick={save}>
            Enregistrer le message
          </Btn>
        </div>
      </div>
      <div class="lock">
        <div class="lock-screen" style={{'--m-bg': m.primary_color, '--m-fg': m.secondary_color} as any}>
          <span class="lock-time">{now.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}</span>
          <span class="lock-date">{now.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})}</span>
          <div class="lock-card">
            <span class="notif-app" style={{background: m.primary_color, color: m.secondary_color}}>
              {m.logo_url ? <img src={m.logo_url} alt="" /> : m.merchant_name.slice(0, 1)}
            </span>
            <span class="notif-t">
              <strong>{m.merchant_name}</strong>
              <span>{text}</span>
            </span>
          </div>
        </div>
        <Segmented
          label="Situation du client"
          value={state}
          onChange={setState}
          options={[
            {value: 'reward', label: 'Récompense prête'},
            ...(spend ? [] : [{value: 'near' as const, label: `À 2 ${unit}`}]),
            {value: 'other', label: 'Autres jours'},
          ]}
        />
        <p class="muted small">Aperçu de l’écran verrouillé, près de la boutique.</p>
      </div>
    </div>
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
  const pick = (x: Settings) => ({
    enrollment_collect_last_name: x.enrollment_collect_last_name,
    enrollment_collect_phone: x.enrollment_collect_phone,
    enrollment_require_phone: x.enrollment_require_phone,
    enrollment_collect_email: x.enrollment_collect_email,
    enrollment_collect_birthday: x.enrollment_collect_birthday,
    terms_url: x.terms_url,
    privacy_url: x.privacy_url,
    wallet_back_text: x.wallet_back_text,
    scan_undo_window_seconds: x.scan_undo_window_seconds,
  });
  const [s, setS] = useState(() => pick(initial));
  const [saved, setSaved] = useState(() => pick(initial));
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  useEffect(() => {
    setS(pick(initial));
    setSaved(pick(initial));
  }, [initial]);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({...x, [k]: v}));
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  const save = () =>
    run(async () => {
      setError('');
      for (const k of ['terms_url', 'privacy_url'] as const) if (s[k] && !/^https:\/\//.test(s[k]!)) return setError('Les liens des conditions doivent commencer par https://');
      try {
        const r = await api.update<Settings>(
          'merchant_settings',
          {merchant_id: m.merchant_id},
          {
            ...s,
            enrollment_require_phone: s.enrollment_collect_phone && s.enrollment_require_phone,
            terms_url: s.terms_url?.trim() || null,
            privacy_url: s.privacy_url?.trim() || null,
            wallet_back_text: s.wallet_back_text?.trim() || null,
          },
        );
        setS(pick(r));
        setSaved(pick(r));
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
          <Toggle checked={s.enrollment_collect_phone} onChange={(v) => set('enrollment_collect_phone', v)} label="Téléphone" hint="Pour retrouver un client et éviter les doublons." />
          {s.enrollment_collect_phone && <Toggle checked={s.enrollment_require_phone} onChange={(v) => set('enrollment_require_phone', v)} label="Téléphone obligatoire" />}
          <Toggle checked={s.enrollment_collect_email} onChange={(v) => set('enrollment_collect_email', v)} label="E-mail" />
          <Toggle checked={s.enrollment_collect_birthday} onChange={(v) => set('enrollment_collect_birthday', v)} label="Date d’anniversaire" hint="Pour le message d’anniversaire (menu Automatisations)." />
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

      <Panel title="Carte et scanner">
        <span id="r-carte" class="anchor-t" />
        <Field label="Texte au dos de la carte" hint={`${(s.wallet_back_text ?? '').length} / 1000 · horaires, conditions, adresse…`}>
          <textarea rows={4} maxLength={1000} value={s.wallet_back_text ?? ''} onInput={(e) => set('wallet_back_text', (e.target as HTMLTextAreaElement).value)} />
        </Field>
        <Field label="Délai pour annuler un passage après un scan" hint="En secondes (bouton « Annuler » du scanner).">
          <input type="number" min={0} max={3600} value={s.scan_undo_window_seconds} onInput={(e) => set('scan_undo_window_seconds', Number((e.target as HTMLInputElement).value) || 0)} />
        </Field>
        <p class="note">
          Notification après chaque passage, anniversaire, relances, avis Google… : tout se règle dans le menu <a href="#/automatisations">Automatisations</a>.
        </p>
        {bar}
      </Panel>
    </>
  );
}
