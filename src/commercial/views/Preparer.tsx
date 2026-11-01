// « Préparer une carte » (Ewan, 2026-10-30, pour ses rendez-vous en visio) : la carte du commerçant se règle en direct
// (nom, logo, couleurs, passages, récompense), avec l'offre et les QR codes sous verre, puis 2 liens reprennent exactement ce
// qui vient d'être fait : /essai/?carte=<id> (1 mois gratuit, sans carte bancaire, donne Starter) et /panier/?carte=<id> (le
// panier habituel : compte, puis Stripe). Une ancienne fiche (Premium, « periode ») se lit par normalizeOffer().
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {logoToPng, LOGO_ACCEPT} from '../../app/logo-png';
import {qrSvg} from '../../app/util';
import {CARD_ACCENTS, CARD_ACTIVITES, CARD_BGS, ENGAGEMENT, euro, normalizeOffer, PHRASES, PLANS, QR_VERRE, quotas, SETUP_FEE, TRIAL, type Engagement} from '../../data/site';
import {TelephoneWallet} from '../../lib/CarteWallet';
import {lienCarte, lienEssaiCarte, lireCartePreparee} from '../../lib/carte-preparee';
import {cartesPreparees, chargerCartes, couleursDuLogo, enregistrerCarte, montants, preparerPour, supprimerCarte, type Reglages} from '../cartes';
import {phraseMiseEnService} from '../contenu';
import {dateHeure} from '../format';
import {Icon} from '../icons';
import {aller, toast} from '../store';
import {Btn, Copier, Field, PageHead, Panel, Spinner} from '../ui';

const HEX = /^#[0-9a-f]{6}$/i;
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const vide = (): Reglages => {
  const plan = PLANS.find((p) => p.highlight) ?? PLANS[0];
  return {nom: '', activite: '', recompense: '', fond: '#121216', tampons: '#d9b27a', passages: 10, logo: null, offre: plan.id, engagement: 'sans', qr: {unit: 0, pack5: 0, pack10: 0}, prospect: ''};
};
const LIGNES_QR = [
  {cle: 'unit', label: 'À l’unité', prix: QR_VERRE.unit, max: QR_VERRE.maxUnit},
  {cle: 'pack5', label: 'Pack de 5', prix: QR_VERRE.pack5, max: QR_VERRE.maxPack},
  {cle: 'pack10', label: 'Pack de 10', prix: QR_VERRE.pack10, max: QR_VERRE.maxPack},
] as const;
const empreinte = (c: Reglages) => JSON.stringify(c);
// Ce que le formulaire d'essai (src/app/Essai.tsx) garde d'une carte préparée
const ESSAI_PASSAGES = {min: 4, max: 15};
const ESSAI_RECOMPENSE_MAX = 40;

export function Preparer({id}: {id?: string}) {
  const [c, setC] = useState<Reglages>(vide);
  const [enregistree, setEnregistree] = useState<string | null>(null); // état enregistré, pour repérer les modifications
  const [ancienne, setAncienne] = useState<'' | 'premium' | 'periode'>(''); // fiche écrite avant la grille Starter + Pro
  const [chargement, setChargement] = useState(!!id);
  const [touche, setTouche] = useState({recompense: false, fond: false, tampons: false});
  const [couleursLogo, setCouleursLogo] = useState<string[]>([]);
  const [systeme, setSysteme] = useState<'apple' | 'google'>('apple');
  const [obtenus, setObtenus] = useState(3);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');
  const justeCreee = useRef<string | null>(null);

  useEffect(() => {
    if (cartesPreparees.value === null) chargerCartes().catch((e) => setErreur(e.message));
  }, []);

  // Carte déjà préparée (#/preparer/<id>) ou nouvelle carte, éventuellement depuis la fiche d'un prospect
  useEffect(() => {
    if (id && justeCreee.current === id) return; // lien qu'on vient de créer : la carte est déjà à l'écran
    setErreur('');
    setLogoErr('');
    if (!id) {
      const pour = preparerPour.value;
      preparerPour.value = null;
      const base = vide();
      if (pour) {
        base.nom = pour.nom.slice(0, 60);
        base.prospect = pour.id;
      }
      setC(base);
      setEnregistree(null);
      setAncienne('');
      setCouleursLogo([]);
      setTouche({recompense: false, fond: false, tampons: false});
      setChargement(false);
      if (pour?.activite) choisirActivite(pour.activite, base);
      return;
    }
    let actif = true;
    setChargement(true);
    lireCartePreparee(id)
      .then((lue) => {
        if (!actif) return;
        if (!lue) {
          toast('Cette carte n’existe plus.', 'error');
          aller('preparer');
          return;
        }
        const o = normalizeOffer(lue.offre, lue.periode, lue.engagement);
        const {periode: _periode, ...reglages} = lue;
        const d: Reglages = {...vide(), ...reglages, offre: o.plan, engagement: o.engagement, prospect: cartesPreparees.value?.find((x) => x.id === id)?.prospect ?? ''};
        const avantGrille = !lue.engagement; // reste lisible telle quelle ; le bouton de mise à jour la passe au format neuf
        setC(d);
        setAncienne(avantGrille ? (o.legacy ? 'premium' : 'periode') : '');
        setEnregistree(avantGrille ? '' : empreinte(d));
        setTouche({recompense: true, fond: true, tampons: true});
        setObtenus(Math.min(3, d.passages));
        if (d.logo) couleursDuLogo(d.logo).then(setCouleursLogo);
      })
      .catch(() => actif && setErreur('Chargement de la carte impossible.'))
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, [id]);

  const champ = <K extends keyof Reglages>(k: K, v: Reglages[K]) => setC((x) => ({...x, [k]: v}));
  function choisirActivite(activite: string, depart?: Reglages) {
    const a = CARD_ACTIVITES.find((x) => normal(x.nom) === normal(activite));
    setC((x) => {
      const b = depart ?? x;
      if (!a || a.nom === 'Autre') return {...b, activite};
      return {...b, activite, recompense: touche.recompense ? b.recompense : a.recompense, fond: touche.fond ? b.fond : a.fond, tampons: touche.tampons ? b.tampons : a.tampons};
    });
  }
  const choisirLogo = async (f: File | undefined) => {
    if (!f) return;
    setLogoErr('');
    setLogoBusy(true);
    try {
      const png = await logoToPng(f);
      URL.revokeObjectURL(png.url);
      const data = await new Promise<string>((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => ko(new Error('Lecture du logo impossible.'));
        r.readAsDataURL(png.blob);
      });
      champ('logo', data);
      setCouleursLogo(await couleursDuLogo(data));
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : 'Ce logo est illisible.');
    } finally {
      setLogoBusy(false);
    }
  };

  const m = montants(c);
  const total = Math.max(1, Math.trunc(c.passages) || 1);
  const faits = Math.min(obtenus, total);
  const modifiee = enregistree !== null && enregistree !== empreinte(c);
  const origine = location.origin.includes('loyna.fr') ? 'https://loyna.fr' : location.origin;
  const liens = TRIAL.open ? 'les liens' : 'le lien de paiement';
  const probleme = !c.nom.trim() ? 'Indiquez le nom du commerce.' : !c.recompense.trim() ? 'Indiquez la récompense.' : !HEX.test(c.fond) || !HEX.test(c.tampons) ? 'Couleurs attendues au format #RRGGBB.' : total > 100 ? 'Nombre de passages : 100 au plus.' : '';

  const enregistrer = async () => {
    if (probleme) return setErreur(probleme);
    setErreur('');
    setBusy(true);
    try {
      const propre: Reglages = {...c, passages: total, fond: c.fond.toLowerCase(), tampons: c.tampons.toLowerCase(), nom: c.nom.trim(), activite: c.activite.trim(), recompense: c.recompense.trim()};
      const nouvelId = await enregistrerCarte(id ?? null, propre);
      setC(propre);
      setEnregistree(empreinte(propre));
      setAncienne('');
      toast(id ? (TRIAL.open ? 'Liens mis à jour : les mêmes liens montrent la nouvelle version.' : 'Lien mis à jour : le même lien montre la nouvelle version.') : TRIAL.open ? 'Liens prêts.' : 'Lien de paiement prêt.');
      if (!id) {
        justeCreee.current = nouvelId;
        aller(`preparer/${nouvelId}`);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (chargement) return <Spinner label="Ouverture de la carte…" />;

  return (
    <div class="page pc">
      <PageHead eyebrow="Espace commercial · à faire en direct avec le commerçant" title={c.nom.trim() ? `La carte de ${c.nom.trim()}` : 'Préparer une carte'}>
        {id && (
          <Btn kind="ghost" small icon="plus" href="#/preparer">
            Nouvelle carte
          </Btn>
        )}
      </PageHead>

      <div class="pc-grille">
        <div class="pc-form">
          <Panel title="1. Le commerce">
            <div class="form">
              <div class="row2">
                <Field label="Nom du commerce">
                  <input type="text" maxLength={60} value={c.nom} autocomplete="off" onInput={(e) => champ('nom', (e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="Activité" hint="La récompense et les couleurs de ce métier se proposent toutes seules.">
                  <input type="text" maxLength={60} list="pc-activites" value={c.activite} autocomplete="off" onInput={(e) => choisirActivite((e.target as HTMLInputElement).value)} />
                </Field>
              </div>
              <datalist id="pc-activites">
                {CARD_ACTIVITES.filter((a) => a.nom !== 'Autre').map((a) => (
                  <option value={a.nom} />
                ))}
              </datalist>
              <div class="fld">
                <span class="fld-l">Logo</span>
                <div class="pc-logo">
                  <span class="pc-logo-v" style={{background: c.fond}}>
                    {c.logo ? <img src={c.logo} alt="Logo choisi" /> : <Icon name="store" size={24} />}
                  </span>
                  <label class={`b b--ghost b--sm ${logoBusy ? 'is-busy' : ''}`}>
                    <Icon name="upload" size={16} />
                    <span>{c.logo ? 'Changer le logo' : 'Ajouter le logo'}</span>
                    <input
                      type="file"
                      accept={LOGO_ACCEPT}
                      class="sr-only"
                      onChange={(e) => {
                        const input = e.target as HTMLInputElement;
                        choisirLogo(input.files?.[0]).finally(() => (input.value = ''));
                      }}
                    />
                  </label>
                  {c.logo && (
                    <button
                      type="button"
                      class="linkish small"
                      onClick={() => {
                        champ('logo', null);
                        setCouleursLogo([]);
                      }}
                    >
                      Retirer
                    </button>
                  )}
                </div>
                {logoErr ? <span class="fld-err">{logoErr}</span> : <span class="fld-h">PNG, JPG, WEBP ou SVG. Fond transparent conseillé.</span>}
              </div>
            </div>
          </Panel>

          <Panel title="2. La carte">
            <div class="form">
              <div class="row2">
                <Field label="Récompense">
                  <input
                    type="text"
                    maxLength={80}
                    placeholder="Dessert offert, -10 €…"
                    value={c.recompense}
                    onInput={(e) => {
                      setTouche((t) => ({...t, recompense: true}));
                      champ('recompense', (e.target as HTMLInputElement).value);
                    }}
                  />
                </Field>
                <Field label="Passages pour la récompense" hint="Au-delà de 20, la carte affiche une jauge.">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    value={c.passages}
                    onInput={(e) => champ('passages', Math.round(Number((e.target as HTMLInputElement).value) || 0))}
                  />
                </Field>
              </div>
              <Couleurs
                label="Fond de la carte"
                valeur={c.fond}
                pastilles={CARD_BGS}
                logo={couleursLogo}
                changer={(v) => {
                  setTouche((t) => ({...t, fond: true}));
                  champ('fond', v);
                }}
              />
              <Couleurs
                label="Tampons"
                valeur={c.tampons}
                pastilles={CARD_ACCENTS}
                logo={couleursLogo}
                changer={(v) => {
                  setTouche((t) => ({...t, tampons: true}));
                  champ('tampons', v);
                }}
              />
            </div>
          </Panel>

          <Panel title="3. L’offre">
            {ancienne && (
              <p class="pc-note warn">
                {ancienne === 'premium'
                  ? 'Cette carte avait été préparée en Premium, offre qui n’est plus proposée : elle est reprise ici en Starter. Vérifiez l’offre, puis mettez à jour les liens.'
                  : 'Cette carte a été préparée avant les offres actuelles : vérifiez l’offre et l’engagement, puis mettez à jour les liens.'}
              </p>
            )}
            <div class="pc-periode" role="radiogroup" aria-label="Engagement">
              {(['sans', 'engage'] as Engagement[]).map((e) => (
                <button type="button" role="radio" aria-checked={c.engagement === e} class={c.engagement === e ? 'on' : ''} onClick={() => champ('engagement', e)}>
                  {e === 'sans' ? 'Sans engagement' : `Avec ${ENGAGEMENT.months} mois d’engagement, −${ENGAGEMENT.discountPercent} %`}
                </button>
              ))}
            </div>
            <div class="pc-offres" role="radiogroup" aria-label="Offre">
              {PLANS.map((p) => (
                <button type="button" role="radio" aria-checked={c.offre === p.id} class={`pc-offre ${c.offre === p.id ? 'on' : ''}`} onClick={() => champ('offre', p.id)}>
                  <strong>{p.name}</strong>
                  <span class="pc-offre-p">
                    {euro(c.engagement === 'engage' ? p.engaged : p.monthly)} <small>/ mois</small>
                  </span>
                  <small>{quotas(p)}</small>
                </button>
              ))}
            </div>
            <h3 class="pc-t3">QR codes sous verre (option)</h3>
            <div class="pc-qr">
              {LIGNES_QR.map((l) => (
                <div class={c.qr[l.cle] > 0 ? 'on' : ''}>
                  <span>
                    <strong>{l.label}</strong>
                    <small>{euro(l.prix)}</small>
                  </span>
                  <span class="pc-pas">
                    <button type="button" disabled={c.qr[l.cle] <= 0} aria-label={`Retirer : ${l.label}`} onClick={() => champ('qr', {...c.qr, [l.cle]: c.qr[l.cle] - 1})}>
                      −
                    </button>
                    <b aria-live="polite">{c.qr[l.cle]}</b>
                    <button type="button" disabled={c.qr[l.cle] >= l.max} aria-label={`Ajouter : ${l.label}`} onClick={() => champ('qr', {...c.qr, [l.cle]: c.qr[l.cle] + 1})}>
                      +
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={TRIAL.open ? '4. Le récapitulatif et les liens' : '4. Le lien de paiement'}>
            <dl class="pc-recap">
              <div>
                <dt>
                  LOYNA {m.plan.name}
                  <small>{m.engage ? `avec ${ENGAGEMENT.months} mois d’engagement` : 'sans engagement'}</small>
                </dt>
                <dd>{euro(m.abonnement)}</dd>
              </div>
              <div>
                <dt>Mise en service</dt>
                <dd>{m.service ? euro(SETUP_FEE) : <><s>{euro(SETUP_FEE)}</s> offerte</>}</dd>
              </div>
              {m.nbQr > 0 && (
                <div>
                  <dt>{m.nbQr} QR code{m.nbQr > 1 ? 's' : ''} sous verre</dt>
                  <dd>{euro(Math.round(m.qr * 100) / 100)}</dd>
                </div>
              )}
              <div class="pc-total">
                <dt>À payer aujourd’hui</dt>
                <dd>{euro(m.total)}</dd>
              </div>
            </dl>
            <p class="pc-note">
              {PHRASES.prix(m.plan)} {m.engage ? `${PHRASES.engagement} ` : ''}
              {phraseMiseEnService()}
            </p>
            {TRIAL.open && <p class="pc-note">Ce montant est celui du lien de paiement. Le lien d’essai ne demande rien : {TRIAL.label}.</p>}
            {erreur && (
              <p class="form-err" role="alert">
                <Icon name="circle-alert" size={18} />
                {erreur}
              </p>
            )}
            {(!id || modifiee) && (
              <Btn kind="gold" block icon={id ? 'save' : 'link'} busy={busy} onClick={enregistrer}>
                {id ? `Mettre à jour ${liens}` : `Créer ${liens}`}
              </Btn>
            )}
            {id && modifiee && <p class="pc-note warn">Modifications pas encore enregistrées : {TRIAL.open ? 'les liens montrent' : 'le lien montre'} encore l’ancienne version.</p>}
          </Panel>

          {id && !modifiee && <Partage paiement={lienCarte(id, origine)} essai={TRIAL.open ? lienEssaiCarte(id, origine) : null} nom={c.nom.trim()} passages={total} recompense={c.recompense.trim()} />}
        </div>

        <aside class="pc-droite">
          <div class="pc-apercu">
            <div class="pc-sys" role="radiogroup" aria-label="Téléphone de l’aperçu">
              <button type="button" role="radio" aria-checked={systeme === 'apple'} class={systeme === 'apple' ? 'on' : ''} onClick={() => setSysteme('apple')}>
                iPhone
              </button>
              <button type="button" role="radio" aria-checked={systeme === 'google'} class={systeme === 'google' ? 'on' : ''} onClick={() => setSysteme('google')}>
                Android
              </button>
            </div>
            <TelephoneWallet nom={c.nom.trim()} recompense={c.recompense.trim()} activite={c.activite.trim()} fond={HEX.test(c.fond) ? c.fond : '#121216'} tampons={HEX.test(c.tampons) ? c.tampons : '#d9b27a'} passages={total} obtenus={faits} logo={c.logo} systeme={systeme} />
            <label class="pc-faits">
              <span>
                Exemple : {faits} passage{faits > 1 ? 's' : ''} sur {total}
              </span>
              <input type="range" min={0} max={total} value={faits} onInput={(e) => setObtenus(Number((e.target as HTMLInputElement).value))} />
            </label>
          </div>
        </aside>
      </div>

      <ListeCartes active={id} />
    </div>
  );
}

function Couleurs({label, valeur, pastilles, logo, changer}: {label: string; valeur: string; pastilles: {c: string; nom: string}[]; logo: string[]; changer: (v: string) => void}) {
  const v = valeur.toLowerCase();
  return (
    <div class="fld">
      <span class="fld-l">{label}</span>
      <div class="pc-pastilles">
        {logo.map((x) => (
          <button type="button" class={`pc-pastille pc-pastille--logo ${v === x ? 'on' : ''}`} style={{background: x}} title="Couleur du logo" aria-label={`Couleur du logo ${x}`} aria-pressed={v === x} onClick={() => changer(x)} />
        ))}
        {logo.length > 0 && <span class="pc-sep" aria-hidden="true" />}
        {pastilles.map((p) => (
          <button type="button" class={`pc-pastille ${v === p.c.toLowerCase() ? 'on' : ''}`} style={{background: p.c}} title={p.nom} aria-label={p.nom} aria-pressed={v === p.c.toLowerCase()} onClick={() => changer(p.c)} />
        ))}
        <label class="pc-libre" title="Couleur libre">
          <input type="color" value={HEX.test(valeur) ? v : '#000000'} aria-label={`${label} : couleur libre`} onInput={(e) => changer((e.target as HTMLInputElement).value)} />
        </label>
        <input class="pc-hex" type="text" maxLength={7} spellcheck={false} value={valeur} aria-label={`${label} : code couleur`} onInput={(e) => changer((e.target as HTMLInputElement).value.trim())} />
      </div>
    </div>
  );
}

/** Un lien à envoyer : à copier, à ouvrir, ou dans un message tout prêt. */
function LienAEnvoyer({genre, lien, copier, message}: {genre: 'essai' | 'paiement'; lien: string; copier: string; message: string}) {
  return (
    <>
      <p class={`pc-lien pc-lien--${genre}`}>
        <a href={lien} target="_blank" rel="noopener">
          {lien.replace(/^https?:\/\//, '')}
        </a>
      </p>
      <div class="pc-actions">
        <Copier texte={lien} label={copier} small={false} />
        <Btn kind="ghost" icon="external-link" href={lien} external>
          Ouvrir
        </Btn>
      </div>
      <div class="pc-actions">
        <Btn kind="ghost" small icon="message-circle" href={`https://wa.me/?text=${encodeURIComponent(message)}`} external>
          WhatsApp
        </Btn>
        <Btn kind="ghost" small icon="smartphone" href={`sms:?&body=${encodeURIComponent(message)}`}>
          SMS
        </Btn>
        <Copier texte={message} label="Copier le message" />
      </div>
    </>
  );
}

/** Les liens à envoyer pendant le rendez-vous : l'essai et le paiement. Règle provisoire du plan : pendant une visite, le QR
 *  code à l'écran mène à l'essai, pas au paiement. Essai fermé (TRIAL.open) : seul le paiement reste, QR code compris. */
function Partage({paiement, essai, nom, passages, recompense}: {paiement: string; essai: string | null; nom: string; passages: number; recompense: string}) {
  const cible = essai ?? paiement;
  const qr = useMemo(() => qrSvg(cible, '#121216', 2), [cible]);
  const qrCode = (
    <div class={`pc-qr-lien pc-qr-lien--${essai ? 'essai' : 'paiement'}`} aria-label={`QR code du lien ${essai ? 'd’essai' : 'de paiement'} : à scanner depuis l’écran`} dangerouslySetInnerHTML={{__html: qr}} />
  );
  return (
    <Panel title={essai ? 'Les liens à envoyer' : 'Le lien à envoyer'} class="pc-partage">
      {essai && (
        <>
          <h3 class="pc-t3 pc-t3--premier">Essai : {TRIAL.label}</h3>
          <LienAEnvoyer
            genre="essai"
            lien={essai}
            copier="Copier le lien d’essai"
            message={`Bonjour, voici votre carte de fidélité ${nom} telle que nous venons de la préparer. Pour l’essayer, ${TRIAL.label} : ${essai}`}
          />
          {qrCode}
          <p class="pc-note">À scanner depuis l’écran : il mène à l’essai, pas au paiement. Le lien montre sa carte : il crée son compte et confirme son e-mail, puis la carte est créée tout de suite. L’essai donne Starter, quelle que soit l’offre choisie ici ; Pro se prend à tout moment.</p>
          {recompense.length > ESSAI_RECOMPENSE_MAX && (
            <p class="pc-note warn">
              Récompense de {recompense.length} caractères : l’essai en garde {ESSAI_RECOMPENSE_MAX}. Raccourcissez-la si le texte coupé ne convient pas.
            </p>
          )}
          {(passages < ESSAI_PASSAGES.min || passages > ESSAI_PASSAGES.max) && (
            <p class="pc-note warn">
              Cette carte a {passages} passage{passages > 1 ? 's' : ''} : l’essai en accepte de {ESSAI_PASSAGES.min} à {ESSAI_PASSAGES.max}, sa page la reprendra avec {Math.min(ESSAI_PASSAGES.max, Math.max(ESSAI_PASSAGES.min, passages))}.
            </p>
          )}
        </>
      )}
      <h3 class={`pc-t3 ${essai ? '' : 'pc-t3--premier'}`}>Paiement</h3>
      <LienAEnvoyer
        genre="paiement"
        lien={paiement}
        copier="Copier le lien de paiement"
        message={`Bonjour, voici votre carte de fidélité ${nom} telle que nous venons de la préparer, avec le lien pour finaliser votre commande : ${paiement}`}
      />
      {!essai && qrCode}
      <p class="pc-note">{essai ? '' : 'À scanner depuis l’écran partagé. '}Le lien montre sa carte et son offre : il crée son compte puis paie sur Stripe. Si vous modifiez la carte, {essai ? 'les mêmes liens restent valables' : 'le même lien reste valable'}.</p>
    </Panel>
  );
}

function ListeCartes({active}: {active?: string}) {
  const liste = cartesPreparees.value;
  if (!liste?.length) return null;
  const offreDe = (x: (typeof liste)[number]) => {
    const o = normalizeOffer(x.offre, x.periode, x.engagement);
    const nom = PLANS.find((p) => p.id === o.plan)?.name;
    return o.legacy ? `${nom} (ancienne fiche Premium)` : `${nom} ${o.engagement === 'engage' ? 'avec engagement' : 'sans engagement'}`;
  };
  const supprimer = async (id: string, nom: string) => {
    if (!confirm(`Supprimer la carte préparée de ${nom} ?\n${TRIAL.open ? 'Ses liens ne fonctionneront plus.' : 'Son lien ne fonctionnera plus.'}`)) return;
    try {
      await supprimerCarte(id);
      toast('Carte supprimée.');
      if (id === active) aller('preparer');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Suppression impossible.', 'error');
    }
  };
  return (
    <Panel title="Cartes déjà préparées" class="pc-liste">
      <ul>
        {liste.map((x) => (
          <li class={x.id === active ? 'on' : ''}>
            <span class="pc-mini" style={{background: x.fond}}>
              <i style={{background: x.tampons}} />
            </span>
            <a href={`#/preparer/${x.id}`}>
              <strong>{x.nom}</strong>
              <small>
                {offreDe(x)} · {x.passages} passages · {x.recompense} · {dateHeure(x.modifie_le)}
              </small>
            </a>
            <span class="pc-liste-a">
              {TRIAL.open && <Copier texte={lienEssaiCarte(x.id)} label="Essai" />}
              <Copier texte={lienCarte(x.id)} label={TRIAL.open ? 'Paiement' : 'Lien'} />
              <Btn kind="quiet" small icon="trash-2" title={`Supprimer la carte de ${x.nom}`} onClick={() => supprimer(x.id, x.nom)} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
