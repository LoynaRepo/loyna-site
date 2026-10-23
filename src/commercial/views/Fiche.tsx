// Fiche détaillée d'un prospect : suivi, contacts, ce qu'il faut dire, historique et sources cliquables.
import type {ComponentChildren} from 'preact';
import {adresseCourte, dateCourte, dateLongue, fr, lienMail, lienSur, lienTel} from '../format';
import {Icon} from '../icons';
import {donnees} from '../store';
import type {Prospect} from '../types';
import {Badge, Btn, Empty, Lien, PageHead, Panel, TexteLie} from '../ui';
import {Action, BadgeCible, BadgeStatut, Recu} from './commun';

export function Fiche({id}: {id: string}) {
  const d = donnees.value!;
  const p = d.prospects.find((x) => x.id === id);
  if (!p)
    return (
      <div class="page">
        <PageHead title="Prospect introuvable" back={{href: '#/prospects', label: 'Prospects'}} />
        <Empty icon="search" title="Cette fiche n’est plus dans les données">
          Elle a peut-être été renommée dans le coffre. Revenez à la liste des prospects.
        </Empty>
      </div>
    );
  const mail = lienMail(p.email);
  const obsidian = d.exemple ? null : `obsidian://open?vault=${encodeURIComponent(d.coffre)}&file=${encodeURIComponent(`01 Prospects/${p.fiche}`)}`;
  const historique = [...p.historique].reverse();

  return (
    <div class="page">
      <PageHead eyebrow={[p.secteur, p.ville].filter(Boolean).join(' · ')} title={p.nom} back={{href: '#/prospects', label: 'Prospects'}}>
        <span class="cp-badges">
          <BadgeStatut statut={p.statut} />
          <BadgeCible p={p} />
          {p.liste_stop && <Badge tone="red">Liste STOP</Badge>}
          {p.score !== null && <Badge tone="gold">score {p.score}</Badge>}
        </span>
      </PageHead>

      <div class="cd-grid cd-grid--b">
        <div class="stack">
          <Panel dark class="cp-entete">
            <p class="eyebrow">Action suivante</p>
            <p class="cp-entete-action">
              {fr(p.action.libelle)}
              {p.action.detail && <small> · {fr(p.action.detail)}</small>}
            </p>
            <div class="btn-row">
              {p.tel_principal && lienTel(p.tel_principal.lien) && (
                <Btn kind="gold" icon="phone" href={lienTel(p.tel_principal.lien)!}>
                  {`Appeler ${p.tel_principal.affiche}`}
                </Btn>
              )}
              {mail && (
                <Btn kind="ghost" icon="mail" href={mail} class="cp-btn-clair">
                  E-mail
                </Btn>
              )}
              {lienSur(p.site) && (
                <Btn kind="ghost" icon="globe" href={p.site} external class="cp-btn-clair">
                  Site
                </Btn>
              )}
              {lienSur(p.instagram) && (
                <Btn kind="ghost" icon="link" href={p.instagram} external class="cp-btn-clair">
                  Instagram
                </Btn>
              )}
              {lienSur(p.facebook) && (
                <Btn kind="ghost" icon="link" href={p.facebook} external class="cp-btn-clair">
                  Facebook
                </Btn>
              )}
              {lienSur(p.linkedin) && (
                <Btn kind="ghost" icon="link" href={p.linkedin} external class="cp-btn-clair">
                  LinkedIn
                </Btn>
              )}
            </div>
          </Panel>

          {p.appel && (
            <Panel title="Au téléphone" sub={`${p.appel.groupe_libelle} · ${p.appel.motif}`}>
              <ADire p={p} />
            </Panel>
          )}

          <Panel title="Suivi">
            <dl class="cp-dl">
              <Ligne t="Mail envoyé">
                {p.envoi.envoye ? `Oui${p.envoi.date ? `, le ${dateLongue(p.envoi.date)}` : ''}` : 'Non'}
                {p.envoi.objet && <small>« {p.envoi.objet} »</small>}
              </Ligne>
              <Ligne t="Reçu côté client">
                <Recu p={p} />
                {p.reception.motif && <small>{fr(p.reception.motif)}</small>}
                {p.reception.etat === 'en attente' && p.reception.date && <small>Considéré comme reçu le {dateLongue(p.reception.date)} s’il n’y a pas de rebond.</small>}
              </Ligne>
              <Ligne t="Réponse">
                {p.reponse.recue ? `Oui${p.reponse.date ? `, le ${dateLongue(p.reponse.date)}` : ''}` : 'Non'}
                {p.reponse.recue && p.reponse.resume && (
                  <small>
                    <TexteLie texte={`« ${p.reponse.resume} »`} />
                  </small>
                )}
              </Ligne>
              {p.reponse.recue ? (
                <Ligne t="Réponse traitée">{p.reponse.traitee ? 'Oui' : <Badge tone="red">à traiter</Badge>}</Ligne>
              ) : (
                <Ligne t="Relance">
                  {p.relance.envoyee
                    ? `Envoyée${p.relance.date ? ` le ${dateLongue(p.relance.date)}` : ''}`
                    : p.envoi.envoye
                      ? `Pas encore${p.relance.prevue ? ` (prévue le ${dateLongue(p.relance.prevue)})` : ''}`
                      : '—'}
                </Ligne>
              )}
              {p.rdv && <Ligne t="Rendez-vous">{p.rdv}</Ligne>}
              {p.file_envoi.length > 0 && (
                <Ligne t="File d’envoi">
                  {p.file_envoi.map((f) => (
                    <small>
                      {f.type === 'initial' ? 'Premier mail' : f.type === 'relance' ? 'Relance' : f.type} : {f.etat}
                      {f.date && ` (${dateCourte(f.date)})`}
                      {f.raison && ` · ${fr(f.raison)}`}
                    </small>
                  ))}
                </Ligne>
              )}
              <Ligne t="Action suivante">
                <Action p={p} />
              </Ligne>
              {p.variante && <Ligne t="Variante du premier mail">{p.variante}</Ligne>}
            </dl>
          </Panel>

          <Panel title="Historique" sub="Les 8 dernières lignes de la fiche, la plus récente en premier.">
            {historique.length ? (
              <ol class="cp-histo">
                {historique.map((h) => (
                  <li>
                    <TexteLie texte={h} />
                  </li>
                ))}
              </ol>
            ) : (
              <p class="muted cp-m0">Aucune ligne d’historique.</p>
            )}
          </Panel>
        </div>

        <div class="stack">
          <Panel title="Contact">
            <dl class="cp-dl">
              <Ligne t="Dirigeant">{p.dirigeant || <span class="muted">non trouvé</span>}</Ligne>
              <Ligne t="Prénom à utiliser">{p.prenom || <span class="muted">inconnu : « Bonjour, »</span>}</Ligne>
              <Ligne t="Téléphone">
                {p.telephones.length ? (
                  p.telephones.map((t) => (
                    <a class="cp-tel" href={lienTel(t.lien) ?? undefined}>
                      <Icon name={t.type === 'mobile' ? 'smartphone' : 'phone'} size={15} />
                      <span>
                        {t.affiche} <small>{t.type}</small>
                      </span>
                    </a>
                  ))
                ) : (
                  <span class="muted">{p.telephone || 'aucun'}</span>
                )}
              </Ligne>
              <Ligne t="E-mail">
                {mail ? <a href={mail}>{p.email}</a> : <span class="muted">{p.email || 'aucun'}</span>}
                {p.email_statut && <small>vérification : {p.email_statut}</small>}
              </Ligne>
              {p.adresse && <Ligne t="Adresse">{p.adresse}</Ligne>}
              {p.siren && (
                <Ligne t="SIREN">
                  <Lien href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${p.siren}`}>{p.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</Lien>
                </Ligne>
              )}
              <Ligne t="Cible">
                {p.cible}
                {p.cible_motif && <small>{fr(p.cible_motif)}</small>}
              </Ligne>
              {p.revu_le && <Ligne t="Revue complète">{dateLongue(p.revu_le)}</Ligne>}
            </dl>
          </Panel>

          <Panel title="Sources" sub={p.source ? fr(p.source) : undefined}>
            {p.sources.length ? (
              <ul class="cp-sources">
                {p.sources.map((s) => (
                  <li>
                    <Lien href={s}>
                      <Icon name="external-link" size={14} />
                      <span>{adresseCourte(s, 60)}</span>
                    </Lien>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="muted cp-m0">Aucune adresse de source dans la fiche.</p>
            )}
            {obsidian && (
              <p class="cp-obsidian">
                <a href={obsidian}>Ouvrir la fiche dans Obsidian</a> <small class="muted">(sur l’ordinateur du coffre)</small>
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Ligne({t, children}: {t: string; children: ComponentChildren}) {
  return (
    <div>
      <dt>{t}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Ce qu'il faut dire (liste « À appeler » et fiche). */
export function ADire({p}: {p: Prospect}) {
  const a = p.appel!;
  return (
    <div class="cp-adire">
      <ul>
        {a.a_dire.map((phrase, i) => (
          <li class={i === 0 ? 'cp-adire-1' : ''}>{fr(phrase)}</li>
        ))}
      </ul>
      {a.dirigeant_registre && <p class="muted small">Dirigeant au registre : {a.dirigeant_registre}</p>}
      <p class="cp-objectif">
        <Icon name="target" size={16} />
        <span>{fr(a.objectif)}</span>
      </p>
    </div>
  );
}
