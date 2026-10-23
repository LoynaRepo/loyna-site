// Prospects : recherche, filtres (statut, cible, ville, secteur, action, mail reçu, réponse) et tri ;
// tableau sur ordinateur, cartes sur téléphone.
import {useEffect, useMemo, useState} from 'preact/hooks';
import {cle, lienMail, nombre} from '../format';
import {Icon} from '../icons';
import {donnees, filtres, FILTRES_VIDES, type Filtres} from '../store';
import type {Prospect} from '../types';
import {Btn, Empty, PageHead} from '../ui';
import {Action, actionCorrespond, BadgeCible, BadgeStatut, Envoye, GROUPES_ACTION, Recu, Reponse, Suite, Tel} from './commun';

const PAS = 50;

const RECU: {v: string; l: string}[] = [
  {v: 'envoye', l: 'Mail envoyé (tous)'},
  {v: 'oui', l: 'Reçu'},
  {v: 'en attente', l: 'En attente (moins de 3 j)'},
  {v: 'non', l: 'Non reçu'},
  {v: 'pas_envoye', l: 'Pas encore écrit'},
];
const REPONSE: {v: string; l: string}[] = [
  {v: 'oui', l: 'Avec réponse'},
  {v: 'a_traiter', l: 'Réponse à traiter'},
  {v: 'non', l: 'Sans réponse'},
];
const TRIS: {v: string; l: string}[] = [
  {v: 'action', l: 'Action la plus urgente'},
  {v: 'nom', l: 'Nom (A → Z)'},
  {v: 'ville', l: 'Ville'},
  {v: 'score', l: 'Score'},
  {v: 'envoi', l: 'Premier mail (récent)'},
  {v: 'activite', l: 'Dernière activité'},
];

function useLarge(): boolean {
  const q = '(min-width: 1000px)';
  const [large, setLarge] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setLarge(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return large;
}

function correspond(p: Prospect, f: Filtres, mots: string[], textes: Map<string, string>): boolean {
  if (f.statut && p.statut !== f.statut) return false;
  if (f.cible && p.cible !== f.cible) return false;
  if (f.ville && p.ville !== f.ville) return false;
  if (f.famille && p.famille !== f.famille) return false;
  if (!actionCorrespond(p.action.code, f.action)) return false;
  if (f.recu === 'envoye' && !p.envoi.envoye) return false;
  if (f.recu === 'pas_envoye' && p.envoi.envoye) return false;
  if (['oui', 'non', 'en attente'].includes(f.recu) && p.reception.etat !== f.recu) return false;
  if (f.reponse === 'oui' && !p.reponse.recue) return false;
  if (f.reponse === 'non' && p.reponse.recue) return false;
  if (f.reponse === 'a_traiter' && !(p.reponse.recue && p.reponse.traitee === false)) return false;
  if (mots.length) {
    const t = textes.get(p.id) ?? '';
    if (!mots.every((m) => t.includes(m))) return false;
  }
  return true;
}

function trier(liste: Prospect[], tri: string): Prospect[] {
  const nom = (a: Prospect, b: Prospect) => a.nom.localeCompare(b.nom, 'fr', {sensitivity: 'base'});
  const l = [...liste];
  switch (tri) {
    case 'nom':
      return l.sort(nom);
    case 'ville':
      return l.sort((a, b) => a.ville.localeCompare(b.ville, 'fr') || nom(a, b));
    case 'score':
      return l.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || nom(a, b));
    case 'envoi':
      return l.sort((a, b) => (b.envoi.date || '').localeCompare(a.envoi.date || '') || nom(a, b));
    case 'activite':
      return l.sort((a, b) => (b.derniere_activite || '').localeCompare(a.derniere_activite || '') || nom(a, b));
    default:
      return l.sort((a, b) => a.action.ordre - b.action.ordre || (a.appel?.rang ?? 9999) - (b.appel?.rang ?? 9999) || nom(a, b));
  }
}

/** Options d'un filtre, avec le nombre de prospects (les plus nombreux d'abord). */
function compter(liste: Prospect[], cle: (p: Prospect) => string): {v: string; n: number}[] {
  const m = new Map<string, number>();
  for (const p of liste) {
    const v = cle(p);
    if (v) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m].map(([v, n]) => ({v, n})).sort((a, b) => b.n - a.n || a.v.localeCompare(b.v, 'fr'));
}

export function Prospects() {
  const d = donnees.value!;
  const f = filtres.value;
  const large = useLarge();
  const [limite, setLimite] = useState(PAS);
  const [ouvert, setOuvert] = useState(false);
  const maj = (p: Partial<Filtres>) => {
    filtres.value = {...filtres.value, ...p};
    setLimite(PAS);
  };

  const textes = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of d.prospects)
      m.set(
        p.id,
        cle([p.nom, p.ville, p.secteur, p.famille, p.dirigeant, p.prenom, p.email, p.statut, p.action.libelle, p.adresse].join(' ')) +
          ' ' +
          p.telephones.map((t) => t.affiche.replace(/\s/g, '')).join(' '),
      );
    return m;
  }, [d]);
  const villes = useMemo(() => compter(d.prospects, (p) => p.ville), [d]);
  const familles = useMemo(() => compter(d.prospects, (p) => p.famille), [d]);
  const actions = useMemo(() => compter(d.prospects, (p) => p.action.code), [d]);
  const libelleAction = (code: string) => d.actions.find((a) => a.code === code)?.libelle ?? code;

  const mots = cle(f.q).replace(/(\d)\s+(?=\d)/g, '$1').split(/\s+/).filter(Boolean);
  const liste = useMemo(() => trier(d.prospects.filter((p) => correspond(p, f, mots, textes)), f.tri), [d, f, textes]);
  const actifs = (['statut', 'cible', 'ville', 'famille', 'action', 'recu', 'reponse'] as const).filter((k) => f[k]).length;

  const select = (k: keyof Filtres, label: string, options: {v: string; l: string}[], tous = 'Tous') => (
    <label class="cp-filtre">
      <span>{label}</span>
      <select class="sel-sm" value={f[k]} onChange={(e) => maj({[k]: (e.target as HTMLSelectElement).value} as Partial<Filtres>)}>
        <option value="">{tous}</option>
        {options.map((o) => (
          <option value={o.v}>{o.l}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div class="page">
      <PageHead eyebrow="Espace commercial" title="Prospects">
        <span class="ph-count">{liste.length === d.prospects.length ? `${nombre(liste.length)} prospects` : `${nombre(liste.length)} sur ${nombre(d.prospects.length)}`}</span>
      </PageHead>

      <div class="toolbar">
        <div class="cp-recherche">
          <label class="search">
            <Icon name="search" size={18} />
            <span class="sr-only">Rechercher un prospect</span>
            <input type="search" placeholder="Commerce, ville, dirigeant, téléphone, e-mail…" value={f.q} onInput={(e) => maj({q: (e.target as HTMLInputElement).value})} />
          </label>
          <button type="button" class={`chip cp-filtres-btn ${ouvert || actifs ? 'on' : ''}`} onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}>
            <Icon name="list-filter" size={16} />
            Filtres{actifs ? ` (${actifs})` : ''}
          </button>
        </div>
        <div class={`cp-filtres ${ouvert ? 'is-open' : ''}`}>
          {select('statut', 'Statut', d.par_statut.map((s) => ({v: s.statut, l: `${s.statut} (${s.nombre})`})))}
          {select('cible', 'Cible', [
            {v: 'oui', l: 'Dans la cible'},
            {v: 'à revoir', l: 'À revoir'},
            {v: 'non', l: 'Hors cible'},
          ], 'Toutes')}
          {select('ville', 'Ville', villes.map((v) => ({v: v.v, l: `${v.v} (${v.n})`})), 'Toutes')}
          {select('famille', 'Secteur', familles.map((v) => ({v: v.v, l: `${v.v} (${v.n})`})))}
          {select('action', 'Action suivante', [
            ...Object.entries(GROUPES_ACTION).map(([v, g]) => ({v, l: g.libelle})),
            ...actions.map((a) => ({v: a.v, l: `${libelleAction(a.v)} (${a.n})`})),
          ], 'Toutes')}
          {select('recu', 'Mail', RECU)}
          {select('reponse', 'Réponse', REPONSE, 'Toutes')}
          {select('tri', 'Trier par', TRIS, 'Action la plus urgente')}
          {(actifs > 0 || f.q) && (
            <button type="button" class="linkish cp-reinit" onClick={() => maj({...FILTRES_VIDES, tri: f.tri})}>
              Tout afficher
            </button>
          )}
        </div>
      </div>

      {!liste.length ? (
        <Empty icon="search" title="Aucun prospect ne correspond">
          Essayez une autre recherche ou retirez un filtre.
        </Empty>
      ) : large ? (
        <div class="pnl cp-tableau">
          <div class="tbl-wrap">
            <table class="tbl cp-tbl">
              <thead>
                <tr>
                  <Th k="nom" f={f} maj={maj}>
                    Commerce
                  </Th>
                  <Th k="ville" f={f} maj={maj}>
                    Ville
                  </Th>
                  <th class="cp-col-secteur">Secteur</th>
                  <th>Dirigeant</th>
                  <th>Téléphone</th>
                  <th>E-mail</th>
                  <Th k="envoi" f={f} maj={maj}>
                    Envoyé
                  </Th>
                  <th>Reçu</th>
                  <th>Réponse</th>
                  <th>Traitée / relance</th>
                  <Th k="action" f={f} maj={maj}>
                    Action suivante
                  </Th>
                </tr>
              </thead>
              <tbody>
                {liste.slice(0, limite).map((p) => (
                  <tr class="cp-ligne" onClick={() => (location.hash = `#/prospect/${p.id}`)}>
                    <td class="cp-nom">
                      <a href={`#/prospect/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        {p.nom}
                      </a>
                      <span class="cp-badges">
                        <BadgeStatut statut={p.statut} />
                        <BadgeCible p={p} />
                      </span>
                    </td>
                    <td class="cp-ville">
                      {p.ville}
                      <small class="cp-secteur-inline">{p.secteur}</small>
                    </td>
                    <td class="cp-secteur cp-col-secteur">{p.secteur}</td>
                    <td class="cp-dirigeant">{p.prenom && p.dirigeant && !p.dirigeant.includes(p.prenom) ? `${p.prenom} (${p.dirigeant})` : p.dirigeant || p.prenom || <span class="muted">—</span>}</td>
                    <td class="nowrap">
                      <Tel p={p} />
                    </td>
                    <td class="cp-mail">
                      {lienMail(p.email) ? (
                        <a href={lienMail(p.email)!} onClick={(e) => e.stopPropagation()} title={p.email}>
                          {p.email}
                        </a>
                      ) : (
                        <span class="muted">{p.email || '—'}</span>
                      )}
                    </td>
                    <td class="nowrap">
                      <Envoye p={p} />
                    </td>
                    <td>
                      <Recu p={p} court />
                    </td>
                    <td class="nowrap">
                      <Reponse p={p} />
                    </td>
                    <td class="nowrap">
                      <Suite p={p} />
                    </td>
                    <td>
                      <Action p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ul class="cp-cartes">
          {liste.slice(0, limite).map((p) => (
            <li class="cp-carte">
              <div class="cp-carte-h">
                <a class="cp-carte-lien" href={`#/prospect/${p.id}`}>
                  {p.nom}
                </a>
                <BadgeStatut statut={p.statut} />
              </div>
              <p class="cp-carte-s">{[p.ville, p.secteur, p.prenom || p.dirigeant].filter(Boolean).join(' · ')}</p>
              <dl class="cp-etapes">
                <div>
                  <dt>Envoyé</dt>
                  <dd>
                    <Envoye p={p} />
                  </dd>
                </div>
                <div>
                  <dt>Reçu</dt>
                  <dd>
                    <Recu p={p} court />
                  </dd>
                </div>
                <div>
                  <dt>Réponse</dt>
                  <dd>
                    <Reponse p={p} />
                  </dd>
                </div>
                <div>
                  <dt>{p.reponse.recue ? 'Traitée' : 'Relance'}</dt>
                  <dd>
                    <Suite p={p} />
                  </dd>
                </div>
              </dl>
              <div class="cp-carte-a">
                <Action p={p} />
                <Tel p={p} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {liste.length > limite && (
        <div class="center-row">
          <Btn kind="ghost" onClick={() => setLimite(limite + PAS)}>
            Afficher plus ({nombre(liste.length - limite)})
          </Btn>
        </div>
      )}
    </div>
  );
}

function Th({k, f, maj, children}: {k: string; f: Filtres; maj: (p: Partial<Filtres>) => void; children: string}) {
  const on = f.tri === k;
  return (
    <th aria-sort={on ? (k === 'nom' || k === 'ville' || k === 'action' ? 'ascending' : 'descending') : undefined}>
      <button type="button" class={`cp-th ${on ? 'on' : ''}`} onClick={() => maj({tri: k})}>
        {children}
        <Icon name="arrow-up-down" size={13} />
      </button>
    </th>
  );
}
