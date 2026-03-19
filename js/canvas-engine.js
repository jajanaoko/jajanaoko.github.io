// ============================================================
//  ARCANA GLAM — Canvas Engine  (canvas-engine.js)
//  Canvas setup, resize observer, coordinate transforms,
//  panel resizers.
// ============================================================

import { AppState as st } from './state.js';

// Re-export canvas/ctx so other modules can import from here
export function getCanvas() { return st.canvas; }
export function getCtx()    { return st.ctx; }
export function getCanvasWrap() { return st.canvasWrap; }

// ── Coordinate transform ──────────────────────────────────────
export function screenToWorld(sx, sy) {
  var rect = st.canvas.getBoundingClientRect();
  var cssW = rect.width, cssH = rect.height;
  var px = (sx - rect.left) - cssW / 2;
  var py = (sy - rect.top)  - cssH / 2;
  px /= st.camZoomRef; py /= st.camZoomRef;
  px -= st.camOffsetRef.x; py -= st.camOffsetRef.y;
  return { x: px + cssW / 2, y: py + cssH / 2 };
}

// ── ResizeObserver ────────────────────────────────────────────
var ro = new ResizeObserver(function(entries) {
  var e = entries[0];
  var cssW = e.contentRect.width;
  var cssH = e.contentRect.height;
  if (cssW < 10 || cssH < 10) return;
  var dpr = Math.min(window.devicePixelRatio || 1, st.MAX_DPR);
  var newW = Math.round(cssW * dpr);
  var newH = Math.round(cssH * dpr);
  if (newW === st.canvas.width && newH === st.canvas.height) return;
  st._lastGoodCanvasW = cssW;
  st._lastGoodCanvasH = cssH;
  st.canvas.width  = newW;
  st.canvas.height = newH;
  st.canvas.style.width  = cssW + 'px';
  st.canvas.style.height = cssH + 'px';
  st._bgOffW = 0;
  st._bgOffH = 0;
  st.needsRedraw = true;
});
// NOTE: ro.observe(st.canvasWrap) is called from initPanelResizers() once st.canvasWrap is initialized

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    st.needsRedraw = true;
    var cssW = st.canvasWrap.clientWidth;
    var cssH = st.canvasWrap.clientHeight;
    if (cssW > 10 && cssH > 10) {
      var dpr = Math.min(window.devicePixelRatio || 1, st.MAX_DPR);
      st.canvas.width  = Math.round(cssW * dpr);
      st.canvas.height = Math.round(cssH * dpr);
      st.canvas.style.width  = cssW + 'px';
      st.canvas.style.height = cssH + 'px';
      st._bgOffW = 0;
      st._bgOffH = 0;
    }
  }
});

window.addEventListener('pageshow', function(e) {
  if (e.persisted) st.needsRedraw = true;
});

// ── Panel resizers ────────────────────────────────────────────
export function makeVertResizer(handleId, panelId, side) {
  var handle = document.getElementById(handleId);
  var panel = document.getElementById(panelId);
  var active = false;
  var startX = 0, startW = 0;
  handle.addEventListener('mousedown', function(e) {
    active = true; startX = e.clientX; startW = panel.offsetWidth;
    handle.classList.add('active'); e.preventDefault();
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', function(e) {
    if (!active) return;
    var delta = (side === 'right') ? startX - e.clientX : e.clientX - startX;
    var w = Math.max(130, Math.min(420, startW + delta));
    panel.style.flexBasis = w + 'px';
  });
  window.addEventListener('mouseup', function() {
    if (!active) return;
    active = false; handle.classList.remove('active');
    document.body.style.userSelect = '';
  });
}

export function initPanelResizers() {
  // Setup ResizeObserver for canvas now that st.canvasWrap is initialized
  if (st.canvasWrap) {
    ro.observe(st.canvasWrap);
  }
  
  makeVertResizer('left-resize', 'left-panel', 'left');
  makeVertResizer('right-resize', 'right-panel', 'right');

  (function() {
    var handle = document.getElementById('bottom-resize-handle');
    var panel  = document.getElementById('bottom-panel');
    if (!handle || !panel) return;
    handle.style.touchAction = 'none';
    handle.style.cursor      = 'row-resize';
    var active = false, startY = 0, startH = 0;
    function applyH(clientY) {
      var delta = startY - clientY;
      var maxH  = window.innerHeight * 0.72;
      var h = Math.max(80, Math.min(maxH, startH + delta));
      panel.style.flex      = '0 0 ' + h + 'px';
      panel.style.minHeight = '';
      panel.style.maxHeight = '';
      st.needsRedraw = true;
    }
    function startResize(clientY) {
      active = true; startY = clientY;
      startH = panel.getBoundingClientRect().height;
      handle.classList.add('active');
      document.body.style.userSelect  = 'none';
      document.body.style.touchAction = 'none';
    }
    function endResize() {
      if (!active) return;
      active = false; handle.classList.remove('active');
      document.body.style.userSelect  = '';
      document.body.style.touchAction = '';
    }
    handle.addEventListener('pointerdown', function(e) {
      e.preventDefault(); e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      startResize(e.clientY);
    });
    handle.addEventListener('pointermove', function(e) {
      if (!active) return;
      e.preventDefault();
      applyH(e.clientY);
    });
    handle.addEventListener('pointerup',     function() { endResize(); });
    handle.addEventListener('pointercancel', function() { endResize(); });
  })();

  (function() {
    var playbackRow = document.getElementById('playback-row');
    if (playbackRow) playbackRow.classList.add('visible');
    window._syncPlaybackRow = function() {};
  })();
}
