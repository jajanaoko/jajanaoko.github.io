// ============================================================
//  ARCANA GLAM — Mobile  (mobile.js)
//  Responsive drawers, mobile nav, st.canvas touch gestures
//  (1-finger drag/pan, 2-finger pinch+zoom, card pinch),
//  showcase mode, gyroscope / device-orientation.
// ============================================================

import { AppState as st } from './state.js';
import { markDirty, haptic, showToast, syncRefs, updateCardCount, hideEmpty, updateInspector, registerAfterRenderHook, registerUpdateInspectorHook, createCard, applyLayout, focusCamera } from './app.js';
import { screenToWorld } from './canvas-engine.js';
import { cardAtPoint, selectCard, deselectAll, renderLayers } from './layers.js';
import { refreshInspectorContent } from './renderer.js';
import { PRESET_DEFAULTS, calcTotalDuration, renderTimeline } from './timeline.js';

export function initMobile() {


// ── UX: Inspector panel fade-in re-trigger on selection change ────
// Registers a hook instead of monkey-patching the imported updateInspector binding.
(function() {
  var panels = ['inspector-content','inspector-text','inspector-rect','inspector-empty'];
  var _prevVisible = null;
  registerUpdateInspectorHook(function() {
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
  });
})();


// ═══════════════════════════════════════════════════════════════
//  MOBILE RESPONSIVE — drawers, nav, touch gestures, showcase
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';
  var isMobile = function() { return window.innerWidth <= 768; };

  // ─── Elements ────────────────────────────────────────────────
  var leftPanel    = document.getElementById('left-panel');
  var rightPanel   = document.getElementById('right-panel');
  var overlay      = document.getElementById('drawer-overlay');
  var mnavLeft     = document.getElementById('mnav-left');
  var mnavCanvas   = document.getElementById('mnav-st.canvas');
  var mnavTimeline = document.getElementById('mnav-timeline');
  var mnavRight    = document.getElementById('mnav-right');
  var touchHint    = document.getElementById('touch-hint');
  var cv           = document.getElementById('main-canvas');

  // ─── Drawer state ─────────────────────────────────────────────
  var openDrawer = null;

  function closeDrawers() {
    leftPanel  && leftPanel.classList.remove('drawer-open');
    rightPanel && rightPanel.classList.remove('drawer-open');
    if (overlay) { overlay.classList.remove('visible'); overlay.style.display = 'none'; }
    mnavLeft  && mnavLeft.classList.remove('active');
    mnavRight && mnavRight.classList.remove('active');
    mnavTimeline && mnavTimeline.classList.remove('active');
    document.body.classList.remove('right-drawer-open');
    openDrawer = null;
    // Re-show pull handle if a card is still selected
    var handle = document.getElementById('inspector-pull-handle');
    if (handle && st.selectedIds && st.selectedIds.length > 0) {
      handle.style.display = 'flex';
    }
  }
  function openLeft() {
    if (!isMobile()) return;
    if (openDrawer === 'left') { closeDrawers(); return; }
    closeDrawers();
    leftPanel && leftPanel.classList.add('drawer-open');
    if (overlay) { overlay.style.display = 'block'; requestAnimationFrame(function(){ overlay.classList.add('visible'); }); }
    mnavLeft && mnavLeft.classList.add('active');
    openDrawer = 'left';
  }
  function openRight() {
    if (!isMobile()) return;
    if (openDrawer === 'right') { closeDrawers(); return; }
    closeDrawers();
    rightPanel && rightPanel.classList.add('drawer-open');
    if (overlay) { overlay.style.display = 'block'; requestAnimationFrame(function(){ overlay.classList.add('visible'); }); }
    mnavRight && mnavRight.classList.add('active');
    document.body.classList.add('right-drawer-open');
    openDrawer = 'right';
  }

  // ─── Nav buttons ──────────────────────────────────────────────
  mnavLeft   && mnavLeft.addEventListener('click', function(e){ e.stopPropagation(); openLeft(); });
  mnavCanvas && mnavCanvas.addEventListener('click', function(){
    closeDrawers();
    // Canvas tap also collapses timeline back to default
    if (typeof window._collapseTimeline === 'function') window._collapseTimeline();
    mnavTimeline && mnavTimeline.classList.remove('active');
  });

  // Timeline nav button — expands bottom panel to show controls
  mnavTimeline && mnavTimeline.addEventListener('click', function(){
    closeDrawers();
    var isExpanded = document.getElementById('bottom-panel').classList.contains('timeline-expanded');
    if (isExpanded) {
      // Already open — collapse (toggle off)
      if (typeof window._collapseTimeline === 'function') window._collapseTimeline();
      mnavTimeline.classList.remove('active');
    } else {
      if (typeof window._expandTimeline === 'function') window._expandTimeline();
      mnavTimeline.classList.add('active');
    }
  });

  mnavRight && mnavRight.addEventListener('click', function(e){ e.stopPropagation(); openRight(); });
  overlay   && overlay.addEventListener('click', closeDrawers);

  // Panel X close buttons
  var leftCloseBtn  = document.getElementById('left-panel-close');
  var rightCloseBtn = document.getElementById('right-panel-close');
  if (leftCloseBtn)  leftCloseBtn.addEventListener('click',  function(e){ e.stopPropagation(); closeDrawers(); });
  if (rightCloseBtn) rightCloseBtn.addEventListener('click', function(e){ e.stopPropagation(); closeDrawers(); });

  // Pull handle — open right drawer
  var pullHandle = document.getElementById('inspector-pull-handle');
  if (pullHandle) {
    pullHandle.addEventListener('click', function(){ openRight(); });
    pullHandle.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRight(); }
    });
  }
  window.addEventListener('resize', function(){ if (!isMobile()) closeDrawers(); });

  // ─── Edge-swipe to open drawers ───────────────────────────────
  var swipeStartX = 0, swipeStartY = 0;
  document.addEventListener('touchstart', function(e){
    if (e.touches.length !== 1) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function(e){
    if (!isMobile() || e.changedTouches.length !== 1) return;
    var dx = e.changedTouches[0].clientX - swipeStartX;
    var dy = e.changedTouches[0].clientY - swipeStartY;
    if (Math.abs(dy) > Math.abs(dx) * 1.5 || Math.abs(dx) < 50) return;
    if      (dx > 0 && swipeStartX < 30)                      openLeft();
    else if (dx < 0 && swipeStartX > window.innerWidth - 30)  openRight();
    else if (dx < 0 && openDrawer === 'left')                  closeDrawers();
    else if (dx > 0 && openDrawer === 'right')                 closeDrawers();
  }, { passive: true });

  // ═══════════════════════════════════════════════════════════════
  //  CANVAS TOUCH GESTURES
  //
  //  1 finger  →  card drag (if hit) OR camera pan (if empty)
  //  2 fingers →  pinch zoom (pivot = midpoint) + simultaneous pan
  //
  //  Directly mutates the same variables the mouse handlers use:
  //    st.camZoom, st.camZoomRef, st.camOffset, st.camOffsetRef
  //    st.cardDragGroup[].card.x/y  (absolute, from fixed origin)
  //    st.cardDragStartClientX/Y, st.cardDragging
  // ═══════════════════════════════════════════════════════════════
  if (!cv) return;

  // Touch hint
  var hintShown = false;
  function showHint(msg) {
    if (!touchHint) return;
    touchHint.textContent = msg;
    touchHint.classList.add('show');
    clearTimeout(touchHint._t);
    touchHint._t = setTimeout(function(){ touchHint.classList.remove('show'); }, 2200);
  }

  // State machine
  // mode: 'idle' | 'cardDrag' | 'pan' | 'pinch' | 'cardPinch'
  var mode = 'idle';

  // 1-finger pan
  var panPrevX = 0, panPrevY = 0;

  // card drag — we own the origin; card positions updated directly
  var touchDragCards  = [];   // [{card, startX, startY}]
  var touchDragOriginX = 0;   // client coords at drag start
  var touchDragOriginY = 0;

  // Double-tap detection on canvas cards
  var _dblTapCardId = null, _dblTapT = 0;

  // 2-finger pinch (camera)
  var pinchId1 = -1, pinchId2 = -1;
  var pinchPrevDist = 0;

  // 2-finger card pinch (scale selected card)
  var cardPinchStartDist  = 0;
  var cardPinchStartScale = 1;
  var cardPinchTargetId   = null;
  var pinchPrevMidX = 0, pinchPrevMidY = 0;

  // ── helpers ───────────────────────────────────────────────────
  function getTouch(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }
  function dist2(a, b) {
    var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  // Zoom around a screen pivot, keeping the world point under pivot fixed.
  // Uses the same variables as the app's wheel handler.
  function applyZoom(newZoom, pivotClientX, pivotClientY) {
    var rect = cv.getBoundingClientRect();
    var cssW = rect.width, cssH = rect.height;
    var cz   = st.camZoom;
    // World point currently under pivot
    var wpx = (pivotClientX - rect.left - cssW/2) / cz - st.camOffset.x;
    var wpy = (pivotClientY - rect.top  - cssH/2) / cz - st.camOffset.y;
    // Clamp
    st.camZoom = Math.max(0.15, Math.min(5, newZoom));
    st.camZoomRef = st.camZoom;
    // Reposition offset so same world point stays under pivot
    st.camOffset.x   = (pivotClientX - rect.left - cssW/2) / st.camZoom - wpx;
    st.camOffset.y   = (pivotClientY - rect.top  - cssH/2) / st.camZoom - wpy;
    st.camOffsetRef.x = st.camOffset.x;
    st.camOffsetRef.y = st.camOffset.y;
    markDirty();
  }

  // Pan camera by screen-space pixels
  function applyPan(dxScreen, dyScreen) {
    st.camOffset.x    += dxScreen / st.camZoom;
    st.camOffset.y    += dyScreen / st.camZoom;
    st.camOffsetRef.x  = st.camOffset.x;
    st.camOffsetRef.y  = st.camOffset.y;
    markDirty();
  }

  // ── touchstart ───────────────────────────────────────────────
  cv.addEventListener('touchstart', function(e) {
    if (e.cancelable) e.preventDefault();

    // ── Two fingers: card-pinch (if card selected) or camera-pinch ──
    if (e.touches.length >= 2) {
      // Abort any card drag gracefully
      if (mode === 'cardDrag') {
        st.cardDragging = false;
        st.cardDragGroup = [];
        touchDragCards = [];
      }
      var ta = e.touches[0], tb = e.touches[1];
      pinchId1 = ta.identifier;
      pinchId2 = tb.identifier;
      pinchPrevDist = dist2(ta, tb);
      pinchPrevMidX = (ta.clientX + tb.clientX) / 2;
      pinchPrevMidY = (ta.clientY + tb.clientY) / 2;

      // If exactly one card is selected, scale it instead of the camera
      if (st.selectedIds.length === 1) {
        var selCard = st.cards.find(function(c){ return c.id === st.selectedIds[0]; });
        if (selCard && !selCard.locked) {
          mode = 'cardPinch';
          cardPinchStartDist  = dist2(ta, tb);
          cardPinchStartScale = selCard.scale != null ? selCard.scale : 1;
          cardPinchTargetId   = selCard.id;
          haptic('select');
          if (!hintShown) { hintShown = true; showHint('Pinch to resize card  •  2 fingers with no card = zoom'); }
          return;
        }
      }

      mode = 'pinch';
      if (!hintShown) { hintShown = true; showHint('Pinch to zoom  •  2 fingers to pan'); }
      return;
    }

    // ── One finger ────────────────────────────────────────────
    if (e.touches.length === 1 && mode === 'idle') {
      var t = e.touches[0];

      // Hit test
      var world = screenToWorld(t.clientX, t.clientY);
      var hit   = cardAtPoint(world.x, world.y);

      // In showcase mode: touches drive tilt only — no drag, no pan, no select
      if (document.body.classList.contains('showcase-mode')) return;

      if (hit) {
        // Select card
        selectCard(hit.id, false);

        // Double-tap: custom card → open builder; stock card → focus camera
        var _now = Date.now();
        if (_dblTapCardId === hit.id && _now - _dblTapT < 400) {
          _dblTapCardId = null; _dblTapT = 0;
          var _card = st.cards.find(function(c){ return c.id === hit.id; });
          if (_card && _card.kind === 'custom') {
            _card.finalized = false;
            refreshInspectorContent();
            openRight();
          } else {
            focusCamera(_card);
          }
          return;
        }
        _dblTapCardId = hit.id; _dblTapT = _now;

        // Build drag group identical to startCardDrag() but stored locally
        mode = 'cardDrag';
        touchDragOriginX = t.clientX;
        touchDragOriginY = t.clientY;
        var dragIds = (st.selectedIds.indexOf(hit.id) >= 0) ? st.selectedIds : [hit.id];
        touchDragCards = st.cards
          .filter(function(c){ return dragIds.indexOf(c.id) >= 0; })
          .map(function(c){   return { card: c, startX: c.x, startY: c.y }; });

        // Also set the global st.cardDragging flag so the render loop knows
        st.cardDragging = true;
        st.cardDragStartClientX = t.clientX;
        st.cardDragStartClientY = t.clientY;
        // Sync st.cardDragGroup so any residual mouse code stays coherent
        st.cardDragGroup = touchDragCards.slice();
      } else {
        // No card: camera pan
        deselectAll();
        mode = 'pan';
        panPrevX = t.clientX;
        panPrevY = t.clientY;
      }
    }
  }, { passive: false });

  // ── touchmove ────────────────────────────────────────────────
  cv.addEventListener('touchmove', function(e) {
    if (e.cancelable) e.preventDefault();

    // ── PINCH + 2-finger pan ──────────────────────────────────
    // ── CARD PINCH: scale selected card ───────────────────────
    if (mode === 'cardPinch') {
      var ta = getTouch(e.touches, pinchId1) || e.touches[0];
      var tb = getTouch(e.touches, pinchId2) || e.touches[1];
      if (!ta || !tb) return;
      var d = dist2(ta, tb);
      if (cardPinchStartDist > 1 && cardPinchTargetId !== null) {
        var rawScale = cardPinchStartScale * (d / cardPinchStartDist);
        // Clamp to reasonable range
        var newScale = Math.max(0.15, Math.min(4.0, rawScale));
        var target = st.cards.find(function(c){ return c.id === cardPinchTargetId; });
        if (target) {
          target.scale = newScale;
          st.needsRedraw = true;
        }
      }
      return;
    }

    if (mode === 'pinch') {
      var ta = getTouch(e.touches, pinchId1) || e.touches[0];
      var tb = getTouch(e.touches, pinchId2) || e.touches[1];
      if (!ta || !tb) return;

      var d    = dist2(ta, tb);
      var midX = (ta.clientX + tb.clientX) / 2;
      var midY = (ta.clientY + tb.clientY) / 2;

      // Pan first (before zoom, so pivot is correct)
      var dMx = midX - pinchPrevMidX;
      var dMy = midY - pinchPrevMidY;
      if (Math.abs(dMx) > 0.01 || Math.abs(dMy) > 0.01) {
        applyPan(dMx, dMy);
      }

      // Zoom: ratio of current distance to previous distance (incremental)
      if (pinchPrevDist > 1) {
        var ratio = d / pinchPrevDist;
        // Smooth the ratio slightly to reduce jumpiness
        ratio = 1 + (ratio - 1) * 0.85;
        applyZoom(st.camZoom * ratio, midX, midY);
      }

      pinchPrevDist = d;
      pinchPrevMidX = midX;
      pinchPrevMidY = midY;
      return;
    }

    // ── CARD DRAG ─────────────────────────────────────────────
    if (mode === 'cardDrag') {
      var t = e.touches[0];
      if (!t || touchDragCards.length === 0) return;
      // Same formula as the app's window mousemove handler:
      //   card.x = entry.startX + (clientX - originX) / st.camZoom
      var dx = (t.clientX - touchDragOriginX) / st.camZoom;
      var dy = (t.clientY - touchDragOriginY) / st.camZoom;
      touchDragCards.forEach(function(entry){
        entry.card.x = entry.startX + dx;
        entry.card.y = entry.startY + dy;
      });
      markDirty();
      return;
    }

    // ── 1-FINGER PAN ─────────────────────────────────────────
    if (mode === 'pan') {
      var t = e.touches[0];
      if (!t) return;
      applyPan(t.clientX - panPrevX, t.clientY - panPrevY);
      panPrevX = t.clientX;
      panPrevY = t.clientY;
      return;
    }
  }, { passive: false });

  // ── touchend / touchcancel ────────────────────────────────────
  function onTouchEnd(e) {
    var n = e.touches.length;

    if (n === 0) {
      if (mode === 'cardDrag') {
        st.cardDragging  = false;
        st.cardDragGroup = [];
        touchDragCards = [];
        haptic('drop');
        markDirty();
      }
      if (mode === 'cardPinch') {
        // Commit the new scale into undo history
        cardPinchTargetId = null;
        markDirty();
      }
      mode = 'idle';
      pinchId1 = pinchId2 = -1;
    } else if (n === 1 && mode === 'pinch') {
      // One finger lifted during pinch → switch to 1-finger pan
      var t = e.touches[0];
      pinchId1 = t.identifier;
      pinchId2 = -1;
      mode = 'pan';
      panPrevX = t.clientX;
      panPrevY = t.clientY;
    }
  }
  cv.addEventListener('touchend',    onTouchEnd, { passive: true });
  cv.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // ─── Showcase mode ────────────────────────────────────────────
  function centerCameraOnShowcase() {
    // Fit all visible cards in view using the shared animated camera helper
    var targets = st.cards.filter(function(c) { return !c.hidden; });
    if (targets.length === 0) return;
    focusCamera(targets);
  }

  function enterShowcaseMode() {
    closeDrawers();
    deselectAll();
    document.body.classList.add('showcase-mode');
    // Defer camera centering so the CSS layout (panel collapse, canvas resize)
    // has time to settle before we read canvas.clientWidth/Height.
    setTimeout(centerCameraOnShowcase, 160);
    window._tryStartGyro && window._tryStartGyro();
  }

  function exitShowcaseMode() {
    document.body.classList.remove('showcase-mode');
    document.body.classList.remove('gyro-awaiting-permission');
    window._deactivateGyro && window._deactivateGyro();
  }


  // If showcase/view mode is entered from any other code path, start gyro too.
  var _showcaseModeWasActive = document.body.classList.contains('showcase-mode');
  var showcaseModeObserver = new MutationObserver(function(){
    var isActive = document.body.classList.contains('showcase-mode');
    if (isActive === _showcaseModeWasActive) return;
    _showcaseModeWasActive = isActive;
    if (isActive) {
      closeDrawers();
      window._tryStartGyro && window._tryStartGyro();
    } else {
      document.body.classList.remove('gyro-awaiting-permission');
      window._deactivateGyro && window._deactivateGyro();
    }
  });
  showcaseModeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Showcase exit is button-only on mobile.
  // Double-tap exit was causing accidental exits during taps, drags, and permission flows.

  // ─── Inspector pull handle: show when card selected ─────────────
  // ── Inspect button: follows selected card on st.canvas ─────────────────────
  function _positionInspectHandle() {
    var handle = document.getElementById('inspector-pull-handle');
    if (!handle || !isMobile()) return;
    var hasSelection = st.selectedIds && st.selectedIds.length > 0;
    if (!hasSelection || openDrawer === 'right' || document.body.classList.contains('showcase-mode')) {
      handle.style.display = 'none';
      return;
    }
    // Fixed bottom-centre of the canvas element — 16px above canvas bottom edge
    var cvRect = st.canvas.getBoundingClientRect();
    handle.style.left = (cvRect.left + cvRect.width / 2) + 'px';
    handle.style.top  = (cvRect.bottom - 56) + 'px';
    handle.style.display = 'flex';
  }

  // Position inspect handle after updateInspector runs
  registerUpdateInspectorHook(_positionInspectHandle);

  // Reposition on every render frame so handle tracks dragged cards
  var _lastPosT = 0;
  registerAfterRenderHook(function(t) {
    if (isMobile() && st.selectedIds.length > 0 && openDrawer !== 'right') {
      if (!_lastPosT || t - _lastPosT > 32) { // ~30fps throttle
        _positionInspectHandle();
        _lastPosT = t;
      }
    }
  });


  // ============================================================
  //  STARTER TEMPLATES
  // ============================================================
  var COMBO_DEFS = {
    'Deal → Float':   [['Deal',  {}], ['Float', {}]],
    'Play → Tap':     [['Play',  {}], ['Tap',   {}]],
    'Pop → Orbit':    [['Pop',   {}], ['Orbit', {}]],
    'Ignite → Float': [['Ignite',{}], ['Float', {}]],
    'Flip → Float':   [['Flip',  {}], ['Float', {}]],
    'Deal → Orbit':   [['Deal',  {}], ['Orbit', {}]]
  };

  function applyComboToCard(cardId, presets) {
    st.sequences[cardId] = presets.map(function(pair) {
      var name = pair[0];
      var overrides = pair[1];
      var def = PRESET_DEFAULTS[name];
      return {
        id: 'step' + Date.now() + Math.random(),
        name: name,
        duration: overrides.duration || def.duration,
        easing:   overrides.easing   || def.easing,
        params:   Object.assign({}, def.params, overrides.params || {})
      };
    });
    calcTotalDuration();
    renderTimeline();
    markDirty();
  }

  function buildGlowCard(card, color) {
    // Glow intentionally left OFF — user can enable per-card in inspector
    card.glare   = { on: true, intensity: 1 };
    card.shimmer = { on: true, opacity: 0.18, width: 0.22, speed: 0.8, bands: 2 };
  }

  var TEMPLATES = {
    duel: function() {
      // Two st.cards facing off, each with a Deal-in + Tap animation
      var cx = st.canvas.clientWidth / 2, cy = st.canvas.clientHeight / 2;
      var c1 = createCard(null); c1.x = cx - 90; c1.y = cy; c1.rot = -5; c1.scale = 1;
      var c2 = createCard(null); c2.x = cx + 90; c2.y = cy; c2.rot = 5;  c2.scale = 1;
      buildGlowCard(c1, '#C9A84C'); buildGlowCard(c2, '#7a6fff');
      applyComboToCard(String(c1.id), [['Deal', {params:{direction:'left'}}], ['Tap', {}]]);
      applyComboToCard(String(c2.id), [['Deal', {params:{direction:'right'}}], ['Tap', {}]]);
      st.selectedIds = [c1.id, c2.id];
    },
    tarot: function() {
      // Single centred card, large, with float + shimmer
      var cx = st.canvas.clientWidth / 2, cy = st.canvas.clientHeight / 2;
      var c = createCard(null); c.x = cx; c.y = cy; c.rot = 0; c.scale = 1.3;
      buildGlowCard(c, '#b07fff');
      c.holo = { on: true };
      applyComboToCard(String(c.id), [['Pop', {}], ['Float', {params:{rise:28, sway:8, tilt:3}}]]);
      st.selectedIds = [c.id];
    },
    showcase: function() {
      // 3 st.cards in a fan with Orbit animation — perfect for the gyro showcase mode
      var cx = st.canvas.clientWidth / 2, cy = st.canvas.clientHeight / 2;
      var fan = [-22, 0, 22];
      var created = fan.map(function(rot, i) {
        var c = createCard(null);
        c.x = cx + Math.sin(rot * Math.PI/180) * 80;
        c.y = cy + 20;
        c.rot = rot; c.scale = i === 1 ? 1.1 : 0.9;
        buildGlowCard(c, ['#C9A84C','#7a6fff','#4caaC9'][i]);
        return c;
      });
      created.forEach(function(c, i) {
        applyComboToCard(String(c.id), [
          ['Deal', {params:{direction:'top', distance:0.5}}],
          ['Orbit', {params:{radius:60, tiltAngle:18, orbitOffset: i * 0.33}}]
        ]);
      });
      st.selectedIds = created.map(function(c){ return c.id; });
    },
    fan: function() {
      // 5-card hand fan with staggered Deal animations
      var n = 5;
      var created = [];
      for (var i = 0; i < n; i++) { created.push(createCard(null)); }
      applyLayout('fan', created);
      created.forEach(function(c, i) {
        buildGlowCard(c, '#C9A84C');
        applyComboToCard(String(c.id), [
          ['Deal', {duration: 600 + i * 80, params:{direction:'bottom', distance:0.6, spinIn: (i - 2) * 3}}],
          ['Float', {params:{rise:14, sway:5, tilt:1.5}}]
        ]);
      });
      st.selectedIds = created.map(function(c){ return c.id; });
    }
  };

  function runTemplate(name) {
    var fn = TEMPLATES[name];
    if (!fn) return;
    fn();
    syncRefs(); updateCardCount(); hideEmpty(); renderLayers();
    if (typeof renderTimeline === 'function') renderTimeline();
    markDirty();
    showToast('✦ Template loaded — add images to bring it to life');
    // inspector not auto-opened — user taps the Inspect button
  }

  // Wire template buttons
  document.querySelectorAll('.es-tpl').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      runTemplate(btn.dataset.tpl);
    });
  });

  // ── Empty-state shortcut buttons ─────────────────────────────────
  var esBtnAdd = document.getElementById('es-btn-add');
  var esBtnUpload = document.getElementById('es-btn-upload');
  if (esBtnAdd) {
    esBtnAdd.addEventListener('click', function(e) {
      e.stopPropagation();
      var c = createCard(null);
      st.selectedIds = [c.id]; syncRefs(); updateInspector(); renderLayers(); markDirty();
      // inspector not auto-opened — user taps the Inspect button
    });
  }
  if (esBtnUpload) {
    esBtnUpload.addEventListener('click', function(e) {
      e.stopPropagation();
      document.getElementById('file-upload').click();
    });
  }

  // ── Wire static combo-strip buttons (HTML already in DOM) ──────────────
  document.querySelectorAll('.tl-combo-btn').forEach(function(btn) {
    var comboName = btn.dataset.combo;
    btn.addEventListener('click', function() {
      var targets = st.selectedIds.length ? st.selectedIds : st.cards.map(function(c){ return c.id; });
      if (!targets.length) { showToast('Add a card first'); return; }
      targets.forEach(function(id) { applyComboToCard(String(id), COMBO_DEFS[comboName]); });
      showToast('✦ ' + comboName + ' applied');
      haptic('action');
    });
  });

  // ── Showcase tilt: touch-drag primary, real sensor enhancement on HTTPS ──
  (function(){
    window._gyroActive = false;
    window._gyroTiltX  = 0;
    window._gyroTiltY  = 0;
    window._gyroDepth  = 0;

    var localCanvasWrap = document.getElementById('canvas-wrap');
    var allowBtn   = document.getElementById('gyro-allow-btn');
    var skipBtn    = document.getElementById('gyro-skip-btn');

    // Normalised target: -1..1 on each axis
    var _targetX = 0, _targetY = 0, _targetZ = 0.18;
    var _smoothX = 0, _smoothY = 0, _smoothZ = 0.18;
    var _rafId   = null;
    var _tiltStrength = 24;
    var _tiltReturnMs = 900;
    var _baseDepth = 0.18;
    var _touchKickTimer = null;

    // Spring physics — velocity per axis
    var _velX = 0, _velY = 0, _velZ = 0;
    // Spring constants: stiffness controls how quickly position chases target;
    // damping < 1 allows a small natural overshoot that settles organically.
    var _stiffness = 0.06;   // slow, heavy response
    var _dampingXY = 0.88;   // high damping — barely overshoots
    var _stiffnessZ = 0.07;
    var _dampingZ   = 0.88;

    // Micro-wobble — slow organic drift when card is near neutral
    var _wobbleT = 0;

    // Single animation loop — spring physics toward target, writes globals + CSS
    function tick() {
      _rafId = null;
      if (!window._gyroActive) return;

      // ── Target decay — drifts back to neutral when phone/mouse is still ───
      // Suppressed for real sensor: the calibrated relative-tilt target already
      // returns to 0 when the phone returns to its resting angle.
      // Kept for mouse/touch-drag: returns card to center when input stops.
      if (!_dragActive && !_usingSensor) {
        _targetX *= 0.96;
        _targetY *= 0.96;
      }

      // ── Spring physics (X / Y) ──────────────────────────────────────────
      _velX += (_targetX - _smoothX) * _stiffness;
      _velY += (_targetY - _smoothY) * _stiffness;
      _velX *= _dampingXY;
      _velY *= _dampingXY;
      _smoothX += _velX;
      _smoothY += _velY;

      // ── Spring physics (Z / depth) ──────────────────────────────────────
      _velZ += (_targetZ - _smoothZ) * _stiffnessZ;
      _velZ *= _dampingZ;
      _smoothZ += _velZ;

      // ── Micro-wobble — breathing idle motion ────────────────────────────
      // Strength fades out as the card tilts away from neutral, so intentional
      // tilts feel clean while a resting card feels alive.
      _wobbleT += 0.018;
      var _mag = Math.sqrt(_smoothX * _smoothX + _smoothY * _smoothY);
      var _wStr = Math.max(0, 1 - _mag * 5.5) * 0.010;
      var wX = Math.sin(_wobbleT * 0.71 + 1.30) * _wStr;
      var wY = Math.cos(_wobbleT * 0.53 + 0.83) * _wStr;

      // ── Export tilt velocity so renderer can react to fast motion ───────
      window._gyroVelocity = Math.sqrt(_velX * _velX + _velY * _velY);

      window._gyroTiltX = (_smoothX + wX) * _tiltStrength;
      window._gyroTiltY = (_smoothY + wY) * _tiltStrength;
      window._gyroDepth = _smoothZ;

      // Keep the background fixed in showcase/view mode.
      // Motion should only influence the card rendering, not the whole st.canvas wrapper.
      if (st.canvasWrap) {
        st.canvasWrap.style.transform = '';
      }

      markDirty();

      // Keep ticking while spring is unsettled OR wobble is active (near neutral)
      var settled = Math.abs(_velX) < 0.0003 && Math.abs(_velY) < 0.0003 &&
                    Math.abs(_velZ) < 0.0003 &&
                    Math.abs(_targetX - _smoothX) < 0.0005 &&
                    Math.abs(_targetY - _smoothY) < 0.0005 &&
                    Math.abs(_targetZ - _smoothZ) < 0.0005;
      if (!settled || _wStr > 0.001) {
        _rafId = requestAnimationFrame(tick);
      }
    }

    function scheduleTick() {
      if (!_rafId) _rafId = requestAnimationFrame(tick);
    }

    function setTarget(nx, ny, nz) {
      _targetX = Math.max(-1, Math.min(1, nx));
      _targetY = Math.max(-1, Math.min(1, ny));
      if (nz == null) nz = _baseDepth;
      _targetZ = Math.max(-0.9, Math.min(0.65, nz));
      scheduleTick();
    }

    function kickAwayFromPoint(clientX, clientY, strength) {
      strength = strength == null ? 0.95 : strength;
      var nx = ((clientX / window.innerWidth) * 2 - 1);
      var ny = ((clientY / window.innerHeight) * 2 - 1);
      // Move card away from the finger in X/Y and push it deeper on Z.
      // Taps near the center punch the card farther into the scene.
      var dist = Math.min(1, Math.sqrt(nx * nx + ny * ny));
      var pushZ = -0.72 + dist * 0.22;
      setTarget(-nx * strength, -ny * strength, pushZ);
      if (_touchKickTimer) clearTimeout(_touchKickTimer);
      _touchKickTimer = setTimeout(function(){
        if (window._gyroActive && !_dragActive) setTarget(0, 0, _baseDepth);
      }, _tiltReturnMs);
    }

    // ── Touch drag (works everywhere, file://, http://, https://) ─────────
    var _dragActive = false, _dragStartX = 0, _dragStartY = 0;
    var _dragBaseX  = 0, _dragBaseY  = 0;

    function onTouchStart(e) {
      if (!window._gyroActive) return;
      if (e.touches.length !== 1) { _dragActive = false; return; } // 2-finger = camera move, not tilt
      _dragActive = true;
      _dragStartX = e.touches[0].clientX;
      _dragStartY = e.touches[0].clientY;
      _dragBaseX  = _targetX;
      _dragBaseY  = _targetY;
      kickAwayFromPoint(_dragStartX, _dragStartY, 1.05);
    }

    function onTouchMove(e) {
      if (!window._gyroActive || !_dragActive || e.touches.length !== 1) return;
      var dx = (e.touches[0].clientX - _dragStartX) / (window.innerWidth  * 0.22);
      var dy = (e.touches[0].clientY - _dragStartY) / (window.innerHeight * 0.22);
      var nx = _dragBaseX + dx;
      var ny = _dragBaseY + dy;
      var mag = Math.min(1, Math.sqrt(nx * nx + ny * ny));
      var nz = _baseDepth + mag * 0.22;
      setTarget(nx, ny, nz);
    }

    function onTouchEnd() {
      if (!_dragActive) return;
      _dragActive = false;
      if (_touchKickTimer) clearTimeout(_touchKickTimer);
      _touchKickTimer = setTimeout(function(){ if (window._gyroActive) setTarget(0, 0, _baseDepth); }, _tiltReturnMs);
    }

    // ── Mouse (desktop) ───────────────────────────────────────────────────
    function onMouseMove(e) {
      if (!window._gyroActive) return;
      setTarget(
        (e.clientX / window.innerWidth)  * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1
      );
    }

    // ── Real sensor (only fires meaningful data on HTTPS) ─────────────────
    // Uses angular velocity (delta per frame) rather than absolute offset so
    // the card only reacts to phone movement, not its resting orientation.
    // Picking up from a table or holding at any angle causes no drift.
    var _sensorZeroCount = 0;
    var _rawG = 0, _rawB = 0, _prevRawG = 0, _prevRawB = 0;
    var _rawInitDone = false;
    // Calibrated resting orientation — snaps to device angle on first reading,
    // then recalibrates when the device has been held still long enough.
    var _calGamma = 0, _calBeta = 0;
    // Counts consecutive near-still orientation events for recalibration trigger.
    var _stillFrames = 0;
    // True once a real sensor event has been received (vs. mouse-only desktop).
    // Used to suppress target decay in tick() — absolute relative targeting
    // already returns card to center when phone returns to resting position.
    var _usingSensor = false;

    function onDeviceOrientation(e) {
      var g = e.gamma, b = e.beta;
      if (!Number.isFinite(g) || !Number.isFinite(b)) return;
      if (g === 0 && b === 0) {
        _sensorZeroCount++;
        if (_sensorZeroCount >= 10) return; // sustained zeros = blocked sensor
        return;
      }
      _sensorZeroCount = 0;

      // First reading — snap raw state AND calibration to current orientation.
      // This means the card starts centered regardless of device angle.
      if (!_rawInitDone) {
        _rawG = g; _rawB = b;
        _prevRawG = g; _prevRawB = b;
        _calGamma = g; _calBeta = b;
        _rawInitDone = true;
        _usingSensor = true;
        return;
      }

      // Low-pass filter to reduce sensor noise
      _rawG += (g - _rawG) * 0.25;
      _rawB += (b - _rawB) * 0.25;

      // Angular velocity: change since last event, clamped to ±5°
      var dg = Math.max(-5, Math.min(5, _rawG - _prevRawG));
      var db = Math.max(-5, Math.min(5, _rawB - _prevRawB));
      _prevRawG = _rawG;
      _prevRawB = _rawB;

      // ── Stillness-based recalibration ─────────────────────────────────────
      // Count consecutive near-still events (~50 Hz → 75 frames ≈ 1.5 s).
      // Below threshold: tiny background drift keeps things from freezing.
      // Above threshold: fast convergence so the card returns to center quickly
      // (~1 s) after the user settles into a new holding position.
      var nearStill = Math.abs(dg) < 0.8 && Math.abs(db) < 0.8;
      if (nearStill) {
        _stillFrames = Math.min(_stillFrames + 1, 300);
      } else {
        _stillFrames = 0;
      }
      var calAlpha = nearStill ? (_stillFrames >= 75 ? 0.08 : 0.003) : 0;
      if (calAlpha > 0) {
        _calGamma += (_rawG - _calGamma) * calAlpha;
        _calBeta  += (_rawB - _calBeta)  * calAlpha;
      }

      // ── Relative tilt from calibrated resting position → card target ──────
      // ±45° from rest maps to full card deflection (-1..1).
      // This is absolute (not delta), so the card holds its position while the
      // phone is still and returns to center when returned to resting angle.
      var relG = Math.max(-45, Math.min(45, _rawG - _calGamma));
      var relB = Math.max(-45, Math.min(45, _rawB - _calBeta));
      setTarget(relG / 45, -relB / 45, null);

      // Export deltas for showcase-3d.js acceleration impulse — only when moving
      if (Math.abs(dg) >= 0.2 || Math.abs(db) >= 0.2) {
        window._gyroDeltaGamma = dg;
        window._gyroDeltaBeta  = db;
      }
    }

    function onDeviceMotion(e) {
      var acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc) return;
      var ax = acc.x || 0;
      var ay = acc.y || 0;
      window._gyroAccelX   = ax;
      window._gyroAccelY   = ay;
      window._gyroAccelMag = Math.sqrt(ax * ax + ay * ay);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────
    function activate() {
      if (window._gyroActive) return;
      _targetX = 0; _targetY = 0; _targetZ = _baseDepth;
      _smoothX = 0; _smoothY = 0; _smoothZ = _baseDepth;
      _velX = 0; _velY = 0; _velZ = 0; _wobbleT = 0;
      _sensorZeroCount = 0;
      _rawInitDone = false;
      _calGamma = 0; _calBeta = 0; _stillFrames = 0; _usingSensor = false;
      window._gyroActive = true;
      if (st.canvasWrap) st.canvasWrap.dataset.gyro = '1';
      // Attach all inputs — whichever provides data wins
      window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
      window.addEventListener('devicemotion',      onDeviceMotion,      { passive: true });
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      var cv = document.getElementById('main-canvas');
      if (cv) {
        cv.addEventListener('touchstart', onTouchStart, { passive: true });
        cv.addEventListener('touchmove',  onTouchMove,  { passive: true });
        cv.addEventListener('touchend',   onTouchEnd,   { passive: true });
      }
      scheduleTick();
    }

    function deactivate() {
      if (!window._gyroActive) return;
      window._gyroActive = false;
      window._gyroTiltX    = 0;
      window._gyroTiltY    = 0;
      window._gyroDeltaGamma = 0;
      window._gyroDeltaBeta  = 0;
      window._gyroAccelX   = 0;
      window._gyroAccelY   = 0;
      window._gyroAccelMag = 0;
      _calGamma = 0; _calBeta = 0; _stillFrames = 0; _usingSensor = false;
      _targetX = 0; _targetY = 0; _targetZ = _baseDepth;
      _smoothX = 0; _smoothY = 0; _smoothZ = _baseDepth;
      _velX = 0; _velY = 0; _velZ = 0;
      window._gyroVelocity = 0;
      if (_touchKickTimer) { clearTimeout(_touchKickTimer); _touchKickTimer = null; }
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      if (st.canvasWrap) { st.canvasWrap.dataset.gyro = '0'; st.canvasWrap.style.transform = ''; }
      window.removeEventListener('deviceorientation', onDeviceOrientation);
      window.removeEventListener('devicemotion',      onDeviceMotion);
      window.removeEventListener('mousemove', onMouseMove);
      var cv = document.getElementById('main-canvas');
      if (cv) {
        cv.removeEventListener('touchstart', onTouchStart);
        cv.removeEventListener('touchmove',  onTouchMove);
        cv.removeEventListener('touchend',   onTouchEnd);
      }
      markDirty();
    }

    function tryStart() {
      if (!document.body.classList.contains('showcase-mode')) return;
      // iOS needs explicit permission prompt
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        document.body.classList.add('gyro-awaiting-permission');
      } else {
        activate(); // Android / desktop: start immediately
      }
    }

    window._tryStartGyro   = tryStart;
    window._deactivateGyro = deactivate;
    window._activateGyro   = activate;

    // iOS permission buttons
    allowBtn && allowBtn.addEventListener('click', function() {
      document.body.classList.remove('gyro-awaiting-permission');
      DeviceOrientationEvent.requestPermission()
        .then(function(s){ if (s === 'granted') activate(); else activate(); })
        .catch(function(){ activate(); }); // activate touch fallback regardless
    });
    skipBtn && skipBtn.addEventListener('click', function() {
      document.body.classList.remove('gyro-awaiting-permission');
      activate(); // still activate touch drag on skip
    });

  })();


  console.log('[Arcana Mobile] ready — 1-finger: drag card / pan | 2-finger: pinch+pan | edge swipe: drawers');
})();


} // end initMobile
