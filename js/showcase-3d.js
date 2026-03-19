// ============================================================
//  ARCANA GLAM — Showcase 3D  (showcase-3d.js)
//  Three.js card renderer active only in showcase mode.
//  Sits on top of the existing canvas as a transparent overlay.
//  The existing 2D canvas continues to render BG FX untouched.
//  app.js skips 2D card drawing when window._showcase3DActive.
// ============================================================

import * as THREE from 'three';
import { AppState as st } from './state.js';
import { drawCard } from './renderer.js';
import { getSpellPreset, FIRE_PALETTES } from './fx-engine.js';

// ── Constants ─────────────────────────────────────────────────────────────────

var CARD_W      = 110;    // canvas units — must match renderer.js
var CARD_H      = 154;
var TEX_SCALE   = 4;      // texture resolution multiplier (4× for sharpness)
var TEX_W       = CARD_W * TEX_SCALE;
var TEX_H       = CARD_H * TEX_SCALE;
var CARD_ASPECT = CARD_H / CARD_W;   // ≈ 1.4

// Card 3D dimensions in world units (card face = 1 wide × CARD_ASPECT tall)
var CARD_THICK  = 0.018;  // realistic card thinness
var CORNER_R    = 0.065;  // corner radius relative to card width (r/w = 8/110 ≈ 0.073)

// _gyroTiltX/Y are in the -24..+24 range (mobile.js _tiltStrength = 24).
// Divide by this to get a normalised -1..1 before applying to physics.
var GYRO_NORM = 24;

// Spring constants — rotation
var ROT_STIFFNESS = 0.016;   // very sluggish — heavy slab
var ROT_DAMPING   = 0.94;    // settles slowly, barely overshoots

// Spring constants — position drift
var POS_STIFFNESS = 0.010;
var POS_DAMPING   = 0.95;

// Max tilt angle in radians (~7°) — subtle
var MAX_TILT     = 0.12;
// Max world-unit drift from rest position
var MAX_DRIFT_XY = 0.10;
var MAX_DRIFT_Z  = 0.035;

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
var _keyLight     = null;   // directional light synced to st.globalLight each frame
var _ambientLight = null;   // ambient light — tinted toward global light colour
var _partMat      = null;   // shared ShaderMaterial for 3D spell particles (all cards)

// ── Particle constants ────────────────────────────────────────────────────────
var _PART_MAX = 200;  // pool size per card

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
  // Add to card group so particles live in card-local space and tilt with the card
  obj.group.add(pts);
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
//   • Sheen: ShapeGeometry 0.002 above the face for additive glare/shimmer.

function _buildCardMesh(obj) {
  var group     = new THREE.Group();
  var faceShape = _makeCardShape(1, CARD_ASPECT, CORNER_R);

  // ── 3D card body (ExtrudeGeometry — rounded sides + bevel) ─────────────────
  // Single material on all groups → no materialIndex confusion.
  // The face ShapeGeometry (below) covers the dark front cap.
  var bodyMat = new THREE.MeshStandardMaterial({
    color:     0x1a1025,
    roughness: 0.55,
    metalness: 0.28
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
  // Center the extrusion so front cap is at +CARD_THICK/2 and back at -CARD_THICK/2
  bodyMesh.position.z = -(CARD_THICK * 0.5);
  group.add(bodyMesh);

  // ── Front face (ShapeGeometry, 0.006 in front of body cap — no z-fight) ────
  // ShapeGeometry normal = +z → faces camera automatically ✓
  var faceGeo = new THREE.ShapeGeometry(faceShape, 20);
  _remapShapeUVs(faceGeo, 1, CARD_ASPECT);

  // MeshBasicMaterial — ignores scene lighting entirely so the card texture
  // renders at full vibrancy. drawCard already bakes shading/FX into the texture.
  var faceMat = new THREE.MeshBasicMaterial({
    map:         obj.texture,
    transparent: true,
    side:        THREE.FrontSide
  });
  var faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.position.z = CARD_THICK * 0.5 + 0.006;
  group.add(faceMesh);

  // ── Sheen overlay (additive glare + shimmer) ────────────────────────────────
  var sheenGeo = new THREE.ShapeGeometry(faceShape, 20);
  _remapShapeUVs(sheenGeo, 1, CARD_ASPECT);

  var sheenMat = new THREE.MeshBasicMaterial({
    map:         obj.sheenTex,
    transparent: true,
    opacity:     1.0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    side:        THREE.FrontSide
  });
  var sheenMesh = new THREE.Mesh(sheenGeo, sheenMat);
  sheenMesh.position.z = CARD_THICK * 0.5 + 0.008;
  group.add(sheenMesh);

  obj.group     = group;
  obj.bodyMesh  = bodyMesh;
  obj.faceMesh  = faceMesh;
  obj.faceMat   = faceMat;
  obj.sheenMesh = sheenMesh;
  obj.sheenMat  = sheenMat;
}

// ── Texture capture ───────────────────────────────────────────────────────────
// drawCard draws at card world position (c.x, c.y).
// To capture into our TEX_W × TEX_H offscreen canvas we:
//   1. Scale the ctx by TEX_SCALE
//   2. Temporarily place the card at the canvas center (CARD_W/2, CARD_H/2)
//      with scale=1 and rot=0 so it fills exactly 110×154 scaled px

function _captureCardTexture(obj, t) {
  var cap  = obj.capCtx;
  var card = obj.card;

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

  // Suppress only glare during texture capture — glare is tilt-reactive and is
  // already handled by the sheen layer. Holo, shimmer, luster and grain bake
  // directly into the face texture so they appear on the card in 3D.
  var _sfxGlare = card.glare;
  card.glare = undefined;

  var savedCtx = st.ctx;
  st.ctx = cap;

  try {
    drawCard(card, t, true /* isExport — no gyro transforms, no animation offsets */);
  } catch (e) { /* ignore missing-image errors during load */ }

  st.ctx = savedCtx;

  card.glare = _sfxGlare;

  card.x     = sx;
  card.y     = sy;
  card.scale = sscale;
  card.rot   = srot;

  obj.texture.needsUpdate = true;
}

function _captureSheen(obj, t) {
  var cap = obj.sheenCtx;
  var W = TEX_W, H = TEX_H;
  cap.clearRect(0, 0, W, H);

  // velocity from gyro tick (mouse tilt on desktop, device motion on mobile)
  var vel = (window._gyroActive && window._gyroVelocity != null)
    ? window._gyroVelocity : 0;

  // Only show effects when there is actual movement — idle card has no glare.
  // vel is typically 0–0.05 at rest, spikes to 0.2+ on fast motion.
  var motion = Math.min(1, vel * 14);   // 0 at rest → 1 at fast motion

  // Read global light before the early-exit so we can draw a static base glow
  var gl   = st.globalLight;
  var glOn = gl && gl.on && (gl.intensity || 0) > 0.01;
  var glR  = 255, glG = 255, glB = 255;
  if (glOn) {
    var hex = gl.color || '#ffffff';
    glR = parseInt(hex.slice(1, 3), 16);
    glG = parseInt(hex.slice(3, 5), 16);
    glB = parseInt(hex.slice(5, 7), 16);
  }
  var glInt = glOn ? (gl.intensity || 0.6) : 0;

  // Static base hotspot — visible even at rest when global light is on.
  // Positioned from the 2D light coordinates (gl.x / gl.y).
  if (glOn) {
    var sgx = W * (gl.x != null ? gl.x : 0.5);
    var sgy = H * (gl.y != null ? gl.y : 0.35);
    var sgr = Math.max(W, H) * 0.65;
    var baseA = glInt * 0.07;
    var sGrad = cap.createRadialGradient(sgx, sgy, 0, sgx, sgy, sgr);
    sGrad.addColorStop(0,    'rgba(' + glR + ',' + glG + ',' + glB + ',' + baseA + ')');
    sGrad.addColorStop(0.5,  'rgba(' + glR + ',' + glG + ',' + glB + ',' + (baseA * 0.25) + ')');
    sGrad.addColorStop(1,    'rgba(0,0,0,0)');
    cap.fillStyle = sGrad;
    cap.fillRect(0, 0, W, H);
  }

  // If no motion, the static glow above is all we draw
  if (motion < 0.01) {
    obj.sheenTex.needsUpdate = true;
    return;
  }

  var tiltX = window._gyroTiltX || 0;  // [-1, 1] normalised
  var tiltY = window._gyroTiltY || 0;

  // ── Specular hotspot ───────────────────────────────────────────────────────
  // Position opposite to tilt (simulates the global light source above the card).
  // Only visible when global light is on AND card is moving.
  if (glOn) {
    var gx = W * (0.5 - tiltY * 0.65);
    var gy = H * (0.5 - tiltX * 0.65);
    var gr = Math.max(W, H) * 0.55;
    var hotAlpha = motion * glInt * 0.11;   // scales with light intensity

    var radGrad = cap.createRadialGradient(gx, gy, 0, gx, gy, gr);
    radGrad.addColorStop(0,    'rgba(' + glR + ',' + glG + ',' + glB + ',' + hotAlpha + ')');
    radGrad.addColorStop(0.45, 'rgba(' + glR + ',' + glG + ',' + glB + ',' + (hotAlpha * 0.35) + ')');
    radGrad.addColorStop(1,    'rgba(0,0,0,0)');
    cap.fillStyle = radGrad;
    cap.fillRect(0, 0, W, H);
  }

  // ── Motion-flash shimmer band ──────────────────────────────────────────────
  // Narrow band sweeping perpendicular to tilt, coloured by the global light.
  // Appears only on fast motion; completely absent if light is off.
  if (glOn) {
    var shimA = motion * glInt * 0.16;
    var bx = W * (0.5 + tiltY * 0.5);
    var by = H * (0.5 + tiltX * 0.5);
    var bw = Math.max(W, H) * 0.18;
    var nx = -tiltX, ny = tiltY;
    var nlen = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= nlen; ny /= nlen;
    var shimGr = cap.createLinearGradient(
      bx - nx * bw, by - ny * bw * CARD_ASPECT,
      bx + nx * bw, by + ny * bw * CARD_ASPECT
    );
    shimGr.addColorStop(0,   'rgba(' + glR + ',' + glG + ',' + glB + ',0)');
    shimGr.addColorStop(0.5, 'rgba(' + glR + ',' + glG + ',' + glB + ',' + shimA + ')');
    shimGr.addColorStop(1,   'rgba(' + glR + ',' + glG + ',' + glB + ',0)');
    cap.fillStyle = shimGr;
    cap.fillRect(0, 0, W, H);
  }

  obj.sheenTex.needsUpdate = true;
}

// ── Scene / renderer setup ────────────────────────────────────────────────────

function _setupScene(W, H) {
  _scene  = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(42, W / H, 0.01, 100);
  _camera.position.z = 3.8;

  // Ambient at 0.60 — key light adds brightness when global light is on.
  _ambientLight = new THREE.AmbientLight(0xffffff, 0.60);
  _scene.add(_ambientLight);

  // Key light — driven by st.globalLight (color + intensity), updated every frame.
  // Initially off; _syncKeyLight() sets it correctly before the first render.
  _keyLight = new THREE.DirectionalLight(0xffffff, 0);
  _keyLight.position.set(1.4, 2.2, 2.5);
  _scene.add(_keyLight);

  // Subtle cool rim from lower-left — gives card edge some dimensionality
  var fill = new THREE.DirectionalLight(0xb8c8ff, 0.18);
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
  _renderer.shadowMap.enabled = false;

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
  window._showcase3DParticleCtx = _particleCtx;
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

function _tickPhysics(obj, dt) {
  var dtS = Math.min(dt, 50) / 1000;

  // Normalise from the -24..+24 range mobile.js produces → -1..+1
  var tiltX = Math.max(-1, Math.min(1, (window._gyroTiltX || 0) / GYRO_NORM));
  var tiltY = Math.max(-1, Math.min(1, (window._gyroTiltY || 0) / GYRO_NORM));

  // Idle breathing — fades gently when tilted
  obj.breathT += dtS;
  var breathMag = Math.max(0, 1 - (Math.abs(tiltX) + Math.abs(tiltY)) * 1.5);
  var breathX = Math.sin(obj.breathT * 0.38 + obj._breathPhase)        * 0.006 * breathMag;
  var breathY = Math.cos(obj.breathT * 0.29 + obj._breathPhase * 1.3)  * 0.004 * breathMag;

  // ── Rotation spring ──────────────────────────────────────────────────────
  var targetRotX = tiltX * MAX_TILT + breathX;
  var targetRotY = tiltY * MAX_TILT + breathY;
  // Very subtle Z roll — leans slightly into horizontal drift
  var targetRotZ = tiltY * -0.03;

  obj.velX += (targetRotX - obj.rotX) * ROT_STIFFNESS;
  obj.velY += (targetRotY - obj.rotY) * ROT_STIFFNESS;
  obj.velZ += (targetRotZ - obj.rotZ) * (ROT_STIFFNESS * 0.4);
  obj.velX *= ROT_DAMPING;
  obj.velY *= ROT_DAMPING;
  obj.velZ *= ROT_DAMPING;
  obj.rotX += obj.velX;
  obj.rotY += obj.velY;
  obj.rotZ += obj.velZ;

  // ── Position drift — floats gently, springs back to rest ─────────────────
  var targetPX = obj.targetX + tiltY * MAX_DRIFT_XY;
  var targetPY = obj.targetY - tiltX * MAX_DRIFT_XY * 0.75;
  // Tilt magnitude gives a tiny Z pop toward camera
  var tiltMag  = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
  var targetPZ = tiltMag * MAX_DRIFT_Z;

  obj.velPosX += (targetPX - obj.posX) * POS_STIFFNESS;
  obj.velPosY += (targetPY - obj.posY) * POS_STIFFNESS;
  obj.velPosZ += (targetPZ - obj.posZ) * (POS_STIFFNESS * 0.6);
  obj.velPosX *= POS_DAMPING;
  obj.velPosY *= POS_DAMPING;
  obj.velPosZ *= POS_DAMPING;
  obj.posX += obj.velPosX;
  obj.posY += obj.velPosY;
  obj.posZ += obj.velPosZ;

  if (obj.group) {
    obj.group.rotation.x = -obj.rotX;
    obj.group.rotation.y =  obj.rotY;
    obj.group.rotation.z =  obj.rotZ;
    obj.group.position.x =  obj.posX;
    obj.group.position.y =  obj.posY;
    obj.group.position.z =  obj.posZ;
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
  // Drives specular on the body/edge (MeshStandardMaterial) and
  // the sheen canvas hotspot. Low intensity — not a scene fill.
  _keyLight.color.setStyle(hex);
  _keyLight.intensity = glInt * 0.62;   // strong enough to visibly warm the face

  // Map 2D light position → 3D direction
  var lx =  (gl.x != null ? gl.x : 0.5) * 4 - 2;
  var ly = -(gl.y != null ? gl.y : 0.35) * 4 + 2;
  _keyLight.position.set(lx, ly, 2.5);

  // ── Ambient tint ──────────────────────────────────────────────────────────
  // Shift ambient hue noticeably toward global light colour when light is on.
  var base = new THREE.Color(0xffffff);
  var tint = new THREE.Color().setStyle(hex);
  base.lerp(tint, glInt * 0.12);
  _ambientLight.color.copy(base);
  _ambientLight.intensity = 0.60;
}

// ── Animation loop ────────────────────────────────────────────────────────────

var _lastT = 0;

function _loop(now) {
  if (!window._showcase3DActive) return;
  _rafId = requestAnimationFrame(_loop);

  var dt = now - (_lastT || now);
  _lastT = now;

  _syncKeyLight();

  for (var i = 0; i < _cardObjs.length; i++) {
    var obj = _cardObjs[i];
    _tickPhysics(obj, dt);
    _captureCardTexture(obj, now);
    _captureSheen(obj, now);
    _tickCardParticles(obj, dt);
  }

  _renderer.render(_scene, _camera);

  // Export projected screen positions so the 2D particle/FX system can
  // follow the 3D cards. Also export top/bottom NDC so app.js can
  // compute each card's on-screen size for surface FX scaling.
  var _positions = [];
  for (var pi = 0; pi < _cardObjs.length; pi++) {
    var _v = new THREE.Vector3();
    _v.setFromMatrixPosition(_cardObjs[pi].group.matrixWorld);
    _v.project(_camera);

    var _vTop = new THREE.Vector3(0, CARD_ASPECT / 2, 0);
    _vTop.applyMatrix4(_cardObjs[pi].group.matrixWorld);
    _vTop.project(_camera);

    var _vBot = new THREE.Vector3(0, -CARD_ASPECT / 2, 0);
    _vBot.applyMatrix4(_cardObjs[pi].group.matrixWorld);
    _vBot.project(_camera);

    _positions.push({
      card:     _cardObjs[pi].card,
      ndcX:     _v.x,    ndcY:     _v.y,
      ndcTopY:  _vTop.y, ndcBotY:  _vBot.y
    });
  }
  window._showcase3DCardPositions = _positions;
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

    var sheenCanvas = document.createElement('canvas');
    sheenCanvas.width = TEX_W; sheenCanvas.height = TEX_H;
    var sheenCtx = sheenCanvas.getContext('2d');

    var texture  = new THREE.CanvasTexture(capCanvas);
    var sheenTex = new THREE.CanvasTexture(sheenCanvas);
    texture.minFilter  = THREE.LinearFilter;
    texture.magFilter  = THREE.LinearFilter;
    sheenTex.minFilter = THREE.LinearFilter;
    sheenTex.magFilter = THREE.LinearFilter;

    var obj = {
      card:         card,
      capCanvas:    capCanvas,
      capCtx:       capCtx,
      sheenCanvas:  sheenCanvas,
      sheenCtx:     sheenCtx,
      texture:      texture,
      sheenTex:     sheenTex,
      group:        null,
      bodyMesh:     null,
      faceMat:      null,
      sheenMesh:    null,
      sheenMat:     null,
      rotX: 0, rotY: 0, rotZ: 0,
      velX: 0, velY: 0, velZ: 0,
      posX: 0, posY: 0, posZ: 0,
      velPosX: 0, velPosY: 0, velPosZ: 0,
      breathT: i * 0.8, _breathPhase: i * 1.3,
      targetX: 0, targetY: 0,
      partState:  null,
      partGeo:    null,
      partPoints: null
    };

    _buildCardMesh(obj);
    _initCardParticles(obj);
    _cardObjs.push(obj);
    _scene.add(obj.group);
  }

  _layoutCards();

  // Seed position state from layout so physics starts at rest
  for (var j = 0; j < _cardObjs.length; j++) {
    var o = _cardObjs[j];
    o.posX = o.targetX;
    o.posY = o.targetY;
    o.posZ = 0;
    if (o.group) {
      o.group.position.set(o.posX, o.posY, o.posZ);
    }
  }

  window._showcase3DActive = true;
  _lastT = 0;
  _rafId = requestAnimationFrame(_loop);

  window.addEventListener('resize', _onResize);
}

export function exitShowcase3D() {
  window._showcase3DActive = false;

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
    if (obj.sheenTex) obj.sheenTex.dispose();
    if (obj.partGeo)  obj.partGeo.dispose();  // partPoints is child of group, removed with it
  }
  _cardObjs = [];

  if (_partMat)   { _partMat.dispose(); _partMat = null; }
  if (_grainTex)  { _grainTex.dispose(); _grainTex = null; }
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
  window._showcase3DParticleCtx = null;

  _scene        = null;
  _camera       = null;
  _keyLight     = null;
  _ambientLight = null;

  window.removeEventListener('resize', _onResize);
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
