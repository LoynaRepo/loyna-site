// « Préparer une carte » (Ewan, 2026-10-30, pour ses rendez-vous en visio) : la carte du commerçant se règle en direct
// (nom, logo, couleurs, passages, récompense), avec l'offre et les QR codes sous verre, puis un lien de paiement
// /panier/?carte=<id> reprend exactement ce qui vient d'être fait. Paiement : le panier habituel (compte, puis Stripe).
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {logoToPng, LOGO_ACCEPT} from '../../app/logo-png';
import {qrSvg} from '../../app/util';
import {CARD_ACCENTS, CARD_ACTIVITES, CARD_BGS, euro, LAUNCH_OFFER, offerActive, PLANS, QR_VERRE, quotas, SETUP_FEE, type Periode, type PlanId} from '../../data/site';
import {TelephoneWallet} from '../../lib/CarteWallet';
import {lienCarte, lireCartePreparee, type CartePreparee} from '../../lib/carte-preparee';
import {cartesPreparees, chargerCartes, couleursDuLogo, enregistrerCarte, montants, preparerPour, supprimerCarte} from '../cartes';
import {dateHeure} from '../format';
import {Icon} from '../icons';
import {aller, toast} from '../store';
import {Btn, Copier, Field, PageHead, Panel, Spinner} from '../ui';

const HEX = /^#[0-9a-f]{6}$/i;
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const vide = (): CartePreparee => {
  const plan = PLANS.find((p) => p.highlight) ?? PLANS[0];
  return {nom: '', activite: '', recompense: '', fond: '#121216', tampons: '#d9b27a', passages: 10, logo: null, offre: plan.id as PlanId, periode: 'mensuel', qr: {unit: 0, pack5: 0, pack10: 0}, prospect: ''};
};
const LIGNES_QR = [
  {cle: 'unit', label: 'À l’unité', prix: QR_VERRE.unit, max: QR_VERRE.maxUnit},
  {cle: 'pack5', label: 'Pack de 5', prix: QR_VERRE.pack5, max: QR_VERRE.maxPack},
  {cle: 'pack10', label: 'Pack de 10', prix: QR_VERRE.pack10, max: QR_VERRE.maxPack},
] as const;
const empreinte = (c: CartePreparee) => JSON.stringify(c);

export function Preparer({id}: {id?: string}) {
  const [c, setC] = useState<CartePreparee>(vide);
  const [enregistree, setEnregistree] = useState<string | null>(null); // état enregistré, pour repérer les modifications
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
        const d: CartePreparee = {...vide(), ...lue, prospect: cartesPreparees.value?.find((x) => x.id === id)?.prospect ?? ''};
        setC(d);
        setEnregistree(empreinte(d));
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

  const champ = <K extends keyof CartePreparee>(k: K, v: CartePreparee[K]) => setC((x) => ({...x, [k]: v}));
  function choisirActivite(activite: string, depart?: CartePreparee) {
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
  const lien = id ? lienCarte(id, location.origin.includes('loyna.fr') ? 'https://loyna.fr' : location.origin) : '';
  const probleme = !c.nom.trim() ? 'Indiquez le nom du commerce.' : !c.recompense.trim() ? 'Indiquez la récompense.' : !HEX.test(c.fond) || !HEX.test(c.tampons) ? 'Couleurs attendues au format #RRGGBB.' : total > 100 ? 'Nombre de passages : 100 au plus.' : '';

  const enregistrer = async () => {
    if (probleme) return setErreur(probleme);
    setErreur('');
    setBusy(true);
    try {
      const propre: CartePreparee = {...c, passages: total, fond: c.fond.toLowerCase(), tampons: c.tampons.toLowerCase(), nom: c.nom.trim(), activite: c.activite.trim(), recompense: c.recompense.trim()};
      const nouvelId = await enregistrerCarte(id ?? null, propre);
      setC(propre);
      setEnregistree(empreinte(propre));
      toast(id ? 'Lien mis à jour : le même lien montre la nouvelle version.' : 'Lien de paiement prêt.');
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
            <div class="pc-periode" role="radiogroup" aria-label="Période de facturation">
              {(['mensuel', 'annuel'] as Periode[]).map((p) => (
                <button type="button" role="radio" aria-checked={c.periode === p} class={c.periode === p ? 'on' : ''} onClick={() => champ('periode', p)}>
                  {p === 'mensuel' ? 'Mensuel' : 'Annuel −15 %'}
                </button>
              ))}
            </div>
            <div class="pc-offres" role="radiogroup" aria-label="Offre">
              {PLANS.map((p) => (
                <button type="button" role="radio" aria-checked={c.offre === p.id} class={`pc-offre ${c.offre === p.id ? 'on' : ''}`} onClick={() => champ('offre', p.id as PlanId)}>
                  <strong>{p.name}</strong>
                  <span class="pc-offre-p">
                    {euro(m.mensuel ? p.monthly : p.yearly)} <small>{m.mensuel ? '/ mois' : '/ an'}</small>
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

          <Panel title="4. Le lien de paiement">
            <dl class="pc-recap">
              <div>
                <dt>
                  LOYNA {m.plan.name}
                  <small>{m.mensuel ? 'mensuel, engagement de 12 mois' : 'annuel (−15 %)'}</small>
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
              {m.mensuel
                ? `Puis ${euro(m.plan.monthly)} par mois. Engagement de 12 mois, réglés chaque mois, puis résiliable à la fin de n’importe quel mois, sans frais.`
                : `Puis ${euro(m.plan.yearly)} par an, à chaque échéance, sauf résiliation avant cette date.`}{' '}
              Sans TVA.{m.mensuel && offerActive() ? ` Mise en service offerte jusqu’au ${LAUNCH_OFFER.untilLabel}.` : ''}
            </p>
            {erreur && (
              <p class="form-err" role="alert">
                <Icon name="circle-alert" size={18} />
                {erreur}
              </p>
            )}
            {(!id || modifiee) && (
              <Btn kind="gold" block icon={id ? 'save' : 'link'} busy={busy} onClick={enregistrer}>
                {id ? 'Mettre à jour le lien' : 'Créer le lien de paiement'}
              </Btn>
            )}
            {id && modifiee && <p class="pc-note warn">Modifications pas encore enregistrées : le lien montre encore l’ancienne version.</p>}
          </Panel>

          {id && !modifiee && <Partage lien={lien} nom={c.nom.trim()} />}
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

/** Le lien à envoyer pendant le rendez-vous. */
function Partage({lien, nom}: {lien: string; nom: string}) {
  const message = `Bonjour, voici votre carte de fidélité ${nom} telle que nous venons de la préparer, avec le lien pour finaliser votre commande : ${lien}`;
  const qr = useMemo(() => qrSvg(lien, '#121216', 2), [lien]);
  return (
    <Panel title="Le lien à envoyer" class="pc-partage">
      <p class="pc-lien">
        <a href={lien} target="_blank" rel="noopener">
          {lien.replace(/^https?:\/\//, '')}
        </a>
      </p>
      <div class="pc-actions">
        <Copier texte={lien} label="Copier le lien" small={false} />
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
      <div class="pc-qr-lien" aria-label="QR code du lien : à scanner depuis l’écran partagé" dangerouslySetInnerHTML={{__html: qr}} />
      <p class="pc-note">À scanner depuis l’écran partagé. Le lien montre sa carte et son offre : il crée son compte puis paie sur Stripe. Si vous modifiez la carte, le même lien reste valable.</p>
    </Panel>
  );
}

function ListeCartes({active}: {active?: string}) {
  const liste = cartesPreparees.value;
  if (!liste?.length) return null;
  const supprimer = async (id: string, nom: string) => {
    if (!confirm(`Supprimer la carte préparée de ${nom} ?\nSon lien ne fonctionnera plus.`)) return;
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
                {PLANS.find((p) => p.id === x.offre)?.name} {x.periode} · {x.passages} passages · {x.recompense} · {dateHeure(x.modifie_le)}
              </small>
            </a>
            <Copier texte={lienCarte(x.id)} label="Lien" />
            <Btn kind="quiet" small icon="trash-2" title={`Supprimer la carte de ${x.nom}`} onClick={() => supprimer(x.id, x.nom)} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
