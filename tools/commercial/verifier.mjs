// Contrôle local du chiffrement du panel commercial, avec le code même du navigateur (src/commercial/crypto.ts) :
//   node tools/commercial/verifier.mjs [fichier.enc]   (par défaut public/espace-commercial/donnees.enc)
// Déchiffre avec les identifiants de TEST (acces-local.exemple.json), vérifie qu'un mot de passe faux est refusé
// et que l'identifiant tolère majuscules et espaces. N'affiche aucune donnée de prospect, seulement des comptes.
import fs from 'node:fs';
import {deriverCle, lireEnveloppe, ouvrir} from '../../src/commercial/crypto.ts';

const acces = JSON.parse(fs.readFileSync(new URL('./acces-local.exemple.json', import.meta.url), 'utf8'));
const fichier = process.argv[2] ?? 'public/espace-commercial/donnees.enc';
const e = lireEnveloppe(fs.readFileSync(fichier, 'utf8'));

const t0 = Date.now();
const d = await ouvrir(e, await deriverCle(acces.identifiant, acces.mot_de_passe, e));
const duree = Date.now() - t0;
let erreurs = 0;

try {
  await ouvrir(e, await deriverCle(acces.identifiant, acces.mot_de_passe + 'x', e));
  console.log('ERREUR : un mot de passe faux a ouvert les données');
  erreurs++;
} catch (err) {
  if (err.code !== 'identifiants') {
    console.log('ERREUR inattendue avec un mot de passe faux :', err.message);
    erreurs++;
  }
}
try {
  await ouvrir(e, await deriverCle(`  ${acces.identifiant.toUpperCase()} `, acces.mot_de_passe, e));
} catch {
  console.log('ERREUR : l’identifiant en majuscules avec des espaces est refusé');
  erreurs++;
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
      dechiffrement_ms: duree,
      controles: erreurs ? `${erreurs} erreur(s)` : 'ok (mot de passe faux refusé, identifiant tolérant)',
    },
    null,
    1,
  ),
);
process.exit(erreurs ? 1 : 0);
