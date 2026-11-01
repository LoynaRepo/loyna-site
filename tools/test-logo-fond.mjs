// Fond d'un logo retiré à l'envoi : node tools/test-logo-fond.mjs [logo réel à contrôler] [dossier de sortie]
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {partConfondue, retirerFondUni} from '../src/app/logo-fond.ts';

const brut = async (entree) => {
  const {data, info} = await sharp(entree).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return {px: new Uint8ClampedArray(data), w: info.width, h: info.height};
};
const svg = (corps, w = 400, h = 200) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${corps}</svg>`);
const a = (i, w, x, y) => i.px[(y * w + x) * 4 + 3];

// Logo noir sur blanc, avec un anneau (contrefort) : fond et intérieur partent, le tracé reste
let i = await brut(svg('<rect width="400" height="200" fill="#fff"/><circle cx="200" cy="100" r="30" fill="none" stroke="#000" stroke-width="14"/>'));
assert.equal(retirerFondUni(i.px, i.w, i.h), true);
assert.equal(a(i, i.w, 5, 5), 0, 'fond');
assert.equal(a(i, i.w, 200, 100), 0, 'contrefort');
assert.equal(a(i, i.w, 170, 100), 255, 'tracé');

// Grand rond blanc dans un badge : il fait partie du dessin
i = await brut(svg('<rect width="400" height="400" fill="#fff"/><circle cx="200" cy="200" r="180" fill="#b00"/><circle cx="200" cy="200" r="120" fill="#fff"/>', 400, 400));
assert.equal(retirerFondUni(i.px, i.w, i.h), true);
assert.equal(a(i, i.w, 5, 5), 0);
assert.equal(a(i, i.w, 200, 200), 255, 'forme intérieure gardée');

// Dégradé (photo) : intact
i = await brut(svg('<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/>'));
let avant = Buffer.from(i.px);
assert.equal(retirerFondUni(i.px, i.w, i.h), false);
assert.ok(avant.equals(Buffer.from(i.px)));

// Déjà transparent : intact
i = await brut(svg('<circle cx="200" cy="100" r="50" fill="#000"/>'));
avant = Buffer.from(i.px);
assert.equal(retirerFondUni(i.px, i.w, i.h), false);
assert.ok(avant.equals(Buffer.from(i.px)));

// Image d'une seule couleur : rien à retirer
i = await brut(svg('<rect width="400" height="200" fill="#fff"/>'));
assert.equal(retirerFondUni(i.px, i.w, i.h), false);

// Fond compressé en JPG : retiré quand même
const jpg = await sharp(svg('<rect width="400" height="200" fill="#fdfdfb"/><text x="40" y="130" font-size="90" font-family="Arial" fill="#222">LOGO</text>')).jpeg({quality: 70}).toBuffer();
i = await brut(jpg);
assert.equal(retirerFondUni(i.px, i.w, i.h), true);
assert.equal(a(i, i.w, 5, 5), 0);

// Texte foncé sur carte foncée : signalé
assert.ok(partConfondue(new Uint8ClampedArray([18, 18, 24, 255, 18, 18, 24, 255]), [18, 18, 22]) === 1);
assert.ok(partConfondue(new Uint8ClampedArray([200, 150, 90, 255]), [18, 18, 22]) === 0);

const [reel, sortie] = process.argv.slice(2);
if (reel) {
  i = await brut(reel);
  console.log('logo réel, fond retiré :', retirerFondUni(i.px, i.w, i.h), 'part confondue sur #121216 :', partConfondue(i.px, [18, 18, 22]).toFixed(3));
  const png = sharp(Buffer.from(i.px), {raw: {width: i.w, height: i.h, channels: 4}});
  await png.clone().png().toFile(`${sortie}/transparent.png`);
  for (const [nom, fond] of [['sur-fonce', '#121216'], ['sur-clair', '#f5f1ea']]) await png.clone().flatten({background: fond}).png().toFile(`${sortie}/${nom}.png`);
}
console.log('OK');
