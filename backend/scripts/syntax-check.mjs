import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDir = new Set(['node_modules', 'uploads', 'secrets', 'dist', 'coverage']);

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (skipDir.has(name) || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) acc.push(full);
  }
  return acc;
}

const files = walk(path.join(root, 'src')).concat(walk(path.join(root, 'scripts')));
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed += 1;
    process.stderr.write(r.stderr || r.stdout || `check failed: ${file}\n`);
  }
}

if (failed) {
  console.error(`syntax-check: ${failed} file(s) failed`);
  process.exit(1);
}
console.log(`syntax-check: ${files.length} files ok`);
