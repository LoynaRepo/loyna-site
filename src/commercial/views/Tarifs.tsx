// Tarifs : les 2 offres, sans engagement et avec 12 mois d'engagement, essai, mise en service, offre de lancement, quotas,
// contenu de chaque offre et liens de paiement de secours. Prix, quotas, offre et phrases fixes importés de src/data/site.ts
// (source : docs/OFFRES.md du dépôt LOYNA) ; formulation validée par Ewan (contenu.ts) : jamais « HT », toujours « sans TVA »,
// un seul message sur la mise en service.
import {COMPARISON, ENGAGEMENT, essaiUrl, LAUNCH_OFFER, MARKETING_INTERVAL_HOURS, offerActive, PHRASES, PLANS, quotas, SETUP_FEE, SITE, TRIAL, euro} from '../../data/site';
import {KOVA, MENTION_PRIX, phraseMiseEnService} from '../contenu';
import {fr} from '../format';
import {Icon} from '../icons';
import {Badge, Btn, Copier, PageHead, Panel} from '../ui';

/** Lien de paiement Stripe, comme sur la page Tarifs du site (code de lancement prérempli sans engagement seulement). */
function lienPaiement(lien: string, promo = false): string {
  if (!lien) return '';
  const u = new URL(lien);
  u.searchParams.set('locale', 'fr');
  if (promo && offerActive()) u.searchParams.set('prefilled_promo_code', LAUNCH_OFFER.code);
  return u.href;
}

export function Tarifs() {
  const offre = offerActive();
  const lienEssai = `${SITE.url}${essaiUrl}`;
  return (
    <div class="page">
      <PageHead eyebrow="Espace commercial" title="Tarifs">
        <Btn kind="ghost" small icon="external-link" href="https://loyna.fr/tarifs/" external>
          Page Tarifs du site
        </Btn>
      </PageHead>

      {offre ? (
        <div class="cp-offre">
          <Icon name="ticket" size={22} />
          <div>
            <strong>Offre de lancement</strong>
            <p>{fr(phraseMiseEnService())}</p>
            <p>{fr(`Le code ${LAUNCH_OFFER.code} est déjà appliqué dans les liens sans engagement ci-dessous.`)}</p>
          </div>
        </div>
      ) : (
        <div class="banner">
          <Icon name="info" />
          {fr(`L’offre de lancement (code ${LAUNCH_OFFER.code}) est terminée depuis le ${LAUNCH_OFFER.untilLabel}. ${phraseMiseEnService()}`)}
        </div>
      )}

      {TRIAL.open && (
        <Panel title="Essai d’un mois">
          <p class="cp-m0">{fr(PHRASES.essai)}</p>
          <p class="muted small cp-essai-note">{fr('Donne Starter, sans aucun service de Pro. Le lien de « Préparer une carte » reprend en plus la carte réglée avec le commerçant.')}</p>
          <div class="btn-row cp-lien-row">
            <Copier texte={lienEssai} label="Copier le lien de l’essai" />
            <Btn kind="quiet" small icon="external-link" href={lienEssai} external title="Ouvrir la page de l’essai" />
          </div>
        </Panel>
      )}

      <div class="cp-plans">
        {PLANS.map((p) => {
          const sans = lienPaiement(p.links.sans, true);
          const engage = lienPaiement(p.links.engage);
          return (
            <section class={`pnl cp-plan ${p.highlight ? 'cp-plan--hl' : ''}`} aria-label={`Offre ${p.name}`}>
              <header class="cp-plan-h">
                <h2>{p.name}</h2>
                {p.badge && <Badge tone={p.highlight ? 'dark' : 'gold'}>{p.badge}</Badge>}
              </header>
              <p class="muted cp-m0">{fr(p.tagline)}</p>
              <dl class="cp-prix">
                <div>
                  <dt>Sans engagement</dt>
                  <dd>
                    <b>{euro(p.monthly)}</b> {fr('/ mois, sans TVA')}
                    <small>{fr(offre ? `Mise en service offerte jusqu’au ${LAUNCH_OFFER.untilLabel}` : `+ ${euro(SETUP_FEE)} de mise en service, une seule fois`)}</small>
                    <small>{fr('Vous arrêtez à la fin de n’importe quel mois.')}</small>
                  </dd>
                </div>
                <div>
                  <dt>{fr(`Avec ${ENGAGEMENT.months} mois d’engagement (−${ENGAGEMENT.discountPercent} %)`)}</dt>
                  <dd>
                    <b>{euro(p.engaged)}</b> {fr('/ mois, sans TVA')}
                    <small>{fr(`Réglé chaque mois, rien d’avance ; mise en service offerte`)}</small>
                    <small>{fr('Après les 12 mois : même prix, résiliable à la fin de n’importe quel mois.')}</small>
                  </dd>
                </div>
              </dl>
              <p class="cp-quota">
                <Icon name="users" size={18} />
                <span>{fr(quotas(p))}</span>
              </p>
              {p.intro && <p class="cp-plan-intro">{p.intro}</p>}
              {p.focus && (
                <div class="cp-focus">
                  <p class="fld-l">{p.focus.title}</p>
                  <ul class="feat-list">
                    {p.focus.items.map((f) => (
                      <li>
                        <Icon name="check" size={18} />
                        <span>{fr(f)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul class="feat-list">
                {p.features.map((f) => (
                  <li>
                    <Icon name="check" size={18} />
                    <span>{fr(f)}</span>
                  </li>
                ))}
              </ul>
              <div class="cp-liens-paiement">
                <p class="fld-l">Liens de paiement de secours</p>
                {sans && (
                  <div class="btn-row cp-lien-row">
                    <Copier texte={sans} label="Copier le lien sans engagement" />
                    <Btn kind="quiet" small icon="external-link" href={sans} external title={`Ouvrir le paiement ${p.name} sans engagement`} />
                  </div>
                )}
                {engage && (
                  <div class="btn-row cp-lien-row">
                    <Copier texte={engage} label="Copier le lien avec engagement" />
                    <Btn kind="quiet" small icon="external-link" href={engage} external title={`Ouvrir le paiement ${p.name} avec engagement`} />
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p class="cp-pourquoi">{fr(PHRASES.pourquoiPro)}</p>
      <p class="muted small cp-m0">{fr('On achète par le panier : pour envoyer une offre, passez par « Préparer une carte ». Ces liens ne servent que si le panier ne répond pas.')}</p>

      <Panel title="Ce qui est inclus, offre par offre">
        <div class="tbl-wrap">
          <table class="tbl cp-comparatif">
            <thead>
              <tr>
                <th>Fonction</th>
                {PLANS.map((p) => (
                  <th class="r">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.flatMap((l) => [
                ...(l.group
                  ? [
                      <tr class="cp-comp-groupe">
                        <th colSpan={PLANS.length + 1}>{l.group}</th>
                      </tr>,
                    ]
                  : []),
                <tr>
                  <td>
                    {fr(l.label)}
                    {l.note && <small class="cp-comp-note">{fr(l.note)}</small>}
                  </td>
                  {l.values.map((v) => (
                    <td class="r">{v === true ? <Icon name="check" size={18} class="cp-ok" /> : v === false ? <span class="muted">—</span> : <strong>{fr(v)}</strong>}</td>
                  ))}
                </tr>,
              ])}
            </tbody>
          </table>
        </div>
        <p class="muted small cp-m0">
          {fr(
            `Une campagne compte pour une, quel que soit le nombre de clients qui la reçoivent ; le compteur repart chaque lundi. Les messages automatiques et les notifications de proximité ne sont jamais décomptés ; un client reçoit au plus un message commercial toutes les ${MARKETING_INTERVAL_HOURS} h (réglable).`,
          )}
        </p>
      </Panel>

      <Panel title="Conditions à connaître">
        <ul class="cp-points">
          <li>{fr(phraseMiseEnService())}</li>
          <li>{fr(PHRASES.engagement)}</li>
          <li>{fr(PHRASES.arret)}</li>
          <li>{fr(MENTION_PRIX)}</li>
          <li>{fr('Paiement en ligne par carte bancaire, sécurisé par Stripe, au nom de KOVA Elec (LOYNA, une marque de KOVA Elec) ; factures dans l’espace client.')}</li>
          <li>{fr(`Si on vous demande qui est KOVA Elec : « ${KOVA} »`)}</li>
          <li>{fr('Carte prête sous 24 h, hors personnalisation exceptionnelle. Aucun matériel : un smartphone suffit pour scanner.')}</li>
          <li>{fr('Notification de proximité dans les deux offres : dire « la carte s’affiche », jamais « à chaque passage » (localisation activée et Wallet autorisé sur l’écran verrouillé). LOYNA ne reçoit jamais la position du client.')}</li>
          <li>{fr('3 adresses en Pro : une seule carte, un seul tableau de bord ; aucune statistique par boutique n’existe.')}</li>
          <li>{fr('Support prioritaire : traité avant les autres, sans délai chiffré ni téléphone.')}</li>
          <li>{fr('Kit Pro : avec engagement, envoyé après le 1er paiement ; sans engagement, après le 3e ; sous 15 jours ensuite. Vidéo, visuels et carte finie à la main : à partir du 1er paiement, jamais pendant l’essai.')}</li>
        </ul>
        <p class="muted small cp-m0">Sources : src/data/site.ts (prix, quotas, offres, phrases fixes), docs/OFFRES.md du dépôt LOYNA (grille Starter + Pro du 31/10/2026), docs/BRIEF.md, FAQ du site.</p>
      </Panel>
    </div>
  );
}
