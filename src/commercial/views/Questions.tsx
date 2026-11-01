// Questions clients : réponses courtes aux questions et objections probables (contenu.ts), FAQ du site
// et FAQ du coffre (réponses que le Trieur reprend dans ses brouillons). Rien d'inventé : chaque réponse cite sa source.
import {useMemo, useState} from 'preact/hooks';
import {objections} from '../contenu';
import {cle, fr, nombre} from '../format';
import {Icon} from '../icons';
import {donnees} from '../store';
import type {FaqSite} from '../types';
import {Badge, Empty, Lien, PageHead, Panel} from '../ui';

export function Questions({faq}: {faq: FaqSite[]}) {
  const d = donnees.value!;
  const [q, setQ] = useState('');
  const mots = cle(q).split(/\s+/).filter(Boolean);
  const ok = (...textes: string[]) => !mots.length || mots.every((m) => cle(textes.join(' ')).includes(m));

  const courtes = useMemo(() => objections(), []);
  const listeCourtes = courtes.filter((o) => ok(o.q, ...o.r, o.attention ?? ''));
  const categories = useMemo(() => [...new Set(faq.map((f) => f.categorie || 'Autres questions'))], [faq]);
  const listeFaq = faq.filter((f) => ok(f.q, f.a, f.categorie ?? ''));
  const coffre = d.ressources.faq_coffre.filter((f) => ok(f.q, f.r));
  const total = listeCourtes.length + listeFaq.length + coffre.length;

  return (
    <div class="page">
      <PageHead eyebrow="Espace commercial" title="Questions clients" />
      <p class="lead-sm">Ce que disent les commerçants, et ce qu’on peut leur répondre : uniquement des faits du site, du brief produit et de la FAQ du coffre.</p>
      <label class="search">
        <Icon name="search" size={18} />
        <span class="sr-only">Chercher une question</span>
        <input type="search" placeholder="Prix, essai, engagement, arrêt, Android, papier…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>

      {!total && (
        <Empty icon="message-circle-question" title="Aucune réponse ne correspond">
          Essayez un autre mot. Si la question est nouvelle, ne répondez rien d’inventé : notez-la et ajoutez la réponse à la FAQ du coffre.
        </Empty>
      )}

      {listeCourtes.length > 0 && (
        <Panel title="Réponses courtes, à dire au téléphone" sub={`${nombre(listeCourtes.length)} questions et objections fréquentes`}>
          <div class="cp-qr">
            {listeCourtes.map((o, i) => (
              <details class="cp-q" open={!!mots.length || i === 0}>
                <summary>
                  <span>{fr(`« ${o.q} »`)}</span>
                  <Icon name="chevron-down" size={18} />
                </summary>
                <div class="cp-r">
                  {o.r.map((p) => (
                    <p>{fr(p)}</p>
                  ))}
                  {o.attention && (
                    <p class="cp-attention">
                      <Icon name="triangle-alert" size={16} />
                      <span>{fr(o.attention)}</span>
                    </p>
                  )}
                  {o.liens && (
                    <p class="cp-liens">
                      {o.liens.map((l) => (
                        <Lien href={l.href}>
                          <Icon name="external-link" size={14} />
                          <span>{l.label}</span>
                        </Lien>
                      ))}
                    </p>
                  )}
                  <p class="cp-source">Source : {o.sources.join(' · ')}</p>
                </div>
              </details>
            ))}
          </div>
        </Panel>
      )}

      {coffre.length > 0 && (
        <Panel title="FAQ du coffre" sub="05 Règles/FAQ Loyna.md : les réponses que l’agent Trieur reprend dans ses brouillons (il n’envoie rien). « — » = à vous de répondre.">
          <div class="cp-qr">
            {coffre.map((f) => (
              <details class="cp-q" open={!!mots.length}>
                <summary>
                  <span>{fr(f.q)}</span>
                  <Icon name="chevron-down" size={18} />
                </summary>
                <div class="cp-r">
                  {f.r ? <p>{fr(f.r)}</p> : <p class="muted">Pas de réponse validée dans la FAQ du coffre : répondez vous-même, sans rien inventer.</p>}
                  {f.pieces.length > 0 && (
                    <p class="cp-source">
                      Pièce jointe prévue : {f.pieces.join(', ')} <Badge>fichier du coffre</Badge>
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Panel>
      )}

      {listeFaq.length > 0 && (
        <Panel title="FAQ du site" sub="Le texte publié sur loyna.fr/faq/, par thème.">
          {categories.map((c) => {
            const l = listeFaq.filter((f) => (f.categorie || 'Autres questions') === c);
            if (!l.length) return null;
            return (
              <div class="cp-faq-cat">
                <h3>{c}</h3>
                <div class="cp-qr">
                  {l.map((f) => (
                    <details class="cp-q" open={!!mots.length}>
                      <summary>
                        <span>{fr(f.q)}</span>
                        <Icon name="chevron-down" size={18} />
                      </summary>
                      <div class="cp-r">
                        <p>{fr(f.a)}</p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
