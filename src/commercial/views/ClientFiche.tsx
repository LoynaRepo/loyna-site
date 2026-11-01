// Fiche d'un client : prochaine action, parcours en étapes (avec les boutons « Commerce créé », « Documents
// envoyés », « QR codes livrés »), essai ou carte suspendue, services de Pro, notes, abonnement, QR codes sous verre,
// coordonnées, liens Stripe et espace client, carte, historique. Rien n'est modifié dans le coffre d'ici : les boutons
// enregistrent une note chiffrée que panel.py recopie dans la fiche à la publication suivante.
import type {ComponentChildren} from 'preact';
import qrcode from 'qrcode-generator';
import {useMemo, useState} from 'preact/hooks';
import {ACTIONS, annulerAction, clientsAffiches, libelleOffre, noteLibre, noterAction, offreHistorique, type ClientAffiche, type CodeAction} from '../clients';
import {isoJour} from '../clients-regles';
import {dateLongue, euros, fr, lienMail, lienSur, lienTel, pluriel} from '../format';
import {Icon} from '../icons';
import {ErreurNotes, notesEtat} from '../notes';
import {donnees, toast} from '../store';
import {Badge, Btn, Copier, Empty, Lien, Modal, PageHead, Panel, TexteLie} from '../ui';
import {ActionClient, BadgeEtape} from './Clients';
import {ParcoursContact} from './ContactEssai';
import {MarqueNotes, NotesProspect} from './Notes';

const ACTION_DE_ETAPE: Partial<Record<string, CodeAction>> = {commerce: 'commerce_cree', documents: 'documents', qr: 'qr_livres'};
const message = (e: unknown) => (e instanceof ErreurNotes ? e.message : 'Enregistrement impossible.');

function Ligne({t, children}: {t: string; children: ComponentChildren}) {
  return (
    <div>
      <dt>{t}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ClientFiche({id}: {id: string}) {
  const d = donnees.value!;
  const blocs = notesEtat.value.blocs;
  const c = useMemo(() => clientsAffiches(d.clients, blocs).find((x) => x.id === id), [d, blocs, id]);
  if (!c)
    return (
      <div class="page">
        <PageHead title="Client introuvable" back={{href: '#/clients', label: 'Clients'}} />
        <Empty icon="search" title="Ce client n’est plus dans les données">
          Sa fiche a peut-être été renommée ou déplacée dans le coffre. Revenez à la liste des clients.
        </Empty>
      </div>
    );
  const mail = lienMail(c.email);
  const tel = c.tel_principal && lienTel(c.tel_principal.lien);
  const obsidian = d.exemple ? null : `obsidian://open?vault=${encodeURIComponent(d.coffre)}&file=${encodeURIComponent(`08 Clients/${c.fiche}`)}`;
  const services = c.services_pro ?? [];
  // commerce, documents, QR codes ou service de Pro : bouton direct
  const prochaine = c.action.code === 'service_pro' ? services.find((s) => s.a_faire)?.code : ACTION_DE_ETAPE[c.action.code];
  const historique = [...c.historique].reverse();
  const o = c.offre;
  const enEssai = !!c.essai?.en_cours;
  const prix = o.prix === null ? '—' : enEssai ? 'rien à payer pendant l’essai, aucun revenu' : `${euros(o.mensuel ?? o.prix)} par mois, sans TVA`;

  return (
    <div class="page">
      <PageHead eyebrow={[c.activite, libelleOffre(o)].filter(Boolean).join(' · ') || 'Client'} title={c.commerce} back={{href: '#/clients', label: 'Clients'}}>
        <span class="cp-badges">
          <BadgeEtape c={c} />
          {o.formule && <Badge tone="gold">{o.formule}</Badge>}
          <MarqueNotes p={c} filtre={noteLibre} />
        </span>
      </PageHead>

      <div class="cd-grid cd-grid--b">
        <div class="stack">
          <Panel dark class={`cp-entete ${c.action.urgence ? 'cl-entete--urgent' : ''}`}>
            <p class="eyebrow">Prochaine action</p>
            <p class="cp-entete-action">
              {c.action.urgence && <Icon name="triangle-alert" size={20} />} {fr(c.action.libelle)}
              {c.action.detail && <small> · {fr(c.action.detail)}</small>}
            </p>
            <div class="btn-row">
              {prochaine && !c.enAttente[prochaine] && <BoutonAction c={c} code={prochaine} principal />}
              {tel && (
                <Btn kind={prochaine ? 'ghost' : 'gold'} icon="phone" href={tel} class={prochaine ? 'cp-btn-clair' : ''}>
                  {`Appeler ${c.tel_principal!.affiche}`}
                </Btn>
              )}
              {mail && (
                <Btn kind="ghost" icon="mail" href={mail} class="cp-btn-clair">
                  E-mail
                </Btn>
              )}
              {c.stripe.liens[0] && (
                <Btn kind="ghost" icon="credit-card" href={c.stripe.liens[0].href} external class="cp-btn-clair">
                  Stripe
                </Btn>
              )}
            </div>
          </Panel>

          <ParcoursContact c={c} />

          <Panel title="Parcours" sub="Les boutons enregistrent l’étape tout de suite ; elle est recopiée dans la fiche du coffre (date et historique) au prochain passage d’un agent.">
            <ol class="cl-parcours">
              {c.parcours.map((e) => {
                const code = ACTION_DE_ETAPE[e.code];
                const attente = code ? c.enAttente[code] : undefined;
                return (
                  <li class={e.sans_objet ? 'na' : attente ? 'attente' : e.fait ? 'on' : c.etape.code === e.code ? 'courant' : ''}>
                    <span class="cl-pt" aria-hidden="true">
                      <Icon name={e.sans_objet ? 'ban' : e.fait ? 'check' : 'clock'} size={14} />
                    </span>
                    <div class="cl-pt-t">
                      <strong>{e.libelle}</strong>
                      <small>
                        {e.sans_objet
                          ? e.code === 'documents'
                            ? 'aucun document pendant l’essai'
                            : 'aucun QR code commandé'
                          : e.fait
                            ? e.date
                              ? `le ${dateLongue(e.date)}`
                              : 'fait'
                            : e.code === 'qr' && c.qr.limite
                              ? `${c.qr.commandes} à livrer avant le ${dateLongue(c.qr.limite)}`
                              : e.code === 'actif' && enEssai
                                ? 'à la première souscription'
                                : 'à faire'}
                        {attente && ` · noté dans le panel${attente.texte ? ` (${attente.texte})` : ''}, pas encore dans le coffre`}
                      </small>
                    </div>
                    {code && !e.sans_objet && (
                      <div class="cl-pt-a">
                        {attente ? <Annuler c={c} code={code} /> : !e.fait && <BoutonAction c={c} code={code} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {c.etat && (
              <p class={`cl-etat cl-etat--${c.etat.code}`}>
                <Icon name={c.etat.code === 'paiement_echoue' || c.etat.code === 'carte_suspendue' ? 'circle-alert' : c.etat.code === 'termine' ? 'ban' : 'calendar-clock'} size={18} />
                <span>
                  <strong>{c.etat.libelle}</strong>
                  {c.etat.code === 'essai' &&
                    `${c.etat.date ? ` jusqu’au ${dateLongue(c.etat.date)}` : ''}${c.essai?.jours_restants != null && c.essai.jours_restants >= 0 ? ` (encore ${pluriel(c.essai.jours_restants, 'jour', 'jours')})` : ''}. Aucun prélèvement, aucun document, aucun service de Pro. Sans abonnement à la fin, la carte se met en pause. Les mails de relance partent du produit : pas de prospection.`}
                  {c.etat.code === 'carte_suspendue' &&
                    `${c.etat.date ? ` depuis le ${dateLongue(c.etat.date)}` : ''}${c.etat.motif ? ` : ${c.etat.motif}` : ''}. La carte reste dans les téléphones avec son solde, mais elle ne crédite plus. Tout repart dès que le paiement passe ou que l’abonnement est repris. Sans reprise, données supprimées 90 jours après l’arrêt.`}
                  {c.etat.code === 'paiement_echoue' && c.etat.date && ` le ${dateLongue(c.etat.date)} : relancer le client (portail Stripe), puis remettre « statut_paiement: payé » dans la fiche une fois réglé. Sans règlement, la carte se met en pause 15 jours après le premier échec.`}
                  {c.etat.code === 'resiliation' &&
                    `${c.etat.demande_le ? ` le ${dateLongue(c.etat.demande_le)}` : ''}${c.etat.date ? ` : l’abonnement prend fin le ${dateLongue(c.etat.date)}.` : '.'}`}
                  {c.etat.code === 'termine' && (c.etat.date ? ` le ${dateLongue(c.etat.date)}.` : '.')}
                </span>
              </p>
            )}
          </Panel>

          {services.length > 0 && (
            <Panel title="Services de Pro" sub="À livrer une fois, sous 15 jours. Les boutons enregistrent la date tout de suite ; elle est recopiée dans la fiche du coffre au prochain passage d’un agent.">
              <ol class="cl-parcours">
                {services.map((s) => {
                  const attente = c.enAttente[s.code];
                  return (
                    <li class={attente ? 'attente' : s.fait_le ? 'on' : s.a_faire ? 'courant' : ''}>
                      <span class="cl-pt" aria-hidden="true">
                        <Icon name={s.fait_le ? 'check' : 'clock'} size={14} />
                      </span>
                      <div class="cl-pt-t">
                        <strong>{s.libelle}</strong>
                        <small>
                          {s.fait_le ? `fait le ${dateLongue(s.fait_le)}` : s.a_faire ? `à faire avant le ${dateLongue(s.limite)}` : `dû à partir du ${dateLongue(s.du_le)}`}
                          {attente && ` · noté dans le panel${attente.texte ? ` (${attente.texte})` : ''}, pas encore dans le coffre`}
                        </small>
                      </div>
                      <div class="cl-pt-a">{attente ? <Annuler c={c} code={s.code} /> : !s.fait_le && <BoutonAction c={c} code={s.code} />}</div>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )}

          <Panel title="Notes" sub="Chiffrées dans ce navigateur avant l’envoi : le serveur ne peut pas les lire." class="cp-pnl-notes">
            <NotesProspect p={c} filtre={noteLibre} />
          </Panel>

          <Panel title="Abonnement">
            <dl class="cp-dl">
              <Ligne t="Offre">
                {libelleOffre(o) || '—'}
                <small>{fr(prix)}</small>
                {offreHistorique(o.formule) && <small>{fr('Plus vendue : il garde son prix et sa durée, avec les droits de Pro.')}</small>}
              </Ligne>
              {c.essai?.demarre_le && (
                <Ligne t="Essai">
                  {`démarré le ${dateLongue(c.essai.demarre_le)}`}
                  {c.essai.fin && <small>{`${enEssai ? 'jusqu’au' : 'fin le'} ${dateLongue(c.essai.fin)}`}</small>}
                </Ligne>
              )}
              <Ligne t="Souscrit le">{c.date_souscription ? dateLongue(c.date_souscription) : enEssai ? 'pas encore' : '—'}</Ligne>
              {c.montant_paye && (
                <Ligne t="Montant payé">
                  {c.montant_paye}
                  {c.code_promo && <small>code {c.code_promo}</small>}
                  {c.parrainage_filleul && <small>Parrainage LOYNA ({c.parrainage_filleul}) : premier mois offert</small>}
                </Ligne>
              )}
              <Ligne t="Paiement">
                {c.etat?.code === 'paiement_echoue' || (c.etat?.code === 'carte_suspendue' && c.paiement.statut === 'échoué') ? <Badge tone="red">échoué</Badge> : enEssai ? 'aucun pendant l’essai' : c.paiement.statut || '—'}
                {c.paiement.document && !enEssai && <small>{c.paiement.document === 'facture' ? 'facture LOYNA' : 'récapitulatif de paiement Stripe'}</small>}
              </Ligne>
              {c.engagement.fin ? <Ligne t={c.engagement.libelle}>{dateLongue(c.engagement.fin)}</Ligne> : c.engagement.actif === false && !enEssai && <Ligne t="Engagement">sans engagement</Ligne>}
              {c.etat?.code === 'resiliation' && <Ligne t="Résiliation">{c.etat.date ? `fin le ${dateLongue(c.etat.date)}` : 'demandée'}</Ligne>}
              <Ligne t="Documents">
                {enEssai ? 'aucun pendant l’essai' : c.parcours.find((e) => e.code === 'documents')?.fait ? 'envoyés' : 'pas encore envoyés'}
                <small>{enEssai ? 'Les 4 PDF partent à la première souscription.' : <code>documents_client.py envoyer "08 Clients/{c.fiche}.md"</code>}</small>
              </Ligne>
            </dl>
          </Panel>

          {(c.cartes_demo?.apple || c.cartes_demo?.google) && (
            <Panel title="Carte de démonstration" sub="Aux couleurs de sa commande : à scanner avec l’appareil photo du téléphone. Carte figée (pas de mises à jour).">
              <div class="cl-demo">
                {c.cartes_demo?.apple && <CarteDemo titre="Apple Wallet · iPhone" lien={c.cartes_demo.apple} note="Tout iPhone peut l’ajouter." />}
                {c.cartes_demo?.google && (
                  <CarteDemo
                    titre="Google Wallet · Android"
                    lien={c.cartes_demo.google}
                    note="Tant que Google n’a pas validé la publication : seulement les comptes de test de la Pay & Wallet Console."
                  />
                )}
              </div>
            </Panel>
          )}

          <Panel title="QR codes sous verre" sub="Achat unique, livré sous 15 jours au plus à l’adresse de facturation.">
            {c.qr.commandes ? (
              <dl class="cp-dl">
                <Ligne t="Commandés">
                  {c.qr.commandes}
                  {c.qr.detail && <small>{fr(c.qr.detail)}</small>}
                </Ligne>
                <Ligne t="À livrer avant le">
                  {c.qr.limite ? dateLongue(c.qr.limite) : '—'}
                  {c.qr.a_livrer > 0 && c.qr.jours_restants !== null && (
                    <small class={c.qr.jours_restants < 3 ? 'cl-rouge' : ''}>
                      {c.qr.jours_restants < 0 ? `en retard de ${-c.qr.jours_restants} j` : c.qr.jours_restants === 0 ? 'aujourd’hui' : `dans ${c.qr.jours_restants} j`}
                    </small>
                  )}
                </Ligne>
                <Ligne t="Livrés">
                  {c.enAttente.qr_livres
                    ? `le ${dateLongue(c.enAttente.qr_livres.date)} (noté dans le panel)`
                    : c.qr.livres_le
                      ? `le ${dateLongue(c.qr.livres_le)}`
                      : 'pas encore'}
                </Ligne>
                {c.adresse_facturation && <Ligne t="Adresse de livraison">{c.adresse_facturation}</Ligne>}
              </dl>
            ) : (
              <p class="muted cp-m0">Aucun QR code sous verre commandé.</p>
            )}
          </Panel>

          <Panel title="Historique" sub="Les dernières lignes de la fiche, la plus récente en premier.">
            {historique.length ? (
              <ol class="cp-histo">
                {historique.map((h) => (
                  <li>
                    <TexteLie texte={h} />
                  </li>
                ))}
              </ol>
            ) : (
              <p class="muted cp-m0">Aucune ligne d’historique.</p>
            )}
          </Panel>
        </div>

        <div class="stack">
          <Panel title="Contact">
            <dl class="cp-dl">
              <Ligne t="Contact">{c.contact.complet || <span class="muted">inconnu</span>}</Ligne>
              <Ligne t="Téléphone">
                {c.telephones.length ? (
                  c.telephones.map((x) => (
                    <a class="cp-tel" href={lienTel(x.lien) ?? undefined}>
                      <Icon name={x.type === 'mobile' ? 'smartphone' : 'phone'} size={15} />
                      <span>
                        {x.affiche} <small>{x.type}</small>
                      </span>
                    </a>
                  ))
                ) : (
                  <span class="muted">{c.telephone || 'aucun'}</span>
                )}
              </Ligne>
              <Ligne t="E-mail">{mail ? <a href={mail}>{c.email}</a> : <span class="muted">{c.email || 'aucun'}</span>}</Ligne>
              {c.ville && <Ligne t="Ville">{c.ville}</Ligne>}
              {c.adresse_facturation && <Ligne t="Adresse de facturation">{c.adresse_facturation}</Ligne>}
              {c.siren && (
                <Ligne t="SIREN">
                  <Lien href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${c.siren}`}>{c.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</Lien>
                </Ligne>
              )}
              {c.siret && (
                <Ligne t="SIRET">
                  <Lien href={`https://annuaire-entreprises.data.gouv.fr/etablissement/${c.siret}`}>{c.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')}</Lien>
                </Ligne>
              )}
              {lienSur(c.instagram) && (
                <Ligne t="Instagram">
                  <Lien href={c.instagram!}>{c.instagram!.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}</Lien>
                </Ligne>
              )}
              {c.prospect_id && (
                <Ligne t="Prospect d’origine">
                  <a href={`#/prospect/${c.prospect_id}`}>{c.prospect || 'fiche prospect'}</a>
                </Ligne>
              )}
            </dl>
          </Panel>

          <Panel title="Espace client et Stripe">
            <dl class="cp-dl">
              <Ligne t="Compte">
                {c.compte || <span class="muted">inconnu</span>}
                <small>e-mail de connexion du commerçant</small>
              </Ligne>
              <Ligne t="Espace client">
                <Lien href={c.lien_espace_client}>{c.lien_espace_client.replace(/^https?:\/\//, '')}</Lien>
                {c.commerce_existant === true && <small>commerce déjà existant au moment du paiement</small>}
              </Ligne>
              {c.identifiant_commerce && <Ligne t="Identifiant du commerce">{c.identifiant_commerce}</Ligne>}
              {lienSur(c.lien_inscription) && (
                <Ligne t="Lien d’inscription">
                  <Lien href={c.lien_inscription}>{c.lien_inscription.replace(/^https?:\/\//, '')}</Lien>
                </Ligne>
              )}
              {c.stripe.liens.map((l) => (
                <Ligne t={l.libelle}>
                  <Lien href={l.href}>
                    <Icon name="external-link" size={14} /> <span>{l.href.split('/').pop()?.replace(/^search\?query=/, '')}</span>
                  </Lien>
                </Ligne>
              ))}
              {c.stripe.facture && <Ligne t="Facture Stripe">{c.stripe.facture}</Ligne>}
            </dl>
            {c.stripe.abonnement && (
              <div class="btn-row cl-copier">
                <Copier texte={c.stripe.abonnement} label="Copier l’abonnement" />
              </div>
            )}
          </Panel>

          <Panel title="Carte de fidélité">
            <dl class="cp-dl">
              <Ligne t="Programme">{c.programme.nom || <span class="muted">à définir</span>}</Ligne>
              <Ligne t="Récompense">
                {c.programme.recompense || <span class="muted">à définir</span>}
                {c.programme.passages && <small>au bout de {c.programme.passages} passages</small>}
              </Ligne>
              {c.couleurs && (c.couleurs.fond || c.couleurs.accent) && (
                <Ligne t="Couleurs">
                  <span class="cl-couleurs">
                    {[c.couleurs.fond, c.couleurs.accent].filter((x) => /^#[0-9a-f]{6}$/i.test(x)).map((x) => (
                      <span>
                        <i style={{background: x}} />
                        {x}
                      </span>
                    ))}
                  </span>
                </Ligne>
              )}
            </dl>
            {obsidian && (
              <p class="cp-obsidian">
                <a href={obsidian}>Ouvrir la fiche dans Obsidian</a> <small class="muted">(sur l’ordinateur du coffre)</small>
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Bouton d'une étape : date (aujourd'hui par défaut) et précision facultative, puis note chiffrée [CLIENT:…]. */
/** Carte de démonstration (LOYNA scripts/google-poc/demo-client.ts) : QR code du lien d'ajout, lisible à l'écran.
 *  Correction L : le lien Google (jeton signé) est long, des modules plus gros se scannent mieux. */
function CarteDemo({titre, lien, note}: {titre: string; lien: string; note: string}) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'L');
    q.addData(lien);
    q.make();
    const n = q.getModuleCount();
    const m = 3;
    const s = n + m * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let x = 0; x < n; x++) if (q.isDark(r, x)) d += `M${x + m} ${r + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" role="img" aria-label="QR code ${titre}"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#121216"/></svg>`;
  }, [lien, titre]);
  return (
    <figure class="cl-demo-carte">
      <figcaption>{titre}</figcaption>
      <div class="cl-demo-qr" dangerouslySetInnerHTML={{__html: svg}} />
      <p class="muted">{note}</p>
      <div class="cl-demo-actions">
        <Lien href={lien}>Ouvrir le lien</Lien>
        <Copier texte={lien} label="Copier le lien" />
      </div>
    </figure>
  );
}

function BoutonAction({c, code, principal = false}: {c: ClientAffiche; code: CodeAction; principal?: boolean}) {
  const etat = notesEtat.value;
  const pret = etat.etat === 'pret'; // pendant le chargement, une écriture serait écrasée : bouton en attente
  const a = ACTIONS[code];
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState(isoJour(new Date()));
  const [precision, setPrecision] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const confirmer = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErreur('Date invalide.');
      return;
    }
    setEnvoi(true);
    setErreur('');
    try {
      await noterAction(c.id, code, date, precision, c.qr.lot_le ?? '');
      setOuvert(false);
      toast(`${a.fait} : noté. La fiche du coffre sera mise à jour au prochain passage d’un agent.`);
    } catch (e) {
      setErreur(message(e));
    } finally {
      setEnvoi(false);
    }
  };
  const titre = code === 'qr_livres' ? `${a.bouton} (${c.qr.commandes})` : a.bouton;
  return (
    <>
      <Btn
        kind={principal ? 'gold' : 'ghost'}
        small={!principal}
        icon={code === 'qr_livres' ? 'package-check' : code === 'documents' ? 'file-check' : 'check'}
        busy={etat.etat === 'chargement'}
        disabled={!pret}
        title={pret ? undefined : etat.message || 'Notes indisponibles'}
        onClick={() => {
          setDate(isoJour(new Date()));
          setErreur('');
          setOuvert(true);
        }}
      >
        {titre}
      </Btn>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title={`${a.bouton} · ${c.commerce}`}>
        <div class="stack">
          <label class="cp-filtre" for={`date-${code}-${c.id}`}>
            <span>Date</span>
          </label>
          <input id={`date-${code}-${c.id}`} type="date" class="cl-champ" value={date} max={isoJour(new Date())} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          <label class="cp-filtre" for={`precision-${code}-${c.id}`}>
            <span>{a.precision}</span>
          </label>
          <input id={`precision-${code}-${c.id}`} type="text" class="cl-champ" maxLength={120} value={precision} onInput={(e) => setPrecision((e.target as HTMLInputElement).value)} />
          <p class="muted small cp-m0">{fr(a.aide)}</p>
          {erreur && (
            <p class="cp-notes-err" role="alert">
              {fr(erreur)}
            </p>
          )}
          <div class="btn-row">
            <Btn kind="gold" icon="check" busy={envoi} onClick={confirmer}>
              Enregistrer
            </Btn>
            <Btn kind="ghost" onClick={() => setOuvert(false)}>
              Annuler
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Annule une étape notée dans le panel, tant qu'elle n'est pas recopiée dans le coffre. */
function Annuler({c, code}: {c: ClientAffiche; code: CodeAction}) {
  const [envoi, setEnvoi] = useState(false);
  const a = c.enAttente[code];
  if (!a) return null;
  return (
    <Btn
      kind="quiet"
      small
      icon="undo-2"
      busy={envoi}
      disabled={notesEtat.value.etat !== 'pret'}
      onClick={async () => {
        setEnvoi(true);
        try {
          await annulerAction(c.id, a.note);
          toast('Étape annulée.', 'info');
        } catch (e) {
          toast(message(e), 'error');
        } finally {
          setEnvoi(false);
        }
      }}
    >
      Annuler
    </Btn>
  );
}
