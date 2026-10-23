// Rendu minimal du Markdown des notes du coffre (modèles de mails, consignes) : titres, listes, tableaux,
// citations, gras, italique, code, liens. Tout passe par des éléments Preact : aucun HTML interprété.
import type {ComponentChildren} from 'preact';
import {fr} from '../format';
import {Lien} from '../ui';

// (sans « lookbehind » : les anciens Safari refuseraient tout le module)
const RE_INLINE = /(\*\*[^*]+\*\*|`[^`]+`|!\[\[[^\]]+\]\]|\[\[[^\]]+\]\]|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>"'`)\]]+|\*[^*\s][^*]*\*(?!\w))/g;

export function Inline({texte}: {texte: string}) {
  const out: ComponentChildren[] = [];
  let i = 0;
  const t = texte;
  for (const m of t.matchAll(RE_INLINE)) {
    const s = m[0];
    out.push(fr(t.slice(i, m.index)));
    if (s.startsWith('**')) out.push(<strong>{fr(s.slice(2, -2))}</strong>);
    else if (s.startsWith('`')) out.push(<code>{s.slice(1, -1)}</code>);
    else if (s.startsWith('![[')) out.push(<em class="cp-piece">{s.slice(3, -2).split('|')[0]} (fichier du coffre)</em>);
    else if (s.startsWith('[[')) {
      const [cible, alias] = s.slice(2, -2).split('|');
      out.push(<em>{alias || cible}</em>);
    } else if (s.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\((.+)\)$/.exec(s)!;
      out.push(<Lien href={mm[2]}>{mm[1]}</Lien>);
    } else if (s.startsWith('http')) out.push(<Lien href={s}>{s.replace(/^https?:\/\/(www\.)?/, '')}</Lien>);
    else out.push(<em>{fr(s.slice(1, -1))}</em>);
    i = (m.index ?? 0) + s.length;
  }
  out.push(fr(t.slice(i)));
  return <>{out}</>;
}

function cellules(ligne: string): string[] {
  return ligne.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function Markdown({texte}: {texte: string}) {
  const lignes = (texte || '').replace(/\r/g, '').split('\n');
  const blocs: ComponentChildren[] = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    const titre = /^(#{1,6})\s+(.*)$/.exec(l);
    if (titre) {
      blocs.push(titre[1].length <= 2 ? <h3 class="cp-md-h">{<Inline texte={titre[2]} />}</h3> : <h4 class="cp-md-h">{<Inline texte={titre[2]} />}</h4>);
      i++;
      continue;
    }
    if (l.trim().startsWith('|')) {
      const t: string[] = [];
      while (i < lignes.length && lignes[i].trim().startsWith('|')) t.push(lignes[i++]);
      const rangees = t.map(cellules).filter((c) => !c.every((x) => /^:?-{2,}:?$/.test(x) || !x));
      const [tete, ...corps] = rangees;
      blocs.push(
        <div class="tbl-wrap">
          <table class="tbl tbl--compact cp-md-tbl">
            {tete && (
              <thead>
                <tr>
                  {tete.map((c) => (
                    <th>
                      <Inline texte={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {corps.map((r) => (
                <tr>
                  {r.map((c) => (
                    <td>
                      <Inline texte={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordonnee = /^\s*\d+\./.test(l);
      const items: string[] = [];
      while (i < lignes.length && /^\s*([-*]|\d+\.)\s+/.test(lignes[i])) items.push(lignes[i++].replace(/^\s*([-*]|\d+\.)\s+/, '').replace(/^\[[ x]\]\s*/i, ''));
      const li = items.map((x) => (
        <li>
          <Inline texte={x} />
        </li>
      ));
      blocs.push(ordonnee ? <ol class="cp-md-l">{li}</ol> : <ul class="cp-md-l">{li}</ul>);
      continue;
    }
    if (l.startsWith('>')) {
      const q: string[] = [];
      while (i < lignes.length && lignes[i].startsWith('>')) q.push(lignes[i++].replace(/^>\s?/, ''));
      blocs.push(
        <blockquote class="cp-md-q">
          {q.map((x, k) => (
            <>
              {k > 0 && <br />}
              <Inline texte={x} />
            </>
          ))}
        </blockquote>,
      );
      continue;
    }
    const p: string[] = [];
    while (i < lignes.length && lignes[i].trim() && !/^(#{1,6}\s|\||>|\s*([-*]|\d+\.)\s+)/.test(lignes[i])) p.push(lignes[i++]);
    blocs.push(
      <p class="cp-md-p">
        {p.map((x, k) => (
          <>
            {k > 0 && <br />}
            <Inline texte={x} />
          </>
        ))}
      </p>,
    );
  }
  return <div class="cp-md">{blocs}</div>;
}
