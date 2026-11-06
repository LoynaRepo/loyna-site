# Brief produit LOYNA — source unique pour tous les textes du site

Ne rien inventer en dehors de ce document : pas de statistiques, pas de clients, pas de témoignages,
pas d'avis, pas de chiffres de résultats, pas de récompenses ou labels. Le seul essai gratuit est celui décrit plus bas.

## L'entreprise
- LOYNA, une marque de KOVA Elec (entreprise individuelle d'Ewan, fondateur de LOYNA), basée à Montpellier (Occitanie).
  Jamais « société Loyna ». E-mail : contact@loyna.fr.
- Slogan : « Faites revenir vos clients, sans complexité. » Signature du logo : « Loyal customers. Brighter tomorrows. »
- TVA non applicable, art. 293 B du CGI (franchise en base) : le prix affiché, sans TVA, est le prix payé. Ne jamais
  écrire « HT » : « 29 € par mois, sans TVA ».

## Le produit
LOYNA est un logiciel (SaaS) de fidélisation digitale pour les commerces indépendants : la carte de fidélité
est dans le téléphone du client (Apple Wallet sur iPhone, Google Wallet sur Android), sans application à télécharger.

Parcours du client final :
1. Il scanne un QR code d'inscription (affiche, comptoir, vitrine, réseaux sociaux).
2. Il remplit un formulaire très court (prénom, téléphone facultatif, consentements séparés et non cochés).
3. Il ajoute sa carte dans Apple Wallet ou Google Wallet en un geste.
4. À chaque visite, le commerçant scanne la carte : le passage est validé, la carte se met à jour toute seule.
5. Au seuil fixé (ex. 10 passages), la récompense se débloque automatiquement et le client reçoit une notification Wallet.

Côté commerçant (application « LOYNA Business », sur téléphone ou ordinateur) :
- Scanner : un scan = un passage validé. Pas de recherche du client, pas de bouton +1, pas de seconde confirmation.
  Protection anti double scan (délai réglable) et bouton « Annuler » pendant quelques secondes.
- Programme : carte à passages (tampons) ou à points, nombre de passages, récompenses, délai anti double scan.
- Récompenses : débloquées automatiquement, utilisées en un scan, historique complet.
- Clients : liste, recherche, filtres (actifs, inactifs, récompense disponible, nouveaux), fiche client
  (solde, historique, récompenses, consentements), ajustement manuel motivé et tracé.
- Notifications Wallet (seul canal, sans coût par message) : passage validé, récompense disponible, offre ou
  nouveauté. Un même client reçoit au plus un message commercial par 24 h, réglable.
- Notification de proximité (toutes les offres) : quand le client passe près de la boutique, sa carte s'affiche sur
  l'écran de verrouillage (iPhone) ou en notification quand il s'attarde près de la boutique (Android). LOYNA ne
  reçoit jamais la position du client : c'est le téléphone qui détecte la proximité. Dire « s'affiche », jamais
  « à chaque passage » (il faut la localisation activée).
- Campagnes de notifications vers tous les clients ou un groupe (fidèles, inactifs 30/60/90 jours, anniversaires du mois,
  récompense disponible, critères sur mesure), tout de suite ou programmées : 5 par semaine avec Starter, illimitées avec Pro.
- Automatisations (toutes les offres) : anniversaire, relance des clients qui ne reviennent plus, « Plus qu'un passage ! »,
  demande d'avis Google après la 3e visite, rapport du mois par e-mail avec jusqu'à 3 conseils.
- Tableau de bord : clients actifs, nouveaux clients, passages, récompenses débloquées et utilisées,
  clients inactifs, évolution de l'activité. Aucun indicateur inventé.
- Équipe : un compte par personne (propriétaire, administrateur, employé), rôles et droits, pas de limite d'employés.
- Personnalisation sans code : logo, couleurs, nom du programme, récompense.
- Journal d'audit des actions (passage ajouté ou annulé, récompense utilisée, campagne envoyée…).
- RGPD : consentements séparés (fidélité / offres par notification Wallet), retrait de l'accord depuis « Mes
  préférences » au dos de la carte, export et suppression des données d'un client, minimisation des données.
  Données hébergées dans l'Union européenne.
- Le QR code de la carte ne contient aucune donnée personnelle (jeton opaque, révocable).

Mise en place : la carte est prête sous 24 h (hors personnalisation exceptionnelle). Matériel : rien de
spécial, un smartphone suffit pour scanner. Données : protégées, chiffrées, jamais utilisées à des fins commerciales.

## Les offres (décision d'Ewan du 2026-10-31 ; source de vérité : dépôt LOYNA, docs/OFFRES.md)
Prix par mois, sans TVA, toujours réglés au mois. Toujours dans cet ordre : Starter, Pro. Phrases fixes, au mot près : `PHRASES`
de `src/data/site.ts`. Premium n'est plus vendue : seul Barber Kong la garde, à son prix, comme offre historique.
- STARTER, « La carte complète » : 29 € par mois, sans TVA, sans engagement : vous arrêtez à la fin de n'importe quel mois. Ou
  24,65 € par mois avec 12 mois d'engagement, réglés chaque mois. La carte complète, sans limite de clients, avec les messages qui
  partent tout seuls : Apple Wallet et Google Wallet, QR code et affiche du comptoir, passages, points ou montant dépensé, récompenses
  automatiques, scanner et comptes équipe illimités, notification de proximité (1 adresse), anniversaire, relance, « Plus qu'un
  passage ! », demande d'avis Google, 5 campagnes par semaine, tableau de bord, rapport du mois, export CSV, support par e-mail.
- PRO, « LOYNA s'en occupe » : 49 € par mois, sans TVA, sans engagement : vous arrêtez à la fin de n'importe quel mois. Ou 41,65 € par
  mois avec 12 mois d'engagement, réglés chaque mois. Vos clients invitent leurs amis, LOYNA écrit vos messages : tout Starter, plus le
  parrainage entre clients, les messages écrits et programmés par LOYNA (rien ne part sans validation), les
  campagnes illimitées, 3 adresses (une seule carte, un seul tableau de bord), la carte sans la mention LOYNA, la carte finie à la main,
  une vidéo et des visuels, le kit comptoir (1 QR code sous verre par adresse, offert une fois), un point de 30 minutes par mois à la
  demande, le support prioritaire (sans délai chiffré ni téléphone).
- Essai : 1 mois gratuit, sans carte bancaire. Votre carte est créée tout de suite à partir de vos réglages et du modèle de votre
  métier. 1 essai par commerce. Il donne Starter, depuis `/essai/`, SIRET demandé. Pas de prélèvement à la fin : la carte se met en pause.
- Arrêt : si l'abonnement s'arrête ou si un paiement reste impayé 15 jours, la carte reste dans le téléphone de vos clients mais elle ne
  crédite plus, et les inscriptions et les messages s'arrêtent. Tout repart automatiquement dès que le paiement passe ou que l'abonnement
  est repris, avec vos clients et leurs soldes. Sans reprise, vos données sont supprimées 90 jours après l'arrêt.
- Quotas : cartes et clients illimités partout ; une campagne compte pour une, quel que soit le nombre de destinataires, le compteur
  repart chaque lundi. Les messages automatiques et les notifications de proximité ne sont jamais décomptés.
- Mise en service : offerte jusqu'au 31 décembre 2026. Ensuite : offerte avec 12 mois d'engagement, 49 € une seule fois sans engagement.
  Jamais refacturée à un client qui reprend un abonnement.
- Engagement (seulement proposé) : avec 12 mois d'engagement : 15 % de moins, réglé chaque mois, rien d'avance. Sortie possible si
  votre commerce ferme, sur justificatif de radiation. Après les 12 mois : même prix, résiliable à la fin de n'importe quel mois, sans
  nouvelle durée.
- Jamais vendu : SMS, carte iOS 27, API, webhooks, caisse, intégrations, statistiques par boutique, import de fichier clients, cartes
  cadeaux, roue et jeux, double tampon, tampons offerts à l'inscription, téléphone ou délai de réponse chiffré. Aucune phrase de résultat.
- Entreprise : LOYNA est une activité de KOVA Elec, nom commercial d'Ewan Touquet, entrepreneur individuel (SIREN 932 811 839, siège SIRET 932 811 839 00020, Fabrègues). Les paiements Stripe apparaissent au nom de KOVA ELEC. TVA non applicable, art. 293 B du CGI.
- Offre de lancement (décision d'Ewan du 2026-10-09) : mise en service offerte à tous avec le code promo Stripe LANCEMENT2026, jusqu'au 31 décembre 2026 23 h 59 (coupon loyna_lancement_2026_v2, -49 € sur la 1re facture). L'ancien code « LANCEMENT » (coupon limité au produit mise en service) est refusé par Stripe Checkout : à désactiver dans le Dashboard.
- Paiement en ligne sécurisé par Stripe (carte bancaire). Facture disponible dans l'espace client.

## Cibles
Commerces indépendants de proximité : coiffeurs, barbiers, instituts de beauté, ongleries, spas,
boulangeries-pâtisseries, cafés et salons de thé, snacks, kebabs, tacos, pizzerias à emporter, boutiques.
Pas les chaînes ni les franchises.

## Ton
Français clair et chaleureux, professionnel, phrases courtes, vouvoiement. Orienté résultat pour le
commerçant (faire revenir ses clients) plutôt que technologie. Typographie française (espace insécable
avant : ; ! ? et €, guillemets « »).
