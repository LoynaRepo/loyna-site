// Résumé du site pour les moteurs de réponse IA (convention llms.txt).
import {LAUNCH_OFFER, PLANS, SITE, SETUP_FEE, offerActive} from '../data/site';
import {getArticles, getSectors} from '../lib/builder';

export async function GET() {
  const sectors = await getSectors();
  const articles = await getArticles();
  const body = `# LOYNA

> ${SITE.description}

LOYNA est un logiciel français (Montpellier) de carte de fidélité digitale pour les commerces indépendants : la carte est ajoutée à Apple Wallet ou Google Wallet sans application, le commerçant valide chaque passage en un scan, les récompenses et les notifications Wallet sont automatiques.

## Offres (prix par mois, sans TVA : ${SITE.vatNote})
${PLANS.map((p) => `- ${p.name} : ${p.monthly} € par mois ou ${p.yearly.toFixed(2).replace('.', ',')} € par an — ${p.pitch}`).join('\n')}
- Paiement mensuel : engagement de 12 mois, puis résiliable à la fin de n’importe quel mois, sans frais. Paiement annuel : 12 mois payés en une fois, −15 %.
- Mise en service : ${SETUP_FEE} € une seule fois, offerte en paiement annuel${offerActive() ? ` (et en mensuel jusqu’au ${LAUNCH_OFFER.untilLabel}, offre de lancement)` : ''}.

## Pages principales
- [Fonctionnalités](${SITE.url}/fonctionnalites/)
- [Tarifs](${SITE.url}/tarifs/)
- [Créer ma carte (configurateur)](${SITE.url}/creer-ma-carte/)
- [Démo vidéo](${SITE.url}/demo/)
- [Questions fréquentes](${SITE.url}/faq/)
- [Contact](${SITE.url}/contact/)

## Secteurs
${sectors.map((s) => `- [${s.nom}](${SITE.url}/secteurs/${s.slug}/)`).join('\n')}

## Guides
${articles.map((a) => `- [${a.title}](${SITE.url}/blog/${a.slug}/)`).join('\n')}

Contact : ${SITE.email}
`;
  return new Response(body, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
}
