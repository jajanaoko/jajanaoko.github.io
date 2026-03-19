// ============================================================
//  ARCANA GLAM — Timeline  (timeline.js)
//  Playback, keyframes, scrubbing, animation presets,
//  step editor, easing functions.
// ============================================================

import { AppState as st } from './state.js';
import { markDirty, showToast } from './app.js';
import { renderLayers, selectCard } from './layers.js';
import { updateInspector } from './app.js';

export function setPlayState(on) {
  st.isPlaying = !!on;

  var playBtn = document.getElementById('btn-play');
  if (playBtn) {
    playBtn.textContent = st.isPlaying ? '❚❚' : '▶';
    playBtn.classList.toggle('active', st.isPlaying);
  }
}

// Play / Pause
(function wirePlaybackControls(){
  var playBtn = document.getElementById('btn-play');
  var stopBtn = document.getElementById('btn-stop');
  var loopBtn = document.getElementById('btn-loop');

  if (playBtn) playBtn.addEventListener('click', function() {
    // Ensure duration is up to date
    calcTotalDuration();

    if (!st.isPlaying) {
      // Start (or resume) from current st.playhead
      st.playStart = performance.now() - st.playhead;
      st._sceneFreezeCache = {};
      resetAnimOffsets();
      setPlayState(true);
    } else {
      // Pause
      setPlayState(false);
    }
  });

  if (stopBtn) stopBtn.addEventListener('click', function() {
    setPlayState(false);
    st._sceneFreezeCache = {};
    st.playhead = 0;
    updateScrubber();
    resetAnimOffsets();
    applyAnimations(0);
    updateActiveBlocks();
  });

  if (loopBtn) loopBtn.addEventListener('click', function() {
    st.loopMode = !st.loopMode;
    this.classList.toggle('active', st.loopMode);
  });
})();
// Surface tab — st.activeSurface is managed in AppState

export function easeOutCubic(t)    { return 1 - Math.pow(1 - t, 3); }
export function easeOutQuint(t)    { return 1 - Math.pow(1 - t, 5); }
export function easeInQuad(t)      { return t * t; }
export function easeInOutSine(t)   { return -(Math.cos(Math.PI * t) - 1) / 2; }
export function easeInOutQuart(t)  { return t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2,4)/2; }
export function easeInOutCubic(t)  { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

// Overshoot — matches CSS easeOutBack
export function easeOutBack(t) {
  var c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Elastic snap — matches CSS easeOutElastic
export function easeOutElastic(t) {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10*t) * Math.sin((t*10 - 0.75) * (2*Math.PI) / 3) + 1;
}

// Direct match for cubic-bezier(0.26, 0.53, 0.74, 1.48) from the Card Reveal example
// Solved numerically via De Casteljau — overshoots to ~1.08 at t≈0.75
export function easePopBezier(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Newton-Raphson solve: find s where Bx(s) = t, then return By(s)
  // Control points: P0=(0,0) P1=(0.26,0.53) P2=(0.74,1.48) P3=(1,1)
  var p1x = 0.26, p1y = 0.53, p2x = 0.74, p2y = 1.48;
  var s = t; // initial guess
  for (var i = 0; i < 8; i++) {
    var bx = 3*(1-s)*(1-s)*s*p1x + 3*(1-s)*s*s*p2x + s*s*s - t;
    var dbx = 3*(1-s)*(1-s)*p1x + 6*(1-s)*s*(p2x-p1x) + 3*s*s*(1-p2x);
    if (Math.abs(dbx) < 1e-9) break;
    s -= bx / dbx;
    s = Math.max(0, Math.min(1, s));
  }
  return 3*(1-s)*(1-s)*s*p1y + 3*(1-s)*s*s*p2y + s*s*s;
}

// Damped spring — smooth oscillation settling at 1, great for looping
export function easeSpring(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.exp(-5.5*t) * Math.cos(t * Math.PI * 4.5);
}

function easeLinear(t) { return t; }

export function getEasingFn(name) {
  return {
    linear:        easeLinear,
    easeOutCubic:  easeOutCubic,
    easeOutQuint:  easeOutQuint,
    easeInQuad:    easeInQuad,
    easeInOutSine: easeInOutSine,
    easeInOutQuart:easeInOutQuart,
    easeInOutCubic:easeInOutCubic,
    easeOutBack:   easeOutBack,
    easeOutElastic:easeOutElastic,
    easePopBezier: easePopBezier,
    easeSpring:    easeSpring
  }[name] || easeOutCubic;
}

// ── Preset catalogue ──────────────────────────────────────────
export var PRESET_DEFAULTS = {
  Pop:    { duration:  700, easing: 'easePopBezier',  params: { startScale: 0.4, startY: 40 } },
  Float:  { duration: 3200, easing: 'easeInOutSine',  params: { rise: 22, sway: 6, tilt: 2.5 } },
  Flip:   { duration: 1200, easing: 'easeInOutQuart', params: { lift: 20, rotateZ: 0 } },
  Orbit:  { duration: 5000, easing: 'linear',         params: { radius: 55, tiltAngle: 15, orbitOffset: 0, sequenceGap: 0.25 } },
  Ignite: { duration: 1800, easing: 'easeOutQuint',   params: { scaleBloom: 1.22, liftHeight: 0.28, spin: 8, direction: 'up' } },
  Deal:   { duration: 1000, easing: 'easeOutBack',    params: { direction: 'left', distance: 0.7, spinIn: 6 } },
  Tap:    { duration:  500, easing: 'easeOutBack',    params: { lift: 10, squish: 0.07 } },
  Untap:  { duration:  500, easing: 'easeOutBack',    params: { lift: 10, squish: 0.07 } },
  Play:   { duration:  800, easing: 'easeOutBack',    params: { direction: 'top', fromY: -120, slamScale: 1.08, slamSpin: 4, impactSquash: 0.12 } },
  Wait:   { duration:  500, easing: 'linear',         params: { mode: 'preserve' } },
  Scene:  { duration: 1000, easing: 'easeInOutCubic', params: { targetSlot: 1, animateEffects: true, animateBg: true, fuse: true, leadMs: 0 } }
};

// ── Per-preset parameter schema — defined later after timeline code ─

// ── Preset implementations ────────────────────────────────────
export function applyPreset(card, name, params, progress, easingName) {

  var p = Math.max(0, Math.min(1, progress));
  var ease = getEasingFn(easingName || (PRESET_DEFAULTS[name] && PRESET_DEFAULTS[name].easing));

  // Always reset before applying
  card._ax = 0; card._ay = 0; card._ar = 0; card._as = 1; card._ao = 1; card._orbitDepth = null;

  // ── POP ──────────────────────────────────────────────────────
  if (name === 'Pop') {
    var ep = ease(p);
    var fromScale = params.startScale != null ? params.startScale : 0.4;
    var fromY     = params.startY     != null ? params.startY     : 40;
    card._as = fromScale + (1 - fromScale) * ep;
    card._ay = fromY * (1 - ep);
    card._ao = Math.min(1, p * 4);
    card._ax = 0; card._ar = 0;

  // ── FLOAT ────────────────────────────────────────────────────
  } else if (name === 'Float') {
    var cycle = p * Math.PI * 2;
    var rise = params.rise != null ? params.rise : 22;
    var sway = params.sway != null ? params.sway : 6;
    var tilt = params.tilt != null ? params.tilt : 2.5;
    card._ay = -rise  * Math.sin(cycle);
    card._ax =  sway  * Math.sin(cycle * 0.5);
    card._ar =  tilt  * Math.sin(cycle + 0.4);
    card._as = 1 + 0.025 * Math.sin(cycle);
    card._ao = 1;

  // ── FLIP ─────────────────────────────────────────────────────
  } else if (name === 'Flip') {
    var lift      = params.lift    != null ? params.lift    : 20;
    var spinZ     = params.rotateZ != null ? params.rotateZ : 0;
    var ep2 = ease(p);
    var angle2 = ep2 * 180;
    var cosA  = Math.cos(angle2 * Math.PI / 180);
    card._as  = Math.max(0.01, Math.abs(cosA));
    card._ay  = -lift * Math.sin(ep2 * Math.PI);
    card._ar  = spinZ * ep2;
    card._ax  = 0; card._ao = 1;
    if (ep2 >= 0.5 && !card._flipDone) { card._flipDone = true; card.showBack = !card.showBack; }
    if (p < 0.02) card._flipDone = false;

  // ── ORBIT ────────────────────────────────────────────────────
  } else if (name === 'Orbit') {
    var radius    = params.radius     != null ? params.radius     : 55;
    var tiltDeg   = params.tiltAngle  != null ? params.tiltAngle  : 15;
    var orbitOff  = params.orbitOffset != null ? params.orbitOffset : 0;
    var tiltRad   = tiltDeg * Math.PI / 180;
    var theta     = (p + orbitOff) * Math.PI * 2;
    card._ax =  radius * Math.sin(theta);
    card._ay =  radius * Math.cos(theta) * Math.sin(tiltRad);
    var depthFactor = (1 + Math.cos(theta) * Math.cos(tiltRad)) * 0.5;
    card._as = 0.72 + 0.28 * depthFactor;
    card._ar = -10 * Math.sin(theta);
    card._ao = 1;
    card._orbitDepth = depthFactor; // used for z-sort

  // ── IGNITE ───────────────────────────────────────────────────
  } else if (name === 'Ignite') {
    var bloom     = params.scaleBloom  != null ? params.scaleBloom  : 1.22;
    var liftFrac  = params.liftHeight  != null ? params.liftHeight  : 0.28;
    var spin      = params.spin        != null ? params.spin        : 8;
    var igDir     = params.direction   || 'up';
    var liftPx    = liftFrac * (st.canvas.clientHeight || st.canvas.height) * 0.5;
    // Direction vector: where the card travels to
    var igDX = (igDir === 'left' ? -1 : igDir === 'right' ? 1 : 0);
    var igDY = (igDir === 'down' ? 1 : igDir === 'up' ? -1 : 0);
    if (p < 0.18) {
      var cp = p / 0.18; var ce = easeInOutSine(cp);
      card._as = 1 - 0.06 * ce;
      card._ax = -igDX * 8 * ce;
      card._ay = (igDY !== 0 ? igDY * 10 : 10) * ce;
      card._ar = -spin * 0.4 * ce * (igDX !== 0 ? (igDX > 0 ? -1 : 1) : 1);
    } else if (p < 0.55) {
      var bp = (p - 0.18) / 0.37; var be = easeOutQuint(bp);
      card._as = 1 + (bloom - 1) * Math.sin(bp * Math.PI);
      card._ax = igDX * liftPx * be;
      card._ay = (igDY !== 0 ? igDY : 1) * -liftPx * be + (igDY !== 0 ? 0 : 10);
      card._ar = spin * be * (igDX !== 0 ? (igDX > 0 ? 1 : -1) : 1);
    } else {
      var lp2 = (p - 0.55) / 0.45; var le2 = easeOutElastic(lp2);
      card._as = 1 + 0.015 * (1 - le2);
      card._ax = igDX * liftPx * (1 - le2);
      card._ay = (igDY !== 0 ? igDY : 1) * -liftPx * (1 - le2);
      card._ar = spin * (1 - le2) * (igDX !== 0 ? (igDX > 0 ? 1 : -1) : 1);
    }
    card._ao = 1;

  // ── DEAL ─────────────────────────────────────────────────────
  } else if (name === 'Deal') {
    var ep3  = ease(p);
    var dist = (params.distance != null ? params.distance : 0.7) * (st.canvas.clientWidth || st.canvas.width) * 0.5;
    var spinAmt  = params.spinIn   != null ? params.spinIn   : 6;
    // direction: left/right/top/bottom (legacy fromLeft boolean also supported)
    var dealDir = params.direction || (params.fromLeft === false ? 'right' : 'left');
    var ddx = (dealDir === 'left' ? -1 : dealDir === 'right' ? 1 : 0);
    var ddy = (dealDir === 'top'  ? -1 : dealDir === 'bottom' ? 1 : 0);
    var spinSign = (dealDir === 'right' || dealDir === 'bottom') ? 1 : -1;
    card._ax = ddx * dist * (1 - ep3);
    card._ay = ddy * dist * (1 - ep3);
    card._ar = spinAmt * (1 - ep3) * spinSign;
    card._ao = Math.min(1, p * 5);
    card._as = 1;

  // ── TAP ──────────────────────────────────────────────────────
  // MTG tap: card snaps to exactly 90° clockwise and stays there.
  // ① Snap (0–65%): easeOutQuint rotation 0→90° + arc lift + squish
  // ② Settle (65–100%): micro easeOutBack bounce, lands precisely at 90°
  } else if (name === 'Tap') {
    var tapLift   = params.lift   != null ? params.lift   : 10;
    var tapSquish = params.squish != null ? params.squish : 0.07;
    if (p < 0.65) {
      var sp = p / 0.65;
      var se = easeOutQuint(sp);
      card._ar = 90 * se;
      card._ay = -tapLift * Math.sin(sp * Math.PI);
      card._as = 1 - tapSquish * Math.sin(sp * Math.PI);
    } else {
      var rp = (p - 0.65) / 0.35;
      var re = easeOutBack(rp);
      // Approaches 90° from a slight overshoot, lands exactly at 90°
      card._ar = 90 - 5 * (1 - re);
      card._ay = 0; card._as = 1;
    }
    card._ax = 0; card._ao = 1;

  // ── UNTAP ────────────────────────────────────────────────────
  // Reverse of tap: snaps from 90° back to exactly 0°.
  // ① Snap (0–65%): easeOutQuint rotation 90→0° + arc lift + squish
  // ② Settle (65–100%): micro easeOutBack bounce, lands precisely at 0°
  } else if (name === 'Untap') {
    var utLift   = params.lift   != null ? params.lift   : 10;
    var utSquish = params.squish != null ? params.squish : 0.07;
    if (p < 0.65) {
      var usp = p / 0.65;
      var use2 = easeOutQuint(usp);
      card._ar = 90 * (1 - use2);
      card._ay = -utLift * Math.sin(usp * Math.PI);
      card._as = 1 - utSquish * Math.sin(usp * Math.PI);
    } else {
      var urp = (p - 0.65) / 0.35;
      var ure = easeOutBack(urp);
      // Approaches 0° from a slight undershoot (negative side), lands exactly at 0°
      card._ar = 5 * (1 - ure);
      card._ay = 0; card._as = 1;
    }
    card._ax = 0; card._ao = 1;

  // ── PLAY ─────────────────────────────────────────────────────
  // Slam the card onto the table from a direction — like playing a card in MTG.
  // ① Drop (0–55%): falls in from direction with spin, easeInQuad
  // ② Impact (55–70%): squash on land — scale X wide, scale Y short
  // ③ Bounce (70–100%): easeOutElastic spring back to rest
  } else if (name === 'Play') {
    var playDir  = params.direction   || 'top';
    var fromY    = params.fromY       != null ? params.fromY       : -120;
    var slamSc   = params.slamScale   != null ? params.slamScale   : 1.08;
    var slamSpin = params.slamSpin    != null ? params.slamSpin    : 4;
    var squash   = params.impactSquash!= null ? params.impactSquash: 0.12;
    // Compute entry offset from direction
    var cw2 = (st.canvas.clientWidth  || st.canvas.width)  * 0.5;
    var ch2 = (st.canvas.clientHeight || st.canvas.height) * 0.5;
    var pdx = (playDir === 'left' ? -1 : playDir === 'right' ? 1 : 0) * Math.abs(fromY) * (cw2 / ch2);
    var pdy = (playDir === 'top'  ? 1 : playDir === 'bottom' ? -1 : 0) * Math.abs(fromY);
    if (playDir === 'left' || playDir === 'right') { pdy = 0; pdx = (playDir === 'left' ? -1 : 1) * Math.abs(fromY) * 1.5; }
    if (playDir === 'top')    { pdx = 0; pdy = fromY; }
    if (playDir === 'bottom') { pdx = 0; pdy = Math.abs(fromY); }
    var spinSign2 = (playDir === 'right' || playDir === 'bottom') ? -1 : 1;

    if (p < 0.55) {
      // Drop phase — accelerate in from direction, spin straightens
      var dp = p / 0.55;
      var de = easeInQuad(dp);
      card._ax = pdx * (1 - de);
      card._ay = pdy * (1 - de);
      card._ar = slamSpin * spinSign2 * (1 - de);
      card._ao = Math.min(1, dp * 2.5);
      card._as = 0.88 + 0.12 * de;
    } else if (p < 0.70) {
      // Impact squash
      var ip = (p - 0.55) / 0.15;
      var squashAmt = Math.sin(ip * Math.PI) * squash;
      card._ax = 0; card._ay = 0; card._ar = 0; card._ao = 1;
      card._as = slamSc - squashAmt * 0.5;
      card._ay = squashAmt * 18;
    } else {
      // Bounce settle
      var bp2 = (p - 0.70) / 0.30;
      var be2 = easeOutElastic(bp2);
      card._ay = (1 - be2) * 14;
      card._as = 1 + (slamSc - 1) * (1 - be2);
      card._ar = 0; card._ao = 1; card._ax = 0;
    }
  } else if (name === 'Wait') {
    // Wait/delay block — preserve or reset card state
    var mode = (params && params.mode) || 'preserve';
    if (mode === 'reset') {
      // Snap to neutral
      card._ax = 0; card._ay = 0; card._ar = 0; card._as = 1; card._ao = 1;
    }
    // mode === 'preserve': leave _ax/_ay/_ar/_as/_ao at whatever the previous preset left them
    // (they were already set by the previous step's applyPreset call, or reset above in applyPreset preamble)
    // We need to store previous step's end state — handled in applyAnimations via _waitPrev
  }
}

// -- Lerp helpers for Scene transitions
export function lerpNum(a, b, t) { return a + (b - a) * t; }
export function lerpColor(hexA, hexB, t) {
  function h2r(h) {
    if (!h) return [0,0,0];
    h = h.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  var a = h2r(hexA), b = h2r(hexB);
  var r = Math.max(0, Math.min(255, Math.round(lerpNum(a[0],b[0],t))));
  var g = Math.max(0, Math.min(255, Math.round(lerpNum(a[1],b[1],t))));
  var bl = Math.max(0, Math.min(255, Math.round(lerpNum(a[2],b[2],t))));
  return '#' + [r,g,bl].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
}

export function lerpEffect(fromEff, toEff, t) {
  if (!fromEff || !toEff) return JSON.parse(JSON.stringify(toEff || fromEff || {}));
  var r = {};
  Object.keys(toEff).forEach(function(k) {
    if (k === 'on') r[k] = t < 0.5 ? fromEff[k] : toEff[k];
    else if (typeof fromEff[k] === 'number' && typeof toEff[k] === 'number') r[k] = lerpNum(fromEff[k], toEff[k], t);
    else if (typeof fromEff[k] === 'string' && fromEff[k][0] === '#') r[k] = lerpColor(fromEff[k], toEff[k], t);
    else r[k] = t < 0.5 ? fromEff[k] : toEff[k];
  });
  return r;
}
// st._sceneFreezeCache is in AppState

export function applyAnimations(time) {

  for (var ci = 0; ci < st.cardsRef.length; ci++) {
    var card = st.cardsRef[ci];
    var seq = st.sequences[card.id];

    // Default reset
    card._ax = 0; card._ay = 0; card._ar = 0; card._as = 1; card._ao = 1;

    if (!seq || seq.length === 0) continue;

    // 1) Apply the current NON-SCENE step (movement/transform presets)
    var t = time;
    var activeStep = null;
    var activeProgress = 0;
    for (var si = 0; si < seq.length; si++) {
      var step = seq[si];
      var dur = toMs(step.duration, 1000);

      if (t <= dur || si === seq.length - 1) {
        // Resolve "Wait preserve" behavior
        if (step.name === 'Wait' && (step.params && step.params.mode) !== 'reset') {
          var prevStep = si > 0 ? seq[si - 1] : null;
          if (prevStep && prevStep.name !== 'Wait' && prevStep.name !== 'Scene') {
            activeStep = prevStep;
            activeProgress = 1;
          }
        } else if (step.name !== 'Scene') {
          activeStep = step;
          activeProgress = (dur > 0) ? Math.min(1, t / dur) : 1;
        }
        break;
      }
      t -= dur;
    }
    if (activeStep) {
      applyPreset(card, activeStep.name, activeStep.params || {}, activeProgress, activeStep.easing);
    }

    // 2) Apply any SCENE transition that overlaps the current time (effects/bg only)
    //    This allows "fuse with previous block" by starting the scene transition early.
    var cursor = 0;
    for (var sj = 0; sj < seq.length; sj++) {
      var step = seq[sj];
      var sd = toMs(step.duration, 1000);
      if (step.name === 'Scene') {
        var sp = step.params || {};
        var lead = (sp.fuse === false) ? 0 : toMs(sp.leadMs, 0);
        if (lead < 0) lead = 0;
        if (lead > sd) lead = sd;

        var sceneStart = cursor - lead;          // can start before its own block
        var sceneEnd   = sceneStart + sd;

        if (time >= sceneStart && time <= sceneEnd) {
          var p = (sd > 0) ? Math.min(1, Math.max(0, (time - sceneStart) / sd)) : 1;
          var targetSnap = st.scenes && st.scenes[sp.targetSlot || 1];
          if (targetSnap) {
            var eased = getEasingFn(step.easing || 'easeInOutCubic')(p);
            var cacheKey = card.id + ':' + step.id;

            if (!st._sceneFreezeCache[cacheKey] || p < 0.02) {
              var snap = {
                bgColor: st.bgColor,
                bgTexture: st.bgTexture,
                bgTextureOpacity: st.bgTextureOpacity,
                bgFx: JSON.parse(JSON.stringify(st.bgFx))
              };
              ['glare','glow','shadow','spell','shimmer','luster','grain','ripple','holo'].forEach(function(k){
                snap[k] = JSON.parse(JSON.stringify(card[k] || {on:false}));
              });
              st._sceneFreezeCache[cacheKey] = snap;
            }

            var from = st._sceneFreezeCache[cacheKey];
            var effectKeys = ['glare','glow','shadow','spell','shimmer','luster','grain','ripple','holo'];

            if (sp.animateEffects !== false) {
              var tce = (targetSnap.cards || targetSnap.cardEffects || []).find(function(x){ return x.id === card.id; });
              if (tce) effectKeys.forEach(function(k){ card[k] = lerpEffect(from[k], tce[k], eased); });
            }

            if (sp.animateBg !== false && ci === 0) {
              st.bgColor = lerpColor(from.bgColor, targetSnap.bg.color, eased);
              // Texture overlay (crossfade opacity; switch texture halfway)
              st.bgTextureOpacity = lerpNum(from.bgTextureOpacity, targetSnap.bg.textureOpacity, eased);
              if (eased > 0.5) st.bgTexture = targetSnap.bg.texture;

              var toFx = targetSnap.bg.fx, fFx = from.bgFx;
              ['intensity','speed','fireHeat','fireHeight','smokeAmount','starCount','moonSize',
               'nebulaBloom','shadowDepth','shadowPulse','leafCount','windStrength','leafSize',
               'warpAmp','warpFreq','crystalFacets','metaCount','originX','originY','flowAngle','flowSpread'
              ].forEach(function(k){
                if (toFx[k]!==undefined && fFx[k]!==undefined) st.bgFx[k]=lerpNum(fFx[k],toFx[k],eased);
              });
              if (eased>0.5 && toFx.type!==fFx.type) {
                st.bgFx.type=toFx.type; st.bgParticles=[]; st.bgSmokeParticles=[]; st.bgStars=[]; st.bgStarsInit=false;
              }
              ['particleColor1','particleColor2'].forEach(function(k){
                if(toFx[k]&&fFx[k]) st.bgFx[k]=lerpColor(fFx[k],toFx[k],eased);
              });
            }
          }
        }
      }
      cursor += sd;
    }
  }
}


// ============================================================
//  DURATION NORMALIZATION (FIX)
//  Accepts numbers (ms) and strings like "700", "700ms", "0.7s"
// ============================================================
export function toMs(v, fallback) {
  var fb = (fallback != null) ? fallback : 1000;
  if (v == null) return fb;
  if (typeof v === 'number') return (isFinite(v) ? v : fb);
  if (typeof v === 'string') {
    var s = v.trim().toLowerCase();
    if (!s) return fb;
    if (s.endsWith('ms')) {
      var n1 = parseFloat(s.slice(0, -2));
      return isFinite(n1) ? n1 : fb;
    }
    if (s.endsWith('s')) {
      var n2 = parseFloat(s.slice(0, -1));
      return isFinite(n2) ? (n2 * 1000) : fb;
    }
    var n3 = parseFloat(s);
    return isFinite(n3) ? n3 : fb;
  }
  return fb;
}

export function calcTotalDuration() {
  var max = 0;
  for (var id in st.sequences) {
    var seq = st.sequences[id];
    var sum = 0;
    for (var i = 0; i < seq.length; i++) sum += toMs(seq[i].duration, 1000);
    if (sum > max) max = sum;
  }
  st.totalDuration = max;
  return max;
}

export function resetAnimOffsets() {
  for (var i = 0; i < st.cardsRef.length; i++) {
    var c = st.cardsRef[i];
    c._ax = 0; c._ay = 0; c._ar = 0; c._as = 1; c._ao = 1;
  }
  st._sceneFreezeCache = {};
}

export function updateScrubber() {
  var total = calcTotalDuration();
  var pct = total > 0 ? Math.min(1, st.playhead / total) : 0;
  document.getElementById('scrubber-head').style.left = (pct * 100) + '%';
  var s = st.playhead / 1000;
  document.getElementById('playhead-time').textContent = s.toFixed(3) + 's';
}

// Scrubber drag
(function() {
  var wrap = document.getElementById('scrubber-wrap');
  var dragging = false;
  wrap.addEventListener('mousedown', function(e) {
    dragging = true; seekScrubber(e); e.stopPropagation();
  });
  window.addEventListener('mousemove', function(e) { if (dragging) seekScrubber(e); });
  window.addEventListener('mouseup', function() { dragging = false; });
  function seekScrubber(e) {
    var rect = wrap.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    var total = calcTotalDuration();
    st.playhead = pct * total;
    if (st.isPlaying) st.playStart = performance.now() - st.playhead;
    updateScrubber();
    try { applyAnimations(st.playhead); } catch(e) { console.error('[seekScrubber] applyAnimations error:', e); }
    updateActiveBlocks();
    markDirty();
  }
})();

// ============================================================
//  TIMELINE UI
// ============================================================
document.getElementById('btn-timeline-toggle').addEventListener('click', function() {
  st.timelineOpen = !st.timelineOpen;
  var sec = document.getElementById('timeline-section');
  var bp  = document.getElementById('bottom-panel');
  if (st.timelineOpen) {
    sec.classList.add('open');
    bp.classList.add('timeline-expanded');
    bp.style.minHeight = ''; bp.style.maxHeight = '';
    bp.style.flex = '0 0 340px';
    var pr = document.getElementById('playback-row');
    if (pr) pr.classList.add('visible');
    this.textContent = '▾ Timeline';
    renderTimeline();
  } else {
    sec.classList.remove('open');
    bp.classList.remove('timeline-expanded');
    bp.style.minHeight = ''; bp.style.maxHeight = '';
    bp.style.flex = '0 0 58px';
    var pr = document.getElementById('playback-row');
    if (pr) pr.classList.remove('visible');
    this.textContent = '▸ Timeline';
  }
  // Canvas height changes when panel expands/collapses — force redraw
  st.needsRedraw = true;
});

// Global helpers for nav buttons to expand/collapse timeline
window._expandTimeline = function() {
  if (!st.timelineOpen) document.getElementById('btn-timeline-toggle').click();
};
window._collapseTimeline = function() {
  if (st.timelineOpen) document.getElementById('btn-timeline-toggle').click();
};

// ── Active dropdown tracking
// st._activeDropdown is in AppState

export function closeActiveDropdown() {
  if (st._activeDropdown) {
    st._activeDropdown.remove();
    st._activeDropdown = null;
  }
}

document.addEventListener('click', function(e) {
  if (st._activeDropdown && !st._activeDropdown.contains(e.target)) closeActiveDropdown();
});

// ── Preset menu definition
var PRESET_MENU = [
  { name: 'Pop',    icon: '◈', dur: '0.7s' },
  { name: 'Float',  icon: '〰', dur: '3.2s' },
  { name: 'Flip',   icon: '⟳', dur: '1.2s' },
  { name: 'Orbit',  icon: '◎', dur: '5.0s' },
  { name: 'Ignite', icon: '✦', dur: '1.8s' },
  { name: 'Deal',   icon: '🂾', dur: '1.0s' },
  { name: 'Tap',    icon: '⤵', dur: '0.5s' },
  { name: 'Untap',  icon: '⤴', dur: '0.5s' },
  { name: 'Play',   icon: '🃏', dur: '0.8s' }
];
var PRESET_MENU_SPECIAL = [
  { name: 'Wait',  icon: '⏸', dur: '0.5s', desc: 'Hold / pause' },
  { name: 'Scene', icon: '✦', dur: '1.0s', desc: 'FX transition' }
];

export function showPresetDropdown(anchorEl, cardId) {
  closeActiveDropdown();

  var drop = document.createElement('div');
  drop.className = 'preset-dropdown';
  st._activeDropdown = drop;

  // Effect presets
  PRESET_MENU.forEach(function(p) {
    var item = document.createElement('div');
    item.className = 'preset-dropdown-item';
    item.innerHTML = '<span class="pd-icon">' + p.icon + '</span>'
      + '<span class="pd-name">' + p.name + '<br><span class="pd-dur">' + p.dur + '</span></span>';
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      addStepToCard(cardId, p.name);
      closeActiveDropdown();
    });
    drop.appendChild(item);
  });

  // Divider
  var divider = document.createElement('div');
  divider.className = 'pd-divider';
  drop.appendChild(divider);

  // Special blocks: Wait + Scene (full width each)
  PRESET_MENU_SPECIAL.forEach(function(p) {
    var item = document.createElement('div');
    item.className = 'preset-dropdown-item wait-item' + (p.name === 'Scene' ? ' scene-menu-item' : '');
    item.style.gridColumn = '1 / -1';
    item.innerHTML = '<span class="pd-icon">' + p.icon + '</span>'
      + '<span class="pd-name">' + p.name + '<br><span class="pd-dur">' + p.dur + ' · ' + p.desc + '</span></span>';
    (function(name) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        addStepToCard(cardId, name);
        closeActiveDropdown();
      });
    })(p.name);
    drop.appendChild(item);
  });

  // Position near anchor
  document.body.appendChild(drop);
  var rect = anchorEl.getBoundingClientRect();
  var dropW = drop.offsetWidth;
  var left = rect.left;
  if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;
  drop.style.left = left + 'px';
  drop.style.top  = (rect.top - drop.offsetHeight - 4) + 'px';
}

export function addStepToCard(cardId, name) {
  if (!st.sequences[cardId]) st.sequences[cardId] = [];
  var def = PRESET_DEFAULTS[name];
  st.sequences[cardId].push({
    id: 'step' + Date.now() + Math.random(),
    name: name,
    duration: def.duration,
    params: Object.assign({}, def.params)
  });
  calcTotalDuration();
  renderTimeline();
}

// Track which step editor is open: { cardId, stepIdx } — st.openStepEditor is in AppState

// Per-preset param schema: { key, label, min, max, step, fmt }
var PRESET_PARAM_SCHEMA = {
  Pop: [
    { key: 'startScale', label: 'Start Scale', min: 0.0,  max: 0.9,  step: 0.05, fmt: function(v){ return (v*100).toFixed(0)+'%'; } },
    { key: 'startY',     label: 'Rise From',   min: 0,    max: 160,  step: 4,    fmt: function(v){ return Math.round(v)+'px'; } }
  ],
  Float: [
    { key: 'rise',  label: 'Rise',  min: 2,  max: 60,  step: 1,   fmt: function(v){ return Math.round(v)+'px'; } },
    { key: 'sway',  label: 'Sway',  min: 0,  max: 30,  step: 0.5, fmt: function(v){ return v.toFixed(1)+'px'; } },
    { key: 'tilt',  label: 'Tilt',  min: 0,  max: 12,  step: 0.1, fmt: function(v){ return v.toFixed(1)+'°'; } }
  ],
  Flip: [
    { key: 'lift',    label: 'Lift',   min: 0,  max: 80,  step: 1,  fmt: function(v){ return Math.round(v)+'px'; } },
    { key: 'rotateZ', label: 'Z-Spin', min: 0,  max: 180, step: 5,  fmt: function(v){ return Math.round(v)+'°'; } }
  ],
  Orbit: [
    { key: 'radius',      label: 'Radius',       min: 10, max: 200, step: 5,   fmt: function(v){ return Math.round(v)+'px'; } },
    { key: 'tiltAngle',   label: '3D Tilt',       min: 0,  max: 50,  step: 1,   fmt: function(v){ return Math.round(v)+'°'; } },
    { key: 'orbitOffset', label: 'Phase Offset',  min: 0,  max: 1,   step: 0.05, fmt: function(v){ return (v*100).toFixed(0)+'%'; } },
    { key: 'sequenceGap', label: 'Sequence Gap',  min: 0,  max: 1,   step: 0.05, fmt: function(v){ return (v*100).toFixed(0)+'%'; }, hidden: true }
  ],
  Ignite: [
    { key: 'direction',  label: 'Direction',  type: 'direction4', default: 'up' },
    { key: 'scaleBloom', label: 'Bloom', min: 1.0, max: 1.8, step: 0.02, fmt: function(v){ return v.toFixed(2)+'×'; } },
    { key: 'liftHeight', label: 'Lift',  min: 0.05,max: 0.6, step: 0.01, fmt: function(v){ return (v*100).toFixed(0)+'%'; } },
    { key: 'spin',       label: 'Spin',  min: 0,   max: 30,  step: 0.5,  fmt: function(v){ return v.toFixed(1)+'°'; } }
  ],
  Deal: [
    { key: 'direction', label: 'From',     type: 'direction4', default: 'left' },
    { key: 'distance', label: 'Distance',  min: 0.2, max: 1.4, step: 0.05, fmt: function(v){ return (v*100).toFixed(0)+'%'; } },
    { key: 'spinIn',   label: 'Spin',      min: 0,   max: 25,  step: 0.5,  fmt: function(v){ return v.toFixed(1)+'°'; } }
  ],
  Tap: [
    { key: 'lift',   label: 'Arc Lift', min: 0,  max: 40, step: 1,    fmt: function(v){ return Math.round(v)+'px'; } },
    { key: 'squish', label: 'Squish',   min: 0,  max: 0.25,step: 0.01, fmt: function(v){ return (v*100).toFixed(0)+'%'; } }
  ],
  Untap: [
    { key: 'lift',   label: 'Arc Lift', min: 0,  max: 40, step: 1,    fmt: function(v){ return Math.round(v)+'px'; } },
    { key: 'squish', label: 'Squish',   min: 0,  max: 0.25,step: 0.01, fmt: function(v){ return (v*100).toFixed(0)+'%'; } }
  ],
  Play: [
    { key: 'direction',    label: 'From',        type: 'direction4', default: 'top' },
    { key: 'fromY',        label: 'Entry Dist',  min: -300, max: -20, step: 10, fmt: function(v){ return Math.abs(Math.round(v))+'px'; } },
    { key: 'slamScale',    label: 'Slam Scale',  min: 1.0,  max: 1.4, step: 0.01, fmt: function(v){ return v.toFixed(2)+'×'; } },
    { key: 'slamSpin',     label: 'Spin',        min: 0,    max: 20,  step: 0.5,  fmt: function(v){ return v.toFixed(1)+'°'; } },
    { key: 'impactSquash', label: 'Squash',      min: 0,    max: 0.3, step: 0.01, fmt: function(v){ return (v*100).toFixed(0)+'%'; } }
  ]
};

var EASING_OPTIONS = [
  { value: 'easePopBezier',  label: '✦ Pop (overshoot)' },
  { value: 'easeOutQuint',   label: 'Smooth Out — Quint' },
  { value: 'easeOutCubic',   label: 'Smooth Out — Cubic' },
  { value: 'easeOutBack',    label: 'Overshoot — Back' },
  { value: 'easeOutElastic', label: 'Elastic Snap' },
  { value: 'easeInOutQuart', label: 'Ease In & Out — Quart' },
  { value: 'easeInOutCubic', label: 'Ease In & Out — Cubic' },
  { value: 'easeInOutSine',  label: 'Ease In & Out — Sine' },
  { value: 'easeInQuad',     label: 'Ease In — Quad' },
  { value: 'easeSpring',     label: 'Spring' },
  { value: 'linear',         label: 'Linear' }
];

var BLOCK_ICONS = { Pop:'◈', Float:'〰', Flip:'⟳', Orbit:'◎', Ignite:'✦', Deal:'🂾', Tap:'⤵', Untap:'⤴', Play:'🃏', Wait:'⏸', Scene:'✦' };

// ── Inline step editor — renders below the clicked block inside the track row ──
export function buildInlineStepEditor(cardId, stepIdx, container) {
  document.querySelectorAll('.inline-step-editor').forEach(function(el) { el.remove(); });

  var seq = st.sequences[cardId];
  if (!seq || !seq[stepIdx]) return;
  var step = seq[stepIdx];
  var card = st.cards.find(function(c) { return String(c.id) === cardId; });
  var cardIdx = st.cards.findIndex(function(c) { return String(c.id) === cardId; });
  var cardName = (card && card.label) ? card.label : ('Card ' + (cardIdx + 1));
  if (!step.params) step.params = {};

  var box = document.createElement('div');
  box.className = 'inline-step-editor open';

  // Header
  var hdr = document.createElement('div');
  hdr.className = 'ise-header';
  var title = document.createElement('span');
  title.className = 'ise-title';
  title.textContent = (BLOCK_ICONS[step.name] || '•') + ' ' + step.name + ' — ' + cardName;
  var closeBtn = document.createElement('button');
  closeBtn.className = 'ise-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', function() {
    box.remove(); st.openStepEditor = null; renderTimeline();
  });
  hdr.appendChild(title); hdr.appendChild(closeBtn);
  box.appendChild(hdr);

  var body = document.createElement('div');
  box.appendChild(body);

  // ── helpers ──────────────────────────────────────────────────
  function addSlider(label, paramKey, val, min, max, stepSize, fmt, isRoot) {
    var row = document.createElement('div');
    row.className = 'step-slider-row';
    var lbl = document.createElement('label'); lbl.textContent = label;
    var inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = stepSize; inp.value = val;
    var valSpan = document.createElement('span');
    valSpan.className = 'step-val'; valSpan.textContent = fmt(val);
    inp.addEventListener('input', function() {
      var v = Number(inp.value); valSpan.textContent = fmt(v);
      if (isRoot) { seq[stepIdx][paramKey] = v; }
      else        { seq[stepIdx].params[paramKey] = v; }
      calcTotalDuration();
    });
    row.appendChild(lbl); row.appendChild(inp); row.appendChild(valSpan);
    body.appendChild(row);
  }

  function addSelect(label, paramKey, options, currentVal, isRoot) {
    var row = document.createElement('div'); row.className = 'easing-row';
    var lbl = document.createElement('label'); lbl.textContent = label;
    var sel = document.createElement('select');
    options.forEach(function(o) {
      var opt = document.createElement('option'); opt.value = o.v || o; opt.textContent = o.l || o;
      if ((o.v || o) === currentVal) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function() {
      if (isRoot) seq[stepIdx][paramKey] = sel.value;
      else seq[stepIdx].params[paramKey] = sel.value;
    });
    row.appendChild(lbl); row.appendChild(sel); body.appendChild(row);
  }

  function addLabel(text) {
    var d = document.createElement('div');
    d.style.cssText = 'font-size:10px;color:var(--muted);margin:8px 0 4px;';
    d.textContent = text; body.appendChild(d);
  }

  function addDivider() {
    var d = document.createElement('div');
    d.style.cssText = 'height:1px;background:var(--border);margin:8px 0;';
    body.appendChild(d);
  }

  var EASINGS = ['linear','easeInQuad','easeOutCubic','easeOutQuint','easeInOutSine',
                 'easeInOutCubic','easeInOutQuart','easeOutBack','easeOutElastic',
                 'easePopBezier','easeSpring'];

  var def = (PRESET_DEFAULTS[step.name] && PRESET_DEFAULTS[step.name].params) || {};

  // ── Duration + Easing (all presets) ──────────────────────────
  addSlider('Duration', 'duration', step.duration || 500, 50, 8000, 50, function(v){ return Math.round(v)+'ms'; }, true);
  addSelect('Easing', 'easing', EASINGS, step.easing || 'easeOutCubic', true);
  addDivider();

  // ── Per-preset params ─────────────────────────────────────────
  var p = step.params;
  var n = step.name;

  if (n === 'Pop') {
    addLabel('Entry');
    addSlider('Start Scale', 'startScale', p.startScale != null ? p.startScale : def.startScale||0.4, 0, 1, 0.05, function(v){ return v.toFixed(2)+'×'; });
    addSlider('Start Y',     'startY',     p.startY    != null ? p.startY    : def.startY||40,       -200, 200, 5,  function(v){ return v+'px'; });

  } else if (n === 'Float') {
    addLabel('Motion');
    addSlider('Rise',  'rise',  p.rise  != null ? p.rise  : def.rise||22,  0, 80, 1,  function(v){ return v+'px'; });
    addSlider('Sway',  'sway',  p.sway  != null ? p.sway  : def.sway||6,   0, 60, 1,  function(v){ return v+'px'; });
    addSlider('Tilt',  'tilt',  p.tilt  != null ? p.tilt  : def.tilt||2.5, 0, 20, 0.5,function(v){ return v+'°'; });

  } else if (n === 'Flip') {
    addLabel('Flip');
    addSlider('Lift Height', 'lift',    p.lift    != null ? p.lift    : def.lift||20,  0, 80, 1,  function(v){ return v+'px'; });
    addSlider('Z Spin',      'rotateZ', p.rotateZ != null ? p.rotateZ : def.rotateZ||0,-180,180,5, function(v){ return v+'°'; });

  } else if (n === 'Orbit') {
    addLabel('Orbit Path');
    addSlider('Radius',       'radius',       p.radius      != null ? p.radius      : def.radius||55,        10, 200, 5,   function(v){ return v+'px'; });
    addSlider('Tilt Angle',   'tiltAngle',    p.tiltAngle   != null ? p.tiltAngle   : def.tiltAngle||15,     0,  80,  1,   function(v){ return v+'°'; });
    addSlider('Start Offset', 'orbitOffset',  p.orbitOffset != null ? p.orbitOffset : def.orbitOffset||0,    0,  1,   0.05,function(v){ return (v*100).toFixed(0)+'%'; });
    addSlider('Seq Gap',      'sequenceGap',  p.sequenceGap != null ? p.sequenceGap : def.sequenceGap||0.25, 0,  1,   0.05,function(v){ return (v*100).toFixed(0)+'%'; });

  } else if (n === 'Ignite') {
    addLabel('Launch');
    addSelect('Direction', 'direction',
      [{v:'up',l:'⬆ Up'},{v:'down',l:'⬇ Down'},{v:'left',l:'⬅ Left'},{v:'right',l:'➡ Right'}],
      p.direction || def.direction || 'up');
    addSlider('Scale Bloom',  'scaleBloom',  p.scaleBloom  != null ? p.scaleBloom  : def.scaleBloom||1.22,  1,   2,    0.02,function(v){ return v.toFixed(2)+'×'; });
    addSlider('Lift Height',  'liftHeight',  p.liftHeight  != null ? p.liftHeight  : def.liftHeight||0.28,  0.05,0.8,  0.05,function(v){ return (v*100).toFixed(0)+'%'; });
    addSlider('Spin Amount',  'spin',        p.spin        != null ? p.spin        : def.spin||8,           0,   36,   1,   function(v){ return v+'°'; });

  } else if (n === 'Deal') {
    addLabel('Deal');
    addSelect('From', 'direction',
      [{v:'left',l:'⬅ Left'},{v:'right',l:'➡ Right'},{v:'top',l:'⬆ Top'},{v:'bottom',l:'⬇ Bottom'}],
      p.direction || def.direction || 'left');
    addSlider('Distance', 'distance', p.distance != null ? p.distance : def.distance||0.7, 0.1, 2,   0.05,function(v){ return (v*100).toFixed(0)+'%'; });
    addSlider('Spin In',  'spinIn',   p.spinIn   != null ? p.spinIn   : def.spinIn||6,     0,   45,  1,   function(v){ return v+'°'; });

  } else if (n === 'Tap' || n === 'Untap') {
    addLabel(n === 'Tap' ? 'Tap (→90°)' : 'Untap (→0°)');
    addSlider('Arc Lift',  'lift',   p.lift   != null ? p.lift   : def.lift||10,   0, 60,  1,    function(v){ return v+'px'; });
    addSlider('Squish',    'squish', p.squish != null ? p.squish : def.squish||0.07,0, 0.4, 0.01,function(v){ return (v*100).toFixed(0)+'%'; });

  } else if (n === 'Play') {
    addLabel('Entry');
    addSelect('From', 'direction',
      [{v:'top',l:'⬆ Top'},{v:'bottom',l:'⬇ Bottom'},{v:'left',l:'⬅ Left'},{v:'right',l:'➡ Right'}],
      p.direction || def.direction || 'top');
    addSlider('From Distance', 'fromY',        p.fromY        != null ? p.fromY        : def.fromY||-120,    -400, 0,  10,  function(v){ return v+'px'; });
    addLabel('Impact');
    addSlider('Slam Scale',    'slamScale',     p.slamScale    != null ? p.slamScale    : def.slamScale||1.08, 1,   1.5, 0.01,function(v){ return v.toFixed(2)+'×'; });
    addSlider('Slam Spin',     'slamSpin',      p.slamSpin     != null ? p.slamSpin     : def.slamSpin||4,     0,   30,  1,   function(v){ return v+'°'; });
    addSlider('Squash',        'impactSquash',  p.impactSquash != null ? p.impactSquash : def.impactSquash||0.12,0, 0.4, 0.01,function(v){ return (v*100).toFixed(0)+'%'; });

  } else if (n === 'Wait') {
    addLabel('Wait behaviour');
    [{v:'fixed',l:'Fixed duration'},{v:'tap',l:'Wait for tap'},{v:'loop',l:'Loop forever'}].forEach(function(m) {
      var rb = document.createElement('label');
      rb.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text);margin-bottom:5px;cursor:pointer;';
      var inp = document.createElement('input'); inp.type = 'radio';
      inp.name = 'ise-wait-'+cardId+'-'+stepIdx; inp.value = m.v;
      if ((p.waitMode || 'fixed') === m.v) inp.checked = true;
      inp.addEventListener('change', function() { seq[stepIdx].params.waitMode = m.v; });
      rb.appendChild(inp); rb.appendChild(document.createTextNode(m.l));
      body.appendChild(rb);
    });

  } else if (n === 'Scene') {
    addLabel('Transition to scene');
    var picker = document.createElement('div');
    picker.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';
    var curSlot = parseInt(p.targetSlot, 10) || 1;
    for (var s = 1; s <= 5; s++) {
      (function(slot) {
        var hasScene = !!st.scenes[slot];
        var btn = document.createElement('button');
        btn.className = 'scene-slot-pick-btn' + (curSlot === slot ? ' selected-slot':'') + (hasScene?' has-scene':' empty-slot');
        btn.disabled = !hasScene;
        var sname = hasScene ? (st.scenes[slot].name||('S'+slot)) : slot;
        btn.innerHTML = slot+'<div class="scene-slot-pick-sub">'+String(sname).substring(0,5)+'</div>';
        if (hasScene) btn.addEventListener('click', function() {
          seq[stepIdx].params.targetSlot = Number(slot);
          buildInlineStepEditor(cardId, stepIdx, container);
        });
        picker.appendChild(btn);
      })(s);
    }
    body.appendChild(picker);
    addDivider();
    addLabel('Animate');
    [{key:'animateEffects',label:'Card effects (glow, shimmer…)'},{key:'animateBg',label:'Background FX & colour'}].forEach(function(opt) {
      if (p[opt.key] === undefined) p[opt.key] = true;
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text);margin-bottom:5px;cursor:pointer;';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = p[opt.key];
      (function(k){ cb.addEventListener('change', function(){ seq[stepIdx].params[k] = cb.checked; }); })(opt.key);
      row.appendChild(cb); row.appendChild(document.createTextNode(opt.label));
      body.appendChild(row);
    });
    addSlider('Lead time', 'leadMs', p.leadMs != null ? p.leadMs : 0, 0, 2000, 50, function(v){ return v+'ms'; });
    var fuseRow = document.createElement('label');
    fuseRow.style.cssText = 'display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text);margin-top:4px;cursor:pointer;';
    var fuseCb = document.createElement('input'); fuseCb.type = 'checkbox'; fuseCb.checked = p.fuse !== false;
    fuseCb.addEventListener('change', function(){ seq[stepIdx].params.fuse = fuseCb.checked; });
    fuseRow.appendChild(fuseCb); fuseRow.appendChild(document.createTextNode('Fuse card animations'));
    body.appendChild(fuseRow);
  }

  addDivider();
  // Delete button
  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn small';
  deleteBtn.style.cssText = 'color:#ff7070;border-color:rgba(255,100,100,0.3);width:100%;';
  deleteBtn.textContent = '✕ Remove this step';
  deleteBtn.addEventListener('click', function() {
    if (st.sequences[cardId]) {
      st.sequences[cardId].splice(stepIdx, 1);
      st.openStepEditor = null;
      calcTotalDuration(); renderTimeline();
    }
  });
  body.appendChild(deleteBtn);

  container.appendChild(box);
  setTimeout(function() { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
}


export function renderTimeline() {
  var wrap = document.getElementById('seq-tracks-wrap') || document.getElementById('seq-tracks');

  var wrap = document.getElementById('seq-tracks-wrap') || document.getElementById('seq-tracks');
  var tracks = document.getElementById('seq-tracks');
  tracks.innerHTML = '';

  // GC: remove st.sequences for st.cards that no longer exist
  var liveIds = st.cards.map(function(c) { return String(c.id); });
  Object.keys(st.sequences).forEach(function(id) { if (liveIds.indexOf(id) < 0) delete st.sequences[id]; });

  // Show ALL st.cards — if none exist yet, show a hint but don't bail out
  // (so re-render always reflects current state)
  var allCardIds = st.cards.map(function(c) { return String(c.id); });

  if (allCardIds.length === 0) {
    tracks.innerHTML = '<div class="seq-empty">No cards on canvas yet — click + in the toolbar to add one.</div>';
    refreshStepEditorPanel();
    return;
  }

  allCardIds.forEach(function(cardId) {
    var seq = st.sequences[cardId] || [];
    var card = st.cards.find(function(c) { return String(c.id) === cardId; });
    var cardIdx = st.cards.findIndex(function(c) { return String(c.id) === cardId; });
    var cardName = (card && card.label) ? card.label : ('Card ' + (cardIdx + 1));

    var section = document.createElement('div');
    section.className = 'seq-card-section';
    section.dataset.cardId = cardId;

    var row = document.createElement('div');
    row.className = 'seq-track seq-row';

    // ── Label sidebar ──
    var labelCol = document.createElement('div');
    labelCol.className = 'seq-label-col';
    var nameEl = document.createElement('div');
    nameEl.className = 'seq-label-name';
    nameEl.textContent = cardName;
    var subEl = document.createElement('div');
    subEl.className = 'seq-label-sub';
    subEl.textContent = seq.length > 0 ? (seq.length + ' step' + (seq.length !== 1 ? 's' : '')) : 'no steps yet';
    labelCol.appendChild(nameEl);
    labelCol.appendChild(subEl);
    row.appendChild(labelCol);

    // ── Blocks area ──
    var blocksWrap = document.createElement('div');
    blocksWrap.className = 'seq-blocks';

    seq.forEach(function(step, si) {
      var isWait = step.name === 'Wait';
      var isOpen = st.openStepEditor && st.openStepEditor.cardId === cardId && st.openStepEditor.stepIdx === si;

      var b = document.createElement('div');
      b.className = 'seq-block ' + (isWait ? 'block-wait' : 'block-effect');
      if (isOpen) b.classList.add('selected-step');

      var icon = BLOCK_ICONS[step.name] || '•';
      var durSec = ((step.duration || 500) / 1000).toFixed(1) + 's';

      var nameSpan = document.createElement('div');
      nameSpan.className = 'seq-block-name';
      nameSpan.textContent = icon + ' ' + step.name;
      var durSpan = document.createElement('div');
      durSpan.className = 'seq-block-dur';
      durSpan.textContent = durSec;
      b.appendChild(nameSpan);
      b.appendChild(durSpan);

      // Delete ✕
      var delBtn = document.createElement('span');
      delBtn.className = 'del-step';
      delBtn.dataset.cid = cardId;
      delBtn.dataset.si = si;
      delBtn.textContent = '✕';
      b.appendChild(delBtn);

      // Progress bar
      var bar = document.createElement('div');
      bar.className = 'block-progress';
      b.appendChild(bar);

      b.title = 'Click to edit · Drag to reorder';

      // Click → open inline editor (all screen sizes)
      b.addEventListener('click', function(e) {
        if (e.target.classList.contains('del-step')) return;
        var alreadyOpen = st.openStepEditor && st.openStepEditor.cardId === cardId && st.openStepEditor.stepIdx === si;
        if (alreadyOpen) {
          st.openStepEditor = null;
          document.querySelectorAll('.inline-step-editor').forEach(function(el) { el.remove(); });
          renderTimeline();
        } else {
          st.openStepEditor = { cardId: cardId, stepIdx: si };
          renderTimeline();
          var freshRow = document.querySelector('.seq-card-section[data-card-id="' + cardId + '"] .seq-row');
          if (freshRow) {
            buildInlineStepEditor(cardId, si, freshRow.parentNode);
          }
        }
      });

      // Drag to reorder
      attachBlockDragHandlers(b, cardId, si);

      blocksWrap.appendChild(b);
    });

    row.appendChild(blocksWrap);

    // ── Add Step button — fixed column, always visible ──
    var addCol = document.createElement('div');
    addCol.className = 'seq-add-col';
    var addBtn = document.createElement('button');
    addBtn.className = 'seq-add-btn';
    addBtn.innerHTML = '＋ Add Step';
    addBtn.title = 'Add animation step to this card';
    (function(cid, btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        showPresetDropdown(btn, cid);
      });
    })(cardId, addBtn);
    addCol.appendChild(addBtn);
    row.appendChild(addCol);

    // ── Track actions sidebar ──
    var actions = document.createElement('div');
    actions.className = 'seq-track-actions';

    var copyBtn = document.createElement('button');
    copyBtn.className = 'seq-track-btn';
    copyBtn.textContent = '⎘';
    copyBtn.title = 'Copy sequence to selected st.cards';
    (function(srcId) {
      copyBtn.addEventListener('click', function() {
        var targets = st.selectedIds.filter(function(id) { return String(id) !== srcId; });
        if (targets.length === 0) { showToast('Select other st.cards to copy to'); return; }
        var srcSeq = st.sequences[srcId];
        targets.forEach(function(id) {
          st.sequences[String(id)] = srcSeq.map(function(s) { return JSON.parse(JSON.stringify(s)); });
        });
        calcTotalDuration(); renderTimeline();
        showToast('Copied to ' + targets.length + ' card' + (targets.length !== 1 ? 's' : ''));
      });
    })(cardId);

    var clearBtn = document.createElement('button');
    clearBtn.className = 'seq-track-btn danger';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear this card\'s sequence';
    (function(cid) {
      clearBtn.addEventListener('click', function() {
        st.sequences[cid] = [];
        if (st.openStepEditor && st.openStepEditor.cardId === cid) st.openStepEditor = null;
        calcTotalDuration(); renderTimeline();
      });
    })(cardId);

    actions.appendChild(copyBtn);
    actions.appendChild(clearBtn);
    row.appendChild(actions);

    section.appendChild(row);
    tracks.appendChild(section);
  });

  // Wire delete buttons
  tracks.querySelectorAll('.del-step').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var cid = btn.dataset.cid, si = parseInt(btn.dataset.si);
      st.sequences[cid].splice(si, 1);
      if (st.openStepEditor && st.openStepEditor.cardId === cid && st.openStepEditor.stepIdx === si) {
        st.openStepEditor = null;
      }
      calcTotalDuration(); renderTimeline();
    });
  });

  updateActiveBlocks();
  upgradeAllSliders();
  refreshStepEditorPanel();
}

// ── Inspector step editor panel ──────────────────────────────────────────
export function refreshStepEditorPanel() {
  var panel = document.getElementById('step-editor-panel');
  if (!panel) return;


  var panel = document.getElementById('step-editor-panel');
  if (!panel) return;

  if (!st.openStepEditor) { panel.classList.remove('open'); return; }

  // ── Scene step editor (card-track) ─────────────────────────────────────
  var cardId = st.openStepEditor.cardId;
  var stepIdx = st.openStepEditor.stepIdx;
  var seq = st.sequences[cardId];
  if (!seq || !seq[stepIdx]) { panel.classList.remove('open'); return; }

  var step = seq[stepIdx];
  var card = st.cards.find(function(c) { return String(c.id) === cardId; });
  var cardIdx = st.cards.findIndex(function(c) { return String(c.id) === cardId; });
  var cardName = (card && card.label) ? card.label : ('Card ' + (cardIdx + 1));

  // Breadcrumb
  document.getElementById('step-editor-crumb-card').textContent = cardName;
  document.getElementById('step-editor-crumb-step').textContent = (BLOCK_ICONS[step.name] || '•') + ' ' + step.name + ' · Step ' + (stepIdx + 1);

  // Build body
  var body = document.getElementById('step-editor-body');
  body.innerHTML = '';

  // Duration slider
  var durRow = makeStepSlider(
    'Duration', step.duration || 500, 50, 8000, 50,
    function(v) { return Math.round(v) + 'ms'; },
    function(v) {
      if (st.sequences[cardId] && st.sequences[cardId][stepIdx]) {
        st.sequences[cardId][stepIdx].duration = v;
        calcTotalDuration(); renderTimeline();
      }
    }
  );
  body.appendChild(durRow);

  if (step.name === 'Scene') {
    // ── Scene FX Transition Editor ──
    var sceneLabel = document.createElement('div');
    sceneLabel.style.cssText = 'font-size:10px;color:var(--muted);margin-bottom:6px;';
    sceneLabel.textContent = 'Transition to scene:';
    body.appendChild(sceneLabel);

    var picker = document.createElement('div');
    picker.className = 'scene-slot-picker';
    var curSlot = parseInt(step.params && step.params.targetSlot, 10);
    if (!curSlot || curSlot < 1) curSlot = 1;
    for (var s = 1; s <= 5; s++) {
      (function(slot) {
        var hasScene = !!st.scenes[slot];
        var isSelected = curSlot === slot;
        var btn = document.createElement('button');
        btn.className = 'scene-slot-pick-btn' + (isSelected ? ' selected-slot' : '') + (hasScene ? ' has-scene' : ' empty-slot');
        btn.disabled = !hasScene;
        var sname = hasScene ? (st.scenes[slot].name || ('Scene ' + slot)) : 'empty';
        btn.innerHTML = slot + '<div class="scene-slot-pick-sub">' + sname.substring(0,6) + '</div>';
        btn.title = hasScene ? ('→ ' + sname) : 'No scene saved';
        if (hasScene) btn.addEventListener('click', function() {
          if (!st.sequences[cardId][stepIdx].params) st.sequences[cardId][stepIdx].params = {};
          st.sequences[cardId][stepIdx].params.targetSlot = Number(slot);
          refreshStepEditorPanel(); renderTimeline();
        });
        picker.appendChild(btn);
      })(s);
    }
    body.appendChild(picker);

    var divSc = document.createElement('div');
    divSc.style.cssText = 'height:1px;background:var(--border);margin:6px 0;';
    body.appendChild(divSc);

    // Animate checkboxes
    var animLabel = document.createElement('div');
    animLabel.style.cssText = 'font-size:10px;color:var(--muted);margin-bottom:5px;';
    animLabel.textContent = 'Animate:';
    body.appendChild(animLabel);
    [
      { key: 'animateEffects', label: 'Card effects (glow, spell, shimmer…)', def: true },
      { key: 'animateBg',      label: 'Background FX & color',                def: true },
    ].forEach(function(opt) {
      if (!step.params) step.params = {};
      if (step.params[opt.key] === undefined) step.params[opt.key] = opt.def;
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text);margin-bottom:5px;cursor:pointer;';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = step.params[opt.key];
      (function(k) {
        cb.addEventListener('change', function() {
          if (!st.sequences[cardId][stepIdx].params) st.sequences[cardId][stepIdx].params = {};
          st.sequences[cardId][stepIdx].params[k] = cb.checked;
        });
      })(opt.key);
      row.appendChild(cb); row.appendChild(document.createTextNode(opt.label));
      body.appendChild(row);
    });

    
    // Transition fusion controls
    var fuseRow = document.createElement('div');
    fuseRow.className = 'toggle-row';
    var fuseCb = document.createElement('input');
    fuseCb.type = 'checkbox';
    if (!step.params) step.params = {};
    if (step.params.fuse === undefined) step.params.fuse = true;
    fuseCb.checked = !!step.params.fuse;
    fuseCb.addEventListener('change', function() {
      st.sequences[cardId][stepIdx].params.fuse = fuseCb.checked;
      refreshStepEditorPanel(); renderTimeline();
    });
    fuseRow.appendChild(fuseCb);
    fuseRow.appendChild(document.createTextNode('Fuse with previous block'));
    body.appendChild(fuseRow);

    var leadRow = makeStepSlider(
      'Blend early', (step.params && step.params.leadMs) || 0, 0, 2000, 50,
      function(v){ return Math.round(v) + 'ms'; },
      function(v){
        if (!st.sequences[cardId][stepIdx].params) st.sequences[cardId][stepIdx].params = {};
        st.sequences[cardId][stepIdx].params.leadMs = v;
        renderTimeline();
      }
    );
    body.appendChild(leadRow);

// Easing
    var er = document.createElement('div'); er.className = 'easing-row';
    var el2 = document.createElement('label'); el2.textContent = 'Easing';
    var es = document.createElement('select');
    EASING_OPTIONS.forEach(function(opt) {
      var o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label;
      if ((step.easing || 'easeInOutCubic') === opt.value) o.selected = true;
      es.appendChild(o);
    });
    es.addEventListener('change', function() { st.sequences[cardId][stepIdx].easing = es.value; });
    er.appendChild(el2); er.appendChild(es);
    body.appendChild(er);

  } else if (step.name === 'Wait') {
    // Mode toggle: Preserve / Reset
    var modeLabel = document.createElement('div');
    modeLabel.style.cssText = 'font-size:10px; color:var(--muted); margin:8px 0 4px;';
    modeLabel.textContent = 'After this wait…';
    body.appendChild(modeLabel);

    var modeRow = document.createElement('div');
    modeRow.className = 'wait-mode-row';

    var curMode = (step.params && step.params.mode) || 'preserve';

    var preserveBtn = document.createElement('button');
    preserveBtn.className = 'wait-mode-btn' + (curMode === 'preserve' ? ' active' : '');
    preserveBtn.textContent = '⏸ Preserve State';
    preserveBtn.title = 'Hold the previous animation\'s final position';

    var resetBtn = document.createElement('button');
    resetBtn.className = 'wait-mode-btn' + (curMode === 'reset' ? ' active' : '');
    resetBtn.textContent = '↺ Reset State';
    resetBtn.title = 'Snap card back to neutral position';

    function setMode(m) {
      if (!st.sequences[cardId][stepIdx].params) st.sequences[cardId][stepIdx].params = {};
      st.sequences[cardId][stepIdx].params.mode = m;
      preserveBtn.className = 'wait-mode-btn' + (m === 'preserve' ? ' active' : '');
      resetBtn.className    = 'wait-mode-btn' + (m === 'reset'    ? ' active' : '');
    }
    preserveBtn.addEventListener('click', function() { setMode('preserve'); });
    resetBtn.addEventListener('click', function()    { setMode('reset'); });

    modeRow.appendChild(preserveBtn);
    modeRow.appendChild(resetBtn);
    body.appendChild(modeRow);

  } else {
    // Easing
    var easingRow = document.createElement('div');
    easingRow.className = 'easing-row';
    var easingLabel = document.createElement('label');
    easingLabel.textContent = 'Easing';
    var easingSel = document.createElement('select');
    EASING_OPTIONS.forEach(function(opt) {
      var o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.label;
      var cur = step.easing || (PRESET_DEFAULTS[step.name] && PRESET_DEFAULTS[step.name].easing) || 'easeOutCubic';
      if (cur === opt.value) o.selected = true;
      easingSel.appendChild(o);
    });
    easingSel.addEventListener('change', function() {
      if (st.sequences[cardId] && st.sequences[cardId][stepIdx]) {
        st.sequences[cardId][stepIdx].easing = easingSel.value;
      }
    });
    easingRow.appendChild(easingLabel);
    easingRow.appendChild(easingSel);
    body.appendChild(easingRow);

    // Divider
    var div2 = document.createElement('div');
    div2.style.cssText = 'height:1px; background:var(--border); margin:8px 0;';
    body.appendChild(div2);

    // Param sliders
    var schema = PRESET_PARAM_SCHEMA[step.name];
    if (schema) {
      schema.forEach(function(s) {
        if (s.hidden) return;
        if (s.type === 'direction4') {
          var dRow = document.createElement('div');
          dRow.className = 'slider-row';
          dRow.style.cssText = 'display:flex; align-items:center; gap:6px; padding:3px 0;';
          var dLbl = document.createElement('span');
          dLbl.className = 'slider-label'; dLbl.textContent = s.label;
          var dBtns = document.createElement('div');
          dBtns.style.cssText = 'display:grid; grid-template-columns:1fr 1fr 1fr; grid-template-rows:1fr 1fr 1fr; gap:2px; width:72px; flex-shrink:0;';
          var curDir = (step.params && step.params[s.key]) || s.default || 'left';
          var dirs = [
            {d:null,icon:'',r:0,c:0},{d:'top',icon:'↑',r:0,c:1},{d:null,icon:'',r:0,c:2},
            {d:'left',icon:'←',r:1,c:0},{d:null,icon:'·',r:1,c:1},{d:'right',icon:'→',r:1,c:2},
            {d:null,icon:'',r:2,c:0},{d:'bottom',icon:'↓',r:2,c:1},{d:null,icon:'',r:2,c:2}
          ];
          dirs.forEach(function(entry) {
            var cell = document.createElement('button');
            cell.style.cssText = 'width:22px;height:22px;border:none;border-radius:3px;font-size:13px;cursor:'+(entry.d?'pointer':'default')+';display:flex;align-items:center;justify-content:center;padding:0;';
            cell.textContent = entry.icon;
            if (entry.d) {
              cell.style.background = (curDir === entry.d) ? 'var(--accent)' : 'var(--surface2)';
              cell.style.color = (curDir === entry.d) ? '#fff' : 'var(--text)';
              (function(dir, btn) {
                btn.addEventListener('click', function() {
                  if (!st.sequences[cardId][stepIdx].params) st.sequences[cardId][stepIdx].params = {};
                  st.sequences[cardId][stepIdx].params[s.key] = dir;
                  refreshStepEditorPanel();
                  renderTimeline();
                });
              })(entry.d, cell);
            } else {
              cell.style.background = 'transparent';
              cell.style.color = entry.icon === '·' ? 'var(--muted)' : 'transparent';
            }
            dBtns.appendChild(cell);
          });
          dRow.appendChild(dLbl); dRow.appendChild(dBtns);
          body.appendChild(dRow);
        } else {
          var curVal = (step.params && step.params[s.key] != null) ? step.params[s.key] : (s.default != null ? s.default : s.min);
          var sRow = makeStepSlider(s.label, curVal, s.min, s.max, s.step, s.fmt, function(v) {
            if (!st.sequences[cardId][stepIdx].params) st.sequences[cardId][stepIdx].params = {};
            st.sequences[cardId][stepIdx].params[s.key] = v;
          });
          body.appendChild(sRow);
        }
      });
    }

    // Orbit auto-space helper
    if (step.name === 'Orbit') {
      var autoBtn = document.createElement('button');
      autoBtn.textContent = '◎ Auto-space Cards in Orbit';
      autoBtn.style.cssText = 'margin-top:8px; width:100%; padding:6px; background:var(--surface2); border:1px solid var(--border); border-radius:4px; color:var(--text); cursor:pointer; font-size:11px;';
      autoBtn.addEventListener('click', function() {
        var orbitCards = Object.keys(st.sequences).filter(function(cid) {
          return st.sequences[cid] && st.sequences[cid][stepIdx] && st.sequences[cid][stepIdx].name === 'Orbit';
        });
        if (orbitCards.length < 2) { showToast('Add Orbit to multiple st.cards first'); return; }
        orbitCards.forEach(function(cid, i) {
          if (!st.sequences[cid][stepIdx].params) st.sequences[cid][stepIdx].params = {};
          st.sequences[cid][stepIdx].params.orbitOffset = i / orbitCards.length;
        });
        renderTimeline();
        showToast('Spaced ' + orbitCards.length + ' st.cards evenly in orbit');
      });
      body.appendChild(autoBtn);
    }
  }

  panel.classList.add('open');
  upgradeAllSliders();
}

// Close step editor from breadcrumb X
document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.getElementById('step-editor-close');
  if (closeBtn) closeBtn.addEventListener('click', function() {
    st.openStepEditor = null; renderTimeline();
  });
});
// Also wire it up immediately in case DOMContentLoaded already fired
(function() {
  var closeBtn = document.getElementById('step-editor-close');
  if (closeBtn) closeBtn.addEventListener('click', function() {
    st.openStepEditor = null; renderTimeline();
  });
})();


export function makeStepSlider(label, value, min, max, step, fmt, onChange) {
  return makeSliderRow(label, value, min, max, step, fmt, onChange);
}

// ── Universal enhanced slider row ────────────────────────────────────────
// Builds:  [label] [range] [−] [numInput] [+]
export function makeSliderRow(label, value, min, max, step, fmt, onChange) {
  var row = document.createElement('div');
  row.className = 'slider-row';

  var lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  var sl = document.createElement('input');
  sl.type = 'range'; sl.min = min; sl.max = max; sl.step = step; sl.value = value;
  row.appendChild(sl);

  var btnMinus = document.createElement('button');
  btnMinus.className = 'pm-btn'; btnMinus.textContent = '−';
  row.appendChild(btnMinus);

  var numIn = document.createElement('input');
  numIn.type = 'number'; numIn.className = 'num-input';
  numIn.min = min; numIn.max = max; numIn.step = step;
  var dec = step < 1 ? String(step).split('.')[1].length : 0;
  numIn.value = parseFloat(value).toFixed(dec);
  row.appendChild(numIn);

  var btnPlus = document.createElement('button');
  btnPlus.className = 'pm-btn'; btnPlus.textContent = '+';
  row.appendChild(btnPlus);

  var fStep = parseFloat(step);
  btnMinus.title = '−' + fStep + '  (Shift: ×10)';
  btnPlus.title  = '+' + fStep + '  (Shift: ×10)';

  function getBtnStep(e) {
    var bs = parseFloat(sl.dataset && sl.dataset.btnStep) || fStep;
    return bs * (e.shiftKey ? 10 : 1);
  }
  function clamp(v) { return Math.max(parseFloat(min), Math.min(parseFloat(max), v)); }
  function setVal(v) {
    v = clamp(parseFloat(v.toFixed(dec)));
    sl.value = v; numIn.value = v.toFixed(dec);
    onChange(v);
  }
  sl.addEventListener('input', function() { setVal(parseFloat(sl.value)); });
  numIn.addEventListener('input', function() { var v = parseFloat(numIn.value); if (!isNaN(v)) setVal(v); });
  numIn.addEventListener('keydown', function(e) { e.stopPropagation(); });
  btnMinus.addEventListener('click', function(e) {
    e.preventDefault();
    setVal(parseFloat(sl.value) - getBtnStep(e));
  });
  btnPlus.addEventListener('click', function(e) {
    e.preventDefault();
    setVal(parseFloat(sl.value) + getBtnStep(e));
  });

  return row;
}

// ── Auto-upgrade every hard-coded slider row in the DOM ──────────────────
// Finds all .slider-row elements that contain a range input but no .num-input yet,
// and injects [−] [numInput] [+] controls after the range, keeping existing val sync.
export function upgradeAllSliders() {
  document.querySelectorAll('.slider-row').forEach(function(row) {
    var sl = row.querySelector('input[type=range]');
    if (!sl || row.querySelector('.num-input')) return; // skip if no range or already upgraded

    var min = parseFloat(sl.min || 0);
    var max = parseFloat(sl.max || 100);
    var step = parseFloat(sl.step || 1);
    var dec = step < 1 ? (String(step).indexOf('.') >= 0 ? String(step).split('.')[1].length : 0) : 0;
    var valSpan = row.querySelector('.val'); // may be null for some rows

    // Minus button
    var btnMinus = document.createElement('button');
    btnMinus.className = 'pm-btn'; btnMinus.textContent = '−';
    btnMinus.type = 'button';

    // Number input
    var numIn = document.createElement('input');
    numIn.type = 'number'; numIn.className = 'num-input';
    numIn.min = sl.min; numIn.max = sl.max; numIn.step = sl.step;
    numIn.value = parseFloat(sl.value).toFixed(dec);

    // Plus button
    var btnPlus = document.createElement('button');
    btnPlus.className = 'pm-btn'; btnPlus.textContent = '+';
    btnPlus.type = 'button';

    // Button step: prefer data-btn-step override, fall back to slider step
    var btnStep = parseFloat(sl.dataset.btnStep) || step;
    btnMinus.title = '−' + btnStep + '  (Shift: ×10)';
    btnPlus.title  = '+' + btnStep + '  (Shift: ×10)';

    function getBtnStep(e) { return btnStep * (e.shiftKey ? 10 : 1); }
    function clamp(v) { return Math.max(min, Math.min(max, v)); }
    function syncAll(v) {
      v = clamp(parseFloat(v.toFixed(dec)));
      sl.value = v;
      numIn.value = v.toFixed(dec);
      if (valSpan) {
        valSpan.textContent = v.toFixed(dec);
      }
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Override the range listener to also keep numIn in sync
    sl.addEventListener('input', function() {
      numIn.value = parseFloat(sl.value).toFixed(dec);
    });

    numIn.addEventListener('input', function() {
      var v = parseFloat(numIn.value);
      if (!isNaN(v)) {
        v = clamp(v);
        sl.value = v;
        sl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    numIn.addEventListener('keydown', function(e) { e.stopPropagation(); });

    btnMinus.addEventListener('click', function(e) {
      e.preventDefault();
      syncAll(parseFloat(sl.value) - getBtnStep(e));
    });
    btnPlus.addEventListener('click', function(e) {
      e.preventDefault();
      syncAll(parseFloat(sl.value) + getBtnStep(e));
    });

    // Insert after the range input (or after valSpan if present)
    var insertAfter = valSpan || sl;
    insertAfter.insertAdjacentElement('afterend', btnPlus);
    insertAfter.insertAdjacentElement('afterend', numIn);
    insertAfter.insertAdjacentElement('afterend', btnMinus);
  });
}

// ---- Active block per-card at current st.playhead ----
// Returns { stepIdx, progress } or null
export function getActiveStep(cardId) {
  var seq = st.sequences[cardId];
  if (!seq || seq.length === 0) return null;
  var elapsed = st.playhead;
  for (var i = 0; i < seq.length; i++) {
    var dur = seq[i].duration || 1000;
    if (elapsed <= dur || i === seq.length - 1) {
      return { stepIdx: i, progress: Math.min(1, elapsed / dur) };
    }
    elapsed -= dur;
  }
  return null;
}

// Lightweight update — just tweaks classes + progress bar widths on existing DOM
export function updateActiveBlocks() {
  var sections = document.getElementById('seq-tracks').querySelectorAll('.seq-card-section');
  sections.forEach(function(section) {
    var blocks = section.querySelectorAll('.seq-block');
    var cardId = section.dataset.cardId;
    if (!cardId) return;
    var active = (st.isPlaying || st.playhead > 0) ? getActiveStep(cardId) : null;
    blocks.forEach(function(b, i) {
      var isActive = active && active.stepIdx === i;
      b.classList.toggle('active-block', !!isActive);
      var bar = b.querySelector('.block-progress');
      if (bar) bar.style.width = (isActive ? (active.progress * 100) : 0) + '%';
    });
  });
}

// Call this every frame from the render loop
// We'll hook into the scrubber update instead to keep it clean
// st._lastActiveUpdate is in AppState
export function tickActiveBlocks(t) {
  if (t - st._lastActiveUpdate > 50) { // ~20fps is plenty for progress bars
    updateActiveBlocks();
    st._lastActiveUpdate = t;
  }
}

// ---- Block drag-to-reorder ----
// st.blockDrag is in AppState

function attachBlockDragHandlers(blockEl, cardId, si) {
}
