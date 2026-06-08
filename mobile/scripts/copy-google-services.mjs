import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public', 'google-services.json');
const dest = path.join(root, 'android', 'app', 'google-services.json');

if (!fs.existsSync(src)) {
  console.warn('[copy-google-services] public/google-services.json not found — skip');
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-google-services] copied to android/app/google-services.json');
