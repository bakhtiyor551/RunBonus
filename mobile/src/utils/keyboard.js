import { Capacitor } from '@capacitor/core';

const isFormField = (el) =>
  el?.matches?.(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable="true"]'
  );

function setKeyboardOpen(open, insetPx = 0) {
  document.documentElement.classList.toggle('rb-keyboard-open', open);
  const inset = open && insetPx > 0 ? `${Math.round(insetPx)}px` : '0px';
  document.documentElement.style.setProperty('--rb-keyboard-inset', inset);
}

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

        Keyboard.addListener('keyboardWillShow', (info) => {
          setKeyboardOpen(true, info.keyboardHeight);
        }).then((handle) => cleanups.push(() => handle.remove()));

        Keyboard.addListener('keyboardDidShow', (info) => {
          setKeyboardOpen(true, info.keyboardHeight);
        }).then((handle) => cleanups.push(() => handle.remove()));

        Keyboard.addListener('keyboardWillHide', () => {
          setKeyboardOpen(false);
        }).then((handle) => cleanups.push(() => handle.remove()));

        Keyboard.addListener('keyboardDidHide', () => {
          setKeyboardOpen(false);
        }).then((handle) => cleanups.push(() => handle.remove()));
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
