/**
 * Отключает звук в приложении: программный Audio, video/audio в DOM, Web Audio API.
 */
export function disableAppSounds() {
  if (typeof window === 'undefined' || window.__rbSoundsDisabled) return;
  window.__rbSoundsDisabled = true;

  const muteMedia = (el) => {
    try {
      el.muted = true;
      el.volume = 0;
      el.setAttribute('muted', '');
    } catch {
      /* ignore */
    }
  };

  document.querySelectorAll('audio, video').forEach(muteMedia);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
          muteMedia(node);
        } else if (node.querySelectorAll) {
          node.querySelectorAll('audio, video').forEach(muteMedia);
        }
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const NativeAudio = window.Audio;
  if (NativeAudio) {
    window.Audio = function AudioMuted(...args) {
      const audio = new NativeAudio(...args);
      muteMedia(audio);
      const play = audio.play?.bind(audio);
      if (play) {
        audio.play = () => {
          muteMedia(audio);
          return play().catch(() => undefined);
        };
      }
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
  }

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !Ctx.__rbPatched) {
      Ctx.__rbPatched = true;
      const origResume = Ctx.prototype.resume;
      Ctx.prototype.resume = function resumeMuted() {
        return origResume.call(this).then(() => this.suspend());
      };
    }
  } catch {
    /* ignore */
  }
}
