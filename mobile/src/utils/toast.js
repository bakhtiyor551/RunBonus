import { toastController } from '@ionic/react';

/** Короткое уведомление (ошибка формы, пустая корзина и т.д.) */
export async function showToast(message, { duration = 2800, position = 'top', color = 'danger' } = {}) {
  const cssClass = color === 'success' ? 'rb-toast rb-toast--success' : 'rb-toast';
  if (!message) return;
  const toast = await toastController.create({
    message: String(message),
    duration,
    position,
    color,
    cssClass,
  });
  await toast.present();
}
