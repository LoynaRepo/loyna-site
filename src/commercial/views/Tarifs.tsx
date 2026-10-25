// Tarifs : formules, mensuel et annuel, mise en service, offre de lancement, quotas, contenu de chaque formule et
// liens de paiement. Prix, quotas et offre importés de src/data/site.ts (source : docs/OFFRES.md du dépôt LOYNA) ;
// formulation validée par Ewan (contenu.ts) : jamais « HT » (TVA non applicable), engagement en clair, un seul message
// sur la mise en service.
import {COMPARISON, LAUNCH_OFFER, MARKETING_INTERVAL_HOURS, PLANS, SETUP_FEE, euro, offerActive, quotas} from '../../data/site';
import {ENGAGEMENT_ANNUEL, ENGAGEMENT_MENSUEL, KOVA, MENTION_PRIX, phraseMiseEnService} from '../contenu';
import {fr} from '../format';
import {Icon} from '../icons';
import {Badge, Btn, Copier, PageHead, Panel} from '../ui';

/** Lien de paiement Stripe, comme sur la page Tarifs du site (code de lancement prérempli en mensuel). */
const lienPaiement = (lien: string, promo = false) => (lien ? `${lien}?locale=fr${promo && offerActive() ? `&prefilled_promo_code=${LAUNCH_OFFER.code}` : ''}` : '');

export function Tarifs() {
  const offre = offerActive();
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
            <p>{fr('Le code est aussi déjà appliqué dans les liens de paiement ci-dessous.')}</p>
          </div>
        </div>
      ) : (
        <div class="banner">
          <Icon name="info" />
          {fr(`L’offre de lancement (code ${LAUNCH_OFFER.code}) est terminée depuis le ${LAUNCH_OFFER.untilLabel}. ${phraseMiseEnService()}`)}
        </div>
      )}

      <div class="cp-plans">
        {PLANS.map((p) => {
          const douzeMois = p.monthly * 12;
          const mensuel = lienPaiement(p.links.monthly, true);
          const annuel = lienPaiement(p.links.yearly);
          return (
            <section class={`pnl cp-plan ${p.highlight ? 'cp-plan--hl' : ''}`} aria-label={`Formule ${p.name}`}>
              <header class="cp-plan-h">
                <h2>{p.name}</h2>
                {p.badge && <Badge tone={p.highlight ? 'dark' : 'gold'}>{p.badge}</Badge>}
              </header>
              <p class="muted cp-m0">{fr(p.pitch)}</p>
              <dl class="cp-prix">
                <div>
                  <dt>Mensuel</dt>
                  <dd>
                    <b>{euro(p.monthly)}</b> {fr('/ mois, sans TVA')}
                    <small>{fr(offre ? `Mise en service offerte jusqu’au ${LAUNCH_OFFER.untilLabel}` : `+ ${euro(SETUP_FEE)} de mise en service, une seule fois`)}</small>
                    <small>{fr(ENGAGEMENT_MENSUEL)}</small>
                  </dd>
                </div>
                <div>
                  <dt>{fr('Annuel (−15 %)')}</dt>
                  <dd>
                    <b>{euro(p.yearly)}</b> {fr('/ an, sans TVA')}
                    <small>{fr(`soit ${euro(Math.round((p.yearly / 12) * 100) / 100)} / mois, au lieu de ${euro(douzeMois)} en mensuel sur 12 mois ; mise en service offerte`)}</small>
                    <small>{fr(ENGAGEMENT_ANNUEL)}</small>
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
                <p class="fld-l">Liens de paiement à envoyer</p>
                {mensuel && (
                  <div class="btn-row cp-lien-row">
                    <Copier texte={mensuel} label="Copier le lien mensuel" />
                    <Btn kind="quiet" small icon="external-link" href={mensuel} external title={`Ouvrir le paiement mensuel ${p.name}`} />
                  </div>
                )}
                {annuel && (
                  <div class="btn-row cp-lien-row">
                    <Copier texte={annuel} label="Copier le lien annuel" />
                    <Btn kind="quiet" small icon="external-link" href={annuel} external title={`Ouvrir le paiement annuel ${p.name}`} />
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Panel title="Ce qui est inclus, formule par formule">
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
                  <td>{fr(l.label)}</td>
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
            `Une notification = un message de campagne reçu par une carte. Les messages automatiques et les notifications de proximité ne sont jamais décomptés ; un client reçoit au plus un message commercial toutes les ${MARKETING_INTERVAL_HOURS} h (réglable).`,
          )}
        </p>
      </Panel>

      <Panel title="Conditions à connaître">
        <ul class="cp-points">
          <li>{fr(phraseMiseEnService())}</li>
          <li>{fr(`Mensuel : ${ENGAGEMENT_MENSUEL.charAt(0).toLowerCase()}${ENGAGEMENT_MENSUEL.slice(1)} Annuel : ${ENGAGEMENT_ANNUEL.charAt(0).toLowerCase()}${ENGAGEMENT_ANNUEL.slice(1)}`)}</li>
          <li>{fr(MENTION_PRIX)}</li>
          <li>{fr('Paiement en ligne par carte bancaire, sécurisé par Stripe, au nom de KOVA Elec (LOYNA, une marque de KOVA Elec) ; factures dans l’espace client.')}</li>
          <li>{fr(`Si on vous demande qui est KOVA Elec : « ${KOVA} »`)}</li>
          <li>{fr('Carte prête sous 24 h, hors personnalisation exceptionnelle. Aucun matériel : un smartphone suffit pour scanner.')}</li>
          <li>{fr('Notification de proximité dans les trois formules : dire « la carte s’affiche », jamais « à chaque passage » (localisation activée et Wallet autorisé sur l’écran verrouillé). LOYNA ne reçoit jamais la position du client.')}</li>
        </ul>
        <p class="muted small cp-m0">Sources : src/data/site.ts (prix, quotas, formules, offre), docs/OFFRES.md du dépôt LOYNA (offres du 25/10/2026), docs/BRIEF.md (engagement), FAQ du site.</p>
      </Panel>
    </div>
  );
}
