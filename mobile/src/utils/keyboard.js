import { Capacitor } from '@capacitor/core';

const isFormField = (el) =>
  el?.matches?.(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable="true"]'
  );

function visibleBottom() {
  const vv = window.visualViewport;
  if (vv) return vv.offsetTop + vv.height - 16;
  return window.innerHeight - 16;
}

export function setKeyboardOpen(open) {
  document.documentElement.classList.toggle('rb-keyboard-open', open);
}

/** Прокрутка поля ввода в видимую область (Ionic сам уменьшает экран при resize: ionic). */
export function scrollInputIntoView(e) {
  const el = e?.target;
  if (!el) return;

  const delay = Capacitor.isNativePlatform() ? 360 : 200;

  setTimeout(async () => {
    const ionContent = el.closest('ion-content') || document.querySelector('ion-content');
    const headerReserve = 72;
    const safeBottom = visibleBottom();

    if (ionContent?.getScrollElement && ionContent.scrollToPoint) {
      try {
        const scrollEl = await ionContent.getScrollElement();
        const rect = el.getBoundingClientRect();
        let delta = 0;

        if (rect.bottom > safeBottom) {
          delta = rect.bottom - safeBottom + 12;
        } else if (rect.top < headerReserve) {
          delta = rect.top - headerReserve - 8;
        }

        if (delta !== 0) {
          const next = Math.max(0, scrollEl.scrollTop + delta);
          await ionContent.scrollToPoint(0, next, 250);
        }
        return;
      } catch {
        /* fallback */
      }
    }

    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, delay);
}

export function focusInputEnd(e) {
  const el = e?.target;
  if (!el || el.selectionStart == null) return;
  const len = el.value?.length || 0;
  try {
    el.setSelectionRange(len, len);
  } catch {
    /* ignore */
  }
}

export function onInputFocus(e) {
  setKeyboardOpen(true);
  focusInputEnd(e);
  scrollInputIntoView(e);
}

export function initKeyboardInset() {
  const cleanups = [];
  let scrollTimer = null;

  const scheduleScroll = (target) => {
    if (!target) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => scrollInputIntoView({ target }), 380);
  };

  const onFocusIn = (e) => {
    if (!isFormField(e.target)) return;
    setKeyboardOpen(true);
    scheduleScroll(e.target);
  };

  const onFocusOut = () => {
    setTimeout(() => {
      if (!isFormField(document.activeElement)) {
        setKeyboardOpen(false);
      }
    }, 120);
  };

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  cleanups.push(() => {
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    clearTimeout(scrollTimer);
  });

  if (Capacitor.isNativePlatform()) {
    import('@capacitor/keyboard')
      .then(({ Keyboard }) => {
        Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

        Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true)).then((h) =>
          cleanups.push(() => h.remove())
        );
        Keyboard.addListener('keyboardDidShow', () => {
          setKeyboardOpen(true);
          scheduleScroll(document.activeElement);
        }).then((h) => cleanups.push(() => h.remove()));
        Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false)).then((h) =>
          cleanups.push(() => h.remove())
        );
        Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false)).then((h) =>
          cleanups.push(() => h.remove())
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
