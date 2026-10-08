// Image de partage d'une page : celle générée par tools/og.py si elle existe, sinon l'image par défaut
// (cas d'un article ou d'un secteur ajouté depuis Builder.io sans relancer le script).
import fs from 'node:fs';
import path from 'node:path';

export function ogImage(name: string): string {
  return fs.existsSync(path.join(process.cwd(), 'public', 'og', `${name}.png`)) ? `/og/${name}.png` : '/og/default.png';
}
