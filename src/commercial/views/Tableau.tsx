// Tableau de bord : indicateurs de la prospection, parcours des mails, actions suivantes, statuts.
import {dateCourte, dateHeure, nombre, pluriel, pourcent} from '../format';
import {Icon} from '../icons';
import {aller, donnees, voirProspects, type Filtres} from '../store';
import {Badge, PageHead, Panel} from '../ui';

interface Tuile {
  l: string;
  v: string;
  s?: string;
  aller?: () => void;
  fort?: boolean;
}

export function Tableau() {
  const d = donnees.value!;
  const k = d.totaux;
  const f = k.file_envoi;
  const tuiles: Tuile[] = [
    {l: 'Prospects', v: nombre(k.prospects), s: `${nombre(k.cibles)} dans la cible`, aller: () => voirProspects({})},
    {l: 'Mails envoyés', v: nombre(k.envoyes), s: pluriel(k.relances_envoyees, 'relance envoyée', 'relances envoyées'), aller: () => voirProspects({recu: 'envoye'})},
    {l: 'Mails reçus', v: nombre(k.recus), s: `${nombre(k.en_attente_reception)} en attente · ${pluriel(k.non_recus, 'non reçu', 'non reçus')}`, aller: () => voirProspects({recu: 'oui'})},
    {l: 'Réponses', v: nombre(k.reponses), s: k.reponses_a_traiter ? `${nombre(k.reponses_a_traiter)} à traiter` : 'toutes traitées', aller: () => voirProspects({reponse: 'oui'}), fort: k.reponses_a_traiter > 0},
    {l: 'Taux de réponse', v: pourcent(k.taux_reponse), s: `${pourcent(k.taux_reponse_recus)} des mails reçus`},
    {l: 'RDV', v: nombre(k.rdv), aller: () => voirProspects({action: 'rdv'})},
    {l: 'À appeler', v: nombre(k.a_appeler), s: `dont ${pluriel(k.a_appeler_mobiles, 'mobile', 'mobiles')}`, aller: () => aller('appeler'), fort: k.a_appeler > 0},
    {l: 'À relancer', v: nombre(k.a_relancer), s: `${nombre(k.a_relancer_en_file)} en file d’envoi`, aller: () => voirProspects({action: 'relancer'})},
    {l: 'Mails en attente', v: nombre(f.en_file), s: `${pluriel(f.en_file_premiers, 'premier mail', 'premiers mails')}, ${pluriel(f.en_file_relances, 'relance', 'relances')} · ${nombre(k.premiers_mails_a_ecrire)} à écrire`, aller: () => voirProspects({action: 'attente'})},
  ];
  const etapes = [
    {l: 'Mails envoyés', v: k.envoyes, f: {recu: 'envoye'} as Partial<Filtres>},
    {l: 'Reçus', v: k.recus, f: {recu: 'oui'}},
    {l: 'Réponses', v: k.reponses, f: {reponse: 'oui'}},
    {l: 'RDV', v: k.rdv, f: {action: 'rdv'}},
  ];
  const max = Math.max(1, ...etapes.map((e) => e.v));
  const maxAction = Math.max(1, ...d.par_action.map((a) => a.nombre));
  const maxStatut = Math.max(1, ...d.par_statut.map((a) => a.nombre));

  return (
    <div class="page">
      <PageHead eyebrow="Espace commercial" title="Tableau de bord">
        <span class="ph-count">Données du {dateHeure(d.genere_le)}</span>
      </PageHead>
      {d.exemple && (
        <div class="banner cp-banner">
          <Icon name="info" />
          Données fictives de test (serveur local) : aucun vrai prospect.
        </div>
      )}
      {k.reponses_a_traiter > 0 && (
        <a class="quick-scan cp-alerte" href="#/appeler">
          <span class="qs-i">
            <Icon name="reply" size={24} />
          </span>
          <span>
            <strong>{k.reponses_a_traiter > 1 ? `${nombre(k.reponses_a_traiter)} réponses à traiter` : '1 réponse à traiter'}</strong>
            <small>En tête de la liste « À appeler », avec ce qu’il faut dire.</small>
          </span>
          <Icon name="chevron-right" />
        </a>
      )}

      <div class="kpis cp-kpis">
        {tuiles.map((t) =>
          t.aller ? (
            <button type="button" class={`kpi cp-kpi ${t.fort ? 'cp-kpi--fort' : ''}`} onClick={t.aller}>
              <span class="kpi-l">{t.l}</span>
              <strong class="kpi-v">{t.v}</strong>
              {t.s && <span class="kpi-d">{t.s}</span>}
            </button>
          ) : (
            <div class="kpi cp-kpi">
              <span class="kpi-l">{t.l}</span>
              <strong class="kpi-v">{t.v}</strong>
              {t.s && <span class="kpi-d">{t.s}</span>}
            </div>
          ),
        )}
      </div>

      <div class="dash-grid">
        <div class="stack">
          <Panel title="Parcours des mails" sub={`Reçu = envoyé depuis au moins ${d.regles.delai_recu_jours} jours, sans rebond ni refus.`}>
            <ul class="cp-barres">
              {etapes.map((e) => (
                <li>
                  <button type="button" onClick={() => voirProspects(e.f)} title={`${e.l} : ${nombre(e.v)}`}>
                    <span class="cp-barres-l">{e.l}</span>
                    <span class="cp-barres-t" aria-hidden="true">
                      <span style={{width: `${(e.v / max) * 100}%`}} />
                    </span>
                    <strong>{nombre(e.v)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Actions suivantes" sub="Pour chaque prospect, l’action déduite de sa fiche et du journal des envois.">
            <ul class="cp-barres cp-barres--fin">
              {d.par_action.map((a) => (
                <li>
                  <button type="button" onClick={() => voirProspects({action: a.code})} title={`${a.libelle} : ${nombre(a.nombre)}`}>
                    <span class="cp-barres-l">{a.libelle}</span>
                    <span class="cp-barres-t" aria-hidden="true">
                      <span style={{width: `${(a.nombre / maxAction) * 100}%`}} />
                    </span>
                    <strong>{nombre(a.nombre)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div class="stack">
          <Panel title="Par statut">
            <ul class="cp-barres cp-barres--fin">
              {d.par_statut.map((s) => (
                <li>
                  <button type="button" onClick={() => voirProspects({statut: s.statut})} title={`${s.statut} : ${nombre(s.nombre)}`}>
                    <span class="cp-barres-l">{s.statut}</span>
                    <span class="cp-barres-t" aria-hidden="true">
                      <span style={{width: `${(s.nombre / maxStatut) * 100}%`}} />
                    </span>
                    <strong>{nombre(s.nombre)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="File d’envoi" sub="Mails préparés par les agents, envoyés par loyna_mail.py (jours ouvrés, dans la fenêtre d’envoi).">
            <dl class="totals totals--small">
              <div>
                <dt>Prêts à partir</dt>
                <dd>
                  {nombre(f.en_file)} <small>{f.en_file > 1 ? 'mails' : 'mail'}</small>
                </dd>
              </div>
              <div>
                <dt>Adresse à vérifier</dt>
                <dd>{nombre(f.a_verifier)}</dd>
              </div>
              <div>
                <dt>Refusés</dt>
                <dd>{nombre(f.refuses)}</dd>
              </div>
            </dl>
            <p class="muted small cp-m0">
              {pluriel(f.en_file_premiers, 'premier mail', 'premiers mails')} et {pluriel(f.en_file_relances, 'relance', 'relances')} en file ;{' '}
              {k.premiers_mails_a_ecrire > 1 ? `${nombre(k.premiers_mails_a_ecrire)} prospects qualifiés attendent leur premier mail.` : `${nombre(k.premiers_mails_a_ecrire)} prospect qualifié attend son premier mail.`}
            </p>
          </Panel>
          {d.hors_fiches.length > 0 && (
            <Panel title="Contactés sans fiche" sub="Adresses du journal des envois rattachées à aucune fiche (surtout la campagne Gmail de septembre) : elles ne sont pas suivies ici.">
              <details class="more cp-more">
                <summary>
                  {pluriel(d.hors_fiches.length, 'adresse', 'adresses')} <Badge>journal</Badge>
                </summary>
                <ul class="cp-hors">
                  {d.hors_fiches.map((h) => (
                    <li>
                      <strong>{h.prospect || h.email}</strong>
                      <small>
                        {h.email}
                        {h.premier_mail && ` · 1er mail ${dateCourte(h.premier_mail)}`}
                        {h.relance && ` · relance ${dateCourte(h.relance)}`}
                        {h.echec && ` · ${h.echec}`}
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
            </Panel>
          )}
          <Panel title="D’où viennent ces chiffres ?">
            <p class="muted small cp-m0">
              Calculés par <code>_systeme/suivi.py</code> à partir des fiches de <code>01 Prospects</code>, du journal des envois, des réponses et de la file d’envoi
              du coffre « {d.coffre} », puis publiés chiffrés par <code>panel.py publier</code> à la fin de chaque passage des agents. Pour corriger une ligne, corriger la fiche
              dans Obsidian.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
