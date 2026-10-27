// Mail perso après un appel : le panel (src/commercial/mail-perso.ts) et le coffre (_systeme/mail_perso.py) doivent
// dire la même chose. Avec le vrai modèle du coffre (« 03 Modèles/Mail perso après appel.md »), l'aperçu du panel et
// le mail construit par le coffre sont identiques (objet et HTML), pour la même note « [MAIL] » ; mêmes paramètres du
// visuel, mêmes prix, mêmes activités ; contraste des couleurs de chaque ambiance (src/data/site.ts).
//   node tools/commercial/test_mail_perso.mjs
// Données fictives seulement ; rien n'est écrit ni envoyé.
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';

// imports sans extension des modules du site (comme Vite) : « ../data/site » → « ../data/site.ts »
registerHooks({
  resolve(spec, ctx, suivant) {
    if (/^\.\.?\//.test(spec) && !/\.[a-z]+$/i.test(spec)) {
      try {
        return suivant(spec + '.ts', ctx);
      } catch {
        /* pas un module .ts : résolution normale */
      }
    }
    return suivant(spec, ctx);
  },
});
const mp = await import('../../src/commercial/mail-perso.ts');
const site = await import('../../src/data/site.ts');
const {luminance} = await import('../../src/lib/carte-live.ts');

const PYTHON = process.env.PYTHON ?? 'C:/Users/vaiko/AppData/Local/Programs/Python/Python313/python.exe';
const SYSTEME = process.env.COFFRE_SYSTEME ?? 'C:/Users/vaiko/Documents/Loyna Prospection/_systeme';
let ok = true;
const verifier = (cond, message) => {
  console.log((cond ? 'OK    ' : 'ÉCHEC ') + message);
  ok &&= !!cond;
};
const python = (code, entree) =>
  JSON.parse(
    execFileSync(PYTHON, ['-B', '-c', `import sys, json\nsys.path.insert(0, ${JSON.stringify(SYSTEME)})\n${code}`], {
      input: JSON.stringify(entree),
      encoding: 'utf8',
      env: {...process.env, PYTHONIOENCODING: 'utf-8'},
    }),
  );

// --- Même mail des deux côtés --------------------------------------------------------------------------------------
const base = {
  v: 1, to: 'ongles-azur@example.com', objet: '', prenom: 'Inès', recap: 'Déjà une carte papier\n- Veut relancer les inactives\n\n',
  offre: 'premium', etape: 'je vous rappelle jeudi', activite: 'Onglerie', recompense: 'Pose de vernis offerte',
  fond: '#a8325f', tampons: '#ffd6e4', ambiance: '#fbe4ec', signataire: 'Ewan',
};
const cas = [
  {nom: 'Ongles Azur', ville: 'Nîmes', d: base, jour: [2026, 9, 27]},
  {nom: "L'Atelier & Co <Sète>", ville: '', d: {...base, prenom: '', offre: '', etape: 'rappel lundi !', objet: 'Votre carte, « L’Atelier »'}, jour: [2026, 9, 26]},
  {nom: 'Sushi Mood', ville: 'Montpellier', d: {...base, offre: 'pro', signataire: 'Léa', activite: 'Sushi', recompense: 'Plateau offert', fond: '#121216', tampons: '#e63946', ambiance: '#2b0b10', recap: '• un\n* deux\n— trois'}, jour: [2026, 9, 27]},
  {nom: 'Le Fournil Ambré', ville: 'Béziers', d: {...base, offre: 'starter', prenom: 'Paul', fond: 'n’importe quoi', etape: ''}, jour: [2026, 9, 27]},
];
const auj = new Date(2026, 9, 27, 15, 0);
const py = python(
  `
from datetime import date
import mail_perso
entree = json.loads(sys.stdin.read())
objet_modele, html_modele = mail_perso.lire_modele(mail_perso.COFFRE_DEFAUT)
sorties = []
for c in entree:
    d = mail_perso.lire_demande({"texte": c["note"]})
    objet, code, texte = mail_perso.construire(mail_perso.COFFRE_DEFAUT, c["nom"], d, date(*c["jour"]), date(2026, 10, 27))
    sorties.append({"objet": objet, "html": code, "visuel": mail_perso.lien_visuel("https://loyna.fr", c["nom"], c["ville"], d).split("?", 1)[1],
                    "puces": d["recap"]})
from documents_client import FORMULES
import loyna_mail
activites = sorted({x[1] for x in loyna_mail.CORRESPONDANCE_SECTEUR} | {"Autre"})
print(json.dumps({"modele": {"objet": objet_modele, "html": html_modele}, "sorties": sorties,
                  "prix": {k: v["mensuel"] for k, v in FORMULES.items()}, "activites": activites}, ensure_ascii=False))
`,
  cas.map((c) => ({nom: c.nom, ville: c.ville, jour: [c.jour[0], c.jour[1] + 1, c.jour[2]], note: mp.texteNoteMail(c.d)})),
);
cas.forEach((c, i) => {
  const ts = mp.construireMail(py.modele, c.nom, c.d, new Date(...c.jour), auj);
  const p = py.sorties[i];
  verifier(ts.objet === p.objet, `${c.nom} : même objet (« ${p.objet} »)`);
  verifier(ts.html === p.html, `${c.nom} : même HTML que le mail du coffre`);
  if (ts.html !== p.html) {
    const k = [...ts.html].findIndex((ch, j) => ch !== p.html[j]);
    console.log('   panel :', ts.html.slice(Math.max(0, k - 60), k + 60));
    console.log('   coffre:', p.html.slice(Math.max(0, k - 60), k + 60));
  }
  verifier(mp.paramsVisuel(c.nom, c.ville, c.d) === p.visuel, `${c.nom} : mêmes paramètres du visuel`);
  verifier(JSON.stringify(mp.lignesRecap(c.d.recap)) === JSON.stringify(p.puces), `${c.nom} : mêmes puces (${p.puces.length})`);
});
verifier(py.sorties[1].html.includes('du 26 octobre') && py.sorties[0].html.includes('de ce jour'), 'appel de la veille : « du 26 octobre »');
verifier(site.PLANS.every((x) => py.prix[x.id] === x.monthly), `prix mensuels identiques (site.ts = documents_client.FORMULES : ${site.PLANS.map((x) => x.monthly).join(', ')})`);
verifier(py.activites.every((a) => site.ACTIVITES_VISUEL.includes(a)), `toutes les activités du coffre ont leur ambiance (${py.activites.length})`);
verifier(site.ACTIVITES_VISUEL.every((a) => site.CARD_AMBIANCES[a]), 'chaque activité du visuel a sa palette');

// --- Note, contrôles, préremplissage -------------------------------------------------------------------------------
const note = {texte: mp.texteNoteMail(base)};
verifier(mp.estNoteMail(note) && JSON.stringify(mp.lireNoteMail(note)) === JSON.stringify(base) && !mp.estNoteMail({texte: 'Rappeler lundi'}), 'note « [MAIL] » écrite puis relue');
verifier(mp.probleme(base) === '' && mp.probleme({...base, recap: ' \n '}).includes('récapitulatif') && mp.probleme({...base, to: 'pas-une-adresse'}).includes('Adresse')
  && mp.probleme({...base, recap: '1\n2\n3\n4\n5\n6\n7'}).includes('6 lignes') && mp.probleme({...base, recap: 'x'.repeat(4000)}).includes('4 000'),
  'contrôles : adresse, récapitulatif vide ou trop long, note de plus de 4 000 caractères');
verifier(mp.boutonVisible({email: 'a@b.fr', statut: 'contacté'}) && !mp.boutonVisible({email: 'a@b.fr', statut: 'Refus'}) && !mp.boutonVisible({email: 'a@b.fr', statut: 'hors cible'})
  && !mp.boutonVisible({email: 'a@b.fr', statut: 'stop'}) && !mp.boutonVisible({email: 'pas une adresse', statut: 'qualifié'}),
  'bouton visible : adresse valide, ni refus, ni stop, ni hors cible');
verifier(mp.prenomPour({prenom: 'Chanel', dirigeant: 'X'}) === 'Chanel' && mp.prenomPour({prenom: '', dirigeant: 'Paul Exemple'}) === 'Paul'
  && mp.prenomPour({prenom: '', dirigeant: 'SARL Exemple'}) === '' && mp.prenomPour({prenom: '', dirigeant: ''}) === '', 'prénom : fiche, sinon prénom du dirigeant, sinon vide');
const init = mp.demandeInitiale({email: 'x@example.com', prenom: '', dirigeant: 'Inès Exemple', activite_carte: 'Onglerie'}, 'Ewan');
verifier(init.activite === 'Onglerie' && init.fond === site.CARD_AMBIANCES.Onglerie.fond && init.recompense === 'Pose de vernis offerte' && init.prenom === 'Inès',
  'préremplissage : activité de la carte (suivi.json), couleurs de son ambiance, prénom');
verifier(mp.avecActivite(init, 'Boulangerie').ambiance === site.CARD_AMBIANCES.Boulangerie.ambiance && site.visuelActivite('patisserie').nom === 'Pâtisserie'
  && site.visuelActivite('Tatoueur').nom === 'Autre', 'changement d’activité : ses couleurs ; activité inconnue : « Autre »');

// --- Contraste de chaque ambiance ---------------------------------------------------------------------------------
const contraste = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const faibles = Object.entries(site.CARD_AMBIANCES).filter(([, a]) => {
  const texteCarte = luminance(a.fond) > 0.45 ? '#16130e' : '#f8f4ec'; // même règle que carte-live.ts
  return contraste(texteCarte, a.fond) < 4.5 || contraste(a.tampons, a.fond) < 3 || contraste(a.texte, a.ambiance) < 4.5 || contraste(a.texte, a.ambiance2) < 4.5;
});
verifier(!faibles.length, `contraste : nom de la carte ≥ 4,5, tampons ≥ 3, texte du visuel ≥ 4,5 (${faibles.map(([k]) => k).join(', ') || 'toutes les ambiances'})`);
const onglerie = site.CARD_AMBIANCES.Onglerie;
const rose = (h) => {
  const n = parseInt(h.slice(1), 16);
  const [r, v, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return r > v + 10 && b > v; // rose : rouge et bleu au-dessus du vert
};
verifier(rose(onglerie.ambiance) && rose(onglerie.fond) && luminance(site.CARD_AMBIANCES.Boulangerie.ambiance) > 0.7, 'onglerie : tons roses ; boulangerie : fond beige clair');

console.log(ok ? 'TOUT EST BON' : 'DES TESTS ÉCHOUENT');
process.exit(ok ? 0 : 1);
