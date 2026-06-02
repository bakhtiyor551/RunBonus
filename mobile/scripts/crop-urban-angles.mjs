/**
 * Вырезает ракурсы из макета 360° (hero-360.png).
 * Запуск: node scripts/crop-urban-angles.mjs
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../public/products/urban-sprint');
const src = path.join(root, 'hero-360.png');

const W = 1024;
const H = 768;

/** Центральный крупный ракурс */
const main = { left: 80, top: 95, width: 864, height: 400 };

/** Ряд миниатюр внизу макета */
const thumbY = 500;
const thumbH = 155;
const thumbW = Math.floor(W / 6);
const angles = [
  'left',
  'front',
  'right',
  'back',
  'top',
  'sole',
];

const img = sharp(src);

await img
  .extract(main)
  .toFile(path.join(root, 'view-main.png'));

for (let i = 0; i < angles.length; i++) {
  await sharp(src)
    .extract({
      left: i * thumbW + 4,
      top: thumbY,
      width: thumbW - 8,
      height: thumbH,
    })
    .toFile(path.join(root, `angle-${angles[i]}.png`));
}

console.log('OK: view-main.png +', angles.map((a) => `angle-${a}.png`).join(', '));
