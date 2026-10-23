// Compatibilité du chiffrement des notes entre le navigateur (src/commercial/notes-crypto.ts, crypto.ts) et le coffre
// (_systeme/panel.py) : des notes chiffrées par l'un se déchiffrent chez l'autre, dans les deux sens ; un bloc ne
// s'ouvre pas sous un autre prospect ; le jeton d'écriture et la clé des données sont les mêmes des deux côtés.
//   node tools/commercial/test_notes_crypto.mjs
// Clé et identifiants de TEST seulement (acces-local.exemple.json). Rien n'est écrit dans le projet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chiffrerBloc, dechiffrerBloc, importerCleNotes} from '../../src/commercial/notes-crypto.ts';
import {deriverAcces, lireEnveloppe, ouvrir} from '../../src/commercial/crypto.ts';

const PYTHON = process.env.PYTHON ?? 'C:/Users/vaiko/AppData/Local/Programs/Python/Python313/python.exe';
const SYSTEME = process.env.COFFRE_SYSTEME ?? 'C:/Users/vaiko/Documents/Loyna Prospection/_systeme';
const acces = JSON.parse(fs.readFileSync(new URL('./acces-local.exemple.json', import.meta.url), 'utf8'));
const cle = await importerCleNotes(acces.cle_notes);
let ok = true;
const verifier = (cond, message) => {
  console.log((cond ? 'OK    ' : 'ÉCHEC ') + message);
  ok &&= !!cond;
};
const python = (code, entree = '') =>
  execFileSync(PYTHON, ['-B', '-c', `import sys, json, base64\nsys.path.insert(0, ${JSON.stringify(SYSTEME)})\nimport panel\n${code}`], {
    input: entree,
    encoding: 'utf8',
    env: {...process.env, PYTHONIOENCODING: 'utf-8'},
  });

const prospect = 'a1b2c3d4e5';
const notes = [
  {id: '0123456789abcdef', cree_le: '2026-10-23T08:05:00.000Z', modifie_le: '2026-10-23T08:05:00.000Z', texte: 'Rappeler jeudi à 10 h : « intéressée », veut la démo.'},
  {id: 'fedcba9876543210', cree_le: '2026-10-23T09:00:00.000Z', modifie_le: '2026-10-23T09:30:00.000Z', texte: 'Deux lignes.\nAccents : éèàçù ; symboles : € % & < > "'},
];

// 1. navigateur → coffre
const blocJs = await chiffrerBloc(cle, prospect, notes);
const lu = JSON.parse(
  python(
    `d = json.load(sys.stdin)\nprint(json.dumps(panel.dechiffrer_bloc(panel.cle_notes_test(), d["prospect"], d["bloc"]), ensure_ascii=False))`,
    JSON.stringify({prospect, bloc: blocJs}),
  ),
);
verifier(JSON.stringify(lu) === JSON.stringify(notes), 'bloc chiffré par le navigateur, déchiffré par panel.py');

// 2. coffre → navigateur
const blocPy = JSON.parse(python(`d = json.load(sys.stdin)\nprint(json.dumps(panel.chiffrer_bloc(panel.cle_notes_test(), d["prospect"], d["notes"])))`, JSON.stringify({prospect, notes})));
verifier(JSON.stringify(await dechiffrerBloc(cle, prospect, blocPy)) === JSON.stringify(notes), 'bloc chiffré par panel.py, déchiffré par le navigateur');

// 3. un bloc est lié à son prospect (données associées) et à la clé des notes
let refuse = false;
try {
  await dechiffrerBloc(cle, 'b1b2c3d4e5', blocPy);
} catch {
  refuse = true;
}
verifier(refuse, 'un bloc ne s’ouvre pas sous un autre prospect');
refuse = false;
try {
  await dechiffrerBloc(await importerCleNotes(Buffer.from(crypto.randomBytes(32)).toString('base64')), prospect, blocJs);
} catch {
  refuse = true;
}
verifier(refuse, 'un bloc ne s’ouvre pas avec une autre clé');

// 4. jeton d'écriture et clé des données : même dérivation des deux côtés (sur un donnees.enc fait par panel.py)
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-crypto-'));
const fichier = path.join(dossier, 'donnees.enc');
const empreintePy = python(
  `ident, mdp, sel = panel.acces_test()\ncle, jeton = panel.deriver_cles(ident, mdp, sel)\n` +
    `open(${JSON.stringify(fichier)}, "wb").write(panel.chiffrer_avec_cle(panel.charge_utile(b'{"prospects": []}', panel.cle_notes_test()), cle, sel))\n` +
    `print(panel.empreinte_jeton(jeton))`,
).trim();
const e = lireEnveloppe(fs.readFileSync(fichier, 'utf8'));
const a = await deriverAcces(acces.identifiant, acces.mot_de_passe, e);
const d = await ouvrir(e, a.cle);
verifier(d.notes_panel?.cle === acces.cle_notes, 'clé des données identique (le navigateur ouvre le donnees.enc de panel.py et y trouve la clé des notes)');
verifier(crypto.createHash('sha256').update(Buffer.from(a.jeton, 'hex')).digest('hex') === empreintePy, 'jeton d’écriture identique (même empreinte SHA-256 des deux côtés)');
verifier(a.jeton !== Buffer.from(a.brut).toString('hex'), 'jeton et clé des données distincts');
fs.rmSync(dossier, {recursive: true, force: true});

console.log(ok ? 'TOUT EST BON' : 'DES TESTS ÉCHOUENT');
process.exit(ok ? 0 : 1);
