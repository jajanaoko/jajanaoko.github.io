// ============================================================
//  ARCANA GLAM — Export  (export.js)
//  Frame selector UI, offscreen PNG render pipeline,
//  PNG capture & download.
// ============================================================

import { AppState as st } from './state.js';
import { markDirty, showToast, drawTextureOverlay } from './app.js';
import { drawGlobalLighting, drawTextObj, drawRectObj, drawCard } from './renderer.js';
import { drawBgEffectsAny } from './fx-engine.js';

// ── Frame box visual helpers (shared with drag/resize code below) ─────────────

export function updateVignette() {
  var b = st.exportFrame;
  var top    = document.getElementById('efv-top');
  var bottom = document.getElementById('efv-bottom');
  var left   = document.getElementById('efv-left');
  var right  = document.getElementById('efv-right');
  if (!top) return;
  top.style.cssText    = 'position:absolute;left:0;top:0;right:0;height:'+b.y+'px;background:rgba(0,0,0,0.55);pointer-events:none;';
  bottom.style.cssText = 'position:absolute;left:0;bottom:0;right:0;top:'+(b.y+b.h)+'px;background:rgba(0,0,0,0.55);pointer-events:none;';
  left.style.cssText   = 'position:absolute;left:0;top:'+b.y+'px;width:'+b.x+'px;height:'+b.h+'px;background:rgba(0,0,0,0.55);pointer-events:none;';
  right.style.cssText  = 'position:absolute;left:'+(b.x+b.w)+'px;top:'+b.y+'px;right:0;height:'+b.h+'px;background:rgba(0,0,0,0.55);pointer-events:none;';
}

export function updateFrameBox() {
  var box = document.getElementById('export-frame-box');
  if (!box) return;
  box.style.left   = st.exportFrame.x + 'px';
  box.style.top    = st.exportFrame.y + 'px';
  box.style.width  = st.exportFrame.w + 'px';
  box.style.height = st.exportFrame.h + 'px';
  var lbl = document.getElementById('ef-label');
  if (lbl) lbl.textContent = st.exportFrame.outW + ' × ' + st.exportFrame.outH + '  •  drag to reposition';
  updateVignette();
}

// Snap frame box aspect ratio to outW/outH, centred on canvas
export function snapAspect() {
  var canvasEl = document.getElementById('main-canvas');
  var rect = canvasEl.getBoundingClientRect();
  var aspect = st.exportFrame.outW / st.exportFrame.outH;
  var maxW = rect.width  * 0.80;
  var maxH = rect.height * 0.80;
  var fw = Math.min(maxW, maxH * aspect);
  var fh = fw / aspect;
  if (fh > maxH) { fh = maxH; fw = fh * aspect; }
  st.exportFrame.w = Math.round(fw);
  st.exportFrame.h = Math.round(fh);
  st.exportFrame.x = Math.round(rect.left + (rect.width  - fw) / 2);
  st.exportFrame.y = Math.round(rect.top  + (rect.height - fh) / 2);
  updateFrameBox();
}

// ── Frame selector UI ─────────────────────────────────────────────────────────

var MOBILE_RATIOS = [
  { label: 'Story', w: 1080, h: 1920 },  // Instagram / TikTok Story  9:16
  { label: '1:1',   w: 1080, h: 1080 },
  { label: '4:5',   w: 1080, h: 1350 },
  { label: 'Custom', w: 0, h: 0 },
];
var DESKTOP_RATIOS = [
  { label: 'Story', w: 1080, h: 1920 },  // Instagram / TikTok Story  9:16
  { label: '16:9',  w: 1920, h: 1080 },
  { label: '1:1',   w: 1080, h: 1080 },
  { label: '4:3',   w: 1440, h: 1080 },
  { label: 'Custom', w: 0, h: 0 },
];

// When true, resize handles move freely with no aspect ratio constraint
var _customMode = false;

function setRatio(w, h, custom) {
  _customMode = !!custom;
  if (!custom) {
    st.exportFrame.outW = w;
    st.exportFrame.outH = h;
    snapAspect();
  }
  // Sync active class on ratio buttons
  document.querySelectorAll('.sc-ratio-btn').forEach(function(btn) {
    var isCustomBtn = btn.dataset.custom === '1';
    btn.classList.toggle('active', custom ? isCustomBtn :
      (parseInt(btn.dataset.w) === w && parseInt(btn.dataset.h) === h));
  });
}

export function showFrameSelector() {
  var isMobile = window.innerWidth <= 768;
  var ratios = isMobile ? MOBILE_RATIOS : DESKTOP_RATIOS;

  // Populate ratio buttons
  var container = document.getElementById('sc-frame-ratios');
  if (container) {
    container.innerHTML = '';
    ratios.forEach(function(r, i) {
      var btn = document.createElement('button');
      btn.className = 'sc-ratio-btn' + (i === 0 ? ' active' : '');
      btn.dataset.w = r.w;
      btn.dataset.h = r.h;
      btn.textContent = r.label;
      var isCustom = r.label === 'Custom';
      if (isCustom) btn.dataset.custom = '1';
      btn.addEventListener('click', function() {
        if (isCustom) setRatio(0, 0, true);
        else setRatio(r.w, r.h, false);
      });
      container.appendChild(btn);
    });
  }

  // Always start locked to first ratio
  _customMode = false;
  setRatio(ratios[0].w, ratios[0].h, false);

  // Show overlay + panel
  var overlay = document.getElementById('export-frame-overlay');
  if (overlay) overlay.style.display = 'block';
  document.body.classList.add('sc-framing');
}

export function hideFrameSelector() {
  var overlay = document.getElementById('export-frame-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.classList.remove('sc-framing');
}

// Frame selector cancel / capture wiring
(function() {
  var cancelBtn  = document.getElementById('sc-frame-cancel');
  var captureBtn = document.getElementById('sc-capture-btn');
  if (cancelBtn)  cancelBtn.addEventListener('click', hideFrameSelector);
  if (captureBtn) captureBtn.addEventListener('click', captureFrame);
}());

// ── Frame box drag + resize ───────────────────────────────────────────────────

document.getElementById('export-frame-box').addEventListener('mousedown', function(e) {
  if (!e.target.classList.contains('ef-handle')) {
    st.efDrag = { mode: 'move', startX: e.clientX, startY: e.clientY,
      startFrame: { x: st.exportFrame.x, y: st.exportFrame.y, w: st.exportFrame.w, h: st.exportFrame.h } };
    e.preventDefault(); e.stopPropagation();
  }
});
document.getElementById('export-frame-box').addEventListener('touchstart', function(e) {
  if (!e.target.classList.contains('ef-handle') && e.touches.length === 1) {
    var t = e.touches[0];
    st.efDrag = { mode: 'move', startX: t.clientX, startY: t.clientY,
      startFrame: { x: st.exportFrame.x, y: st.exportFrame.y, w: st.exportFrame.w, h: st.exportFrame.h } };
  }
}, { passive: true });

document.querySelectorAll('.ef-handle').forEach(function(h) {
  h.addEventListener('mousedown', function(e) {
    st.efDrag = { mode: h.dataset.dir, startX: e.clientX, startY: e.clientY,
      startFrame: { x: st.exportFrame.x, y: st.exportFrame.y, w: st.exportFrame.w, h: st.exportFrame.h } };
    e.preventDefault(); e.stopPropagation();
  });
});

function applyDrag(clientX, clientY) {
  if (!st.efDrag) return;
  var dx = clientX - st.efDrag.startX;
  var dy = clientY - st.efDrag.startY;
  var sf = st.efDrag.startFrame;
  var MIN = 60;
  if (st.efDrag.mode === 'move') {
    st.exportFrame.x = sf.x + dx;
    st.exportFrame.y = sf.y + dy;
  } else {
    var nx = sf.x, ny = sf.y, nw = sf.w, nh = sf.h;
    var dir = st.efDrag.mode;
    if (dir.indexOf('e') >= 0) nw = Math.max(MIN, sf.w + dx);
    if (dir.indexOf('s') >= 0) nh = Math.max(MIN, sf.h + dy);
    if (dir.indexOf('w') >= 0) { nw = Math.max(MIN, sf.w - dx); nx = sf.x + sf.w - nw; }
    if (dir.indexOf('n') >= 0) { nh = Math.max(MIN, sf.h - dy); ny = sf.y + sf.h - nh; }

    // Lock aspect ratio unless Custom is selected.
    // Use whichever axis moved more as the driver, then derive the other.
    if (!_customMode && st.exportFrame.outW && st.exportFrame.outH) {
      var aspect = st.exportFrame.outW / st.exportFrame.outH;
      var movedH = dir.indexOf('n') >= 0 || dir.indexOf('s') >= 0;
      var movedW = dir.indexOf('e') >= 0 || dir.indexOf('w') >= 0;
      if (movedW && movedH) {
        // Corner drag — drive from whichever delta is larger
        if (Math.abs(dx) >= Math.abs(dy)) {
          nh = Math.max(MIN, nw / aspect);
        } else {
          nw = Math.max(MIN, nh * aspect);
        }
      } else if (movedW) {
        nh = Math.max(MIN, nw / aspect);
      } else if (movedH) {
        nw = Math.max(MIN, nh * aspect);
      }
      // Re-anchor opposite edges so the box doesn't drift
      if (dir.indexOf('n') >= 0) ny = sf.y + sf.h - nh;
      if (dir.indexOf('w') >= 0) nx = sf.x + sf.w - nw;
    }

    // Update output dimensions to match new screen-pixel aspect in custom mode
    if (_customMode) {
      st.exportFrame.outW = Math.round(nw);
      st.exportFrame.outH = Math.round(nh);
    }

    st.exportFrame.x = nx; st.exportFrame.y = ny;
    st.exportFrame.w = nw; st.exportFrame.h = nh;
  }
  updateFrameBox();
}

window.addEventListener('mousemove', function(e) { applyDrag(e.clientX, e.clientY); });
window.addEventListener('touchmove', function(e) {
  if (st.efDrag && e.touches.length === 1) applyDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
window.addEventListener('mouseup',  function() { st.efDrag = null; });
window.addEventListener('touchend', function() { st.efDrag = null; });

// ── PNG capture pipeline ──────────────────────────────────────────────────────
// Redraws the full scene into an offscreen canvas at the exact output resolution,
// crops to the frame box region, and downloads as PNG.

export function captureFrame() {
  var outW = st.exportFrame.outW;
  var outH = st.exportFrame.outH;
  var t = performance.now();

  var canvasRect = st.canvas.getBoundingClientRect();
  var dpr  = window.devicePixelRatio || 1;
  var liveW = st.canvas.width;
  var liveH = st.canvas.height;
  var CW = st.canvas.clientWidth  || liveW;
  var CH = st.canvas.clientHeight || liveH;

  // ── Step 1: re-render full scene into a temp canvas ──────────────────────
  var tempCanvas = document.createElement('canvas');
  tempCanvas.width  = liveW;
  tempCanvas.height = liveH;
  var tctx = tempCanvas.getContext('2d');

  tctx.save();
  tctx.scale(dpr, dpr);

  // Background
  if (st.bgFx && st.bgFx._gradPreset) {
    var gp = st.bgFx._gradPreset;
    var ang = (gp.angle || 135) * Math.PI / 180;
    var len = Math.sqrt(CW * CW + CH * CH);
    var grad = tctx.createLinearGradient(
      CW/2 - Math.cos(ang)*len/2, CH/2 - Math.sin(ang)*len/2,
      CW/2 + Math.cos(ang)*len/2, CH/2 + Math.sin(ang)*len/2);
    gp.stops.forEach(function(c, i) { grad.addColorStop(i / (gp.stops.length - 1), c); });
    tctx.fillStyle = grad;
  } else {
    tctx.fillStyle = st.bgColor;
  }
  tctx.fillRect(0, 0, CW, CH);
  drawTextureOverlay(tctx, CW, CH);

  var savedCounter = st._bgFrameCounter;
  st._bgFrameCounter = 0;
  drawBgEffectsAny(tctx, CW, CH, t);
  st._bgFrameCounter = savedCounter;

  if (st.bgImage && st.images['__bg__'] && st.images['__bg__'].complete) {
    var biw = st.images['__bg__'].naturalWidth  || 1;
    var bih = st.images['__bg__'].naturalHeight || 1;
    var bisc = Math.max(CW / biw, CH / bih);
    tctx.save();
    tctx.globalAlpha = st.bgOpacity;
    tctx.drawImage(st.images['__bg__'], (CW - biw*bisc)/2, (CH - bih*bisc)/2, biw*bisc, bih*bisc);
    tctx.restore();
  }

  // Camera transform
  tctx.save();
  tctx.translate(CW / 2, CH / 2);
  tctx.scale(st.camZoomRef, st.camZoomRef);
  tctx.translate(st.camOffsetRef.x, st.camOffsetRef.y);
  if (st.camOrbitRef.yaw !== 0 || st.camOrbitRef.pitch !== 0) {
    var yaw   = st.camOrbitRef.yaw   * Math.PI / 180;
    var pitch = st.camOrbitRef.pitch * Math.PI / 180;
    tctx.transform(Math.cos(yaw), -Math.sin(yaw)*0.5, Math.sin(pitch)*0.5, Math.cos(pitch), 0, 0);
  }
  tctx.translate(-CW / 2, -CH / 2);

  var savedCtx = st.ctx;
  st.ctx = tctx;
  var drawOrder = st.cardsRef.slice();
  var anyOrbit = drawOrder.some(function(c) { return c._orbitDepth != null; });
  if (anyOrbit) {
    drawOrder.sort(function(a, b) {
      return (a._orbitDepth != null ? a._orbitDepth : 0.5) - (b._orbitDepth != null ? b._orbitDepth : 0.5);
    });
  }
  for (var i = 0; i < drawOrder.length; i++) {
    var c = drawOrder[i];
    if (c.kind === 'text') drawTextObj(c, true);
    else if (c.kind === 'rect') drawRectObj(c, true);
    else drawCard(c, t, true);
  }
  tctx.restore(); // camera
  st.ctx = savedCtx;

  drawGlobalLighting(tctx, CW, CH);
  tctx.restore(); // dpr scale

  // ── Step 2: crop frame region → output canvas ────────────────────────────
  var fx = (st.exportFrame.x - canvasRect.left) * dpr;
  var fy = (st.exportFrame.y - canvasRect.top)  * dpr;
  var fw = st.exportFrame.w * dpr;
  var fh = st.exportFrame.h * dpr;

  var offscreen = document.createElement('canvas');
  offscreen.width  = outW;
  offscreen.height = outH;
  var octx = offscreen.getContext('2d');

  var sx  = Math.max(0, fx);
  var sy  = Math.max(0, fy);
  var sw  = Math.min(fw, liveW - sx);
  var sh  = Math.min(fh, liveH - sy);
  var ddx = (sx - fx) * (outW / fw);
  var ddy = (sy - fy) * (outH / fh);
  var dw  = sw * (outW / fw);
  var dh  = sh * (outH / fh);
  octx.drawImage(tempCanvas, sx, sy, sw, sh, ddx, ddy, dw, dh);

  // ── Step 3: download ──────────────────────────────────────────────────────
  offscreen.toBlob(function(blob) {
    hideFrameSelector();
    var fname = 'arcana-' + Date.now() + '.png';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fname; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    showToast('✦ PNG saved — ' + outW + ' × ' + outH);
  }, 'image/png');
}
