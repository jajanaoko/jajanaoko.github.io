// ============================================================
//  ARCANA GLAM — UX utilities  (performance.js)
// ============================================================

import { AppState as st } from './state.js';
import { registerUpdateInspectorHook } from './app.js';

// ── Slider fill track ─────────────────────────────────────────
function _slFill(el) {
  var lo = parseFloat(el.min) || 0;
  var hi = parseFloat(el.max) || 100;
  var v  = parseFloat(el.value) || 0;
  el.style.setProperty('--sl-pct', ((v - lo) / (hi - lo) * 100).toFixed(2) + '%');
}
function _slAttachFill(el) {
  _slFill(el);
  el.addEventListener('input', function() { _slFill(el); });
}

// ── Init ──────────────────────────────────────────────────────
export function initPerfMode() {
  // Initial slider fill pass
  document.querySelectorAll('input[type=range]').forEach(_slAttachFill);
  // Re-run on inspector updates
  registerUpdateInspectorHook(function() {
    requestAnimationFrame(function() {
      document.querySelectorAll('input[type=range]').forEach(function(el) {
        if (!el._fillWired) { _slAttachFill(el); el._fillWired = true; }
        else _slFill(el);
      });
    });
  });
}
