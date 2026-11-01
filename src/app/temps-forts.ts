// Calendrier des temps forts du commerce (toutes les offres, message déjà écrit), calculé dans le navigateur :
// fêtes, saisons, soldes et événements des 60 prochains jours, chacun avec un message prêt à relire.
// « Préparer » crée un brouillon programmé deux jours avant, à 10 h (heure du navigateur).

export interface TempsFort {
  key: string; // identifiant stable : « halloween-2026 »
  label: string; // « Halloween »
  date: Date; // jour J, à minuit (heure locale)
  title: string; // titre de la notification
  message: string; // {prenom} et {commerce} remplacés à l'envoi
  hint?: string; // précision pour le commerçant
}

const DAY = 86400000;
const at = (y: number, m: number, d: number) => new Date(y, m, d); // m : 0 = janvier

/** n-ième jour de la semaine d'un mois (weekday : 0 = dimanche ; n = -1 : le dernier). */
function nth(y: number, m: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = at(y, m, 1);
    return at(y, m, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = at(y, m + 1, 0);
  return at(y, m, last.getDate() - ((last.getDay() - weekday + 7) % 7));
}

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus, Jones et Butcher). */
export function easter(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return at(y, month - 1, day);
}

/** Fête des mères : dernier dimanche de mai, ou premier dimanche de juin si c'est la Pentecôte. */
export function fetesDesMeres(y: number): Date {
  const d = nth(y, 4, 0, -1);
  const pentecote = new Date(easter(y).getTime() + 49 * DAY);
  return d.toDateString() === pentecote.toDateString() ? nth(y, 5, 0, 1) : d;
}

/** Soldes d'hiver : deuxième mercredi de janvier, avancé au premier s'il tombe après le 12. */
export function soldesHiver(y: number): Date {
  const d = nth(y, 0, 3, 2);
  return d.getDate() > 12 ? nth(y, 0, 3, 1) : d;
}

/** Soldes d'été : dernier mercredi de juin, avancé à l'avant-dernier s'il tombe après le 28. */
export function soldesEte(y: number): Date {
  const d = nth(y, 5, 3, -1);
  return d.getDate() > 28 ? at(y, 5, d.getDate() - 7) : d;
}

/** Black Friday : le lendemain du quatrième jeudi de novembre. */
export function blackFriday(y: number): Date {
  const t = nth(y, 10, 4, 4);
  return at(y, 10, t.getDate() + 1);
}

function ofYear(y: number): TempsFort[] {
  const tf = (key: string, label: string, date: Date, title: string, message: string, hint?: string): TempsFort => ({key: `${key}-${y}`, label, date, title, message, hint});
  return [
    tf('nouvel-an', 'Nouvel An', at(y, 0, 1), 'Belle année !', '{prenom}, toute l’équipe de {commerce} vous souhaite de très belles fêtes de fin d’année. À très vite !'),
    tf('epiphanie', 'Épiphanie (galette des rois)', at(y, 0, 6), 'La galette est là', '{prenom}, c’est bientôt l’Épiphanie : la galette des rois vous attend chez {commerce} !', 'Idéal pour une boulangerie ou un café : à adapter à votre commerce.'),
    tf('soldes-hiver', 'Soldes d’hiver', soldesHiver(y), 'C’est les soldes', '{prenom}, les soldes d’hiver commencent : vos bonnes affaires vous attendent chez {commerce}.', 'Seulement si vous participez aux soldes.'),
    tf('chandeleur', 'Chandeleur', at(y, 1, 2), 'C’est la Chandeleur', '{prenom}, c’est bientôt la Chandeleur ! On vous attend chez {commerce} pour fêter ça.'),
    tf('saint-valentin', 'Saint-Valentin', at(y, 1, 14), 'Saint-Valentin', '{prenom}, la Saint-Valentin approche : faites plaisir à ceux que vous aimez chez {commerce}.'),
    tf('grands-meres', 'Fête des grands-mères', nth(y, 2, 0, 1), 'Fête des grands-mères', '{prenom}, dimanche c’est la fête des grands-mères : pensez à elle, nous vous attendons chez {commerce}.'),
    tf('paques', 'Pâques', easter(y), 'Joyeuses Pâques', '{prenom}, Pâques arrive dimanche : passez nous voir chez {commerce} !'),
    tf('fete-des-meres', 'Fête des mères', fetesDesMeres(y), 'Fête des mères', '{prenom}, dimanche c’est la fête des mères : trouvez de quoi la gâter chez {commerce}.'),
    tf('fete-des-peres', 'Fête des pères', nth(y, 5, 0, 3), 'Fête des pères', '{prenom}, dimanche c’est la fête des pères : on vous aide à le gâter chez {commerce}.'),
    tf('fete-musique', 'Fête de la musique', at(y, 5, 21), 'Fête de la musique', '{prenom}, c’est bientôt la fête de la musique : passez nous voir chez {commerce} avant d’aller danser !'),
    tf('soldes-ete', 'Soldes d’été', soldesEte(y), 'C’est les soldes', '{prenom}, les soldes d’été commencent : vos bonnes affaires vous attendent chez {commerce}.', 'Seulement si vous participez aux soldes.'),
    tf('rentree', 'Rentrée', at(y, 8, 1), 'C’est la rentrée', '{prenom}, c’est la rentrée : on vous attend chez {commerce} pour bien commencer l’année !'),
    tf('halloween', 'Halloween', at(y, 9, 31), 'Halloween', '{prenom}, Halloween arrive : venez nous voir chez {commerce}, frissons garantis !'),
    tf('black-friday', 'Black Friday', blackFriday(y), 'Black Friday', '{prenom}, c’est le Black Friday : découvrez nos offres du moment chez {commerce}.', 'À garder si vous proposez une offre ce jour-là.'),
    tf('noel', 'Noël', at(y, 11, 25), 'Joyeux Noël', '{prenom}, Noël approche : trouvez vos cadeaux et vos douceurs de fêtes chez {commerce}.'),
  ];
}

/** Temps forts dont le jour J tombe dans les `days` prochains jours (aujourd'hui compris), du plus proche au plus lointain. */
export function tempsForts(from = new Date(), days = 60): TempsFort[] {
  const start = at(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(start.getTime() + days * DAY);
  return [...ofYear(start.getFullYear()), ...ofYear(start.getFullYear() + 1)]
    .filter((t) => t.date >= start && t.date <= end)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Envoi proposé : deux jours avant le jour J, à 10 h ; null si ce moment est déjà passé (ou presque). */
export function sendAt(t: TempsFort, now = new Date()): Date | null {
  const d = new Date(t.date.getFullYear(), t.date.getMonth(), t.date.getDate() - 2, 10, 0, 0, 0);
  return d.getTime() > now.getTime() + 15 * 60000 ? d : null;
}

/** Nom du brouillon créé pour un temps fort : « Halloween 2026 ». */
export const campaignName = (t: TempsFort) => `${t.label} ${t.date.getFullYear()}`;
