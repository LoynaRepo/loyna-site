// Contrôle local du chiffrement du panel commercial, avec le code même du navigateur (src/commercial/crypto.ts) :
//   node tools/commercial/verifier.mjs [fichier.enc]   (par défaut public/espace-commercial/donnees.enc)
// Déchiffre avec les identifiants de TEST (acces-local.exemple.json), vérifie qu'un mot de passe faux est refusé,
// que l'identifiant tolère majuscules et espaces, et que le jeton d'écriture correspond à l'empreinte déposée par
// panel.py (out/notes-local/jeton.sha256). N'affiche aucune donnée de prospect, seulement des comptes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {deriverAcces, lireEnveloppe, ouvrir} from '../../src/commercial/crypto.ts';

const acces = JSON.parse(fs.readFileSync(new URL('./acces-local.exemple.json', import.meta.url), 'utf8'));
const fichier = process.argv[2] ?? 'public/espace-commercial/donnees.enc';
const e = lireEnveloppe(fs.readFileSync(fichier, 'utf8'));

const t0 = Date.now();
const a = await deriverAcces(acces.identifiant, acces.mot_de_passe, e);
const d = await ouvrir(e, a.cle);
const duree = Date.now() - t0;
let erreurs = 0;

try {
  await ouvrir(e, (await deriverAcces(acces.identifiant, acces.mot_de_passe + 'x', e)).cle);
  console.log('ERREUR : un mot de passe faux a ouvert les données');
  erreurs++;
} catch (err) {
  if (err.code !== 'identifiants') {
    console.log('ERREUR inattendue avec un mot de passe faux :', err.message);
    erreurs++;
  }
}
try {
  await ouvrir(e, (await deriverAcces(`  ${acces.identifiant.toUpperCase()} `, acces.mot_de_passe, e)).cle);
} catch {
  console.log('ERREUR : l’identifiant en majuscules avec des espaces est refusé');
  erreurs++;
}
const empreinte = crypto.createHash('sha256').update(Buffer.from(a.jeton, 'hex')).digest('hex');
let jeton = 'pas d’empreinte locale';
try {
  jeton = fs.readFileSync('out/notes-local/jeton.sha256', 'utf8').trim() === empreinte ? 'ok (empreinte de panel.py)' : 'DIFFÉRENT';
  if (jeton === 'DIFFÉRENT') erreurs++;
} catch {
  /* pas encore de serveur local des notes */
}

console.log(
  JSON.stringify(
    {
      fichier,
      iterations: e.iterations,
      prospects: d.prospects?.length ?? 0,
      a_appeler: d.totaux?.a_appeler,
      donnees_du: d.genere_le,
      fictif: !!d.exemple,
      cle_des_notes: !!d.notes_panel?.cle,
      jeton_ecriture: jeton,
      dechiffrement_ms: duree,
      controles: erreurs ? `${erreurs} erreur(s)` : 'ok (mot de passe faux refusé, identifiant tolérant)',
    },
    null,
    1,
  ),
);
process.exit(erreurs ? 1 : 0);
