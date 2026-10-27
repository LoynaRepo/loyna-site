// Résumé du site pour les moteurs de réponse IA (convention llms.txt).
import {LAUNCH_OFFER, MARKETING_INTERVAL_HOURS, PLANS, SITE, SETUP_FEE, euro, offerActive, quotas} from '../data/site';
import {getArticles, getSectors} from '../lib/builder';

export async function GET() {
  const sectors = await getSectors();
  const articles = await getArticles();
  const contenu = (p: (typeof PLANS)[number]) => [...(p.focus?.items ?? []), ...p.features].join(', ');
  const body = `# LOYNA

> ${SITE.description}

LOYNA (une marque de KOVA Elec) est un logiciel français (Montpellier) de carte de fidélité digitale pour les commerces indépendants : la carte est ajoutée à Apple Wallet ou Google Wallet sans application, le commerçant valide chaque passage en un scan, les récompenses et les notifications Wallet sont automatiques. Avec la notification de proximité, incluse dans toutes les offres, la carte s’affiche sur l’écran de verrouillage du client quand il passe près de la boutique ; LOYNA ne reçoit jamais sa position, c’est le téléphone qui détecte la proximité.

## Offres (prix sans TVA : ${SITE.vatNote})
${PLANS.map((p) => `- ${p.name} : ${euro(p.monthly)} par mois ou ${euro(p.yearly)} par an. ${quotas(p)}. ${p.pitch} ${p.intro ? `${p.intro} ` : ''}${contenu(p)}.`).join('\n')}
- Une notification correspond à un message de campagne reçu par une carte. Les messages automatiques et les notifications de proximité ne sont jamais décomptés. Un client reçoit au plus un message commercial toutes les ${MARKETING_INTERVAL_HOURS} h (délai réglable).
- Paiement mensuel : engagement de 12 mois, réglés chaque mois, puis résiliable à la fin de n’importe quel mois, sans frais. Paiement annuel : 12 mois payés d’avance, −15 %.
- Mise en service : ${euro(SETUP_FEE)} une seule fois en paiement mensuel, ${offerActive() ? `offerte jusqu’au ${LAUNCH_OFFER.untilLabel}, en mensuel comme en annuel (offre de lancement)` : 'offerte en paiement annuel'}.

## Pages principales
- [Fonctionnalités](${SITE.url}/fonctionnalites/)
- [Tarifs](${SITE.url}/tarifs/)
- [Créer ma carte (configurateur)](${SITE.url}/creer-ma-carte/)
- [Démo vidéo](${SITE.url}/demo/)
- [Questions fréquentes](${SITE.url}/faq/)
- [À propos de LOYNA (entreprise, fondateur, contact)](${SITE.url}/a-propos/)
- [Contact](${SITE.url}/contact/)

## Secteurs
${sectors.map((s) => `- [${s.nom}](${SITE.url}/secteurs/${s.slug}/)`).join('\n')}

## Guides
${articles.map((a) => `- [${a.title}](${SITE.url}/blog/${a.slug}/)`).join('\n')}

Contact : ${SITE.email}
`;
  return new Response(body, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
}
