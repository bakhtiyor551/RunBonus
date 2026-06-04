/** Прокрутка поля ввода над клавиатурой (iOS / Android WebView). */
export function scrollInputIntoView(e) {
  const el = e?.target;
  if (!el || typeof el.scrollIntoView !== 'function') return;
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 320);
  });
}

/** Курсор в конец — удобнее при повторном фокусе. */
export function focusInputEnd(e) {
  const el = e?.target;
  if (!el || el.selectionStart == null) return;
  const len = el.value?.length || 0;
  try {
    el.setSelectionRange(len, len);
  } catch {
    /* readonly / unsupported */
  }
}

export function onInputFocus(e) {
  focusInputEnd(e);
  scrollInputIntoView(e);
}

export function initKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return () => {};

  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const open = inset > 40;
    document.documentElement.style.setProperty('--rb-keyboard-inset', open ? `${inset}px` : '0px');
    document.documentElement.classList.toggle('rb-keyboard-open', open);
  };

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();

  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    document.documentElement.style.removeProperty('--rb-keyboard-inset');
    document.documentElement.classList.remove('rb-keyboard-open');
  };
}
