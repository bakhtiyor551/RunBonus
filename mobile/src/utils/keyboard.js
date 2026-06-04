import { Capacitor } from '@capacitor/core';

const KEYBOARD_FALLBACK_PX = 320;

const isFormField = (el) =>
  el?.matches?.(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable="true"]'
  );

function keyboardInsetPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--rb-keyboard-inset');
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : KEYBOARD_FALLBACK_PX;
}

export function setKeyboardOpen(open, insetPx = 0) {
  document.documentElement.classList.toggle('rb-keyboard-open', open);
  if (!open) {
    document.documentElement.style.setProperty('--rb-keyboard-inset', '0px');
    return;
  }
  const inset = insetPx > 0 ? insetPx : KEYBOARD_FALLBACK_PX;
  document.documentElement.style.setProperty('--rb-keyboard-inset', `${Math.round(inset)}px`);
}

/** Прокрутка поля ввода над клавиатурой (IonContent + fallback). */
export function scrollInputIntoView(e) {
  const el = e?.target;
  if (!el) return;

  const delay = Capacitor.isNativePlatform() ? 420 : 280;

  setTimeout(async () => {
    const ionContent = el.closest('ion-content') || document.querySelector('ion-content');
    const inset = keyboardInsetPx();
    const headerReserve = 64;
    const bottomPad = 24;
    const safeBottom = window.innerHeight - inset - bottomPad;

    if (ionContent?.getScrollElement && ionContent.scrollToPoint) {
      try {
        const scrollEl = await ionContent.getScrollElement();
        const rect = el.getBoundingClientRect();
        let delta = 0;

        if (rect.bottom > safeBottom) {
          delta = rect.bottom - safeBottom + 16;
        } else if (rect.top < headerReserve) {
          delta = rect.top - headerReserve - 8;
        }

        if (delta !== 0) {
          await ionContent.scrollToPoint(0, scrollEl.scrollTop + delta, 280);
        }
        return;
      } catch {
        /* fallback below */
      }
    }

    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, delay);
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
  setKeyboardOpen(true);
  focusInputEnd(e);
  scrollInputIntoView(e);
}

export function initKeyboardInset() {
  const cleanups = [];

  const onFocusIn = (e) => {
    if (isFormField(e.target)) setKeyboardOpen(true);
  };

  const onFocusOut = () => {
    setTimeout(() => {
      if (!isFormField(document.activeElement)) {
        setKeyboardOpen(false);
      }
    }, 150);
  };

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  cleanups.push(() => {
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
  });

  const vv = window.visualViewport;
  if (vv) {
    const onViewportChange = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (inset > 40) {
        setKeyboardOpen(true, inset);
      } else if (!isFormField(document.activeElement)) {
        setKeyboardOpen(false);
      }
    };
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
    cleanups.push(() => {
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
    });
  }

  if (Capacitor.isNativePlatform()) {
    import('@capacitor/keyboard')
      .then(({ Keyboard }) => {
        Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

        const onShow = (info) => {
          setKeyboardOpen(true, info.keyboardHeight);
          const active = document.activeElement;
          if (isFormField(active)) {
            scrollInputIntoView({ target: active });
          }
        };

        Keyboard.addListener('keyboardWillShow', onShow).then((handle) =>
          cleanups.push(() => handle.remove())
        );
        Keyboard.addListener('keyboardDidShow', onShow).then((handle) =>
          cleanups.push(() => handle.remove())
        );
        Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false)).then((handle) =>
          cleanups.push(() => handle.remove())
        );
        Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false)).then((handle) =>
          cleanups.push(() => handle.remove())
        );
      })
      .catch(() => {});
  }

  return () => {
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    setKeyboardOpen(false);
  };
}
