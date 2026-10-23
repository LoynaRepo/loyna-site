// Carte de fidélité « vivante » (haut de l'accueil, page Fonctionnalités) : met à jour une carte
// WalletCard déjà affichée (couleurs, nom, initiales, récompense, tampons) et envoie l'aperçu au configurateur.

export type CarteDemo = {name: string; activity: string; bg: string; accent: string; total: number; reward: string};

const STOP_WORDS = /^(de|du|des|la|le|les|et|d'|l'|chez|au|aux)$/i;

export function initiales(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w) && !STOP_WORDS.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || 'LO'
  );
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Applique un aperçu à une carte .wcard ; `animer` relance l'apparition et le remplissage des tampons. */
export function appliquerCarte(card: HTMLElement, d: CarteDemo, animer = true): void {
  const filled = Math.max(1, d.total - 3);
  card.style.setProperty('--bg', d.bg);
  card.style.setProperty('--accent', d.accent);
  card.style.setProperty('--fg', luminance(d.bg) > 0.45 ? '#16130e' : '#f8f4ec');
  card.querySelector('.wc-name strong')!.textContent = d.name;
  card.querySelector('.wc-name small')!.textContent = d.activity;
  card.querySelector('.wc-logo')!.textContent = initiales(d.name);
  card.querySelector('.wc-reward span')!.textContent = d.reward;
  const count = card.querySelector('.wc-count b');
  if (count) count.innerHTML = `${filled}<i>/${d.total}</i>`;
  const stamps = card.querySelector<HTMLElement>('.wc-stamps')!;
  stamps.style.setProperty('--n', String(d.total));
  stamps.innerHTML = Array.from({length: d.total}, (_, k) => `<span class="${k < filled ? 'on' : ''}" style="--k:${k}"></span>`).join('');
  if (animer && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    card.classList.remove('swap');
    void card.offsetWidth; // relance l'animation
    card.classList.add('swap');
  }
}

/** Enregistre l'aperçu pour le configurateur puis l'ouvre (le nom passe aussi dans l'adresse). */
export function ouvrirConfigurateur(d: CarteDemo): void {
  try {
    localStorage.setItem(
      'loyna-config',
      JSON.stringify({name: d.name, activity: d.activity, bg: d.bg, accent: d.accent, total: d.total, filled: Math.max(1, d.total - 3), reward: d.reward, variant: 'apple'}),
    );
  } catch {
    /* stockage indisponible : le nom passe dans l'adresse */
  }
  location.href = `/creer-ma-carte/?nom=${encodeURIComponent(d.name)}`;
}

/** Branche les ronds de couleur (composant CardSwatches) : appelle `changer` à chaque choix. */
export function brancherCouleurs(root: HTMLElement, changer: (cible: 'bg' | 'accent', couleur: string) => void): void {
  root.querySelectorAll<HTMLElement>('.swatches[data-target]').forEach((groupe) => {
    const cible = groupe.dataset.target as 'bg' | 'accent';
    const libre = groupe.querySelector<HTMLInputElement>('input[type=color]');
    const boutons = [...groupe.querySelectorAll<HTMLButtonElement>('.sw[data-color]')];
    boutons.forEach((b) =>
      b.addEventListener('click', () => {
        if (libre) libre.value = b.dataset.color!;
        marquerCouleurs(groupe);
        changer(cible, b.dataset.color!);
      }),
    );
    libre?.addEventListener('input', () => {
      marquerCouleurs(groupe);
      changer(cible, libre.value);
    });
  });
}

/** Remet l'état des ronds d'après la valeur du sélecteur libre : rond prédéfini enfoncé s'il correspond,
 *  sinon roue des couleurs marquée (classe is-picked) avec la couleur choisie au centre. */
export function marquerCouleurs(root: ParentNode): void {
  const groupes = root instanceof HTMLElement && root.matches('.swatches') ? [root] : [...root.querySelectorAll<HTMLElement>('.swatches')];
  groupes.forEach((groupe) => {
    const libre = groupe.querySelector<HTMLInputElement>('input[type=color]');
    if (!libre) return;
    const v = libre.value.toLowerCase();
    let predefini = false;
    groupe.querySelectorAll<HTMLElement>('.sw[data-color]').forEach((b) => {
      const on = b.dataset.color!.toLowerCase() === v;
      predefini ||= on;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const rond = libre.closest<HTMLElement>('.sw');
    rond?.classList.toggle('is-picked', !predefini);
    rond?.style.setProperty('--pick', libre.value);
  });
}
