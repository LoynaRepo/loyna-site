// Mêmes règles pour les clients dans le navigateur (src/commercial/clients-regles.ts) et dans le coffre
// (_systeme/clients.py) : sur les 3 clients fictifs du coffre (tests/test_clients.py) et, une fois le coffre à la grille du
// 2026-10-31, sur des fiches en essai, en carte suspendue, en Pro et en Premium, la prochaine action, l'étape et les QR codes
// à livrer calculés ici, avec des actions notées dans le panel, sont ceux que clients.py calcule une fois ces actions
// recopiées dans les fiches par panel.py.
//   node tools/commercial/test_clients.mjs
// Le coffre change à l'étape 8 de la mise en ligne : avant, COFFRE_SYSTEME=<offre2>\coffre_pret\_systeme pour comparer à la
// copie préparée. Données fictives seulement ; rien n'est écrit dans le projet ni dans le coffre (dossier temporaire).
import {execFileSync} from 'node:child_process';
import {ACTIONS, actionsNotees, clientAJour, estNoteAction, libelleOffre, lireAction, offreHistorique, texteAction, totauxClients, trierClients} from '../../src/commercial/clients-regles.ts';

const PYTHON = process.env.PYTHON ?? 'C:/Users/vaiko/AppData/Local/Programs/Python/Python313/python.exe';
const SYSTEME = process.env.COFFRE_SYSTEME ?? 'C:/Users/vaiko/Documents/Loyna Prospection/_systeme';
let ok = true;
const verifier = (cond, message) => {
  console.log((cond ? 'OK    ' : 'ÉCHEC ') + message);
  ok &&= !!cond;
};
const note = (i, texte, cree_le = '2026-10-23T09:00:00.000Z') => ({id: `ffff00000000000${i}`, cree_le, modifie_le: cree_le, texte});

// actions notées : 1) Salon Opale : commerce créé ; 2) Barbier Saphir : QR codes livrés ; Café Topaze : rien ;
// 3) grille du 2026-10-31 : un Pro dont la carte finie vient d'être notée
const notes = {
  'Salon Opale': [note(1, texteAction('commerce_cree', '2026-10-23', 'salon-opale')), note(2, 'Rappeler pour le logo.')],
  'Barbier Saphir': [note(3, texteAction('qr_livres', '2026-10-22', 'remis en main propre')), note(4, '[CLIENT:inconnue] 2026-10-22')],
  'Pro Note': [note(5, texteAction('carte_finie', '2026-10-22', 'logo retouché'))],
};
// Fiches de la grille du 2026-10-31, tirées de celle de Café Topaze (commerce créé, documents envoyés, aucun QR code)
const FICHES_GRILLE = {
  'Essai Ambre': {
    formule: 'Starter', engagement: false, statut_abonnement: 'essai', essai_demarre_le: '2026-10-10', fin_essai: '2026-11-10', date_souscription: '', commande_recue_le: '',
    commerce_cree_le: '2026-10-10', documents_envoyes_le: '', fin_engagement: '', statut: 'essai', statut_paiement: 'essai', montant_paye: '', siret: '12345678900012',
  },
  'Suspendue Essai': {
    formule: 'Starter', engagement: false, statut_abonnement: 'essai terminé', essai_demarre_le: '2026-09-10', fin_essai: '2026-10-10', date_souscription: '', commande_recue_le: '',
    commerce_cree_le: '2026-09-10', documents_envoyes_le: '', fin_engagement: '', carte_suspendue_le: '2026-10-10', suspension_motif: 'essai terminé', statut: 'carte suspendue', statut_paiement: 'essai',
  },
  'Suspendue Paiement': {formule: 'Starter', engagement: false, fin_engagement: '', carte_suspendue_le: '2026-10-20', suspension_motif: 'paiement échoué', statut: 'carte suspendue', statut_paiement: 'échoué', paiement_echoue_le: '2026-10-05'},
  'Suspendue Fin': {formule: 'Starter', engagement: false, fin_engagement: '', carte_suspendue_le: '2026-10-20', suspension_motif: 'abonnement terminé', statut: 'carte suspendue'},
  'Pro Engage': {formule: 'Pro', engagement: true, date_souscription: '2026-10-01', fin_engagement: '2027-10-01'},
  'Pro Sans': {formule: 'Pro', engagement: false, date_souscription: '2026-10-20', fin_engagement: '', carte_finie_le: '2026-10-21', video_envoyee_le: '2026-10-21'},
  'Pro Note': {formule: 'Pro', engagement: true, date_souscription: '2026-10-21', fin_engagement: '2027-10-21'},
  'Premium Histo': {formule: 'Premium', engagement: true, date_souscription: '2026-10-01', fin_engagement: '2027-10-27'},
};
const script = `
import sys, json, shutil, tempfile
from datetime import date
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(SYSTEME)}); sys.path.insert(0, ${JSON.stringify(SYSTEME + '/tests')})
import test_clients, clients
entree = json.loads(sys.stdin.read())
notes, grille = entree["notes"], entree["grille"]
with tempfile.TemporaryDirectory() as d:
    r = Path(d)
    test_clients.creer_clients_exemple(r)
    a_la_grille = hasattr(clients, "services_pro")
    if a_la_grille:
        for nom, champs in grille.items():
            f = r / "08 Clients" / f"{nom}.md"
            shutil.copy(r / "08 Clients" / "Café Topaze.md", f)
            clients.modifier_fiche(f, {**champs, "identifiant_panel": clients.identifiant_client(nom)}, [])
    j = date(2026, 10, 23)
    avant, ta = clients.calculer_clients(r, j)
    for nom, ns in notes.items():
        f = r / "08 Clients" / f"{nom}.md"
        if f.is_file():
            clients.appliquer_actions_panel(f, ns, aujourdhui=j)
    apres, tp = clients.calculer_clients(r, j)
print(json.dumps({"a_la_grille": a_la_grille, "actions_panel": sorted(clients.ACTIONS_PANEL), "avant": avant, "totaux_avant": ta, "apres": apres, "totaux_apres": tp}, ensure_ascii=False))
`;
const py = JSON.parse(
  execFileSync(PYTHON, ['-B', '-c', script], {input: JSON.stringify({notes, grille: FICHES_GRILLE}), encoding: 'utf8', env: {...process.env, PYTHONIOENCODING: 'utf-8'}}),
);
const auj = new Date(2026, 9, 23);
const resume = (c) => JSON.stringify({action: c.action, etape: c.etape.code, a_livrer: c.qr.a_livrer, jours: c.qr.jours_restants, actif: c.parcours.at(-1).fait, services: (c.services_pro ?? []).map((s) => [s.code, s.a_faire])});

// sans action notée : le navigateur retrouve exactement le calcul du coffre
for (const c of py.avant) verifier(resume(clientAJour(c, [], auj)) === resume(c), `${c.fiche} : même calcul que clients.py (${c.action.libelle}${c.action.detail ? ` · ${c.action.detail}` : ''})`);
const t = totauxClients(py.avant.map((c) => clientAJour(c, [], auj)));
verifier(['actifs', 'mrr', 'qr_a_livrer', 'en_retard', 'urgents', 'a_traiter'].every((k) => t[k] === py.totaux_avant[k]), `mêmes totaux (${t.mrr} € par mois, ${t.en_retard} en retard)`);
verifier(trierClients(py.avant.map((c) => clientAJour(c, [], auj))).map((c) => c.fiche).join() === py.avant.map((c) => c.fiche).join(), 'même ordre (urgences d’abord)');

// avec les actions notées : le résultat est celui du coffre une fois les actions recopiées
const apres = Object.fromEntries(py.apres.map((c) => [c.fiche, c]));
for (const c of py.avant) {
  const ici = clientAJour(c, notes[c.fiche] ?? [], auj);
  verifier(resume(ici) === resume(apres[c.fiche]), `${c.fiche} avec actions notées : ${ici.action.libelle} (coffre : ${apres[c.fiche].action.libelle})`);
}
const opale = clientAJour(py.avant.find((c) => c.fiche === 'Salon Opale'), notes['Salon Opale'], auj);
verifier(opale.enAttente.commerce_cree?.texte === 'salon-opale' && opale.parcours.find((e) => e.code === 'commerce').attente, 'étape notée marquée « en attente du coffre »');
const t2 = totauxClients(py.avant.map((c) => clientAJour(c, notes[c.fiche] ?? [], auj)));
verifier(t2.en_retard === py.totaux_apres.en_retard && t2.qr_a_livrer === py.totaux_apres.qr_a_livrer, 'totaux après les actions : identiques au coffre');

// lecture des notes d'action
verifier(estNoteAction(note(5, '[CLIENT:inconnue] x')) && !lireAction(note(5, '[CLIENT:inconnue] x')) && !estNoteAction(note(6, 'Client content [CLIENT:documents]')),
  'note d’action : seulement en tête de note ; action inconnue ignorée');
verifier(texteAction('qr_livres', '2026-10-30', '  remis  en main propre ') === '[CLIENT:qr_livres] 2026-10-30 · remis en main propre', 'texte d’une action (format lu par clients.py)');
const deux = actionsNotees([note(7, '[CLIENT:documents] 2026-10-25', '2026-10-25T08:00:00.000Z'), note(8, '[CLIENT:documents] 2026-10-24', '2026-10-24T08:00:00.000Z')]);
verifier(deux.documents?.date === '2026-10-24', 'deux notes de la même action : la plus ancienne compte (comme dans le coffre)');
// QR code offert par le Parrainage LOYNA après une première livraison (qr.lot_le) : l'ancienne note ne compte plus
const lots = [note(9, '[CLIENT:qr_livres] 2026-10-30', '2026-10-30T15:00:00.000Z')];
verifier(actionsNotees(lots).qr_livres && !actionsNotees(lots, '2026-11-05').qr_livres,
  'QR offert (nouveau lot du 05/11) : la note « QR codes livrés » du 30/10 ne compte plus');
lots.push(note(10, '[CLIENT:qr_livres] 2026-11-12', '2026-11-12T10:00:00.000Z'));
verifier(actionsNotees(lots, '2026-11-05').qr_livres?.date === '2026-11-12', 'note posée après le début du lot : QR offert livré');
const avecLot = clientAJour({...py.avant[0], qr: {...py.avant[0].qr, commandes: 1, livres_le: '', lot_le: '2026-11-05'},
  parcours: py.avant[0].parcours.map((e) => (e.code === 'qr' ? {...e, fait: false, date: ''} : e))}, lots.slice(0, 1), auj);
verifier(!avecLot.parcours.find((e) => e.code === 'qr').fait && !avecLot.enAttente.qr_livres,
  'panel : le nouveau lot reste « à livrer » malgré l’ancienne note');

// --- Grille du 2026-10-31 ----------------------------------------------------------------------------------------------
verifier(offreHistorique('Premium') && offreHistorique('premium') && !offreHistorique('Pro') && !offreHistorique('Starter'), 'offre historique : Premium seulement');
// Données publiées avant la grille, encore en ligne jusqu'à l'étape 8 de la mise en ligne : aucun champ neuf, mais rien ne casse
const ancienClient = {
  id: 'abcdefabcdef', fiche: 'Barber Kong', commerce: 'Barber Kong', offre: {formule: 'Premium', periodicite: 'mensuel', libelle: 'Premium · mensuel', prix: 39.99, mensuel: 39.99},
  engagement: {fin: '2027-10-27', libelle: 'Fin d\'engagement'}, parcours: [{code: 'commande', libelle: 'Commande reçue', date: '2026-10-27', fait: true, sans_objet: false}, {code: 'commerce', libelle: 'Commerce créé', date: '2026-10-27', fait: true, sans_objet: false}, {code: 'documents', libelle: 'Documents envoyés', date: '2026-10-27', fait: true, sans_objet: false}, {code: 'qr', libelle: 'QR codes livrés', date: '', fait: true, sans_objet: true}, {code: 'actif', libelle: 'Client actif', date: '2026-10-27', fait: true, sans_objet: false}],
  etat: null, qr: {commandes: 0, detail: '', limite: '', livres_le: '', a_livrer: 0, jours_restants: null}, commerce_existant: null, abonnement_en_cours: true, mrr: 39.99, action: {code: 'aucune', ordre: 9, libelle: 'Rien à faire', detail: 'client actif', urgence: ''},
};
const ancien = clientAJour(ancienClient, [], auj);
verifier(ancien.action.code === 'aucune' && ancien.services_pro.length === 0 && !ancien.essai, 'données d’avant la grille : lisibles, rien à faire, aucun service de Pro');
verifier(libelleOffre(ancienClient.offre) === 'Premium · offre historique', `données d’avant la grille : Premium affiché comme offre historique (${libelleOffre(ancienClient.offre)})`);
verifier(totauxClients([ancien]).mrr === 39.99 && totauxClients([ancien]).actifs === 1, 'données d’avant la grille : son revenu reste compté, 39,99 € par mois');

if (!py.a_la_grille) {
  console.log('(coffre pas encore à la grille du 2026-10-31 : essai, carte suspendue et Pro non comparés ; relancer avec COFFRE_SYSTEME=<offre2>\\coffre_pret\\_systeme)');
} else {
  verifier(Object.keys(ACTIONS).sort().join() === py.actions_panel.join(), `mêmes actions notées dans le panel et dans le coffre (${py.actions_panel.join(', ')})`);
  const de = (fiche, depart = py.avant) => depart.find((c) => c.fiche === fiche);
  const essai = de('Essai Ambre');
  const ici = clientAJour(essai, [], auj);
  verifier(essai.etat?.code === 'essai' && ici.action.code === 'aucune' && ici.action.detail === 'essai jusqu’au 10/11/2026', `essai : rien à créer ni à envoyer (${ici.action.detail})`);
  verifier(essai.mrr === 0 && essai.offre.mensuel === 0 && !essai.abonnement_en_cours && essai.offre.libelle === 'Starter · essai', 'essai : revenu 0, pas un abonnement en cours');
  verifier(ici.essai.jours_restants === 18 && essai.essai.jours_restants === 18, 'essai : jours restants recalculés à la date du jour');
  verifier(!ici.parcours.at(-1).fait && ici.parcours.find((e) => e.code === 'documents').sans_objet, 'essai : pas encore client actif, documents sans objet');
  const paiement = clientAJour(de('Suspendue Paiement'), [], auj);
  verifier(paiement.etat.code === 'carte_suspendue' && paiement.action.code === 'paiement' && paiement.action.urgence === 'retard' && !paiement.abonnement_en_cours && paiement.mrr === 0, `carte suspendue, impayé : ${paiement.action.libelle} (${paiement.action.detail})`);
  const finEssai = clientAJour(de('Suspendue Essai'), [], auj);
  verifier(finEssai.action.code === 'aucune' && finEssai.action.detail === 'carte en pause depuis le 10/10 : essai terminé', `carte suspendue après l’essai : ${finEssai.action.detail}`);
  verifier(clientAJour(de('Suspendue Fin'), [], auj).action.code === 'aucune', 'carte suspendue, abonnement terminé : rien à faire, la reprise passe par le panier');
  const pro = clientAJour(de('Pro Engage'), [], auj);
  verifier(pro.action.code === 'service_pro' && pro.action.libelle === 'Carte finie à la main' && pro.action.urgence === 'retard', `Pro avec engagement : ${pro.action.libelle} (${pro.action.detail})`);
  const sans = clientAJour(de('Pro Sans'), [], auj);
  verifier(sans.action.code === 'aucune' && sans.services_pro.find((s) => s.code === 'kit').du_le === '2026-12-20', 'Pro sans engagement : kit dû après le 3e paiement, rien à faire avant');
  verifier(clientAJour(de('Pro Sans'), [], new Date(2026, 11, 20)).action.libelle === 'Kit à envoyer', 'Pro sans engagement : « Kit à envoyer » le jour du 3e paiement, recalculé à la date du jour');
  const noteCarte = clientAJour(de('Pro Note'), notes['Pro Note'], auj);
  verifier(noteCarte.enAttente.carte_finie?.date === '2026-10-22' && noteCarte.services_pro.find((s) => s.code === 'carte_finie').attente && noteCarte.action.libelle === 'Vidéo et visuels', `Pro : carte finie notée dans le panel, au suivant (${noteCarte.action.libelle})`);
  const barber = clientAJour(de('Premium Histo'), [], auj);
  verifier(barber.services_pro.length === 0 && barber.action.code === 'aucune' && barber.mrr === 39.99 && libelleOffre(barber.offre) === 'Premium · offre historique' && barber.engagement.fin === '2027-10-27', 'Premium : aucun service dû, 39,99 € par mois, offre historique');
  const tg = totauxClients(py.avant.map((c) => clientAJour(c, [], auj)));
  verifier(tg.essais === py.totaux_avant.essais && tg.cartes_suspendues === py.totaux_avant.cartes_suspendues && tg.essais === 1 && tg.cartes_suspendues === 3, `compteurs : ${tg.essais} essai, ${tg.cartes_suspendues} cartes suspendues, comme le coffre`);
}

console.log(ok ? 'TOUT EST BON' : 'DES TESTS ÉCHOUENT');
process.exit(ok ? 0 : 1);
