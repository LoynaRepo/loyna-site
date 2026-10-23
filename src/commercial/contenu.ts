// Contenus d'aide à la vente du panel commercial. Règle : rien d'inventé. Chaque réponse est tirée de
// docs/BRIEF.md, de la FAQ du site (src/content-seed/faq.json / Builder), de la FAQ du coffre (05 Règles/FAQ Loyna.md),
// des pages du site ou de src/data/site.ts (prix importés, jamais recopiés). Les « repères » d'horaires d'appel
// sont des conseils pratiques, signalés comme tels. Règles de démarchage : pages CNIL citées (lues le 23/10/2026).
// Formulation validée par Ewan (relecture du site, 23/10/2026) : jamais « HT » (TVA non applicable) ; engagement du
// mensuel dit en clair ; un seul message sur la mise en service ; « LOYNA, une marque de KOVA Elec », Ewan « fondateur
// de LOYNA » (jamais « société Loyna »).
import {COMPARISON, LAUNCH_OFFER, PLANS, SETUP_FEE, SITE, euro, offerActive} from '../data/site';

export interface Reponse {
  id: string;
  q: string; // ce que dit le commerçant
  r: string[]; // ce qu'on répond (phrases courtes, à dire)
  attention?: string; // point de vigilance
  liens?: {label: string; href: string}[];
  sources: string[];
}

const S = {
  brief: 'Brief produit (docs/BRIEF.md)',
  faq: 'FAQ du site (loyna.fr/faq/)',
  faqCoffre: 'FAQ Loyna du coffre (05 Règles)',
  tarifs: 'Tarifs du site (src/data/site.ts)',
  papier: 'Article « Carte de fidélité papier ou digitale » (loyna.fr/blog/)',
  configurateur: 'Page « Créer ma carte » (loyna.fr/creer-ma-carte/)',
  demo: 'Démonstration LOYNA Business (loyna.fr/espace-client/demo/)',
  video: 'Démo vidéo (loyna.fr/demo/)',
  simulateur: 'Simulateur de rentabilité (loyna.fr, accueil)',
};

export const LIENS = {
  apercu: {label: 'Aperçu gratuit de sa carte', href: 'https://loyna.fr/creer-ma-carte/'},
  demo: {label: 'Démonstration LOYNA Business', href: 'https://loyna.fr/espace-client/demo/'},
  video: {label: 'Vidéo de 80 secondes', href: 'https://loyna.fr/demo/'},
  tarifs: {label: 'Page Tarifs', href: 'https://loyna.fr/tarifs/'},
  simulateur: {label: 'Simulateur de rentabilité', href: 'https://loyna.fr/#rentabilite'},
  papier: {label: 'Article papier ou digitale', href: 'https://loyna.fr/blog/carte-fidelite-papier-ou-digitale/'},
  faq: {label: 'FAQ du site', href: 'https://loyna.fr/faq/'},
};

const prixMin = () => Math.min(...PLANS.map((p) => p.monthly));
const listePrix = (cle: 'monthly' | 'yearly') => PLANS.map((p) => `${p.name} ${euro(p[cle])}`).join(', ');
function smsInclus(): {growth: string; pro: string} {
  const ligne = COMPARISON.find((l) => /SMS/i.test(l.label));
  return {growth: String(ligne?.values[1] ?? ''), pro: String(ligne?.values[2] ?? '')};
}

/** Le seul message sur la mise en service : offerte pendant l'offre de lancement, sinon 49 € une fois. */
export function phraseMiseEnService(): string {
  return offerActive()
    ? `Mise en service offerte jusqu’au ${LAUNCH_OFFER.untilLabel}, en mensuel comme en annuel (code ${LAUNCH_OFFER.code}, déjà appliqué par nos boutons).`
    : `Mise en service : ${euro(SETUP_FEE)} une seule fois, offerte en paiement annuel.`;
}
export const MENTION_PRIX = `Prix en euros, sans TVA (${SITE.vatNote}) : le prix affiché est le prix payé.`;
export const ENGAGEMENT_MENSUEL = 'Engagement de 12 mois, réglés chaque mois, puis résiliable à la fin de n’importe quel mois, sans frais.';
export const ENGAGEMENT_ANNUEL = '12 mois payés en une fois, renouvelables.';
export const KOVA = 'KOVA Elec est l’entreprise individuelle d’Ewan qui édite LOYNA ; c’est pour cela que le paiement et les factures sont à ce nom.';

/** Réponses courtes aux questions et objections probables (onglet « Questions clients »). */
export function objections(): Reponse[] {
  const sms = smsInclus();
  return [
    {
      id: 'prix',
      q: 'C’est combien ?',
      r: [
        `Trois formules, par mois, sans TVA : ${listePrix('monthly')}. ${MENTION_PRIX}`,
        `En paiement annuel, 15 % de réduction : ${listePrix('yearly')} par an, sans TVA.`,
        phraseMiseEnService(),
      ],
      liens: [LIENS.tarifs],
      sources: [S.tarifs, S.brief, S.faqCoffre],
    },
    {
      id: 'cher',
      q: 'C’est trop cher / ça va me rapporter quoi ?',
      r: [
        'Faisons le calcul avec vos chiffres : divisez l’abonnement par votre marge moyenne sur une visite. Vous obtenez le nombre de visites en plus qu’il faut chaque mois pour rentrer dans vos frais.',
        `Exemple purement indicatif, repris du site : avec 6 € de marge par visite, un abonnement à ${euro(prixMin())} par mois correspond à environ ${Math.round(prixMin() / 6)} visites supplémentaires dans le mois, tous clients confondus.`,
        'Pas de matériel à acheter, et les notifications Wallet sont incluses dans toutes les formules, sans coût par message.',
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
        'La carte LOYNA est dans le téléphone du client : elle ne se perd pas, se met à jour toute seule, limite la fraude (un scan par passage, protection anti double scan, historique) et prévient le client quand sa récompense l’attend.',
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
      r: [
        `En mensuel : ${ENGAGEMENT_MENSUEL.charAt(0).toLowerCase()}${ENGAGEMENT_MENSUEL.slice(1)}`,
        `En annuel : ${ENGAGEMENT_ANNUEL.replace(/\.$/, '')}, avec 15 % de réduction et la mise en service offerte.`,
      ],
      attention: 'La FAQ du coffre n’a pas de réponse validée sur l’engagement : le Trieur ne répond pas seul à cette question par mail.',
      sources: [S.brief, S.faq],
    },
    {
      id: 'essai',
      q: 'Je peux essayer gratuitement ?',
      r: [
        'Il n’y a pas d’essai gratuit. En revanche, sans rien payer, vous pouvez voir l’aperçu de votre carte à votre nom et à vos couleurs (gratuit, sans inscription), la démonstration de LOYNA Business avec des données fictives, et la vidéo de 80 secondes.',
      ],
      liens: [LIENS.apercu, LIENS.demo, LIENS.video],
      sources: [S.brief, S.configurateur, S.demo, S.video],
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
        'À l’inscription, vos clients donnent des consentements séparés (fidélité, offres Wallet, SMS), jamais cochés d’avance. Sur demande d’un client, vous exportez ou supprimez ses données.',
        'Le QR code de la carte ne contient aucune donnée personnelle : seulement un jeton opaque, révocable.',
      ],
      sources: [S.faq, S.brief, S.faqCoffre],
    },
    {
      id: 'sms',
      q: 'Les SMS et les notifications, c’est compris ?',
      r: [
        'Les notifications Wallet sont incluses dans toutes les formules, sans coût par message.',
        `Les SMS sont compris dans un volume mensuel : ${sms.growth} avec Growth, ${sms.pro} avec Pro. Essentiel n’inclut pas de SMS.`,
      ],
      sources: [S.faq, S.tarifs],
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
      r: ['Votre carte est prête sous 24 h, hors personnalisation exceptionnelle. Vous affichez ensuite votre QR code et vous scannez vos premiers clients.'],
      sources: [S.faqCoffre, S.faq],
    },
    {
      id: 'paiement',
      q: 'Comment je paie ? Et les factures ?',
      r: [
        'En ligne, par carte bancaire, de façon sécurisée via Stripe, au nom de KOVA Elec, l’entreprise qui édite LOYNA. Les factures sont dans votre espace client.',
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
      q: 'Je pourrai changer de formule ou résilier ?',
      r: ['Oui, depuis votre espace client. En mensuel, une résiliation demandée pendant les 12 premiers mois prend effet à la fin de cette première année ; ensuite, à la fin du mois en cours.'],
      sources: [S.faq],
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
        'Proposez d’envoyer par mail la vidéo de présentation (pièce jointe prévue par la FAQ du coffre), le lien de la démonstration, l’aperçu de sa carte et la page Tarifs.',
        'Fixez ensemble le moment où vous le rappelez, et notez-le dans la fiche.',
      ],
      liens: [LIENS.video, LIENS.demo, LIENS.apercu, LIENS.tarifs],
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
        `« Votre carte est prête sous 24 h, à partir de ${euro(prixMin())} par mois, sans TVA. »`,
      ],
    },
    {
      titre: 'Objections',
      points: ['Réponses courtes dans l’onglet « Questions clients », toutes tirées du site, du brief et de la FAQ du coffre.'],
    },
    {
      titre: 'Conclusion',
      points: [
        'Intéressé : proposer un rendez-vous de 15 minutes, ou, s’il veut commencer, la page Tarifs et le lien de paiement (onglet Tarifs).',
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
