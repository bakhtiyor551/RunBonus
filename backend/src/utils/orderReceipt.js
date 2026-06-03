import fs from 'fs';
import path from 'path';
import { UPLOADS_ROOT } from './userProfile.js';

export function saveOrderReceiptFromDataUrl(orderId, dataUrl) {
  const match = String(dataUrl).match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) {
    const err = new Error('Неверный формат чека (JPEG или PNG)');
    err.status = 400;
    throw err;
  }

  const ext = match[1].toLowerCase() === 'png' ? 'png' : match[1].toLowerCase() === 'webp' ? 'webp' : 'jpg';
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) {
    const err = new Error('Чек не больше 4 МБ');
    err.status = 400;
    throw err;
  }

  const dir = path.join(UPLOADS_ROOT, 'order-receipts');
  fs.mkdirSync(dir, { recursive: true });

  const safeId = String(orderId).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `order-${safeId}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buf);
  return `/api/uploads/order-receipts/${filename}`;
}
