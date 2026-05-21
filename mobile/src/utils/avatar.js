import { API_URL } from '../api';

/** Публичный URL аватара (файлы отдаются через /api/uploads на сервере). */
export function resolveAvatarUrl(avatarUrl, cacheKey) {
  if (!avatarUrl) return null;
  let path = avatarUrl;
  if (/^https?:\/\//i.test(avatarUrl)) {
    path = avatarUrl;
  } else {
    if (path.startsWith('/uploads/')) {
      path = `/api${path}`;
    }
    const base = (API_URL || '').replace(/\/$/, '');
    path = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }
  if (cacheKey) {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}v=${cacheKey}`;
  }
  return path;
}

/** Сжимает фото для загрузки (макс. 512px, JPEG). */
export function compressImageFile(file, maxSize = 512, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Неверный формат изображения'));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
