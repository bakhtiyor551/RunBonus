import { registerPlugin } from '@capacitor/core';

/**
 * Native MapKit overlay (iOS only).
 * @typedef {{ x:number, y:number, width:number, height:number, followUser?: boolean, points?: object[] }} MapFrame
 */
const AppleMaps = registerPlugin('AppleMaps', {
  web: () => import('./appleMaps.web.js').then((m) => new m.AppleMapsWeb()),
});

export default AppleMaps;
