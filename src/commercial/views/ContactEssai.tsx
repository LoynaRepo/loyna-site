// Parcours de contact d'un essai, dans la fiche du client (décision d'Ewan du 2026-11-01) : les six étapes, datées, et pour celle en cours les
// boutons « Joint », « Pas de réponse », « Rappeler le… », « Pas intéressé » avec un champ pour le retour. Chaque bouton enregistre une note
// chiffrée « [CLIENT:essai_contact] » que panel.py recopie dans la fiche. Rien n'est envoyé d'ici : on appelle et on écrit à la main.
import {useState} from 'preact/hooks';
import {annulerAction, noterContact, RESULTATS_CONTACT, type ClientAffiche, type EvenementContact, type ResultatContact} from '../clients';
import {isoJour} from '../clients-regles';
import {dateLongue, fr} from '../format';
import {Icon} from '../icons';
import {ErreurNotes, notesEtat} from '../notes';
import {toast} from '../store';
import {Btn, Copier, Lien, Panel} from '../ui';

const ARRETS: Record<string, string> = {
  abonne: 'Abonné : le parcours de contact est arrêté.',
  pas_interesse: 'Pas intéressé : plus aucun contact.',
  stop: 'Sur la liste STOP : plus aucun contact.',
  donnees_supprimees: 'Données supprimées : plus aucun contact.',
};
const ETAPES_OFFRE = ['jm10', 'jm3', 'fin2', 'fin30'];
const message = (e: unknown) => (e instanceof ErreurNotes ? e.message : 'Enregistrement impossible.');

function LigneEvenement({c, e}: {c: ClientAffiche; e: EvenementContact}) {
  const [envoi, setEnvoi] = useState(false);
  return (
    <small class="cl-contact-ev">
      {RESULTATS_CONTACT[e.resultat]}
      {e.rappel ? ` le ${dateLongue(e.rappel)}` : ''}, noté le {dateLongue(e.date)}
      {e.texte ? ` : ${e.texte}` : ''}
      {e.note && (
        <button
          type="button"
          class="linkish"
          disabled={envoi || notesEtat.value.etat !== 'pret'}
          onClick={async () => {
            setEnvoi(true);
            try {
              await annulerAction(c.id, e.note!);
              toast('Annulé.', 'info');
            } catch (err) {
              toast(message(err), 'error');
            } finally {
              setEnvoi(false);
            }
          }}
        >
          Annuler
        </button>
      )}
    </small>
  );
}

function Boutons({c, etape}: {c: ClientAffiche; etape: string}) {
  const pret = notesEtat.value.etat === 'pret';
  const [retour, setRetour] = useState('');
  const [rappel, setRappel] = useState('');
  const [choixRappel, setChoixRappel] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const auj = isoJour(new Date());
  const noter = async (resultat: ResultatContact, date = '') => {
    setEnvoi(true);
    setErreur('');
    try {
      await noterContact(c.id, etape, resultat, auj, date, retour);
      setRetour('');
      setRappel('');
      setChoixRappel(false);
      setConfirmer(false);
      toast(`${RESULTATS_CONTACT[resultat]} : noté. La fiche du coffre sera mise à jour au prochain passage d’un agent.`);
    } catch (e) {
      setErreur(message(e));
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <div class="cl-contact-form">
      <label class="cp-filtre" for={`retour-${c.id}`}>
        <span>Retour du commerçant (facultatif)</span>
      </label>
      <textarea id={`retour-${c.id}`} class="cl-champ" rows={2} maxLength={500} value={retour} onInput={(e) => setRetour((e.target as HTMLTextAreaElement).value)} />
      <div class="btn-row">
        <Btn kind="gold" small icon="check" busy={envoi} disabled={!pret} onClick={() => noter('joint')}>
          Joint
        </Btn>
        <Btn kind="ghost" small icon="phone" disabled={!pret || envoi} onClick={() => noter('sans_reponse')}>
          Pas de réponse
        </Btn>
        <Btn kind="ghost" small icon="calendar-clock" disabled={!pret || envoi} onClick={() => setChoixRappel(!choixRappel)}>
          Rappeler le…
        </Btn>
        <Btn kind="ghost" small icon="ban" disabled={!pret || envoi} onClick={() => setConfirmer(!confirmer)}>
          Pas intéressé
        </Btn>
      </div>
      {choixRappel && (
        <div class="btn-row">
          <input type="date" class="cl-champ" aria-label="Date du rappel" min={auj} value={rappel} onInput={(e) => setRappel((e.target as HTMLInputElement).value)} />
          <Btn kind="gold" small busy={envoi} disabled={!pret || !/^\d{4}-\d{2}-\d{2}$/.test(rappel)} onClick={() => noter('rappeler', rappel)}>
            Enregistrer le rappel
          </Btn>
        </div>
      )}
      {confirmer && (
        <div class="btn-row">
          <span class="muted small">{fr('Plus aucune étape pour ce commerce. S’il demande à ne plus être contacté, ajouter aussi son adresse à la liste STOP.')}</span>
          <Btn kind="gold" small busy={envoi} disabled={!pret} onClick={() => noter('pas_interesse')}>
            Confirmer
          </Btn>
        </div>
      )}
      {!pret && <p class="muted small cp-m0">{notesEtat.value.message || 'Notes indisponibles pour le moment.'}</p>}
      {erreur && (
        <p class="cp-notes-err" role="alert">
          {fr(erreur)}
        </p>
      )}
    </div>
  );
}

export function ParcoursContact({c}: {c: ClientAffiche}) {
  const p = c.contact_essai;
  if (!p) return null;
  const liens = p.liens_panier;
  return (
    <Panel title="Parcours de contact" sub="À la main : rien ne part tout seul. Les boutons s’enregistrent tout de suite ; ils sont recopiés dans la fiche du coffre au prochain passage d’un agent.">
      {p.arret && <p class="cl-etat cl-etat--termine">{ARRETS[p.arret] ?? 'Parcours arrêté.'}</p>}
      {p.termine && <p class="muted cp-m0">Parcours terminé : plus rien à faire.</p>}
      <ol class="cl-parcours">
        {p.etapes.map((e) => {
          const courante = e.code === p.courante;
          const evenements = p.evenements.filter((x) => x.etape === e.code);
          return (
            <li class={e.etat === 'fait' ? 'on' : courante ? 'courant' : e.etat === 'passe' ? 'na' : ''}>
              <span class="cl-pt" aria-hidden="true">
                <Icon name={e.etat === 'fait' ? 'check' : e.etat === 'passe' ? 'ban' : 'clock'} size={14} />
              </span>
              <div class="cl-pt-t">
                <strong>{e.libelle}</strong>
                <small>
                  {e.etat === 'passe' ? 'passée, prévue le ' : courante && e.echeance !== e.prevu ? 'reportée au ' : 'le '}
                  {dateLongue(courante ? e.echeance : e.prevu)}
                  {courante && p.retard > 0 ? ` · en retard de ${p.retard} j` : ''}
                </small>
                {courante && <small>{fr(e.consigne)}</small>}
                {evenements.map((x) => (
                  <LigneEvenement c={c} e={x} />
                ))}
                {courante && e.code === 'j7' && <small class="muted">{fr('Clients inscrits sur sa carte : à lui demander, ou écran Opérateur, « Ouvrir son espace ».')}</small>}
                {courante && ETAPES_OFFRE.includes(e.code) && (
                  <div class="cl-contact-liens">
                    {liens ? (
                      <>
                        <Lien href={liens.starter}>Panier Starter</Lien>
                        <Copier texte={liens.starter} label="Copier" />
                        <Lien href={liens.pro}>Panier Pro</Lien>
                        <Copier texte={liens.pro} label="Copier" />
                      </>
                    ) : (
                      <small class="muted">{fr('Pas d’identifiant de commerce dans la fiche : il choisit son offre depuis son espace client, écran Abonnement.')}</small>
                    )}
                  </div>
                )}
                {courante && <Boutons c={c} etape={e.code} />}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
