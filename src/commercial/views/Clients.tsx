// Clients : commerces en essai ou qui ont souscrit (fiches « 08 Clients » du coffre, calculées par _systeme/clients.py).
// Compteurs (abonnements en cours, revenu mensuel, QR codes à livrer, actions en retard), liste filtrable avec la
// prochaine action ; tableau sur ordinateur, cartes sur téléphone. Les actions notées dans le panel (boutons de la
// fiche) comptent tout de suite, avant même leur recopie dans le coffre.
import type {ComponentChildren} from 'preact';
import {useMemo, useState} from 'preact/hooks';
import {clientsAffiches, libelleOffre, noteLibre, offreHistorique, type ClientAffiche} from '../clients';
import {totauxClients} from '../clients-regles';
import {cle, dateCourte, euros, fr, nombre, pluriel} from '../format';
import {Icon} from '../icons';
import {notesEtat} from '../notes';
import {donnees, filtresClients, FILTRES_CLIENTS_VIDES, type FiltresClients} from '../store';
import {Badge, Empty, PageHead, type Tone} from '../ui';
import {MarqueNotes} from './Notes';
import {useLarge} from './Prospects';
import {Tel} from './commun';

const ETAPES: {v: string; l: string}[] = [
  {v: 'commerce', l: 'Commerce à créer'},
  {v: 'documents', l: 'Documents à envoyer'},
  {v: 'qr', l: 'QR codes à livrer'},
  {v: 'actif', l: 'Client actif'},
  {v: 'essai', l: 'Essai'},
  {v: 'carte_suspendue', l: 'Carte suspendue'},
  {v: 'paiement_echoue', l: 'Paiement échoué'},
  {v: 'resiliation', l: 'Résiliation demandée'},
  {v: 'termine', l: 'Terminé'},
];
const SUIVI: {v: string; l: string}[] = [
  {v: 'a_traiter', l: 'À traiter'},
  {v: 'urgent', l: 'En retard ou urgent'},
];

/** Où en est le client : son état particulier, sinon l'étape du parcours. */
export function codeEtape(c: ClientAffiche): string {
  return c.etat?.code ?? c.etape.code;
}

const TON_ETAPE: Record<string, Tone> = {
  commerce: 'gold',
  documents: 'blue',
  qr: 'blue',
  actif: 'green',
  essai: 'blue',
  carte_suspendue: 'red',
  paiement_echoue: 'red',
  resiliation: 'amber',
  termine: 'dark',
};
export function BadgeEtape({c}: {c: ClientAffiche}) {
  const code = codeEtape(c);
  return <Badge tone={TON_ETAPE[code] ?? 'neutral'}>{c.etat?.libelle ?? c.etape.libelle}</Badge>;
}

export function ActionClient({c, detail = true}: {c: ClientAffiche; detail?: boolean}) {
  const a = c.action;
  const ton: Tone = a.urgence ? 'red' : a.code === 'aucune' ? 'neutral' : a.code === 'commerce' ? 'gold' : 'blue';
  return (
    <span class="cp-action">
      <Badge tone={ton}>
        {a.urgence && <Icon name="triangle-alert" size={12} />}
        {a.libelle}
      </Badge>
      {detail && a.detail && <small>{fr(a.detail)}</small>}
    </span>
  );
}

/** Parcours en points : commande, commerce, documents, QR codes, actif. */
export function MiniParcours({c}: {c: ClientAffiche}) {
  return (
    <ol class="cl-mini" aria-label={`Parcours : ${c.etape.libelle}`}>
      {c.parcours.map((e) => (
        <li class={e.sans_objet ? 'na' : e.attente ? 'attente' : e.fait ? 'on' : ''} title={`${e.libelle}${e.sans_objet ? ' : sans objet' : e.fait ? (e.date ? ` : ${dateCourte(e.date)}` : '') : ' : à faire'}${e.attente ? ' (noté dans le panel)' : ''}`}>
          <span class="sr-only">
            {e.libelle} : {e.sans_objet ? 'sans objet' : e.fait ? 'fait' : 'à faire'}
          </span>
        </li>
      ))}
    </ol>
  );
}

function correspond(c: ClientAffiche, f: FiltresClients, mots: string[], textes: Map<string, string>): boolean {
  if (f.offre && c.offre.formule !== f.offre) return false;
  if (f.etape && codeEtape(c) !== f.etape) return false;
  if (f.suivi === 'a_traiter' && c.action.code === 'aucune') return false;
  if (f.suivi === 'urgent' && !c.action.urgence) return false;
  if (mots.length) {
    const t = textes.get(c.id) ?? '';
    if (!mots.every((m) => t.includes(m))) return false;
  }
  return true;
}

interface Tuile {
  l: string;
  v: string;
  s?: string;
  f?: Partial<FiltresClients>;
  fort?: boolean;
}

export function Clients() {
  const d = donnees.value!;
  const f = filtresClients.value;
  const large = useLarge();
  const [ouvert, setOuvert] = useState(false);
  const blocs = notesEtat.value.blocs;
  const tous = useMemo(() => clientsAffiches(d.clients, blocs), [d, blocs]);
  const t = useMemo(() => totauxClients(tous), [tous]);
  const textes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of tous)
      m.set(
        c.id,
        cle([c.commerce, c.activite, c.contact.complet, c.email, c.compte, libelleOffre(c.offre), c.adresse_facturation, c.action.libelle, c.statut].join(' ')) +
          ' ' +
          c.telephones.map((x) => x.affiche.replace(/\s/g, '')).join(' ') +
          ' ' +
          cle((blocs[c.id]?.notes ?? []).filter(noteLibre).map((n) => n.texte).join(' ')),
      );
    return m;
  }, [tous, blocs]);
  const maj = (p: Partial<FiltresClients>) => (filtresClients.value = {...filtresClients.value, ...p});
  const mots = cle(f.q).replace(/(\d)\s+(?=\d)/g, '$1').split(/\s+/).filter(Boolean);
  const liste = tous.filter((c) => correspond(c, f, mots, textes));
  const actifs = (['offre', 'etape', 'suivi'] as const).filter((k) => f[k]).length;
  const offres = [...new Set(tous.map((c) => c.offre.formule).filter(Boolean))].sort();

  const tuiles: Tuile[] = [
    {
      l: 'Clients actifs',
      v: nombre(t.actifs),
      s: [
        `${pluriel(t.clients, 'client', 'clients')} au total`,
        t.essais ? pluriel(t.essais, 'en essai', 'en essai') : '',
        t.cartes_suspendues ? pluriel(t.cartes_suspendues, 'carte suspendue', 'cartes suspendues') : '',
        t.resiliations ? pluriel(t.resiliations, 'résiliation demandée', 'résiliations demandées') : '',
      ]
        .filter(Boolean)
        .join(' · '),
      f: {},
    },
    {l: 'Revenu mensuel', v: euros(t.mrr), s: 'abonnements en cours, sans TVA ; 0 pendant un essai'},
    {l: 'QR codes à livrer', v: nombre(t.qr_a_livrer), s: t.qr_clients ? `pour ${pluriel(t.qr_clients, 'client', 'clients')}, sous 15 jours` : 'aucune livraison en attente', f: {etape: 'qr'}, fort: t.qr_a_livrer > 0},
    {
      l: 'Actions en retard',
      v: nombre(t.en_retard),
      s: `${nombre(t.urgents - t.en_retard)} à moins de 3 jours · ${nombre(t.a_traiter)} à traiter`,
      f: {suivi: 'urgent'},
      fort: t.en_retard > 0,
    },
  ];
  const select = (k: keyof FiltresClients, label: string, options: {v: string; l: string}[], tousLib = 'Tous') => (
    <label class="cp-filtre">
      <span>{label}</span>
      <select class="sel-sm" value={f[k]} onChange={(e) => maj({[k]: (e.target as HTMLSelectElement).value} as Partial<FiltresClients>)}>
        <option value="">{tousLib}</option>
        {options.map((o) => (
          <option value={o.v}>{o.l}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div class="page">
      <PageHead eyebrow="Espace commercial" title="Clients">
        <span class="ph-count">{liste.length === tous.length ? pluriel(tous.length, 'client', 'clients') : `${nombre(liste.length)} sur ${nombre(tous.length)}`}</span>
      </PageHead>

      <div class="kpis cp-kpis cl-kpis">
        {tuiles.map((x) =>
          x.f ? (
            <button type="button" class={`kpi cp-kpi ${x.fort ? 'cp-kpi--fort' : ''}`} onClick={() => (filtresClients.value = {...FILTRES_CLIENTS_VIDES, ...x.f})}>
              <span class="kpi-l">{x.l}</span>
              <strong class="kpi-v">{x.v}</strong>
              {x.s && <span class="kpi-d">{fr(x.s)}</span>}
            </button>
          ) : (
            <div class="kpi cp-kpi">
              <span class="kpi-l">{x.l}</span>
              <strong class="kpi-v">{x.v}</strong>
              {x.s && <span class="kpi-d">{fr(x.s)}</span>}
            </div>
          ),
        )}
      </div>

      {!tous.length ? (
        <Empty icon="handshake" title="Aucun client pour l’instant">
          {d.clients ? (
            <p>
              {fr(
                'Chaque essai démarré et chaque commande payée sur loyna.fr créent sa fiche dans 08 Clients (agent Trieur, clients.py creer-depuis-mail) : le client apparaîtra ici à la publication suivante, avec son parcours et la prochaine action.',
              )}
            </p>
          ) : (
            <p>{fr('Ces données ont été publiées avant la section Clients : elle se remplira à la prochaine publication (panel.py publier).')}</p>
          )}
        </Empty>
      ) : (
        <>
          <div class="toolbar">
            <div class="cp-recherche">
              <label class="search">
                <Icon name="search" size={18} />
                <span class="sr-only">Rechercher un client</span>
                <input type="search" placeholder="Commerce, contact, téléphone, e-mail, note…" value={f.q} onInput={(e) => maj({q: (e.target as HTMLInputElement).value})} />
              </label>
              <button type="button" class={`chip cp-filtres-btn ${ouvert || actifs ? 'on' : ''}`} onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}>
                <Icon name="list-filter" size={16} />
                Filtres{actifs ? ` (${actifs})` : ''}
              </button>
            </div>
            <div class={`cp-filtres ${ouvert ? 'is-open' : ''}`}>
              {select('offre', 'Offre', offres.map((o) => ({v: o, l: offreHistorique(o) ? `${o} (offre historique)` : o})), 'Toutes')}
              {select('etape', 'Étape', ETAPES, 'Toutes')}
              {select('suivi', 'À traiter', SUIVI)}
              {(actifs > 0 || f.q) && (
                <button type="button" class="linkish cp-reinit" onClick={() => (filtresClients.value = {...FILTRES_CLIENTS_VIDES})}>
                  Tout afficher
                </button>
              )}
            </div>
          </div>

          {!liste.length ? (
            <Empty icon="search" title="Aucun client ne correspond">
              Essayez une autre recherche ou retirez un filtre.
            </Empty>
          ) : large ? (
            <div class="pnl cp-tableau">
              <div class="tbl-wrap">
                <table class="tbl cl-tbl">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Contact</th>
                      <th>Offre</th>
                      <th>Parcours</th>
                      <th>QR codes</th>
                      <th>Prochaine action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((c) => (
                      <tr class={`cp-ligne ${c.action.urgence ? 'cl-urgent' : ''}`} onClick={() => (location.hash = `#/client/${c.id}`)}>
                        <td class="cp-nom">
                          <a href={`#/client/${c.id}`} onClick={(e) => e.stopPropagation()}>
                            {c.commerce}
                          </a>
                          <span class="cp-badges">
                            <BadgeEtape c={c} />
                            <MarqueNotes p={c} filtre={noteLibre} />
                          </span>
                        </td>
                        <td>
                          <span class="cl-contact">{c.contact.complet || <span class="muted">—</span>}</span>
                          <Tel p={c} />
                        </td>
                        <td>
                          <strong class="cl-offre">{libelleOffre(c.offre) || '—'}</strong>
                          {c.date_souscription ? <small class="cl-sous">depuis le {dateCourte(c.date_souscription)}</small> : c.essai?.fin && <small class="cl-sous">{c.essai.en_cours ? 'jusqu’au' : 'terminé le'} {dateCourte(c.essai.fin)}</small>}
                        </td>
                        <td>
                          <MiniParcours c={c} />
                        </td>
                        <td>
                          <QrCourt c={c} />
                        </td>
                        <td>
                          <ActionClient c={c} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <ul class="cp-cartes">
              {liste.map((c) => (
                <li class={`cp-carte ${c.action.urgence ? 'cl-urgent' : ''}`}>
                  <div class="cp-carte-h">
                    <a class="cp-carte-lien" href={`#/client/${c.id}`}>
                      {c.commerce}
                    </a>
                    <span class="cp-badges cp-badges--carte">
                      <MarqueNotes p={c} filtre={noteLibre} />
                      <BadgeEtape c={c} />
                    </span>
                  </div>
                  <p class="cp-carte-s">{[libelleOffre(c.offre), c.contact.complet, c.date_souscription ? `depuis le ${dateCourte(c.date_souscription)}` : c.essai?.fin && `${c.essai.en_cours ? 'jusqu’au' : 'terminé le'} ${dateCourte(c.essai.fin)}`].filter(Boolean).join(' · ')}</p>
                  <div class="cl-carte-p">
                    <MiniParcours c={c} />
                    <QrCourt c={c} />
                  </div>
                  <div class="cp-carte-a">
                    <ActionClient c={c} />
                    <Tel p={c} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {tous.length > 0 && (
        <p class="muted small cp-m0">
          {fr('Revenu mensuel : abonnements en cours, au prix de leur offre, sans TVA ; 0 pendant un essai ou un arrêt. Les clients se créent et se corrigent dans les fiches de 08 Clients (Obsidian).')}
        </p>
      )}
    </div>
  );
}

function QrCourt({c}: {c: ClientAffiche}): ComponentChildren {
  if (!c.qr.commandes) return <span class="muted">aucun</span>;
  if (!c.qr.a_livrer)
    return (
      <span class="cp-oui">
        {c.qr.commandes} livrés{c.qr.livres_le && <small> {dateCourte(c.qr.livres_le)}</small>}
      </span>
    );
  return (
    <span class={`cl-qr ${c.action.urgence && c.action.code !== 'paiement' ? 'cl-qr--urgent' : ''}`}>
      <Icon name="qr-code" size={14} />
      {c.qr.a_livrer} à livrer
      {c.qr.limite && <small> avant le {dateCourte(c.qr.limite)}</small>}
    </span>
  );
}

/** Lien « Voir les clients » (tableau de bord). */
export function AlerteClients() {
  const d = donnees.value!;
  const blocs = notesEtat.value.blocs;
  const tous = useMemo(() => clientsAffiches(d.clients, blocs), [d, blocs]);
  const t = totauxClients(tous);
  if (!t.urgents) return null;
  return (
    <a class="quick-scan cp-alerte cl-alerte" href="#/clients" onClick={() => (filtresClients.value = {...FILTRES_CLIENTS_VIDES, suivi: 'urgent'})}>
      <span class="qs-i">
        <Icon name="handshake" size={24} />
      </span>
      <span>
        <strong>{t.urgents > 1 ? `${nombre(t.urgents)} actions clients urgentes` : '1 action client urgente'}</strong>
        <small>{fr(`${t.en_retard ? `${nombre(t.en_retard)} en retard · ` : ''}QR codes à livrer, services Pro, paiement à relancer : onglet Clients.`)}</small>
      </span>
      <Icon name="chevron-right" />
    </a>
  );
}

