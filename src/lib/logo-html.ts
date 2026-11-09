// Logo LOYNA (nouveau logo du 09/11/2026 : icône 3D nacrée + mot « Loyna » en Poppins ExtraBold) en HTML, pour les
// composants Preact de l'espace client et l'application mobile. Le mot est un masque : il prend la couleur du texte
// (`color` de .app-logo), blanc sur fond sombre, bleu nuit sur fond clair. Images : src/assets/marque/ (tirées de
// LOYNA-Motion/hyperframes/commun/logo/).
import icone from '../assets/marque/icone.png?url';
import mot from '../assets/marque/mot.png?url';

export function logoHtml(_id: string, height = 30): string {
  const masque = `url(${mot}) center / contain no-repeat`;
  return (
    `<span class="app-logo" style="--h:${height}px">` +
    `<img class="mark" src="${icone}" alt="" aria-hidden="true" width="161" height="144" />` +
    `<span class="word" role="img" aria-label="LOYNA" style="-webkit-mask:${masque};mask:${masque}"></span>` +
    `</span>`
  );
}
