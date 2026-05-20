import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export function parseShoeCode(raw) {
  const s = String(raw || '').trim().toUpperCase();
  const match = s.match(/SHOE-[A-Z0-9-]+/);
  return match ? match[0] : s;
}

export default function QrScanner({ onScan, active = true }) {
  const scannerRef = useRef(null);
  const [cameraError, setCameraError] = useState('');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const scanner = new Html5Qrcode('rb-qr-reader');
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
        if (!cancelled) setCameraError(err?.message || 'Не удалось открыть камеру');
      }
    })();
    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [active]);

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    <div style={{ position: 'relative', width: '100%', maxWidth: 320, margin: '0 auto' }}>
      <div id="rb-qr-reader" style={{ width: '100%', minHeight: 240, borderRadius: 16, overflow: 'hidden', background: '#0e0e0e' }} />
      {overlay}
      {cameraError ? <p className="rb-text-error" style={{ marginTop: 12, fontSize: 13, textAlign: 'center' }}>{cameraError}</p> : null}
    </div>
  );
}
