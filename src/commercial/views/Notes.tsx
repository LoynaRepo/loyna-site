// Notes d'Ewan sur un prospect (fiche détaillée, et bouton « Note » des cartes « À appeler ») : la plus récente en
// haut, ajout (Ctrl+Entrée), modification, suppression confirmée dans l'interface. En cas d'échec (réseau,
// conflit), le texte tapé reste dans la zone avec un message clair et un bouton « Réessayer ».
import {useEffect, useRef, useState} from 'preact/hooks';
import {fr, moment} from '../format';
import {Icon} from '../icons';
import {nouvelId} from '../notes-crypto';
import {brouillons, chargerNotes, Conflit, enregistrer, ErreurNotes, notesDe, notesEtat, TEXTE_MAX, type Note, type Operation} from '../notes';
import {toast} from '../store';
import type {Prospect} from '../types';

/** Prospect ou client : seuls l'identifiant (clé des notes) et le nom servent ici. */
type Cible = Pick<Prospect, 'id' | 'nom'>;
import {Btn, Modal, Spinner} from '../ui';

const raccourci = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘ + Entrée' : 'Ctrl + Entrée';
const message = (e: unknown) => (e instanceof ErreurNotes ? e.message : 'Enregistrement impossible.');

/** Ctrl+Entrée (⌘+Entrée sur Mac) dans une zone de texte. */
function surEntree(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      action();
    }
  };
}

export function NotesProspect({p, focus = false, filtre}: {p: Pick<Cible, 'id'>; focus?: boolean; filtre?: (n: Note) => boolean}) {
  const etat = notesEtat.value;
  const notes = filtre ? notesDe(p.id).filter(filtre) : notesDe(p.id); // clients : sans les notes d'action
  const lectureSeule = etat.etat !== 'pret';
  return (
    <div class="cp-notes">
      {etat.etat === 'lecture' && (
        <div class="cp-notes-info" role="status">
          <Icon name="wifi-off" size={18} />
          <span>{fr(`Notes en lecture seule (celles de la dernière publication) : ${etat.message}`)}</span>
          <Btn kind="ghost" small icon="refresh-cw" onClick={() => chargerNotes()}>
            Réessayer
          </Btn>
        </div>
      )}
      {etat.etat === 'inactif' && etat.message && (
        <p class="cp-notes-info" role="status">
          <Icon name="info" size={18} />
          <span>{fr(etat.message)}</span>
        </p>
      )}
      {etat.illisibles.includes(p.id) && (
        <p class="cp-notes-info" role="alert">
          <Icon name="triangle-alert" size={18} />
          <span>Les notes de ce prospect sont illisibles (clé différente) : elles restent sur le serveur, intactes.</span>
        </p>
      )}
      {!lectureSeule && <Ajout p={p} focus={focus} />}
      {etat.etat === 'chargement' && !notes.length ? (
        <Spinner label="Chargement des notes…" />
      ) : notes.length ? (
        <ol class="cp-notes-liste">
          {notes.map((n) => (
            <ElementNote key={n.id} p={p} note={n} lectureSeule={lectureSeule} />
          ))}
        </ol>
      ) : (
        <p class="muted small cp-m0">Aucune note pour l’instant.</p>
      )}
    </div>
  );
}

function Ajout({p, focus}: {p: Pick<Cible, 'id'>; focus: boolean}) {
  const [texte, setTexte] = useState(brouillons.get(p.id) ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const enAttente = useRef<Note | null>(null); // même identifiant en cas de nouvel essai : jamais de doublon
  const zone = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // dans une fenêtre, showModal() place le focus après le rendu : on le reprend juste après
    if (!focus) return;
    const t = setTimeout(() => zone.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const changer = (v: string) => {
    setTexte(v);
    if (v.trim()) brouillons.set(p.id, v);
    else brouillons.delete(p.id);
  };
  const ajouter = async () => {
    const t = texte.trim();
    if (!t || envoi) return;
    const maintenant = new Date().toISOString();
    const note = enAttente.current ? {...enAttente.current, texte: t} : {id: nouvelId(), cree_le: maintenant, modifie_le: maintenant, texte: t};
    enAttente.current = note;
    setEnvoi(true);
    setErreur('');
    try {
      const r = await enregistrer(p.id, {type: 'ajout', note});
      enAttente.current = null;
      changer('');
      toast(r === 'fusionne' ? 'Notes mises à jour depuis un autre appareil, puis votre note a été ajoutée.' : 'Note ajoutée', r === 'fusionne' ? 'info' : 'ok');
    } catch (e) {
      setErreur(message(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form
      class="cp-notes-ajout"
      onSubmit={(e) => {
        e.preventDefault();
        ajouter();
      }}
    >
      <label class="sr-only" for={`note-${p.id}`}>
        Nouvelle note
      </label>
      <textarea
        id={`note-${p.id}`}
        ref={zone}
        autoFocus={focus}
        rows={3}
        maxLength={TEXTE_MAX}
        placeholder="Après l’appel : ce qui a été dit, la suite prévue…"
        value={texte}
        onInput={(e) => changer((e.target as HTMLTextAreaElement).value)}
        onKeyDown={surEntree(ajouter)}
      />
      {erreur && (
        <div class="cp-notes-err" role="alert">
          <Icon name="circle-alert" size={18} />
          <span>
            <strong>Note non enregistrée.</strong> {fr(erreur)} Votre texte est conservé.
          </span>
          <Btn kind="ghost" small icon="refresh-cw" busy={envoi} onClick={ajouter}>
            Réessayer
          </Btn>
        </div>
      )}
      <div class="cp-notes-a">
        <small class="muted">{texte.length > TEXTE_MAX - 400 ? `${texte.length} / ${TEXTE_MAX} caractères` : `${raccourci} pour ajouter`}</small>
        <Btn type="submit" kind="gold" small icon="plus" busy={envoi} disabled={!texte.trim()}>
          Ajouter la note
        </Btn>
      </div>
    </form>
  );
}

function ElementNote({p, note, lectureSeule}: {p: Pick<Cible, 'id'>; note: Note; lectureSeule: boolean}) {
  const [mode, setMode] = useState<'lecture' | 'edition' | 'suppression'>('lecture');
  const [texte, setTexte] = useState(note.texte);
  const [avant, setAvant] = useState(note.modifie_le); // version de la note quand la modification a commencé
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [conflit, setConflit] = useState<Conflit | null>(null);
  const derniere = useRef<Operation | null>(null);

  const lancer = async (op: Operation, force = false) => {
    derniere.current = op;
    setEnvoi(true);
    setErreur('');
    setConflit(null);
    try {
      await enregistrer(p.id, op, force);
      setMode('lecture');
      toast(op.type === 'suppression' ? 'Note supprimée' : 'Note modifiée');
    } catch (e) {
      if (e instanceof Conflit) setConflit(e);
      else setErreur(message(e));
    } finally {
      setEnvoi(false);
    }
  };
  const enregistrerTexte = () => {
    const t = texte.trim();
    if (!t || envoi) return;
    lancer({type: 'modification', id: note.id, texte: t, avant, cree_le: note.cree_le});
  };
  const commencer = (m: 'edition' | 'suppression') => {
    setTexte(note.texte);
    setAvant(note.modifie_le);
    setErreur('');
    setConflit(null);
    setMode(m);
  };
  const modifiee = note.modifie_le && note.modifie_le !== note.cree_le && moment(note.modifie_le) !== moment(note.cree_le);

  return (
    <li class={`cp-note ${mode !== 'lecture' ? 'is-active' : ''}`}>
      <div class="cp-note-h">
        <time dateTime={note.cree_le}>{moment(note.cree_le)}</time>
        {modifiee && <small class="muted">modifiée le {moment(note.modifie_le)}</small>}
        {!lectureSeule && mode === 'lecture' && (
          <span class="cp-note-a">
            <Btn kind="quiet" small icon="pencil" onClick={() => commencer('edition')} title="Modifier la note">
              <span class="cp-note-a-l">Modifier</span>
            </Btn>
            <Btn kind="quiet" small icon="trash-2" onClick={() => commencer('suppression')} title="Supprimer la note">
              <span class="cp-note-a-l">Supprimer</span>
            </Btn>
          </span>
        )}
      </div>

      {mode === 'edition' ? (
        <div class="cp-notes-ajout">
          <label class="sr-only" for={`edition-${note.id}`}>
            Texte de la note
          </label>
          <textarea id={`edition-${note.id}`} rows={3} maxLength={TEXTE_MAX} value={texte} onInput={(e) => setTexte((e.target as HTMLTextAreaElement).value)} onKeyDown={surEntree(enregistrerTexte)} />
          <div class="cp-notes-a" hidden={!!conflit}>
            <Btn kind="ghost" small onClick={() => setMode('lecture')} disabled={envoi}>
              Annuler
            </Btn>
            <Btn kind="primary" small icon="save" busy={envoi} disabled={!texte.trim()} onClick={enregistrerTexte}>
              Enregistrer
            </Btn>
          </div>
        </div>
      ) : (
        <p class="cp-note-t">{note.texte}</p>
      )}

      {mode === 'suppression' && !conflit && (
        <div class="cp-confirm" role="alertdialog" aria-label="Confirmer la suppression">
          <span>Supprimer cette note ? Elle disparaîtra aussi de la fiche du coffre à la prochaine publication.</span>
          <span class="btn-row">
            <Btn kind="ghost" small onClick={() => setMode('lecture')} disabled={envoi}>
              Annuler
            </Btn>
            <Btn kind="danger" small icon="trash-2" busy={envoi} onClick={() => lancer({type: 'suppression', id: note.id, avant})}>
              Supprimer
            </Btn>
          </span>
        </div>
      )}

      {erreur && (
        <div class="cp-notes-err" role="alert">
          <Icon name="circle-alert" size={18} />
          <span>
            <strong>{mode === 'suppression' ? 'Note non supprimée.' : 'Modification non enregistrée.'}</strong> {fr(erreur)}
            {mode === 'edition' && ' Votre texte est conservé.'}
          </span>
          <Btn kind="ghost" small icon="refresh-cw" busy={envoi} onClick={() => derniere.current && lancer(derniere.current)}>
            Réessayer
          </Btn>
        </div>
      )}

      {conflit && <ChoixConflit conflit={conflit} monTexte={texte.trim()} envoi={envoi} forcer={() => lancer(conflit.operation, true)} abandonner={() => {
        setConflit(null);
        setMode('lecture');
      }} />}
    </li>
  );
}

function ChoixConflit(props: {conflit: Conflit; monTexte: string; envoi: boolean; forcer: () => void; abandonner: () => void}) {
  const {conflit, envoi} = props;
  const op = conflit.operation;
  const suppression = op.type === 'suppression';
  return (
    <div class="cp-conflit" role="alert">
      <p class="cp-conflit-t">
        <Icon name="git-merge" size={18} />
        <strong>
          {conflit.serveur === null
            ? 'Cette note a été supprimée sur un autre appareil.'
            : suppression
              ? 'Cette note a été modifiée sur un autre appareil entre-temps.'
              : 'Cette note a été modifiée sur un autre appareil pendant que vous l’écriviez.'}
        </strong>
      </p>
      {conflit.serveur && (
        <div class="cp-conflit-v">
          <small>Version enregistrée {conflit.serveur.modifie_le && `(${moment(conflit.serveur.modifie_le)})`}</small>
          <p>{conflit.serveur.texte}</p>
        </div>
      )}
      {!suppression && (
        <div class="cp-conflit-v cp-conflit-v--moi">
          <small>Votre version</small>
          <p>{props.monTexte}</p>
        </div>
      )}
      <div class="btn-row">
        <Btn kind={suppression ? 'danger' : 'primary'} small busy={envoi} onClick={props.forcer}>
          {suppression ? 'Supprimer quand même' : conflit.serveur === null ? 'La recréer avec mon texte' : 'Garder ma version'}
        </Btn>
        <Btn kind="ghost" small onClick={props.abandonner} disabled={envoi}>
          {suppression ? 'Garder la note' : conflit.serveur === null ? 'Abandonner' : 'Garder la version enregistrée'}
        </Btn>
      </div>
    </div>
  );
}

/** Bouton « Note » des cartes « À appeler » : ouvre les notes du prospect dans une fenêtre. */
export function BoutonNotes({p}: {p: Cible}) {
  const [ouvert, setOuvert] = useState(false);
  const n = notesDe(p.id).length;
  return (
    <>
      <Btn kind="ghost" small icon="notebook-pen" onClick={() => setOuvert(true)}>
        {n ? `Note (${n})` : 'Note'}
      </Btn>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title={`Notes · ${p.nom}`} class="cp-mdl-notes">
        {ouvert && <NotesProspect p={p} focus />}
      </Modal>
    </>
  );
}

/** « n notes » sur les lignes des tableaux et des cartes. */
export function MarqueNotes({p, filtre}: {p: Pick<Cible, 'id'>; filtre?: (n: Note) => boolean}) {
  const liste = filtre ? notesDe(p.id).filter(filtre) : notesDe(p.id);
  const n = liste.length;
  if (!n) return null;
  return (
    <span class="bdg bdg--blue cp-marque-notes" title={liste[0]?.texte.slice(0, 140)}>
      <Icon name="notebook-text" size={12} />
      {n > 1 ? `${n} notes` : '1 note'}
    </span>
  );
}
