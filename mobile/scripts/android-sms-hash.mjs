/**
 * Хеш Android (11 символов) для автоподстановки SMS-кода.
 * Добавьте в backend/.env: SMS_APP_HASH=<результат>
 *
 * Использование:
 *   node scripts/android-sms-hash.mjs
 *   node scripts/android-sms-hash.mjs --keystore path/to/release.jks --alias mykey --storepass secret
 */
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PACKAGE = 'com.runbonus.app';

function parseArgs(argv) {
  const out = { keystore: '', alias: 'androiddebugkey', storepass: 'android' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--keystore') out.keystore = argv[++i];
    else if (argv[i] === '--alias') out.alias = argv[++i];
    else if (argv[i] === '--storepass') out.storepass = argv[++i];
  }
  if (!out.keystore) {
    const home = os.homedir();
    out.keystore = path.join(home, '.android', 'debug.keystore');
  }
  return out;
}

function certHexFromKeystore(keystore, alias, storepass) {
  if (!fs.existsSync(keystore)) {
    throw new Error(`Keystore не найден: ${keystore}`);
  }
  const tmp = path.join(os.tmpdir(), `runbonus-cert-${Date.now()}.der`);
  try {
    execSync(
      `keytool -exportcert -alias ${alias} -keystore "${keystore}" -storepass ${storepass} -file "${tmp}"`,
      { stdio: 'pipe' }
    );
    const der = fs.readFileSync(tmp);
    return [...der].map((b) => (b & 0xff).toString(16).padStart(2, '0')).join('');
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function computeSmsHash(packageName, signatureHex) {
  const appInfo = `${packageName} ${signatureHex}`;
  const digest = crypto.createHash('sha256').update(appInfo, 'latin1').digest();
  const truncated = digest.subarray(0, 9);
  return truncated.toString('base64').replace(/=+$/, '').substring(0, 11);
}

const args = parseArgs(process.argv);

try {
  const hex = certHexFromKeystore(args.keystore, args.alias, args.storepass);
  const hash = computeSmsHash(PACKAGE, hex);
  console.log('\nRunBonus — SMS app hash (Android)\n');
  console.log(`  Package:  ${PACKAGE}`);
  console.log(`  Keystore: ${args.keystore}`);
  console.log(`  Alias:    ${args.alias}`);
  console.log(`\n  SMS_APP_HASH=${hash}\n`);
  console.log('Добавьте в backend/.env на сервере. Для release-сборки укажите свой keystore:\n');
  console.log(
    '  node scripts/android-sms-hash.mjs --keystore release.jks --alias release --storepass YOUR_PASS\n'
  );
} catch (err) {
  console.error(err.message || err);
  console.error('\nНужен JDK (keytool). Для debug: ~/.android/debug.keystore\n');
  process.exit(1);
}
