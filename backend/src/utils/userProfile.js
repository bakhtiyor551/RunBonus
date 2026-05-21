import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

export function splitFullName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
}

export function buildDisplayName(firstName, lastName) {
  return [firstName, lastName].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
}

export function saveAvatarFromDataUrl(userId, dataUrl) {
  const match = String(dataUrl).match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) {
    const err = new Error('Неверный формат изображения');
    err.status = 400;
    throw err;
  }

  const ext = match[1].toLowerCase() === 'png' ? 'png' : match[1].toLowerCase() === 'webp' ? 'webp' : 'jpg';
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) {
    const err = new Error('Фото не больше 2 МБ');
    err.status = 400;
    throw err;
  }

  const dir = path.join(UPLOADS_ROOT, 'avatars');
  fs.mkdirSync(dir, { recursive: true });

  for (const old of fs.readdirSync(dir)) {
    if (old.startsWith(`user-${userId}.`)) {
      fs.unlinkSync(path.join(dir, old));
    }
  }

  const filename = `user-${userId}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buf);
  return `/uploads/avatars/${filename}`;
}

export function mapUserProfileRow(user) {
  const split = splitFullName(user.name);
  const first_name = user.first_name || split.first_name;
  const last_name = user.last_name || split.last_name;
  const name = buildDisplayName(first_name, last_name) || user.name;

  return {
    id: user.id,
    name,
    first_name,
    last_name,
    phone: user.phone,
    city: user.city,
    status: user.status,
    avatar_url: user.avatar_url || null,
  };
}
