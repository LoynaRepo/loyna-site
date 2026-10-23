// Aide à la prospection : déroulé d'un appel, processus (premier mail → relance J+7 → appel), modèles de
// mails du coffre, bonnes pratiques (horaires d'appel, règles du démarchage B2B, droit d'opposition).
import {BONNES_PRATIQUES, derouleAppel, HORAIRES, LIENS, REGLES_B2B, SOURCES_CNIL} from '../contenu';
import {fr} from '../format';
import {Icon} from '../icons';
import {donnees} from '../store';
import {Copier, Lien, PageHead, Panel} from '../ui';
import {Markdown} from './Markdown';

const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const NOMS_AGENTS: Record<string, string> = {
  'loyna-prospecteur': 'Prospecteur (recherche, fiches)',
  'loyna-expediteur': 'Expéditeur (premiers mails, relances)',
  'loyna-trieur': 'Trieur (réponses, RDV)',
  'loyna-analyste': 'Analyste (statistiques)',
};

function heure(h: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h.trim());
  if (!m) return h;
  return `${+m[1]} h${m[2] === '00' ? '' : ' ' + m[2]}`;
}
function plages(p?: string): string {
  if (!p) return '';
  const l = p.split(',').map((x) => x.split('-').map(heure).join(' – '));
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0];
}
function jours(j?: string[] | string): string {
  const l = (Array.isArray(j) ? j : String(j ?? '').split(','))
    .map((x) => Number(String(x).trim()))
    .filter((x) => x >= 1 && x <= 7)
    .sort();
  if (!l.length) return '';
  const suite = l.every((x, i) => i === 0 || x === l[i - 1] + 1);
  return suite && l.length > 2 ? `du ${JOURS[l[0]]} au ${JOURS[l[l.length - 1]]}` : l.map((x) => JOURS[x]).join(', ');
}

const ANCRES = [
  ['appel', 'Déroulé d’un appel'],
  ['processus', 'Processus'],
  ['modeles', 'Modèles de mails'],
  ['pratiques', 'Bonnes pratiques'],
  ['regles', 'Règles du démarchage'],
] as const;

export function Aide() {
  const d = donnees.value!;
  const r = d.ressources;
  const ag = r.agenda;
  const env = r.envoi;
  const creneaux = [jours(ag.jours_rdv), plages(ag.plages)].filter(Boolean).join(', ');
  const aller = (id: string) => (e: Event) => {
    e.preventDefault();
    document.getElementById(`aide-${id}`)?.scrollIntoView({behavior: 'smooth', block: 'start'});
  };

  return (
    <div class="page">
      <PageHead eyebrow="Espace commercial" title="Aide à la prospection" />
      <nav class="anchors" aria-label="Sections">
        {ANCRES.map(([id, l]) => (
          <a href={`#aide-${id}`} onClick={aller(id)}>
            {l}
          </a>
        ))}
      </nav>

      <Panel title="Déroulé d’un appel" id="aide-appel" sub="Objectif : un rendez-vous de 15 minutes, ou l’envoi de l’aperçu gratuit et de la démonstration.">
        <ol class="cp-etapes-appel">
          {derouleAppel().map((e) => (
            <li>
              <h3>
                {e.titre}
                {e.duree && <small> · {e.duree}</small>}
              </h3>
              <ul>
                {e.points.map((p) => (
                  <li>{fr(p)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {creneaux && (
          <p class="note">
            {fr(`Créneaux de rendez-vous (05 Règles/Agenda) : ${creneaux}, ${ag.duree_rdv_min || '15'} minutes. Le rendez-vous se note dans la fiche (rdv : AAAA-MM-JJ HH:MM) ; l’agent Trieur crée l’événement d’agenda pour les réponses par mail.`)}
          </p>
        )}
        <p class="cp-liens">
          {[LIENS.apercu, LIENS.demo, LIENS.video, LIENS.tarifs].map((l) => (
            <Lien href={l.href}>
              <Icon name="external-link" size={14} />
              <span>{l.label}</span>
            </Lien>
          ))}
        </p>
      </Panel>

      <Panel title="Le processus" id="aide-processus" sub="Premier mail, relance 7 jours plus tard, appel 7 jours après la relance.">
        <ol class="cp-frise">
          <li>
            <strong>J 0 · Premier mail</strong>
            <span>{fr('Préparé et envoyé par l’agent Expéditeur, personnalisé (prénom, accroche du secteur), variante d’objet A ou B.')}</span>
          </li>
          <li>
            <strong>J + {d.regles.delai_relance_jours} · Relance</strong>
            <span>{fr('Une seule relance, dans le fil du premier mail, si aucune réponse.')}</span>
          </li>
          <li>
            <strong>J + {d.regles.delai_relance_jours + d.regles.delai_appel_jours} · Appel</strong>
            <span>{fr(`Toujours sans réponse ${d.regles.delai_appel_jours} jours après la relance : le prospect passe dans « À appeler ». C’est votre tour.`)}</span>
          </li>
        </ol>
        <ul class="cp-points">
          <li>{fr('Réponses : relevées par l’agent Trieur ; il répond seul avec la FAQ du coffre, fixe les RDV, gère rebonds et oppositions. Le reste arrive dans « À traiter par Ewan » et en tête de « À appeler ».')}</li>
          <li>
            {fr(
              `Mail non reçu (rebond, adresse refusée ou écartée) : l’agent Prospecteur cherche une autre adresse ; vous pouvez appeler sans attendre.`,
            )}
          </li>
          {env.heure_debut && env.heure_fin && (
            <li>
              {fr(
                `Envois de prospection : ${jours(env.jours_envoi) || 'en semaine'}, de ${heure(env.heure_debut)} à ${heure(env.heure_fin)}, au plus ${env.quota_jour ?? '?'} mails par jour (dont ${env.quota_initial_jour ?? '?'} premiers mails), uniquement par loyna_mail.py (quotas, liste STOP, anti-doublons).`,
              )}
            </li>
          )}
        </ul>
        {r.agents.length > 0 && (
          <div class="tbl-wrap">
            <table class="tbl tbl--compact">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Passage</th>
                </tr>
              </thead>
              <tbody>
                {r.agents.map((a) => (
                  <tr>
                    <td>{NOMS_AGENTS[a.tache] ?? a.tache.replace(/^loyna-/, '')}</td>
                    <td>{fr(a.horaire)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Modèles de mails" id="aide-modeles" sub="Les modèles du coffre (03 Modèles), tels que les agents les utilisent. Remplacez les {variables} avant d’envoyer.">
        <div class="cp-qr">
          {r.modeles.map((m, i) => (
            <details class="cp-q cp-modele" open={i === 0}>
              <summary>
                <span>{m.titre}</span>
                <Icon name="chevron-down" size={18} />
              </summary>
              <div class="cp-r">
                {m.blocs.map((b) =>
                  b.type === 'texte' ? (
                    <Markdown texte={b.md ?? ''} />
                  ) : (
                    <div class="cp-courriel">
                      <div class="cp-courriel-h">
                        <span>{b.titre || (b.type === 'mail' ? 'Texte du mail' : 'Code')}</span>
                        <Copier texte={b.texte ?? ''} />
                      </div>
                      <pre>{b.texte}</pre>
                    </div>
                  ),
                )}
                <p class="cp-source">Fichier : {m.fichier}</p>
              </div>
            </details>
          ))}
        </div>
        <p class="muted small cp-m0">
          {fr('Les mails partent uniquement par _systeme/loyna_mail.py (jamais depuis Gmail ou le navigateur) : c’est lui qui applique les quotas, les horaires, la liste STOP et les anti-doublons.')}
        </p>
      </Panel>

      <Panel title="Bonnes pratiques" id="aide-pratiques">
        <ul class="cp-points">
          {BONNES_PRATIQUES.map((b) => (
            <li>{fr(b)}</li>
          ))}
        </ul>
        <h3 class="cp-sous-titre">Quand appeler ? (repères pratiques, à ajuster)</h3>
        <dl class="cp-dl">
          {Object.entries(HORAIRES).map(([famille, conseil]) => (
            <div>
              <dt>{famille}</dt>
              <dd>{fr(conseil)}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Règles du démarchage entre professionnels" id="aide-regles" sub="Résumé des pages de la CNIL (lues le 23 octobre 2026). Ce n’est pas un avis juridique ; la CNIL annonce compléter sa fiche.">
        {REGLES_B2B.map((g) => (
          <div class="cp-regle">
            <h3 class="cp-sous-titre">{g.titre}</h3>
            <ul class="cp-points">
              {g.points.map((p) => (
                <li>{fr(p)}</li>
              ))}
            </ul>
          </div>
        ))}
        <p class="cp-liens">
          {SOURCES_CNIL.map((l) => (
            <Lien href={l.href}>
              <Icon name="external-link" size={14} />
              <span>{l.label}</span>
            </Lien>
          ))}
        </p>
      </Panel>
    </div>
  );
}
