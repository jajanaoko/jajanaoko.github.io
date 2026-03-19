// ============================================================
//  ARCANA GLAM — Renderer  (renderer.js)
//  drawCard, drawTextObj, drawRectObj, drawResizeHandles,
//  drawGlobalLighting, updateInspector, inspector panels.
// ============================================================

import { AppState as st } from './state.js';
import { markDirty, showToast, syncRefs, updateCardCount, hideEmpty, updateInspector,
         createCard, createText, createRect, createCustomCard } from './app.js';
import { BORDER_PRESETS, resolveBorder } from './border-presets.js';
import { hexToRgbArr, tickAndDrawParticles, drawNeuralWebAura,
         roundRectPath, drawParticleShape, clearParticlePool,
         getSpellPreset, ensurePool, lerp, SPELL_PRESETS } from './fx-engine.js';

function getOrInitShadow(c) {
  if (!c.shadow) c.shadow = { on: false, color: '#000000', opacity: 0.5, blur: 12, offsetX: 4, offsetY: 6 };
  return c.shadow;
}
import { getActiveStep, applyPreset, calcTotalDuration,
         renderTimeline, makeSliderRow, makeStepSlider, upgradeAllSliders } from './timeline.js';
import { renderLayers, selectCard, deselectAll, getSelectedCards } from './layers.js';

export function drawGlobalLighting(tctx, W, H) {
  if (!st.globalLight.on || (st.globalLight.intensity || 0) <= 0.001) return;

  var rgb = hexToRgbArr(st.globalLight.color || '#ffffff').join(',');
  var lx = (st.globalLight.x != null ? st.globalLight.x : 0.5) * W;
  var ly = (st.globalLight.y != null ? st.globalLight.y : 0.35) * H;
  var rad = Math.max(40, Math.min(W, H) * (st.globalLight.radius || 0.55) * 2.0);
  var inten = Math.max(0, Math.min(1, st.globalLight.intensity || 0.6));

  if (st.globalLight.mode === 'glow' || st.globalLight.mode === 'both') {
    var g = tctx.createRadialGradient(lx, ly, 0, lx, ly, rad);
    g.addColorStop(0.0, 'rgba('+rgb+','+(inten*0.75)+')');
    g.addColorStop(0.35, 'rgba('+rgb+','+(inten*0.40)+')');
    g.addColorStop(1.0, 'rgba('+rgb+',0)');
    tctx.save();
    tctx.globalCompositeOperation = 'lighter';
    tctx.fillStyle = g;
    tctx.fillRect(0, 0, W, H);
    tctx.restore();
  }

  if (st.globalLight.mode === 'shade' || st.globalLight.mode === 'both') {
    var sg = tctx.createRadialGradient(lx, ly, rad * 0.2, lx, ly, Math.max(W, H) * 0.95);
    sg.addColorStop(0.0, 'rgba(0,0,0,0)');
    sg.addColorStop(1.0, 'rgba(0,0,0,'+(inten*0.35)+')');
    tctx.save();
    tctx.globalCompositeOperation = 'multiply';
    tctx.fillStyle = sg;
    tctx.fillRect(0, 0, W, H);
    tctx.restore();
  }
}

export function syncLightingUI() {
  var tog = document.getElementById('toggle-lighting');
  var ctr = document.getElementById('lighting-controls');
  if (tog) tog.classList.toggle('on', !!st.globalLight.on);
  if (ctr) ctr.style.display = st.globalLight.on ? 'block' : 'none';

  var sli = document.getElementById('sl-light-intensity');
  if (sli) sli.value = st.globalLight.intensity;
  var slr = document.getElementById('sl-light-radius');
  if (slr) slr.value = st.globalLight.radius;
  var pick = document.getElementById('pick-light-color');
  if (pick) pick.value = st.globalLight.color || '#ffffff';

  document.querySelectorAll('.light-mode-btn').forEach(function(btn){
    btn.classList.toggle('active', btn.dataset.lightMode === st.globalLight.mode);
  });

  var pad = document.getElementById('light-pad');
  var dot = document.getElementById('light-dot');
  var lines = document.getElementById('light-pad-lines');
  if (pad && dot) {
    var r = pad.getBoundingClientRect();
    dot.style.left = (((st.globalLight.x != null ? st.globalLight.x : 0.5) * r.width) || 0) + 'px';
    dot.style.top  = (((st.globalLight.y != null ? st.globalLight.y : 0.35) * r.height) || 0) + 'px';
  }
  if (pad && lines) {
    var rect = pad.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    lines.width = Math.max(1, Math.round(rect.width * dpr));
    lines.height = Math.max(1, Math.round(rect.height * dpr));
    lines.style.width = rect.width + 'px';
    lines.style.height = rect.height + 'px';
    var c = lines.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, rect.width, rect.height);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(rect.width / 2, 0); c.lineTo(rect.width / 2, rect.height);
    c.moveTo(0, rect.height / 2); c.lineTo(rect.width, rect.height / 2);
    c.stroke();
  }
}


// ---- State ----
// Default card back image (Arcana Bloom)

// ─── Hover / gyro spring physics ──────────────────────────────────────────────
// Called once per frame from update() AFTER applyAnimations() so _ax/_as are fresh.
// Populates st.hoverData[id].{elev, tilt, gyro*} for all live cards.
// drawCard() only reads these values — no physics is performed during render.
export function updateHoverPhysics() {
  var inShowcase = document.body.classList.contains('showcase-mode');
  for (var i = 0; i < st.cardsRef.length; i++) {
    var c = st.cardsRef[i];
    if (c.kind === 'text' || c.kind === 'rect') continue;

    var hov = st.hoverData[c.id];
    if (!hov) { hov = { elev: 1, tilt: 0 }; st.hoverData[c.id] = hov; }

    var ax = c._ax || 0, as_ = c._as || 1;
    var cx = c.x + ax;
    var cs = (c.scale || 1) * as_;

    var isHover = !inShowcase && (st.hoverCardId === c.id);
    var targetElev = (isHover && !window._gyroActive) ? 1.05 : 1;
    hov.elev = lerp(hov.elev, targetElev, 0.10);

    var tiltTarget = 0;
    if (isHover) {
      var hw = 55 * cs;
      var lx = st.mouseCanvasX - cx;
      tiltTarget = Math.max(-6, Math.min(6, (lx / hw) * 6));
    }
    hov.tilt = lerp(hov.tilt, tiltTarget, 0.09);

    // Gyro/touch tilt
    if (window._gyroActive) {
      hov.tilt = lerp(hov.tilt, (window._gyroTiltX || 0), 0.16);
      if (hov.gyroAxisX == null) hov.gyroAxisX = 0;
      if (hov.gyroAxisY == null) hov.gyroAxisY = 0;
      hov.gyroAxisX = lerp(hov.gyroAxisX, Math.max(-1, Math.min(1, (window._gyroTiltX || 0) / 24)), 0.18);
      hov.gyroAxisY = lerp(hov.gyroAxisY, Math.max(-1, Math.min(1, (window._gyroTiltY || 0) / 24)), 0.18);
      if (!hov.gyroLift) hov.gyroLift = 0;
      if (hov.gyroDepth == null) hov.gyroDepth = 0.18;
      var liftTarget = 1 + Math.min(0.08, Math.abs(window._gyroTiltX || 0) * 0.0022 + Math.abs(window._gyroTiltY || 0) * 0.0016);
      hov.gyroLift = lerp(hov.gyroLift, liftTarget, 0.14);
      hov.gyroDepth = lerp(hov.gyroDepth, window._gyroDepth != null ? window._gyroDepth : 0.18, 0.16);
    } else {
      if (hov.gyroLift) hov.gyroLift = lerp(hov.gyroLift, 1, 0.12);
      if (hov.gyroAxisX) hov.gyroAxisX = lerp(hov.gyroAxisX, 0, 0.16);
      if (hov.gyroAxisY) hov.gyroAxisY = lerp(hov.gyroAxisY, 0, 0.16);
      if (hov.gyroDepth != null) hov.gyroDepth = lerp(hov.gyroDepth, 0, 0.12);
    }
  }
}

function drawSurfaceFX(c, t, w, h, r, hov, isExport) {
  // Set up clip so all surface FX are contained within the card shape
  st.ctx.save();
  roundRectPath(st.ctx, -w / 2, -h / 2, w, h, r);
  st.ctx.clip();

  // Velocity flash — momentary brightness spike when moving fast (foil-catch effect)
  // Decays smoothly via the lerp in updateHoverPhysics; raw velocity drives it here.
  var _velFlash = (window._gyroActive && window._gyroVelocity != null)
    ? Math.min(0.55, window._gyroVelocity * 9)
    : 0;

  // Glare overlay
  if (c.glare && c.glare.on) {
    var gi = (c.glare.intensity || 1) * (1 + _velFlash * 0.7);
    var tiltFrac = hov.tilt / 6;
    // Gyro shifts glare both horizontally (tiltX) and vertically (tiltY)
    var gyroGlareY = window._gyroActive ? ((window._gyroTiltY || 0) / 10) : 0;
    var glareX = tiltFrac * (w * 0.4);
    var glareYOff = gyroGlareY * (h * 0.35);
    var gGrad = st.ctx.createRadialGradient(glareX, -h * 0.2 + glareYOff, 0, glareX, -h * 0.2 + glareYOff, w * 0.8);
    gGrad.addColorStop(0, 'rgba(255,255,255,' + (0.18 * gi) + ')');
    gGrad.addColorStop(0.4, 'rgba(255,255,255,' + (0.04 * gi) + ')');
    gGrad.addColorStop(1, 'rgba(255,255,255,0)');
    st.ctx.fillStyle = gGrad;
    st.ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  // ── Surface FX (drawn inside clip, over image) ────────────────────────

  // SHIMMER — diagonal sweep bands
  if (c.shimmer && c.shimmer.on) {
    var sh = c.shimmer;
    var shBlend = sh.blend || 'soft-light';
    var shCol = sh.color || '#ffffff';
    var shR = parseInt(shCol.slice(1,3),16), shG = parseInt(shCol.slice(3,5),16), shB = parseInt(shCol.slice(5,7),16);
    var shOpacity = sh.opacity != null ? sh.opacity : 0.22;
    var shWidth = sh.width != null ? sh.width : 0.2;
    var shSpeed = sh.speed != null ? sh.speed : 0.7;
    var shBands = Math.round(sh.bands != null ? sh.bands : 2);
    // Tilt-reactive brightness boost + velocity flash (fast motion = foil catch)
    var shTiltBoost = 1 + Math.abs(hov.tilt / 6) * 0.8 + _velFlash * 0.9;
    var shOpacityBoosted = shOpacity * shTiltBoost;
    st.ctx.save();
    st.ctx.globalCompositeOperation = shBlend;
    var diag = Math.sqrt(w*w + h*h);
    for (var bi = 0; bi < shBands; bi++) {
      // Phase offset per band, cycling 0..1
      var bandPhase = ((t * 0.0004 * shSpeed + bi / shBands) % 1);
      // Band centre along the diagonal axis (-diag/2 → +diag/2, then wraps)
      var bandPos = (bandPhase * 2 - 1) * diag; // -diag..+diag
      var bw = shWidth * diag;
      // Shear-mapped gradient: project along 45° diagonal
      var gx1 = bandPos * 0.707 - bw * 0.707;
      var gy1 = bandPos * 0.707 - bw * 0.707;
      var gx2 = bandPos * 0.707 + bw * 0.707;
      var gy2 = bandPos * 0.707 + bw * 0.707;
      var sg = st.ctx.createLinearGradient(gx1, gy1, gx2, gy2);
      sg.addColorStop(0,   'rgba('+shR+','+shG+','+shB+',0)');
      sg.addColorStop(0.4, 'rgba('+shR+','+shG+','+shB+','+(shOpacityBoosted*0.6)+')');
      sg.addColorStop(0.5, 'rgba('+shR+','+shG+','+shB+','+shOpacityBoosted+')');
      sg.addColorStop(0.6, 'rgba('+shR+','+shG+','+shB+','+(shOpacityBoosted*0.6)+')');
      sg.addColorStop(1,   'rgba('+shR+','+shG+','+shB+',0)');
      st.ctx.fillStyle = sg;
      st.ctx.fillRect(-w/2, -h/2, w, h);

      // Iridescent rainbow pass (screen blend only) — thin hue-shifted overlay per band
      if (shBlend === 'screen') {
        var iHue = (t * 0.025 * shSpeed + bi * 120 + bandPhase * 180) % 360;
        var ird = st.ctx.createLinearGradient(gx1, gy1, gx2, gy2);
        ird.addColorStop(0,   'hsla('+iHue+',100%,70%,0)');
        ird.addColorStop(0.4, 'hsla('+((iHue+60)%360)+',100%,70%,'+(shOpacityBoosted*0.35)+')');
        ird.addColorStop(0.5, 'hsla('+((iHue+120)%360)+',100%,70%,'+(shOpacityBoosted*0.55)+')');
        ird.addColorStop(0.6, 'hsla('+((iHue+180)%360)+',100%,70%,'+(shOpacityBoosted*0.35)+')');
        ird.addColorStop(1,   'hsla('+((iHue+240)%360)+',100%,70%,0)');
        st.ctx.fillStyle = ird;
        st.ctx.fillRect(-w/2, -h/2, w, h);
      }
    }
    st.ctx.restore();
  }

  // LUSTER — radial atmospheric depth glow
  if (c.luster && c.luster.on) {
    var lu = c.luster;
    var luBlend = lu.blend || 'overlay';
    var luCol = lu.color || '#c9a84c';
    var luR = parseInt(luCol.slice(1,3),16), luG = parseInt(luCol.slice(3,5),16), luB = parseInt(luCol.slice(5,7),16);
    var luOpacity = lu.opacity != null ? lu.opacity : 0.35;
    var luRadius = lu.radius != null ? lu.radius : 0.75;
    var luPulse = lu.pulse != null ? lu.pulse : 0.3;
    st.ctx.save();
    st.ctx.globalCompositeOperation = luBlend;
    var pulse = 1 + luPulse * Math.sin(t * 0.0018);
    var luR2 = Math.max(w, h) * luRadius * pulse;
    // Tilt-reactive: glow centre drifts toward the lit side
    var luCX = tiltFrac * w * 0.30;
    var luCY = -(Math.abs(tiltFrac) * h * 0.12); // slight upward shift at any tilt
    var luGrad = st.ctx.createRadialGradient(luCX, luCY, 0, luCX, luCY, luR2);
    luGrad.addColorStop(0,   'rgba('+luR+','+luG+','+luB+','+luOpacity+')');
    luGrad.addColorStop(0.5, 'rgba('+luR+','+luG+','+luB+','+(luOpacity*0.4)+')');
    luGrad.addColorStop(1,   'rgba('+luR+','+luG+','+luB+',0)');
    st.ctx.fillStyle = luGrad;
    st.ctx.fillRect(-w/2, -h/2, w, h);
    // Rim-light: secondary smaller glow from the opposite edge when tilting
    if (Math.abs(tiltFrac) > 0.05) {
      var rimX = -tiltFrac * w * 0.5;
      var rimY = h * 0.3;
      var rimR = Math.max(w, h) * luRadius * 0.5 * pulse;
      var rimOpacity = luOpacity * Math.abs(tiltFrac) * 0.45;
      var rimGrad = st.ctx.createRadialGradient(rimX, rimY, 0, rimX, rimY, rimR);
      rimGrad.addColorStop(0,   'rgba('+luR+','+luG+','+luB+','+rimOpacity+')');
      rimGrad.addColorStop(0.6, 'rgba('+luR+','+luG+','+luB+','+(rimOpacity*0.2)+')');
      rimGrad.addColorStop(1,   'rgba('+luR+','+luG+','+luB+',0)');
      st.ctx.fillStyle = rimGrad;
      st.ctx.fillRect(-w/2, -h/2, w, h);
    }
    st.ctx.restore();
  }

  // GRAIN — animated noise texture (cached: regenerates ~6fps not 60fps)
  if (c.grain && c.grain.on) {
    var gr = c.grain;
    var grBlend = gr.blend || 'overlay';
    var grAmount = gr.amount != null ? gr.amount : 0.12;
    var grScale = gr.scale != null ? gr.scale : 1.0;
    var grAnim = gr.anim != null ? gr.anim : 0.4;
    // Quantise seed to ~6 fps worth of frames to avoid per-frame pixel work.
    var seed = Math.floor(t * 0.006 * (0.1 + grAnim));
    var grSz = Math.ceil(Math.max(w, h) / grScale);
    // Reuse a per-card cache object keyed by seed+size+amount
    if (!c._grainCache) c._grainCache = {};
    var cacheKey = seed + '_' + grSz + '_' + Math.round(grAmount * 100);
    if (!c._grainCache[cacheKey]) {
      // Evict old entries (keep only last 2)
      var ckeys = Object.keys(c._grainCache);
      if (ckeys.length >= 2) { delete c._grainCache[ckeys[0]]; }
      var gOff = document.createElement('canvas');
      gOff.width = grSz; gOff.height = grSz;
      var gCtx = gOff.getContext('2d');
      var imgd = gCtx.createImageData(grSz, grSz);
      var data = imgd.data;
      for (var gi = 0; gi < grSz * grSz; gi++) {
        var nx = gi % grSz, ny = Math.floor(gi / grSz);
        var rv = Math.sin(nx * 127.1 + ny * 311.7 + seed * 74.3) * 43758.5453;
        rv = rv - Math.floor(rv);
        var gv = Math.floor(rv * 255);
        data[gi*4]   = gv;
        data[gi*4+1] = gv;
        data[gi*4+2] = gv;
        data[gi*4+3] = Math.floor(grAmount * 255);
      }
      gCtx.putImageData(imgd, 0, 0);
      c._grainCache[cacheKey] = gOff;
    }
    st.ctx.save();
    st.ctx.globalCompositeOperation = grBlend;
    st.ctx.drawImage(c._grainCache[cacheKey], -w/2, -h/2, w, h);
    st.ctx.restore();
  }

  // RIPPLE — concentric animated rings from center
  if (c.ripple && c.ripple.on) {
    var rp = c.ripple;
    var rpBlend = rp.blend || 'screen';
    var rpCol = rp.color || '#88bbff';
    var rpR2 = parseInt(rpCol.slice(1,3),16), rpG = parseInt(rpCol.slice(3,5),16), rpB = parseInt(rpCol.slice(5,7),16);
    var rpOpacity = rp.opacity != null ? rp.opacity : 0.18;
    var rpSpeed = rp.speed != null ? rp.speed : 0.8;
    var rpRings = Math.round(rp.rings != null ? rp.rings : 3);
    var rpSpread = rp.spread != null ? rp.spread : 0.5;
    st.ctx.save();
    st.ctx.globalCompositeOperation = rpBlend;
    var rpMaxR = Math.max(w, h) * rpSpread;
    // Tilt shifts the ripple origin — rings emanate from where you're tilting toward
    var rpCX = tiltFrac * w * 0.25;
    var rpCY = 0;
    // Tilt boosts ring speed slightly and opacity
    var rpTiltSpd = rpSpeed * (1 + Math.abs(tiltFrac) * 0.5);
    var rpTiltOp  = rpOpacity * (1 + Math.abs(tiltFrac) * 0.4);
    // Ellipse squash: tilting compresses rings on the tilt axis for a 3D disc feel
    var rpScaleX = 1 + tiltFrac * 0.18;
    var rpScaleY = 1 - Math.abs(tiltFrac) * 0.10;
    for (var ri = 0; ri < rpRings; ri++) {
      // Each ring has its own phase
      var ringPhase = ((t * 0.001 * rpTiltSpd + ri / rpRings) % 1);
      var ringR = ringPhase * rpMaxR;
      var ringAlpha = rpTiltOp * Math.sin(ringPhase * Math.PI); // fade in/out
      var ringW = Math.max(1, rpMaxR * 0.06);
      // Draw ring as ellipse via ctx.scale + arc + restore
      st.ctx.save();
      st.ctx.translate(rpCX, rpCY);
      st.ctx.scale(rpScaleX, rpScaleY);
      var rg = st.ctx.createRadialGradient(0, 0, Math.max(0, ringR - ringW), 0, 0, ringR + ringW);
      rg.addColorStop(0,   'rgba('+rpR2+','+rpG+','+rpB+',0)');
      rg.addColorStop(0.5, 'rgba('+rpR2+','+rpG+','+rpB+','+ringAlpha+')');
      rg.addColorStop(1,   'rgba('+rpR2+','+rpG+','+rpB+',0)');
      st.ctx.fillStyle = rg;
      st.ctx.beginPath();
      st.ctx.arc(0, 0, ringR + ringW, 0, Math.PI * 2);
      st.ctx.fill();
      st.ctx.restore();
    }
    st.ctx.restore();
  }

  // ── HOLO — mode-based holographic surface effect ─────────────────────
  if (c.holo && c.holo.on) {
    var ho = c.holo;
    var hoMode  = ho.mode  || 'glass';
    var hoBlend = ho.blend || 'screen';
    var hoInt   = ho.intensity   != null ? ho.intensity   : 1.0;
    var hoIrd   = ho.iridescence != null ? ho.iridescence : 0.6;
    var hoSpd   = ho.speed       != null ? ho.speed       : 1.0;
    var hoSz    = ho.size        != null ? ho.size        : 2.0;
    var hPhase  = c._holoPhase || 0;
    var tiltDeg = hov.tilt + (c._ar || 0);
    var tiltNrm = tiltDeg / 6;
    var tiltAbs = Math.abs(tiltNrm);

    st.ctx.save();
    st.ctx.globalCompositeOperation = hoBlend;

    if (hoMode === 'glass') {
      // ── Glass Reflection ─────────────────────────────────────────────────
      // Overlays the card image on the foil surface with parallax + iridescent
      // hue cycling. Offset and scale are user-controllable.
      var refX     = ho.refX     != null ? ho.refX     : 0;   // stored as -50..50
      var refY     = ho.refY     != null ? ho.refY     : 0;
      var refScale = ho.refScale != null ? ho.refScale : 1.0;
      var gImgKey  = c.showBack ? c.backImg : c.frontImg;
      var gImgEl   = gImgKey ? st.images[gImgKey] : null;

      // Opacity: slow breath + strong tilt boost
      var gBreath  = 0.08 + 0.04 * Math.sin(t * 0.001 * hoSpd + hPhase);
      var gOpacity = Math.min(0.9, (gBreath + tiltAbs * 0.55) * hoInt);

      // Hue shift oscillates ±50° — gives rainbow cast without full spin
      var gHueShift = Math.sin((t * 0.00018 * hoSpd + tiltAbs * 0.5) * Math.PI * 2) * 50 * hoIrd;

      // Tilt-driven parallax + user-set offset
      var gOffX = (refX / 100) * w + tiltNrm * w * 0.08;
      var gOffY = (refY / 100) * h;

      st.ctx.globalAlpha = gOpacity;
      if (gHueShift && !isExport) {
        st.ctx.filter = 'hue-rotate(' + Math.round(gHueShift) + 'deg) saturate(1.3)';
      }
      st.ctx.save();
      st.ctx.transform(refScale, 0, 0, refScale, gOffX, gOffY);
      if (gImgEl && gImgEl.complete && gImgEl.naturalWidth > 0) {
        st.ctx.drawImage(gImgEl, -w / 2, -h / 2, w, h);
      } else {
        // Gradient fallback when no card image exists
        var gFill = st.ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        gFill.addColorStop(0,    'rgba(140,80,255,1)');
        gFill.addColorStop(0.33, 'rgba(255,60,180,1)');
        gFill.addColorStop(0.67, 'rgba(60,200,255,1)');
        gFill.addColorStop(1,    'rgba(80,255,140,1)');
        st.ctx.fillStyle = gFill;
        st.ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      st.ctx.restore();

      // Second pass: animated iridescent colour wash over the reflection
      if (hoIrd > 0.05) {
        var iHue  = (t * 0.03 * hoSpd + hPhase * 50) % 360;
        var iGrad = st.ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        iGrad.addColorStop(0,    'hsla(' + iHue                  + ',100%,70%,' + (hoIrd * 0.30) + ')');
        iGrad.addColorStop(0.33, 'hsla(' + ((iHue + 120) % 360) + ',100%,70%,' + (hoIrd * 0.18) + ')');
        iGrad.addColorStop(0.67, 'hsla(' + ((iHue + 240) % 360) + ',100%,70%,' + (hoIrd * 0.18) + ')');
        iGrad.addColorStop(1,    'hsla(' + ((iHue + 60)  % 360) + ',100%,70%,' + (hoIrd * 0.30) + ')');
        st.ctx.filter = 'none';
        st.ctx.globalCompositeOperation = 'screen';
        st.ctx.globalAlpha = 1;
        st.ctx.fillStyle = iGrad;
        st.ctx.fillRect(-w / 2, -h / 2, w, h);
      }

    } else if (hoMode === 'sparkle') {
      // ── Sparkle ───────────────────────────────────────────────────────────
      // Random scattered glitter: 25% are 4-point cross stars, rest are dots.
      // All flash independently at different speeds.
      var spCount = Math.round(70 + hoSz * 20);
      var spKey   = 'sp|' + spCount;
      if (!c._holoCache || c._holoCache.key !== spKey) {
        var spPts = [];
        for (var si = 0; si < spCount; si++) {
          spPts.push({
            u:     Math.random(),
            v:     Math.random(),
            phase: Math.random() * Math.PI * 2,
            sz:    0.4 + Math.random() * 1.6,
            hue:   Math.random() * 360,
            star:  Math.random() < 0.38
          });
        }
        c._holoCache = { key: spKey, particles: spPts };
      }
      var spPts2 = c._holoCache.particles;
      for (var si2 = 0; si2 < spPts2.length; si2++) {
        var sp = spPts2[si2];
        var rawA = 0.5 + 0.5 * Math.sin(t * 0.005 * hoSpd + sp.phase);
        rawA = rawA * rawA; // square for sharper flash
        var spA = rawA * hoInt * (1 + tiltAbs * 0.6); // tilt brightness boost
        if (spA < 0.015) continue;
        // Tilt-reactive parallax shift: sparkles drift with card tilt
        var spX  = sp.u * w - w * 0.5 + tiltNrm * w * 0.12;
        var spY  = sp.v * h - h * 0.5 - tiltNrm * h * 0.05;
        var spSz = sp.sz * hoSz * 0.55;
        var spHue = (sp.hue + t * 0.02 * hoSpd) % 360;
        var spClr = hoIrd > 0.1
          ? 'hsla(' + spHue + ',100%,96%,' + spA + ')'
          : 'rgba(255,255,255,' + spA + ')';
        st.ctx.globalAlpha = 1;
        if (sp.star) {
          // 4-point cross star
          var starR = spSz * 2.8, starW = spSz * 0.32;
          st.ctx.fillStyle = spClr;
          st.ctx.fillRect(spX - starR, spY - starW, starR * 2, starW * 2);
          st.ctx.fillRect(spX - starW, spY - starR, starW * 2, starR * 2);
          // centre glow
          var cGr = st.ctx.createRadialGradient(spX, spY, 0, spX, spY, spSz * 1.4);
          cGr.addColorStop(0, 'rgba(255,255,255,' + spA + ')');
          cGr.addColorStop(1, 'rgba(255,255,255,0)');
          st.ctx.fillStyle = cGr;
          st.ctx.beginPath();
          st.ctx.arc(spX, spY, spSz * 1.4, 0, Math.PI * 2);
          st.ctx.fill();
        } else {
          st.ctx.fillStyle = spClr;
          st.ctx.beginPath();
          st.ctx.arc(spX, spY, spSz, 0, Math.PI * 2);
          st.ctx.fill();
        }
      }

    } else if (hoMode === 'hex') {
      // ── Hex Foil ──────────────────────────────────────────────────────────
      // Full tessellated hex grid covering the card. Each cell is coloured by
      // position + time, creating a shifting prismatic foil pattern.
      var hxR   = Math.max(2.5, hoSz * 4);       // hex radius in px
      var hxW   = hxR * 2;                        // pointy-top col stride
      var hxH   = hxR * 1.7321;                  // row height (√3 * r)
      var hxPhase = (t * 0.035 * hoSpd + hPhase * 20 + tiltNrm * 30) % 360;
      var hxCols  = Math.ceil(w / (hxW * 0.75)) + 2;
      var hxRows  = Math.ceil(h / hxH) + 2;
      var hxX0 = -w / 2 - hxW;
      var hxY0 = -h / 2 - hxH;
      for (var hrow = 0; hrow < hxRows; hrow++) {
        for (var hcol = 0; hcol < hxCols; hcol++) {
          var hcx = hxX0 + hcol * hxW * 0.75;
          var hcy = hxY0 + hrow * hxH + (hcol % 2 === 1 ? hxH * 0.5 : 0);
          var hxHue = (hxPhase + (hcx + hcy) * 0.8) % 360;
          var hxWv  = 0.25 + 0.18 * Math.sin((hcx + hcy) * 0.025 + t * 0.001 * hoSpd);
          var hxA   = hxWv * hoInt;
          if (hxA < 0.015) continue;
          st.ctx.beginPath();
          for (var hi3 = 0; hi3 < 6; hi3++) {
            var hxa  = hi3 * Math.PI / 3 - Math.PI / 6;
            var hxpx = hcx + hxR * Math.cos(hxa);
            var hxpy = hcy + hxR * Math.sin(hxa);
            if (hi3 === 0) st.ctx.moveTo(hxpx, hxpy); else st.ctx.lineTo(hxpx, hxpy);
          }
          st.ctx.closePath();
          st.ctx.globalAlpha = hxA * 0.32;
          st.ctx.fillStyle   = 'hsl(' + hxHue + ',100%,62%)';
          st.ctx.fill();
          st.ctx.globalAlpha = hxA * 0.72;
          st.ctx.strokeStyle = 'hsl(' + hxHue + ',100%,82%)';
          st.ctx.lineWidth   = 0.55;
          st.ctx.stroke();
        }
      }

    } else if (hoMode === 'aurora') {
      // ── Aurora ────────────────────────────────────────────────────────────
      // Two layered diagonal rainbow gradients that slowly sweep across the
      // card, producing a Northern Lights effect.
      var aTime = t * 0.0003 * hoSpd;
      var aDiag = Math.sqrt(w * w + h * h);
      var aPasses = [
        { angle:  0.38, speedMult: 1.0 },
        { angle: -0.22, speedMult: 0.55 }
      ];
      for (var ap = 0; ap < aPasses.length; ap++) {
        var ang  = aPasses[ap].angle;
        var aCos = Math.cos(ang), aSin = Math.sin(ang);
        var aHueOff = ((aTime * aPasses[ap].speedMult * 80) + ap * 180 + hPhase * 120) % 360;
        var aGrad = st.ctx.createLinearGradient(
          -aCos * aDiag, -aSin * aDiag,
           aCos * aDiag,  aSin * aDiag
        );
        var nStops = 9;
        for (var ak = 0; ak <= nStops; ak++) {
          var af   = ak / nStops;
          var aHue = (aHueOff + af * 360) % 360;
          var aA   = Math.sin(af * Math.PI) * 0.24 * hoInt * (0.4 + 0.6 * hoIrd);
          aGrad.addColorStop(af, 'hsla(' + aHue + ',100%,68%,' + aA + ')');
        }
        st.ctx.globalAlpha = 1;
        st.ctx.fillStyle   = aGrad;
        st.ctx.fillRect(-w / 2, -h / 2, w, h);
      }
    }

    st.ctx.filter = 'none';
    st.ctx.restore(); // holo
  }

  st.ctx.restore(); // drawSurfaceFX clip
}

export function drawCard(c, t, isExport) {
  if (c.hidden) return; // hidden layers not rendered
  var w = 110, h = 154, r = 8;
  var ax = isExport ? 0 : (c._ax || 0);
  var ay = isExport ? 0 : (c._ay || 0);
  var ar = isExport ? 0 : (c._ar || 0);
  var as_ = isExport ? 1 : (c._as || 1);
  var ao = isExport ? 1 : (c._ao || 1);
  var cx = c.x + ax, cy = c.y + ay;
  var cs = (c.scale || 1) * as_;
  var cr = (c.rot || 0) + ar;

  // Hover spring values are pre-computed by updateHoverPhysics() in update().
  // drawCard only reads them — no physics here.
  var hov = st.hoverData[c.id];
  if (!hov) { hov = { elev: 1, tilt: 0 }; st.hoverData[c.id] = hov; }

  var elevScale = isExport ? 1 : (hov.elev * (hov.gyroLift || 1));
  var hoverTilt = isExport ? 0 : hov.tilt;
  var gyroAxisX = window._gyroActive ? (hov.gyroAxisX || 0) : 0;
  var gyroAxisY = window._gyroActive ? (hov.gyroAxisY || 0) : 0;
  var gyroShiftX = isExport ? 0 : gyroAxisX * (w * 0.075);
  var gyroShiftY = isExport ? 0 : gyroAxisY * (h * 0.065);
  var gyroDepthScaleX = isExport ? 1 : (1 + Math.abs(gyroAxisX) * 0.02);
  var gyroDepthScaleY = isExport ? 1 : (1 + Math.abs(gyroAxisY) * 0.03);
  var gyroDepth = isExport ? 0 : (hov.gyroDepth || 0);
  var showcaseDepthLift = (!isExport && document.body.classList.contains('showcase-mode')) ? 0.18 : 0;
  var depthScale = 1 + (gyroDepth + showcaseDepthLift) * 0.12;
  var depthShiftY = -Math.max(0, gyroDepth + showcaseDepthLift) * (h * 0.055);

  st.ctx.save();
  st.ctx.globalAlpha = ao;
  st.ctx.translate(cx, cy);
  st.ctx.translate(gyroShiftX, gyroShiftY + depthShiftY);
  st.ctx.rotate((cr + hoverTilt) * Math.PI / 180);
  st.ctx.scale(cs * elevScale * gyroDepthScaleX * depthScale, cs * elevScale * gyroDepthScaleY * depthScale);
  // Perspective lean — simulates one edge receding when the card tilts.
  // Applied in card-local space (after rotate+scale) so it always shears
  // along the card's own axes regardless of the card's rotation angle.
  // skewX: left/right tilt shears horizontally (gyroAxisY drives X lean)
  // skewY: forward/back tilt shears vertically  (gyroAxisX drives Y lean)
  if (!isExport && window._gyroActive && (gyroAxisX !== 0 || gyroAxisY !== 0)) {
    st.ctx.transform(1, -gyroAxisX * 0.038, gyroAxisY * 0.052, 1, 0, 0);
  }

  // Drop Shadow — rendered before card body so the card image covers the silhouette
  if (c.shadow && c.shadow.on) {
    var sh = c.shadow;
    var sColor = sh.color || '#000000';
    var sr = parseInt(sColor.slice(1,3),16);
    var sg = parseInt(sColor.slice(3,5),16);
    var sb = parseInt(sColor.slice(5,7),16);
    var sOpacity = sh.opacity != null ? sh.opacity : 0.6;
    var sBlur = sh.blur != null ? sh.blur : 18;
    var sOffX = sh.offsetX != null ? sh.offsetX : 6;
    var sOffY = sh.offsetY != null ? sh.offsetY : 10;
    var depthShadow = Math.max(0, gyroDepth + showcaseDepthLift);
    var sinkShadow = Math.max(0, -(gyroDepth));
    sOpacity = sOpacity * (1 + depthShadow * 0.25 - sinkShadow * 0.18);
    sBlur += depthShadow * 16 - sinkShadow * 6;
    sOffY += 6 + depthShadow * 16 - sinkShadow * 8;
    st.ctx.save();
    st.ctx.shadowColor = 'rgba(' + sr + ',' + sg + ',' + sb + ',' + sOpacity + ')';
    st.ctx.shadowBlur = sBlur;
    st.ctx.shadowOffsetX = sOffX;
    st.ctx.shadowOffsetY = sOffY;
    // Fill must be opaque for st.canvas to cast the shadow — the card body drawn after will cover this fill
    st.ctx.fillStyle = 'rgb(' + sr + ',' + sg + ',' + sb + ')';
    roundRect(st.ctx, -w / 2, -h / 2, w, h, r);
    st.ctx.fill();
    st.ctx.restore();
  }

  // Glow — layered bloom passes drawn BEFORE card body so they show outside the card edge
  if (c.glow && c.glow.on) {
    var glowPulse = c.glow.intensity * (1 + 0.3 * Math.sin(t * 0.003));
    var glowColor = c.glow.color || '#C9A84C';
    // Multiple passes at increasing blur = soft bloom effect
    var glowLayers = [
      { blur: 6  * glowPulse, alpha: 0.9 },
      { blur: 14 * glowPulse, alpha: 0.65 },
      { blur: 28 * glowPulse, alpha: 0.4 },
      { blur: 50 * glowPulse, alpha: 0.2 },
    ];
    glowLayers.forEach(function(gl) {
      st.ctx.save();
      st.ctx.shadowColor = glowColor;
      st.ctx.shadowBlur = gl.blur;
      st.ctx.strokeStyle = glowColor;
      st.ctx.globalAlpha = gl.alpha;
      st.ctx.lineWidth = 2;
      roundRect(st.ctx, -w / 2, -h / 2, w, h, r);
      st.ctx.stroke();
      st.ctx.restore();
    });
  }

  // Selection outline
  var isSel = st.selectedRef.indexOf(c.id) >= 0;
  if (isSel && !isExport && !document.body.classList.contains('showcase-mode')) {
    st.ctx.save();
    st.ctx.shadowColor = '#C9A84C';
    st.ctx.shadowBlur = 12;
    st.ctx.strokeStyle = '#C9A84C';
    st.ctx.lineWidth = 2;
    roundRect(st.ctx, -w / 2, -h / 2, w, h, r);
    st.ctx.stroke();
    st.ctx.restore();
  }

  // Card body — no shadow here, glow already drawn above
  st.ctx.shadowBlur = 0;
  roundRect(st.ctx, -w / 2, -h / 2, w, h, r);
  st.ctx.save();
  st.ctx.clip();

  // Background / image
  var imgSrc = c.showBack ? c.backImg : c.frontImg;
  var img = imgSrc ? st.images[imgSrc] : null;
  if (img && img.complete) {
    st.ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    // Placeholder gradient
    var grad = st.ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, '#13131F');
    grad.addColorStop(1, '#1A1A2E');
    st.ctx.fillStyle = grad;
    st.ctx.fillRect(-w / 2, -h / 2, w, h);
    // Gold border
    st.ctx.strokeStyle = 'rgba(201,168,76,0.35)';
    st.ctx.lineWidth = 1;
    roundRect(st.ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 5);
    st.ctx.stroke();
    // Text
    st.ctx.fillStyle = 'rgba(201,168,76,0.4)';
    st.ctx.font = '600 11px Cinzel, serif';
    st.ctx.textAlign = 'center';
    st.ctx.textBaseline = 'middle';
    st.ctx.fillText('ARCANA', 0, -8);
    st.ctx.fillText('BLOOM', 0, 8);
    st.ctx.font = '300 9px Crimson Pro, serif';
    st.ctx.fillStyle = 'rgba(107,101,128,0.6)';
    st.ctx.fillText(c.showBack ? 'BACK' : 'FRONT', 0, 28);
  }

  drawSurfaceFX(c, t, w, h, r, hov, isExport);

  st.ctx.restore(); // clip

  // Reset shadow
  st.ctx.shadowBlur = 0;
  st.ctx.restore(); // card transform
}

export function roundRect(ctx, x, y, w, h, r) {
  st.ctx.beginPath();
  st.ctx.moveTo(x + r, y);
  st.ctx.lineTo(x + w - r, y);

  st.ctx.beginPath();
  st.ctx.moveTo(x + r, y);
  st.ctx.lineTo(x + w - r, y);
  st.ctx.arcTo(x + w, y, x + w, y + r, r);
  st.ctx.lineTo(x + w, y + h - r);
  st.ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  st.ctx.lineTo(x + r, y + h);
  st.ctx.arcTo(x, y + h, x, y + h - r, r);
  st.ctx.lineTo(x, y + r);
  st.ctx.arcTo(x, y, x + r, y, r);
  st.ctx.closePath();
}

// ── TEXT object renderer ──────────────────────────────────────────────────
export function drawTextObj(c, isExport) {
  if (c.hidden) return;
  var ax = isExport ? 0 : (c._ax || 0);
  var ay = isExport ? 0 : (c._ay || 0);

  if (c.hidden) return;
  var ax = isExport ? 0 : (c._ax || 0);
  var ay = isExport ? 0 : (c._ay || 0);
  var ar = isExport ? 0 : (c._ar || 0);
  var ao = isExport ? 1 : (c._ao || 1);
  var cx2 = c.x + ax, cy2 = c.y + ay;
  var rot  = (c.rot || 0) + ar;
  var op   = (c.opacity != null ? c.opacity : 1) * ao;

  st.ctx.save();
  st.ctx.globalAlpha = op;
  st.ctx.translate(cx2, cy2);
  st.ctx.rotate(rot * Math.PI / 180);

  var font  = c.font || 'Cinzel, serif';
  var fsize = c.fontSize || 24;
  var color = c.color || '#ffffff';
  var align = c.align || 'left';
  var lh    = (c.lineHeight || 1.3) * fsize;
  var maxW  = c.width || 200;

  st.ctx.font = fsize + 'px ' + font;
  st.ctx.fillStyle = color;
  st.ctx.textAlign = align;
  st.ctx.textBaseline = 'top';

  // Word-wrap
  var words = (c.content || '').split('\n');
  var lines = [];
  words.forEach(function(para) {
    var ws = para.split(' ');
    var cur = '';
    ws.forEach(function(w) {
      var test = cur ? cur + ' ' + w : w;
      if (st.ctx.measureText(test).width > maxW && cur) {
        lines.push(cur); cur = w;
      } else { cur = test; }
    });
    lines.push(cur);
  });

  var xOff = align === 'center' ? 0 : (align === 'right' ? maxW / 2 : -maxW / 2);
  lines.forEach(function(line, li) {
    st.ctx.fillText(line, xOff, li * lh - (lines.length * lh) / 2);
  });

  // Selection outline
  if (!isExport && st.selectedRef.indexOf(c.id) >= 0) {
    st.ctx.strokeStyle = '#FF9F45';
    st.ctx.lineWidth = 1.5;
    st.ctx.setLineDash([4, 3]);
    st.ctx.strokeRect(-maxW / 2, -(lines.length * lh) / 2 - 4, maxW, lines.length * lh + 8);
    st.ctx.setLineDash([]);
  }

  st.ctx.restore();
}

// ── RECT object renderer ──────────────────────────────────────────────────
export function drawRectObj(c, isExport) {
  if (c.hidden) return;
  var ax = isExport ? 0 : (c._ax || 0);
  var ay = isExport ? 0 : (c._ay || 0);
  var ar = isExport ? 0 : (c._ar || 0);
  var ao = isExport ? 1 : (c._ao || 1);
  var cx2 = c.x + ax, cy2 = c.y + ay;
  var rot  = (c.rot || 0) + ar;
  var rw   = c.width  || 160;
  var rh   = c.height || 100;
  var rad  = c.cornerRadius || 0;

  st.ctx.save();
  st.ctx.translate(cx2, cy2);
  st.ctx.rotate(rot * Math.PI / 180);

  // Fill
  var fo = (c.fillOpacity != null ? c.fillOpacity : 0.8) * ao;
  if (fo > 0) {
    st.ctx.globalAlpha = fo;
    st.ctx.fillStyle = c.fillColor || '#1a1a2e';
    roundRect(st.ctx, -rw / 2, -rh / 2, rw, rh, rad);
    st.ctx.fill();
  }

  // Stroke
  var sw = c.strokeWidth != null ? c.strokeWidth : 1;
  var so = (c.strokeOpacity != null ? c.strokeOpacity : 1) * ao;
  if (sw > 0 && so > 0) {
    st.ctx.globalAlpha = so;
    st.ctx.strokeStyle = c.strokeColor || '#c9a84c';
    st.ctx.lineWidth = sw;
    roundRect(st.ctx, -rw / 2, -rh / 2, rw, rh, rad);
    st.ctx.stroke();
  }

  // Selection outline
  if (!isExport && st.selectedRef.indexOf(c.id) >= 0) {
    st.ctx.globalAlpha = 1;
    st.ctx.strokeStyle = '#7a6fff';
    st.ctx.lineWidth = 1.5;
    st.ctx.setLineDash([4, 3]);
    roundRect(st.ctx, -rw / 2 - 3, -rh / 2 - 3, rw + 6, rh + 6, rad + 3);
    st.ctx.stroke();
    st.ctx.setLineDash([]);
  }

  st.ctx.restore();
}

// ─── Custom inspector sync — set by card-builder.js to avoid circular deps ───
export var _syncCustomInspector = function() {};
export function setSyncCustomInspector(fn) { _syncCustomInspector = fn; }

// ── Word-wrap helper ──────────────────────────────────────────────────────
function wrapText(ctx, text, x, y, maxWidth, lineH) {
  var words = text.split(' ');
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var test = line + (line ? ' ' : '') + words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

// ── CUSTOM CARD renderer ─────────────────────────────────────────────────
export function drawCustomCard(c, t, isExport) {
  if (c.hidden) return;
  var CW = 110, CH = 154, CR = 8;
  var ax = isExport ? 0 : (c._ax || 0);
  var ay = isExport ? 0 : (c._ay || 0);
  var ar = isExport ? 0 : (c._ar || 0);
  var as_ = isExport ? 1 : (c._as || 1);
  var ao = isExport ? 1 : (c._ao || 1);
  var cx = c.x + ax, cy = c.y + ay;
  var cs = (c.scale || 1) * as_;
  var cr = (c.rot || 0) + ar;

  var hov = st.hoverData[c.id];
  if (!hov) { hov = { elev: 1, tilt: 0 }; st.hoverData[c.id] = hov; }
  var elevScale = isExport ? 1 : (hov.elev || 1);
  var hoverTilt = isExport ? 0 : (hov.tilt || 0);

  st.ctx.save();
  st.ctx.globalAlpha = ao;
  st.ctx.translate(cx, cy);
  st.ctx.rotate((cr + hoverTilt) * Math.PI / 180);
  st.ctx.scale(cs * elevScale, cs * elevScale);

  // Drop Shadow
  if (c.shadow && c.shadow.on) {
    var sh = c.shadow;
    var sColor = sh.color || '#000000';
    var sr = parseInt(sColor.slice(1,3),16);
    var sg = parseInt(sColor.slice(3,5),16);
    var sb = parseInt(sColor.slice(5,7),16);
    var sOpacity = sh.opacity != null ? sh.opacity : 0.6;
    var sBlur = sh.blur != null ? sh.blur : 18;
    var sOffX = sh.offsetX != null ? sh.offsetX : 6;
    var sOffY = sh.offsetY != null ? sh.offsetY : 10;
    st.ctx.save();
    st.ctx.shadowColor = 'rgba(' + sr + ',' + sg + ',' + sb + ',' + sOpacity + ')';
    st.ctx.shadowBlur = sBlur;
    st.ctx.shadowOffsetX = sOffX;
    st.ctx.shadowOffsetY = sOffY;
    st.ctx.fillStyle = 'rgb(' + sr + ',' + sg + ',' + sb + ')';
    roundRectPath(st.ctx, -CW / 2, -CH / 2, CW, CH, CR);
    st.ctx.fill();
    st.ctx.restore();
  }

  // Glow
  if (c.glow && c.glow.on) {
    var glowPulse = c.glow.intensity * (1 + 0.3 * Math.sin(t * 0.003));
    var glowColor = c.glow.color || '#C9A84C';
    var glowLayers = [
      { blur: 6  * glowPulse, alpha: 0.9 },
      { blur: 14 * glowPulse, alpha: 0.65 },
      { blur: 28 * glowPulse, alpha: 0.4 },
      { blur: 50 * glowPulse, alpha: 0.2 },
    ];
    glowLayers.forEach(function(gl) {
      st.ctx.save();
      st.ctx.shadowColor = glowColor;
      st.ctx.shadowBlur = gl.blur;
      st.ctx.strokeStyle = glowColor;
      st.ctx.globalAlpha = gl.alpha;
      st.ctx.lineWidth = 2;
      roundRectPath(st.ctx, -CW / 2, -CH / 2, CW, CH, CR);
      st.ctx.stroke();
      st.ctx.restore();
    });
  }

  // 1. Base gradient background
  var baseGrad = st.ctx.createLinearGradient(
    -CW / 2 + CW * Math.cos(135 * Math.PI / 180) * 0.5,
    -CH / 2 + CH * Math.sin(135 * Math.PI / 180) * 0.5,
    -CW / 2 - CW * Math.cos(135 * Math.PI / 180) * 0.5,
    -CH / 2 - CH * Math.sin(135 * Math.PI / 180) * 0.5
  );
  baseGrad.addColorStop(0, (c.base && c.base.color)  || '#1a1a2e');
  baseGrad.addColorStop(1, (c.base && c.base.color2) || '#0a0a18');
  roundRectPath(st.ctx, -CW / 2, -CH / 2, CW, CH, CR);
  st.ctx.fillStyle = baseGrad;
  st.ctx.fill();

  // 2. Art image (clipped)
  var artSrc = c.art && c.art.src;
  var artImg = artSrc ? st.images[artSrc] : null;
  if (artImg && artImg.complete && artImg.naturalWidth > 0) {
    st.ctx.save();
    st.ctx.beginPath();
    roundRectPath(st.ctx, -CW / 2, -CH / 2, CW, CH, CR);
    st.ctx.clip();
    var fit = (c.art && c.art.fit) || 'cover';
    var iw = artImg.naturalWidth, ih = artImg.naturalHeight;
    var cardAspect = CW / CH;
    var imgAspect  = iw / ih;
    var dw, dh;
    if (fit === 'cover') {
      if (imgAspect > cardAspect) { dh = CH; dw = dh * imgAspect; }
      else                        { dw = CW; dh = dw / imgAspect; }
    } else {
      if (imgAspect > cardAspect) { dw = CW; dh = dw / imgAspect; }
      else                        { dh = CH; dw = dh * imgAspect; }
    }
    st.ctx.globalAlpha = 1;
    st.ctx.drawImage(artImg, -dw / 2, -dh / 2, dw, dh);
    st.ctx.restore();
  }

  // 3. Headline text
  if (c.headline && c.headline.text) {
    var hFontSize = c.headline.fontSize || 14;
    var hAlign    = c.headline.align    || 'center';
    var hColor    = c.headline.color    || '#c9a84c';
    var yPct      = (c.headline.yPct != null) ? c.headline.yPct : 0.08;
    st.ctx.save();
    st.ctx.font         = 'bold ' + hFontSize + 'px "Cinzel", serif';
    st.ctx.fillStyle    = hColor;
    st.ctx.textAlign    = hAlign;
    st.ctx.textBaseline = 'middle';
    st.ctx.globalAlpha  = 1;
    var hx = (hAlign === 'center' ? 0 : (hAlign === 'left' ? -CW / 2 + 6 : CW / 2 - 6)) + (c.headline.xOff || 0) * CW;
    var hy = -CH / 2 + 12 + hFontSize / 2 + yPct * CH;
    st.ctx.fillText(c.headline.text, hx, hy);
    st.ctx.restore();
  }

  // 4. Body text with word-wrap
  if (c.body && c.body.text) {
    var bFontSize = c.body.fontSize || 9;
    var bColor    = c.body.color    || '#d0c0a0';
    var bYPct     = (c.body.yPct != null) ? c.body.yPct : 0.62;
    var bAlign    = (c.body && c.body.align) || 'center';
    st.ctx.save();
    st.ctx.font         = bFontSize + 'px "Crimson Pro", serif';
    st.ctx.fillStyle    = bColor;
    st.ctx.textAlign    = bAlign;
    st.ctx.textBaseline = 'top';
    st.ctx.globalAlpha  = 1;
    var bMaxW = CW - 20;
    var bx    = (bAlign === 'center' ? 0 : (bAlign === 'left' ? -CW / 2 + 10 : CW / 2 - 10)) + (c.body.xOff || 0) * CW;
    var by    = -CH / 2 + bYPct * CH;
    wrapText(st.ctx, c.body.text, bx, by, bMaxW, bFontSize * 1.4);
    st.ctx.restore();
  }

  // 5. Border
  var bs = resolveBorder(c);
  // Outer stroke with glow
  st.ctx.save();
  st.ctx.shadowColor = bs.accentColor || '#f0d080';
  st.ctx.shadowBlur  = bs.glow || 0;
  st.ctx.strokeStyle = bs.outerStrokeColor || '#c9a84c';
  st.ctx.lineWidth   = bs.thickness || 2;
  st.ctx.beginPath();
  roundRectPath(st.ctx, -CW / 2, -CH / 2, CW, CH, CR);
  st.ctx.stroke();
  st.ctx.restore();
  // Inner stroke
  if (bs.inset > 0) {
    var ins = bs.inset;
    st.ctx.save();
    st.ctx.shadowBlur  = 0;
    st.ctx.strokeStyle = bs.innerStrokeColor || '#8a6a2a';
    st.ctx.lineWidth   = 0.75;
    st.ctx.beginPath();
    roundRectPath(st.ctx, -CW / 2 + ins, -CH / 2 + ins, CW - ins * 2, CH - ins * 2, Math.max(1, CR - ins));
    st.ctx.stroke();
    st.ctx.restore();
  }

  // 6. Corner icons
  var iconSize = CW * 0.115; // ~12.7px at card width
  var iconPad  = CW * 0.085; // ~9.4px from edge
  var iconCorners = [
    { key: 'tl', x: -CW / 2 + iconPad, y: -CH / 2 + iconPad },
    { key: 'tr', x:  CW / 2 - iconPad, y: -CH / 2 + iconPad },
    { key: 'bl', x: -CW / 2 + iconPad, y:  CH / 2 - iconPad },
    { key: 'br', x:  CW / 2 - iconPad, y:  CH / 2 - iconPad },
  ];
  iconCorners.forEach(function(corner) {
    var icon = c.icons && c.icons[corner.key];
    if (!icon || !icon.imgKey) return;
    var img = st.images[icon.imgKey];
    if (!img || !img.complete || !img.naturalWidth) return;
    var color = icon.color || '#ffffff';
    var half = iconSize / 2;
    // Tint: render to offscreen canvas — cached on icon object to avoid alloc every frame
    if (!icon._cache || icon._cacheKey !== (icon.imgKey + color)) {
      var oc = document.createElement('canvas');
      oc.width = 48; oc.height = 48;
      var octx = oc.getContext('2d');
      octx.drawImage(img, 0, 0, 48, 48);
      octx.globalCompositeOperation = 'source-in';
      octx.fillStyle = color;
      octx.fillRect(0, 0, 48, 48);
      icon._cache = oc;
      icon._cacheKey = icon.imgKey + color;
    }
    st.ctx.save();
    st.ctx.shadowColor = color;
    st.ctx.shadowBlur  = 4;
    st.ctx.globalAlpha = 0.92;
    st.ctx.drawImage(icon._cache, corner.x - half, corner.y - half, iconSize, iconSize);
    st.ctx.restore();
  });

  drawSurfaceFX(c, t, CW, CH, CR, hov, isExport);

  // 7. Selection outline
  if (!isExport && st.selectedRef && st.selectedRef.indexOf(c.id) >= 0) {
    st.ctx.save();
    st.ctx.globalAlpha = 1;
    st.ctx.strokeStyle = '#c9a84c';
    st.ctx.lineWidth   = 1.5;
    st.ctx.setLineDash([4, 3]);
    st.ctx.shadowBlur  = 0;
    st.ctx.beginPath();
    roundRectPath(st.ctx, -CW / 2 - 3, -CH / 2 - 3, CW + 6, CH + 6, CR + 3);
    st.ctx.stroke();
    st.ctx.setLineDash([]);
    st.ctx.restore();
  }

  st.ctx.restore();
}

// ── Resize handle drawing ─────────────────────────────────────────────────
// st.HANDLE_SIZE is in AppState
export function drawResizeHandles(c) {
  // Only draw when exactly one text/rect is selected
  if (st.selectedRef.length !== 1) return;
  var rw = c.width || 160, rh = c.height || 100;
  var ax = c._ax || 0, ay = c._ay || 0;
  var handles = [
    { x: -rw/2, y: -rh/2 }, { x: 0, y: -rh/2 }, { x: rw/2, y: -rh/2 },
    { x: -rw/2, y: 0 },                            { x: rw/2, y: 0 },
    { x: -rw/2, y: rh/2 },  { x: 0, y: rh/2 },   { x: rw/2, y: rh/2 }
  ];
  st.ctx.save();
  st.ctx.translate(ax, ay);
  st.ctx.rotate((c.rot || 0) * Math.PI / 180);
  handles.forEach(function(h) {
    st.ctx.beginPath();
    st.ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
    st.ctx.fillStyle = '#fff';
    st.ctx.fill();
    st.ctx.strokeStyle = '#888';
    st.ctx.lineWidth = 1;
    st.ctx.stroke();
  });
  st.ctx.restore();
}

// ============================================================
//  INSPECTOR CONTENT UPDATE
// ============================================================

export function refreshInspectorContent() {
  var empty   = document.getElementById('inspector-empty');
  var content = document.getElementById('inspector-content');
  var textPanel = document.getElementById('inspector-text');
  var rectPanel = document.getElementById('inspector-rect');
  var customPanel = document.getElementById('inspector-custom');

  if (st.selectedIds.length === 0) {
    empty.style.display = 'block'; content.style.display = 'none';
    textPanel.style.display = 'none'; rectPanel.style.display = 'none';
    if (customPanel) customPanel.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  var first = getSelectedCards()[0];
  if (!first) return;

  if (first.kind === 'custom' && !first.finalized) {
    content.style.display = 'none'; textPanel.style.display = 'none'; rectPanel.style.display = 'none';
    if (customPanel) {
      customPanel.style.display = 'block';
      var cbHeader = document.getElementById('cb-sel-header');
      if (cbHeader) cbHeader.textContent = 'Custom Card' + (st.selectedIds.length > 1 ? ' (' + st.selectedIds.length + ')' : '');
    }
    _syncCustomInspector();
    return;
  }

  if (first.kind === 'text') {
    content.style.display = 'none'; rectPanel.style.display = 'none';
    if (customPanel) customPanel.style.display = 'none';
    textPanel.style.display = 'block';
    document.getElementById('text-sel-header').textContent = 'Text Layer' + (st.selectedIds.length > 1 ? ' (' + st.selectedIds.length + ')' : '');
    document.getElementById('inp-text-content').value   = first.content || '';
    document.getElementById('sel-text-font').value      = first.font || 'Cinzel, serif';
    document.getElementById('sl-text-size').value       = first.fontSize || 24;
    document.getElementById('val-text-size').textContent= first.fontSize || 24;
    document.getElementById('pick-text-color').value    = first.color || '#ffffff';
    document.getElementById('sl-text-lh').value         = first.lineHeight || 1.3;
    document.getElementById('val-text-lh').textContent  = (first.lineHeight || 1.3).toFixed(2);
    document.getElementById('sl-text-opacity').value    = first.opacity != null ? first.opacity : 1;
    document.getElementById('val-text-opacity').textContent = (first.opacity != null ? first.opacity : 1).toFixed(2);
    document.getElementById('sl-text-rot').value        = first.rot || 0;
    document.getElementById('val-text-rot').textContent = Math.round(first.rot || 0) + '°';
    document.querySelectorAll('.text-align-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.align === (first.align || 'center'));
    });
    return;
  }

  if (first.kind === 'rect') {
    content.style.display = 'none'; textPanel.style.display = 'none';
    if (customPanel) customPanel.style.display = 'none';
    rectPanel.style.display = 'block';
    document.getElementById('rect-sel-header').textContent = 'Rectangle Layer' + (st.selectedIds.length > 1 ? ' (' + st.selectedIds.length + ')' : '');
    document.getElementById('pick-rect-fill').value          = first.fillColor || '#1a1a2e';
    document.getElementById('sl-rect-fill-opacity').value    = first.fillOpacity != null ? first.fillOpacity : 0.8;
    document.getElementById('val-rect-fill-opacity').textContent = (first.fillOpacity != null ? first.fillOpacity : 0.8).toFixed(2);
    document.getElementById('pick-rect-stroke').value        = first.strokeColor || '#c9a84c';
    document.getElementById('sl-rect-stroke-width').value    = first.strokeWidth != null ? first.strokeWidth : 1;
    document.getElementById('val-rect-stroke-width').textContent = (first.strokeWidth != null ? first.strokeWidth : 1).toFixed(1);
    document.getElementById('sl-rect-stroke-opacity').value  = first.strokeOpacity != null ? first.strokeOpacity : 1;
    document.getElementById('val-rect-stroke-opacity').textContent = (first.strokeOpacity != null ? first.strokeOpacity : 1).toFixed(2);
    document.getElementById('sl-rect-radius').value          = first.cornerRadius || 0;
    document.getElementById('val-rect-radius').textContent   = first.cornerRadius || 0;
    document.getElementById('sl-rect-rot').value             = first.rot || 0;
    document.getElementById('val-rect-rot').textContent      = Math.round(first.rot || 0) + '°';
    return;
  }

  // Card object (including finalized custom cards) — show standard effects inspector
  textPanel.style.display = 'none'; rectPanel.style.display = 'none';
  if (customPanel) customPanel.style.display = 'none';
  content.style.display = 'block';
  document.getElementById('sel-header').textContent = 'Selection (' + st.selectedIds.length + ')';

  // Show "Card Customization" button only for finalized custom cards
  var customizeSection = document.getElementById('custom-card-section');
  var customizeDivider = document.getElementById('custom-card-section-divider');
  var isFinalisedCustom = first.kind === 'custom';
  if (customizeSection) customizeSection.style.display = isFinalisedCustom ? 'block' : 'none';
  if (customizeDivider) customizeDivider.style.display = isFinalisedCustom ? 'block' : 'none';

  // Update surface preview
  refreshSurfacePreview();
  refreshInspectorAssetGrid();

  // Transform
  document.getElementById('sl-scale').value = first.scale;
  document.getElementById('val-scale').textContent = first.scale.toFixed(2) + '×';
  document.getElementById('sl-rot').value = first.rot;
  document.getElementById('val-rot').textContent = Math.round(first.rot) + '°';

  // Glare
  var glareOn = first.glare && first.glare.on;
  var toggleGlare = document.getElementById('toggle-glare');
  toggleGlare.classList.toggle('on', !!glareOn);
  document.getElementById('glare-controls').style.display = glareOn ? 'block' : 'none';
  if (glareOn) {
    document.getElementById('sl-glare').value = first.glare.intensity;
    document.getElementById('val-glare').textContent = (first.glare.intensity || 1).toFixed(1);
  }

  // Drop Shadow
  var shadowOn = first.shadow && first.shadow.on;
  document.getElementById('toggle-shadow').classList.toggle('on', !!shadowOn);
  document.getElementById('shadow-controls').style.display = shadowOn ? 'block' : 'none';
  var sh = first.shadow || {};
  document.getElementById('pick-shadow-color').value = sh.color || '#000000';
  document.getElementById('sl-shadow-opacity').value = sh.opacity != null ? sh.opacity : 0.6;
  document.getElementById('val-shadow-opacity').textContent = (sh.opacity != null ? sh.opacity : 0.6).toFixed(2);
  document.getElementById('sl-shadow-blur').value = sh.blur != null ? sh.blur : 18;
  document.getElementById('val-shadow-blur').textContent = sh.blur != null ? sh.blur : 18;
  document.getElementById('sl-shadow-x').value = sh.offsetX != null ? sh.offsetX : 6;
  document.getElementById('val-shadow-x').textContent = sh.offsetX != null ? sh.offsetX : 6;
  document.getElementById('sl-shadow-y').value = sh.offsetY != null ? sh.offsetY : 10;
  document.getElementById('val-shadow-y').textContent = sh.offsetY != null ? sh.offsetY : 10;

  // Glow
  var glowOn = first.glow && first.glow.on;
  var toggleGlow = document.getElementById('toggle-glow');
  toggleGlow.classList.toggle('on', !!glowOn);
  document.getElementById('glow-controls').style.display = glowOn ? 'block' : 'none';
  if (glowOn) {
    document.getElementById('pick-glow').value = first.glow.color || '#C9A84C';
    document.getElementById('sl-glow').value = first.glow.intensity;
    document.getElementById('val-glow').textContent = (first.glow.intensity || 1).toFixed(1);
  }

  // Spell effects
  var sp = first.spell || {};
  var spellOn = !!sp.on;
  document.getElementById('toggle-spell').classList.toggle('on', spellOn);
  document.getElementById('spell-controls').style.display = spellOn ? 'block' : 'none';
  if (spellOn || sp.preset) {
    var spPreset = sp.preset || 'fire';
    document.querySelectorAll('.spell-preset-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.preset === spPreset);
    });
    document.getElementById('pick-spell-color').value = sp.color || SPELL_PRESETS[spPreset].color;
    document.getElementById('sl-spell-intensity').value = sp.intensity != null ? sp.intensity : 1;
    document.getElementById('val-spell-intensity').textContent = (sp.intensity != null ? sp.intensity : 1).toFixed(1);
    document.getElementById('sl-spell-count').value = sp.count != null ? sp.count : 40;
    document.getElementById('val-spell-count').textContent = sp.count != null ? sp.count : 40;
    document.getElementById('sl-spell-size').value = sp.size != null ? sp.size : 2;
    document.getElementById('val-spell-size').textContent = (sp.size != null ? sp.size : 2).toFixed(1);
    document.getElementById('sl-spell-speed').value = sp.speed != null ? sp.speed : 1;
    document.getElementById('val-spell-speed').textContent = (sp.speed != null ? sp.speed : 1).toFixed(1);
    document.getElementById('sl-spell-spread').value = sp.spread != null ? sp.spread : 0.5;
    document.getElementById('val-spell-spread').textContent = (sp.spread != null ? sp.spread : 0.5).toFixed(2);
    document.getElementById('sl-spell-scale').value = sp.nwScale != null ? sp.nwScale : 1;
    document.getElementById('val-spell-scale').textContent = (sp.nwScale != null ? sp.nwScale : 1).toFixed(2);
    document.getElementById('sl-spell-bgopacity').value = sp.nwBgOpacity != null ? sp.nwBgOpacity : 0.35;
    document.getElementById('val-spell-bgopacity').textContent = (sp.nwBgOpacity != null ? sp.nwBgOpacity : 0.35).toFixed(2);
    var spShape = sp.shape || SPELL_PRESETS[spPreset].shape;
    document.querySelectorAll('.shape-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.shape === spShape);
    });
    _syncSpellPresetUI(spPreset);
  }

  // Surface FX
  function syncSfx(key, toggleId, controlsId, defaults) {
    var fx = first[key] || {};
    var on = !!fx.on;
    document.getElementById(toggleId).classList.toggle('on', on);
    document.getElementById(controlsId).style.display = on ? 'block' : 'none';
    if (on) {
      Object.keys(defaults).forEach(function(k) {
        var el = document.getElementById('sl-'+key+'-'+k) || document.getElementById('sel-'+key+'-'+k) || document.getElementById('pick-'+key+'-'+k);
        if (!el) return;
        var v = fx[k] != null ? fx[k] : defaults[k];
        el.value = v;
        var valEl = document.getElementById('val-'+key+'-'+k);
        if (valEl) valEl.textContent = typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v;
      });
    }
  }
  syncSfx('shimmer', 'toggle-shimmer', 'shimmer-controls', { opacity:0.22, width:0.2, speed:0.7, bands:2 });
  syncSfx('luster',  'toggle-luster',  'luster-controls',  { opacity:0.35, radius:0.75, pulse:0.3 });
  syncSfx('grain',   'toggle-grain',   'grain-controls',   { amount:0.12, scale:1.0, anim:0.4 });
  syncSfx('ripple',  'toggle-ripple',  'ripple-controls',  { opacity:0.18, speed:0.8, rings:3, spread:0.5 });
  syncSfx('holo', 'toggle-holo', 'holo-controls', { mode:'glass', intensity:1.0, iridescence:0.6, speed:1.0, size:2.0, refX:0, refY:0, refScale:1.0 });
  // Show/hide mode-specific sub-panels
  (function() {
    var hoFx   = first.holo || {};
    var hoMode = hoFx.mode || 'glass';
    var glassDiv = document.getElementById('holo-glass-controls');
    var sizeRow  = document.getElementById('holo-size-row');
    var isOn = !!hoFx.on;
    if (glassDiv) glassDiv.style.display = (isOn && hoMode === 'glass') ? 'block' : 'none';
    if (sizeRow)  sizeRow.style.display  = (isOn && (hoMode === 'sparkle' || hoMode === 'hex')) ? 'flex' : 'none';
  }());
}

export function refreshSurfacePreview() {
  var first = getSelectedCards()[0];
  if (!first) return;
  var preview = document.getElementById('surface-preview');
  var key = st.activeSurface === 'front' ? first.frontImg : first.backImg;
  if (key && st.images[key]) {
    preview.innerHTML = '';
    var img = document.createElement('img');
    img.src = st.images[key].src || st.images[key];
    preview.appendChild(img);
  } else {
    preview.innerHTML = '<div class="empty-hint">No image<br><span style="font-size:9px; color:var(--muted);">Upload or choose from library</span></div>';
  }
}

export function refreshInspectorAssetGrid() {
  var grid = document.getElementById('inspector-asset-grid');
  var ids = Object.keys(st.images).filter(function(id) { return id !== '__bg__' && id.indexOf('preset:') !== 0 && id.indexOf('icon_upload_') !== 0; });
  if (ids.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; font-size:11px; color:var(--muted); font-style:italic; padding:8px 0;">No assets</div>';
    return;
  }
  grid.innerHTML = '';
  ids.forEach(function(id) {
    var thumb = document.createElement('div');
    thumb.className = 'asset-thumb';
    var img2 = document.createElement('img');
    img2.src = st.images[id].src || st.images[id];
    thumb.appendChild(img2);
    thumb.addEventListener('click', function() { applySurface(id); });
    grid.appendChild(thumb);
  });
}

export function applySurface(imgId) {
  getSelectedCards().forEach(function(c) {
    if (st.activeSurface === 'front') c.frontImg = imgId;
    else c.backImg = imgId;
    // Invalidate holo sampling and ghost caches — image changed
  });
  markDirty();
  refreshSurfacePreview();
}

document.getElementById('toggle-shadow').addEventListener('click', function() {
  getSelectedCards().forEach(function(c) { getOrInitShadow(c).on = !getOrInitShadow(c).on; });
  updateInspector();
});
document.getElementById('pick-shadow-color').addEventListener('input', function() {
  var v = this.value;
  getSelectedCards().forEach(function(c) { getOrInitShadow(c).color = v; });
});
document.getElementById('sl-shadow-opacity').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-shadow-opacity').textContent = v.toFixed(2);
  getSelectedCards().forEach(function(c) { getOrInitShadow(c).opacity = v; });
});
document.getElementById('sl-shadow-blur').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-shadow-blur').textContent = v;
  getSelectedCards().forEach(function(c) { getOrInitShadow(c).blur = v; });
});
document.getElementById('sl-shadow-x').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-shadow-x').textContent = v;
  getSelectedCards().forEach(function(c) { getOrInitShadow(c).offsetX = v; });
});
document.getElementById('sl-shadow-y').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-shadow-y').textContent = v;
  getSelectedCards().forEach(function(c) { getOrInitShadow(c).offsetY = v; });
});

// Toggle glow
document.getElementById('toggle-glow').addEventListener('click', function() {
  getSelectedCards().forEach(function(c) {
    if (!c.glow) c.glow = { on: false, color: '#C9A84C', intensity: 1 };
    c.glow.on = !c.glow.on;
  });
  updateInspector();
});
document.getElementById('sl-glow').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-glow').textContent = v.toFixed(1);
  getSelectedCards().forEach(function(c) { if (c.glow) c.glow.intensity = v; });
});
document.getElementById('pick-glow').addEventListener('input', function() {
  var v = this.value;
  getSelectedCards().forEach(function(c) { if (c.glow) c.glow.color = v; });
});

// ---- Spell Effects ----
export function getOrInitSpell(card) {
  if (!card.spell) {
    card.spell = {
      on: false, preset: 'fire', color: SPELL_PRESETS.fire.color,
      intensity: 1, count: 40, size: 2, speed: 1, spread: 0.5,
      shape: SPELL_PRESETS.fire.shape
    };
  }
  return card.spell;
}

document.getElementById('toggle-spell').addEventListener('click', function() {
  getSelectedCards().forEach(function(c) {
    var sp = getOrInitSpell(c);
    sp.on = !sp.on;
    // Clear pool on disable so particles vanish cleanly
    if (!sp.on) clearParticlePool(c.id);
  });
  updateInspector();
});

// ── Sync spell UI chrome to a specific preset ──────────────────────────────
// Updates slider labels and hides/shows sections that are irrelevant per preset.
function _syncSpellPresetUI(preset) {
  // "BG Opacity" row label changes meaning per preset
  var bgOpEl = document.getElementById('sl-spell-bgopacity');
  if (bgOpEl && bgOpEl.previousElementSibling) {
    var labelMap = { fire: 'Glow Strength', shadow: 'Thickness', arc: 'Border Glow', neural: 'BG Opacity' };
    bgOpEl.previousElementSibling.textContent = labelMap[preset] || 'BG Opacity';
  }
  // "Scale" row is only meaningful for fire/shadow/neural
  var scaleRow = document.getElementById('sl-spell-scale');
  if (scaleRow && scaleRow.closest('.slider-row')) {
    scaleRow.closest('.slider-row').style.display = '';
  }
  // Shape section hidden for neural (neural has no particle loop)
  var shapeSection = document.getElementById('spell-shape-btns');
  var shapeWrap = shapeSection && shapeSection.parentElement;
  if (shapeWrap) shapeWrap.style.display = preset === 'neural' ? 'none' : '';
}

document.querySelectorAll('.spell-preset-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var preset = btn.dataset.preset;
    var pd = SPELL_PRESETS[preset];
    // Per-preset sensible defaults for count/size/speed/intensity
    var presetDefaults = {
      fire:      { count: 60, size: 2.2, speed: 1.1, intensity: 1.2, nwBgOpacity: 1.0 },
      nature:    { count: 40, size: 2.0, speed: 0.9, intensity: 1.0 },
      moonlight: { count: 35, size: 2.5, speed: 0.7, intensity: 1.0 },
      shadow:    { count: 30, size: 4.5, speed: 0.6, intensity: 1.1, nwBgOpacity: 0.5 },
      arc:       { count: 80, size: 1.8, speed: 0.7, intensity: 1.1, nwBgOpacity: 0.5 },
      neural:    {}
    };
    var pd2 = presetDefaults[preset] || {};
    getSelectedCards().forEach(function(c) {
      var sp = getOrInitSpell(c);
      sp.preset = preset;
      sp.color = pd.color;
      sp.shape = pd.shape;
      sp.spread = pd.spread;
      if (pd2.count      != null) sp.count      = pd2.count;
      if (pd2.size       != null) sp.size        = pd2.size;
      if (pd2.speed      != null) sp.speed       = pd2.speed;
      if (pd2.intensity  != null) sp.intensity   = pd2.intensity;
      if (pd2.nwBgOpacity!= null) sp.nwBgOpacity = pd2.nwBgOpacity;
      // Reset particle pool so new preset starts fresh
      clearParticlePool(c.id);
    });
    // Sync sliders to new defaults
    if (pd2.count      != null) { document.getElementById('sl-spell-count').value      = pd2.count;      document.getElementById('val-spell-count').textContent      = pd2.count; }
    if (pd2.size       != null) { document.getElementById('sl-spell-size').value        = pd2.size;       document.getElementById('val-spell-size').textContent       = pd2.size.toFixed(1); }
    if (pd2.speed      != null) { document.getElementById('sl-spell-speed').value       = pd2.speed;      document.getElementById('val-spell-speed').textContent      = pd2.speed.toFixed(1); }
    if (pd2.intensity  != null) { document.getElementById('sl-spell-intensity').value   = pd2.intensity;  document.getElementById('val-spell-intensity').textContent  = pd2.intensity.toFixed(1); }
    if (pd2.nwBgOpacity!= null) { document.getElementById('sl-spell-bgopacity').value   = pd2.nwBgOpacity; document.getElementById('val-spell-bgopacity').textContent = pd2.nwBgOpacity.toFixed(2); }
    // Update color picker and shape buttons to match preset
    document.getElementById('pick-spell-color').value = pd.color;
    document.querySelectorAll('.shape-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.shape === pd.shape);
    });
    document.querySelectorAll('.spell-preset-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.preset === preset);
    });
    // Update slider labels and show/hide shape section based on preset
    _syncSpellPresetUI(preset);
  });
});

document.getElementById('pick-spell-color').addEventListener('input', function() {
  var v = this.value;
  getSelectedCards().forEach(function(c) { var sp = getOrInitSpell(c); sp.color = v; clearParticlePool(c.id); });
});

document.getElementById('sl-spell-intensity').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-spell-intensity').textContent = v.toFixed(1);
  getSelectedCards().forEach(function(c) { getOrInitSpell(c).intensity = v; });
});

document.getElementById('sl-spell-count').addEventListener('input', function() {
  var v = parseInt(this.value);
  document.getElementById('val-spell-count').textContent = v;
  getSelectedCards().forEach(function(c) { getOrInitSpell(c).count = v; });
});

document.getElementById('sl-spell-size').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-spell-size').textContent = v.toFixed(1);
  getSelectedCards().forEach(function(c) { getOrInitSpell(c).size = v; });
});

document.getElementById('sl-spell-speed').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-spell-speed').textContent = v.toFixed(1);
  getSelectedCards().forEach(function(c) { getOrInitSpell(c).speed = v; });
});

document.getElementById('sl-spell-spread').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-spell-spread').textContent = v.toFixed(2);
  getSelectedCards().forEach(function(c) { getOrInitSpell(c).spread = v; });
});

document.getElementById('sl-spell-scale').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-spell-scale').textContent = v.toFixed(2);
  getSelectedCards().forEach(function(c) { getOrInitSpell(c).nwScale = v; });
});

document.getElementById('sl-spell-bgopacity').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-spell-bgopacity').textContent = v.toFixed(2);
  getSelectedCards().forEach(function(c) { getOrInitSpell(c).nwBgOpacity = v; });
});

document.querySelectorAll('.shape-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var shape = btn.dataset.shape;
    getSelectedCards().forEach(function(c) { var sp = getOrInitSpell(c); sp.shape = shape; clearParticlePool(c.id); });
    document.querySelectorAll('.shape-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.shape === shape); });
  });
});

// ── Surface FX handlers ──────────────────────────────────────────────────
export function makeSfxHandlers(key, toggleId, defaults) {
  // Toggle
  document.getElementById(toggleId).addEventListener('click', function() {
    getSelectedCards().forEach(function(c) {
      if (!c[key]) c[key] = Object.assign({ on: false }, defaults);
      c[key].on = !c[key].on;
      if (key === 'holo') { delete c._holoCache; }
    });
    updateInspector();
  });
  // Sliders
  Object.keys(defaults).forEach(function(k) {
    var slId = 'sl-' + key + '-' + k;
    var valId = 'val-' + key + '-' + k;
    var el = document.getElementById(slId);
    if (el) {
      el.addEventListener('input', function() {
        var v = parseFloat(this.value);
        var valEl = document.getElementById(valId);
        if (valEl) valEl.textContent = Number.isInteger(Math.round(v)) && (el.step === '1' || el.step === '0') ? Math.round(v) : v.toFixed(2);
        getSelectedCards().forEach(function(c) {
          if (!c[key]) c[key] = Object.assign({ on: false }, defaults);
          c[key][k] = v;
          // Holo: invalidate sparkle cache when size changes (count depends on size)
          if (key === 'holo' && k === 'size') { delete c._holoCache; }
        });
      });
    }
  });
  // Blend select
  var selEl = document.getElementById('sel-' + key + '-blend');
  if (selEl) {
    selEl.addEventListener('change', function() {
      var v = this.value;
      getSelectedCards().forEach(function(c) {
        if (!c[key]) c[key] = Object.assign({ on: false }, defaults);
        c[key].blend = v;
      });
    });
  }
  // Color picker
  var pickEl = document.getElementById('pick-' + key + '-color');
  if (pickEl) {
    pickEl.addEventListener('input', function() {
      var v = this.value;
      getSelectedCards().forEach(function(c) {
        if (!c[key]) c[key] = Object.assign({ on: false }, defaults);
        c[key].color = v;
      });
    });
  }
}

makeSfxHandlers('shimmer', 'toggle-shimmer', { opacity:0.22, width:0.2, speed:0.7, bands:2 });
makeSfxHandlers('luster',  'toggle-luster',  { opacity:0.35, radius:0.75, pulse:0.3 });
makeSfxHandlers('grain',   'toggle-grain',   { amount:0.12, scale:1.0, anim:0.4 });
makeSfxHandlers('ripple',  'toggle-ripple',  { opacity:0.18, speed:0.8, rings:3, spread:0.5 });
makeSfxHandlers('holo', 'toggle-holo', { intensity:1.0, iridescence:0.6, speed:1.0, size:2.0, refX:0, refY:0, refScale:1.0 });

// Holo mode select + glass controls visibility
(function() {
  var modeEl = document.getElementById('sel-holo-mode');
  if (!modeEl) return;

  function applyHoloModeUI(mode, isOn) {
    var glassDiv = document.getElementById('holo-glass-controls');
    var sizeRow  = document.getElementById('holo-size-row');
    if (glassDiv) glassDiv.style.display = (isOn && mode === 'glass') ? 'block' : 'none';
    if (sizeRow)  sizeRow.style.display  = (isOn && (mode === 'sparkle' || mode === 'hex')) ? 'flex' : 'none';
  }

  modeEl.addEventListener('change', function() {
    var v = this.value;
    getSelectedCards().forEach(function(c) {
      if (!c.holo) c.holo = { on: false, blend: 'screen' };
      c.holo.mode = v;
      delete c._holoCache;
    });
    applyHoloModeUI(v, true);
  });
}());

// Glare toggle (missing handler)
document.getElementById('toggle-glare').addEventListener('click', function() {
  getSelectedCards().forEach(function(c) {
    if (!c.glare) c.glare = { on: false, intensity: 1 };
    c.glare.on = !c.glare.on;
  });
  updateInspector();
});
document.getElementById('sl-glare').addEventListener('input', function() {
  var v = parseFloat(this.value);
  document.getElementById('val-glare').textContent = v.toFixed(1);
  getSelectedCards().forEach(function(c) { if (c.glare) c.glare.intensity = v; });
});

// Flip / Delete / Deselect
document.getElementById('btn-flip').addEventListener('click', function() {
  getSelectedCards().forEach(function(c) { c.showBack = !c.showBack; });
  refreshSurfacePreview();
});
document.getElementById('btn-delete-sel').addEventListener('click', function() {
  st.selectedIds.forEach(function(id) { delete st.sequences[id]; });
  st.cards = st.cards.filter(function(c) { return st.selectedIds.indexOf(c.id) < 0; });
  st.selectedIds = [];
  syncRefs(); updateCardCount(); hideEmpty(); updateInspector(); renderLayers();
  calcTotalDuration(); renderTimeline();
});
document.getElementById('btn-deselect').addEventListener('click', deselectAll);

// Upload surface
document.getElementById('btn-upload-surface').addEventListener('click', function() {
  document.getElementById('file-surface').click();
});
document.getElementById('file-surface').addEventListener('change', function() {
  var file = this.files[0]; if (!file) return;
  var id = 'a' + (st.nextAssetId++);
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image(); img.src = e.target.result;
    st.images[id] = img;
    applySurface(id);
    refreshAssetGrids();
    refreshSurfacePreview();
    renderLayers();
  };
  reader.readAsDataURL(file);
  this.value = '';
});

document.getElementById('btn-clear-surface').addEventListener('click', function() {
  getSelectedCards().forEach(function(c) {
    if (st.activeSurface === 'front') c.frontImg = null;
    else c.backImg = null;
  });
  refreshSurfacePreview();
});

// ============================================================
//  LEFT PANEL — ADD CARDS & ASSETS
// ============================================================
document.getElementById('btn-blank-card').addEventListener('click', function() {
  createCard(null);
  syncRefs();
});

document.getElementById('btn-custom-card').addEventListener('click', function() {
  var c = createCustomCard();
  selectCard(c.id, false);
  showToast('Custom card added');
});

// ── Card Customization button (in standard effects inspector) ─────────────
document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'btn-card-customize') {
    var sel = getSelectedCards();
    var c = sel[0];
    if (c && c.kind === 'custom') {
      c.finalized = false;
      refreshInspectorContent();
    }
  }
});

// ── Transform sliders (scale + rotation) ─────────────────────────────────
(function() {
  function applyTransform(key, val) {
    getSelectedCards().forEach(function(c) { c[key] = val; });
    markDirty();
  }

  var slScale = document.getElementById('sl-scale');
  if (slScale) slScale.addEventListener('input', function() {
    applyTransform('scale', parseFloat(this.value));
    var v = document.getElementById('val-scale');
    if (v) v.textContent = parseFloat(this.value).toFixed(2) + '×';
  });

  var slRot = document.getElementById('sl-rot');
  if (slRot) slRot.addEventListener('input', function() {
    applyTransform('rot', parseFloat(this.value));
    var v = document.getElementById('val-rot');
    if (v) v.textContent = Math.round(this.value) + '°';
  });

  document.querySelectorAll('[data-rot]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var val = parseFloat(this.dataset.rot);
      applyTransform('rot', val);
      if (slRot) slRot.value = val;
      var v = document.getElementById('val-rot');
      if (v) v.textContent = val + '°';
    });
  });
}());

// ── Add Text / Add Rect buttons ───────────────────────────────────────────
document.getElementById('btn-add-text').addEventListener('click', function() {
  var obj = createText();
  st.selectedIds = [obj.id]; syncRefs(); updateInspector(); renderLayers(); markDirty();
});
document.getElementById('btn-add-rect').addEventListener('click', function() {
  var obj = createRect();
  st.selectedIds = [obj.id]; syncRefs(); updateInspector(); renderLayers(); markDirty();
});

// ── Text inspector handlers ───────────────────────────────────────────────
document.getElementById('btn-delete-text').addEventListener('click', function() {
  st.cards = st.cards.filter(function(c) { return st.selectedIds.indexOf(c.id) < 0; });
  st.selectedIds = []; syncRefs(); updateCardCount(); hideEmpty(); updateInspector(); renderLayers(); markDirty();
});
document.getElementById('btn-deselect-text').addEventListener('click', function() { deselectAll(); });

document.getElementById('inp-text-content').addEventListener('input', function() {
  var v = this.value;
  getSelectedCards().forEach(function(c) { if (c.kind === 'text') { c.content = v; } });
  markDirty();
});
document.getElementById('sel-text-font').addEventListener('change', function() {
  var v = this.value;
  getSelectedCards().forEach(function(c) { if (c.kind === 'text') c.font = v; });
  markDirty();
});
(function() {
  var sliders = [
    { id:'sl-text-size',    val:'val-text-size',    prop:'fontSize',   fmt:function(v){return Math.round(v);} },
    { id:'sl-text-lh',      val:'val-text-lh',      prop:'lineHeight',  fmt:function(v){return v.toFixed(2);} },
    { id:'sl-text-opacity', val:'val-text-opacity',  prop:'opacity',    fmt:function(v){return v.toFixed(2);} },
    { id:'sl-text-rot',     val:'val-text-rot',      prop:'rot',        fmt:function(v){return Math.round(v)+'°';} },
  ];
  sliders.forEach(function(s) {
    document.getElementById(s.id).addEventListener('input', function() {
      var v = parseFloat(this.value);
      document.getElementById(s.val).textContent = s.fmt(v);
      getSelectedCards().forEach(function(c) { if (c.kind === 'text') c[s.prop] = v; });
      markDirty();
    });
  });
})();
document.getElementById('pick-text-color').addEventListener('input', function() {
  var v = this.value;
  getSelectedCards().forEach(function(c) { if (c.kind === 'text') c.color = v; });
  markDirty();
});
document.querySelectorAll('.text-align-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var v = this.dataset.align;
    document.querySelectorAll('.text-align-btn').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    getSelectedCards().forEach(function(c) { if (c.kind === 'text') c.align = v; });
    markDirty();
  });
});

// ── Rect inspector handlers ───────────────────────────────────────────────
document.getElementById('btn-delete-rect').addEventListener('click', function() {
  st.cards = st.cards.filter(function(c) { return st.selectedIds.indexOf(c.id) < 0; });
  st.selectedIds = []; syncRefs(); updateCardCount(); hideEmpty(); updateInspector(); renderLayers(); markDirty();
});
document.getElementById('btn-deselect-rect').addEventListener('click', function() { deselectAll(); });

(function() {
  var sliders = [
    { id:'sl-rect-fill-opacity',   val:'val-rect-fill-opacity',   prop:'fillOpacity',   fmt:function(v){return v.toFixed(2);} },
    { id:'sl-rect-stroke-width',   val:'val-rect-stroke-width',   prop:'strokeWidth',   fmt:function(v){return v.toFixed(1);} },
    { id:'sl-rect-stroke-opacity', val:'val-rect-stroke-opacity', prop:'strokeOpacity', fmt:function(v){return v.toFixed(2);} },
    { id:'sl-rect-radius',         val:'val-rect-radius',         prop:'cornerRadius',  fmt:function(v){return Math.round(v);} },
    { id:'sl-rect-rot',            val:'val-rect-rot',            prop:'rot',           fmt:function(v){return Math.round(v)+'°';} },
  ];
  sliders.forEach(function(s) {
    document.getElementById(s.id).addEventListener('input', function() {
      var v = parseFloat(this.value);
      document.getElementById(s.val).textContent = s.fmt(v);
      getSelectedCards().forEach(function(c) { if (c.kind === 'rect') c[s.prop] = v; });
      markDirty();
    });
  });
})();
document.getElementById('pick-rect-fill').addEventListener('input', function() {
  var v = this.value;
  getSelectedCards().forEach(function(c) { if (c.kind === 'rect') c.fillColor = v; });
  markDirty();
});
document.getElementById('pick-rect-stroke').addEventListener('input', function() {
  var v = this.value;
  getSelectedCards().forEach(function(c) { if (c.kind === 'rect') c.strokeColor = v; });
  markDirty();
});

document.getElementById('btn-upload-asset').addEventListener('click', function() {
  document.getElementById('file-upload').click();
});
document.getElementById('file-upload').addEventListener('change', function() {
  Array.from(this.files).forEach(function(file) {
    var id = 'a' + (st.nextAssetId++);
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image(); img.src = e.target.result;
      st.images[id] = img;
      img.onload = function() { refreshAssetGrids(); };
      // Spawn card
      var c = createCard(id);
      selectCard(c.id, false);
    };
    reader.readAsDataURL(file);
  });
  this.value = '';
});

function deleteAsset(id) {
  delete st.images[id];
  // Clear from any st.cards using it
  st.cards.forEach(function(c) {
    if (c.frontImg === id) c.frontImg = null;
    if (c.backImg === id) c.backImg = null;
  });
  refreshAssetGrids();
  markDirty();
}
