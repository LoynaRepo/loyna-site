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

## Offre de lancement

`LAUNCH_OFFER` dans `src/data/site.ts` (code, date de fin). Tant qu'elle est valable : bandeau en haut des pages
(`OfferBar`, remplacé par le texte Builder `announcement` s'il est rempli), pastille dans le haut de page,
mention dans les grilles et code prérempli sur les liens de paiement mensuels (`prefilled_promo_code`), clause
6.5 des CGV. Après la date, le site retire tout seul ces mentions (au build et dans le navigateur) et Stripe
refuse le code (expiration du coupon et du code promo).

## Espace client : LOYNA Business (`src/app/`)

L'application commerçante (anciennement prévue dans WeWeb) est servie par le site, en Preact
(`@astrojs/preact`, composants `client:only`), et parle directement à Supabase (projet
`alfxnoaxcmnbrqhlmmqq`) avec la **clé publishable** uniquement : la sécurité est la RLS et les contrôles
des Edge Functions (contrats : dépôt LOYNA, `docs/API.md` et `docs/WEWEB_SETUP.md`).

| Adresse | Contenu |
|---|---|
| `/espace-client/` | connexion puis accueil (indicateurs), scanner (caméra, BarcodeDetector ou jsQR), clients et fiche, programme et récompenses, campagnes Wallet/SMS, équipe, réglages (logo, couleurs, affiche du comptoir), abonnement (portail Stripe) — navigation `#/scanner`, `#/client/<id>`… |
| `/espace-client/mot-de-passe/` | choix du mot de passe depuis un lien d'activation (`/set-password` y est redirigé) |
| `/join/<commerce>` | inscription d'un client final (réécrite vers `/join/index.html` par `.htaccess`) |
| `/preferences/?t=…` | préférences et suppression des données d'un client final |
| `/espace-client/demo/` | **démonstration publique** sans compte : commerce, clients, passages, récompenses, campagnes et équipe fictifs tirés au hasard (`src/app/mock.ts`, graine dans `?seed=` ou le navigateur, bouton « Autres données »), scan simulé ; `/join/demo-<graine>` montre la page d'inscription du même commerce. Rien n'est envoyé ni enregistré (téléphones en 06 39 98, tranche ARCEP réservée à la fiction ; e-mails en example.com) |

- Démonstration : `/espace-client/demo/` en ligne, ou `?demo` sur `/espace-client/` en développement
  (même générateur `src/app/mock.ts`, chargé à part : absent des pages réelles) ; `/join/?slug=demo-loyna` en
  développement. Captures : `node tools/qa-app.mjs 1366 accueil scanner clients …` et `node tools/qa-flow.mjs`
  (serveur de développement sur le port 4322).
- Les mentions « inclus dans la formule … » sont lues dans la table `plan_entitlements` (jamais en dur).
- `.htaccess` : caméra autorisée seulement sous `/espace-client/`, Supabase ajouté à `connect-src` et
  `img-src`, pages des cartes en `noindex` et sans référent.

## Référencement (SEO)

- Contrôle : `python tools/seo-audit.py` après `npx astro build` (titre, description, H1, mots, données structurées,
  liens entrants de chaque page) ; `node tools/lh.mjs …` pour Lighthouse.
- Contenus : `src/content-seed/` (articles, métiers) **fusionnés** avec Builder.io par `slug` (la version Builder
  l'emporte) : un nouvel article ou métier ajouté au dépôt s'affiche même si Builder contient déjà d'autres entrées.
- Les liens internes reçoivent leur « / » final au build (`astro.config.mjs`) : pas de redirection 301 inutile.
- Vérification Search Console / Bing : `googleVerification` et `bingVerification` dans `src/data/site.ts` (ou
  Builder `site-settings`) ; profils officiels de la marque dans `sameAs` (données structurées Organization).
- IndexNow (Bing, Yandex…) : `python tools/indexnow.py` après chaque mise en ligne (clé publique
  `public/<clé>.txt`). Google lit le plan du site `https://loyna.fr/sitemap.xml` déclaré dans la Search Console.

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
