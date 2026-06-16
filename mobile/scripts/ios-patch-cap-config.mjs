import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../ios/App/App/capacitor.config.json');
const LOCAL_PLUGINS = ['WorkoutTrackingPlugin'];

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const list = new Set(config.packageClassList || []);
for (const plugin of LOCAL_PLUGINS) list.add(plugin);
config.packageClassList = [...list];
writeFileSync(configPath, `${JSON.stringify(config, null, '\t')}\n`, 'utf8');
console.log('ios capacitor.config.json: added local plugins', LOCAL_PLUGINS.join(', '));
