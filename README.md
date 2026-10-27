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
| FAQ (page /faq/ + données structurées) | Builder.io, modèle `faq` (toute la liste vient de Builder dès qu'il en a une) | `src/content-seed/faq.json` |
| Pages métiers /secteurs/… | Builder.io, modèle `secteur` | `src/content-seed/sectors.json` |
| Articles /blog/… | Builder.io, modèle `article` | `src/content-seed/articles/*.json` |
| Pages libres /p/… | Builder.io, modèle visuel `page` (aperçu : /builder-preview/) | aucune |
| Formules, prix, liens Stripe, navigation | `src/data/site.ts` | — |
| CGV, CGU, mentions légales, confidentialité, cookies | `src/content-seed/legal/*.html` | — |

Les champs légaux vides (`nomDirigeant`, `siret`, `adresse`, `telephone`) s'affichent « [à compléter] » dans les
pages légales. Si Builder.io ne répond pas pendant la construction, le site se construit avec les fichiers de
secours. Clés Builder : publique dans `src/lib/builder.ts` (lecture seule), privée dans `secrets/builder.env`
(jamais versionnée, sert seulement aux scripts d'administration).

Builder à jour des fichiers de secours relus : `python tools/builder_texte.py` (essai à blanc), puis `--appliquer`
(champs différents remplacés à slug ou question égale, questions de FAQ manquantes créées, rien n'est supprimé ;
contrôle final des termes retirés : SMS, anciennes offres, « HT »).

Un champ du modèle `site-settings` (sous-titre d'accueil, identité légale…) : `python tools/builder_reglages.py <champ> "texte"`
(essai à blanc), puis `--appliquer` : toute l'entrée est renvoyée à Builder (aucun champ perdu) et
`src/content-seed/site-settings.json` est mis à jour en même temps.

Images de partage : `python tools/og.py <fichier.json>` (voir le script). Un article ou un secteur ajouté
depuis Builder.io sans image dédiée reçoit l'image par défaut.

## Stripe (compte live acct_1UKleaV05ztMZIc7)

Offres Starter, Premium et Pro du 2026-10-25 : source de vérité dans le dépôt LOYNA, `docs/OFFRES.md` (prix, quotas,
contenu, notification de proximité, formulation). Prix, quotas et liens du site : `src/data/site.ts`.

| Offre | Lien de paiement | Retour vers /merci/ |
|---|---|---|
| Starter mensuel (29 € + 49 € de mise en service) | `plink_1UUOpQV05ztMZIc7M7g0hLe5` (buy.stripe.com/00wdRcgmucItbVX5Yc5Ne06) | `?offre=starter-mensuel` |
| Starter annuel (295,80 €) | `plink_1UUOpQV05ztMZIc79uKJZ1pM` (buy.stripe.com/4gMbJ40nw6k5aRTdqE5Ne07) | `?offre=starter-annuel` |
| Premium mensuel (39,99 € + 49 €) | `plink_1UUOpQV05ztMZIc7gRjoFDrG` (buy.stripe.com/dRm14q3zI23P5xzdqE5Ne08) | `?offre=premium-mensuel` |
| Premium annuel (407,90 €) | `plink_1UUOpRV05ztMZIc7usK6b6zp` (buy.stripe.com/fZu8wSfiq6k5aRT86k5Ne09) | `?offre=premium-annuel` |
| Pro mensuel (89 € + 49 €) | `plink_1UUOpRV05ztMZIc7k4hsWmtj` (buy.stripe.com/00w28u2vEbEp1hjbiw5Ne0a) | `?offre=pro-mensuel` |
| Pro annuel (907,80 €) | `plink_1UUOpSV05ztMZIc7nhOjCUac` (buy.stripe.com/28E28u8U27o99NP2M05Ne0b) | `?offre=pro-annuel` |

**Panier (2026-10-27)** : les boutons « Choisir » mènent à `/panier/?offre=<id>&periode=mensuel|annuel` (`src/pages/panier.astro`,
île `src/app/Panier.tsx`) : offre et période, QR codes sous verre en quantité libre (unité 0 à 20, packs de 5 et de 10 de
0 à 4, prix `QR_VERRE` de `src/data/site.ts`), récapitulatif (total du jour et montant récurrent, sans TVA), puis compte
LOYNA créé **avant** le paiement (ou session de l'espace client reprise). L'Edge Function `checkout-create` (dépôt LOYNA)
crée ou vérifie le compte, envoie l'e-mail « Confirmez votre adresse » (lien `/espace-client/confirmer/?token_hash=…`) et
ouvre une session Stripe Checkout aux mêmes réglages que les liens ; si Stripe refuse (permissions de la clé), réponse
`CHECKOUT_FALLBACK` : le panier ouvre le lien de paiement ci-dessous avec `prefilled_email` et `client_reference_id`
(les QR codes s'y rechoisissent). Retour : `/merci/?…&compte=1` (étapes du compte). Un compte sans commerce voit
« Votre commande » dans l'espace client (`my_orders`) ; essai local : `/espace-client/?demo&commande` (ou `commande=0`).
Depuis le 2026-10-27 : mise en service offerte d'office dans le panier jusqu'au 31/12/2026 (aucun code à saisir) et
**Parrainage LOYNA** entre commerçants (mensuel seulement, -50 % sur le premier mois du filleul, -50 % sur le mois suivant
du parrain par filleul payant) : champ « Code de parrainage » du panier (`?parrain=LOYNA-XXXXXX`), carte « Parrainez un
commerçant » dans Abonnement (`my_referral`), section `#parrainage` de l'accueil, FAQ (catégorie « Parrainage LOYNA »),
CGV article 4.8. Le double tampon aux heures creuses est retiré de toutes les offres.

Chaque lien : adresse de facturation, téléphone, nom du commerce et du contact (le numéro de TVA n'est plus
demandé depuis le 2026-10-27, décision d'Ewan),
rappel des CGV et de la mention « TVA non applicable, art. 293 B du CGI », retour vers
/merci/?offre=…&session_id=… (la page affiche l'offre payée et les étapes propres à Premium ou Pro). Métadonnées
`loyna_plan` (STARTER, PREMIUM, PRO), `billing_period`, `source=loyna.fr` sur l'abonnement. Anciennes offres
retirées le 2026-10-25 (dépôt LOYNA, `deno task stripe:catalog -- --retire --live`) : liens désactivés, produits
`loyna_essentiel` et `loyna_growth` archivés, code `LANCEMENT` désactivé. Portail client : `bpc_1UOMbKV05ztMZIc7mrlHaYSW`
(factures, carte bancaire, changement de formule au prorata, résiliation en fin de période), page de connexion
reliée au bouton de /espace-client/. Webhook : fonction `stripe-webhook` du dépôt LOYNA (endpoint
`we_1UOPsyV05ztMZIc7BrwNrnwh`), qui applique la formule payée au commerce dont le propriétaire a la même
adresse e-mail ; elle attend sa clé (`Enregistrer la clé Stripe du webhook.cmd`, dépôt LOYNA). D'ici là,
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
| `/espace-client/` | connexion puis accueil (indicateurs, jauges des cartes et des notifications du mois), scanner (caméra, BarcodeDetector ou jsQR), clients et fiche (niveau VIP, parrainage), programme et récompenses, campagnes Wallet (temps forts, campagnes préparées par LOYNA), automatisations (anniversaire, inactifs, « Plus qu'un passage ! », avis Google, double tampon ; niveaux VIP et parrainage en Pro), rapport mensuel, équipe, réglages (logo, couleurs, affiche du comptoir, boutiques et message de proximité), abonnement (portail Stripe) — navigation `#/scanner`, `#/client/<id>`… |
| `/espace-client/#/operateur` | **écran Opérateur** (2026-10-27), visible seulement pour un compte de `platform_admins` (contrôlé par le serveur : RPC `op_orders`, `op_merchants` et fonction `merchant-bootstrap` du dépôt LOYNA refusent tout autre compte) : commandes à traiter (abonnements Stripe sans commerce : contact, offre, QR codes, compte LOYNA, parrainage), création du commerce depuis une commande (formulaire prérempli, aperçu de la carte, logo PNG/JPG/WEBP/SVG converti en PNG dans le navigateur puis téléversé dans `merchant-assets/<id>/logo.png`, adresse d'inscription), résultat : lien `loyna.fr/join/<slug>` et QR code, accès du propriétaire (compte existant : son mot de passe ; compte créé : lien « Choisir mon mot de passe » et bouton « Envoyer l'accès par e-mail »), liste des commerces (offre, cartes, lien d'inscription ; « Ouvrir » seulement pour un commerce dont l'opérateur fait partie). Un opérateur sans commerce arrive directement sur cet écran. Absent de la démonstration publique ; essai local : `/espace-client/?demo&operateur` (ou `operateur=seul`), réponses fictives de `src/app/mock-operateur.ts`, chargé en développement seulement |
| `/espace-client/mot-de-passe/` | choix du mot de passe depuis un lien d'activation : `?token_hash=…&type=recovery` (liens de `staff-manage` et `merchant-bootstrap` depuis le 2026-10-27, vérifiés par la page avec `verifyOtp`) ou ancien lien avec les jetons après `#` (`/set-password` y est redirigé) |
| `/espace-client/confirmer/` | confirmation de l'adresse d'un compte créé dans le panier (`?token_hash=…&type=signup`, `verifyOtp`), puis ouverture de l'espace client |
| `/join/<commerce>` | inscription d'un client final (réécrite vers `/join/index.html` par `.htaccess`) |
| `/preferences/?t=…` | préférences et suppression des données d'un client final |
| `/espace-client/demo/` | **démonstration publique** sans compte : commerce, clients, passages, récompenses, campagnes et équipe fictifs tirés au hasard (`src/app/mock.ts`, graine dans `?seed=` ou le navigateur, bouton « Autres données »), scan simulé ; `/join/demo-<graine>` montre la page d'inscription du même commerce. Rien n'est envoyé ni enregistré (téléphones en 06 39 98, tranche ARCEP réservée à la fiction ; e-mails en example.com). Offre affichée : Pro par défaut ; `?offre=starter`, `?offre=premium` ou le sélecteur du bandeau montrent les autres offres (verrous, jauges) |

- Démonstration : `/espace-client/demo/` en ligne, ou `?demo` sur `/espace-client/` en développement
  (même générateur `src/app/mock.ts`, chargé à part : absent des pages réelles) ; `/join/?slug=demo-loyna` en
  développement. Captures : `node tools/qa-app.mjs 1366 accueil scanner clients …` et `node tools/qa-flow.mjs`
  (serveur de développement sur le port 4322).
- Les mentions « inclus dans la formule … », les verrous et les jauges (cartes, notifications du mois, boutiques)
  sont lus dans `plan_entitlements` et `my_plan_usage` (jamais de nom d'offre en dur).
- `.htaccess` : caméra autorisée seulement sous `/espace-client/`, Supabase ajouté à `connect-src` et
  `img-src`, géocodage des adresses de boutique (Base adresse nationale servie par l'IGN, `data.geopf.fr`)
  ajouté à `connect-src`, pages des cartes en `noindex` et sans référent.

## Espace commercial (`/espace-commercial/`, privé)

Panel de prospection d'Ewan : tableau de bord, prospects (filtres, tri, fiche détaillée), liste « À appeler »
avec ce qu'il faut dire, notes par prospect, tarifs, réponses aux questions des commerçants, aide (déroulé d'un
appel, modèles de mails, règles du démarchage B2B). Page `src/pages/espace-commercial/index.astro`, code `src/commercial/`
(Preact, mêmes classes que LOYNA Business). **Aucune donnée de prospect dans le dépôt ni dans `dist/`.**

- Données : le coffre `Documents\Loyna Prospection` les calcule (`_systeme/suivi.py`, lecture seule des fiches,
  note `07 Tableaux/Suivi prospects.md` et `_systeme/suivi.json`), puis `_systeme/panel.py publier` les chiffre
  (AES-256-GCM, clé PBKDF2-SHA256 de 600 000 itérations dérivée de l'identifiant et du mot de passe, sel
  aléatoire, gzip) et dépose `www/espace-commercial/donnees.enc` en SFTP avec la connexion de `tools/deploy.py`.
  Les agents le lancent à la fin de chaque passage.
- La page télécharge ce fichier et le déchiffre dans le navigateur (WebCrypto, `src/commercial/crypto.ts`) :
  identifiants faux → « Identifiant ou mot de passe incorrect. », rien d'autre. Option « Rester connecté dans
  cet onglet » : seuls la clé AES et le jeton d'écriture sont gardés (sessionStorage), jamais le mot de passe ;
  « Verrouiller » les efface.
- Identifiants de production : choisis par Ewan avec `3 - Définir l'accès au panel commercial.cmd` (racine du
  coffre), rangés dans le Gestionnaire d'identifiants Windows (service `loyna-panel-commercial`), jamais dans un
  fichier. Pour les changer : relancer ce script, puis `panel.py publier`.
- Confidentialité : `noindex, nofollow`, hors plan du site (`NOINDEX` dans `astro.config.mjs`),
  `Disallow: /espace-commercial/` dans robots.txt, page « bare » (ni Google Analytics ni bandeau), `.htaccess` :
  `X-Robots-Tag` et `Referrer-Policy: no-referrer`, `donnees.enc` jamais en cache. Aucun lien public vers la page.
- `tools/deploy.py` n'envoie jamais `espace-commercial/donnees.enc` depuis `dist/` et ne le supprime jamais en
  ligne ; `astro.config.mjs` retire de `dist/` la copie locale de développement (`public/`, ignorée par git).
- Contenus : prix, formules et offre importés de `src/data/site.ts` ; FAQ du site (Builder ou `faq.json`) ;
  réponses courtes et déroulé d'appel dans `src/commercial/contenu.ts` (brief, FAQ, pages du site, sources
  citées ; formulation validée : jamais « HT », engagement en clair, « LOYNA, une marque de KOVA Elec ») ;
  modèles de mails, FAQ et règles du coffre arrivent avec les données chiffrées.

### Notes par prospect (chiffrées de bout en bout)

Dans la fiche d'un prospect et par le bouton « Note » des cartes « À appeler » : notes datées (la plus récente
en haut), ajout (Ctrl+Entrée), modification, suppression confirmée dans l'interface ; « n notes » sur les lignes ;
la recherche porte aussi sur les notes. Code : `src/commercial/notes.ts`, `notes-crypto.ts`, `views/Notes.tsx`.

- Le navigateur chiffre chaque bloc (les notes d'un prospect) en AES-256-GCM, données associées
  `loyna-notes/v1/<prospect>` : le serveur ne voit jamais le texte. Identifiant du prospect : 10 caractères tirés du
  nom de sa fiche (`identifiant_fiche` de `suivi.py`).
- Clés : `panel.py` dérive 512 bits par PBKDF2 (mêmes identifiants et sel) : les 256 premiers sont la clé de
  `donnees.enc` (format inchangé), les 256 suivants le jeton d'écriture. Le serveur ne garde que le SHA-256 du
  jeton (`jeton.sha256`, déposé par `panel.py publier`). La clé des notes est tirée au hasard une fois
  (Gestionnaire d'identifiants, compte `cle-notes`) et voyage dans `donnees.enc` : changer d'identifiants ne
  change pas cette clé, donc les anciennes notes restent lisibles sans rien rechiffrer ; l'ancien jeton est refusé
  dès la publication suivante. Si la clé manque alors que des notes existent, `panel.py` la récupère dans le
  `donnees.enc` en ligne, et ne publie rien plutôt que d'en tirer une nouvelle.
- `public/espace-commercial/notes.php` (PHP 7.4 à 8.x, publié avec `dist/`) : `GET` et `POST` exigent l'en-tête
  `X-Panel-Jeton` (401 sans jeton, 403 jeton faux, 429 après 20 jetons faux par heure et par adresse) ; `POST
  {prospect, iv, donnees, modifie_le_precedent}` → 409 avec la version actuelle si elle a changé (le navigateur
  refait un ajout tout seul, et fait choisir pour une note modifiée ou supprimée ailleurs) ; bloc de 64 Ko au plus ;
  réponses JSON sans détail d'erreur, `no-store`, `noindex`. Stockage **hors de `www/`** : `~/panel-commercial/`
  (`notes.json` écrit sous `flock`, `sauvegardes/` = 50 dernières copies datées, `essais.json`, `jeton.sha256`),
  lu depuis `__DIR__/../../panel-commercial`. `deploy.py` ne travaille que dans `www/` et n'y touche jamais.
- Retour vers le coffre : `panel.py publier` (et `panel.py notes`, sans publier) télécharge les notes, les déchiffre
  et les recopie dans chaque fiche (section « Notes d'Ewan (panel) » placée avant l'historique, propriété
  `notes_panel`, rien d'autre n'est réécrit), dans `_systeme/notes_panel.json`, `suivi.json` et
  `07 Tableaux/Suivi prospects.md`. Une note dont la fiche a disparu est signalée (sortie de `panel.py`, tableau de
  bord du panel), jamais supprimée.

Essais en ligne, sans rien écrire (PowerShell) :
```
curl.exe -i https://loyna.fr/espace-commercial/notes.php                       # 401 jeton_absent
curl.exe -i -H "X-Panel-Jeton: 0000000000000000000000000000000000000000000000000000000000000000" https://loyna.fr/espace-commercial/notes.php   # 403 jeton_refuse
```
503 `non_active` : l'empreinte du jeton n'est pas encore déposée (`panel.py publier`) ; 503 `stockage` : le dossier
`~/panel-commercial` est hors d'atteinte de PHP.

Essais en local (serveur de développement sur le port 4322) :
```
python "<coffre>\_systeme\tests\test_suivi.py" --exporter tools\commercial\exemple-suivi.json   # jeu fictif
python "<coffre>\_systeme\panel.py" publier --local --exemple      # fictif → public/espace-commercial/donnees.enc
python "<coffre>\_systeme\panel.py" publier --local --acces-test   # vraies données, identifiants de test
node tools/commercial/verifier.mjs                                  # déchiffre avec le code du navigateur
node tools/qa-commercial.mjs 390 1366                               # captures dans out/qa-commercial
python tools/commercial/test_notes_serveur.py                       # serveur des notes : codes, 409, limites
node tools/commercial/test_notes_crypto.mjs                         # notes : navigateur ↔ panel.py, jeton
node tools/qa-notes.mjs 390 1366                                    # notes de bout en bout (ajout, réseau, conflit)
```
Ce PC n'a pas PHP : `tools/commercial/notes_local.py` reproduit `notes.php` à l'identique (stockage
`out/notes-local`, port 4330) et le serveur de développement lui transmet `/espace-commercial/notes.php`
(`vite.server.proxy` dans `astro.config.mjs`) ; `qa-notes.mjs` le lance et l'arrête lui-même. Toute différence
entre les deux est un défaut.
Identifiants de test (localhost uniquement) : `tools/commercial/acces-local.exemple.json` ; `panel.py` refuse de
publier en ligne avec eux. Après un essai sur les vraies données, remettre le jeu fictif (`--exemple`).

### Mail perso après un appel (bouton « Envoyer mail perso »)

Dans la fiche d'un prospect (adresse valide, ni refus, ni stop, ni hors cible) : compositeur avec le récap de l'appel
(une puce par ligne), l'offre évoquée (prix de `PLANS`), la prochaine étape, le signataire (mémorisé dans le
navigateur) et le **visuel de sa carte** aux couleurs de son activité, avec l'aperçu du mail complet. « Envoyer »
enregistre une note chiffrée `[MAIL] {json}` ; le coffre construit le vrai mail avec son modèle (« 03 Modèles/Mail
perso après appel.md », reçu aussi dans les données pour l'aperçu) et l'envoie par `loyna_mail.py`
(`_systeme/mail_perso.py`, tâche « LOYNA - Mails perso du panel » toutes les 10 minutes). La fiche montre « en
attente », puis « envoyé le … » ou « non envoyé : raison » (champs `mails_perso` de `suivi.py`).
- Code : `src/commercial/mail-perso.ts` (note, contrôles, aperçu rempli comme le coffre), `views/MailPerso.tsx`.
- Visuel : page `/visuel-carte/` (`src/pages/visuel-carte.astro`, 1200 × 630, noindex, hors du plan du site),
  paramètres `?nom=&activite=&recompense=&fond=&tampons=&ambiance=&ville=` ; palettes `CARD_AMBIANCES` de
  `src/data/site.ts` (seule source des couleurs). Le panel l'affiche dans une iframe (réglages par `postMessage`,
  `frame-src 'self'` pour `/espace-commercial/` dans `.htaccess`) ; le coffre la capture en PNG avec Edge. **Le site
  doit être publié avant le premier mail perso** : sans la page en ligne, le coffre refuse d'envoyer (alerte).
```
node tools/commercial/test_mail_perso.mjs     # panel ↔ coffre : même mail, mêmes prix et activités, contraste
node tools/qa-mail-perso.mjs 1366              # bout en bout (ou 390) : compositeur, note [MAIL], « en attente », annulation
```

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
