// Résumé du site pour les moteurs de réponse IA (convention llms.txt).
import {MARKETING_INTERVAL_HOURS, MISE_EN_SERVICE_APRES, PHRASES, PLANS, SITE, TRIAL, offerActive, quotas} from '../data/site';
import {getArticles, getSectors} from '../lib/builder';

export async function GET() {
  const sectors = await getSectors();
  const articles = await getArticles();
  const contenu = (p: (typeof PLANS)[number]) => [...(p.focus?.items ?? []), ...p.features].join(', ');
  const body = `# LOYNA

> ${SITE.description}

LOYNA (une marque de KOVA Elec) est un logiciel français (Montpellier) de carte de fidélité digitale pour les commerces indépendants : la carte est ajoutée à Apple Wallet ou Google Wallet sans application, le commerçant valide chaque passage en un scan, les récompenses et les notifications Wallet sont automatiques. Avec la notification de proximité, incluse dans toutes les offres, la carte s’affiche sur l’écran de verrouillage du client quand il passe près de la boutique ; LOYNA ne reçoit jamais sa position, c’est le téléphone qui détecte la proximité.

## Offres (prix sans TVA : ${SITE.vatNote})
${PLANS.map((p) => `- ${p.name} : ${PHRASES.prix(p)} ${quotas(p)}. ${p.tagline} ${p.intro ? `${p.intro} ` : ''}${contenu(p)}.`).join('\n')}
- Pourquoi Pro : ${PHRASES.pourquoiPro}
- Campagnes : une campagne (message envoyé à tous les clients ou à un groupe) compte pour une, quel que soit le nombre de destinataires ; le compteur de campagnes repart chaque lundi. Les messages automatiques et les notifications de proximité ne sont jamais décomptés. Un même client reçoit au plus un message commercial par ${MARKETING_INTERVAL_HOURS} h, réglable.
- Engagement : ${PHRASES.engagement}
- Mise en service : ${offerActive() ? PHRASES.miseEnService : MISE_EN_SERVICE_APRES}
${TRIAL.open ? `- Essai : ${PHRASES.essai}\n` : ''}- Arrêt : ${PHRASES.arret}

## Pages principales
- [Fonctionnalités](${SITE.url}/fonctionnalites/)
- [Tarifs](${SITE.url}/tarifs/)
- [Créer ma carte (configurateur)](${SITE.url}/creer-ma-carte/)
- [Démo vidéo](${SITE.url}/demo/)
- [Questions fréquentes](${SITE.url}/faq/)
- [À propos de LOYNA (entreprise, fondateur, contact)](${SITE.url}/a-propos/)
- [Contact](${SITE.url}/contact/)
- [Devenir partenaire (apporteurs d’affaires)](${SITE.url}/devenir-partenaire/)

## Secteurs
${sectors.map((s) => `- [${s.nom}](${SITE.url}/secteurs/${s.slug}/)`).join('\n')}

## Guides
${articles.map((a) => `- [${a.title}](${SITE.url}/blog/${a.slug}/)`).join('\n')}

Contact : ${SITE.email}
`;
  return new Response(body, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
}
