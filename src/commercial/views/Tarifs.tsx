// Tarifs : formules, mensuel et annuel, mise en service, offre de lancement, contenu de chaque formule et
// liens de paiement. Tout vient de src/data/site.ts (importé, jamais recopié).
import {COMPARISON, LAUNCH_OFFER, PLANS, SETUP_FEE, SITE, euro, offerActive} from '../../data/site';
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
            <strong>Offre de lancement : mise en service offerte en mensuel</strong>
            <p>
              {fr(`Avec le code ${LAUNCH_OFFER.code}, jusqu’au ${LAUNCH_OFFER.untilLabel} : ${euro(SETUP_FEE)} HT de moins sur la première facture. Le code est déjà appliqué dans les liens de paiement mensuels ci-dessous.`)}
            </p>
          </div>
        </div>
      ) : (
        <div class="banner">
          <Icon name="info" />
          {fr(`L’offre de lancement (code ${LAUNCH_OFFER.code}) est terminée depuis le ${LAUNCH_OFFER.untilLabel}.`)}
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
                    <b>{euro(p.monthly)}</b> HT / mois
                    <small>{fr(offre ? `mise en service ${euro(SETUP_FEE)} HT offerte avec ${LAUNCH_OFFER.code}` : `+ ${euro(SETUP_FEE)} HT de mise en service`)}</small>
                  </dd>
                </div>
                <div>
                  <dt>{fr('Annuel (−15 %)')}</dt>
                  <dd>
                    <b>{euro(p.yearly)}</b> HT / an
                    <small>{fr(`soit ${euro(Math.round((p.yearly / 12) * 100) / 100)} HT / mois, au lieu de ${euro(douzeMois)} en mensuel sur 12 mois ; mise en service offerte`)}</small>
                  </dd>
                </div>
              </dl>
              {p.intro && <p class="cp-plan-intro">{p.intro}</p>}
              <ul class="feat-list">
                {p.features.map((f) => (
                  <li>
                    <Icon name="check" size={18} />
                    <span>{f}</span>
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
              {COMPARISON.map((l) => (
                <tr>
                  <td>{l.label}</td>
                  {l.values.map((v) => (
                    <td class="r">{v === true ? <Icon name="check" size={18} class="cp-ok" /> : v === false ? <span class="muted">—</span> : <strong>{v}</strong>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Conditions à connaître">
        <ul class="cp-points">
          <li>{fr(`Mise en service : ${euro(SETUP_FEE)} HT, facturée une seule fois au démarrage, offerte en paiement annuel.`)}</li>
          <li>{fr('Engagement : 12 mois au départ. En mensuel, 12 mois minimum réglés mois par mois, puis résiliable à la fin de n’importe quel mois, sans frais. En annuel, 12 mois réglés d’avance, reconduit pour 12 mois sauf résiliation avant l’échéance.')}</li>
          <li>{fr(`${SITE.vatNote} : le prix HT affiché est le prix payé.`)}</li>
          <li>{fr('Paiement en ligne par carte bancaire, sécurisé par Stripe, au nom de KOVA ELEC ; factures dans l’espace client.')}</li>
          <li>{fr('Carte prête sous 24 h, hors personnalisation exceptionnelle. Aucun matériel : un smartphone suffit pour scanner.')}</li>
        </ul>
        <p class="muted small cp-m0">Sources : src/data/site.ts (prix, formules, offre), docs/BRIEF.md (engagement), FAQ du site.</p>
      </Panel>
    </div>
  );
}
