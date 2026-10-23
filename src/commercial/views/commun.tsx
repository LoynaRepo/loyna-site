// Éléments partagés des vues : pastilles de statut, d'étapes et d'action, téléphone cliquable.
import {dateCourte} from '../format';
import {Icon} from '../icons';
import type {Prospect} from '../types';
import {Badge, type Tone} from '../ui';
import {lienTel} from '../format';

const TON_STATUT: Record<string, Tone> = {
  'qualifié': 'blue',
  'à revoir': 'amber',
  'instagram uniquement': 'neutral',
  'contacté': 'neutral',
  'relancé': 'neutral',
  'sans réponse': 'amber',
  'intéressé': 'gold',
  'rdv fixé': 'green',
  'à traiter par ewan': 'red',
  'refus': 'dark',
  'stop': 'red',
  'email invalide': 'red',
  'hors cible': 'neutral',
};
export function BadgeStatut({statut}: {statut: string}) {
  return <Badge tone={TON_STATUT[statut.toLowerCase()] ?? 'neutral'}>{statut || 'sans statut'}</Badge>;
}

export function BadgeCible({p}: {p: Prospect}) {
  if (p.cible === 'oui' || (p.cible === 'non' && p.statut.toLowerCase() === 'hors cible')) return null;
  return (
    <Badge tone={p.cible === 'non' ? 'dark' : 'amber'} title={p.cible_motif || undefined}>
      {p.cible === 'non' ? 'hors cible' : 'cible à revoir'}
    </Badge>
  );
}

const TON_ACTION: Record<string, Tone> = {
  repondre: 'red',
  fixer_rdv: 'gold',
  rdv: 'green',
  rdv_passe: 'amber',
  appeler: 'gold',
  autre_email: 'amber',
  relance_a_envoyer: 'blue',
  relance_en_file: 'blue',
  premier_mail_en_file: 'blue',
  premier_mail: 'blue',
  adresse_a_verifier: 'amber',
};
export function tonAction(code: string): Tone {
  return TON_ACTION[code] ?? 'neutral';
}

/** Codes d'action regroupés par les raccourcis du tableau de bord. */
export const GROUPES_ACTION: Record<string, {libelle: string; codes: string[]}> = {
  relancer: {libelle: 'À relancer (relance due ou en file)', codes: ['relance_a_envoyer', 'relance_en_file']},
  rdv: {libelle: 'RDV (à venir ou passés)', codes: ['rdv', 'rdv_passe']},
  attente: {libelle: 'Mail en file d’envoi', codes: ['premier_mail_en_file', 'relance_en_file']},
};
export function actionCorrespond(code: string, filtre: string): boolean {
  if (!filtre) return true;
  return GROUPES_ACTION[filtre] ? GROUPES_ACTION[filtre].codes.includes(code) : code === filtre;
}

export function Recu({p, court = false}: {p: Prospect; court?: boolean}) {
  const e = p.reception.etat;
  if (e === 'oui') return <Badge tone="green">{court ? 'oui' : 'reçu'}</Badge>;
  if (e === 'en attente') return <Badge tone="amber" title={p.reception.date ? `considéré reçu le ${dateCourte(p.reception.date)} sans rebond` : undefined}>en attente</Badge>;
  if (e === 'non')
    return (
      <Badge tone="red" title={p.reception.motif || undefined}>
        {court ? 'non' : 'non reçu'}
      </Badge>
    );
  return <span class="muted">—</span>;
}

export function Envoye({p}: {p: Prospect}) {
  if (!p.envoi.envoye) return <span class="muted">non</span>;
  return (
    <span class="cp-oui">
      oui{p.envoi.date && <small> {dateCourte(p.envoi.date)}</small>}
    </span>
  );
}

export function Reponse({p}: {p: Prospect}) {
  if (!p.reponse.recue) return <span class="muted">non</span>;
  return (
    <span class="cp-oui" title={p.reponse.resume || undefined}>
      oui{p.reponse.date && <small> {dateCourte(p.reponse.date)}</small>}
    </span>
  );
}

/** « traitée » / « à traiter » si réponse, sinon l'état de la relance. */
export function Suite({p}: {p: Prospect}) {
  if (p.reponse.recue) return p.reponse.traitee ? <Badge tone="green">traitée</Badge> : <Badge tone="red">à traiter</Badge>;
  if (p.relance.envoyee) return <span class="cp-suite">relancé{p.relance.date && <small> {dateCourte(p.relance.date)}</small>}</span>;
  if (p.envoi.envoye)
    return (
      <span class="cp-suite muted">
        {p.relance.prevue ? (
          <>
            relance prévue<small> {dateCourte(p.relance.prevue)}</small>
          </>
        ) : (
          'pas de relance'
        )}
      </span>
    );
  return <span class="muted">—</span>;
}

export function Action({p, detail = true}: {p: Prospect; detail?: boolean}) {
  return (
    <span class="cp-action">
      <Badge tone={tonAction(p.action.code)}>{p.action.libelle}</Badge>
      {detail && p.action.detail && <small>{p.action.detail}</small>}
    </span>
  );
}

/** Lien d'appel (tel:) avec le type de ligne. */
export function Tel({p, gros = false}: {p: Prospect; gros?: boolean}) {
  const t = p.tel_principal;
  const href = t ? lienTel(t.lien) : null;
  if (!t || !href) return <span class="muted">—</span>;
  if (gros)
    return (
      <a class="b b--gold cp-appel" href={href}>
        <Icon name="phone" size={18} />
        <span>
          {t.affiche} <small>{t.type}</small>
        </span>
      </a>
    );
  return (
    <a class="cp-tel" href={href} onClick={(e) => e.stopPropagation()}>
      <Icon name={t.type === 'mobile' ? 'smartphone' : 'phone'} size={15} />
      <span>{t.affiche}</span>
    </a>
  );
}
