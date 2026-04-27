// ============================================================
//  ARCANA GLAM — Showcase 3D  (showcase-3d.js)
//  Three.js card renderer active only in showcase mode.
//  Sits on top of the existing canvas as a transparent overlay.
//  The existing 2D canvas continues to render BG FX untouched.
//  app.js skips 2D card drawing when st.showcase3d.active.
// ============================================================

import * as THREE from 'three';
import { AppState as st } from './state.js';
import { drawCard, drawCustomCard } from './renderer.js';
import { getSpellPreset, FIRE_PALETTES, hexToRgbArr } from './fx-engine.js';

// ── Constants ─────────────────────────────────────────────────────────────────

var CARD_W      = 110;    // canvas units — must match renderer.js
var CARD_H      = 154;
// Mobile uses 2× (220×308) — still sharp on 3× DPR screens; saves 75% pixel ops in offscreen render
var TEX_SCALE   = (st.MOBILE_PERF_QUERY && st.MOBILE_PERF_QUERY.matches) ? 2 : 4;
var TEX_W       = CARD_W * TEX_SCALE;
var TEX_H       = CARD_H * TEX_SCALE;
var CARD_ASPECT = CARD_H / CARD_W;   // ≈ 1.4

// Card 3D dimensions in world units (card face = 1 wide × CARD_ASPECT tall)
var CARD_THICK  = 0.018;  // realistic card thinness
var CORNER_R    = 0.065;  // corner radius relative to card width (r/w = 8/110 ≈ 0.073)

// _gyroTiltX/Y are in the -24..+24 range (mobile.js _tiltStrength = 24).
var GYRO_NORM = 24;

// ── Spring constants (spec §8) ─────────────────────────────────────────────
var ROT_STIFFNESS = 0.032;
var ROT_DAMPING   = 0.92;
var POS_STIFFNESS = 0.020;
var POS_DAMPING   = 0.90;
var Z_STIFFNESS   = 0.030;
var Z_DAMPING     = 0.90;

// ── Rotation limits (spec §6) ─────────────────────────────────────────────
var MAX_PITCH = 0.17;   // rotX — forward/back lean
var MAX_YAW   = 0.17;   // rotY — left/right turn
var MAX_ROLL  = 0.055;  // rotZ — lean into direction

// ── Position limits (spec §7) ─────────────────────────────────────────────
var MAX_DRIFT_X = 0.028;
var MAX_DRIFT_Y = 0.020;
var MAX_DRIFT_Z = 0.060;

// ── Module state ──────────────────────────────────────────────────────────────

var _renderer   = null;
var _scene      = null;
var _camera     = null;
var _rafId      = null;
var _cardObjs   = [];
var _overlayEl   = null;
var _particleEl  = null;
var _particleCtx = null;
var _grainTex   = null;   // shared procedural roughness texture (created once)
var _backTex    = null;   // shared card-back texture (created once)
var _keyLight     = null;   // directional light synced to st.globalLight each frame
var _ambientLight = null;   // ambient light — tinted toward global light colour
var _partMat      = null;   // shared ShaderMaterial for 3D spell particles (all cards)
var _captureFrame = 0;      // frame counter for mobile texture-capture skip

// ── Particle constants ────────────────────────────────────────────────────────
var _PART_MAX = (st.MOBILE_PERF_QUERY && st.MOBILE_PERF_QUERY.matches) ? 100 : 200;  // pool size per card

// ── WebGL availability check ──────────────────────────────────────────────────

function _webGLAvailable() {
  try {
    var c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (e) { return false; }
}

// ── Procedural card-stock grain texture ──────────────────────────────────────
// Generates a linen-weave roughness map once and reuses it.
// Roughness values span ~0.52–0.96, giving visible grain under directional light.

function _getGrainTexture() {
  if (_grainTex) return _grainTex;

  var SIZE = 256;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  var ctx = canvas.getContext('2d');
  var img = ctx.createImageData(SIZE, SIZE);
  var d   = img.data;

  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      var idx = (y * SIZE + x) * 4;

      // Fine white noise base
      var n = Math.random();

      // Linen-weave bias: subtle crossing horizontal + vertical sinusoidal threads
      var wx = Math.pow(Math.abs(Math.sin(x * 1.57)), 3) * 0.10;
      var wy = Math.pow(Math.abs(Math.sin(y * 1.57)), 3) * 0.10;

      // Combined: mid-grey base + noise + weave
      var v = Math.min(1, 0.52 + n * 0.32 + wx + wy);

      var byte = Math.floor(v * 255);
      d[idx] = d[idx + 1] = d[idx + 2] = byte;
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  _grainTex = new THREE.CanvasTexture(canvas);
  _grainTex.wrapS = _grainTex.wrapT = THREE.RepeatWrapping;
  _grainTex.repeat.set(5, 7);    // tile across card face
  _grainTex.minFilter = THREE.LinearMipmapLinearFilter;
  _grainTex.generateMipmaps = true;
  return _grainTex;
}

// ── Card back texture ─────────────────────────────────────────────────────────
// Uses the default card back image (assets/images/card-back-default.png).
// Falls back to a solid dark colour if the image hasn't loaded yet,
// and schedules a needsUpdate once it arrives.

function _getCardBackTexture() {
  if (_backTex) return _backTex;

  var imgEl = st.images && st.images[st.DEFAULT_BACK_ID];

  if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
    // Image already in memory — create texture directly
    _backTex = new THREE.Texture(imgEl);
    _backTex.colorSpace  = THREE.SRGBColorSpace;
    _backTex.minFilter   = THREE.LinearFilter;
    _backTex.magFilter   = THREE.LinearFilter;
    _backTex.needsUpdate = true;
    return _backTex;
  }

  // Placeholder: 1×1 dark pixel while the image loads
  var fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = 2; fallbackCanvas.height = 2;
  fallbackCanvas.getContext('2d').fillStyle = '#07040f';
  fallbackCanvas.getContext('2d').fillRect(0, 0, 2, 2);
  _backTex = new THREE.CanvasTexture(fallbackCanvas);
  _backTex.colorSpace = THREE.SRGBColorSpace;
  _backTex.minFilter  = THREE.LinearFilter;
  _backTex.magFilter  = THREE.LinearFilter;

  // Swap in the real image once it finishes loading
  if (imgEl) {
    imgEl.onload = function() {
      if (!_backTex) return;
      _backTex.image       = imgEl;
      _backTex.needsUpdate = true;
    };
  }
  return _backTex;
}

// ── Rounded rect path helper ──────────────────────────────────────────────────

function _drawRoundedPath(path, w, h, r) {
  var hw = w / 2, hh = h / 2;
  path.moveTo(-hw + r, -hh);
  path.lineTo( hw - r, -hh);
  path.quadraticCurveTo( hw, -hh,  hw, -hh + r);
  path.lineTo( hw,  hh - r);
  path.quadraticCurveTo( hw,  hh,  hw - r,  hh);
  path.lineTo(-hw + r,  hh);
  path.quadraticCurveTo(-hw,  hh, -hw,  hh - r);
  path.lineTo(-hw, -hh + r);
  path.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  path.closePath();
}

function _makeCardShape(w, h, r) {
  var shape = new THREE.Shape();
  _drawRoundedPath(shape, w, h, r);
  return shape;
}

// Remap ShapeGeometry UVs from raw shape coords to [0,1]×[0,1].
// ShapeGeometry UV = raw x,y from shape: x ∈ [-w/2, w/2], y ∈ [-h/2, h/2].
function _remapShapeUVs(geo, w, h) {
  var uv = geo.attributes.uv;
  for (var i = 0; i < uv.count; i++) {
    uv.setXY(i,
      uv.getX(i) / w + 0.5,   // [-w/2, w/2] → [0, 1]
      uv.getY(i) / h + 0.5    // [-h/2, h/2] → [0, 1]
    );
  }
  uv.needsUpdate = true;
}

// ── 3D spell particles ────────────────────────────────────────────────────────
// Self-contained particle system using THREE.Points.
// Physics mirrors fx-engine.js SPELL_PRESETS values, adapted to 3D world space.

var _PART_VERT = [
  'attribute vec3  a_col;',
  'attribute float a_alpha;',
  'attribute float a_psize;',
  'varying   vec3  v_col;',
  'varying   float v_alpha;',
  'void main() {',
  '  v_col   = a_col;',
  '  v_alpha = a_alpha;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = a_psize * 400.0 / -mv.z;',
  '  gl_Position  = projectionMatrix * mv;',
  '}'
].join('\n');

var _PART_FRAG = [
  'varying vec3  v_col;',
  'varying float v_alpha;',
  'void main() {',
  '  vec2  d  = gl_PointCoord - 0.5;',
  '  float r2 = dot(d, d) * 4.0;',
  '  if (r2 > 1.0) discard;',
  '  float a  = v_alpha * (1.0 - r2 * r2);',
  '  gl_FragColor = vec4(v_col, a);',
  '}'
].join('\n');

function _getPartMat() {
  if (_partMat) return _partMat;
  _partMat = new THREE.ShaderMaterial({
    vertexShader:   _PART_VERT,
    fragmentShader: _PART_FRAG,
    transparent:    true,
    blending:       THREE.AdditiveBlending,
    depthWrite:     false
  });
  return _partMat;
}

function _rgb01(hex) {
  var h = (hex || '#ffffff').replace('#', '');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}

function _lerpC(a, b, t) {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}

// Maps normalized age (0=just spawned / hot, 1=dying) to RGB.
// Uses FIRE_PALETTES when preset.palette is set, otherwise color/color2/color3.
function _partColorAtAge(age, preset) {
  var pal = preset.palette ? FIRE_PALETTES[preset.palette] : null;
  var core, mid, tip;
  if (pal) {
    core = [pal.core[0]/255, pal.core[1]/255, pal.core[2]/255];
    mid  = [pal.mid[0]/255,  pal.mid[1]/255,  pal.mid[2]/255];
    tip  = [pal.tip[0]/255,  pal.tip[1]/255,  pal.tip[2]/255];
  } else {
    tip  = _rgb01(preset.color  || '#ff4400');
    mid  = _rgb01(preset.color2 || preset.color);
    core = _rgb01(preset.color3 || preset.color2 || preset.color);
  }
  return age < 0.5 ? _lerpC(core, mid, age * 2) : _lerpC(mid, tip, (age - 0.5) * 2);
}

function _makePartState() {
  return {
    // GPU arrays — uploaded via needsUpdate every tick
    pos:    new Float32Array(_PART_MAX * 3),
    col:    new Float32Array(_PART_MAX * 3),
    alpha:  new Float32Array(_PART_MAX),
    psize:  new Float32Array(_PART_MAX),
    // CPU-only state
    vx:     new Float32Array(_PART_MAX),
    vy:     new Float32Array(_PART_MAX),
    vz:     new Float32Array(_PART_MAX),
    age:    new Float32Array(_PART_MAX),   // 0 = born, 1 = dead
    life:   new Float32Array(_PART_MAX),   // total lifespan in seconds
    isize:  new Float32Array(_PART_MAX),   // initial spawn size
    active: new Uint8Array(_PART_MAX),
    acc:    0   // fractional spawn accumulator
  };
}

function _initCardParticles(obj) {
  if (!obj.card.spell || !obj.card.spell.on) return;
  var ps  = _makePartState();
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(ps.pos,   3));
  geo.setAttribute('a_col',    new THREE.BufferAttribute(ps.col,   3));
  geo.setAttribute('a_alpha',  new THREE.BufferAttribute(ps.alpha, 1));
  geo.setAttribute('a_psize',  new THREE.BufferAttribute(ps.psize, 1));
  var pts = new THREE.Points(geo, _getPartMat());
  pts.frustumCulled = false;
  obj.partState  = ps;
  obj.partGeo    = geo;
  obj.partPoints = pts;
  // Add to rotGroup so particles tilt/rotate with the card geometry
  var target = obj.rotGroup || obj.group;
  target.add(pts);
}

function _spawnParticle(obj, slot, preset) {
  var ps = obj.partState;
  var hw = 0.5, hh = CARD_ASPECT / 2;
  var jit = (preset.spawnJitter || 1.0) * 0.04;
  var lx, ly, lz = 0.06;  // slightly in front of card face

  var edge = preset.spawnEdge || 'frame';
  if (edge === 'base') {
    lx = (Math.random() - 0.5) * hw * 2.2;
    ly = -hh + Math.random() * hh * 0.5;
  } else if (edge === 'frame') {
    var side = Math.floor(Math.random() * 4);
    if      (side === 0) { lx = (Math.random()-0.5)*hw*2; ly = -hh; }
    else if (side === 1) { lx = (Math.random()-0.5)*hw*2; ly =  hh; }
    else if (side === 2) { lx = -hw; ly = (Math.random()-0.5)*hh*2; }
    else                 { lx =  hw; ly = (Math.random()-0.5)*hh*2; }
  } else if (edge === 'edge-out') {
    var side2 = Math.floor(Math.random() * 4);
    if      (side2 === 0) { lx = (Math.random()-0.5)*hw*2; ly = -hh; }
    else if (side2 === 1) { lx = (Math.random()-0.5)*hw*2; ly =  hh; }
    else if (side2 === 2) { lx = -hw; ly = (Math.random()-0.5)*hh*2; }
    else                  { lx =  hw; ly = (Math.random()-0.5)*hh*2; }
  } else {
    lx = (Math.random()-0.5) * hw * 2.4;
    ly = (Math.random()-0.5) * hh * 2.4;
  }
  lx += (Math.random()-0.5) * jit;
  ly += (Math.random()-0.5) * jit;

  // Card-local coordinates — group transform handles world placement
  ps.pos[slot*3]   = lx;
  ps.pos[slot*3+1] = ly;
  ps.pos[slot*3+2] = lz;

  // Velocity in card-local space.
  // preset.gravity is negative-upward in canvas coords → +Y in card-local space
  var spread = (preset.spread       || 0.5) * 0.12;
  var rise   = (preset.riseStrength || 1.0) * 0.30;
  ps.vx[slot] = (Math.random()-0.5) * spread;
  ps.vy[slot] = rise + Math.random() * rise * 0.5;
  ps.vz[slot] = (Math.random()-0.5) * spread * 0.25;

  // For edge-out: initial burst in card-local +Z (out from face) + edge-tangent spread
  if (edge === 'edge-out') {
    ps.vz[slot] += (preset.spread||0.5) * 0.15;
  }

  var lMin = preset.lifeMin || 0.8, lMax = preset.lifeMax || 1.5;
  ps.life[slot]  = lMin + Math.random() * (lMax - lMin);
  ps.age[slot]   = 0;
  ps.isize[slot] = 0.06 + Math.random() * 0.09;
  ps.psize[slot] = ps.isize[slot];
  ps.active[slot] = 1;
  ps.alpha[slot]  = 0;

  var col = _partColorAtAge(0, preset);
  ps.col[slot*3]   = col[0];
  ps.col[slot*3+1] = col[1];
  ps.col[slot*3+2] = col[2];
}

function _tickCardParticles(obj, dt) {
  var ps = obj.partState;
  if (!ps) return;
  var card = obj.card;
  if (!card.spell || !card.spell.on) return;

  var preset = getSpellPreset(card);
  if (preset.neuroOnly) return;

  var dtS  = Math.min(dt, 50) / 1000;
  // In SPELL_PRESETS, gravity is negative-upward (canvas Y flipped); invert for 3D Y-up
  var accelY = -(preset.gravity || -0.038) * 0.7;
  // Frame-rate-independent drag: if drag = 0.976 @ 60fps → pow(0.976, 60*dtS)
  var drag = Math.pow(preset.drag || 0.976, 60 * dtS);
  var sway = (preset.sway || 0.016) * 0.25;
  var fadeIn = preset.fadeIn || 0.04;

  for (var i = 0; i < _PART_MAX; i++) {
    if (!ps.active[i]) continue;

    ps.age[i] += dtS / ps.life[i];
    if (ps.age[i] >= 1.0) {
      ps.active[i] = 0;
      ps.alpha[i]  = 0;
      continue;
    }

    ps.pos[i*3]   += ps.vx[i] * dtS;
    ps.pos[i*3+1] += ps.vy[i] * dtS;
    ps.pos[i*3+2] += ps.vz[i] * dtS;

    ps.vy[i] += accelY * dtS;
    ps.vx[i] += Math.sin(ps.age[i] * ps.life[i] * 3.7 + i * 2.1) * sway * dtS;
    ps.vx[i] *= drag;
    ps.vy[i] *= drag;
    ps.vz[i] *= drag;

    var age = ps.age[i];
    var col = _partColorAtAge(age, preset);
    ps.col[i*3]   = col[0];
    ps.col[i*3+1] = col[1];
    ps.col[i*3+2] = col[2];

    ps.alpha[i] = age < fadeIn ? age / fadeIn
                : age > 0.7   ? (1 - age) / 0.3
                : 1.0;

    var szF = age < 0.35 ? 1.0 + age * 0.6 : Math.max(0.05, 1.21 - (age - 0.35) * 0.85);
    ps.psize[i] = ps.isize[i] * szF;
  }

  // Spawn new particles
  var spawnRate = 55 * (card.spell.intensity != null ? card.spell.intensity : 1.0);
  ps.acc += spawnRate * dtS;
  while (ps.acc >= 1) {
    ps.acc -= 1;
    for (var j = 0; j < _PART_MAX; j++) {
      if (!ps.active[j]) { _spawnParticle(obj, j, preset); break; }
    }
  }

  obj.partGeo.attributes.position.needsUpdate = true;
  obj.partGeo.attributes.a_col.needsUpdate    = true;
  obj.partGeo.attributes.a_alpha.needsUpdate  = true;
  obj.partGeo.attributes.a_psize.needsUpdate  = true;
}

// ── Card mesh builder ─────────────────────────────────────────────────────────
//
// Architecture:
//   • Body : ExtrudeGeometry (rounded rect shape + bevel) — single dark material.
//            Gives proper rounded 3D corners visible when tilted.
//            All groups (side, front cap, back cap) use the same dark material
//            so there's no material-index ambiguity.
//   • Face : ShapeGeometry floating 0.006 in FRONT of the body's front cap.
//            Eliminates z-fighting. Always faces +z toward camera. ✓

function _buildCardMesh(obj) {
  // Three-level hierarchy (spec §3):
  //   anchor    — fixed at layout position, never moves
  //   floatGroup — tiny positional lag/drift
  //   rotGroup   — all rotations + inertia; card geometry lives here
  var anchor    = new THREE.Group();
  var floatGrp  = new THREE.Group();
  var rotGrp    = new THREE.Group();
  anchor.add(floatGrp);
  floatGrp.add(rotGrp);

  var faceShape = _makeCardShape(1, CARD_ASPECT, CORNER_R);

  // ── 3D card body ─────────────────────────────────────────────────────────
  var bodyMat = new THREE.MeshStandardMaterial({
    color:     0x1a1025,
    roughness: 0.78,
    metalness: 0.08
  });
  var bodyGeo = new THREE.ExtrudeGeometry(faceShape, {
    depth:          CARD_THICK,
    bevelEnabled:   true,
    bevelThickness: 0.005,
    bevelSize:      0.004,
    bevelSegments:  4,
    curveSegments:  20
  });
  var bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.z = -(CARD_THICK * 0.5);
  rotGrp.add(bodyMesh);

  // ── Front face ───────────────────────────────────────────────────────────
  var faceGeo = new THREE.ShapeGeometry(faceShape, 20);
  _remapShapeUVs(faceGeo, 1, CARD_ASPECT);
  var faceMat = new THREE.MeshBasicMaterial({
    map:         obj.texture,
    transparent: true,
    toneMapped:  false,
    side:        THREE.FrontSide
  });
  var faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.position.z = CARD_THICK * 0.5 + 0.006;
  rotGrp.add(faceMesh);

  // ── Back face (shown when card is flipped) ───────────────────────────────
  var backGeo = new THREE.ShapeGeometry(faceShape, 20);
  _remapShapeUVs(backGeo, 1, CARD_ASPECT);
  var backMat = new THREE.MeshBasicMaterial({
    map:        _getCardBackTexture(),
    transparent: false,
    toneMapped:  false,
    side:        THREE.FrontSide
  });
  var backMesh = new THREE.Mesh(backGeo, backMat);
  backMesh.position.z = -(CARD_THICK * 0.5 + 0.006);
  backMesh.rotation.y = Math.PI;  // normal faces -Z; visible when card is flipped
  rotGrp.add(backMesh);

  obj.group      = anchor;
  obj.floatGroup = floatGrp;
  obj.rotGroup   = rotGrp;
  obj.bodyMesh   = bodyMesh;
  obj.faceMesh   = faceMesh;
  obj.faceMat    = faceMat;
  obj.backMesh   = backMesh;
}

// ── Texture capture ───────────────────────────────────────────────────────────
// drawCard draws at card world position (c.x, c.y).
// To capture into our TEX_W × TEX_H offscreen canvas we:
//   1. Scale the ctx by TEX_SCALE
//   2. Temporarily place the card at the canvas center (CARD_W/2, CARD_H/2)
//      with scale=1 and rot=0 so it fills exactly 110×154 scaled px

function _captureCardTexture(obj, t) {
  var card = obj.card;

  // ── Version-counter dirty guard ───────────────────────────────────────
  // Avoid re-baking the full drawCard() pipeline when nothing has changed.
  // Animated cards throttle to ~30fps (high) / ~20fps (mid/low). Static
  // cards only re-bake when card._version changes, OR every 250ms as a
  // safety floor so any missed markCardDirty() call surfaces within a
  // quarter second. The safety floor is what guarantees "feels alive
  // without interaction" even if mutation tracking drifts.
  if (obj._bakedVersion === undefined) obj._bakedVersion = -1;
  var now = performance.now();

  var hasAnim =
    (card.shimmer && card.shimmer.on) ||
    (card.holo    && card.holo.on)    ||
    (card.ripple  && card.ripple.on)  ||
    (card.grain   && card.grain.on)   ||
    (st.isPlaying);   // timeline playback may ease texture-affecting props

  var stale = obj._bakedVersion !== (card._version | 0);

  if (hasAnim) {
    var fpsLimitMs = st.PERF_TIER === 'high' ? 33 : 50;
    if (!stale && obj._lastTexCapture && (now - obj._lastTexCapture) < fpsLimitMs) return;
  } else {
    var SAFETY_FLOOR_MS = 250;
    var aged = !obj._lastTexCapture || (now - obj._lastTexCapture) > SAFETY_FLOOR_MS;
    if (!stale && !aged) return;
  }

  obj._lastTexCapture = now;
  obj._bakedVersion   = (card._version | 0);

  var cap  = obj.capCtx;

  cap.clearRect(0, 0, TEX_W, TEX_H);

  // drawCard uses c.x / c.y as the world draw position and c.scale for size.
  // We temporarily set them so the card renders centered and filling the
  // TEX_W × TEX_H canvas at native resolution (no ctx.scale needed).
  //   cx = c.x → TEX_W/2  cy = c.y → TEX_H/2
  //   cs = c.scale → TEX_SCALE  (fills 110*4 × 154*4 canvas exactly)
  var sx = card.x, sy = card.y, sscale = card.scale, srot = card.rot;

  card.x     = TEX_W / 2;    // 220 — center of capture canvas
  card.y     = TEX_H / 2;    // 308
  card.scale = TEX_SCALE;    // 4 — fills the canvas
  card.rot   = 0;

  // Inject showcase-sourced tilt into the card's hover record for the duration
  // of the bake. This is what gives the prism holo reflection its parallax
  // motion in showcase — without it the bake would be pose-neutral and the
  // reflection would sit frozen inside the face texture.
  //
  // st.gyro.tiltY is already scaled to ±24 by mobile.js (_tiltStrength=24),
  // same range the editor path puts into hov.tilt via lerp. No extra * 6
  // multiplier — that was over-amplifying and producing chaotic motion.
  //
  // Smoothing uses a gentler lerp (0.08) than the editor (0.16) because the
  // bake runs at 20–30fps (throttled) rather than 60fps. The lower factor
  // compensates for the fewer frames available to interpolate through,
  // keeping the foil sweep buttery at the bake cadence.
  var _hov = st.hoverData[card.id];
  var _savedHovTilt = _hov ? _hov.tilt : undefined;
  // Smooth both axes — Y drives hov.tilt (foil parallax), X drives
  // the light wash shift so both respond to card interaction.
  var rawTiltY = st.gyro.tiltY || 0;
  var rawTiltX = st.gyro.tiltX || 0;
  if (obj._smoothBakeTilt  == null) obj._smoothBakeTilt  = rawTiltY;
  if (obj._smoothBakeTiltX == null) obj._smoothBakeTiltX = rawTiltX;
  obj._smoothBakeTilt  += (rawTiltY - obj._smoothBakeTilt)  * 0.08;
  obj._smoothBakeTiltX += (rawTiltX - obj._smoothBakeTiltX) * 0.08;
  if (_hov) _hov.tilt = obj._smoothBakeTilt;

  var savedCtx = st.ctx;
  st.ctx = cap;

  try {
    if (card.kind === 'custom') {
      drawCustomCard(card, t, true);
    } else {
      drawCard(card, t, true /* isExport — no gyro transforms, no animation offsets */);
    }
  } catch (e) { /* ignore missing-image errors during load */ }

  // ── Global light wash on baked card texture ──────────────────────────────
  // In editor mode, drawGlobalLighting paints a scene-wide glow over the
  // canvas *after* cards are drawn. In showcase the card is a baked texture
  // on a MeshBasicMaterial (unlit), so that glow never reaches it. We add
  // a directional gradient here so the card surface picks up the global
  // light colour, position, and intensity — matching the editor appearance.
  var gl = st.globalLight;
  if (gl && gl.on && (gl.intensity || 0) > 0.001) {
    var glRgb  = hexToRgbArr(gl.color || '#ffffff').join(',');
    var glInt  = Math.max(0, Math.min(1, gl.intensity || 0.6));
    // Map 2D light position onto the card texture, then shift opposite to
    // tilt so the wash drifts like a real reflection catching a fixed light.
    var glLx   = (gl.x != null ? gl.x : 0.5) * TEX_W;
    var glLy   = (gl.y != null ? gl.y : 0.35) * TEX_H;
    glLx += -(obj._smoothBakeTiltX || 0) / 24 * TEX_W * 0.55;
    glLy += -(obj._smoothBakeTilt  || 0) / 24 * TEX_H * 0.55;
    // Keep the wash tight enough that movement is visible — a huge radius
    // makes it uniform across the card and the shift becomes imperceptible.
    var glRad  = Math.max(40, Math.min(TEX_W, TEX_H) * (gl.radius || 0.55) * 0.9);
    var glGrad = cap.createRadialGradient(glLx, glLy, 0, glLx, glLy, glRad);
    glGrad.addColorStop(0.0,  'rgba(' + glRgb + ',' + (glInt * 0.55) + ')');
    glGrad.addColorStop(0.4,  'rgba(' + glRgb + ',' + (glInt * 0.25) + ')');
    glGrad.addColorStop(1.0,  'rgba(' + glRgb + ',0)');
    cap.save();
    cap.globalCompositeOperation = 'lighter';
    cap.fillStyle = glGrad;
    cap.fillRect(0, 0, TEX_W, TEX_H);
    cap.restore();
  }

  st.ctx = savedCtx;

  if (_hov) _hov.tilt = _savedHovTilt;

  card.x     = sx;
  card.y     = sy;
  card.scale = sscale;
  card.rot   = srot;

  obj.texture.needsUpdate = true;
}

// ── Scene / renderer setup ────────────────────────────────────────────────────

function _setupScene(W, H) {
  _scene  = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(42, W / H, 0.01, 100);
  _camera.position.z = 3.8;

  // Ambient at 0.45 — semigloss paper base; key light adds directed highlights.
  _ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  _scene.add(_ambientLight);

  // Key light — driven by st.globalLight (color + intensity), updated every frame.
  // Initially off; _syncKeyLight() sets it correctly before the first render.
  _keyLight = new THREE.DirectionalLight(0xffffff, 0);
  _keyLight.position.set(1.4, 2.2, 2.5);
  _scene.add(_keyLight);

  // Subtle cool rim from lower-left — gives card edge some dimensionality
  var fill = new THREE.DirectionalLight(0xb8c8ff, 0.10);
  fill.position.set(-1.5, -0.8, 2);
  _scene.add(fill);
}

function _setupRenderer(W, H) {
  _renderer = new THREE.WebGLRenderer({
    antialias:          true,
    alpha:              true,   // transparent → BG FX from 2D canvas shows through
    premultipliedAlpha: false
  });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.setSize(W, H);
  _renderer.setClearColor(0x000000, 0);
  _renderer.shadowMap.enabled   = false;
  _renderer.outputColorSpace    = THREE.SRGBColorSpace;
  _renderer.toneMapping         = THREE.NoToneMapping;

  _overlayEl = _renderer.domElement;
  _overlayEl.style.position    = 'absolute';
  _overlayEl.style.top         = '0';
  _overlayEl.style.left        = '0';
  _overlayEl.style.width       = '100%';
  _overlayEl.style.height      = '100%';
  _overlayEl.style.zIndex      = '2';
  _overlayEl.style.pointerEvents = 'none';

  var mainCanvas = st.canvas || document.getElementById('main-canvas') || document.querySelector('canvas');
  if (mainCanvas && mainCanvas.parentNode) {
    mainCanvas.parentNode.style.position = 'relative';
    mainCanvas.parentNode.appendChild(_overlayEl);
  } else {
    document.body.appendChild(_overlayEl);
  }

  // Particle overlay — 2D canvas above Three.js so particles appear on top of 3D cards
  _particleEl = document.createElement('canvas');
  _particleEl.style.position     = 'absolute';
  _particleEl.style.top          = '0';
  _particleEl.style.left         = '0';
  _particleEl.style.width        = '100%';
  _particleEl.style.height       = '100%';
  _particleEl.style.zIndex       = '3';
  _particleEl.style.pointerEvents = 'none';
  var _dpr = Math.min(window.devicePixelRatio || 1, 2);
  _particleEl.width  = mainCanvas ? mainCanvas.width  : Math.round(W * _dpr);
  _particleEl.height = mainCanvas ? mainCanvas.height : Math.round(H * _dpr);
  _particleCtx = _particleEl.getContext('2d');
  if (mainCanvas && mainCanvas.parentNode) {
    mainCanvas.parentNode.appendChild(_particleEl);
  } else {
    document.body.appendChild(_particleEl);
  }
  st.showcase3d.particleCtx = _particleCtx;
  st.showcase3d.canvas      = _overlayEl;
  st.showcase3d.particleEl  = _particleEl;
}

// ── Card layout ───────────────────────────────────────────────────────────────

function _layoutCards() {
  var count = _cardObjs.length;
  if (count === 0) return;

  // Visible world width at camera z=3.8, fov=42°:  2 * 3.8 * tan(21°) ≈ 2.91
  var spacing = Math.min(1.25, 2.6 / Math.max(1, count));
  var totalW  = spacing * (count - 1);
  var startX  = -totalW * 0.5;

  for (var i = 0; i < count; i++) {
    _cardObjs[i].targetX    = startX + i * spacing;
    _cardObjs[i].targetY    = 0;
    _cardObjs[i].breathT    = i * 0.8;
    _cardObjs[i]._breathPhase = i * 1.3;
  }
}

// ── Spring physics ────────────────────────────────────────────────────────────

// dg = delta gamma (left/right rotation per event) → drives yaw   (rotY)
// db = delta beta  (forward/back tilt per event)   → drives pitch (rotX)
// ax, ay = device acceleration from devicemotion
function _tickPhysics(obj, dt, dg, db, ax, ay) {
  var dtS = Math.min(dt, 50) / 1000;

  // ── Rotation targets ────────────────────────────────────────────────────
  // mobile.js drives _gyroTiltX/Y from both mouse (absolute) and real gyro
  // (delta-accumulated + spring), so reading here works on desktop and mobile.
  // tiltX = left/right (gamma) → yaw (rotY)
  // tiltY = forward/back (beta) → pitch (rotX)
  var tiltX = Math.max(-1, Math.min(1, (st.gyro.tiltX || 0) / GYRO_NORM));
  var tiltY = Math.max(-1, Math.min(1, (st.gyro.tiltY || 0) / GYRO_NORM));
  obj.targetRotX = tiltY * MAX_PITCH;
  obj.targetRotY = tiltX * MAX_YAW;

  // Z roll: slight lean into horizontal tilt direction
  var targetRotZ = obj.targetRotY * -0.32;
  targetRotZ = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, targetRotZ));

  // ── Acceleration impulse (spec §5) ──────────────────────────────────────
  // Sharp phone movements add a direct velocity kick on top of the spring.
  if (Math.abs(ax) + Math.abs(ay) > 0.8) {
    obj.velX += -ay * 0.003;
    obj.velY +=  ax * 0.003;
    obj.velPosZ -= (Math.abs(ax) + Math.abs(ay)) * 0.0006;
  }

  // ── 3-axis breathing — fades when card is actively tilted ───────────────
  obj.breathT += dtS;
  var breathMag = Math.max(0, 1 - (Math.abs(obj.rotX) + Math.abs(obj.rotY)) * 3.5);
  var breathX = Math.sin(obj.breathT * 0.38 + obj._breathPhase)       * 0.006 * breathMag;
  var breathY = Math.cos(obj.breathT * 0.29 + obj._breathPhase * 1.3) * 0.004 * breathMag;
  var breathZ = Math.sin(obj.breathT * 0.51 + obj._breathPhase * 0.7) * 0.003 * breathMag;

  // ── Rotation spring ──────────────────────────────────────────────────────
  // Y target includes flip offset: face-up → 0, face-down → π.
  // The spring pulls rotY to that position, so the card settles showing
  // whichever face is correct while still responding to tilt perturbations.
  var flipOffset = obj.isFlipped ? Math.PI : 0;
  obj.velX += (obj.targetRotX - obj.rotX) * ROT_STIFFNESS;
  obj.velY += (flipOffset + obj.targetRotY - obj.rotY) * ROT_STIFFNESS;
  obj.velZ += (targetRotZ  - obj.rotZ) * (ROT_STIFFNESS * 0.4);
  obj.velX *= ROT_DAMPING;
  obj.velY *= ROT_DAMPING;
  obj.velZ *= ROT_DAMPING;

  // ── Flip detection ───────────────────────────────────────────────────────
  // A hard enough Y-axis flick (gyro or tap) triggers a 180° flip.
  // Threshold 0.13 rad/frame: exceeded by a full-side tap or forceful tilt,
  // but not by normal gentle tilt (max natural velY ≈ 0.07).
  if (obj._flipCooldown > 0) {
    obj._flipCooldown--;
  } else if (Math.abs(obj.velY) > 0.13) {
    obj.isFlipped = !obj.isFlipped;
    obj._flipCooldown = 45;   // ~0.75 s before next flip can trigger
  }

  obj.rotX += obj.velX;
  obj.rotY += obj.velY;
  obj.rotZ += obj.velZ;

  // ── Face / back visibility ───────────────────────────────────────────────
  // cos(rotY) > 0 → front is facing camera; < 0 → back is facing camera.
  // Swapping at the 90° crossing gives a physically accurate reveal.
  var showFront = Math.cos(obj.rotY) >= 0;
  if (obj.faceMesh)  obj.faceMesh.visible  = showFront;
  if (obj.backMesh)  obj.backMesh.visible  = !showFront;

  // ── Position derived from rotation (spec §6) ─────────────────────────────
  // Float offset is a consequence of lean — physically feels like a pivot.
  var targetPX = -obj.rotY * 0.16;
  var targetPY =  obj.rotX * 0.12;
  // Z: tilted card floats slightly toward camera
  var targetPZ = (Math.abs(obj.rotX) + Math.abs(obj.rotY)) * MAX_DRIFT_Z * 0.5;
  targetPX = Math.max(-MAX_DRIFT_X, Math.min(MAX_DRIFT_X, targetPX));
  targetPY = Math.max(-MAX_DRIFT_Y, Math.min(MAX_DRIFT_Y, targetPY));
  targetPZ = Math.max(0, Math.min(MAX_DRIFT_Z, targetPZ));

  // ── XY position spring ───────────────────────────────────────────────────
  obj.velPosX += (targetPX - obj.posX) * POS_STIFFNESS;
  obj.velPosY += (targetPY - obj.posY) * POS_STIFFNESS;
  obj.velPosX *= POS_DAMPING;
  obj.velPosY *= POS_DAMPING;
  obj.posX += obj.velPosX;
  obj.posY += obj.velPosY;

  // ── Separate Z spring (spec §7) ─────────────────────────────────────────
  obj.velPosZ += (targetPZ - obj.posZ) * Z_STIFFNESS;
  obj.velPosZ *= Z_DAMPING;
  obj.posZ += obj.velPosZ;

  // ── Apply transforms ─────────────────────────────────────────────────────
  // rotGroup: all rotations + breathing angle offsets
  // floatGroup: positional drift + Z breathing offset
  if (obj.rotGroup) {
    obj.rotGroup.rotation.x = -obj.rotX + breathX;
    obj.rotGroup.rotation.y =  obj.rotY + breathY;
    obj.rotGroup.rotation.z =  obj.rotZ;
  }
  if (obj.floatGroup) {
    obj.floatGroup.position.x = obj.posX;
    obj.floatGroup.position.y = obj.posY + breathZ;
    obj.floatGroup.position.z = obj.posZ;
  }
}

// ── Global light sync ─────────────────────────────────────────────────────────
// Reads st.globalLight every frame and drives the Three.js key light + ambient.
//   gl.x / gl.y  (0–1 normalised screen pos) → 3D light direction
//   gl.color     → key light colour + ambient tint
//   gl.intensity → key light and ambient intensity

function _syncKeyLight() {
  if (!_keyLight || !_ambientLight) return;
  var gl     = st.globalLight;
  var lightOn = gl && gl.on && (gl.intensity || 0) > 0.01;
  var glInt  = lightOn ? (gl.intensity || 0.6) : 0;

  if (!lightOn) {
    _keyLight.intensity     = 0;
    _ambientLight.color.setHex(0xffffff);
    _ambientLight.intensity = 0.60;
    return;
  }

  var hex = gl.color || '#ffffff';

  // ── Key light ─────────────────────────────────────────────────────────────
  // Drives specular on the body/edge. Scaled by global light intensity so
  // turning the light up or down visibly changes the card's highlight.
  _keyLight.color.setStyle(hex);
  _keyLight.intensity = glInt * 0.45;

  // Map 2D light position → 3D direction
  var lx =  (gl.x != null ? gl.x : 0.5) * 4 - 2;
  var ly = -(gl.y != null ? gl.y : 0.35) * 4 + 2;
  _keyLight.position.set(lx, ly, 2.5);

  // ── Ambient tint ──────────────────────────────────────────────────────────
  // Shift ambient hue toward global light colour. Lower base intensity for
  // a more matte feel — the key light provides directed highlights.
  var base = new THREE.Color(0xffffff);
  var tint = new THREE.Color().setStyle(hex);
  base.lerp(tint, glInt * 0.22);
  _ambientLight.color.copy(base);
  _ambientLight.intensity = 0.45;
}

// ── Animation loop ────────────────────────────────────────────────────────────

var _lastT = 0;

function _loop(now) {
  if (!st.showcase3d.active) return;
  _rafId = requestAnimationFrame(_loop);

  var dt = now - (_lastT || now);
  _lastT = now;

  _syncKeyLight();

  // Consume gyro deltas once per frame — read before the card loop, zero after.
  // This ensures each delta from mobile.js is applied exactly once across all cards.
  var _dg = st.gyro.deltaGamma || 0;
  var _db = st.gyro.deltaBeta  || 0;
  var _ax = st.gyro.accelX     || 0;
  var _ay = st.gyro.accelY     || 0;
  st.gyro.deltaGamma = 0;
  st.gyro.deltaBeta  = 0;

  for (var i = 0; i < _cardObjs.length; i++) {
    var obj = _cardObjs[i];
    _tickPhysics(obj, dt, _dg, _db, _ax, _ay);
    // Mobile: capture texture every 2nd frame — halves offscreen canvas render cost
    var _doCapture = !(st.MOBILE_PERF_QUERY && st.MOBILE_PERF_QUERY.matches) || (_captureFrame % 2 === 0);
    if (_doCapture) {
      _captureCardTexture(obj, now);
    }
    _tickCardParticles(obj, dt);
  }

  _captureFrame++;

  _renderer.render(_scene, _camera);

  // Export projected screen positions so the 2D particle/FX system can
  // follow the 3D cards. Also export top/bottom NDC so app.js can
  // compute each card's on-screen size for surface FX scaling.
  // Use rotGroup.matrixWorld — card geometry lives there in the hierarchy.
  var _positions = [];
  for (var pi = 0; pi < _cardObjs.length; pi++) {
    var _mw = (_cardObjs[pi].rotGroup || _cardObjs[pi].group).matrixWorld;
    var _v = new THREE.Vector3();
    _v.setFromMatrixPosition(_mw);
    _v.project(_camera);

    var _vTop = new THREE.Vector3(0, CARD_ASPECT / 2, 0);
    _vTop.applyMatrix4(_mw);
    _vTop.project(_camera);

    var _vBot = new THREE.Vector3(0, -CARD_ASPECT / 2, 0);
    _vBot.applyMatrix4(_mw);
    _vBot.project(_camera);

    _positions.push({
      card:     _cardObjs[pi].card,
      ndcX:     _v.x,    ndcY:     _v.y,
      ndcTopY:  _vTop.y, ndcBotY:  _vBot.y
    });
  }
  st.showcase3d.cardPositions = _positions;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function enterShowcase3D() {
  if (!_webGLAvailable()) {
    console.warn('[showcase-3d] WebGL unavailable — falling back to 2D renderer');
    return;
  }

  var W = window.innerWidth;
  var H = window.innerHeight;

  _setupScene(W, H);
  _setupRenderer(W, H);

  var cards = st.cards.filter(function(c) {
    return !c.hidden && c.kind !== 'text' && c.kind !== 'rect';
  });

  _cardObjs = [];

  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];

    var capCanvas = document.createElement('canvas');
    capCanvas.width = TEX_W; capCanvas.height = TEX_H;
    var capCtx = capCanvas.getContext('2d');

    var texture  = new THREE.CanvasTexture(capCanvas);
    texture.colorSpace  = THREE.SRGBColorSpace;
    texture.minFilter   = THREE.LinearFilter;
    texture.magFilter   = THREE.LinearFilter;
    // Anisotropy set after renderer is created — applied in enterShowcase3D
    // where _renderer is available.

    var obj = {
      card:         card,
      capCanvas:    capCanvas,
      capCtx:       capCtx,
      texture:      texture,
      group:        null,   // anchor — fixed at layout position
      floatGroup:   null,   // positional drift layer
      rotGroup:     null,   // rotation layer — geometry lives here
      bodyMesh:     null,
      faceMesh:     null,
      faceMat:      null,
      backMesh:     null,
      isFlipped:    false,  // true when card is showing back face
      _flipCooldown: 0,     // frames until next flip can trigger
      rotX: 0, rotY: 0, rotZ: 0,
      velX: 0, velY: 0, velZ: 0,
      targetRotX: 0, targetRotY: 0,   // per-card rotation spring targets
      posX: 0, posY: 0, posZ: 0,
      velPosX: 0, velPosY: 0, velPosZ: 0,
      breathT: i * 0.8, _breathPhase: i * 1.3,
      targetX: 0, targetY: 0,   // layout anchor position (world units)
      partState:  null,
      partGeo:    null,
      partPoints: null,
      // Version-counter dirty tracking (read by _captureCardTexture guard)
      _bakedVersion:    -1, // force first bake on frame 1 (any card._version >= 0)
      _lastTexCapture:  0   // performance.now() of last bake — drives throttle + safety floor
    };

    _buildCardMesh(obj);
    _initCardParticles(obj);
    // Apply max anisotropy now that _renderer exists
    obj.texture.anisotropy = _renderer.capabilities.getMaxAnisotropy();
    _cardObjs.push(obj);
    _scene.add(obj.group);
  }

  _layoutCards();

  // Seed transforms from layout so physics starts at rest.
  // anchor (group) is fixed at layout position; floatGroup starts at zero.
  for (var j = 0; j < _cardObjs.length; j++) {
    var o = _cardObjs[j];
    o.posX = 0; o.posY = 0; o.posZ = 0;
    o.targetRotX = 0; o.targetRotY = 0;
    if (o.group)      o.group.position.set(o.targetX, o.targetY, 0);
    if (o.floatGroup) o.floatGroup.position.set(0, 0, 0);
  }

  st.showcase3d.active = true;
  _lastT = 0;
  _rafId = requestAnimationFrame(_loop);

  window.addEventListener('resize', _onResize);
  window.addEventListener('pointerdown', _onTap);
}

// ── Tap / click impulse + double-tap flip ─────────────────────────────────────
// Single tap: velocity kick to all cards (spin + bounce, spring back).
// Double tap/click on a card: flips that card 180° to show the back/front.
// Distinguishes a tap (no movement) from a drag/scroll.

var _tapStartX = 0, _tapStartY = 0;
var _lastTapTime = 0, _lastTapX = 0, _lastTapY = 0;
var DOUBLE_TAP_MS = 350;   // max gap between taps
var DOUBLE_TAP_PX = 30;    // max drift between taps

function _onTap(e) {
  _tapStartX = e.clientX;
  _tapStartY = e.clientY;
  window.addEventListener('pointerup', _onTapEnd, { once: true });
}

// Hit-test: find the card object closest to a tap in NDC space.
// Returns the obj if the tap lands within a reasonable radius, else null.
function _hitTestCard(tapX, tapY) {
  if (!st.showcase3d.cardPositions || !_cardObjs.length) return null;
  var bestObj = null, bestDist = Infinity;
  for (var i = 0; i < _cardObjs.length; i++) {
    var obj = _cardObjs[i];
    for (var j = 0; j < st.showcase3d.cardPositions.length; j++) {
      var p = st.showcase3d.cardPositions[j];
      if (p.card !== obj.card) continue;
      // Card half-extents in NDC — approximate from top/bottom projection
      var halfH = Math.abs(p.ndcTopY - p.ndcBotY) * 0.5;
      var halfW = halfH / CARD_ASPECT;   // card is taller than wide
      // Rectangular hit test with a small margin
      var dx = Math.abs(tapX - p.ndcX);
      var dy = Math.abs(tapY - p.ndcY);
      if (dx < halfW * 1.15 && dy < halfH * 1.15) {
        var dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; bestObj = obj; }
      }
      break;
    }
  }
  return bestObj;
}

function _onTapEnd(e) {
  var dx = e.clientX - _tapStartX;
  var dy = e.clientY - _tapStartY;
  // Only treat as tap if pointer barely moved (not a drag/scroll)
  if (Math.sqrt(dx * dx + dy * dy) > 12) return;

  var now = performance.now();

  // Tap position in NDC (-1..1 on both axes, Y up)
  var tapX =  (e.clientX / window.innerWidth)  * 2 - 1;
  var tapY = -(e.clientY / window.innerHeight) * 2 + 1;

  // ── Double-tap detection ──────────────────────────────────────────────────
  var dtGap = now - _lastTapTime;
  var dtDx  = e.clientX - _lastTapX;
  var dtDy  = e.clientY - _lastTapY;
  var dtDist = Math.sqrt(dtDx * dtDx + dtDy * dtDy);

  if (dtGap < DOUBLE_TAP_MS && dtDist < DOUBLE_TAP_PX) {
    // Double tap — flip the tapped card
    var hitObj = _hitTestCard(tapX, tapY);
    if (hitObj && hitObj._flipCooldown <= 0) {
      hitObj.isFlipped = !hitObj.isFlipped;
      hitObj._flipCooldown = 45;
      // Give a satisfying rotation impulse in the flip direction
      hitObj.velY += hitObj.isFlipped ? 0.18 : -0.18;
    }
    // Reset so a third tap doesn't count as another double
    _lastTapTime = 0;
    return;
  }

  // Record this tap for future double-tap detection
  _lastTapTime = now;
  _lastTapX    = e.clientX;
  _lastTapY    = e.clientY;

  // ── Single tap — push all cards ───────────────────────────────────────────
  for (var i = 0; i < _cardObjs.length; i++) {
    var obj = _cardObjs[i];

    // Card-relative direction: tap offset from this card's projected center
    var cardX = 0, cardY = 0;
    if (st.showcase3d.cardPositions) {
      for (var j = 0; j < st.showcase3d.cardPositions.length; j++) {
        if (st.showcase3d.cardPositions[j].card === obj.card) {
          cardX = st.showcase3d.cardPositions[j].ndcX;
          cardY = st.showcase3d.cardPositions[j].ndcY;
          break;
        }
      }
    }
    var rx = tapX - cardX;
    var ry = tapY - cardY;
    var len = Math.sqrt(rx * rx + ry * ry) || 1;
    rx /= len; ry /= len;

    // Rotation impulse — card rotates as if pushed at the tap point
    obj.velY += rx  * 0.144;
    obj.velX += -ry * 0.104;
    obj.velZ += rx  * 0.048;
    // Position impulse — card moves away from tap, springs back
    obj.velPosX -= rx  * 0.096;
    obj.velPosY -= ry  * 0.072;
    obj.velPosZ -= 0.08;   // pushes away from camera
  }
}

export function exitShowcase3D() {
  st.showcase3d.active = false;

  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

  for (var i = 0; i < _cardObjs.length; i++) {
    var obj = _cardObjs[i];
    if (obj.group) {
      obj.group.traverse(function(child) {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(function(m) { if (m.map) m.map.dispose(); m.dispose(); });
          } else if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });
      if (_scene) _scene.remove(obj.group);
    }
    if (obj.texture)  obj.texture.dispose();
    if (obj.partGeo)  obj.partGeo.dispose();  // partPoints is child of group, removed with it
  }
  _cardObjs = [];

  if (_partMat)   { _partMat.dispose();  _partMat  = null; }
  if (_grainTex)  { _grainTex.dispose(); _grainTex = null; }
  if (_backTex)   { _backTex.dispose();  _backTex  = null; }
  if (_renderer)  { _renderer.dispose(); _renderer = null; }

  if (_overlayEl && _overlayEl.parentNode) {
    _overlayEl.parentNode.removeChild(_overlayEl);
    _overlayEl = null;
  }

  if (_particleEl && _particleEl.parentNode) {
    _particleEl.parentNode.removeChild(_particleEl);
    _particleEl  = null;
    _particleCtx = null;
  }
  st.showcase3d.particleCtx = null;
  st.showcase3d.canvas      = null;
  st.showcase3d.particleEl  = null;

  _scene        = null;
  _camera       = null;
  _keyLight     = null;
  _ambientLight = null;

  window.removeEventListener('resize', _onResize);
  window.removeEventListener('pointerdown', _onTap);
}

function _onResize() {
  if (!_renderer || !_camera) return;
  var W = window.innerWidth, H = window.innerHeight;
  _camera.aspect = W / H;
  _camera.updateProjectionMatrix();
  _renderer.setSize(W, H);
  if (_particleEl) {
    var _dpr = Math.min(window.devicePixelRatio || 1, 2);
    _particleEl.width  = Math.round(W * _dpr);
    _particleEl.height = Math.round(H * _dpr);
  }
}
