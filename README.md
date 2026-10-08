# Site commercial loyna.fr

Site vitrine et de vente de LOYNA (carte de fidélité Apple Wallet / Google Wallet). Site **statique** construit
avec Astro, contenus éditables dans **Builder.io**, paiement par **liens Stripe**, hébergé sur l'**hébergement
gratuit OVH** du domaine. Le produit lui-même (Supabase, WeWeb, cartes) est dans `Documents\LOYNA`.
Faits produit, prix et ton : [docs/BRIEF.md](docs/BRIEF.md). Ne rien inventer (ni chiffres, ni avis clients).

## Publier

1. Une seule fois : `Enregistrer le mot de passe FTP du site.cmd` (mot de passe FTP du compte `loynafb`,
   rangé dans le Gestionnaire d'identifiants Windows, jamais dans un fichier).
2. `Publier le site.cmd` : construit le site (en lisant Builder.io) puis envoie `dist/` vers `www/` en SFTP
   (l'hébergement gratuit OVH refuse le FTP chiffré ; SFTP chiffre tout, mêmes identifiants). Seuls les
   fichiers modifiés partent ; les fichiers disparus sont retirés du serveur. Clé du serveur vérifiée :
   `tools/ovh_known_hosts`.

Commandes équivalentes : `npx astro build` puis `python tools/deploy.py publier` (`--essai` pour voir sans
envoyer, `test` pour vérifier la connexion). Après une modification dans Builder.io, il faut republier.

## Développer

```
npm install
npx astro dev            # http://localhost:4321
npx astro build          # dist/
node tools/qa.mjs 390 / /tarifs/          # captures pleine page dans out/qa (aperçu lancé sur 127.0.0.1:4321)
node tools/lh.mjs / /tarifs/              # audit Lighthouse mobile
```
Sous Git Bash, préfixer les deux outils par `MSYS_NO_PATHCONV=1` (sinon « / » devient un chemin Windows).

## Où sont les contenus

| Contenu | Source | Secours hors ligne |
|---|---|---|
| Titre/sous-titre d'accueil, identité légale (KOVA Elec), lien Espace client, identifiant Google Analytics `ga4Id` | Builder.io, modèle `site-settings` | `src/content-seed/site-settings.json` |
| FAQ (page /faq/ + données structurées) | Builder.io, modèle `faq` | `src/content-seed/faq.json` |
| Pages métiers /secteurs/… | Builder.io, modèle `secteur` | `src/content-seed/sectors.json` |
| Articles /blog/… | Builder.io, modèle `article` | `src/content-seed/articles/*.json` |
| Pages libres /p/… | Builder.io, modèle visuel `page` (aperçu : /builder-preview/) | aucune |
| Formules, prix, liens Stripe, navigation | `src/data/site.ts` | — |
| CGV, CGU, mentions légales, confidentialité, cookies | `src/content-seed/legal/*.html` | — |

Les champs légaux vides (`nomDirigeant`, `siret`, `adresse`, `telephone`) s'affichent « [à compléter] » dans les
pages légales. Si Builder.io ne répond pas pendant la construction, le site se construit avec les fichiers de
secours. Clés Builder : publique dans `src/lib/builder.ts` (lecture seule), privée dans `secrets/builder.env`
(jamais versionnée, sert seulement aux scripts d'administration).

Images de partage : `python tools/og.py <fichier.json>` (voir le script). Un article ou un secteur ajouté
depuis Builder.io sans image dédiée reçoit l'image par défaut.

## Stripe (compte live acct_1UKleaV05ztMZIc7)

| Offre | Lien de paiement |
|---|---|
| Essentiel mensuel (29 € + 49 € de mise en service) | `plink_1UOMa6V05ztMZIc7xYo8BI1g` |
| Growth mensuel (49 € + 49 €) | `plink_1UOMaKV05ztMZIc7l7Uw1Boz` |
| Pro mensuel (79 € + 49 €) | `plink_1UOMaPV05ztMZIc7NpRImWin` |
| Essentiel annuel (295,80 €) | `plink_1UOMaeV05ztMZIc7uSADuzxG` |
| Growth annuel (499,80 €) | `plink_1UOMakV05ztMZIc7lYFe2eoN` |
| Pro annuel (805,80 €) | `plink_1UOMapV05ztMZIc7rZ2Fjryb` |

Chaque lien : adresse de facturation, téléphone, nom du commerce et du contact, numéro de TVA facultatif,
rappel des CGV et de la mention « TVA non applicable, art. 293 B du CGI », retour vers /merci/. Métadonnées
`loyna_plan`, `billing_period`, `source=loyna.fr` sur l'abonnement. Portail client : `bpc_1UOMbKV05ztMZIc7mrlHaYSW`
(factures, carte bancaire, changement de formule au prorata, résiliation en fin de période), page de connexion
reliée au bouton de /espace-client/. Il n'y a pas encore de webhook : après un achat, créer le commerce et
reporter la formule dans `merchants.subscription_plan` à la main (voir `LOYNA/docs/STRIPE_SETUP.md`).

## Hébergement OVH

`loynafb.cluster129.hosting.ovh.net` (offre gratuite 100 Mo, PHP), FTP `ftp.cluster129.hosting.ovh.net`,
compte `loynafb`, dossier `www/`. `public/.htaccess` : HTTPS et domaine sans www, cache, compression,
en-têtes de sécurité. `public/contact.php` : formulaire de contact → e-mail « [Site LOYNA] … » vers
contact@loyna.fr (réponse directe au visiteur), repris par l'agent Trieur du coffre de prospection.

## Ce que le site contient (contrôle du 2026-10-09)

Page 404, appel à l'action au-dessus de la ligne de flottaison, titre et description propres à chaque page
(≤ 60 / ≤ 160 caractères), image de partage par page, jeu de favicons + manifeste, robots.txt, sitemap
(`/sitemap.xml` → `/sitemap-index.xml`), texte alternatif sur chaque image (vide si décorative), mise en
page testée à 360, 390, 768, 1024 et 1440 px, barre d'action fixe sur mobile (`StickyCta`, désactivable
par page avec `stickyCta={false}`), états de chargement (`data-loading` sur liens et boutons, vidéo),
erreurs de formulaire champ par champ + message serveur, pages de remerciement (/merci/, /contact/envoye/),
confidentialité, CGV, CGU, cookies, mentions légales, adresse réelle (contact, pied de page, JSON-LD).
Typographie française automatique (espaces insécables) au moment de la construction (`astro.config.mjs`).

**Mesure d'audience** : Google Analytics 4 avec bandeau de consentement (`Consent.astro`), activé dès qu'un
identifiant `G-…` est saisi dans Builder (`site-settings` → `ga4Id`) puis le site republié. Sans identifiant :
ni bandeau ni traceur, et les pages cookies/confidentialité le disent (blocs `data-if`). Événements envoyés
si le visiteur accepte : `begin_checkout` (clic vers Stripe), `generate_lead` (formulaire), `purchase` (/merci/).
Dans Google Analytics, régler la conservation des données sur 14 mois (annoncé dans la politique cookies).
