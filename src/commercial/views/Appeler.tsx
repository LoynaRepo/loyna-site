// À appeler : liste priorisée (réponses à traiter, sans réponse après la relance, mails non reçus, jamais écrits ;
// mobiles 06/07 d'abord), avec le prénom du dirigeant et ce qu'il faut dire.
import {useMemo, useState} from 'preact/hooks';
import {dateCourte, fr, nombre} from '../format';
import {Icon} from '../icons';
import {HORAIRES} from '../contenu';
import {donnees} from '../store';
import type {Prospect} from '../types';
import {Badge, Empty, PageHead} from '../ui';
import {BadgeCible, Tel} from './commun';
import {ADire} from './Fiche';
import {notesEtat, refuse} from '../notes';
import {BoutonNotes, MarqueNotes} from './Notes';

const TON_GROUPE = {1: 'red', 2: 'gold', 3: 'amber', 4: 'blue'} as const;

export function Appeler() {
  const d = donnees.value!;
  const [ligne, setLigne] = useState<'' | 'mobile' | 'fixe'>('');
  const [ville, setVille] = useState('');
  const blocsNotes = notesEtat.value.blocs;
  const tous = useMemo(() => d.prospects.filter((p) => p.appel && !refuse(blocsNotes, p.id)).sort((a, b) => a.appel!.rang - b.appel!.rang), [d, blocsNotes]);
  const villes = useMemo(() => [...new Set(tous.map((p) => p.ville).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [tous]);
  const liste = tous.filter((p) => (!ligne || p.telephone_type === ligne) && (!ville || p.ville === ville));
  const groupes = d.groupes_appel.map((g) => ({...g, prospects: liste.filter((p) => p.appel!.groupe === g.groupe)})).filter((g) => g.prospects.length);

  return (
    <div class="page">
      <PageHead eyebrow="Espace commercial" title="À appeler">
        <span class="ph-count">
          {nombre(tous.length)} {tous.length > 1 ? 'commerces' : 'commerce'} · mobiles d’abord
        </span>
      </PageHead>
      <p class="lead-sm">
        Ordre de priorité : réponses à traiter, puis sans réponse {d.regles.delai_abandon_jours ?? d.regles.delai_appel_jours} jours ouvrés après la relance, puis mails non reçus, puis commerces jamais écrits. Sans numéro, un prospect sans réponse après la relance sort du fichier : il n’apparaît pas ici.
        Après l’appel, notez le résultat dans la fiche (Obsidian).
      </p>

      <div class="toolbar cp-appel-filtres">
        <div class="chips" role="radiogroup" aria-label="Type de ligne">
          {(
            [
              ['', 'Tous'],
              ['mobile', 'Mobiles (06/07)'],
              ['fixe', 'Fixes'],
            ] as const
          ).map(([v, l]) => (
            <button type="button" role="radio" aria-checked={ligne === v} class={`chip ${ligne === v ? 'on' : ''}`} onClick={() => setLigne(v)}>
              {l}
            </button>
          ))}
        </div>
        {villes.length > 1 && (
          <select class="sel-sm" value={ville} onChange={(e) => setVille((e.target as HTMLSelectElement).value)} aria-label="Ville">
            <option value="">Toutes les villes</option>
            {villes.map((v) => (
              <option value={v}>{v}</option>
            ))}
          </select>
        )}
      </div>

      {!liste.length ? (
        <Empty icon="phone-call" title={tous.length ? 'Personne avec ces filtres' : 'Personne à appeler pour l’instant'}>
          {tous.length
            ? 'Changez de filtre pour voir les autres commerces.'
            : 'Les prospects apparaissent ici quand ils ont répondu, 7 jours ouvrés après une relance sans réponse, ou quand un mail n’est pas arrivé (s’ils ont un numéro).'}
        </Empty>
      ) : (
        groupes.map((g) => (
          <section class="cp-groupe" aria-label={g.libelle}>
            <h2 class="cp-groupe-t">
              <Badge tone={TON_GROUPE[g.groupe as 1 | 2 | 3 | 4]}>{g.groupe}</Badge> {g.libelle} <span class="muted">({g.prospects.length})</span>
            </h2>
            <ol class="cp-appels">
              {g.prospects.map((p) => (
                <CarteAppel p={p} />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

function CarteAppel({p}: {p: Prospect}) {
  const a = p.appel!;
  const qui = p.prenom ? `${p.prenom}${p.dirigeant && !p.dirigeant.includes(p.prenom) ? ` (${p.dirigeant})` : ''}` : p.dirigeant;
  return (
    <li class="pnl cp-appel-carte">
      <div class="cp-appel-h">
        <span class="cp-rang" aria-label={`Priorité ${a.rang}`}>{a.rang}</span>
        <div class="cp-appel-t">
          <a href={`#/prospect/${p.id}`} class="cp-appel-nom">
            {p.nom}
          </a>
          <small>
            {[p.ville, p.secteur].filter(Boolean).join(' · ')}
            {p.envoi.date && ` · 1er mail ${dateCourte(p.envoi.date)}`}
          </small>
          <span class="cp-qui">
            <Icon name="user-round" size={15} />
            {qui ? fr(qui) : <span class="muted">dirigeant inconnu : demander le responsable</span>}
          </span>
        </div>
        <BadgeCible p={p} />
      </div>
      <p class="cp-motif">
        {fr(a.motif)} <MarqueNotes p={p} />
      </p>
      <div class="cp-appel-actions">
        <Tel p={p} gros />
        <BoutonNotes p={p} />
      </div>
      <ADire p={p} />
      {HORAIRES[p.famille] && (
        <p class="cp-horaire">
          <Icon name="clock" size={15} />
          <span>{fr(HORAIRES[p.famille])}</span>
        </p>
      )}
    </li>
  );
}
