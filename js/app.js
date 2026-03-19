// ============================================================
//  ARCANA GLAM — App  (app.js)
//  Main loop, init, bootstrap, autosave, undo/redo,
//  markDirty, haptic, renderFrame, card creation,
//  asset management, background FX controls, layout.
// ============================================================

import { AppState as st, STOCK_CARDS } from './state.js';
import { initPanelResizers, screenToWorld } from './canvas-engine.js';
import { drawCard, drawTextObj, drawRectObj, drawCustomCard, drawResizeHandles,
         drawGlobalLighting,
         refreshSurfacePreview, refreshInspectorAssetGrid, refreshInspectorContent,
         applySurface, updateHoverPhysics } from './renderer.js';
import { drawBgEffects, drawBgEffectsStack,
         drawBgEffectsAny, clearParticlePool, tickAndDrawParticles } from './fx-engine.js';
import { renderLayers, selectCard, deselectAll, getSelectedCards,
         duplicateSelected, cardAtPoint, renderSceneSlots,
         deepClone, snapshotCardEffects } from './layers.js';
import { renderTimeline, setPlayState, calcTotalDuration,
         resetAnimOffsets, updateScrubber, applyAnimations,
         upgradeAllSliders, tickActiveBlocks, refreshStepEditorPanel } from './timeline.js';

function makeSliderRow(label, value, min, max, step, _fmt, onChange) {
  var row = document.createElement('div');
  row.className = 'slider-row';
  var lbl = document.createElement('label'); lbl.textContent = label; row.appendChild(lbl);
  var sl = document.createElement('input');
  sl.type = 'range'; sl.min = min; sl.max = max; sl.step = step; sl.value = value;
  row.appendChild(sl);
  var btnMinus = document.createElement('button'); btnMinus.className = 'pm-btn'; btnMinus.textContent = '−'; row.appendChild(btnMinus);
  var numIn = document.createElement('input');
  numIn.type = 'number'; numIn.className = 'num-input';
  numIn.min = min; numIn.max = max; numIn.step = step;
  var dec = step < 1 ? String(step).split('.')[1].length : 0;
  numIn.value = parseFloat(value).toFixed(dec);
  row.appendChild(numIn);
  var btnPlus = document.createElement('button'); btnPlus.className = 'pm-btn'; btnPlus.textContent = '+'; row.appendChild(btnPlus);
  function clamp(v) { return Math.max(parseFloat(min), Math.min(parseFloat(max), v)); }
  function setVal(v) { v = clamp(parseFloat(v.toFixed(dec))); sl.value = v; numIn.value = v.toFixed(dec); onChange(v); }
  sl.addEventListener('input', function() { setVal(parseFloat(sl.value)); });
  numIn.addEventListener('input', function() { var v = parseFloat(numIn.value); if (!isNaN(v)) setVal(v); });
  numIn.addEventListener('keydown', function(e) { e.stopPropagation(); });
  btnMinus.addEventListener('click', function(e) { e.preventDefault(); setVal(parseFloat(sl.value) - parseFloat(step) * (e.shiftKey ? 10 : 1)); });
  btnPlus.addEventListener('click', function(e) { e.preventDefault(); setVal(parseFloat(sl.value) + parseFloat(step) * (e.shiftKey ? 10 : 1)); });
  return row;
}
import { initInputControls } from './input-controls.js';
import { initPerfMode } from './performance.js';
import { initMobile } from './mobile.js';
import './export.js';
import './showcase.js';


// ─── toast ───────────────────────────────────
export function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  if (st.toastTimer) clearTimeout(st.toastTimer);
  st.toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2200);
}

// ─── createCard/createText/createRect ───────────────────────────────────
export function createCard(frontImgId) {
  var id = 'c' + (st.nextCardId++);
  var cx = st.canvas.clientWidth / 2 + (Math.random() - 0.5) * 80;
  var cy = st.canvas.clientHeight / 2 + (Math.random() - 0.5) * 60;
  var card = {
    id: id,
    label: null,
    x: cx, y: cy,
    rot: (Math.random() - 0.5) * 10,
    scale: 1,
    frontImg: frontImgId || null,
    backImg: st.DEFAULT_BACK_ID,
    showBack: false,
    glare: { on: true, intensity: 1 },
    glow: { on: false, color: '#C9A84C', intensity: 1 },
    _ax: 0, _ay: 0, _ar: 0, _as: 1, _ao: 1,
    _holoPhase: Math.random() * Math.PI * 2
  };
  st.cards.push(card);
  syncRefs();
  updateCardCount();
  hideEmpty();
  renderLayers();
  if (st.timelineOpen) renderTimeline();
  return card;
}

export function createText() {
  var id = 'c' + (st.nextCardId++);
  var cx = st.canvas.clientWidth  / 2 + (Math.random() - 0.5) * 60;
  var cy = st.canvas.clientHeight / 2 + (Math.random() - 0.5) * 40;
  var obj = {
    kind: 'text',
    id: id, label: null,
    x: cx, y: cy, rot: 0,
    width: 200, height: 80,
    content: 'Text',
    font: 'Cinzel, serif',
    fontSize: 24,
    color: '#ffffff',
    align: 'center',
    lineHeight: 1.3,
    opacity: 1,
    locked: false, hidden: false, groupId: null,
    _ax: 0, _ay: 0, _ar: 0, _as: 1, _ao: 1
  };
  st.cards.push(obj);
  syncRefs(); updateCardCount(); hideEmpty(); renderLayers();
  if (st.timelineOpen) renderTimeline();
  return obj;
}

export function createRect() {
  var id = 'c' + (st.nextCardId++);
  var cx = st.canvas.clientWidth  / 2 + (Math.random() - 0.5) * 60;
  var cy = st.canvas.clientHeight / 2 + (Math.random() - 0.5) * 40;
  var obj = {
    kind: 'rect',
    id: id, label: null,
    x: cx, y: cy, rot: 0,
    width: 160, height: 100,
    fillColor: '#1a1a2e',
    fillOpacity: 0.8,
    strokeColor: '#c9a84c',
    strokeWidth: 1,
    strokeOpacity: 1,
    cornerRadius: 0,
    locked: false, hidden: false, groupId: null,
    _ax: 0, _ay: 0, _ar: 0, _as: 1, _ao: 1
  };
  st.cards.push(obj);
  syncRefs(); updateCardCount(); hideEmpty(); renderLayers();
  if (st.timelineOpen) renderTimeline();
  return obj;
}

export function createCustomCard() {
  var id = 'c' + (st.nextCardId++);
  var cx = st.canvas.clientWidth  / 2 + (Math.random() - 0.5) * 60;
  var cy = st.canvas.clientHeight / 2 + (Math.random() - 0.5) * 40;
  var card = {
    kind: 'custom',
    id: id, label: 'Custom Card',
    x: cx, y: cy, rot: 0, scale: 1,
    base:     { color: '#1a1a2e', color2: '#0a0a18', angle: 135 },
    art:      { src: null, fit: 'cover', offsetX: 0, offsetY: 0 },
    headline: { text: 'Card Name', fontSize: 14, color: '#c9a84c', align: 'center', yPct: 0.08, xOff: 0 },
    body:     { text: '', fontSize: 9, color: '#d0c0a0', align: 'center', yPct: 0.62, xOff: 0 },
    icons:    { tl: null, tr: null, bl: null, br: null },
    border:   { presetId: 'arcane_gold', overrides: {} },
    finalized: false,
    glare:  { on: false, intensity: 1 },
    glow:   { on: false, color: '#C9A84C', intensity: 1 },
    shadow: { on: false, color: '#000000', opacity: 0.6, blur: 18, offsetX: 6, offsetY: 10 },
    spell:  { on: false, type: 'ember', density: 1, speed: 1 },
    shimmer: { on: false, intensity: 1 },
    luster:  { on: false, intensity: 1 },
    grain:   { on: false, intensity: 1 },
    ripple:  { on: false, intensity: 1 },
    holo:    { on: false, mode: 'glass', intensity: 1, iridescence: 0.6, speed: 1.0, size: 2.0, refX: 0, refY: 0, refScale: 1.0 },
    hidden: false, locked: false, groupId: null,
    _ax: 0, _ay: 0, _ar: 0, _as: 1, _ao: 1,
    _holoPhase: Math.random() * Math.PI * 2
  };
  st.cards.push(card);
  syncRefs(); updateCardCount(); hideEmpty(); renderLayers();
  if (st.timelineOpen) renderTimeline();
  return card;
}

export function syncRefs() {
  st.cardsRef = st.cards.slice();
  st.selectedRef = st.selectedIds.slice();
}

// ─── updateCardCount/hideEmpty ───────────────────────────────────────────
export function updateCardCount() {
  var n = st.cards.length;
  document.body.classList.toggle('has-cards', n > 0);
  document.getElementById('card-count-badge').textContent = n + ' layer' + (n !== 1 ? 's' : '');
  var nc = st.cards.filter(function(c) { return !c.kind; }).length;
  document.getElementById('scene-card-count').textContent = n + ' layer' + (n !== 1 ? 's' : '') + ' on canvas (' + nc + ' card' + (nc !== 1 ? 's' : '') + ')';
}

export function hideEmpty() {
  document.getElementById('empty-state').style.display = st.cards.length ? 'none' : 'flex';
}

// ============================================================
//  LAYERS PANEL
// ============================================================
// st.layerDrag, st.lastClickedLayerId, st.lastClickedGroupId are in AppState

// ─── autosave ───────────────────────────────────
// st._saveTimer is in AppState

// Keys on st.bgFxStack layers that are runtime-only (particle arrays, GL refs etc.)
// — never serialized, always recreated by the renderer.
// st._RT_KEYS is in AppState

export function _serializeBgFxStack() {
  return st.bgFxStack.map(function(layer) {
    var s = {};
    for (var k in layer) {
      if (!Object.prototype.hasOwnProperty.call(layer, k)) continue;
      if (st._RT_KEYS.indexOf(k) >= 0) continue;          // drop runtime data
      var v = layer[k];
      if (v === null || typeof v !== 'object') { s[k] = v; continue; }
      try { JSON.stringify(v); s[k] = v; } catch(_) {}
    }
    return s;
  });
}

export function _serializeCards() {
  // Drop runtime/DOM refs; keep image dataURLs inline so they survive reload.
  var SKIP = { _animState:1, _orbitDepth:1, _floatBase:1 };
  return st.cards.map(function(c) {
    var s = {};
    for (var k in c) {
      if (!Object.prototype.hasOwnProperty.call(c, k)) continue;
      if (SKIP[k]) continue;
      var v = c[k];
      if (v instanceof HTMLImageElement || v instanceof HTMLCanvasElement) continue;
      try { JSON.stringify(v); s[k] = v; } catch(_) {}
    }
    // Embed image dataURLs directly on the card so we don't need st.images{} to survive
    if (c.frontImg && st.images[c.frontImg] && st.images[c.frontImg].src &&
        st.images[c.frontImg].src.indexOf('data:') === 0) {
      s._frontDataURL = st.images[c.frontImg].src;
    }
    if (c.backImg && c.backImg !== st.DEFAULT_BACK_ID && st.images[c.backImg] &&
        st.images[c.backImg].src && st.images[c.backImg].src.indexOf('data:') === 0) {
      s._backDataURL = st.images[c.backImg].src;
    }
    return s;
  });
}

export function saveProject() {
  try {
    // Only save the st.bgFx fields that differ from defaults — keeps payload tiny
    var bgFxDelta = {};
    for (var k in st.bgFx) {
      if (!Object.prototype.hasOwnProperty.call(st.bgFx, k)) continue;
      if (st.bgFx[k] !== st.BGFX_DEFAULTS[k]) bgFxDelta[k] = st.bgFx[k];
    }

    var state = {
      v: 2,
      cards:      _serializeCards(),
      sequences:  st.sequences,
      bgColor:    st.bgColor,
      bgOpacity:  st.bgOpacity,
      bgFxStack:  _serializeBgFxStack(),
      bgFxDelta:  bgFxDelta,
      globalLight: { on: st.globalLight.on, color: st.globalLight.color,
                     intensity: st.globalLight.intensity, mode: st.globalLight.mode },
      camZoom:    st.camZoom,
      camOffset:  { x: st.camOffset.x, y: st.camOffset.y }
    };

    var json = JSON.stringify(state);

    // Guard: refuse to write if payload > 3 MB (leaves headroom on 5 MB phones)
    if (json.length > 3 * 1024 * 1024) {
      console.warn('[Arcana] Save skipped — payload too large (' +
        Math.round(json.length / 1024) + ' KB). Remove large images to save.');
      _flashSaveIndicator('⚠ too large to save');
      return;
    }

    localStorage.setItem(st.SAVE_KEY, json);
    _flashSaveIndicator('✓ saved');
  } catch(e) {
    // QuotaExceededError or parse failure — fail silently
    console.warn('[Arcana] Save failed:', e);
  }
}

export function _flashSaveIndicator(msg) {
  var ind = document.getElementById('autosave-indicator');
  if (!ind) return;
  ind.textContent = msg;
  ind.style.opacity = '1';
  clearTimeout(ind._t);
  ind._t = setTimeout(function() { ind.style.opacity = '0'; }, 2200);
}

export function loadProject() {
  try {
    var raw = localStorage.getItem(st.SAVE_KEY);
    if (!raw) return false;
    var state = JSON.parse(raw);
    if (!state || state.v !== 2) return false;

    // ── Restore cards & re-inflate images ─────────────────────────────────
    if (Array.isArray(state.cards) && state.cards.length) {
      st.cards = state.cards;
      // Track highest asset ID to avoid collisions on next upload
      var maxId = st.nextAssetId;
      st.cards.forEach(function(c) {
        // Re-inflate front image
        if (c._frontDataURL && c.frontImg) {
          (function(cardRef, key, url) {
            var img = new Image();
            img.onload = function() { st.images[key] = img; st.needsRedraw = true; };
            img.src = url;
            st.images[key] = img;
            // Track numeric suffix so st.nextAssetId stays ahead
            var m = key.match(/^a(\d+)$/);
            if (m) maxId = Math.max(maxId, parseInt(m[1]) + 1);
          }(c, c.frontImg, c._frontDataURL));
          delete c._frontDataURL;
        }
        // Re-inflate back image (skip default back)
        if (c._backDataURL && c.backImg && c.backImg !== st.DEFAULT_BACK_ID) {
          (function(cardRef, key, url) {
            var img = new Image();
            img.onload = function() { st.images[key] = img; st.needsRedraw = true; };
            img.src = url;
            st.images[key] = img;
            var m = key.match(/^a(\d+)$/);
            if (m) maxId = Math.max(maxId, parseInt(m[1]) + 1);
          }(c, c.backImg, c._backDataURL));
          delete c._backDataURL;
        }
      });
      st.nextAssetId = maxId;
    }

    // ── Restore other state ────────────────────────────────────────────────
    if (state.sequences)  st.sequences  = state.sequences;
    if (state.bgColor)    st.bgColor    = state.bgColor;
    if (typeof state.bgOpacity === 'number') st.bgOpacity = state.bgOpacity;

    if (Array.isArray(state.bgFxStack)) {
      // Re-attach clean _rt objects so the renderer initialises correctly
      st.bgFxStack = state.bgFxStack.map(function(layer) {
        layer._rt = {};  // renderer will populate on first draw
        return layer;
      });
    }

    if (state.bgFxDelta) {
      for (var k in state.bgFxDelta) {
        if (Object.prototype.hasOwnProperty.call(state.bgFxDelta, k)) {
          st.bgFx[k] = state.bgFxDelta[k];
        }
      }
    }

    if (state.globalLight) Object.assign(st.globalLight, state.globalLight);
    if (typeof state.camZoom === 'number') st.camZoom = state.camZoom;
    if (state.camOffset) { st.camOffset.x = state.camOffset.x; st.camOffset.y = state.camOffset.y; }

    return true;
  } catch(e) {
    console.warn('[Arcana] Load failed:', e);
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(st.SAVE_KEY);
    localStorage.removeItem('arcana_glam_v1'); // clean up old key
  } catch(_) {}
}

// One-time migration: remove any stale v1 save that could waste space
(function() {
  try { localStorage.removeItem('arcana_glam_v1'); } catch(_) {}
})();

export function _scheduleSave() {
  if (st._saveTimer) clearTimeout(st._saveTimer);
  st._saveTimer = setTimeout(saveProject, 1500);
}

// ============================================================
//  UNDO / REDO  (20-step command stack)
// ============================================================
// st._undoStack is in AppState
// st._redoStack is in AppState

// ─── undo/redo/markDirty/haptic ───────────────────────────────────
// st._redoStack is in AppState
// st._undoPaused is in AppState
// st.MAX_UNDO is in AppState

export function _captureState() {
  if (st._undoPaused) return;
  try {
    var snap = {
      cards:     JSON.parse(JSON.stringify(_serializeCards())),
      sequences: JSON.parse(JSON.stringify(st.sequences))
    };
    st._undoStack.push(snap);
    if (st._undoStack.length > st.MAX_UNDO) st._undoStack.shift();
    st._redoStack = [];           // new action invalidates redo history
    _syncUndoButtons();
  } catch(e) {}
}

export function _applyUndoSnap(snap) {
  st._undoPaused = true;
  try {
    st.cards = snap.cards.map(function(c) { return Object.assign({}, c); });
    // Re-inflate any embedded image dataURLs
    st.cards.forEach(function(c) {
      if (c._frontDataURL && c.frontImg) {
        var img = new Image();
        img.onload = function() { st.images[c.frontImg] = img; st.needsRedraw = true; };
        img.src = c._frontDataURL;
        st.images[c.frontImg] = img;
        delete c._frontDataURL;
      }
      if (c._backDataURL && c.backImg && c.backImg !== st.DEFAULT_BACK_ID) {
        var img2 = new Image();
        img2.onload = function() { st.images[c.backImg] = img2; st.needsRedraw = true; };
        img2.src = c._backDataURL;
        st.images[c.backImg] = img2;
        delete c._backDataURL;
      }
    });
    st.sequences = JSON.parse(JSON.stringify(snap.sequences));
    syncRefs(); updateCardCount(); hideEmpty(); updateInspector(); renderLayers();
    if (typeof renderTimeline === 'function') renderTimeline();
    st.needsRedraw = true;
    _scheduleSave();
  } catch(e) {}
  st._undoPaused = false;
}

export function doUndo() {
  if (st._undoStack.length < 2) { showToast('Nothing to undo'); return; }
  var current = st._undoStack.pop();
  st._redoStack.push(current);
  _applyUndoSnap(st._undoStack[st._undoStack.length - 1]);
  _syncUndoButtons();
  showToast('↩ Undo');
}

export function doRedo() {
  if (!st._redoStack.length) { showToast('Nothing to redo'); return; }
  var next = st._redoStack.pop();
  st._undoStack.push(next);
  _applyUndoSnap(next);
  _syncUndoButtons();
  showToast('↪ Redo');
}

export function _syncUndoButtons() {
  var u = document.getElementById('btn-undo');
  var r = document.getElementById('btn-redo');
  if (u) u.style.opacity = st._undoStack.length > 1 ? '1' : '0.35';
  if (r) r.style.opacity = st._redoStack.length     ? '1' : '0.35';
}

export function markDirty() {
  st.needsRedraw = true;
  _captureState();
  _scheduleSave();
}

// ── focusCamera — animated pan+zoom to fit one or more cards ──────────────
var _camAnimId = null;
export function focusCamera(cardOrCards) {
  var cw = st.canvas.clientWidth  || 400;
  var ch = st.canvas.clientHeight || 600;
  var targets = Array.isArray(cardOrCards) ? cardOrCards : [cardOrCards];
  targets = targets.filter(function(c) { return c && !c.hidden; });
  if (targets.length === 0) return;

  // Bounding box of card centres in world space
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  targets.forEach(function(c) {
    var tx = c.x + (c._ax || 0);
    var ty = c.y + (c._ay || 0);
    minX = Math.min(minX, tx); maxX = Math.max(maxX, tx);
    minY = Math.min(minY, ty); maxY = Math.max(maxY, ty);
  });

  // Full camera transform: screenX = CW/2 + zoom*(worldX - CW/2 + camOffset.x)
  // To centre at worldX: camOffset.x = CW/2 - worldX
  var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  var tgtX = cw / 2 - cx;
  var tgtY = ch / 2 - cy;

  // Zoom to fit the group with generous padding
  var cardW = 140, cardH = 190;
  var boxW  = Math.max(cardW, (maxX - minX) + cardW);
  var boxH  = Math.max(cardH, (maxY - minY) + cardH);
  var tgtZ  = Math.max(0.3, Math.min(3.0, Math.min(cw / boxW, ch / boxH) * 0.85));

  // Animated transition — cubic ease-out, ~350 ms
  var startX = st.camOffsetRef.x, startY = st.camOffsetRef.y, startZ = st.camZoomRef;
  var startMs = performance.now(), duration = 350;
  if (_camAnimId) cancelAnimationFrame(_camAnimId);
  function step(now) {
    var t = Math.min(1, (now - startMs) / duration);
    var e = 1 - Math.pow(1 - t, 3); // cubic ease-out
    st.camOffsetRef.x = startX + (tgtX - startX) * e;
    st.camOffsetRef.y = startY + (tgtY - startY) * e;
    st.camZoomRef     = startZ + (tgtZ - startZ) * e;
    st.needsRedraw = true;
    if (t < 1) {
      _camAnimId = requestAnimationFrame(step);
    } else {
      st.camOffset.x = tgtX; st.camOffset.y = tgtY; st.camZoom = tgtZ;
      st.camOffsetRef.x = tgtX; st.camOffsetRef.y = tgtY; st.camZoomRef = tgtZ;
      _camAnimId = null;
    }
  }
  _camAnimId = requestAnimationFrame(step);
}

// ── Haptic feedback (mobile only, fails silently on desktop) ───────────────
export function haptic(type) {
  if (!navigator.vibrate) return;
  if      (type === 'select') navigator.vibrate(8);
  else if (type === 'drop')   navigator.vibrate([6, 30, 6]);
  else if (type === 'action') navigator.vibrate(12);
  else if (type === 'error')  navigator.vibrate([10, 40, 10, 40, 20]);
}

// ─── Hook registries ──────────────────────────────────────────────────────────
// Modules that need to piggyback on the render loop or inspector update
// register callbacks here instead of monkey-patching function references.

var _afterRenderHooks = [];
export function registerAfterRenderHook(fn) { _afterRenderHooks.push(fn); }

var _updateInspectorHooks = [];
export function registerUpdateInspectorHook(fn) { _updateInspectorHooks.push(fn); }

// ─── Main render loop ──────────────────────────────────────────────────────────
//
//   loop(t)
//     update(t, dt)   — timeline, physics, dirty detection   (runs every frame)
//     render(t, dt)   — all canvas drawing                   (only when needsRedraw)
//
// Performance mode reduces rendering cost (skips expensive FX, coarser physics)
// but never reduces frame rate — loop() always fires at display refresh rate.
// ──────────────────────────────────────────────────────────────────────────────

export function loop(t) {
  requestAnimationFrame(loop); // schedule next frame FIRST so errors can't kill the loop
  if (!st.lastT) st.lastT = t;
  var dt = Math.min(t - st.lastT, 100); // clamp: prevents spiral-of-death after tab wake
  st.lastT = t;

  try { update(t); } catch(e) { console.error('[loop] update error:', e); }

  // Keep render loop alive during video recording so every frame is captured
  if (st._recordingActive) st.needsRedraw = true;

  if (st.needsRedraw) {
    st.needsRedraw = false;
    st._lastRenderT = t;
    try { render(t, dt); } catch(e) { console.error('[loop] render error:', e); }
  }
}

// ─── update ───────────────────────────────────────────────────────────────────
function update(t) {
  // 1. Timeline playback
  if (st.isPlaying) {
    st.playhead = (t - st.playStart);
    if (st.totalDuration > 0 && st.playhead > st.totalDuration) {
      if (st.loopMode) { st.playStart = t; st.playhead = 0; st._sceneFreezeCache = {}; resetAnimOffsets(); applyAnimations(0); }
      else { setPlayState(false); st.playhead = st.totalDuration; }
    }
    updateScrubber();
    applyAnimations(st.playhead);
  }

  // 2. Physics: hover spring + gyro — runs after applyAnimations so _ax/_as are fresh.
  //    In perf mode the spring runs at a coarser rate (faster lerp) but still every frame.
  updateHoverPhysics();

  // 3. Timeline block ticks (updates active-block highlight in the timeline UI)
  tickActiveBlocks(t);

  // 4. Auto-dirty: flag needsRedraw when any animated property is still moving.
  var hasParticles = st.cardsRef.some(function(c) { return c.spell && c.spell.on; });
  var hasBgFx      = (st.bgFxStack && st.bgFxStack.length) || !!st.bgFx.type;
  var needsGyroShowcase = !!(window._gyroActive && document.body.classList.contains('showcase-mode'));
  var hasHover = Object.keys(st.hoverData).some(function(k) {
    var h = st.hoverData[k]; return h && (h.elev > 1.001 || Math.abs(h.tilt) > 0.001);
  });
  var hasGlare = st.cardsRef.some(function(c) { return c.glare && c.glare.on; });
  var hasSfx   = st.cardsRef.some(function(c) {
    return (c.shimmer && c.shimmer.on) || (c.luster && c.luster.on) ||
           (c.ripple && c.ripple.on)   || (c.holo   && c.holo.on);
  });
  if (st.isPlaying || hasParticles || hasHover || hasBgFx || hasGlare || hasSfx ||
      needsGyroShowcase || st.globalLight.on ||
      st.cardDragging || st.isPanning || st.isOrbiting || st.resizeDragging) {
    st.needsRedraw = true;
  }

  // Heartbeat: guard against missed resize/visibility events on mobile.
  // _lastRenderT is only updated when render() actually runs, so this fires
  // ~2 s after the last real frame — not every loop iteration.
  if (!st.needsRedraw && st.cardsRef.length > 0 && (t - st._lastRenderT) > 2000) {
    st.needsRedraw = true;
  }
}

// ─── render ───────────────────────────────────────────────────────────────────
function render(t, dt) {
  var W = st.canvas.width, H = st.canvas.height;
  var CW = st.canvas.clientWidth || W, CH = st.canvas.clientHeight || H;
  var _dpr = W / (CW || 1);
  st.ctx.clearRect(0, 0, W, H);

  st.ctx.save();
  st.ctx.scale(_dpr, _dpr);

  // ── Background ─────────────────────────────────────────────────────────────
  if (st.bgFx && st.bgFx._gradPreset) {
    var _gp = st.bgFx._gradPreset;
    var _gAngle = (_gp.angle || 135) * Math.PI / 180;
    var _gLen = Math.sqrt(CW * CW + CH * CH);
    var _gCx = CW / 2, _gCy = CH / 2;
    var _gx0 = _gCx - Math.cos(_gAngle) * _gLen / 2;
    var _gy0 = _gCy - Math.sin(_gAngle) * _gLen / 2;
    var _gx1 = _gCx + Math.cos(_gAngle) * _gLen / 2;
    var _gy1 = _gCy + Math.sin(_gAngle) * _gLen / 2;
    var _grad = st.ctx.createLinearGradient(_gx0, _gy0, _gx1, _gy1);
    _gp.stops.forEach(function(c, i) { _grad.addColorStop(i / (_gp.stops.length - 1), c); });
    st.ctx.fillStyle = _grad;
  } else {
    st.ctx.fillStyle = st.bgColor;
  }
  st.ctx.fillRect(0, 0, CW, CH);

  drawTextureOverlay(st.ctx, CW, CH);

  if (st.bgFxStack && st.bgFxStack.length) {
    drawBgEffectsStack(st.ctx, CW, CH, t);
  } else {
    drawBgEffects(st.ctx, CW, CH, t);
  }

  if (st.bgImage && st.images['__bg__'] && st.images['__bg__'].complete) {
    var bw = st.images['__bg__'].naturalWidth || 1;
    var bh = st.images['__bg__'].naturalHeight || 1;
    var scale2 = Math.max(CW / bw, CH / bh);
    var dw = bw * scale2, dh = bh * scale2;
    st.ctx.save();
    st.ctx.globalAlpha = st.bgOpacity;
    st.ctx.drawImage(st.images['__bg__'], (CW - dw) / 2, (CH - dh) / 2, dw, dh);
    st.ctx.restore();
  }

  // ── Camera transform ────────────────────────────────────────────────────────
  st.ctx.save();
  st.ctx.translate(CW / 2, CH / 2);
  st.ctx.scale(st.camZoomRef, st.camZoomRef);
  st.ctx.translate(st.camOffsetRef.x, st.camOffsetRef.y);

  if (st.camOrbitRef.yaw !== 0 || st.camOrbitRef.pitch !== 0) {
    var yaw = st.camOrbitRef.yaw * Math.PI / 180;
    var pitch = st.camOrbitRef.pitch * Math.PI / 180;
    var a = Math.cos(yaw), b = 0, c_ = Math.sin(pitch) * 0.5, d_ = 0, e_ = Math.cos(pitch), f = -Math.sin(yaw) * 0.5;
    st.ctx.transform(a, f, c_, e_, b, d_);
  }

  st.ctx.translate(-CW / 2, -CH / 2);

  // ── Cards (back to front) ───────────────────────────────────────────────────
  var drawOrder = st.cardsRef.slice();
  var anyOrbit = drawOrder.some(function(c) { return c._orbitDepth != null; });
  if (anyOrbit) {
    drawOrder.sort(function(a, b) {
      var da = a._orbitDepth != null ? a._orbitDepth : 0.5;
      var db = b._orbitDepth != null ? b._orbitDepth : 0.5;
      return da - db;
    });
  }
  for (var i = 0; i < drawOrder.length; i++) {
    var _c = drawOrder[i];
    if (_c.kind === 'text') {
      drawTextObj(_c, false);
    } else if (_c.kind === 'rect') {
      drawRectObj(_c, false);
    } else if (_c.kind === 'custom') {
      drawCustomCard(_c, t, false);
      if (_c.spell && _c.spell.on) {
        var _ax = _c._ax || 0, _ay = _c._ay || 0, _as = _c._as || 1;
        var _hov = st.hoverData[_c.id];
        var _elev = (_hov && _hov.elev) ? _hov.elev : 1;
        var _cs = (_c.scale || 1) * _as * _elev;
        var _cr = (_c.rot || 0) + (_c._ar || 0) + (_hov ? (_hov.tilt || 0) : 0);
        tickAndDrawParticles(_c, _c.x + _ax, _c.y + _ay, _cs, _cr, t, dt);
      }
    } else {
      drawCard(_c, t, false);
      if (_c.spell && _c.spell.on) {
        var _ax = _c._ax || 0, _ay = _c._ay || 0, _as = _c._as || 1;
        var _hov = st.hoverData[_c.id];
        var _elev = (_hov && _hov.elev) ? _hov.elev : 1;
        var _cs = (_c.scale || 1) * _as * _elev;
        var _cr = (_c.rot || 0) + (_c._ar || 0) + (_hov ? (_hov.tilt || 0) : 0);
        tickAndDrawParticles(_c, _c.x + _ax, _c.y + _ay, _cs, _cr, t, dt);
      }
    }
  }

  // Resize handles — on top of all cards
  var _sel1 = st.selectedRef.length === 1 ? st.cards.find(function(c) { return c.id === st.selectedRef[0]; }) : null;
  if (_sel1 && (_sel1.kind === 'text' || _sel1.kind === 'rect') && !st.resizeDragging) {
    drawResizeHandles(_sel1);
  }

  st.ctx.restore(); // camera transform

  // ── Lighting (screen-space pass) ────────────────────────────────────────────
  drawGlobalLighting(st.ctx, CW, CH);

  st.ctx.restore(); // DPR scale

  // After-render hooks (e.g. mobile floating inspect handle)
  for (var _i = 0; _i < _afterRenderHooks.length; _i++) _afterRenderHooks[_i](t);
}

// Kick off the loop. Also exported so external callers (e.g. post-load) can restart it.
export var renderFrame = loop; // legacy alias — keeps any external references working

// ============================================================
//  ANIMATION SYSTEM
// ============================================================

// ── Easing functions ──────────────────────────────────────────
// Each maps t ∈ [0,1] → value (may overshoot for spring/elastic)

function easeLinear(t)      { return t; }
function easeOutCubic(t)    { return 1 - Math.pow(1 - t, 3); }
function easeOutQuint(t)    { return 1 - Math.pow(1 - t, 5); }
function easeInQuad(t)      { return t * t; }
function easeInOutSine(t)   { return -(Math.cos(Math.PI * t) - 1) / 2; }

// ---- Block drag-to-reorder ----
// st.blockDrag is in AppState

export function attachBlockDragHandlers(blockEl, cardId, si) {
  blockEl.setAttribute('draggable', 'true');

  blockEl.addEventListener('dragstart', function(e) {
    st.blockDrag = { cardId: cardId, fromIdx: si, overIdx: si };
    blockEl.classList.add('dragging-block');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // required for Firefox
  });

  blockEl.addEventListener('dragend', function() {
    if (st.blockDrag && st.blockDrag.fromIdx !== st.blockDrag.overIdx) {
      var seq = st.sequences[st.blockDrag.cardId];
      var moved = seq.splice(st.blockDrag.fromIdx, 1)[0];
      var insertAt = st.blockDrag.overIdx > st.blockDrag.fromIdx ? st.blockDrag.overIdx - 1 : st.blockDrag.overIdx;
      seq.splice(insertAt, 0, moved);
      // Adjust st.openStepEditor index if needed
      if (st.openStepEditor && st.openStepEditor.cardId === st.blockDrag.cardId) {
        st.openStepEditor = null; // close editor to avoid stale index
      }
      calcTotalDuration();
    }
    st.blockDrag = null;
    renderTimeline();
  });

  blockEl.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!st.blockDrag || st.blockDrag.cardId !== cardId) return;
    // Determine left vs right half for drop position
    var rect = blockEl.getBoundingClientRect();
    var mid = rect.left + rect.width / 2;
    var targetIdx = e.clientX < mid ? si : si + 1;
    st.blockDrag.overIdx = targetIdx;
    // Visual feedback
    document.querySelectorAll('.seq-block').forEach(function(b) {
      b.classList.remove('drag-over-left', 'drag-over-right');
    });
    if (e.clientX < mid) blockEl.classList.add('drag-over-left');
    else blockEl.classList.add('drag-over-right');
  });

  blockEl.addEventListener('dragleave', function() {
    blockEl.classList.remove('drag-over-left', 'drag-over-right');
  });

  blockEl.addEventListener('drop', function(e) {
    e.preventDefault();
    blockEl.classList.remove('drag-over-left', 'drag-over-right');
  });
}

// ---- Clear All Sequences ----
document.getElementById('btn-clear-sequences').addEventListener('click', function() {
  st.sequences = {};
  st.openStepEditor = null;
  setPlayState(false);
  st.playhead = 0;
  updateScrubber();
  resetAnimOffsets();
  calcTotalDuration();
  renderTimeline();
  showToast('All sequences cleared');
});
export function updateInspector() {
  var empty     = document.getElementById('inspector-empty');
  var content   = document.getElementById('inspector-content');
  var textPanel = document.getElementById('inspector-text');
  var rectPanel = document.getElementById('inspector-rect');
  if (!empty || !content) return;

  var sel = st.selectedRef;
  var card = sel.length === 1 ? st.cards.find(function(c) { return c.id === sel[0]; }) : null;

  // Show the correct panel
  empty.style.display     = (sel.length === 0) ? '' : 'none';
  content.style.display   = (card && card.kind !== 'text' && card.kind !== 'rect') ? '' : 'none';
  if (textPanel) textPanel.style.display = (card && card.kind === 'text') ? '' : 'none';
  if (rectPanel) rectPanel.style.display = (card && card.kind === 'rect') ? '' : 'none';

  // Update toggle states and detail rows in the inspector content panel
  refreshInspectorContent();

  // Fire registered hooks (e.g. inspector fade-in, mobile handle positioning)
  for (var _i = 0; _i < _updateInspectorHooks.length; _i++) _updateInspectorHooks[_i]();
}

// ── Stock Library grid (rendered once on load, never changes) ───────────
export function renderStockGrid() {
  var grid = document.getElementById('stock-grid');
  if (!grid) return;
  grid.innerHTML = '';
  STOCK_CARDS.forEach(function(sc) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';

    var thumb = document.createElement('div');
    thumb.className = 'asset-thumb';
    thumb.title = sc.name + ' — click to add, drag to place';

    var imgEl = document.createElement('img');
    imgEl.src = sc.src;
    imgEl.draggable = false;
    thumb.appendChild(imgEl);

    // Name label fades in on hover
    var lbl = document.createElement('div');
    lbl.textContent = sc.name;
    lbl.style.cssText = 'position:absolute;bottom:0;left:0;right:0;'
      + 'background:rgba(0,0,0,0.72);color:#eee;font-size:8px;text-align:center;'
      + 'padding:2px 0;border-radius:0 0 4px 4px;opacity:0;transition:opacity 0.15s;'
      + 'pointer-events:none;letter-spacing:0.03em;';
    wrap.addEventListener('mouseenter', function() { lbl.style.opacity = '1'; });
    wrap.addEventListener('mouseleave', function() { lbl.style.opacity = '0'; });
    wrap.appendChild(lbl);

    thumb.addEventListener('click', function(e) {
      // Guard: if this tap also triggered an asset drag (mobile ghost), skip
      if (Date.now() - (thumb._lastDragStart||0) < 400) return;
      var c = createCard(sc.id);
      selectCard(c.id, false);
      showToast(sc.name + ' added');
    });
    thumb.addEventListener('mousedown', function(e) {
      // Only start drag on real mouse (not touch-synthesised mousedown)
      if (e.pointerType === 'touch' || e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      thumb._lastDragStart = Date.now();
      startAssetDrag(sc.id, sc.src, e);
    });
    thumb.addEventListener('touchstart', function(e) {
      thumb._lastDragStart = 0; // reset so click fires normally on touch
    }, { passive: true });

    wrap.appendChild(thumb);
    grid.appendChild(wrap);
  });
}

export function refreshAssetGrids() {
  // Exclude stock st.cards, default back, and bg from the user-uploaded Assets section
  var ids = Object.keys(st.images).filter(function(id) {
    return id !== '__bg__' && id !== st.DEFAULT_BACK_ID && id.indexOf('__stock__') !== 0;
  });
  // Left panel grid
  var grid = document.getElementById('asset-grid');
  if (ids.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:14px 0; font-size:11px; color:var(--muted); font-style:italic;">No assets yet</div>';
  } else {
    grid.innerHTML = '';
    ids.forEach(function(id) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;';

      var thumb = document.createElement('div');
      thumb.className = 'asset-thumb';
      thumb.dataset.assetId = id;
      var img2 = document.createElement('img');
      img2.src = st.images[id].src || st.images[id];
      img2.draggable = false;
      thumb.appendChild(img2);

      // Delete button overlay
      var delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Remove asset';
      delBtn.style.cssText = 'position:absolute;top:3px;right:3px;width:16px;height:16px;'
        + 'border-radius:50%;border:none;background:rgba(10,10,15,0.85);color:var(--muted);'
        + 'font-size:9px;cursor:pointer;display:none;align-items:center;justify-content:center;'
        + 'line-height:1;padding:0;z-index:2;';
      delBtn.addEventListener('mouseenter', function() { delBtn.style.color = '#E05555'; });
      delBtn.addEventListener('mouseleave', function() { delBtn.style.color = 'var(--muted)'; });
      delBtn.addEventListener('click', function(e) { e.stopPropagation(); deleteAsset(id); });

      wrap.addEventListener('mouseenter', function() { delBtn.style.display = 'flex'; });
      wrap.addEventListener('mouseleave', function() { delBtn.style.display = 'none'; });

      thumb.addEventListener('click', function(e) {
        if (Date.now() - (thumb._lastDragStart||0) < 400) return;
        var c = createCard(id);
        selectCard(c.id, false);
      });
      thumb.addEventListener('mousedown', function(e) {
        if (e.pointerType === 'touch' || e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
        thumb._lastDragStart = Date.now();
        startAssetDrag(id, img2.src, e);
      });

      wrap.appendChild(thumb);
      wrap.appendChild(delBtn);
      grid.appendChild(wrap);
    });
  }
  refreshInspectorAssetGrid();
}

// ============================================================
//  ASSET DRAG-AND-DROP
// ============================================================
// st.assetDragId is in AppState
// st.assetDragImg is in AppState
var ghostEl = document.getElementById('drag-ghost');
var ghostImg = document.getElementById('drag-ghost-img');

export function startAssetDrag(id, src, e) {
  st.assetDragId = id;
  st.assetDragImg = src;

// ─── asset drag ───────────────────────────────────
  st.assetDragId = id;
  st.assetDragImg = src;
  ghostImg.src = src;
  ghostEl.style.display = 'block';
  ghostEl.style.left = (e.clientX - 27) + 'px';
  ghostEl.style.top = (e.clientY - 38) + 'px';
  document.getElementById('drop-overlay').style.display = 'block';
  e.preventDefault();
}

window.addEventListener('mousemove', function(e) {
  if (st.assetDragId) {
    ghostEl.style.left = (e.clientX - 27) + 'px';
    ghostEl.style.top = (e.clientY - 38) + 'px';
  }
});

window.addEventListener('mouseup', function(e) {
  if (!st.assetDragId) return;
  ghostEl.style.display = 'none';
  document.getElementById('drop-overlay').style.display = 'none';

  // Check if dropped on st.canvas
  var rect = st.canvas.getBoundingClientRect();
  if (e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom) {

    var world = screenToWorld(e.clientX, e.clientY);
    var hit = cardAtPoint(world.x, world.y);

    if (hit) {
      var relY = e.clientY - rect.top;
      var cssH2 = rect.height;
      var cardCY = (hit.y - cssH2 / 2) * st.camZoomRef + cssH2 / 2 + st.camOffsetRef.y * st.camZoomRef;
      if (e.clientY < cardCY) {
        hit.frontImg = st.assetDragId; showToast('Applied to card front');
      } else {
        hit.backImg = st.assetDragId; showToast('Applied to card back');
      }
    } else {
      var c2 = createCard(st.assetDragId);
      c2.x = world.x; c2.y = world.y;
      showToast('Card spawned');
    }
  }
  st.assetDragId = null;
});

// ============================================================
//  BACKGROUND
// ============================================================

// ── Texture st.images (real photos, base64-embedded) ────────────────────

// Pre-load texture st.images and cache as Image objects
// st.bgTextureImages is in AppState
(function() {
  if (!st.TEXTURE_SRCS) return;
  Object.keys(st.TEXTURE_SRCS).forEach(function(name) {
    var img = new Image();
    img.src = st.TEXTURE_SRCS[name];
    st.bgTextureImages[name] = img;
  });
  // ─── texture previews ───────────────────────────────────
  ['wood','space'].forEach(function(name) {
    var img = st.bgTextureImages[name];
    if (!img) return;
    var pc  = document.getElementById('tex-preview-' + name);
    if (!pc) return;
    pc.width = 120; pc.height = 36;
    var pct = pc.getContext('2d');
    function draw() {
      pct.clearRect(0, 0, 120, 36);
      // Cover-fit
      var iw = img.naturalWidth  || img.width  || 1;
      var ih = img.naturalHeight || img.height || 1;
      var sc = Math.max(120 / iw, 36 / ih);
      var dw = iw * sc, dh = ih * sc;
      pct.drawImage(img, (120 - dw) / 2, (36 - dh) / 2, dw, dh);
    }
    if (img.complete && img.naturalWidth) { draw(); }
    else { img.onload = draw; }
  });
})();

// Draw texture overlay onto any context — cover-fills the st.canvas
export function drawTextureOverlay(tctx, W, H) {
  if (!st.bgTexture) return;
  var img = st.bgTextureImages[st.bgTexture];
  if (!img || !img.complete || !img.naturalWidth) return;
  var iw = img.naturalWidth, ih = img.naturalHeight;
  var sc = Math.max(W / iw, H / ih);
  var dw = iw * sc, dh = ih * sc;
  tctx.save();
  tctx.globalAlpha = st.bgTextureOpacity;
  tctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  tctx.restore();
}

// ============================================================
//  BACKGROUND EFFECTS ENGINE
// ============================================================

// st.bgFx is in AppState

// ─── st.bgFxStack management ───────────────────────────────────
function _findBgFxLayer(type) {
  for (var i=0;i<st.bgFxStack.length;i++) if (st.bgFxStack[i].type===type) return st.bgFxStack[i];
  return null;
}
export function _clamp01(x){ x = +x; if (!isFinite(x)) return 0; return Math.max(0, Math.min(1, x)); }

export function addBgFxLayer(type) {
  if (_findBgFxLayer(type)) return;
  if (st.bgFxStack.length >= 3) { try{ showToast('⚠ Max 3 bg layers'); }catch(_){} return; }

  var p = JSON.parse(JSON.stringify(st.BGFX_DEFAULTS));
  p.type = type;
  p.blend = (_getBgFxEntry(type) || {}).blendDefault || 'source-over';
  p.particleColor1 = null; p.particleColor2 = null;
  p.flowMode = 'default'; p.flowSpread = 0.6; p.originX = 0.5; p.originY = 0.5;

  if (type === 'crystal')   { p.crystalFacets = 0.5; p.intensity = 1.0; p.speed = 0.3; }
  if (type === 'metaballs') { p.metaCount = 0.5;     p.intensity = 1.0; p.speed = 0.4; }
  if (type === 'smokering') {
    p.srRadius = 0.28; p.srThickness = 0.7; p.srInner = 0.7;
    p.srNscale = 3.0;  p.srNiter = 5;       p.srScale = 1.4;
    p.intensity = 1.0; p.speed = 0.5;
    p.particleColor1 = '#cc3333'; p.particleColor2 = '#ff9900';
  }
  if (type === 'godrays') {
    st._grGL = null; // force shader recompile with latest _GR_FRAG
    p.intensity = 1.0; p.speed = 0.75;
    p.grOpacity = 0.5;
    p.grDensity = 0.3; p.grSpotty = 0.3;
    p.grMidSize = 0.2; p.grMidInt = 0.4;
    p.grBloom   = 0.4; p.grOffsetY = -0.55; p.grOffsetX = 0.0;
    p.grColorPrimary = '#a600f6';
    p.grColorSecondary = '#33fff5';
    p.grColorBack  = '#000000';
    p.particleColor1 = p.grColorPrimary; p.particleColor2 = p.grColorSecondary;
  }

  st.bgFxStack.push({ type: type, enabled: true, opacity: 1.0, blend: 'screen', params: p });
  selectBgFxLayer(type);
  _resetBgFxRuntime();
  syncBgFxUI();
  var _addLayerBtn = document.getElementById('bgfx-add-layer');
  if (_addLayerBtn) _addLayerBtn.addEventListener('click', function(){ try{ showToast('Click an FX button to add it as a layer'); }catch(_){} });

}

// ── Clear all background effects ─────────────────────────────────────────
(function() {
  var btn = document.getElementById('btn-bgfx-clear-all');
  if (!btn) return;
  btn.addEventListener('click', function() {
    st.bgFxStack = [];
    st.bgFxSelectedType = null;
    st.bgFx.type = null;
    _resetBgFxRuntime();
    syncBgFxUI();
    markDirty();
    showToast('Background effects cleared');
  });
}());

export function removeBgFxLayer(type) {
  st.bgFxStack = st.bgFxStack.filter(function(l){ return l.type !== type; });
  if (st.bgFxSelectedType === type) st.bgFxSelectedType = st.bgFxStack.length ? st.bgFxStack[st.bgFxStack.length-1].type : null;
  if (st.bgFxSelectedType) selectBgFxLayer(st.bgFxSelectedType); else { st.bgFx.type = null; }
  _resetBgFxRuntime();
  syncBgFxUI();
}

export function toggleBgFxLayer(type) {
  var l = _findBgFxLayer(type);
  if (l) removeBgFxLayer(type);
  else addBgFxLayer(type);
}

export function selectBgFxLayer(type) {
  st.bgFxSelectedType = type;
  var l = _findBgFxLayer(type);
  if (l && l.params) st.bgFx = l.params;
  syncBgFxUI();
}

export function _resetBgFxRuntime() {
  // Reset legacy single-effect runtime
  st.bgParticles = []; st.bgSmokeParticles = []; st.bgStarsInit = false;
  st._crystalPoints = []; st._metaBalls = [];
  st._smokeBuf = null; st._smokeCtx = null; st._smokeBW = 0; st._smokeBH = 0; // force dark re-init

  // Reset stacked layer runtimes (if present)
  if (st.bgFxStack && st.bgFxStack.length) {
    st.bgFxStack.forEach(function(layer){
      if (layer && layer._rt) {
        layer._rt.bgParticles = [];
        layer._rt.bgSmokeParticles = [];
        layer._rt.bgStars = [];
        layer._rt.bgStarsInit = false;
        layer._rt._bgLastT = 0;
        layer._rt._bgAccShadow = 0;
        layer._rt._bgAccNature = 0;
        layer._rt._bgAccCosmic = 0;
        layer._rt._crystalPoints = [];
        layer._rt._metaBalls = [];
      }
    });
  }
}

export function _layerTypeLabel(type) {
  var map = { fire:'🔥 Fire', cosmic:'🌙 Cosmic', shadow:'🌑 Shadow', nature:'🌿 Nature', smoke:'☁️ Smoke', crystal:'💎 Crystal', metaballs:'🫧 Metaballs', smokering:'🌀 Smoke Ring', godrays:'✦ God Rays' };
  return map[type] || type;
}

export function renderBgFxStackUI() {
  var list = document.getElementById('bgfx-stack-list');
  if (!list) return;
  list.innerHTML = '';

  if (!st.bgFxStack.length) {
    var empty = document.createElement('div');
    empty.style.cssText = 'font-size:11px;color:var(--muted);font-style:italic;padding:6px 2px;';
    empty.textContent = 'No layers. Click an FX button to add one.';
    list.appendChild(empty);
    return;
  }

  st.bgFxStack.forEach(function(layer){
    var row = document.createElement('div');
    row.className = 'fxlayer' + (layer.enabled ? ' enabled' : '') + (layer.type === st.bgFxSelectedType ? ' selected' : '');
    row.title = 'Select to edit';

    row.addEventListener('click', function(e){
      if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || (e.target.classList && e.target.classList.contains('mini-btn')))) return;
      selectBgFxLayer(layer.type);
    });

    var on = document.createElement('div');
    on.className = 'fx-on';
    on.textContent = layer.enabled ? '✓' : '·';
    on.title = layer.enabled ? 'Disable layer' : 'Enable layer';
    on.addEventListener('click', function(ev){
      ev.stopPropagation();
      layer.enabled = !layer.enabled;
      on.textContent = layer.enabled ? '✓' : '·';
      row.classList.toggle('enabled', layer.enabled);
      _resetBgFxRuntime();
      syncBgFxUI();
    });

    var name = document.createElement('div');
    name.className = 'fx-name';
    name.textContent = _layerTypeLabel(layer.type);

    var mini = document.createElement('div');
    mini.className = 'fx-mini';

    var op = document.createElement('input');
    op.type = 'range'; op.min = 0; op.max = 1; op.step = 0.02;
    op.value = layer.opacity != null ? layer.opacity : 1;
    op.className = 'mini-opacity';
    op.title = 'Opacity';
    op.addEventListener('input', function(){ layer.opacity = _clamp01(op.value); });

    var sel = document.createElement('select');
    ['source-over','lighter','screen','multiply'].forEach(function(v){
      var opt = document.createElement('option');
      opt.value=v; opt.textContent = (v==='source-over'?'Normal':(v==='lighter'?'Add':(v==='screen'?'Screen':'Multiply')));
      sel.appendChild(opt);
    });
    sel.value = (layer.params && layer.params.blend) ? layer.params.blend : 'source-over';
    sel.title = 'Blend';
    sel.addEventListener('change', function(){ if (layer.params) layer.params.blend = sel.value; });

    var rm = document.createElement('button');
    rm.className = 'mini-btn';
    rm.textContent = '✕';
    rm.title = 'Remove layer';
    rm.addEventListener('click', function(ev){ ev.stopPropagation(); removeBgFxLayer(layer.type); });

    mini.appendChild(op);
    mini.appendChild(sel);
    mini.appendChild(rm);

    row.appendChild(on);
    row.appendChild(name);
    row.appendChild(mini);
    list.appendChild(row);
  });
}


// Particle pools — st.bgParticles, st.bgSmokeParticles, st.bgStars, st.bgStarsInit are in AppState
// st._bgLastT, st._bgAccShadow, st._bgAccNature, st._bgAccCosmic are in AppState

// ── Simple seeded noise (1D) for turbulence without imports ──────────────

// ─── BG FX Registry — single source of truth for all bg effect params ────────
var BG_FX_REGISTRY = [
  {
    id: 'fire', blendDefault: 'screen',
    params: [
      { id: 'intensity',      label: 'Intensity', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { id: 'speed',          label: 'Speed',     type: 'range', min: 0.1, max: 3.0, step: 0.1  },
      { id: 'fireHeat',       label: 'Heat',      type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { id: 'fireHeight',     label: 'Height',    type: 'range', min: 0.1, max: 1.0, step: 0.05 },
      { id: 'smokeAmount',    label: 'Smoke',     type: 'range', min: 0.0, max: 1.5, step: 0.05 },
      { id: 'particleColor1', label: 'Flame',     type: 'color', nullable: true },
      { id: 'particleColor2', label: 'Smoke',     type: 'color', nullable: true }
    ]
  },
  {
    id: 'cosmic', blendDefault: 'screen',
    params: [
      { id: 'intensity',      label: 'Intensity', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { id: 'speed',          label: 'Speed',     type: 'range', min: 0.1, max: 3.0, step: 0.1  },
      { id: 'moonSize',       label: 'Moon Size', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { id: 'nebulaBloom',    label: 'Nebula',    type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { id: 'starCount',      label: 'Stars',     type: 'range', min: 20,  max: 400, step: 10, sideEffect: 'resetStars' },
      { id: 'particleColor1', label: 'Dust',      type: 'color', nullable: true },
      { id: 'particleColor2', label: 'Stars',     type: 'color', nullable: true }
    ]
  },
  {
    id: 'shadow', blendDefault: 'source-over',
    params: [
      { id: 'intensity',      label: 'Intensity', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { id: 'speed',          label: 'Speed',     type: 'range', min: 0.1, max: 3.0, step: 0.1  },
      { id: 'shadowDepth',    label: 'Depth',     type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { id: 'shadowPulse',    label: 'Pulse',     type: 'range', min: 0.0, max: 2.0, step: 0.1  },
      { id: 'particleColor1', label: 'Shadow',    type: 'color', nullable: true },
      { id: 'particleColor2', label: 'Wisp',      type: 'color', nullable: true }
    ]
  },
  {
    id: 'nature', blendDefault: 'source-over',
    params: [
      { id: 'intensity',      label: 'Intensity', type: 'range', min: 0.1, max: 1.5, step: 0.05 },
      { id: 'speed',          label: 'Speed',     type: 'range', min: 0.1, max: 3.0, step: 0.1  },
      { id: 'windStrength',   label: 'Wind',      type: 'range', min: 0.1, max: 2.0, step: 0.1  },
      { id: 'leafCount',      label: 'Leaves',    type: 'range', min: 10,  max: 150, step: 5    },
      { id: 'leafSize',       label: 'Leaf Size', type: 'range', min: 0.3, max: 3.0, step: 0.1  },
      { id: 'particleColor1', label: 'Leaf',      type: 'color', nullable: true },
      { id: 'particleColor2', label: 'Glow',      type: 'color', nullable: true }
    ]
  },
  {
    id: 'crystal', blendDefault: 'screen',
    params: [
      { id: 'intensity',          label: 'Intensity', type: 'range', min: 0.1, max: 2.0, step: 0.05 },
      { id: 'speed',              label: 'Speed',     type: 'range', min: 0.05,max: 2.0, step: 0.05 },
      { id: 'crystalFacets',      label: 'Facets',    type: 'range', min: 0.0, max: 1.0, step: 0.05, sideEffect: 'resetCrystal' },
      { id: 'crystalSpecOpacity', label: 'Specular',  type: 'range', min: 0.0, max: 1.0, step: 0.01 },
      { id: 'particleColor1',     label: 'Facet A',   type: 'color', nullable: true },
      { id: 'particleColor2',     label: 'Facet B',   type: 'color', nullable: true }
    ]
  },
  {
    id: 'metaballs', blendDefault: 'screen',
    params: [
      { id: 'intensity',      label: 'Intensity',   type: 'range', min: 0.1, max: 2.0, step: 0.05 },
      { id: 'speed',          label: 'Speed',       type: 'range', min: 0.05,max: 2.0, step: 0.05 },
      { id: 'metaCount',      label: 'Blobs',       type: 'range', min: 0.0, max: 1.0, step: 0.1,  sideEffect: 'resetMeta' },
      { id: 'metaRimOpacity', label: 'Rim opacity', type: 'range', min: 0.0, max: 1.0, step: 0.01 },
      { id: 'particleColor1', label: 'Blob A',      type: 'color', nullable: true },
      { id: 'particleColor2', label: 'Blob B',      type: 'color', nullable: true }
    ]
  },
  {
    id: 'smokering', blendDefault: 'screen',
    params: [
      { id: 'intensity',      label: 'Intensity',   type: 'range', min: 0.1, max: 2.0, step: 0.05 },
      { id: 'speed',          label: 'Speed',       type: 'range', min: 0.0, max: 3.0, step: 0.05 },
      { id: 'srRadius',       label: 'Radius',      type: 'range', min: 0.0, max: 1.0, step: 0.01 },
      { id: 'srThickness',    label: 'Thickness',   type: 'range', min: 0.01,max: 1.0, step: 0.01 },
      { id: 'srInner',        label: 'Inner Fill',  type: 'range', min: 0.0, max: 4.0, step: 0.05 },
      { id: 'srNscale',       label: 'Noise Scale', type: 'range', min: 0.1, max: 5.0, step: 0.1  },
      { id: 'srNiter',        label: 'Detail',      type: 'range', min: 1,   max: 8,   step: 1    },
      { id: 'srScale',        label: 'Zoom',        type: 'range', min: 0.2, max: 4.0, step: 0.05 },
      { id: 'particleColor1', label: 'Colour 1',    type: 'color', nullable: true },
      { id: 'particleColor2', label: 'Colour 2',    type: 'color', nullable: true }
    ]
  },
  {
    id: 'godrays', blendDefault: 'screen',
    params: [
      { id: 'grOpacity',        label: 'Opacity',     type: 'range', min: 0.0,  max: 1.0, step: 0.02 },
      { id: 'speed',            label: 'Speed',       type: 'range', min: 0.0,  max: 3.0, step: 0.05 },
      { id: 'grDensity',        label: 'Density',     type: 'range', min: 0.0,  max: 1.0, step: 0.02 },
      { id: 'grSpotty',         label: 'Width',       type: 'range', min: 0.0,  max: 1.0, step: 0.02 },
      { id: 'grMidSize',        label: 'Glow Size',   type: 'range', min: 0.0,  max: 1.0, step: 0.02 },
      { id: 'grMidInt',         label: 'Glow Bright', type: 'range', min: 0.0,  max: 1.5, step: 0.05 },
      { id: 'grOffsetY',        label: 'Origin Y',    type: 'range', min: -1.0, max: 1.0, step: 0.02 },
      { id: 'grOffsetX',        label: 'Origin X',    type: 'range', min: -1.0, max: 1.0, step: 0.02 },
      { id: 'grColorPrimary',   label: 'Primary',     type: 'color', default: '#a600f6' },
      { id: 'grColorSecondary', label: 'Secondary',   type: 'color', default: '#33fff5' },
      { id: 'grColorBack',      label: 'Background',  type: 'color', default: '#000000' }
    ]
  }
];

function _getBgFxEntry(id) {
  for (var i = 0; i < BG_FX_REGISTRY.length; i++) {
    if (BG_FX_REGISTRY[i].id === id) return BG_FX_REGISTRY[i];
  }
  return null;
}

var WARP_SCHEMA = [
  { key: 'warpAmp',  label: 'Amplitude', min: 0.0, max: 1.5, step: 0.05, fmt: function(v){ return (v*100).toFixed(0)+'%'; } },
  { key: 'warpFreq', label: 'Frequency', min: 0.2, max: 4.0, step: 0.1,  fmt: function(v){ return v.toFixed(1)+'×'; } }
];

// Flow mode button configs
var FLOW_MODES = [
  { mode: 'default', label: '✦ Auto',     title: 'Effect default behaviour' },
  { mode: 'up',      label: '⬆ Bottom',   title: 'Particles spawn at bottom and move up' },
  { mode: 'down',    label: '⬇ Top',      title: 'Particles spawn at top and move down' },
  { mode: 'outward', label: '◎ Explode',  title: 'Particles burst outward from origin' },
  { mode: 'inward',  label: '● Implode',  title: 'Particles converge toward origin' },
  { mode: 'angle',   label: '↗ Angle',    title: 'Custom direction angle' }
];

var BLEND_OPTIONS = [
  { value: 'source-over', label: 'Normal'   },
  { value: 'screen',      label: 'Screen'   },
  { value: 'lighter',     label: 'Add'      },
  { value: 'multiply',    label: 'Multiply' }
];

// Side-effects triggered by specific param changes
var SIDE_EFFECTS = {
  resetStars:   function() { st.bgStarsInit = false; },
  resetCrystal: function() { st._crystalPoints = []; },
  resetMeta:    function() { st._metaBalls = []; }
};

function makeColorRow(label, currentValue, paramDef) {
  var crow = document.createElement('div');
  crow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:5px;';
  var clbl = document.createElement('label');
  clbl.textContent = label;
  clbl.style.cssText = 'font-size:11px; color:var(--muted); flex:0 0 56px;';
  var cpick = document.createElement('input');
  cpick.type = 'color';
  cpick.value = currentValue || paramDef.default || '#ff6600';
  cpick.style.cssText = 'width:32px; height:22px; border:1px solid var(--border); background:none; cursor:pointer; border-radius:3px; padding:1px;';
  var pid = paramDef.id;
  cpick.addEventListener('input', function() { st.bgFx[pid] = cpick.value; });
  crow.appendChild(clbl);
  crow.appendChild(cpick);
  if (paramDef.nullable) {
    var resetBtn = document.createElement('button');
    resetBtn.textContent = '↺ Auto';
    resetBtn.style.cssText = 'font-size:10px; font-family:var(--font-body); background:var(--panel2); border:1px solid var(--border); color:var(--muted); padding:2px 6px; border-radius:3px; cursor:pointer;';
    resetBtn.title = 'Reset to automatic color';
    resetBtn.addEventListener('click', function() { st.bgFx[pid] = null; cpick.value = paramDef.default || '#ff6600'; });
    crow.appendChild(resetBtn);
  }
  return crow;
}

function makeSectionDivider(label) {
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; align-items:center; gap:6px; margin:8px 0 5px;';
  var line1 = document.createElement('div');
  line1.style.cssText = 'flex:0 0 8px; height:1px; background:var(--border);';
  var lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:9px; color:var(--muted); letter-spacing:0.15em; font-family:var(--font-head); white-space:nowrap;';
  lbl.textContent = label;
  var line2 = document.createElement('div');
  line2.style.cssText = 'flex:1; height:1px; background:var(--border);';
  wrap.appendChild(line1); wrap.appendChild(lbl); wrap.appendChild(line2);
  return wrap;
}

export function buildBgFxControls() {
  var container = document.getElementById('bgfx-sliders');
  container.innerHTML = '';
  if (!st.bgFx.type) return;

  var entry = _getBgFxEntry(st.bgFx.type);
  if (!entry) return;

  var params = entry.params || [];
  var rangeParams = params.filter(function(p) { return p.type === 'range'; });
  var colorParams = params.filter(function(p) { return p.type === 'color'; });

  // ── PARAMETERS ──────────────────────────────────────────────────────
  if (rangeParams.length) {
    container.appendChild(makeSectionDivider('PARAMETERS'));
    rangeParams.forEach(function(p) {
      var pid = p.id;
      var val = st.bgFx[pid] != null ? st.bgFx[pid] : p.min;
      var row = makeSliderRow(p.label, val, p.min, p.max, p.step, null, function(v) {
        st.bgFx[pid] = v;
        if (p.sideEffect && SIDE_EFFECTS[p.sideEffect]) SIDE_EFFECTS[p.sideEffect]();
      });
      container.appendChild(row);
    });
  }

  // ── BLEND ──────────────────────────────────────────────────────────
  container.appendChild(makeSectionDivider('BLEND'));
  var blendRow = document.createElement('div');
  blendRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:6px;';
  var blendLbl = document.createElement('label');
  blendLbl.textContent = 'Mode';
  blendLbl.style.cssText = 'font-size:11px; color:var(--muted); flex:0 0 56px;';
  var blendSel = document.createElement('select');
  blendSel.style.cssText = 'flex:1; background:var(--panel2); border:1px solid var(--border); color:var(--text); font-family:var(--font-body); font-size:11px; padding:3px 5px; border-radius:3px; outline:none; cursor:pointer;';
  BLEND_OPTIONS.forEach(function(opt) {
    var o = document.createElement('option');
    o.value = opt.value; o.textContent = opt.label;
    if (st.bgFx.blend === opt.value) o.selected = true;
    blendSel.appendChild(o);
  });
  blendSel.addEventListener('change', function() { st.bgFx.blend = blendSel.value; });
  blendRow.appendChild(blendLbl); blendRow.appendChild(blendSel);
  container.appendChild(blendRow);

  // ── COLORS ──────────────────────────────────────────────────────────
  if (colorParams.length) {
    container.appendChild(makeSectionDivider('COLORS'));
    colorParams.forEach(function(p) {
      container.appendChild(makeColorRow(p.label, st.bgFx[p.id], p));
    });
  }

  // ── BLOOM ──────────────────────────────────────────────────────────
  container.appendChild(makeSectionDivider('BLOOM'));
  (function() {
    var brow = document.createElement('div');
    brow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:6px;';
    var bl = document.createElement('label');
    bl.textContent = 'Bloom color';
    bl.style.cssText = 'font-size:11px; color:var(--muted); flex:0 0 56px;';
    var bp = document.createElement('input');
    bp.type = 'color';
    bp.value = st.bgFx.centerBloomColor || '#ffffff';
    bp.style.cssText = 'width:32px; height:22px; border:1px solid var(--border); background:none; cursor:pointer; border-radius:3px; padding:1px;';
    bp.addEventListener('input', function(){ st.bgFx.centerBloomColor = bp.value; });
    brow.appendChild(bl); brow.appendChild(bp);
    container.appendChild(brow);
    var bOp = makeSliderRow('Bloom opacity', st.bgFx.centerBloomOpacity || 0, 0, 1, 0.01, null, function(v) {
      st.bgFx.centerBloomOpacity = v;
    });
    container.appendChild(bOp);
  })();

  // ── WARP ────────────────────────────────────────────────────────────
  if (st.bgFx.warp !== 'none') {
    container.appendChild(makeSectionDivider('WARP'));
    WARP_SCHEMA.forEach(function(s) {
      var key3 = s.key;
      var row = makeSliderRow(s.label, st.bgFx[key3], s.min, s.max, s.step, s.fmt, function(v) {
        st.bgFx[key3] = v;
      });
      container.appendChild(row);
    });
  }

  // ── FLOW / DIRECTION ─────────────────────────────────────────────────
  container.appendChild(makeSectionDivider('FLOW & DIRECTION'));
  var flowGrid = document.createElement('div');
  flowGrid.style.cssText = 'display:flex; flex-wrap:wrap; gap:3px; margin-bottom:8px;';
  FLOW_MODES.forEach(function(fm) {
    var fb = document.createElement('button');
    fb.className = 'flow-btn' + (st.bgFx.flowMode === fm.mode ? ' active' : '');
    fb.textContent = fm.label;
    fb.title = fm.title;
    fb.addEventListener('click', function() {
      st.bgFx.flowMode = fm.mode;
      st.bgParticles = []; st.bgSmokeParticles = []; st._crystalPoints = []; st._metaBalls = []; st.bgStarsInit = false;
      buildBgFxControls(); upgradeAllSliders();
    });
    flowGrid.appendChild(fb);
  });
  container.appendChild(flowGrid);

  var spreadRow = makeSliderRow('Spread', st.bgFx.flowSpread, 0, 2, 0.05,
    function(v) {
      if (v < 0.1) return 'Laser';
      if (v < 0.5) return 'Cone';
      if (v < 1.1) return 'Wide';
      if (v < 1.8) return '270°';
      return 'Full';
    },
    function(v) { st.bgFx.flowSpread = v; });
  container.appendChild(spreadRow);

  if (st.bgFx.flowMode === 'angle') {
    var angRow = makeSliderRow('Angle', st.bgFx.flowAngle, 0, 360, 1,
      function(v) {
        var dirs = ['→','↘','↓','↙','←','↖','↑','↗'];
        return Math.round(v) + '° ' + dirs[Math.round(((v % 360) / 45)) % 8];
      },
      function(v) { st.bgFx.flowAngle = v; st.bgParticles = []; st.bgSmokeParticles = []; });
    container.appendChild(angRow);
  }

  if (st.bgFx.flowMode === 'outward' || st.bgFx.flowMode === 'inward' || st.bgFx.flowMode === 'angle') {
    var padLbl = document.createElement('div');
    padLbl.style.cssText = 'font-size:10px; color:var(--muted); margin-bottom:4px; letter-spacing:0.08em;';
    padLbl.textContent = 'ORIGIN POINT — drag to reposition';
    container.appendChild(padLbl);

    var pad = document.createElement('div');
    pad.className = 'origin-pad';
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','origin-pad-lines');
    svg.innerHTML = '<line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>'
      + '<line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>'
      + '<circle cx="50%" cy="50%" r="20%" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>'
      + '<circle cx="50%" cy="50%" r="40%" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>';
    pad.appendChild(svg);
    var dot = document.createElement('div');
    dot.className = 'origin-dot';
    dot.style.left = (st.bgFx.originX * 100) + '%';
    dot.style.top  = (st.bgFx.originY * 100) + '%';
    pad.appendChild(dot);
    function updateOriginFromEvent(e) {
      var rect = pad.getBoundingClientRect();
      var cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      var cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      st.bgFx.originX = cx; st.bgFx.originY = cy;
      dot.style.left = (cx * 100) + '%';
      dot.style.top  = (cy * 100) + '%';
      st.bgParticles = []; st.bgSmokeParticles = [];
    }
    var padDragging = false;
    pad.addEventListener('mousedown', function(e) { padDragging = true; updateOriginFromEvent(e); e.preventDefault(); });
    window.addEventListener('mousemove', function(e) { if (padDragging) updateOriginFromEvent(e); });
    window.addEventListener('mouseup', function() { padDragging = false; });
    container.appendChild(pad);
  }
}

// ── syncBgFxUI: push st.bgFx/st.bgColor state back into all UI controls ─────────
// Called by applyScene() so controls reflect the restored state
export function syncBgFxUI() {
  // BG color picker + swatches
  var colorPicker = document.getElementById('pick-bg-color');
  if (colorPicker) colorPicker.value = st.bgColor;
  document.querySelectorAll('.bg-swatch[data-color]').forEach(function(sw) {
    sw.classList.toggle('active', sw.dataset.color === st.bgColor);
  });
  document.querySelectorAll('.bg-swatch[data-grad]').forEach(function(sw) {
    sw.classList.toggle('active', sw.dataset.grad === st._activeGradPreset);
  });

  // BG texture buttons
  document.querySelectorAll('.tex-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tex === st.bgTexture);
  });

  // Bg effect type buttons
  document.querySelectorAll('.bgfx-btn').forEach(function(btn) {
    var t = btn.dataset.fx;
    var layer = (typeof _findBgFxLayer === 'function') ? _findBgFxLayer(t) : null;
    var isOn = layer ? !!layer.enabled : (t === st.bgFx.type);
    btn.classList.toggle('active', isOn);
    btn.classList.toggle('stack-selected', (st.bgFxSelectedType && t === st.bgFxSelectedType));
  });

    if (typeof renderBgFxStackUI === 'function') renderBgFxStackUI();

  // Show/hide bgfx controls panel and rebuild sliders
  var ctrl = document.getElementById('bgfx-controls');
  if (ctrl) {
    if (st.bgFx.type) {
      ctrl.style.display = 'block';
      buildBgFxControls();
      upgradeAllSliders();
    } else {
      ctrl.style.display = 'none';
    }
  }

  // Warp buttons — only visible when at least one bg effect is active
  var hasEffect = (st.bgFxStack && st.bgFxStack.length > 0) || !!st.bgFx.type;
  var warpSection = document.getElementById('bgfx-warp-section');
  if (warpSection) warpSection.style.display = hasEffect ? 'block' : 'none';
  document.querySelectorAll('.warp-btn[data-warp]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.warp === st.bgFx.warp);
  });
}

// Effect buttons (stacking)
document.querySelectorAll('.bgfx-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var fx = btn.dataset.fx;
    if (typeof toggleBgFxLayer === 'function') { toggleBgFxLayer(fx); return; }

    // Legacy fallback
    if (st.bgFx.type === fx) {
      st.bgFx.type = null;
      btn.classList.remove('active');
      document.getElementById('bgfx-controls').style.display = 'none';
      st.bgParticles = []; st.bgSmokeParticles = []; st.bgStarsInit = false;
      st._crystalPoints = []; st._metaBalls = [];
    } else {
      st.bgFx.type = fx;
      st.bgParticles = []; st.bgSmokeParticles = []; st.bgStarsInit = false;
      st._crystalPoints = []; st._metaBalls = [];
      st.bgFx.blend = (_getBgFxEntry(fx) || {}).blendDefault || 'source-over';
      st.bgFx.particleColor1 = null; st.bgFx.particleColor2 = null;
      st.bgFx.flowMode = 'default'; st.bgFx.flowSpread = 0.6; st.bgFx.originX = 0.5; st.bgFx.originY = 0.5;
      if (fx === 'crystal')   { st.bgFx.crystalFacets = 0.5; st.bgFx.intensity = 1.0; st.bgFx.speed = 0.3; }
      if (fx === 'metaballs') { st.bgFx.metaCount = 0.5;     st.bgFx.intensity = 1.0; st.bgFx.speed = 0.4; }
      document.querySelectorAll('.bgfx-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('bgfx-controls').style.display = 'block';
      buildBgFxControls();
      upgradeAllSliders();
    }
  });
});

// Warp buttons
document.querySelectorAll('.warp-btn[data-warp]').forEach(function(btn) {
  if (btn.style.display === 'none') return;
  btn.addEventListener('click', function() {
    st.bgFx.warp = btn.dataset.warp;
    document.querySelectorAll('.warp-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    if (st.bgFx.type) { st.bgParticles = []; st.bgSmokeParticles = []; buildBgFxControls(); upgradeAllSliders(); }
  });
});

// ── Background swatch & picker handlers ──────────────────────────────────

export function _applyGradPreset(name, targetSwatch) {
  var g = st.BG_GRADIENTS[name];
  if (!g) return;
  st._activeGradPreset = name;
  st.bgFx._gradPreset = { stops: g.stops, angle: g.angle };
  st.bgColor = g.stops[0];
  document.getElementById('pick-bg-color').value = st.bgColor;
  if (targetSwatch) {
    targetSwatch.style.background = 'linear-gradient(' + g.angle + 'deg,' + g.stops[0] + ',' + g.stops[1] + ')';
    targetSwatch.dataset.grad = name;
    targetSwatch.dataset.color = g.stops[0];
  }
  document.querySelectorAll('.bg-swatch-sm').forEach(function(s) {
    s.classList.toggle('active', s.dataset.grad === name);
  });
  markDirty();
  haptic('action');
}

(function() {
  var panel = document.getElementById('bg-picker-panel');
  var _activeSwatch = null;

  function wireSwatch(sw) {
    sw.addEventListener('click', function() {
      if (sw.dataset.color && !sw.dataset.grad) {
        st.bgColor = sw.dataset.color;
        if (st.bgFx) st.bgFx._gradPreset = null;
        st._activeGradPreset = null;
        markDirty();
      }
      openPicker(sw);
      haptic('action');
    });
  }

  function openPicker(sw) {
    document.querySelectorAll('#bg-swatches .bg-swatch').forEach(function(s) { s.classList.remove('active'); });
    sw.classList.add('active');
    _activeSwatch = sw;
    var isGrad = !!sw.dataset.grad;
    switchTab(isGrad ? 'gradient' : 'solid');
    if (!isGrad) document.getElementById('pick-bg-color').value = sw.dataset.color || '#0A0A0F';
    panel.classList.add('open');
  }

  function switchTab(tab) {
    document.querySelectorAll('.bg-picker-tabs .btn').forEach(function(t) {
      t.classList.toggle('gold', t.dataset.tab === tab);
    });
    document.getElementById('bg-tab-solid').style.display    = tab === 'solid'    ? '' : 'none';
    document.getElementById('bg-tab-gradient').style.display = tab === 'gradient' ? '' : 'none';
  }

  // Wire preset swatches
  document.querySelectorAll('#bg-swatches .bg-swatch').forEach(wireSwatch);

  // "+" add swatch
  document.getElementById('btn-add-bg-swatch').addEventListener('click', function() {
    var sw = document.createElement('div');
    sw.className = 'bg-swatch';
    sw.dataset.color = '#ffffff';
    sw.style.background = '#ffffff';
    sw.title = 'Custom';
    document.getElementById('bg-swatches').insertBefore(sw, this);
    wireSwatch(sw);
    st.bgColor = '#ffffff';
    if (st.bgFx) st.bgFx._gradPreset = null;
    st._activeGradPreset = null;
    markDirty();
    openPicker(sw);
    document.getElementById('pick-bg-color').value = '#ffffff';
    haptic('action');
  });

  // Picker tab switch
  document.querySelectorAll('.bg-picker-tabs .btn').forEach(function(t) {
    t.addEventListener('click', function() { switchTab(t.dataset.tab); });
  });

  // Solid colour (live update)
  document.getElementById('pick-bg-color').addEventListener('input', function() {
    st.bgColor = this.value;
    if (st.bgFx) st.bgFx._gradPreset = null;
    st._activeGradPreset = null;
    if (_activeSwatch) {
      _activeSwatch.style.background = this.value;
      _activeSwatch.dataset.color = this.value;
      delete _activeSwatch.dataset.grad;
    }
    markDirty();
  });

  // Gradient preset swatches inside picker
  document.querySelectorAll('.bg-swatch-sm[data-grad]').forEach(function(sw) {
    sw.addEventListener('click', function() { _applyGradPreset(sw.dataset.grad, _activeSwatch); });
  });

  // Custom gradient — live update on any change
  function applyCustomGrad() {
    var c1 = document.getElementById('pick-grad-start').value || '#0A0A0F';
    var c2 = document.getElementById('pick-grad-end').value   || '#1a1a2e';
    var angle = parseInt(document.getElementById('pick-grad-angle').value, 10) || 135;
    document.getElementById('val-grad-angle').textContent = angle + '°';
    st.bgFx._gradPreset = { stops: [c1, c2], angle: angle };
    st.bgColor = c1;
    st._activeGradPreset = null;
    document.getElementById('pick-bg-color').value = c1;
    if (_activeSwatch) {
      _activeSwatch.style.background = 'linear-gradient(' + angle + 'deg,' + c1 + ',' + c2 + ')';
      _activeSwatch.dataset.grad = 'custom';
      _activeSwatch.dataset.color = c1;
    }
    document.querySelectorAll('.bg-swatch-sm').forEach(function(s) { s.classList.remove('active'); });
    markDirty();
  }
  document.getElementById('pick-grad-start').addEventListener('input', applyCustomGrad);
  document.getElementById('pick-grad-end').addEventListener('input', applyCustomGrad);
  document.getElementById('pick-grad-angle').addEventListener('input', applyCustomGrad);


}());

// ── Texture preset buttons ────────────────────────────────────────────
document.querySelectorAll('.tex-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var tex = btn.dataset.tex;
    if (st.bgTexture === tex) {
      // Toggle off
      st.bgTexture = null;
      btn.classList.remove('active');
      document.getElementById('tex-opacity-row').style.display = 'none';
    } else {
      st.bgTexture = tex;
      document.querySelectorAll('.tex-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('tex-opacity-row').style.display = 'flex';
    }
  });
});

document.getElementById('sl-tex-opacity').addEventListener('input', function() {
  st.bgTextureOpacity = parseFloat(this.value);
  document.getElementById('val-tex-opacity').textContent = Math.round(st.bgTextureOpacity * 100) + '%';
});

document.getElementById('btn-upload-bg').addEventListener('click', function() {
  document.getElementById('file-bg').click();
});
document.getElementById('file-bg').addEventListener('change', function() {
  var file = this.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image(); img.src = e.target.result;
    st.images['__bg__'] = img;
    st.bgImage = true;
    document.getElementById('bg-opacity-row').style.display = 'flex';
    document.getElementById('btn-remove-bg').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
  this.value = '';
});

document.getElementById('bg-opacity-slider').addEventListener('input', function() {
  st.bgOpacity = parseFloat(this.value);
  document.getElementById('bg-opacity-val').textContent = Math.round(st.bgOpacity * 100) + '%';
});

document.getElementById('btn-remove-bg').addEventListener('click', function() {
  delete st.images['__bg__']; st.bgImage = null;
  document.getElementById('bg-opacity-row').style.display = 'none';
  this.style.display = 'none';
});

// ============================================================
//  LAYOUT SYSTEM
// ============================================================
export function applyLayout(type, targetCards) {
  var cW = st.canvas.width, cH = st.canvas.height;
  var cx = cW / 2, cy = cH / 2;
  var n = targetCards.length;
  if (n === 0) return;

// ─── layout functions ───────────────────────────────────
  var cW = st.canvas.width, cH = st.canvas.height;
  var cx = cW / 2, cy = cH / 2;
  var n = targetCards.length;
  if (n === 0) return;

  if (type === 'grid') {
    var sp = st.layoutParams.grid.spacing;
    var cellW = 110 * sp, cellH = 154 * sp;
    var userCols = st.layoutParams.grid.cols;
    var userRows = st.layoutParams.grid.rows;
    var cols, rows;
    if (userCols > 0 && userRows > 0) {
      cols = userCols; rows = userRows;
    } else if (userCols > 0) {
      cols = Math.min(userCols, n); rows = Math.ceil(n / cols);
    } else if (userRows > 0) {
      rows = Math.min(userRows, n); cols = Math.ceil(n / rows);
    } else {
      cols = Math.ceil(Math.sqrt(n)); rows = Math.ceil(n / cols);
    }
    var startX = cx - (cols - 1) * cellW / 2;
    var startY = cy - (rows - 1) * cellH / 2;
    targetCards.forEach(function(c, i) {
      var col = i % cols, row = Math.floor(i / cols);
      c.x = startX + col * cellW;
      c.y = startY + row * cellH;
      c.rot = 0;
    });
    // Update info label
    var info = document.getElementById('grid-info');
    if (info) info.textContent = cols + ' col' + (cols !== 1 ? 's' : '') + ' × ' + rows + ' row' + (rows !== 1 ? 's' : '') + ' — ' + n + ' card' + (n !== 1 ? 's' : '');
  } else if (type === 'fan') {
    var spread = st.layoutParams.fan.spread;
    var arc = st.layoutParams.fan.arc;
    var R = arc * cH * 0.8 + 10;
    targetCards.forEach(function(c, i) {
      var angle = n > 1 ? -spread / 2 + (spread / (n - 1)) * i : 0;
      var rad = angle * Math.PI / 180;
      c.x = cx + Math.sin(rad) * (n > 1 ? 60 : 0);
      c.y = cy + R - Math.cos(rad) * R;
      c.rot = angle;
    });
  } else if (type === 'stack') {
    var off = st.layoutParams.stack.offset;
    var scat = st.layoutParams.stack.scatter;
    targetCards.forEach(function(c, i) {
      c.x = cx + i * off + (Math.random() - 0.5) * 4;
      c.y = cy - i * off * 0.5 + (Math.random() - 0.5) * 4;
      c.rot = (Math.random() - 0.5) * scat * 2;
    });
  } else if (type === 'line') {
    var spacing2 = Math.min(130, (cW * 0.85) / Math.max(1, n));
    var startX2 = cx - (n - 1) * spacing2 / 2;
    targetCards.forEach(function(c, i) {
      c.x = startX2 + i * spacing2; c.y = cy; c.rot = 0;
    });
  }
}

export function getLayoutTargets() {
  var sel = getSelectedCards();
  return sel.length > 0 ? sel : st.cards;
}

['grid', 'fan', 'stack', 'line'].forEach(function(type) {
  document.getElementById('btn-layout-' + type).addEventListener('click', function() {
    applyLayout(type, getLayoutTargets());
    showLayoutParams(type);
  });
  var inspBtn = document.getElementById('insp-layout-' + type);
  if (inspBtn) inspBtn.addEventListener('click', function() {
    applyLayout(type, getLayoutTargets());
    showLayoutParams(type);
  });
});

export function showLayoutParams(type) {
  ['grid', 'fan', 'stack'].forEach(function(t) {
    var el = document.getElementById('layout-params-' + t);
    if (el) el.style.display = t === type ? 'block' : 'none';
  });
}

// Grid spacing
document.getElementById('sl-grid-spacing').addEventListener('input', function() {
  st.layoutParams.grid.spacing = parseFloat(this.value);
  document.getElementById('val-grid-spacing').textContent = st.layoutParams.grid.spacing.toFixed(2) + '×';
  applyLayout('grid', getLayoutTargets());
});

// Grid cols / rows
export function parseGridInput(val) {
  var v = parseInt(val);
  return (isNaN(v) || v < 1) ? 0 : v;
}
document.getElementById('inp-grid-cols').addEventListener('input', function() {
  st.layoutParams.grid.cols = parseGridInput(this.value);
  applyLayout('grid', getLayoutTargets());
});
document.getElementById('inp-grid-rows').addEventListener('input', function() {
  st.layoutParams.grid.rows = parseGridInput(this.value);
  applyLayout('grid', getLayoutTargets());
});

// Fan params
document.getElementById('sl-fan-spread').addEventListener('input', function() {
  st.layoutParams.fan.spread = parseFloat(this.value);
  document.getElementById('val-fan-spread').textContent = Math.round(st.layoutParams.fan.spread) + '°';
  applyLayout('fan', getLayoutTargets());
});
document.getElementById('sl-fan-arc').addEventListener('input', function() {
  st.layoutParams.fan.arc = parseFloat(this.value);
  document.getElementById('val-fan-arc').textContent = st.layoutParams.fan.arc.toFixed(2);
  applyLayout('fan', getLayoutTargets());
});

// Stack params
document.getElementById('sl-stack-offset').addEventListener('input', function() {
  st.layoutParams.stack.offset = parseFloat(this.value);
  document.getElementById('val-stack-offset').textContent = Math.round(st.layoutParams.stack.offset) + 'px';
  applyLayout('stack', getLayoutTargets());
});
document.getElementById('sl-stack-scatter').addEventListener('input', function() {
  st.layoutParams.stack.scatter = parseFloat(this.value);
  document.getElementById('val-stack-scatter').textContent = Math.round(st.layoutParams.stack.scatter) + '°';
  applyLayout('stack', getLayoutTargets());
});
document.getElementById('btn-reshuffle').addEventListener('click', function() {
  applyLayout('stack', getLayoutTargets());
});

// ============================================================
//  CAMERA CONTROLS
// ============================================================
document.getElementById('btn-zoom-in').addEventListener('click', function() {
  st.camZoom = Math.min(3, st.camZoom * 1.2); st.camZoomRef = st.camZoom;
});
document.getElementById('btn-undo').addEventListener('click', doUndo);
document.getElementById('btn-redo').addEventListener('click', doRedo);

document.getElementById('btn-zoom-out').addEventListener('click', function() {
  st.camZoom = Math.max(0.3, st.camZoom / 1.2); st.camZoomRef = st.camZoom;
});

document.getElementById('btn-orbit').addEventListener('click', function() {
  st.orbitMode = !st.orbitMode;
  this.classList.toggle('active', st.orbitMode);
  this.classList.toggle('amber', st.orbitMode);
  document.getElementById('orbit-badge').style.display = st.orbitMode ? 'inline-block' : 'none';
  document.getElementById('scene-orbit-hint').style.display = st.orbitMode ? 'block' : 'none';
});

document.getElementById('btn-reset-cam').addEventListener('click', function() {
  st.camOffset = { x: 0, y: 0 }; st.camZoom = 1;
  st.camOrbit = { yaw: 0, pitch: 0 };
  st.camOffsetRef = { x: 0, y: 0 }; st.camZoomRef = 1;
  st.camOrbitRef = { yaw: 0, pitch: 0 };
  st.orbitMode = false;
  document.getElementById('btn-orbit').classList.remove('active', 'amber');
  document.getElementById('orbit-badge').style.display = 'none';
  document.getElementById('scene-orbit-hint').style.display = 'none';
});

// ============================================================
//  CLEAR ALL
// ============================================================
document.getElementById('btn-clear-all').addEventListener('click', function() {
  // Clear all layers
  st.cards = []; st.selectedIds = []; st.sequences = {};
  syncRefs(); updateCardCount(); hideEmpty(); updateInspector(); renderLayers();
  // Reset background effects
  st.bgFxStack = [];
  st.bgFxSelectedType = null;
  st.bgFx.type = null;
  _resetBgFxRuntime();
  // Reset background color to default
  st.bgColor = '#0A0A0F';
  // Sync UI
  syncBgFxUI();
  var bgPick = document.getElementById('pick-bg');
  if (bgPick) bgPick.value = st.bgColor;
  clearSave();
  markDirty();
  showToast('Canvas cleared');
});

// ============================================================
//  SCENES — save / restore full effect state (up to 5 slots)
// ============================================================

// scenes[slot] = null | { name, bg, cardEffects[] }
// st.scenes is in AppState

// ── Snapshot helpers ─────────────────────────────────────────────────────


// ============================================================
//  BOOTSTRAP — runs once on load
// ============================================================
(function init() {
  // Initialize DOM canvas references on AppState
  st.canvas = document.getElementById('main-canvas');
  st.ctx = st.canvas.getContext('2d', { alpha: false });
  st.canvasWrap = document.getElementById('canvas-wrap');

  initPanelResizers();
  initInputControls();
  initPerfMode();
  initMobile();

  // Restore project from localStorage
  (function() {
    var restored = false;
    try { restored = loadProject(); } catch(_) {}
    if (restored) {
      syncRefs();
      updateCardCount();
      hideEmpty();
      updateInspector();
      renderLayers();
      renderTimeline();
      st.needsRedraw = true;
      _captureState();
      _syncUndoButtons();
      showToast('✦ Project restored');
    }
  })();

  // Initial UI state
  updateInspector();
  hideEmpty();
  renderLayers();
  renderStockGrid();
  upgradeAllSliders();
  _captureState();
  _syncUndoButtons();

  // Select All
  var btnSelectAll = document.getElementById('btn-select-all');
  if (btnSelectAll) btnSelectAll.addEventListener('click', function() {
    st.selectedIds = st.cards.filter(function(c) { return !c.locked; }).map(function(c) { return c.id; });
    syncRefs(); updateInspector(); renderLayers();
  });

  // Group layers
  var btnGroup = document.getElementById('btn-group-layers');
  if (btnGroup) btnGroup.addEventListener('click', function() {
    var sel = getSelectedCards();
    if (sel.length < 2) { showToast('Select 2 or more layers to group'); return; }
    var grp = { id: st.nextGroupId++, name: 'Group ' + (st.groups.length + 1), collapsed: false };
    st.groups.push(grp);
    sel.forEach(function(c) { c.groupId = grp.id; });
    renderLayers();
    showToast('Grouped ' + sel.length + ' layers into "' + grp.name + '"');
  });


  // UX: Slider fill track
  (function() {
    function fill(el) {
      var lo = parseFloat(el.min) || 0, hi = parseFloat(el.max) || 100, v = parseFloat(el.value) || 0;
      el.style.setProperty('--sl-pct', ((v - lo) / (hi - lo) * 100).toFixed(2) + '%');
    }
    function attachFill(el) {
      fill(el);
      el.addEventListener('input', function() { fill(el); });
    }
    document.querySelectorAll('input[type=range]').forEach(attachFill);
    var _origUpdateInspector = updateInspector;
    updateInspector = function() {
      _origUpdateInspector.apply(this, arguments);
      requestAnimationFrame(function() {
        document.querySelectorAll('input[type=range]').forEach(function(el) {
          if (!el._fillWired) { attachFill(el); el._fillWired = true; } else fill(el);
        });
      });
    };
  })();

  // UX: Toggle labels
  document.querySelectorAll('.toggle-wrap').forEach(function(wrap) {
    var toggle = wrap.querySelector('.toggle');
    var label  = wrap.querySelector('.toggle-label');
    if (toggle && label) label.addEventListener('click', function() { toggle.click(); });
  });

  // UX: Toggle keyboard
  document.querySelectorAll('.toggle').forEach(function(tog) {
    if (tog.tagName !== 'BUTTON') {
      if (!tog.hasAttribute('tabindex')) tog.setAttribute('tabindex', '0');
      tog.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog.click(); }
      });
    }
  });

  // UX: Screen reader live region
  (function() {
    var liveEl = document.createElement('div');
    liveEl.setAttribute('aria-live', 'polite');
    liveEl.setAttribute('aria-atomic', 'true');
    liveEl.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(liveEl);
    var _origUCC = updateCardCount;
    updateCardCount = function() {
      _origUCC.apply(this, arguments);
      var badge = document.getElementById('card-count-badge');
      if (badge) liveEl.textContent = badge.textContent;
    };
  })();

  // UX: Canvas cursor
  (function() {
    var cv = document.getElementById('main-canvas');
    if (!cv) return;
    function syncCursor() {
      if (st.isPanning || st.cardDragging) {
        cv.classList.remove('over-card'); cv.classList.add('is-panning');
      } else { cv.classList.remove('is-panning'); }
      requestAnimationFrame(syncCursor);
    }
    requestAnimationFrame(syncCursor);
  })();

  // UX: Inspector fade-in
  (function() {
    var panels = ['inspector-content','inspector-text','inspector-rect','inspector-empty'];
    var _prevVisible = null;
    var _origUI = updateInspector;
    updateInspector = function() {
      _origUI.apply(this, arguments);
      panels.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        var visible = el.style.display !== 'none';
        if (visible && id !== _prevVisible) {
          el.style.animation = 'none';
          requestAnimationFrame(function() { el.style.animation = ''; });
          _prevVisible = id;
        }
      });
    };
  })();

  // Start render loop
  requestAnimationFrame(renderFrame);
  console.log('[Arcana] ready');
})();
