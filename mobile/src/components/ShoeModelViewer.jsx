import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import '@google/model-viewer/dist/model-viewer';

const DEMO_GLB = 'https://modelviewer.dev/shared-assets/models/MaterialsVariantsShoe.glb';
const DEMO_USDZ = 'https://modelviewer.dev/shared-assets/models/MaterialsVariantsShoe.usdz';

function ShoeModelViewerInner(
  { glb, usdz, mode = '3d', autoRotate = false, ar = false, onArSupported },
  ref
) {
  const elRef = useRef(null);
  const [arSupported, setArSupported] = useState(null);
  const src = glb || DEMO_GLB;
  const iosSrc = usdz || DEMO_USDZ;

  useImperativeHandle(ref, () => ({
    async takePhoto() {
      const el = elRef.current;
      if (!el?.toBlob) return null;
      return el.toBlob({ idealAspect: true });
    },
    activateAR() {
      const el = elRef.current;
      if (el?.activateAR) el.activateAR();
    },
    resetCamera() {
      const el = elRef.current;
      if (el?.resetTurntableRotation) el.resetTurntableRotation(0);
      if (el?.jumpCameraToGoal) el.jumpCameraToGoal();
    },
    element: elRef.current,
  }));

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const onArStatus = (e) => {
      const supported = e.detail.status !== 'not-presenting' && e.detail.status !== 'failed';
      if (e.detail.status === 'session-started' || e.detail.status === 'object-placed') {
        setArSupported(true);
        onArSupported?.(true);
      }
      if (e.detail.status === 'failed') {
        setArSupported(false);
        onArSupported?.(false);
      }
    };

    el.addEventListener('ar-status', onArStatus);
    return () => el.removeEventListener('ar-status', onArStatus);
  }, [onArSupported, src]);

  useEffect(() => {
    if (mode === 'ar' && arSupported !== false) {
      const t = setTimeout(() => elRef.current?.activateAR?.(), 400);
      return () => clearTimeout(t);
    }
  }, [mode, src, arSupported]);

  return (
    <model-viewer
      ref={elRef}
      src={src}
      ios-src={iosSrc}
      alt="Urban Sprint RunBonus"
      ar={ar || mode === 'ar'}
      ar-modes="webxr scene-viewer quick-look"
      ar-scale="fixed"
      camera-controls={mode === '3d' || mode === 'photo'}
      auto-rotate={autoRotate}
      rotation-per-second="30deg"
      shadow-intensity="1"
      exposure="1"
      environment-image="neutral"
      interaction-prompt="auto"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 280,
        background: 'transparent',
        '--poster-color': 'transparent',
      }}
      loading="eager"
      reveal="auto"
    />
  );
}

const ShoeModelViewer = forwardRef(ShoeModelViewerInner);
export default ShoeModelViewer;

export function checkArSupport() {
  const el = document.createElement('model-viewer');
  if (typeof el.canActivateAR === 'boolean') return el.canActivateAR;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  return isIOS || isAndroid;
}
