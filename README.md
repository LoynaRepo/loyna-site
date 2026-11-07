# Site commercial loyna.fr

Site vitrine et de vente de LOYNA (carte de fidélité Apple Wallet / Google Wallet). Site **statique** construit
avec Astro, contenus éditables dans **Builder.io**, paiement par **liens Stripe**, hébergé sur l'**hébergement
gratuit OVH** du domaine. Le produit lui-même (Supabase, WeWeb, cartes) est dans `Documents\LOYNA`.
Faits produit, prix et ton : [docs/BRIEF.md](docs/BRIEF.md). Ne rien inventer (ni chiffres, ni avis clients).

## Habillage (refonte du 2026-10-31)

Pages publiques : `src/styles/vitrine.css`, tout sous la classe `.vitrine` que `Base.astro` pose sur `<body>` quand la page n'est
pas `bare`. `/visuel-carte/`, l'espace client, le panel commercial et les pages des cartes (`bare`) ne voient aucune de ces règles.
- Bandeau défilant : `OfferBar.astro`, CSS seul, deux groupes identiques et translation de -50 %. Deux offres l'une après l'autre (décision d'Ewan du 2026-10-31),
  chacune avec son lien : l'offre de lancement vers `/tarifs/`, retirée d'elle-même après sa date, et le Parrainage LOYNA vers `/faq/#parrainage-loyna`, qui reste. Un
  vrai lien par offre pour le clavier et les lecteurs d'écran (invisible jusqu'au focus), la piste leur est cachée.
- Nombre de clients : `CLIENTS` de `src/data/site.ts`, le vrai nombre de commerces clients, à reporter à la main. « Ils nous font confiance » (`Confiance.astro`, accueil,
  sans témoignage) reste masqué sous le seuil et s'affiche seul à la construction suivante dès qu'il l'atteint. La rangée de faits du même bloc reprend ce que le site dit déjà.
- Jonctions irrégulières : `Jonction.astro` (`de`, `vers`, `forme` 1 à 6, `retourne`, `filet`, `sur`). Les fonds doivent être unis
  sur les bords des sections : un halo se centre verticalement pour s'éteindre avant le bord. `Base` prend `finPage` quand la
  dernière section n'est pas crème.
- Maquettes en HTML/CSS : `MockTableau.astro`, `MockNotifications.astro`, `MiniConfigurateur.astro` (essai sur l'accueil, puis le
  vrai configurateur), `VideoModale.astro` (liens `data-video`, repli sur `/demo/`).
- Texte court du haut de l'accueil : `heroLead` de `src/content-seed/site-settings.json` ; sans lui, `heroSubtitle` de Builder.
- Contrôles (site construit, servi en local) : `node tools/qa-hero.mjs <base> 700 1280 1` (pastilles du haut de l'accueil : aucun recouvrement à aucun moment de leur cycle), `node tools/qa-jonctions.mjs <base>` (liserés à 375, 768, 1280, 1920 px ; bandeau : les deux offres, raccord, pause, clavier, mouvement réduit, après la date de l'offre),
  `node tools/qa-parcours.mjs <base>` (prix, bandeau et ses liens, nombre de clients, configurateur, panier, vidéo, console), `node tools/qa-routes.mjs <dist de référence> dist <base>`
  (routes, référencement, liens), `node tools/qa-comparer.mjs <base référence> <base> <dossier>` (`/visuel-carte/` capturée par Edge et
  pages `bare`, au pixel), `node tools/qa-refonte.mjs <base> <dossier> 375,1280 / /tarifs/` (captures pleine page).
  Sous Git Bash, préfixer par `MSYS_NO_PATHCONV=1`.

## Publier

1. Une seule fois : `Enregistrer le mot de passe FTP du site.cmd` (mot de passe FTP du compte `loynafb`,
   rangé dans le Gestionnaire d'identifiants Windows, jamais dans un fichier).
2. `Publier le site.cmd` : construit le site (en lisant Builder.io) puis envoie `dist/` vers `www/` en SFTP
   (l'hébergement gratuit OVH refuse le FTP chiffré ; SFTP chiffre tout, mêmes identifiants). Seuls les
   fichiers modifiés partent ; les fichiers disparus sont retirés du serveur. Clé du serveur vérifiée :
   `tools/ovh_known_hosts`.

Commandes équivalentes : `npx astro build` puis `python tools/deploy.py publier` (`--essai` pour voir sans
envoyer, `test` pour vérifier la connexion). Après une modification dans Builder.io, il faut republier.
Après une mise en ligne réussie, `deploy.py` signale à IndexNow (Bing, Yandex…) les pages du plan du site qui ont
changé (`--sans-indexnow` pour s'en passer ; un refus d'IndexNow n'annule pas la mise en ligne).

## Développer

```
npm install
npx astro dev            # http://localhost:4321
npx astro build          # dist/ (réécrit aussi node_modules/.vite/deps : redémarrer un astro dev lancé dans ce dossier, sinon 504 « Outdated Optimize Dep » sur le panier, l'espace client et le panel)
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
| Offres, prix, phrases fixes (`PHRASES`), liens Stripe, essai (`TRIAL`), navigation | `src/data/site.ts` | — |
| CGV, CGU, mentions légales, confidentialité, cookies | `src/content-seed/legal/*.html` | — |

Les champs légaux vides (`nomDirigeant`, `siret`, `adresse`, `telephone`) s'affichent « [à compléter] » dans les
pages légales. Si Builder.io ne répond pas pendant la construction, le site se construit avec les fichiers de
secours. Clés Builder : publique dans `src/lib/builder.ts` (lecture seule), privée dans `secrets/builder.env`
(jamais versionnée, sert seulement aux scripts d'administration).

Builder à jour des fichiers de secours relus : `python tools/builder_texte.py` (essai à blanc), puis `--appliquer`
(champs différents remplacés à slug ou question égale, questions de FAQ manquantes créées, rien n'est supprimé ;
contrôle final des termes retirés : SMS, anciennes offres et anciens prix, « HT »). Une question qui change s'y suit grâce à `RENOMMEES`, sinon l'ancienne reste en ligne.

Un champ du modèle `site-settings` (sous-titre d'accueil, identité légale…) : `python tools/builder_reglages.py <champ> "texte"`
(essai à blanc), puis `--appliquer` : toute l'entrée est renvoyée à Builder (aucun champ perdu) et
`src/content-seed/site-settings.json` est mis à jour en même temps.

Images de partage : `python tools/og.py <fichier.json>` (voir le script). Un article ou un secteur ajouté
depuis Builder.io sans image dédiée reçoit l'image par défaut.

## Stripe (compte live acct_1UKleaV05ztMZIc7)

Offres Starter et Pro (décision d'Ewan du 2026-10-31) : source de vérité dans le dépôt LOYNA, `docs/OFFRES.md` (prix, quotas,
contenu, notification de proximité, formulation). Prix, quotas, phrases fixes et liens du site : `src/data/site.ts`. Toujours réglé au
mois, plus d'annuel. Premium n'est plus vendue : seul Barber Kong la garde (`LEGACY_PLANS`, écran Abonnement).

| Offre | Lien de paiement (`PLANS[].links`) | Retour vers /merci/ |
|---|---|---|
| Starter sans engagement (29 € + 49 € de mise en service, code `LANCEMENT2026` prérempli) | `links.sans`, URL donnée par `stripe:catalog -- --apply --live` | `?offre=starter-mensuel` |
| Starter avec engagement (24,65 €) | `links.engage` | `?offre=starter-engage` |
| Pro sans engagement (49 € + 49 €, code prérempli) | `links.sans` | `?offre=pro-mensuel` |
| Pro avec engagement (41,65 €) | `links.engage` | `?offre=pro-engage` |

Tant que ces 4 liens ne sont pas créés, `LIEN_A_REMPLIR` de `site.ts` les remplace par le panier de la même offre (repère
`#lien-stripe-a-remplir`) : à remplacer avant la publication, `grep -rl lien-stripe-a-remplir dist` ne doit rien trouver.

**Panier (2026-10-27)** : les boutons « Choisir » mènent à `/panier/?offre=<id>&engagement=0|1` (`src/pages/panier.astro`,
île `src/app/Panier.tsx`, styles `src/styles/panier.css`) : offre et engagement, QR codes sous verre en quantité libre (unité 0 à 20,
packs de 5 et de 10 de 0 à 4, prix `QR_VERRE` de `src/data/site.ts`), récapitulatif (total du jour et montant récurrent, sans TVA), puis
compte LOYNA créé **avant** le paiement (ou session de l'espace client reprise). L'Edge Function `checkout-create` (dépôt LOYNA)
crée ou vérifie le compte, envoie l'e-mail « Confirmez votre adresse » (lien `/espace-client/confirmer/?token_hash=…`) et
ouvre une session Stripe Checkout aux mêmes réglages que les liens ; si Stripe refuse (permissions de la clé), réponse
`CHECKOUT_FALLBACK` : le panier ouvre le lien de paiement ci-dessus avec `prefilled_email` et `client_reference_id`
(les QR codes s'y rechoisissent). Retour : `/merci/?…&compte=1` (étapes du compte). Un compte sans commerce voit
« Votre commande » dans l'espace client (`my_orders`) ; essai local : `/espace-client/?demo&commande` (ou `commande=0`).
Anciens liens lus par `normalizeOffer` : `?offre=premium` → Starter avec un avis, `?periode=annuel` → avec engagement, `?periode=mensuel` →
sans engagement ; une carte préparée en `premium` s'ouvre de la même façon (jamais de page blanche).
Depuis l'espace client (essai ou abonnement à reprendre) : `/panier/?offre=starter&engagement=0&commerce=<id>` : pas d'étape de compte,
`merchant_id` envoyé à `checkout-create`, état lu par `my_service_state`, ligne « Votre essai court jusqu'au … » avant le paiement (pas d'essai
Stripe : les jours d'essai restants ne sont pas reportés), `/merci/` ne redemande rien (repère `loyna-panier-commerce`).
Mise en service : offerte d'office jusqu'au 31/12/2026 (aucun code à saisir), ensuite offerte avec engagement, 49 € une seule fois sans
engagement, jamais refacturée à qui reprend un abonnement. **Parrainage LOYNA** entre commerçants (décision d'Ewan du 2026-10-31 : 1 mois
offert à chacun, premier mois du filleul offert, mois suivant du parrain offert dès que le filleul a payé sa première mensualité, avec ou
sans engagement) : champ « Code de parrainage » du panier et de l'essai (`?parrain=LOYNA-XXXXXX`), carte « Parrainez un commerçant » dans
Abonnement (`my_referral`) et sur l'accueil de l'espace client, bandeau des pages publiques (`OfferBar`), FAQ (catégorie « Parrainage LOYNA »),
CGV article 4.8. Le double tampon aux heures creuses est retiré de toutes les offres.

**Essai (2026-10-31)** : `/essai/` (`src/pages/essai.astro`, île `src/app/Essai.tsx`, noindex, hors du plan du site) : 1 mois de Starter, sans
carte bancaire, 1 par commerce. La carte reprend le configurateur (`loyna-config`, logo dans `sessionStorage` par `logoToFiles`), une carte
préparée (`/essai/?carte=<id>`) ou le lien (`?nom=&activite=&recompense=&fond=&tampons=&passages=`). Le SIRET se retrouve par une recherche
sur l'API publique `recherche-entreprises.api.gouv.fr`, appelée depuis le navigateur (`connect-src` ouvert pour `/essai/` seulement dans
`.htaccess`). `GET trial` à l'ouverture (fermé ou complet : l'abonnement et « Recevoir un aperçu »), `POST trial` à l'envoi (Edge Function
`trial`, dépôt LOYNA : tous les contrôles) ; écran « Vérifiez votre boîte mail », puis `/espace-client/confirmer/` active l'essai.
**`TRIAL.open = false`** dans `site.ts` : `APPEL` (tous les boutons) retombe sur « Choisir mon offre », les textes sur l'essai et la question
de la FAQ (`essai: true`, filtre de `getFaq`) sortent ; rien d'autre à changer, la grille part quand même. `LOYNA_TRIAL_OPEN=false` (secret) ferme
l'essai sans rebâtir le site. Essai de bout en bout : `node tools/qa-essai.mjs <base>` (réponses simulées) ou `--pile` (pile d'essai, valeurs générées).
**Funnel de l'essai (2026-11-07)** : une question par écran, barre de progression, retour, Entrée pour valider : métier (gros boutons, un clic
passe à la suite et propose récompense et couleurs), nom, récompense (passages ou montant, couleurs repliées), coordonnées, mot de passe + CGV
(parrainage replié, déplié si `?parrain=`). Carte préparée : coordonnées puis mot de passe. Pas d'étape logo (celui du configurateur ou d'une
carte préparée part quand même). Une erreur du serveur ramène à l'écran de son champ. Captures de chaque écran : `node tools/qa-essai.mjs <base> <dossier>`.

**Arrêt automatique** : `PHRASES.arret` sur `/tarifs/#arret` et dans la FAQ ; le détail vit dans le dépôt LOYNA (`merchant_service_decision`).

Chaque lien : adresse de facturation, téléphone, nom du commerce et du contact (le numéro de TVA n'est plus
demandé depuis le 2026-10-27, décision d'Ewan),
rappel des CGV et de la mention « TVA non applicable, art. 293 B du CGI », retour vers
/merci/?offre=…&session_id=… (la page affiche l'offre payée et les étapes propres à Pro, le rappel d'engagement seulement si engagé ; un retour
`-annuel` encore en transit est lu comme `-engage`). Métadonnées `loyna_plan` (STARTER, PRO), `billing_period`, `source=loyna.fr` sur l'abonnement,
`commitment_months=12` seulement avec engagement. Anciennes offres
retirées le 2026-10-25 (dépôt LOYNA, `deno task stripe:catalog -- --retire --live`) : liens désactivés, produits
`loyna_essentiel` et `loyna_growth` archivés, code `LANCEMENT` désactivé. Portail client : `bpc_1UOMbKV05ztMZIc7mrlHaYSW`
(factures, carte bancaire, résiliation en fin de période ; le changement d'offre y est coupé et passe par l'espace client, fonction
`subscription-change`), page de connexion
reliée au bouton de /espace-client/. Webhook : fonction `stripe-webhook` du dépôt LOYNA (endpoint
`we_1UOPsyV05ztMZIc7BrwNrnwh`), qui applique la formule payée au commerce dont le propriétaire a la même
adresse e-mail ; elle attend sa clé (`Enregistrer la clé Stripe du webhook.cmd`, dépôt LOYNA). D'ici là,
reporter la formule dans `merchants.subscription_plan` à la main (voir `LOYNA/docs/STRIPE_SETUP.md`).

## Offre de lancement

`LAUNCH_OFFER` dans `src/data/site.ts` (code, date de fin). Tant qu'elle est valable : bandeau en haut des pages
(`OfferBar`, avec le Parrainage LOYNA, qui y reste seul après la date ; un texte Builder `announcement` remplace les deux offres et leurs
liens distincts, à laisser vide sauf besoin ponctuel), pastille dans le haut de page,
mention dans les grilles et code prérempli sur les liens de paiement sans engagement (`prefilled_promo_code`), clause
6.5 des CGV. Après la date, le site retire tout seul ces mentions (au build et dans le navigateur) et Stripe
refuse le code (expiration du coupon et du code promo).

## Espace client : LOYNA Business (`src/app/`)

L'application commerçante (anciennement prévue dans WeWeb) est servie par le site, en Preact
(`@astrojs/preact`, composants `client:only`), et parle directement à Supabase (projet
`alfxnoaxcmnbrqhlmmqq`) avec la **clé publishable** uniquement : la sécurité est la RLS et les contrôles
des Edge Functions (contrats : dépôt LOYNA, `docs/API.md` et `docs/WEWEB_SETUP.md`).

| Adresse | Contenu |
|---|---|
| `/espace-client/` | connexion puis accueil (indicateurs, jauge des campagnes de la semaine), scanner (caméra, BarcodeDetector ou jsQR), clients et fiche (parrainage), programme et récompenses, campagnes Wallet (temps forts, campagnes préparées par LOYNA), automatisations (anniversaire, inactifs, « Plus qu'un passage ! », avis Google ; niveaux VIP et parrainage en Pro), rapport mensuel, équipe, réglages (logo, couleurs, affiche du comptoir, boutiques et message de proximité), abonnement (portail Stripe, changement d'offre par `subscription-change`, états d'essai et d'arrêt lus de `my_service_state`), **boutique** (2026-11-04, `views/Boutique.tsx` : QR codes d'inscription personnalisés sous verre aux prix du panier et QR codes avis Google sous verre, `QR_VERRE` et `QR_AVIS` de `src/data/site.ts`, lien d'avis prérempli depuis les automatisations, paiement seul par la fonction `qr-order` du dépôt LOYNA, retour `?boutique=merci`, propriétaire seulement) — navigation `#/scanner`, `#/client/<id>`… |
| `/espace-client/#/operateur` | **écran Opérateur** (2026-10-27), visible seulement pour un compte de `platform_admins` (contrôlé par le serveur : RPC `op_orders`, `op_merchants` et fonction `merchant-bootstrap` du dépôt LOYNA refusent tout autre compte) : commandes à traiter (abonnements Stripe sans commerce : contact, offre, QR codes, compte LOYNA, parrainage), création du commerce depuis une commande (formulaire prérempli, aperçu de la carte, logo PNG/JPG/WEBP/SVG converti en PNG dans le navigateur puis téléversé dans `merchant-assets/<id>/logo.png`, adresse d'inscription), résultat : lien `loyna.fr/join/<slug>` et QR code, accès du propriétaire (compte existant : son mot de passe ; compte créé : lien « Choisir mon mot de passe » et bouton « Envoyer l'accès par e-mail »), liste des commerces (offre, cartes, lien d'inscription ; « Ouvrir » pour un commerce dont l'opérateur fait partie, « Ouvrir son espace » pour tous les autres : consultation en lecture seule de l'espace du commerce, avec bandeau « consultation opérateur, lecture seule » et « Quitter », RPC op_merchant_context et lectures réservées aux opérateurs (migration 20261029213015 du dépôt LOYNA), chaque ouverture inscrite au journal d'audit du commerce ; publié le 2026-10-29). Un opérateur sans commerce arrive directement sur cet écran. Absent de la démonstration publique ; essai local : `/espace-client/?demo&operateur` (ou `operateur=seul`), réponses fictives de `src/app/mock-operateur.ts`, chargé en développement seulement |
| `/espace-client/guide/` | **guide de démarrage** (2026-10-28) : une courte section par partie de l'espace, dans l'ordre de la mise en place, avec une capture de la démonstration ; lien dans l'e-mail « Votre carte LOYNA est prête » (dépôt LOYNA, `_shared/owner-access-email.ts`), dans le menu de l'espace (« Guide de démarrage ») et dans l'aide de connexion. Public, `noindex`, hors du plan du site. S'imprime en A4 (3 pages) ; PDF publié à côté : `guide-demarrage-loyna.pdf`. Captures : `node tools/guide-captures.mjs [adresse]` (démo, graine 268380, offre Starter, téléphone) ; PDF : `node tools/guide-pdf.mjs [adresse]` (Edge sans fenêtre, après `npx astro build` et `npx astro preview`) |
| `/espace-client/mot-de-passe/` | choix du mot de passe depuis un lien d'activation : `?token_hash=…&type=recovery` (liens de `staff-manage` et `merchant-bootstrap` depuis le 2026-10-27, vérifiés par la page avec `verifyOtp`) ou ancien lien avec les jetons après `#` (`/set-password` y est redirigé) |
| `/espace-client/confirmer/` | confirmation de l'adresse d'un compte créé dans le panier (`?token_hash=…&type=signup`, `verifyOtp`), puis ouverture de l'espace client |
| `/join/<commerce>` | inscription d'un client final (réécrite vers `/join/index.html` par `.htaccess`) |
| `/preferences/?t=…` | préférences et suppression des données d'un client final |
| `/espace-client/demo/` | **démonstration publique** sans compte : commerce, clients, passages, récompenses, campagnes et équipe fictifs tirés au hasard (`src/app/mock.ts`, graine dans `?seed=` ou le navigateur, bouton « Autres données »), scan simulé ; `/join/demo-<graine>` montre la page d'inscription du même commerce. Rien n'est envoyé ni enregistré (téléphones en 06 39 98, tranche ARCEP réservée à la fiction ; e-mails en example.com). Offre affichée : Pro par défaut ; `?offre=starter` ou le sélecteur du bandeau montrent l'autre offre (verrous, jauges) ; `?offre=premium` montre l'écran historique de Barber Kong |

- Démonstration : `/espace-client/demo/` en ligne, ou `?demo` sur `/espace-client/` en développement
  (même générateur `src/app/mock.ts`, chargé à part : absent des pages réelles) ; `/join/?slug=demo-loyna` en
  développement. Captures : `node tools/qa-app.mjs 1366 accueil scanner clients …` et `node tools/qa-flow.mjs`
  (serveur de développement sur le port 4322).
- Les mentions « inclus dans la formule … », les verrous et les jauges (cartes, campagnes de la semaine, boutiques)
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

### Session de l'espace client (téléphone de caisse)

La session reste dans le navigateur (`localStorage`, clé `loyna-business-auth`) et se renouvelle seule ; aucun délai d'expiration n'est
réglé côté Supabase. « Se déconnecter » ne ferme que l'appareil (`scope: 'local'`). Réseau coupé à l'ouverture : écran « Connexion
impossible » sans perdre la session, reprise automatique. `/espace-client/` a son manifeste (`public/espace-client/app.webmanifest`) :
ajoutée à l'écran d'accueil, l'application s'ouvre en plein écran sur le scanner. La navigation privée efface la session à la
fermeture de l'onglet : le site n'y peut rien. Essai : `node tools/qa-session.mjs` (réseau simulé, serveur de développement).

### Préparer une carte (rendez-vous avec un commerçant)

Onglet « Préparer une carte » du panel (`#/preparer`, aussi depuis la fiche d'un prospect) : nom, logo, couleurs (dont celles
du logo), passages, récompense, offre et QR codes sous verre, avec l'aperçu iPhone et Android en direct. « Créer les
liens » range tout dans `cartes.php` et donne `loyna.fr/essai/?carte=<id>` et `loyna.fr/panier/?carte=<id>` (copier, WhatsApp, SMS ; le QR code à scanner à
l'écran mène à l'essai, ou au paiement si `TRIAL.open` est faux). Le panier montre la carte et l'offre, replie les étapes offre et QR, et le commerçant crée son compte puis paie
sur Stripe par le circuit habituel (`checkout-create`). `/merci/` ne redemande pas les éléments. Pour créer le commerce,
coller le lien dans l'écran Opérateur (« Reprendre cette carte ») : récompense, passages, couleurs et logo sont repris.

- `public/espace-commercial/cartes.php` : lecture publique par identifiant aléatoire ; liste, écriture et suppression avec
  le jeton des notes. Fichiers hors de `www/` : `~/panel-commercial/cartes/<id>.json` et `<id>.logo` (PNG vérifié). Ni contact
  ni e-mail : seulement ce qui figure sur la carte et l'offre.
- `tools/commercial/notes_local.py` reproduit aussi `cartes.php` en local ; `python tools/commercial/test_cartes_serveur.py` ;
  `node tools/qa-preparer.mjs 1440 390` (de bout en bout, sur le serveur de développement).
- Le lien ne fixe pas les prix : `checkout-create` les prend dans Stripe.

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
- IndexNow (Bing, Yandex…) : lancé par `deploy.py publier` pour les pages modifiées ; à la main, `python
  tools/indexnow.py` (tout le plan du site, clé publique `public/<clé>.txt`). Google lit le plan du site
  `https://loyna.fr/sitemap.xml` déclaré dans la Search Console.
- Plan du site : `<lastmod>` = vraie date de chaque page (`tools/lastmod.mjs` : date ou `miseAJour` d'un article,
  dernier commit qui a modifié la fiche d'un métier ou le fichier source d'une page), sans `changefreq`.
  `/espace-client/` en est exclue.
- Maillage interne (`src/lib/maillage.ts`) : guides de chaque page métier (`GUIDES_PAR_METIER`, sinon mots-clés),
  métiers voisins (`METIERS_PROCHES`), « À lire aussi » des articles choisi par sujet ; tous les métiers dans le
  pied de page et dans le bloc « Pour votre métier » de /tarifs/ et /fonctionnalites/ (`PourVotreMetier.astro`).
- Auteur et entreprise : page `/a-propos/` (identité des mentions légales), fondateur `FONDATEUR` de
  `src/data/site.ts` (Person dans Organization.founder et auteur des articles, `sameAs` vide tant que les profils
  ne sont pas donnés). Article mis à jour : champ `miseAJour` (AAAA-MM-JJ) seulement si le contenu a vraiment
  changé ; il donne `dateModified` et la mention « Mis à jour le … ».

## Hébergement OVH

`loynafb.cluster129.hosting.ovh.net` (offre gratuite 100 Mo, PHP), FTP `ftp.cluster129.hosting.ovh.net`,
compte `loynafb`, dossier `www/`. `public/.htaccess` : HTTPS et domaine sans www, cache, compression,
en-têtes de sécurité. `public/contact.php` : formulaire de contact → e-mail « [Site LOYNA] … » vers
contact@loyna.fr (réponse directe au visiteur), repris par l'agent Trieur du coffre de prospection. Page `/devenir-partenaire/` (2026-10-29, programme apporteurs d'affaires, montants dans `PARTENAIRES` de `src/data/site.ts`) : sujets « Devenir partenaire » et « Recommandation partenaire » (accord du commerçant obligatoire), remerciement `/devenir-partenaire/envoye/`.

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
si le visiteur accepte : `begin_checkout` (clic vers Stripe), `generate_lead` (formulaire), `trial_start` (demande d'essai), `purchase` (/merci/).
Dans Google Analytics, régler la conservation des données sur 14 mois (annoncé dans la politique cookies).
