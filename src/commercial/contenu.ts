// Contenus d'aide à la vente du panel commercial. Règle : rien d'inventé. Chaque réponse est tirée de la grille Starter + Pro
// du 2026-10-31 (dépôt LOYNA, docs/OFFRES.md), de docs/BRIEF.md, de la FAQ du site (src/content-seed/faq.json / Builder),
// de la FAQ du coffre (05 Règles/FAQ Loyna.md), des pages du site ou de src/data/site.ts (prix, quotas et phrases fixes
// importés, jamais recopiés). Les « repères » d'horaires d'appel sont des conseils pratiques, signalés comme tels. Règles de
// démarchage : pages CNIL citées (lues le 23/10/2026).
// Formulation validée par Ewan (relecture du site, 23/10/2026) : jamais « HT » (TVA non applicable), toujours « sans TVA » ;
// un seul message sur la mise en service ; « LOYNA, une marque de KOVA Elec », Ewan « fondateur de LOYNA » (jamais « société
// Loyna »). Proximité : dire « s'affiche », jamais « à chaque passage ». Aucune phrase de résultat, jamais « en un clic ».
import {MARKETING_INTERVAL_HOURS, PHRASES, PLANS, SETUP_FEE, SITE, TRIAL, euro, essaiUrl, nombre, offerActive, quotas} from '../data/site';

export interface Reponse {
  id: string;
  q: string; // ce que dit le commerçant
  r: string[]; // ce qu'on répond (phrases courtes, à dire)
  attention?: string; // point de vigilance
  liens?: {label: string; href: string}[];
  sources: string[];
}

const S = {
  offres: 'Grille Starter + Pro du 31/10/2026 (dépôt LOYNA, docs/OFFRES.md)',
  brief: 'Brief produit (docs/BRIEF.md)',
  faq: 'FAQ du site (loyna.fr/faq/)',
  faqCoffre: 'FAQ Loyna du coffre (05 Règles)',
  tarifs: 'Tarifs du site (src/data/site.ts)',
  papier: 'Article « Carte de fidélité papier ou digitale » (loyna.fr/blog/)',
  configurateur: 'Page « Créer ma carte » (loyna.fr/creer-ma-carte/)',
  demo: 'Démonstration LOYNA Business (loyna.fr/espace-client/demo/)',
  video: 'Démo vidéo (loyna.fr/demo/)',
  simulateur: 'Simulateur de rentabilité (loyna.fr, accueil)',
  cgv: 'Conditions générales de vente (loyna.fr/cgv/)',
};

export const LIENS = {
  essai: {label: 'Essai d’un mois', href: `${SITE.url}${essaiUrl}`},
  apercu: {label: 'Aperçu gratuit de sa carte', href: 'https://loyna.fr/creer-ma-carte/'},
  demo: {label: 'Démonstration LOYNA Business', href: 'https://loyna.fr/espace-client/demo/'},
  video: {label: 'Vidéo de présentation', href: 'https://loyna.fr/demo/'},
  tarifs: {label: 'Page Tarifs', href: 'https://loyna.fr/tarifs/'},
  simulateur: {label: 'Simulateur de rentabilité', href: 'https://loyna.fr/#rentabilite'},
  papier: {label: 'Article papier ou digitale', href: 'https://loyna.fr/blog/carte-fidelite-papier-ou-digitale/'},
  faq: {label: 'FAQ du site', href: 'https://loyna.fr/faq/'},
};

const prixMin = () => Math.min(...PLANS.map((p) => p.monthly));
const listePrix = (cle: 'monthly' | 'engaged') => PLANS.map((p) => `${p.name} ${euro(p[cle])}`).join(', ');
const offre = (id: string) => PLANS.find((p) => p.id === id)!;
/** « Starter : cartes illimitées et 5 campagnes par semaine ; Pro : cartes et campagnes illimitées » */
const listeQuotas = () => PLANS.map((p) => `${p.name} : ${quotas(p).charAt(0).toLowerCase()}${quotas(p).slice(1)}`).join(' ; ');

/** Le seul message sur la mise en service (phrase fixe de la grille) ; l'offre de lancement passée, sa seconde partie seule. */
export function phraseMiseEnService(): string {
  return offerActive()
    ? `Mise en service : ${PHRASES.miseEnService.charAt(0).toLowerCase()}${PHRASES.miseEnService.slice(1)}`
    : `Mise en service : offerte avec 12 mois d’engagement, ${euro(SETUP_FEE)} une seule fois sans engagement.`;
}
export const MENTION_PRIX = `Prix en euros, sans TVA (${SITE.vatNote}) : le prix affiché est le prix payé.`;
export const KOVA = 'KOVA Elec est l’entreprise individuelle d’Ewan qui édite LOYNA ; c’est pour cela que le paiement et les factures sont à ce nom.';

/** Réponses courtes aux questions et objections probables (onglet « Questions clients »). */
export function objections(): Reponse[] {
  const starter = offre('starter');
  const pro = offre('pro');
  return [
    {
      id: 'prix',
      q: 'C’est combien ?',
      r: [
        `Deux offres. ${starter.name} : ${PHRASES.prix(starter)}`,
        `${pro.name} : ${PHRASES.prix(pro)}`,
        `${listeQuotas()}. La notification de proximité est incluse dans les deux.`,
        phraseMiseEnService(),
        ...(TRIAL.open ? [`Et vous pouvez essayer. ${PHRASES.essai}`] : []),
        MENTION_PRIX,
      ],
      attention: `Si on vous cite d’autres prix, ils viennent de l’ancienne grille : seuls ${listePrix('monthly')} sans engagement, et ${listePrix('engaged')} avec engagement, sont vendus. Toujours « sans TVA ».`,
      liens: [LIENS.tarifs],
      sources: [S.tarifs, S.offres],
    },
    {
      id: 'proximite',
      q: 'C’est quoi, la notification de proximité ?',
      r: [
        'Quand un client passe près de votre boutique, sa carte s’affiche sur l’écran de verrouillage de son téléphone, avec un court message : « Votre récompense vous attend chez … ! », « Plus que 2 passages avant votre récompense chez … », ou votre propre message.',
        'Exemple : votre client passe devant votre boulangerie, et sa carte s’affiche en notification.',
        `Sur iPhone, la carte s’affiche sur l’écran de verrouillage ; sur Android, une notification apparaît quand le client s’attarde près de la boutique. C’est inclus dans les deux offres (${starter.shops} adresse en ${starter.name}, ${pro.shops} en ${pro.name}) et jamais compté comme une campagne.`,
      ],
      attention: 'Dites « s’affiche », jamais « à chaque passage » : il faut que le client ait activé la localisation et laissé Wallet s’afficher sur l’écran verrouillé, et c’est le téléphone qui décide de l’affichage.',
      sources: [S.offres],
    },
    {
      id: 'starter-ou-pro',
      q: 'Starter ou Pro, quelle différence ?',
      r: [
        `${starter.name} : ${PHRASES.starter}`,
        `${pro.name} : ${PHRASES.pro}`,
        'Dans les deux offres : anniversaire, relance des clients qui ne reviennent plus, « Plus qu’un passage ! », demande d’avis Google, groupes de clients, campagnes programmées, courbes et rapport du mois.',
        PHRASES.pourquoiPro,
      ],
      attention: 'Starter est l’offre mise en avant, jamais « la plus choisie » : aucun chiffre de ce type n’existe. Si on vous parle de Premium (ancien réel, ancienne planche) : « L’offre Premium n’est plus proposée. Voici l’offre Starter, qui reprend ses automatisations. »',
      liens: [LIENS.tarifs],
      sources: [S.offres, S.tarifs],
    },
    {
      id: 'pro',
      q: 'Que comprend Pro ?',
      r: [
        `${PHRASES.pro} ${PHRASES.prix(pro)}`,
        'LOYNA écrit et programme vos messages, au moins un par mois : vous validez, rien ne part sans vous. Et un point de 30 minutes par mois avec LOYNA, à votre demande.',
        'Parrainage entre vos clients : chacun invite ses amis avec son lien, bonus aux deux à la première visite. Niveaux VIP bronze, argent et or : la carte de vos meilleurs clients change de couleur.',
        `Campagnes illimitées, jusqu’à ${pro.shops} adresses avec la notification de proximité (une seule carte, un seul tableau de bord), votre carte sans la mention LOYNA et support prioritaire.`,
        'Une fois, sous 15 jours : votre carte finie à la main (logo retouché et, sur une carte à tampons, cachets à vos initiales), une vidéo et des visuels de votre carte, prêts à poster. Et le kit comptoir : 1 QR code sous verre par adresse, offert une fois.',
      ],
      attention: 'Kit : avec engagement, envoyé après le 1er paiement ; sans engagement, après le 3e ; sous 15 jours ensuite. Vidéo, visuels et carte finie à la main : à partir du 1er paiement, jamais pendant l’essai. Support prioritaire : traité avant les autres, sans délai chiffré ni téléphone. Aucune statistique par boutique n’existe. La validation d’un message se fait en 2 gestes : ne dites jamais « en un clic ».',
      sources: [S.offres],
    },
    {
      id: 'notifications',
      q: 'Les notifications, c’est compris ? Combien ?',
      r: [
        'Oui, sans coût par message. Dans les deux offres, le client est prévenu automatiquement à chaque passage et quand sa récompense est débloquée.',
        `Pour vos campagnes (offres, nouveautés), un nombre de campagnes par semaine : ${PLANS.map((p) => `${p.campaignsPerWeek === null ? 'illimitées' : nombre(p.campaignsPerWeek)} avec ${p.name}`).join(', ')}. Une campagne compte pour une, qu’elle parte vers 30 ou 300 clients, et le compteur repart chaque lundi.`,
        `Les messages automatiques et les notifications de proximité ne sont jamais décomptés. Et un client reçoit au plus un message commercial toutes les ${MARKETING_INTERVAL_HOURS} h, pour ne pas le lasser (délai réglable).`,
      ],
      sources: [S.offres, S.tarifs],
    },
    {
      id: 'quotas',
      q: 'Et si j’ai plus de clients que prévu ?',
      r: [
        'Aucune limite : clients et cartes sont illimités dans les deux offres, sans supplément.',
        `Ce qui change, c’est le nombre de campagnes : ${listeQuotas()}. Une campagne compte pour une, qu’elle parte vers 30 ou 300 clients, et le compteur repart chaque lundi.`,
      ],
      sources: [S.offres, S.tarifs],
    },
    {
      id: 'cher',
      q: 'C’est trop cher / ça va me rapporter quoi ?',
      r: [
        'Faisons le calcul avec vos chiffres : divisez l’abonnement par votre marge moyenne sur une visite. Vous obtenez le nombre de visites en plus qu’il faut chaque mois pour rentrer dans vos frais.',
        `Exemple purement indicatif, repris du site : avec 6 € de marge par visite, un abonnement à ${euro(prixMin())} par mois correspond à environ ${Math.round(prixMin() / 6)} visites supplémentaires dans le mois, tous clients confondus.`,
        'Pas de matériel à acheter, et les notifications Wallet n’ont aucun coût par message.',
      ],
      attention: 'Ne promettez aucun résultat chiffré : aucune statistique de résultat n’est publiée. Le simulateur de l’accueil fait le calcul avec ses propres chiffres.',
      liens: [LIENS.simulateur],
      sources: [S.papier, S.simulateur, S.faq],
    },
    {
      id: 'papier',
      q: 'J’ai déjà une carte papier, ça marche très bien.',
      r: [
        'La carte papier se perd, s’imite facilement et ne permet pas de relancer un client qui ne vient plus.',
        'La carte LOYNA est dans le téléphone du client : elle ne se perd pas, se met à jour toute seule, limite la fraude (un scan par passage, protection anti double scan, historique), prévient le client quand sa récompense l’attend et s’affiche sur son téléphone quand il passe près de votre boutique.',
        'Pour passer au digital, vous reprenez les tampons de l’ancienne carte au moment de l’inscription : un ajustement manuel motivé et tracé.',
      ],
      attention: 'Pour les clients sans smartphone, il faut prévoir une alternative (le site le dit honnêtement).',
      liens: [LIENS.papier],
      sources: [S.papier, S.faq],
    },
    {
      id: 'appli',
      q: 'Mes clients ne veulent pas télécharger une application.',
      r: [
        'Justement, il n’y a aucune application à télécharger : la carte s’ajoute dans Apple Wallet sur iPhone ou dans Google Wallet sur Android.',
        'Le client scanne votre QR code, remplit un formulaire très court (prénom, téléphone s’il le souhaite) et ajoute sa carte en un geste.',
      ],
      sources: [S.faq, S.brief, S.faqCoffre],
    },
    {
      id: 'temps',
      q: 'Je n’ai pas le temps, ça a l’air compliqué.',
      r: [
        'Votre carte est prête sous 24 h, hors personnalisation exceptionnelle. Logo, couleurs, nom du programme et récompense se règlent sans code.',
        'Au comptoir : un scan, un passage validé. Pas de recherche du client, pas de bouton +1, pas de seconde confirmation. La récompense se débloque toute seule.',
      ],
      sources: [S.brief, S.faq],
    },
    {
      id: 'materiel',
      q: 'Il faut acheter du matériel ?',
      r: [
        'Non : un smartphone suffit pour scanner les cartes, et LOYNA Business s’ouvre aussi sur ordinateur.',
        'Pas de terminal, pas de lecteur, pas de cartes à imprimer : il suffit d’afficher votre QR code d’inscription.',
      ],
      sources: [S.faq, S.faqCoffre],
    },
    {
      id: 'engagement',
      q: 'Je suis engagé combien de temps ?',
      r: ['Seulement si vous le choisissez. Sans engagement, vous arrêtez à la fin de n’importe quel mois.', PHRASES.engagement],
      attention: 'L’engagement est proposé, jamais imposé. La sortie vaut pour un commerce qui ferme, sur justificatif de radiation : la vente du fonds ne l’ouvre pas d’office, renvoyez cette question à Ewan.',
      sources: [S.offres, S.cgv],
    },
    {
      id: 'essai',
      q: 'Je peux essayer gratuitement ?',
      r: TRIAL.open
        ? [
            `Oui. ${PHRASES.essai}`,
            `L’essai donne l’offre ${starter.name} complète, avec ses ${starter.campaignsPerWeek} campagnes par semaine. Aucun prélèvement : à la fin du mois, la carte se met en pause tant qu’aucune offre n’est choisie. Pro se prend à tout moment, sans essai propre.`,
            'Vous souscrivez quand vous voulez : le premier paiement a lieu le jour de la souscription, et les jours d’essai restants ne sont pas reportés.',
          ]
        : ['Il n’y a pas d’essai gratuit. En revanche, sans rien payer, vous pouvez voir l’aperçu de votre carte à votre nom et à vos couleurs (gratuit, sans inscription), la démonstration de LOYNA Business avec des données fictives, et la vidéo de présentation.'],
      attention: TRIAL.open
        ? 'Lien à envoyer : loyna.fr/essai/, ou le lien d’essai de « Préparer une carte », qui reprend sa carte. Sont demandés : e-mail, téléphone et mot de passe, plus de SIRET ; 1 essai par e-mail et par téléphone (les CGV disent qu’un essai en doublon échoue). Avec le lien d’une carte préparée, le commerçant crée seulement son compte, voit sa carte et démarre. Aucun service de Pro pendant l’essai, ni document. Si la page annonce que les essais sont complets, proposez l’abonnement ou l’aperçu gratuit.'
        : undefined,
      liens: TRIAL.open ? [LIENS.essai, LIENS.apercu, LIENS.demo] : [LIENS.apercu, LIENS.demo, LIENS.video],
      sources: TRIAL.open ? [S.offres, S.cgv] : [S.brief, S.configurateur, S.demo, S.video],
    },
    {
      id: 'arret',
      q: 'Et si j’arrête ?',
      r: [
        PHRASES.arret,
        'Pendant l’arrêt, vous gardez l’accès à votre espace client : vous consultez vos clients, vous les exportez en CSV et vous reprenez l’abonnement quand vous voulez, sans mise en service à payer.',
      ],
      attention: 'Ne dites jamais que la carte disparaît : elle reste dans le téléphone, solde affiché, mais elle ne crédite plus. Une suspension décidée par LOYNA n’est levée que par LOYNA. Avec engagement, l’arrêt ne dispense pas des mensualités dues.',
      sources: [S.offres, S.cgv],
    },
    {
      id: 'references',
      q: 'Vous avez des clients ? Des avis ?',
      r: ['Montrez le produit plutôt que des références : la démonstration (données fictives) et l’aperçu de sa propre carte, puis proposez un rendez-vous de 15 minutes pour la présenter.'],
      attention: 'Ne citez aucun client, avis ou chiffre de résultat : aucun n’est publié (brief produit). La FAQ du coffre n’a pas de réponse validée sur ce point.',
      liens: [LIENS.demo, LIENS.apercu],
      sources: [S.brief, S.faqCoffre],
    },
    {
      id: 'donnees',
      q: 'Et les données de mes clients ? Le RGPD ?',
      r: [
        'Les données sont hébergées dans l’Union européenne, protégées, chiffrées et jamais utilisées à des fins commerciales.',
        'À l’inscription, vos clients donnent des consentements séparés (fidélité, offres par notification Wallet), jamais cochés d’avance. Sur demande d’un client, vous exportez ou supprimez ses données.',
        'Le QR code de la carte ne contient aucune donnée personnelle : seulement un jeton opaque, révocable.',
      ],
      sources: [S.faq, S.brief, S.faqCoffre],
    },
    {
      id: 'position',
      q: 'Vous savez où sont mes clients ? (notification de proximité)',
      r: ['Non. LOYNA ne reçoit jamais la position du client : l’adresse de la boutique est enregistrée dans sa carte, et c’est son téléphone qui détecte qu’il est à proximité.'],
      sources: [S.offres],
    },
    {
      id: 'android',
      q: 'Ça marche aussi sur Android ?',
      r: ['Oui : Apple Wallet sur iPhone, Google Wallet sur Android, sans application dans les deux cas. La carte se met à jour toute seule à chaque passage.'],
      sources: [S.faq],
    },
    {
      id: 'equipe',
      q: 'Mes employés pourront scanner ?',
      r: ['Oui, sans limite d’employés : un compte par personne (propriétaire, administrateur, employé), avec des droits adaptés. Les actions importantes sont tracées dans un journal.'],
      sources: [S.faq, S.brief],
    },
    {
      id: 'fraude',
      q: 'Et si une carte est scannée deux fois ?',
      r: ['La même carte ne peut pas être validée deux fois dans le délai que vous réglez, un bouton « Annuler » reste disponible quelques secondes après le scan, et chaque passage est inscrit dans le journal.'],
      sources: [S.faq],
    },
    {
      id: 'delai',
      q: 'Combien de temps pour que ce soit prêt ?',
      r: [
        'Votre carte est prête sous 24 h, hors personnalisation exceptionnelle. Vous affichez ensuite votre QR code et vous scannez vos premiers clients.',
        ...(TRIAL.open ? ['Avec l’essai, elle est créée tout de suite à partir de vos réglages et du modèle de votre métier.'] : []),
      ],
      sources: [S.faqCoffre, S.faq],
    },
    {
      id: 'paiement',
      q: 'Comment je paie ? Et les factures ?',
      r: [
        'En ligne, par carte bancaire, de façon sécurisée via Stripe, au nom de KOVA Elec : LOYNA est une marque de KOVA Elec. Les factures sont dans votre espace client.',
        MENTION_PRIX,
      ],
      sources: [S.faq, S.brief],
    },
    {
      id: 'kova',
      q: 'C’est qui, KOVA Elec ? (paiement, facture)',
      r: [KOVA, 'LOYNA est une marque de KOVA Elec ; Ewan en est le fondateur.'],
      sources: [S.brief, 'Mentions légales (loyna.fr/mentions-legales/)'],
    },
    {
      id: 'changer',
      q: 'Je pourrai changer d’offre ou résilier ?',
      r: [
        'Oui, depuis votre espace client. Sans engagement : le changement d’offre est immédiat, au prorata, et une résiliation prend effet à la fin du mois en cours. Vous pouvez aussi prendre l’engagement : 12 mois à partir de ce jour.',
        'Avec engagement : passer de Starter à Pro reste possible, avec la même date de fin ; revenir à Starter ou retirer l’engagement attend la fin des 12 mois, et une résiliation prend effet à leur terme. Ensuite : même prix, résiliable à la fin de n’importe quel mois.',
      ],
      attention: 'Aucune mise en service n’est facturée à un changement d’offre.',
      sources: [S.offres, S.cgv],
    },
    {
      id: 'telephone',
      q: 'Et si un client change de téléphone ?',
      r: ['Il ajoute de nouveau sa carte en repassant par votre QR code ou votre lien d’inscription ; ses passages restent enregistrés dans sa fiche. En cas d’écart, vous ajustez son solde, de façon motivée et tracée.'],
      sources: [S.faq],
    },
    {
      id: 'reflechir',
      q: 'Je vais réfléchir. Envoyez-moi une documentation.',
      r: [
        `Proposez d’envoyer par mail la vidéo de présentation (pièce jointe prévue par la FAQ du coffre), le lien de la démonstration, l’aperçu de sa carte${TRIAL.open ? ', l’essai d’un mois' : ''} et la page Tarifs.`,
        'Fixez ensemble le moment où vous le rappelez, et notez-le dans la fiche.',
      ],
      liens: [...(TRIAL.open ? [LIENS.essai] : []), LIENS.video, LIENS.demo, LIENS.apercu, LIENS.tarifs],
      sources: [S.faqCoffre, S.video, S.demo, S.configurateur],
    },
  ];
}

/** Déroulé d'un appel (onglet « Aide à la prospection »). */
export function derouleAppel(): {titre: string; duree?: string; points: string[]}[] {
  return [
    {
      titre: 'Accroche',
      duree: '15 secondes',
      points: [
        '« Bonjour {Prénom}, c’est Ewan, fondateur de LOYNA, à Montpellier. Je vous ai écrit au sujet d’une carte de fidélité digitale pour {Commerce}. Avez-vous deux minutes ? »',
        'Sans prénom : demander le ou la responsable du commerce (le dirigeant du registre est dans la fiche).',
        'Pas le moment : « Quand puis-je vous rappeler ? », puis noter le créneau dans la fiche.',
      ],
    },
    {
      titre: 'Questions',
      duree: '1 minute',
      points: [
        '« Avez-vous déjà une carte de fidélité ? Papier, tampons ? »',
        '« Vos habitués reviennent tous les combien ? »',
        '« Comment les prévenez-vous d’une offre ou d’une nouveauté ? »',
        '« Qui est au comptoir : vous seul ou une équipe ? »',
      ],
    },
    {
      titre: 'Présentation',
      duree: '30 secondes',
      points: [
        '« Vos clients scannent un QR code au comptoir et ajoutent votre carte dans Apple Wallet ou Google Wallet, sans application. »',
        '« À chaque visite, vous scannez leur carte avec votre téléphone : un scan, un passage validé. »',
        '« Au seuil que vous choisissez, la récompense se débloque toute seule et le client reçoit une notification sur son téléphone. »',
        '« Et quand il passe près de votre boutique, sa carte s’affiche sur l’écran de verrouillage de son téléphone. »',
        `« Votre carte est prête sous 24 h, à partir de ${euro(prixMin())} par mois, sans TVA, sans engagement. La relance et les rappels partent tout seuls, l’anniversaire et l’avis Google s’activent en un réglage, dans les deux offres. »`,
        ...(TRIAL.open ? [`« Vous pouvez l’essayer : ${TRIAL.label}. »`] : []),
      ],
    },
    {
      titre: 'Objections',
      points: ['Réponses courtes dans l’onglet « Questions clients », toutes tirées du site, du brief et de la FAQ du coffre.'],
    },
    {
      titre: 'Conclusion',
      points: [
        TRIAL.open
          ? 'Intéressé : proposer un rendez-vous de 15 minutes, ou, s’il veut commencer, l’essai d’un mois ou le paiement : les 2 liens sont dans « Préparer une carte ». En visite, le QR code à l’écran mène à l’essai, pas au paiement.'
          : 'Intéressé : proposer un rendez-vous de 15 minutes, ou, s’il veut commencer, le lien de paiement de « Préparer une carte ».',
        'Hésite : « Je vous envoie l’aperçu de votre carte et la démonstration ? » : loyna.fr/creer-ma-carte/ et loyna.fr/espace-client/demo/. Vérifier son adresse e-mail.',
        'Pas intéressé : remercier, demander la raison principale, passer la fiche en « refus ».',
        'Ne veut plus être contacté : Liste STOP et fiche en « stop », tout de suite.',
      ],
    },
    {
      titre: 'Après l’appel',
      points: [
        'Dans la fiche (Obsidian) : une ligne datée dans « Historique », le statut, le RDV au format AAAA-MM-JJ HH:MM, la nouvelle adresse e-mail s’il en a donné une.',
        'Le panel se met à jour à la prochaine publication des données (fin de passage des agents, ou panel.py publier).',
      ],
    },
  ];
}

/** Repères pratiques d'horaires d'appel, par famille de commerce (conseils, pas des règles). */
export const HORAIRES: Record<string, string> = {
  'Coiffure et barbier': 'Du mardi au vendredi, en milieu de matinée (10 h – 11 h 30) ou en début d’après-midi (14 h – 15 h 30). Éviter le samedi, souvent le plus chargé ; beaucoup de salons ferment le lundi.',
  Onglerie: 'Entre deux rendez-vous, en milieu de matinée ou d’après-midi. Si la personne est en pose, proposer de rappeler à une heure précise.',
  'Beauté et bien-être': 'Entre deux soins, en milieu de matinée ou d’après-midi. Si la personne est en cabine, proposer de rappeler à une heure précise.',
  'Restauration rapide': 'Entre les services, de 15 h à 17 h. Jamais de 11 h 30 à 14 h, ni le soir.',
  'Boulangerie, café': 'Dans le creux de l’après-midi (14 h – 16 h). Éviter l’ouverture, le midi et la fin de journée.',
  Autre: 'En semaine, en milieu de matinée ou d’après-midi.',
};

export const BONNES_PRATIQUES: string[] = [
  'Avant d’appeler : relire la fiche (historique, réponse éventuelle) et garder l’onglet « Questions clients » ouvert.',
  'Se présenter tout de suite : prénom, LOYNA, objet de l’appel. Vouvoiement, phrases courtes.',
  'Ne rien inventer : ni client, ni avis, ni chiffre de résultat, ni fausse urgence. L’offre de lancement a une vraie date de fin : la citer telle quelle.',
  'Messagerie : un message de 20 secondes (qui vous êtes, pourquoi, quand vous rappelez), puis noter la tentative dans la fiche.',
  'Ne pas insister : après deux appels sans réponse, laisser un message et passer au suivant.',
];

export const REGLES_B2B: {titre: string; points: string[]}[] = [
  {
    titre: 'Téléphone',
    points: [
      'Depuis le 11 août 2026, appeler des particuliers demande leur consentement préalable. Les professionnels, eux, gardent la possibilité de s’opposer : on peut les appeler si l’appel concerne leur activité (ici, fidéliser leurs clients).',
      'Dire tout de suite qui appelle (LOYNA) et pourquoi, et laisser la personne refuser simplement les prochains appels.',
      'Les plages fixées par la loi (du lundi au vendredi, 10 h – 13 h et 14 h – 20 h, ni samedi, ni dimanche, ni jour férié) visent les appels aux particuliers. La CNIL ne dit pas qu’elles s’appliquent aux professionnels, mais c’est un bon repère.',
    ],
  },
  {
    titre: 'E-mail',
    points: [
      'Envers des professionnels, pas de consentement préalable si le message est en rapport avec leur métier.',
      'Chaque message doit indiquer qui l’envoie et permettre de refuser simplement et gratuitement les suivants.',
      'Les adresses génériques d’une société (contact@…) ne sont pas concernées par ces règles.',
    ],
  },
  {
    titre: 'Données et droit d’opposition',
    points: [
      'Si l’on vous demande d’où vient le numéro ou l’adresse : d’une page publique (site, fiche Google, annuaire…), indiquée dans les sources de la fiche.',
      'Toute demande du type « ne m’appelez plus » ou « ne m’écrivez plus » : ajouter l’adresse à la Liste STOP du coffre (05 Règles/Liste STOP.md) avec la date et une citation courte, et passer la fiche en « stop », immédiatement. On ne retire jamais une ligne ; le script d’envoi refuse ensuite toute adresse de la liste.',
    ],
  },
];

export const SOURCES_CNIL = [
  {label: 'CNIL : prospection par téléphone (hors automate d’appel)', href: 'https://www.cnil.fr/fr/prospection-commerciale-par-telephone-hors-automate-dappel-quelles-sont-les-regles'},
  {label: 'CNIL : prospection par courrier électronique', href: 'https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique'},
];
