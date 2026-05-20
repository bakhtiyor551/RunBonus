import { useEffect, useId, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

export function parseShoeCode(raw) {
  const s = String(raw || '').trim().toUpperCase();
  const match = s.match(/SHOE-[A-Z0-9-]+/);
  return match ? match[0] : s;
}

async function safeStopScanner(scanner) {
  if (!scanner) return;
  try {
    const state = scanner.getState();
    if (
      state === Html5QrcodeScannerState.SCANNING ||
      state === Html5QrcodeScannerState.PAUSED
    ) {
      await scanner.stop();
    }
  } catch {
    /* scanner not started yet */
  }
  try {
    scanner.clear();
  } catch {
    /* ignore */
  }
}

/**
 * @param {boolean} [enableCamera] — по умолчанию только в нативном приложении (APK)
 */
export default function QrScanner({ onScan, active = true, enableCamera }) {
  const reactId = useId().replace(/:/g, '');
  const elementId = `rb-qr-reader-${reactId}`;
  const scannerRef = useRef(null);
  const startingRef = useRef(false);
  const [cameraError, setCameraError] = useState('');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const canUseCamera = enableCamera ?? Capacitor.isNativePlatform();

  useEffect(() => {
    if (!active || !canUseCamera) return undefined;

    let cancelled = false;

    (async () => {
      if (startingRef.current) return;
      startingRef.current = true;
      try {
        const scanner = new Html5Qrcode(elementId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text) => {
            if (cancelled) return;
            const code = parseShoeCode(text);
            if (code) onScanRef.current(code);
          },
          () => {}
        );
        if (!cancelled) setCameraError('');
      } catch (err) {
        if (!cancelled) {
          setCameraError(err?.message || 'Не удалось открыть камеру');
        }
      } finally {
        startingRef.current = false;
        if (cancelled && scannerRef.current) {
          await safeStopScanner(scannerRef.current);
          scannerRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      void safeStopScanner(scanner);
    };
  }, [active, canUseCamera, elementId]);

  if (!canUseCamera) {
    return (
      <p className="rb-text-muted" style={{ textAlign: 'center', fontSize: 13, margin: '12px 0' }}>
        Сканирование камерой доступно в приложении на телефоне. Введите код вручную ниже.
      </p>
    );
  }

  const overlay = (
    <div className="qr-scanner-overlay">
      <div className="scanner-frame" style={{ width: 220, height: 220, margin: 0 }}>
        <div className="scanner-corner scanner-corner--tl" />
        <div className="scanner-corner scanner-corner--tr" />
        <div className="scanner-corner scanner-corner--bl" />
        <div className="scanner-corner scanner-corner--br" />
        <div className="scanning-line" />
      </div>
    </div>
  );

  return (
    <div className="qr-scanner-wrap">
      <div id={elementId} className="qr-scanner-viewport" />
      {active ? overlay : null}
      {cameraError ? (
        <p className="rb-text-error qr-scanner-error">{cameraError}</p>
      ) : null}
    </div>
  );
}
