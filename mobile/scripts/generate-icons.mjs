import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets');
mkdirSync(assetsDir, { recursive: true });

const svg = readFileSync(join(assetsDir, 'icon.svg'));
const iconPng = join(assetsDir, 'icon.png');

await sharp(svg).resize(1024, 1024).png().toFile(iconPng);
console.log('Created', iconPng);
