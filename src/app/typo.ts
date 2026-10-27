// Typographie française des écrans Preact (LOYNA Business, pages publiques, panier). Sans dépendance.
/**
 * Typographie française du texte affiché (le site le fait au moment de la construction, astro.config.mjs) :
 * espace insécable avant « : ; ? ! % € », à l'intérieur des guillemets et entre un nombre et « h », « min »
 * ou « j », pour qu'un signe ou une unité ne se retrouve jamais seul en début de ligne. Les écrans Preact (et les textes venus du serveur) sont composés dans le
 * navigateur : seuls les nœuds texte sont retouchés, jamais les champs de saisie.
 */
export function frenchTypography(root: Node = document.body): () => void {
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/;
  const fix = (n: Node) => {
    const v = (n as Text).data;
    if (!v || !/ [:;?!»%€]|« |\d (h|min|j)\b/.test(v) || SKIP.test(n.parentElement?.tagName ?? '')) return;
    const out = v
      .replace(/ ([:;?!»%€])/g, ' $1')
      .replace(/« /g, '« ')
      .replace(/(\d) (h|min|j)(?=$|[\s.,;:!?)])/g, '$1 $2'); // « 10 h », « 30 min », « 30 j » jamais coupés
    if (out !== v) (n as Text).data = out;
  };
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) return fix(n);
    if (n.nodeType !== Node.ELEMENT_NODE || SKIP.test((n as Element).tagName)) return;
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) fix(t);
  };
  walk(root);
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') fix(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  mo.observe(root, {subtree: true, childList: true, characterData: true});
  return () => mo.disconnect();
}
