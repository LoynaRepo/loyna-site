// Mêmes règles pour les clients dans le navigateur (src/commercial/clients-regles.ts) et dans le coffre
// (_systeme/clients.py) : sur les 3 clients fictifs du coffre (tests/test_clients.py), la prochaine action, l'étape et
// les QR codes à livrer calculés ici, avec des actions notées dans le panel, sont ceux que clients.py calcule une fois
// ces actions recopiées dans les fiches par panel.py.
//   node tools/commercial/test_clients.mjs
// Données fictives seulement ; rien n'est écrit dans le projet ni dans le coffre (dossier temporaire).
import {execFileSync} from 'node:child_process';
import {actionsNotees, clientAJour, estNoteAction, lireAction, texteAction, totauxClients, trierClients} from '../../src/commercial/clients-regles.ts';

const PYTHON = process.env.PYTHON ?? 'C:/Users/vaiko/AppData/Local/Programs/Python/Python313/python.exe';
const SYSTEME = process.env.COFFRE_SYSTEME ?? 'C:/Users/vaiko/Documents/Loyna Prospection/_systeme';
let ok = true;
const verifier = (cond, message) => {
  console.log((cond ? 'OK    ' : 'ÉCHEC ') + message);
  ok &&= !!cond;
};
const note = (i, texte, cree_le = '2026-10-23T09:00:00.000Z') => ({id: `ffff00000000000${i}`, cree_le, modifie_le: cree_le, texte});

// actions notées : 1) Salon Opale : commerce créé ; 2) Barbier Saphir : QR codes livrés ; Café Topaze : rien
const notes = {
  'Salon Opale': [note(1, texteAction('commerce_cree', '2026-10-23', 'salon-opale')), note(2, 'Rappeler pour le logo.')],
  'Barbier Saphir': [note(3, texteAction('qr_livres', '2026-10-22', 'remis en main propre')), note(4, '[CLIENT:inconnue] 2026-10-22')],
};
const script = `
import sys, json, tempfile
from datetime import date
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(SYSTEME)}); sys.path.insert(0, ${JSON.stringify(SYSTEME + '/tests')})
import test_clients, clients
notes = json.loads(sys.stdin.read())
with tempfile.TemporaryDirectory() as d:
    r = Path(d)
    test_clients.creer_clients_exemple(r)
    j = date(2026, 10, 23)
    avant, ta = clients.calculer_clients(r, j)
    for nom, ns in notes.items():
        clients.appliquer_actions_panel(r / "08 Clients" / f"{nom}.md", ns, aujourdhui=j)
    apres, tp = clients.calculer_clients(r, j)
print(json.dumps({"avant": avant, "totaux_avant": ta, "apres": apres, "totaux_apres": tp}, ensure_ascii=False))
`;
const py = JSON.parse(
  execFileSync(PYTHON, ['-B', '-c', script], {input: JSON.stringify(notes), encoding: 'utf8', env: {...process.env, PYTHONIOENCODING: 'utf-8'}}),
);
const auj = new Date(2026, 9, 23);
const resume = (c) => JSON.stringify({action: c.action, etape: c.etape.code, a_livrer: c.qr.a_livrer, jours: c.qr.jours_restants, actif: c.parcours.at(-1).fait});

// sans action notée : le navigateur retrouve exactement le calcul du coffre
for (const c of py.avant) verifier(resume(clientAJour(c, [], auj)) === resume(c), `${c.fiche} : même calcul que clients.py (${c.action.libelle})`);
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

console.log(ok ? 'TOUT EST BON' : 'DES TESTS ÉCHOUENT');
process.exit(ok ? 0 : 1);
