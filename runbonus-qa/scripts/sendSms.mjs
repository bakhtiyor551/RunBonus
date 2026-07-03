import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const phone = process.env.TEST_USER_PHONE;
const baseUrl = (process.env.BASE_API_URL || 'https://runbonus.online').replace(/\/$/, '');

if (!phone) {
  console.error('Укажите TEST_USER_PHONE в runbonus-qa/.env');
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/auth/sms/send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, purpose: 'login' }),
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(data.error || res.statusText);
  process.exit(1);
}

console.log(`SMS отправлен на ${phone}`);
if (data.dev_code) {
  console.log(`\nДобавьте в runbonus-qa/.env:\nTEST_SMS_CODE=${data.dev_code}`);
} else {
  console.log('\nДобавьте код из SMS в runbonus-qa/.env:\nTEST_SMS_CODE=123456');
}
