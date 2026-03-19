// ============================================================
//  ARCANA GLAM — Icon Presets  (icon-presets.js)
//  Defines built-in corner icon presets and loads them into
//  st.images as 'preset:<id>' keys via inline SVG blobs.
// ============================================================

import { AppState as st } from './state.js';

export var ICON_PRESETS = [
  { id: 'flame', label: 'Flame',   color: '#ff7733' },
  { id: 'moon',  label: 'Moon',    color: '#aabbff' },
  { id: 'leaf',  label: 'Nature',  color: '#55cc77' },
  { id: 'void',  label: 'Void',    color: '#9966cc' },
  { id: 'bolt',  label: 'Storm',   color: '#ffee44' },
  { id: 'gem',   label: 'Arcane',  color: '#44ccff' },
  { id: 'star',  label: 'Astral',  color: '#ffffff' },
  { id: 'drop',  label: 'Water',   color: '#4499ff' },
];

var SVG_DATA = {
  flame: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M12 2C10 5.5 8 8 8 12c0 1.5.5 2.5 1.5 2.5-.3-2 .7-3.5 1.5-5 .5 1.5 0 3 .5 4 1-1 1.5-2.5 1.5-4C14.5 11 16 13 16 16a4 4 0 01-8 0C8 11 10 5.5 12 2z"/></svg>',
  moon:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"/></svg>',
  leaf:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M17 8C8 10 5.9 16.17 3.82 19.34L5.71 21l1-1C9 17 12 15 17 15c5 0 7-4 7-4s-2 1-7 1c0-4 4-7 4-7s-1.5-.5-4 1z"/></svg>',
  void:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="white" stroke-width="2.5"/><circle cx="12" cy="12" r="3.5" fill="white"/></svg>',
  bolt:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M13 2L4.5 13.5H11L9.5 22l10.5-13H14z"/></svg>',
  gem:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M6 4h12l4 5-10 11L2 9z"/><path fill="rgba(255,255,255,0.4)" d="M10 4l-4 5h12l-4-5z"/></svg>',
  star:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M12 2l2.4 7.3H22l-6.3 4.6 2.4 7.3L12 17l-6.1 4.2 2.4-7.3L2 9.3h7.6z"/></svg>',
  drop:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M12 2C6 9 4 13 4 17a8 8 0 0016 0c0-4-2-8-8-15z"/></svg>',
};

export function loadIconPresets() {
  ICON_PRESETS.forEach(function(p) {
    var key = 'preset:' + p.id;
    if (st.images[key]) return;
    var svgStr = SVG_DATA[p.id];
    if (!svgStr) return;
    // Use a data URL — never expires, safe to re-read img.src at any time
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    var img = new Image();
    img.src = url;
    st.images[key] = img;
  });
}

// Auto-load on import
loadIconPresets();
