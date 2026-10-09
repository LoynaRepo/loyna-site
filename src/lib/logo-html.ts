// Logo LOYNA (symbole doré + mot) en HTML, pour les composants Preact de l'espace client.
import mark from '../assets/logo-mark.svg?raw';
import word from '../assets/logo-word.svg?raw';

export function logoHtml(id: string, height = 30): string {
  const m = mark.replace('id="g"', `id="${id}"`).replace('url(#g)', `url(#${id})`).replace('<svg', '<svg aria-hidden="true"');
  const w = word.replace('<svg', '<svg role="img" aria-label="LOYNA"');
  return `<span class="app-logo" style="--h:${height}px"><span class="mark">${m}</span><span class="word">${w}</span></span>`;
}
