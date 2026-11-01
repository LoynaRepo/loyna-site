// Mail perso après un appel (demande d'Ewan du 2026-10-27) : bouton « Envoyer mail perso » de la fiche, compositeur
// (récapitulatif de l'appel, offre évoquée, prochaine étape, visuel de la carte aux couleurs de l'activité, signataire,
// aperçu du mail complet) et état de l'envoi. « Envoyer » enregistre une note chiffrée « [MAIL] {json} » ; le coffre
// construit le vrai mail avec son modèle et l'envoie (_systeme/mail_perso.py, au plus 10 minutes plus tard).
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {ACTIVITES_VISUEL, PLANS} from '../../data/site';
import {dateHeure, fr, moment} from '../format';
import {Icon} from '../icons';
import {annulerMail, ErreurNotes, mailsDe, noterMail, notesEtat} from '../notes';
import {nouvelId} from '../notes-crypto';
import {
  avecActivite,
  boutonVisible,
  construireMail,
  demandeInitiale,
  LIGNES_MAX,
  lignesRecap,
  lireNoteMail,
  objetParDefaut,
  paramsVisuel,
  probleme,
  texteNoteMail,
  texteOffre,
  type DemandeMail,
  type Offre,
} from '../mail-perso';
import {donnees, toast} from '../store';
import type {EtatMailPerso, Prospect} from '../types';
import {Badge, Btn, Field, Modal, Panel} from '../ui';

export {boutonVisible};

// Prénom de celui qui signe : mémorisé dans ce navigateur (un autre commercial utilise peut-être le panel)
const CLE_SIGNATAIRE = 'loyna-commercial-signataire';
function signataireMemorise(): string {
  try {
    return localStorage.getItem(CLE_SIGNATAIRE) || 'Ewan';
  } catch {
    return 'Ewan';
  }
}
function memoriserSignataire(s: string) {
  try {
    localStorage.setItem(CLE_SIGNATAIRE, s);
  } catch {
    /* stockage indisponible : « Ewan » la prochaine fois */
  }
}
const message = (e: unknown) => (e instanceof ErreurNotes ? e.message : 'Enregistrement impossible.');

/** Bouton de l'en-tête de la fiche (le compositeur est rendu à part : hors du bandeau sombre, voir FenetreMailPerso). */
export function BoutonMailPerso({ouvrir}: {ouvrir: () => void}) {
  const etat = notesEtat.value;
  const pret = etat.etat === 'pret'; // la demande est une note : notes chargées et modifiables
  return (
    <Btn
      kind="ghost"
      icon="send"
      class="cp-btn-clair"
      busy={etat.etat === 'chargement'}
      disabled={!pret}
      title={pret ? 'Récap de l’appel, offre, visuel de sa carte : le mail part du coffre' : fr(`Indisponible pour l’instant : ${etat.message || 'notes non chargées'}`)}
      onClick={ouvrir}
    >
      Envoyer mail perso
    </Btn>
  );
}

/** Fenêtre du compositeur. */
export function FenetreMailPerso({p, ouvert, fermer}: {p: Prospect; ouvert: boolean; fermer: () => void}) {
  return (
    <Modal open={ouvert} onClose={fermer} title={`Mail perso · ${p.nom}`} class="mp-mdl">
      {ouvert && <Compositeur p={p} fermer={fermer} />}
    </Modal>
  );
}

function Compositeur({p, fermer}: {p: Prospect; fermer: () => void}) {
  const modele = donnees.value?.ressources.mail_perso ?? null;
  const [d, setD] = useState<DemandeMail>(() => ({...demandeInitiale(p, signataireMemorise()), objet: objetParDefaut(modele, p.nom)}));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [essaye, setEssaye] = useState(false);
  const enAttente = useRef<string | null>(null); // même identifiant de note en cas de nouvel essai : jamais deux mails
  const champ = <K extends keyof DemandeMail>(k: K, v: DemandeMail[K]) => setD((x) => ({...x, [k]: v}));
  const lignes = lignesRecap(d.recap).length;
  const pb = probleme(d);
  const mail = useMemo(() => (modele ? construireMail(modele, p.nom, d) : null), [modele, p.nom, d]);
  const visuel = paramsVisuel(p.nom, p.ville, d);

  const envoyer = async () => {
    setEssaye(true);
    if (pb || envoi) return;
    const demande: DemandeMail = {...d, to: d.to.trim(), signataire: d.signataire.trim()};
    setEnvoi(true);
    setErreur('');
    try {
      enAttente.current ??= nouvelId();
      await noterMail(p.id, texteNoteMail(demande), enAttente.current);
      memoriserSignataire(demande.signataire);
      toast('Mail perso enregistré : il part du coffre dans les 10 minutes si l’ordinateur est allumé.');
      fermer();
    } catch (e) {
      setErreur(message(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div class="mp-grille">
      <form
        class="mp-form"
        noValidate /* contrôles du panel (probleme()) : un message clair plutôt que la bulle du navigateur */
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
      >
        <Field label="À" hint={d.to.trim() !== (p.email || '') ? 'Adresse différente de la fiche : elle sera notée dans l’historique.' : undefined}>
          <input type="email" value={d.to} maxLength={200} autoComplete="off" onInput={(e) => champ('to', (e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Objet">
          <input type="text" value={d.objet} maxLength={150} onInput={(e) => champ('objet', (e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Prénom de l’interlocuteur" hint={d.prenom.trim() ? undefined : 'Vide : « Bonjour, »'}>
          <input type="text" value={d.prenom} maxLength={40} autoComplete="off" onInput={(e) => champ('prenom', (e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Récap de l’appel" hint={`Une puce par ligne, reprise telle quelle : ${lignes} / ${LIGNES_MAX} lignes.`} class={essaye && (!lignes || lignes > LIGNES_MAX) ? 'has-err' : ''}>
          <textarea
            rows={4}
            maxLength={2500}
            required
            placeholder={'Vous avez déjà une carte papier\nVous voulez relancer les clients inactifs\nDémarrage avant les fêtes'}
            value={d.recap}
            onInput={(e) => champ('recap', (e.target as HTMLTextAreaElement).value)}
          />
        </Field>
        <Field label="Offre évoquée (facultatif)">
          <select value={d.offre} onChange={(e) => champ('offre', (e.target as HTMLSelectElement).value as Offre)}>
            <option value="">Aucune</option>
            {PLANS.map((o) => (
              <option value={o.id}>{texteOffre(o.id)}</option>
            ))}
          </select>
        </Field>
        <Field label="Prochaine étape (facultatif)">
          <input type="text" value={d.etape} maxLength={200} placeholder="je vous rappelle jeudi" onInput={(e) => champ('etape', (e.target as HTMLInputElement).value)} />
        </Field>
        <fieldset class="mp-visuel-reglages">
          <legend>Visuel de la carte</legend>
          <Field label="Activité">
            <select value={d.activite} onChange={(e) => setD((x) => avecActivite(x, (e.target as HTMLSelectElement).value))}>
              {ACTIVITES_VISUEL.map((a) => (
                <option value={a}>{a}</option>
              ))}
            </select>
          </Field>
          <div class="mp-couleurs">
            <label class="mp-couleur">
              <span>Carte</span>
              <input type="color" value={d.fond} onInput={(e) => champ('fond', (e.target as HTMLInputElement).value)} />
            </label>
            <label class="mp-couleur">
              <span>Tampons</span>
              <input type="color" value={d.tampons} onInput={(e) => champ('tampons', (e.target as HTMLInputElement).value)} />
            </label>
            <Btn kind="quiet" small icon="undo-2" onClick={() => setD((x) => avecActivite(x, x.activite))} title="Couleurs et récompense de l’activité">
              Couleurs de l’activité
            </Btn>
          </div>
        </fieldset>
        <Field label="Signataire" hint="Prénom en bas du mail et dans l’expéditeur ; mémorisé dans ce navigateur.">
          <input type="text" value={d.signataire} maxLength={40} onInput={(e) => champ('signataire', (e.target as HTMLInputElement).value)} />
        </Field>
        {(erreur || (essaye && pb)) && (
          <p class="cp-notes-err" role="alert">
            <Icon name="circle-alert" size={18} />
            <span>{erreur ? <><strong>Demande non enregistrée.</strong> {fr(erreur)} Votre texte est conservé.</> : fr(pb)}</span>
          </p>
        )}
        <div class="btn-row">
          <Btn type="submit" kind="gold" icon="send" busy={envoi}>
            Envoyer
          </Btn>
          <Btn kind="ghost" onClick={fermer} disabled={envoi}>
            Annuler
          </Btn>
        </div>
        <p class="muted small cp-m0">
          Le mail part du coffre dans les 10 minutes (ordinateur allumé), par loyna_mail.py : liste STOP et prospects archivés exclus. Son texte est celui
          de l’aperçu, rempli par le coffre avec le modèle « Mail perso après appel ».
        </p>
      </form>

      <section class="mp-apercu" aria-label="Aperçu du mail">
        <div class="mp-entete">
          <span>
            <b>De :</b> {`${d.signataire.trim() || 'Ewan'} – Loyna`} &lt;contact@loyna.fr&gt;
          </span>
          <span>
            <b>À :</b> {d.to.trim() || '—'}
          </span>
          <span>
            <b>Objet :</b> {mail?.objet || d.objet}
          </span>
        </div>
        {mail ? <CorpsMail html={mail.html} visuel={visuel} /> : <SansModele visuel={visuel} />}
      </section>
    </div>
  );
}

const RE_IMAGE = /<div>\s*<img\b[^>]*cid:visuel[^>]*>\s*<\/div>/i;

/** Corps du mail : le HTML du modèle, avec l'aperçu en direct du visuel à la place de l'image en ligne. */
function CorpsMail({html, visuel}: {html: string; visuel: string}) {
  const [avant, apres] = RE_IMAGE.test(html) ? html.split(RE_IMAGE) : [html, ''];
  return (
    <div class="mp-corps">
      <div dangerouslySetInnerHTML={{__html: avant}} />
      <Visuel params={visuel} />
      <div dangerouslySetInnerHTML={{__html: apres}} />
      <p class="mp-signature-img">+ image de signature LOYNA</p>
    </div>
  );
}

function SansModele({visuel}: {visuel: string}) {
  return (
    <div class="mp-corps">
      <p class="cp-notes-info" role="status">
        <Icon name="info" size={18} />
        <span>Aperçu du texte indisponible : les données du panel datent d’avant le mail perso. Le mail sera tout de même construit par le coffre avec son modèle.</span>
      </p>
      <Visuel params={visuel} />
    </div>
  );
}

/** Page /visuel-carte/ (1200 × 630) dans une iframe à l'échelle ; les réglages lui sont envoyés sans la recharger. */
function Visuel({params}: {params: string}) {
  const boite = useRef<HTMLDivElement>(null);
  const cadre = useRef<HTMLIFrameElement>(null);
  const dernier = useRef(params);
  const [src] = useState(`/visuel-carte/?${params}`);
  const [k, setK] = useState(0.45);
  dernier.current = params;
  const pousser = () => cadre.current?.contentWindow?.postMessage({type: 'loyna-visuel', params: dernier.current}, location.origin);
  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(el.clientWidth / 1200));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(pousser, [params]);
  return (
    <div class="mp-visuel" ref={boite} style={{height: `${Math.round(630 * k)}px`}}>
      <iframe ref={cadre} src={src} title="Aperçu du visuel de la carte" tabIndex={-1} loading="eager" onLoad={pousser} style={{transform: `scale(${k})`}} />
    </div>
  );
}

/** Demandes en attente (notes pas encore traitées par le coffre) et mails déjà traités, pour la fiche. */
function suiviMails(p: Prospect) {
  const traites = p.mails_perso ?? [];
  const attente = mailsDe(p.id).filter((n) => !traites.some((e) => e.note === n.id));
  return {attente, traites};
}

/** Panneau de la fiche : état des mails perso (rien s'il n'y en a aucun). */
export function EtatMailPerso({p}: {p: Prospect}) {
  notesEtat.value; // nouveau rendu quand les notes changent
  const {attente, traites} = suiviMails(p);
  const [envoi, setEnvoi] = useState('');
  const [erreur, setErreur] = useState('');
  if (!attente.length && !traites.length) return null;
  const annuler = async (n: (typeof attente)[number]) => {
    setEnvoi(n.id);
    setErreur('');
    try {
      await annulerMail(p.id, n);
      toast('Mail perso annulé : il ne partira pas.');
    } catch (e) {
      setErreur(message(e));
    } finally {
      setEnvoi('');
    }
  };
  return (
    <Panel title="Mail perso après l’appel" sub="Envoyé par le coffre (loyna_mail.py) : le dernier en premier.">
      <ul class="mp-etats">
        {attente.map((n) => {
          const dm = lireNoteMail(n);
          return (
            <li>
              <Badge tone="amber">En attente</Badge>
              <span>
                Mail perso en attente d’envoi (part dans les 10 minutes si l’ordinateur est allumé)
                <small>
                  demandé le {moment(n.cree_le)}
                  {dm?.to && ` · à ${dm.to}`}
                  {dm?.objet && ` · « ${dm.objet} »`}
                </small>
              </span>
              <Btn kind="ghost" small icon="x" busy={envoi === n.id} disabled={notesEtat.value.etat !== 'pret'} onClick={() => annuler(n)}>
                Annuler l’envoi
              </Btn>
            </li>
          );
        })}
        {traites.slice(0, 5).map((e) => (
          <LigneTraitee e={e} />
        ))}
      </ul>
      {erreur && (
        <p class="cp-notes-err" role="alert">
          <Icon name="circle-alert" size={18} />
          <span>{fr(erreur)}</span>
        </p>
      )}
    </Panel>
  );
}

function LigneTraitee({e}: {e: EtatMailPerso}) {
  const detail = [e.to && `à ${e.to}`, e.objet && `« ${e.objet} »`, e.signataire && `signé ${e.signataire}`].filter(Boolean).join(' · ');
  if (e.etat === 'envoyé')
    return (
      <li>
        <Badge tone="green">Envoyé</Badge>
        <span>
          Mail perso envoyé le {dateHeure(e.le)}
          {detail && <small>{detail}</small>}
        </span>
      </li>
    );
  if (e.etat === 'erreur')
    return (
      <li>
        <Badge tone="red">Non envoyé</Badge>
        <span>
          {fr(`Mail perso non envoyé : ${e.raison || 'raison inconnue'}`)}
          <small>{`le ${dateHeure(e.le)}${detail ? ` · ${detail}` : ''} · pour réessayer : corriger, puis cliquer de nouveau sur « Envoyer mail perso »`}</small>
        </span>
      </li>
    );
  return (
    <li>
      <Badge tone="amber">Envoi en cours</Badge>
      <span>
        Mail perso en cours d’envoi
        {detail && <small>{detail}</small>}
      </span>
    </li>
  );
}
