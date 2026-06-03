const HOST_ID = 'rb-toast-host';
let hideTimer = null;

function getHost() {
  let el = document.getElementById(HOST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = HOST_ID;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

/** Короткое уведомление (ошибка формы, пустая корзина и т.д.) */
export function showToast(message, { duration = 2800, color = 'danger' } = {}) {
  if (!message) return Promise.resolve();

  return new Promise((resolve) => {
    const el = getHost();
    if (hideTimer) clearTimeout(hideTimer);

    el.textContent = String(message);
    el.className = `rb-toast-host rb-toast-host--${color}`;
    requestAnimationFrame(() => el.classList.add('rb-toast-host--visible'));

    hideTimer = setTimeout(() => {
      el.classList.remove('rb-toast-host--visible');
      hideTimer = null;
      resolve();
    }, duration);
  });
}
