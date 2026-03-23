// ============================================================
//  ARCANA GLAM — FX Engine  (fx-engine.js)
//  Card spell particles, background effects (fire/cosmic/
//  shadow/nature/crystal/metaballs), WebGL shaders, noise,
//  warp, flow.
// ============================================================

import { AppState as st } from './state.js';
import { markDirty } from './app.js';
import { drawBgFire }                          from './bg-fx-fire.js';
import { drawBgSmokeRing }                     from './bg-fx-smokering.js';
import { drawBgGodRays }                       from './bg-fx-godrays.js';
import { drawBgMagma }                         from './bg-fx-magma.js';
import { drawBgCosmic }                        from './bg-fx-cosmic.js';
import { initCrystalPoints, drawBgCrystal }    from './bg-fx-crystal.js';
import { initMetaBalls, drawBgMetaballs }       from './bg-fx-metaballs.js';
import { drawBgShadow }                        from './bg-fx-shadow.js';
import { drawBgNature }                        from './bg-fx-nature.js';

export var SPELL_PRESETS = {
  fire: {
    // Flames rise from the bottom and sides of the card
    color: '#FF4400', color2: '#FFAA00', color3: '#FF8800',
    bgGlow: 'rgba(255,60,0,0.22)',
    gravity: -0.038, drag: 0.976, spread: 0.48, riseStrength: 1.0,
    sway: 0.016, twirl: 0.025, fadeIn: 0.04, lifeMin: 0.8, lifeMax: 1.5,
    shape: 'flame', spawnEdge: 'frame', spawnJitter: 1.0, palette: 'fire'
  },
  nature: {
    color: '#4ADE80', color2: '#A3E635', bgGlow: 'rgba(74,222,128,0.12)',
    gravity: -0.015, drag: 0.985, spread: 0.55, riseStrength: 0.35,
    sway: 0.025, twirl: 0.04, fadeIn: 0.08, lifeMin: 1.2, lifeMax: 2.4,
    shape: 'petal', spawnEdge: 'around', spawnJitter: 0.8
  },
  moonlight: {
    color: '#C4B5FD', color2: '#E0D9FF', bgGlow: 'rgba(196,181,253,0.14)',
    gravity: -0.008, drag: 0.993, spread: 0.65, riseStrength: 0.2,
    sway: 0.01, twirl: 0.02, fadeIn: 0.06, lifeMin: 1.8, lifeMax: 3.5,
    shape: 'orb', spawnEdge: 'around', spawnJitter: 1.0
  },
  shadow: {
    // Smoke billows upward from the base of the card
    color: '#1A1025', color2: '#0A0018', color3: '#250022',
    bgGlow: 'rgba(10,0,20,0.35)',
    gravity: -0.01, drag: 0.989, spread: 0.65, riseStrength: 0.5,
    sway: 0.009, twirl: 0.005, fadeIn: 0.18, lifeMin: 1.5, lifeMax: 3.0,
    shape: 'smoke', spawnEdge: 'base', spawnJitter: 1.0
  },
  arc: {
    // Electric sparks discharge outward from all card edges
    color: '#80FFFF', color2: '#4488FF', color3: '#FFFFFF',
    bgGlow: 'rgba(80,200,255,0.25)',
    gravity: 0.0, drag: 0.94, spread: 0.55, riseStrength: 0.0,
    sway: 0.0, twirl: 0.0, fadeIn: 0.01, lifeMin: 0.1, lifeMax: 0.35,
    shape: 'spark', spawnEdge: 'edge-out', spawnJitter: 1.0
  },
  neural: {
    // Glowing neural-web filaments wrapping the card — no particles, pure shader-style
    color: '#00FFCC', color2: '#0088FF', color3: '#7700FF',
    bgGlow: 'rgba(0,200,180,0.18)',
    gravity: 0, drag: 1, spread: 0, riseStrength: 0,
    sway: 0, twirl: 0, fadeIn: 0.1, lifeMin: 0, lifeMax: 0,
    shape: 'orb', spawnEdge: 'frame', spawnJitter: 0,
    neuroOnly: true   // skip particle system, draw only the neural aura
  }
};

// ── Fire v2 colour palettes ──────────────────────────────────────────────
// Each palette: core (hottest centre), mid (body), tip (outer/dying edge)
export var FIRE_PALETTES = {
  fire:   { core: [255, 255, 200], mid: [255, 110,   0], tip: [200,  15,   0] },
  ice:    { core: [220, 248, 255], mid: [  60, 185, 230], tip: [  0,  70, 160] },
  poison: { core: [210, 255, 160], mid: [  80, 210,  20], tip: [ 10, 100,   0] },
  arcane: { core: [245, 220, 255], mid: [ 160,  55, 255], tip: [ 55,   0, 140] },
  soul:   { core: [240, 245, 255], mid: [ 120, 150, 255], tip: [ 20,  40, 200] }
};

export function getSpellPreset(card) {
  var s = card.spell;
  var preset = (s && s.preset) ? s.preset : 'fire';
  return SPELL_PRESETS[preset] || SPELL_PRESETS.fire;
}

export function ensurePool(cardId) {
  if (!st.particlePools[cardId]) st.particlePools[cardId] = [];
  return st.particlePools[cardId];
}

export function spawnParticle(card, t, w, h) {
  var s = card.spell;
  var p = getSpellPreset(card);
  var intensity = (s && s.intensity != null) ? s.intensity : 1;
  var speed     = (s && s.speed    != null) ? s.speed    : 1;
  var size      = (s && s.size     != null) ? s.size     : 2;
  var spread    = (s && s.spread   != null) ? s.spread   : p.spread;
  var color     = (s && s.color)            ? s.color    : p.color;
  var shape     = (s && s.shape)            ? s.shape    : p.shape;

  var hw = w * 0.5, hh = h * 0.5;
  var sx, sy, vx, vy;

  if (p.spawnEdge === 'frame') {
    // ── FIRE v2: 65% bottom, 17.5% each side, no top — natural upward flame ──
    var rng = Math.random();
    var edge = (rng < 0.65) ? 1 : (rng < 0.825 ? 2 : 3); // 1=bottom 2=left 3=right
    var t2, nx, ny;
    if (edge === 1) {         // bottom edge
      t2 = (Math.random() - 0.5) * 2;
      sx = t2 * hw; sy = hh + (Math.random() - 0.5) * 4;
      nx = t2 * 0.2; ny = 1;
    } else if (edge === 2) {  // left edge
      t2 = (Math.random() - 0.5) * 2;
      sx = -hw + (Math.random() - 0.5) * 4; sy = t2 * hh;
      nx = -1; ny = t2 * 0.2;
    } else {                  // right edge
      t2 = (Math.random() - 0.5) * 2;
      sx = hw + (Math.random() - 0.5) * 4; sy = t2 * hh;
      nx = 1; ny = t2 * 0.2;
    }
    // Strong upward bias
    var vMag = (0.6 + Math.random() * 0.8) * speed;
    var spreadAngle = (Math.random() - 0.5) * spread * Math.PI * 0.5;
    var baseAngle = Math.atan2(ny * p.riseStrength - 0.85, nx);
    vx = Math.cos(baseAngle + spreadAngle) * vMag;
    vy = Math.sin(baseAngle + spreadAngle) * vMag;

  } else if (p.spawnEdge === 'base') {
    // ── SMOKE v2: spawn along bottom edge, billow upward ──
    sx = (Math.random() - 0.5) * w * (0.7 + spread * 0.4);
    sy = hh + Math.random() * 6;
    vx = (Math.random() - 0.5) * spread * 0.6 * speed;
    vy = -(0.25 + Math.random() * 0.45) * speed;

  } else if (p.spawnEdge === 'edge-out') {
    // ── ARC v2: spawn at card frame edges, discharge sparks outward ──
    var edge3 = Math.floor(Math.random() * 4); // 0=top 1=right 2=bottom 3=left
    var t3, enx2, eny2;
    if (edge3 === 0)      { t3 = (Math.random()-0.5)*2; sx = t3*hw; sy = -hh; enx2 = t3*0.15; eny2 = -1; }
    else if (edge3 === 1) { t3 = (Math.random()-0.5)*2; sx = hw;  sy = t3*hh; enx2 = 1;        eny2 = t3*0.15; }
    else if (edge3 === 2) { t3 = (Math.random()-0.5)*2; sx = t3*hw; sy = hh;  enx2 = t3*0.15; eny2 = 1; }
    else                  { t3 = (Math.random()-0.5)*2; sx = -hw; sy = t3*hh; enx2 = -1;       eny2 = t3*0.15; }
    var vMag3 = (0.8 + Math.random() * 1.5) * speed;
    var spreadAng2 = (Math.random()-0.5) * spread * Math.PI * 0.5;
    var baseAng2 = Math.atan2(eny2, enx2);
    vx = Math.cos(baseAng2 + spreadAng2) * vMag3;
    vy = Math.sin(baseAng2 + spreadAng2) * vMag3;

  } else {
    // Generic 'around' spawn (nature, moonlight)
    var ang = Math.random() * Math.PI * 2;
    var rad = (hw + 8) + Math.random() * 20 * p.spawnJitter;
    sx = Math.cos(ang) * rad;
    sy = Math.sin(ang) * (h / w) * rad;
    var vMag2 = (0.4 + Math.random() * 0.6) * speed;
    var vAng = -Math.PI / 2 + (Math.random() - 0.5) * spread * Math.PI;
    vx = Math.cos(vAng) * vMag2;
    vy = Math.sin(vAng) * vMag2 * p.riseStrength;
  }

  var life = p.lifeMin + Math.random() * (p.lifeMax - p.lifeMin);

  // Color: if the user has picked a custom color, use it;
  // otherwise pull from the preset palette for natural variety.
  var userOverride = (s && s.color && s.color !== p.color);
  var rnd = Math.random();
  var useColor = userOverride
    ? color
    : (rnd < 0.45 ? p.color : (rnd < 0.75 ? p.color2 : (p.color3 || p.color)));

  // Size scaling: fire and smoke need much larger particles to look dramatic on the card
  var sizeMul;
  if (p.spawnEdge === 'frame') {
    sizeMul = 4 + Math.random() * 4;      // fire: ~8-16px at size=2
  } else if (p.spawnEdge === 'base') {
    sizeMul = 8 + Math.random() * 7;      // smoke: ~16-30px at size=2
  } else if (p.spawnEdge === 'edge-out') {
    sizeMul = 0.5 + Math.random() * 0.8;  // arc: small fast sparks
  } else {
    sizeMul = 0.4 + Math.random() * 0.9;  // other presets: original scaling
  }

  return {
    x: sx, y: sy, vx: vx, vy: vy,
    life: life, maxLife: life,
    size: size * sizeMul,
    color: useColor,
    palette: p.palette || null,
    alpha: 0,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * p.twirl * 2,
    swayPhase: Math.random() * Math.PI * 2,
    shape: shape,
    born: t
  };
}

// st._hexToRgbCache is in AppState
export function hexToRgb(hex) {
  if (!hex) return '0,0,0';
  if (!st._hexToRgbCache) st._hexToRgbCache = {};
  if (st._hexToRgbCache[hex]) return st._hexToRgbCache[hex];
  var arr = hexToRgbArr(hex);
  var result = arr ? arr[0] + ',' + arr[1] + ',' + arr[2] : '0,0,0';
  st._hexToRgbCache[hex] = result;
  return result;
}

// st._hexToRgbCache is in AppState
export function tickAndDrawParticles(card, cx, cy, cs, cr, t, dt) {
  var s = card.spell;
  if (!s || !s.on) return;

  var pool = ensurePool(card.id);
  var p = getSpellPreset(card);
  var intensity = (s.intensity != null) ? s.intensity : 1;
  var count     = (s.count     != null) ? s.count     : 40;
  var w = 110, h = 154;

  // Spawn
  var spawnRate = count * intensity * 0.016;
  var toSpawn = Math.floor(spawnRate * dt / 16 + Math.random());
  toSpawn = Math.min(toSpawn, 5);
  for (var i = 0; i < toSpawn; i++) {
    if (pool.length < count * 3) pool.push(spawnParticle(card, t, w, h));
  }

  // Compute preset + geometry before ctx setup so we can use them in the scale step
  var preset = (s.preset) ? s.preset : 'fire';
  var hw = w * 0.5, hh = h * 0.5, r8 = 8;
  // spell-level scale (fire/shadow) or neural-level scale — applied to entire effect zone
  var spellScale = s.nwScale != null ? s.nwScale : 1;

  st.ctx.save();
  st.ctx.translate(cx, cy);
  st.ctx.rotate(cr * Math.PI / 180);   // ← apply card rotation so effects follow the card
  st.ctx.scale(cs, cs);
  // NOTE: spellScale for fire/shadow is applied to particle SIZE in the draw loop below,
  // NOT to the canvas transform (that would push particles outside the card bounds).

  // ── Preset-specific card-frame effects ────────────────────────────

  if (preset === 'fire') {
    // ── Fire v2 frame: burning edge glows from all lit edges ──────────────
    var firePal = FIRE_PALETTES[s.firePalette || 'fire'];
    var fireGlowMul = s.nwBgOpacity != null ? s.nwBgOpacity : 1; // "Glow Strength" slider
    var flicker = 0.7 + 0.3 * Math.sin(t * 0.0065 + 1.1) * Math.sin(t * 0.0097);
    var fr = firePal.tip[0], fg2 = firePal.tip[1], fb = firePal.tip[2];
    var mr = firePal.mid[0], mg = firePal.mid[1], mb = firePal.mid[2];
    st.ctx.save();
    roundRectPath(st.ctx, -hw, -hh, w, h, r8); // clip to card bounds
    st.ctx.clip();
    st.ctx.globalCompositeOperation = 'screen';
    // Bottom heat bed — deepest glow
    var bedH = h * 0.55;
    var bed = st.ctx.createLinearGradient(0, hh, 0, hh - bedH);
    bed.addColorStop(0,    'rgba(' + fr + ',' + fg2 + ',' + fb + ',' + (0.55 * intensity * flicker * fireGlowMul) + ')');
    bed.addColorStop(0.35, 'rgba(' + mr + ',' + mg + ',' + mb + ',' + (0.28 * intensity * fireGlowMul) + ')');
    bed.addColorStop(1,    'rgba(0,0,0,0)');
    st.ctx.fillStyle = bed;
    roundRectPath(st.ctx, -hw, -hh, w, h, r8);
    st.ctx.fill();
    // Side glow — narrower, follows side edges
    var sideGradL = st.ctx.createLinearGradient(-hw, 0, -hw + w * 0.35, 0);
    sideGradL.addColorStop(0, 'rgba(' + fr + ',' + fg2 + ',' + fb + ',' + (0.3 * intensity * flicker * fireGlowMul) + ')');
    sideGradL.addColorStop(1, 'rgba(0,0,0,0)');
    st.ctx.fillStyle = sideGradL;
    roundRectPath(st.ctx, -hw, -hh, w, h, r8);
    st.ctx.fill();
    var sideGradR = st.ctx.createLinearGradient(hw, 0, hw - w * 0.35, 0);
    sideGradR.addColorStop(0, 'rgba(' + fr + ',' + fg2 + ',' + fb + ',' + (0.3 * intensity * flicker * fireGlowMul) + ')');
    sideGradR.addColorStop(1, 'rgba(0,0,0,0)');
    st.ctx.fillStyle = sideGradR;
    roundRectPath(st.ctx, -hw, -hh, w, h, r8);
    st.ctx.fill();
    st.ctx.restore();
  }

  if (preset === 'arc') {
    // ── Arc v2 frame: electric border corona + corner micro-bolts ──────────
    // nwBgOpacity = "Border Glow" slider (0–1); nwScale = border lineWidth scale
    var arcGlowMul = s.nwBgOpacity != null ? s.nwBgOpacity : 0.5;
    var arcWidthMul = spellScale; // Scale slider controls border thickness
    var elecFlicker = 0.7 + 0.3 * Math.sin(t * 0.018) * Math.sin(t * 0.031 + 0.7);
    var arcInt = intensity * elecFlicker * arcGlowMul;
    st.ctx.save();
    st.ctx.globalCompositeOperation = 'screen';
    // Outer soft glow — subtle diffuse halo
    roundRectPath(st.ctx, -hw - 3, -hh - 3, w + 6, h + 6, r8 + 3);
    st.ctx.strokeStyle = 'rgba(80,200,255,' + (0.18 * arcInt) + ')';
    st.ctx.lineWidth = 7 * arcWidthMul;
    st.ctx.stroke();
    // Mid corona
    roundRectPath(st.ctx, -hw, -hh, w, h, r8);
    st.ctx.strokeStyle = 'rgba(140,220,255,' + (0.22 * arcInt) + ')';
    st.ctx.lineWidth = 2.5 * arcWidthMul;
    st.ctx.stroke();
    // Bright inner line — thin crisp edge
    roundRectPath(st.ctx, -hw, -hh, w, h, r8);
    st.ctx.strokeStyle = 'rgba(220,245,255,' + (0.28 * arcInt) + ')';
    st.ctx.lineWidth = 0.8 * arcWidthMul;
    st.ctx.stroke();
    // Corner micro-bolts — sparse crackle, toned down
    var corners2 = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    for (var ci = 0; ci < 4; ci++) {
      if (Math.random() > 0.12 * intensity * arcGlowMul) continue;
      var bcx = corners2[ci][0], bcy = corners2[ci][1];
      var bAng = Math.atan2(bcy, bcx);
      var bLen = 8 + Math.random() * 14;
      st.ctx.strokeStyle = 'rgba(200,240,255,' + (0.45 * intensity * arcGlowMul) + ')';
      st.ctx.lineWidth = 0.5 + Math.random() * 0.6;
      st.ctx.beginPath();
      st.ctx.moveTo(bcx, bcy);
      var bpx = bcx, bpy = bcy;
      var segs2 = 3 + Math.floor(Math.random() * 3);
      for (var bs = 0; bs < segs2; bs++) {
        var segL = bLen / segs2;
        var jit = (Math.random() - 0.5) * 7;
        bpx += Math.cos(bAng) * segL + Math.sin(bAng) * jit;
        bpy += Math.sin(bAng) * segL - Math.cos(bAng) * jit;
        st.ctx.lineTo(bpx, bpy);
      }
      st.ctx.stroke();
    }
    st.ctx.restore();
  }

  // ── Neural Web: pure shader-style filament effect, skip particles ──
  if (preset === 'neural') {
    drawNeuralWebAura(st.ctx, w, h, t, intensity, s);
    st.ctx.restore();
    return;
  }

  if (preset === 'shadow') {
    // Dark veil: deep shadow wells at the bottom and corners
    st.ctx.save();
    st.ctx.globalCompositeOperation = 'multiply';
    var veilPulse = 0.82 + 0.18 * Math.sin(t * 0.0022);
    var veilGrad = st.ctx.createRadialGradient(0, hh * 0.4, 0, 0, hh * 0.4, Math.max(w, h) * 0.9);
    veilGrad.addColorStop(0,   'rgba(8,0,18,' + (0.45 * intensity * veilPulse) + ')');
    veilGrad.addColorStop(0.5, 'rgba(8,0,18,' + (0.22 * intensity) + ')');
    veilGrad.addColorStop(1,   'rgba(0,0,0,0)');
    st.ctx.fillStyle = veilGrad;
    roundRectPath(st.ctx, -hw, -hh, w, h, r8);
    st.ctx.fill();
    st.ctx.restore();
  }

  // ── Particle physics + draw ────────────────────────────────────────
  // For shadow, nwBgOpacity acts as "Thickness" — scales smoke particle alpha
  var thicknessMod = (preset === 'shadow') ? (s.nwBgOpacity != null ? s.nwBgOpacity : 0.5) : 1;

  for (var j = pool.length - 1; j >= 0; j--) {
    var pt = pool[j];
    pt.life -= dt / 1000;
    if (pt.life <= 0) { pool.splice(j, 1); continue; }

    var age = 1 - pt.life / pt.maxLife;
    var fadeInT = p.fadeIn;
    if (age < fadeInT) {
      pt.alpha = age / fadeInT;
    } else {
      pt.alpha = 1 - (age - fadeInT) / (1 - fadeInT);
    }
    pt.alpha = Math.max(0, Math.min(1, pt.alpha)) * intensity * thicknessMod;

    pt.vy += p.gravity;
    pt.vx *= p.drag; pt.vy *= p.drag;
    pt.x += pt.vx + Math.sin(t * 0.001 + pt.swayPhase) * p.sway;
    pt.y += pt.vy;
    pt.rot += pt.rotV;

    var sz = pt.size * (1 - age * 0.4) * spellScale;
    drawParticleShape(pt, sz, t, spellScale);
  }

  st.ctx.restore();
}

// ── Neural Web aura ───────────────────────────────────────────────────────
// Glowing nodes orbit the card perimeter with filament lines between them.
// All drawing is clipped to the card's rounded-rect frame — no rectangle artifact.
export function drawNeuralWebAura(ctx2d, w, h, t, intensity, spellState) {
  var c1   = hexToRgbArr(spellState && spellState.color  ? spellState.color  : '#00FFCC');
  var c2   = hexToRgbArr(spellState && spellState.color2 ? spellState.color2 : '#0088FF');
  var spd  = (spellState && spellState.speed   != null) ? spellState.speed   : 1;
  // Count drives total node count (perimeter + interior)
  var countRaw = (spellState && spellState.count != null) ? spellState.count : 40;
  // Mobile: halve node count — filament draw cost is O(N²), so this cuts strokes by ~75%
  if (st.MOBILE_PERF_QUERY && st.MOBILE_PERF_QUERY.matches) countRaw = Math.max(8, Math.ceil(countRaw * 0.5));
  // Size drives node glow radius and line thickness
  var sizeMul  = (spellState && spellState.size  != null) ? spellState.size  : 2;
  // Spread drives interior node roam coverage (0.1–1)
  var spread   = (spellState && spellState.spread != null) ? spellState.spread : 0.5;
  // Scale zooms the entire effect (0.25–4×)
  var nwScale  = (spellState && spellState.nwScale != null) ? spellState.nwScale : 1;
  // BG Opacity controls the dark veil behind the web (0 = transparent, 1 = fully dark)
  var nwBgOp   = (spellState && spellState.nwBgOpacity != null) ? spellState.nwBgOpacity : 0.35;

  var ts  = t * 0.001 * spd;
  var hw  = w * 0.5, hh = h * 0.5, r8 = 8;

  // Derive node counts from the single count slider
  // Low count = sparse/few nodes; high count = dense web
  var totalNodes  = Math.max(4, Math.round(countRaw));
  var perimCount  = Math.max(3, Math.round(totalNodes * 0.6));  // 60% on perimeter
  var innerCount  = Math.max(1, totalNodes - perimCount);       // 40% interior

  ctx2d.save();

  // ── Clip to card rounded-rect ───────────────────────────────────────
  roundRectPath(ctx2d, -hw, -hh, w, h, r8);
  ctx2d.clip();

  // Apply scale zoom — scale from card center
  if (nwScale !== 1) {
    ctx2d.scale(nwScale, nwScale);
    // Compensate so card still fills same visual area after scale
    // (we want zooming to reveal more pattern detail, not to shrink the card)
    hw = hw / nwScale;
    hh = hh / nwScale;
  }

  ctx2d.globalCompositeOperation = 'screen';

  // ── Base dark veil ─────────────────────────────────────────────────
  ctx2d.save();
  ctx2d.globalCompositeOperation = 'source-over';
  ctx2d.fillStyle = 'rgba(0,4,14,' + nwBgOp + ')';
  ctx2d.fillRect(-hw, -hh, hw * 2, hh * 2);
  ctx2d.restore();
  ctx2d.globalCompositeOperation = 'screen';

  // ── Nebula pulse (background glow) ────────────────────────────────
  var glowPulse = 0.5 + 0.5 * Math.sin(ts * 1.4);
  var maxR = Math.max(hw, hh) * 1.2;
  var nebula = ctx2d.createRadialGradient(0, 0, 0, 0, 0, maxR);
  nebula.addColorStop(0,   'rgba('+c1[0]+','+c1[1]+','+c1[2]+','+(0.1 * intensity * glowPulse)+')');
  nebula.addColorStop(0.45,'rgba('+c2[0]+','+c2[1]+','+c2[2]+','+(0.055 * intensity)+')');
  nebula.addColorStop(1,   'rgba(0,0,0,0)');
  ctx2d.fillStyle = nebula;
  ctx2d.fillRect(-hw * 1.5, -hh * 1.5, hw * 3, hh * 3);

  // ── Collect all node positions ─────────────────────────────────────
  var nodePos = [];

  // Perimeter nodes — orbit the card edge
  for (var ai = 0; ai < perimCount; ai++) {
    var arcPhase = (ai / perimCount) * Math.PI * 2;
    var arcSpd2  = 0.22 + (ai % 5) * 0.09;
    var arcAngle = arcPhase + ts * arcSpd2;

    var perimFrac = ((arcAngle / (Math.PI * 2)) % 1 + 1) % 1;
    var perim = 2 * (w + h);
    var pd = perimFrac * perim;
    var px2, py2;
    if      (pd < w)       { px2 = -hw + pd;              py2 = -hh; }
    else if (pd < w + h)   { px2 =  hw;                   py2 = -hh + (pd - w); }
    else if (pd < 2*w + h) { px2 =  hw - (pd - w - h);    py2 =  hh; }
    else                   { px2 = -hw;                   py2 =  hh - (pd - 2*w - h); }

    // Inset so node glow stays inside card
    var inset = 5 + 3 * Math.abs(Math.sin(ts * 1.6 + arcPhase));
    var enx   = (Math.abs(px2) > Math.abs(py2) * (w / h)) ? Math.sign(px2) : 0;
    var eny   = (Math.abs(px2) > Math.abs(py2) * (w / h)) ? 0 : Math.sign(py2);
    px2 -= enx * inset;
    py2 -= eny * inset;

    nodePos.push({ x: px2, y: py2, phase: arcPhase, inner: false });
  }

  // Interior nodes — wander inside the card, coverage governed by spread
  for (var ii = 0; ii < innerCount; ii++) {
    var iPhase = (ii / innerCount) * Math.PI * 2 + 0.7;
    var iSpd   = 0.14 + (ii % 4) * 0.07;
    // Spread [0.1..1] maps interior range to [5%..85%] of half-dims
    var roam   = 0.05 + spread * 0.82;
    var ix2 = Math.sin(ts * iSpd + iPhase) * hw * roam;
    var iy2 = Math.cos(ts * iSpd * 0.8 + iPhase * 1.4) * hh * roam;

    nodePos.push({ x: ix2, y: iy2, phase: iPhase, inner: true });
  }

  // ── Filament connections ───────────────────────────────────────────
  // Distance threshold: larger count = shorter connections (denser web)
  var maxFilament = Math.max(w, h) * (0.75 - 0.35 * Math.min(1, countRaw / 120));
  // Line thickness driven by size (0.5–5×) + slight pulse
  var baseWidth = 0.4 + 0.08 * sizeMul;

  for (var na = 0; na < nodePos.length; na++) {
    for (var nb = na + 1; nb < nodePos.length; nb++) {
      var ddx  = nodePos[na].x - nodePos[nb].x;
      var ddy  = nodePos[na].y - nodePos[nb].y;
      var dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist > maxFilament) continue;

      var fade    = (1 - dist / maxFilament) * intensity * 0.55;
      var pulse3  = 0.35 + 0.65 * Math.abs(Math.sin(ts * 2.1 + nodePos[na].phase));
      var cmix    = (Math.sin(nodePos[na].phase + ts * 0.4) + 1) * 0.5;
      var lr = Math.round(c1[0] * (1-cmix) + c2[0] * cmix);
      var lg = Math.round(c1[1] * (1-cmix) + c2[1] * cmix);
      var lb = Math.round(c1[2] * (1-cmix) + c2[2] * cmix);

      ctx2d.strokeStyle = 'rgba('+lr+','+lg+','+lb+','+(fade * pulse3)+')';
      ctx2d.lineWidth   = baseWidth * (0.5 + 0.5 * (1 - dist / maxFilament));
      ctx2d.beginPath();
      ctx2d.moveTo(nodePos[na].x, nodePos[na].y);

      // Organic curved filament — slight bezier wobble influenced by noise
      var mx   = (nodePos[na].x + nodePos[nb].x) * 0.5;
      var my   = (nodePos[na].y + nodePos[nb].y) * 0.5;
      var wobbleAmp = dist * 0.18 * (0.5 + 0.5 * Math.sin(ts * 1.3 + na * 0.7));
      var cpx = mx + Math.sin(ts * 0.9 + na + nb * 0.5) * wobbleAmp;
      var cpy = my + Math.cos(ts * 1.1 + nb - na * 0.3) * wobbleAmp;
      ctx2d.quadraticCurveTo(cpx, cpy, nodePos[nb].x, nodePos[nb].y);
      ctx2d.stroke();
    }
  }

  // ── Draw nodes ─────────────────────────────────────────────────────
  // Node glow radius driven by sizeMul
  var baseNodeR = (1.2 + 0.8 * sizeMul);
  for (var ni = 0; ni < nodePos.length; ni++) {
    var np      = nodePos[ni];
    var colorMix = (Math.sin(np.phase + ts * 0.5) + 1) * 0.5;
    var fr = Math.round(c1[0] * (1-colorMix) + c2[0] * colorMix);
    var fg = Math.round(c1[1] * (1-colorMix) + c2[1] * colorMix);
    var fb = Math.round(c1[2] * (1-colorMix) + c2[2] * colorMix);

    // Inner nodes are slightly dimmer/smaller
    var nodeR   = baseNodeR * (1 + 1.2 * Math.abs(Math.sin(ts * 2.2 + np.phase * 1.4))) * (np.inner ? 0.75 : 1.0);
    var nodeAlp = 0.72 * intensity * (0.45 + 0.55 * Math.sin(ts * 2.0 + ni * 0.6));
    if (nodeAlp < 0.01) continue;

    var glowR = nodeR * 3.5;
    var ng = ctx2d.createRadialGradient(np.x, np.y, 0, np.x, np.y, glowR);
    ng.addColorStop(0,    'rgba(255,255,255,'+Math.min(1, nodeAlp)+')');
    ng.addColorStop(0.18, 'rgba('+fr+','+fg+','+fb+','+nodeAlp+')');
    ng.addColorStop(0.6,  'rgba('+fr+','+fg+','+fb+','+(nodeAlp * 0.28)+')');
    ng.addColorStop(1,    'rgba('+fr+','+fg+','+fb+',0)');
    ctx2d.fillStyle = ng;
    ctx2d.beginPath();
    ctx2d.arc(np.x, np.y, glowR, 0, Math.PI * 2);
    ctx2d.fill();

    // Hot white core dot
    ctx2d.fillStyle = 'rgba(255,255,255,'+(nodeAlp * 0.85)+')';
    ctx2d.beginPath();
    ctx2d.arc(np.x, np.y, Math.max(0.5, nodeR * 0.4), 0, Math.PI * 2);
    ctx2d.fill();
  }

  ctx2d.restore();
}
export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function drawParticleShape(pt, sz, t, spellScale) {
  spellScale = spellScale || 1;
  st.ctx.save();
  st.ctx.translate(pt.x, pt.y);
  st.ctx.rotate(pt.rot);
  st.ctx.globalAlpha = pt.alpha;

  var rgb = hexToRgb(pt.color);
  // Shadow blur is GPU-expensive; only apply on smaller particles (sz < 4)
  // and skip entirely for smoke (it doesn't need glow) or on mobile
  if (pt.shape !== 'smoke' && sz < 4 && !(st.MOBILE_PERF_QUERY && st.MOBILE_PERF_QUERY.matches)) {
    st.ctx.shadowColor = pt.color;
    st.ctx.shadowBlur = sz * 2.5;
  }

  if (pt.shape === 'flame') {
    // ── Fire v2: radial gradient circles with palette colours + screen blend ──
    st.ctx.globalAlpha = 1; // alpha encoded in gradient rgba strings
    var age = 1 - pt.life / pt.maxLife;
    var hot = Math.max(0, 1 - age * 1.5); // 1=fresh, 0=dying
    var pal = FIRE_PALETTES[pt.palette || 'fire'];
    // Interpolate core colour from white-hot when fresh → mid when older
    var cR = Math.round(pal.core[0] * hot + pal.mid[0] * (1 - hot));
    var cG = Math.round(pal.core[1] * hot + pal.mid[1] * (1 - hot));
    var cB = Math.round(pal.core[2] * hot + pal.mid[2] * (1 - hot));

    // Offset hot spot slightly up (flame tip is higher than the centre)
    var hotOffY = -sz * 0.25;
    var fg = st.ctx.createRadialGradient(0, hotOffY, sz * 0.05, 0, hotOffY, sz);
    fg.addColorStop(0,    'rgba(' + cR + ',' + cG + ',' + cB + ',' + Math.min(1, pt.alpha * 1.2) + ')');
    fg.addColorStop(0.28, 'rgba(' + pal.mid[0] + ',' + pal.mid[1] + ',' + pal.mid[2] + ',' + (pt.alpha * 0.85) + ')');
    fg.addColorStop(0.6,  'rgba(' + pal.tip[0] + ',' + pal.tip[1] + ',' + pal.tip[2] + ',' + (pt.alpha * 0.4) + ')');
    fg.addColorStop(1,    'rgba(0,0,0,0)');

    st.ctx.globalCompositeOperation = 'screen';
    st.ctx.fillStyle = fg;
    st.ctx.beginPath();
    st.ctx.arc(0, 0, sz, 0, Math.PI * 2);
    st.ctx.fill();

  } else if (pt.shape === 'smoke') {
    // ── Smoke v2: single large expanding soft puff ──
    // Expand as puff rises — use raw pt.size and age instead of pre-computed sz
    st.ctx.globalAlpha = 1; // alpha is encoded in the gradient rgba strings below
    var smokeAge = 1 - pt.life / pt.maxLife;
    var growSz = pt.size * (0.45 + smokeAge * 2.2) * spellScale; // grows from 0.45× to 2.65×
    // Opacity: quick fade-in, hold, slow fade-out
    var smokeAlpha;
    if (smokeAge < 0.15) {
      smokeAlpha = (smokeAge / 0.15) * pt.alpha;
    } else {
      smokeAlpha = pt.alpha * (1 - Math.pow((smokeAge - 0.15) / 0.85, 1.5));
    }
    smokeAlpha = Math.max(0, smokeAlpha * 0.45);

    var sg = st.ctx.createRadialGradient(0, 0, growSz * 0.08, 0, 0, growSz);
    sg.addColorStop(0,    'rgba(' + rgb + ',' + smokeAlpha + ')');
    sg.addColorStop(0.45, 'rgba(' + rgb + ',' + (smokeAlpha * 0.55) + ')');
    sg.addColorStop(1,    'rgba(' + rgb + ',0)');

    st.ctx.globalCompositeOperation = 'multiply';
    st.ctx.fillStyle = sg;
    st.ctx.beginPath();
    st.ctx.arc(0, 0, growSz, 0, Math.PI * 2);
    st.ctx.fill();

  } else if (pt.shape === 'ember') {
    st.ctx.beginPath();
    st.ctx.ellipse(0, 0, sz * 0.5, sz, 0, 0, Math.PI * 2);
    var ge = st.ctx.createRadialGradient(0, -sz * 0.3, 0, 0, 0, sz);
    ge.addColorStop(0, 'rgba(255,255,220,' + pt.alpha + ')');
    ge.addColorStop(0.4, 'rgba(' + rgb + ',' + pt.alpha + ')');
    ge.addColorStop(1, 'rgba(' + rgb + ',0)');
    st.ctx.fillStyle = ge;
    st.ctx.fill();
  } else if (pt.shape === 'orb') {
    st.ctx.beginPath();
    st.ctx.arc(0, 0, sz, 0, Math.PI * 2);
    var go = st.ctx.createRadialGradient(-sz * 0.3, -sz * 0.3, 0, 0, 0, sz);
    go.addColorStop(0, 'rgba(255,255,255,' + (pt.alpha * 0.9) + ')');
    go.addColorStop(0.35, 'rgba(' + rgb + ',' + pt.alpha + ')');
    go.addColorStop(1, 'rgba(' + rgb + ',0)');
    st.ctx.fillStyle = go;
    st.ctx.fill();
  } else if (pt.shape === 'star') {
    st.ctx.beginPath();
    for (var k = 0; k < 5; k++) {
      var ang2 = (k / 5) * Math.PI * 2 - Math.PI / 2;
      var angIn = ang2 + Math.PI / 5;
      if (k === 0) st.ctx.moveTo(Math.cos(ang2) * sz, Math.sin(ang2) * sz);
      else st.ctx.lineTo(Math.cos(ang2) * sz, Math.sin(ang2) * sz);
      st.ctx.lineTo(Math.cos(angIn) * sz * 0.4, Math.sin(angIn) * sz * 0.4);
    }
    st.ctx.closePath();
    st.ctx.fillStyle = 'rgba(' + rgb + ',' + pt.alpha + ')';
    st.ctx.fill();
  } else if (pt.shape === 'spark') {
    // White-hot core diamond
    st.ctx.beginPath();
    st.ctx.moveTo(0, -sz * 2);
    st.ctx.lineTo(sz * 0.2, 0);
    st.ctx.lineTo(0, sz * 0.5);
    st.ctx.lineTo(-sz * 0.2, 0);
    st.ctx.closePath();
    st.ctx.fillStyle = 'rgba(255,255,255,' + pt.alpha + ')';
    st.ctx.fill();
    // Electric glow halo around the spark
    var gspark = st.ctx.createRadialGradient(0, -sz * 0.6, 0, 0, -sz * 0.2, sz * 2.2);
    gspark.addColorStop(0,   'rgba(' + rgb + ',' + pt.alpha + ')');
    gspark.addColorStop(0.5, 'rgba(' + rgb + ',' + (pt.alpha * 0.4) + ')');
    gspark.addColorStop(1,   'rgba(' + rgb + ',0)');
    st.ctx.globalCompositeOperation = 'screen';
    st.ctx.fillStyle = gspark;
    st.ctx.beginPath();
    st.ctx.arc(0, -sz * 0.2, sz * 2.2, 0, Math.PI * 2);
    st.ctx.fill();
  } else if (pt.shape === 'petal') {
    st.ctx.beginPath();
    st.ctx.moveTo(0, -sz);
    st.ctx.bezierCurveTo(sz * 0.6, -sz * 0.5, sz * 0.6, sz * 0.5, 0, sz * 0.8);
    st.ctx.bezierCurveTo(-sz * 0.6, sz * 0.5, -sz * 0.6, -sz * 0.5, 0, -sz);
    st.ctx.fillStyle = 'rgba(' + rgb + ',' + pt.alpha + ')';
    st.ctx.fill();
  } else if (pt.shape === 'wisp') {
    st.ctx.beginPath();
    st.ctx.arc(0, 0, sz * 0.7, 0, Math.PI * 2);
    var gw = st.ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 0.7);
    gw.addColorStop(0, 'rgba(255,255,255,' + (pt.alpha * 0.6) + ')');
    gw.addColorStop(0.5, 'rgba(' + rgb + ',' + (pt.alpha * 0.7) + ')');
    gw.addColorStop(1, 'rgba(' + rgb + ',0)');
    st.ctx.fillStyle = gw;
    st.ctx.fill();
    st.ctx.globalAlpha = pt.alpha * 0.3;
    st.ctx.strokeStyle = 'rgba(' + rgb + ',0.5)';
    st.ctx.lineWidth = sz * 0.3;
    st.ctx.beginPath();
    st.ctx.moveTo(0, 0);
    st.ctx.lineTo(-pt.vx * 8, -pt.vy * 8);
    st.ctx.stroke();
  }

  st.ctx.shadowBlur = 0;
  st.ctx.restore();
}

// Clean up particle pool when card is deleted
export function clearParticlePool(cardId) {
  delete st.particlePools[cardId];
}

// ============================================================
//  RENDER LOOP
// ============================================================
export function lerp(a, b, t) { return a + (b - a) * t; }
var lerpNum = lerp;

function lerpColor(hexA, hexB, t) {
  function h2r(h) { if (!h) return [0,0,0]; h = h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  var a = h2r(hexA), b = h2r(hexB);
  return '#' + [0,1,2].map(function(i) { return Math.max(0,Math.min(255,Math.round(a[i]+(b[i]-a[i])*t))).toString(16).padStart(2,'0'); }).join('');
}

var _spriteMote = null;  // optional sprite texture; null = use procedural draw
var _spriteSpark = null; // optional spark texture; null = use procedural draw

// ── Simple seeded noise (1D) for turbulence without imports ──────────────
// ── Noise primitives ────────────────────────────────────────────────────
// Smooth 1D hash → 0..1
export function fbmNoise(x, seed) {
  seed = seed || 0;
  var v = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
// Smooth 2D value noise → 0..1  (bilinear interpolated lattice)
export function noise2(x, y) {
  var ix = Math.floor(x), iy = Math.floor(y);
  var fx = x - ix, fy = y - iy;
  // Smoothstep both axes
  var ux = fx * fx * (3 - 2 * fx);
  var uy = fy * fy * (3 - 2 * fy);
  // four corner hashes
  function h(a, b) {
    var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  return h(ix, iy)     * (1-ux) * (1-uy)
       + h(ix+1, iy)   *    ux  * (1-uy)
       + h(ix, iy+1)   * (1-ux) *    uy
       + h(ix+1, iy+1) *    ux  *    uy;
}
// Fractal Brownian Motion — 4 octaves, returns -1..1
export function fbm2(x, y) {
  var v = 0, a = 0.5, f = 1.0;
  for (var o = 0; o < 4; o++) {
    v += a * (noise2(x * f, y * f) * 2 - 1);
    a *= 0.5; f *= 2.13;
  }
  return v; // approx -1..1
}
// Domain-warped fBm — apply one layer of fBm to displace coords before sampling
export function warpedFbm(x, y) {
  var dx = fbm2(x + 1.7, y + 9.2);
  var dy = fbm2(x + 8.3, y + 2.8);
  return fbm2(x + 2.5 * dx, y + 2.5 * dy);
}
// Legacy 1D turbulence (kept for backward compat)
export function turbulence(x, t, octaves) {
  var val = 0, amp = 1, freq = 1, max = 0;
  for (var o = 0; o < octaves; o++) {
    val += (fbmNoise(x * freq + t * 0.3, o) * 2 - 1) * amp;
    max += amp; amp *= 0.5; freq *= 2.1;
  }
  return val / max; // -1..1
}
// 2D turbulence wrapper using fbm2
export function turbulence2(x, y) {
  return fbm2(x, y); // -1..1
}

export function initBgStars(W, H) {
  st.bgStars = [];
  var n = Math.round(st.bgFx.starCount * st.bgFx.intensity);
  for (var i = 0; i < n; i++) {
    var z = Math.random();
    var layer = (z < 0.33) ? 0 : (z < 0.66 ? 1 : 2);
    var baseR = (layer === 0) ? (0.6 + Math.random()*0.8) : (layer === 1 ? (1.0 + Math.random()*1.2) : (1.6 + Math.random()*1.8));
    var spd = (0.5 + Math.random() * 1.5) * (layer === 0 ? 0.55 : (layer === 1 ? 1.0 : 1.45));
    st.bgStars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.4 + Math.random() * 2.2,
      baseR: baseR,
      twinkle: Math.random() * Math.PI * 2,
      twPhase: Math.random() * Math.PI * 2,
      speed: spd,
      z: z,
      layer: layer,
      color: Math.random() < 0.3 ? '#b0c8ff' : (Math.random() < 0.5 ? '#ffe4b5' : '#ffffff')
    });
  }
  st.bgStarsInit = true;
}

// ── Custom color helpers ─────────────────────────────────────────────────
export function hexToRgbArr(hex) {
  if (!hex) return null;
  hex = hex.replace('#','');

  if (!hex) return null;
  hex = hex.replace('#','');
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}

export function clamp255(v){ return Math.max(0, Math.min(255, v|0)); }

// Very cheap "hue drift" approximation: tiny channel nudges.
// drift is in degrees-ish; keep it small (e.g. -10..+10).
export function driftRgbArr(rgbArr, drift) {
  if (!rgbArr) return [255,255,255];
  var d = drift / 30; // small
  return [
    clamp255(rgbArr[0] + d*10),
    clamp255(rgbArr[1] + d*6),
    clamp255(rgbArr[2] - d*8)
  ];
}

// Fast-in, slow-out alpha over lifetime (t in [0..1])
export function lifeAlpha(t) {
  t = Math.max(0, Math.min(1, t));
  var aIn = Math.min(1, t / 0.15);
  var u = Math.max(0, (t - 0.15) / 0.85);
  // easeOutQuad on u
  var aOut = 1 - (1 - u) * (1 - u);
  return aIn * (1 - aOut);
}

// Lifetime size curve (t in [0..1]): quick grow then slow decay
export function lifeSize(t) {
  t = Math.max(0, Math.min(1, t));
  // grow to peak at ~25%, then decay
  if (t < 0.25) return 0.7 + 0.6 * (t / 0.25);
  var u = (t - 0.25) / 0.75;
  return 1.3 - 0.6 * (u * u);
}

// Reduce clutter in the center (keeps the card readable). Returns multiplier in [0..1]
export function focalMask(x, y, W, H, strength) {
  var cx = W/2, cy = H/2;
  var dx = (x - cx) / (W * 0.42);
  var dy = (y - cy) / (H * 0.35);
  var d = Math.sqrt(dx*dx + dy*dy);
  // smoothstep from center outward
  var m = (d - 0.35) / (1.0 - 0.35);
  m = Math.max(0, Math.min(1, m));
  m = m*m*(3-2*m);
  var s = (strength == null) ? 0.35 : strength; // 0=no protection, 1=strong
  return lerpNum(1, m, s);
}



// Offscreen sprites (optional) for faster, smoother particles
// (st._spriteEmber lives in state.js) = null;
// (st._spriteSmoke lives in state.js) = null;
// (st._smokeBuf lives in state.js) = null, st._smokeCtx = null, st._smokeBW = 0, st._smokeBH = 0;
export function initParticleSprites() {
  if (st._spriteEmber) return;
  st._spriteEmber = document.createElement('canvas');
  // _spriteSmoke is null by default — drawBgSmoke guards against null
  if (!st.bgParticles) st.bgParticles = [];
  if (!st.bgSmokeParticles) st.bgSmokeParticles = [];
}

// Cheap deterministic "micro flow" for more interesting motion (no noise lib)
export function applyMicroFlow(p, W, H, t, strength, freq) {
  // strength ~ 0.02–0.18, freq ~ 0.002–0.01
  var fx = freq || 0.004;
  var s = strength || 0.06;
  var tt = t * 0.001;
  // normalize to screen to keep consistent across sizes
  var nx = p.x / Math.max(1, W);
  var ny = p.y / Math.max(1, H);
  p.vx += Math.sin((ny * 6 + tt * 1.7) * (1 + fx*10)) * s;
  p.vy += Math.cos((nx * 6 + tt * 1.3) * (1 + fx*10)) * s;
}


export function fireColor(hot, useCustom) {
  if (useCustom && st.bgFx.particleColor1) {
    var c = hexToRgbArr(st.bgFx.particleColor1);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  // White-yellow core → orange → deep red
  var r = 255;
  var g = Math.floor(hot > 0.6 ? 220 : hot > 0.3 ? 80 + 140 * (hot / 0.6) : 20 + 80 * (hot / 0.3));
  var b = Math.floor(hot > 0.7 ? 180 * ((hot - 0.7) / 0.3) : 0);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
export function smokeColor(age, useCustom) {
  if (useCustom && st.bgFx.particleColor2) {
    var c = hexToRgbArr(st.bgFx.particleColor2);
    return c[0] + ',' + c[1] + ',' + c[2];
  }
  // dark grey → brownish as it ages
  var v = Math.floor(18 + age * 35);
  var rb = Math.floor(v + age * 20);
  return rb + ',' + v + ',' + v;
}

// ── FLOW / DIRECTION HELPER ──────────────────────────────────────────────
// Overwrites p.x, p.y, p.vx, p.vy to implement directional flow.
// Rules:
//   up/down/left/right  — particles ENTER from the opposite edge and travel in the named direction
//   outward             — particles spawn AT origin and travel outward to all edges
//   inward              — particles spawn scattered across canvas edges and travel toward origin
//   angle               — particles enter from the opposite edge and travel at that angle
export function applyFlowToParticle(p, W, H, baseSpeed) {
  var mode = st.bgFx.flowMode;
  if (mode === 'left' || mode === 'right') { mode = 'default'; }
  if (mode === 'default') return;
  var velOnly = !!p._flowVelOnly;

  var ox = st.bgFx.originX * W;
  var oy = st.bgFx.originY * H;
  var spread = st.bgFx.flowSpread; // 0=tight, 1=hemisphere, 2=full sphere
  var spd = (baseSpeed !== undefined && baseSpeed > 0.01) ? baseSpeed : Math.max(st.bgFx.speed * 2, 1);
  // Make explode/implode feel punchier
  var burstMul = (mode === 'outward' || mode === 'inward') ? (1.6 + Math.random() * 0.8) : 1;
  spd *= burstMul;

  // halfCone: how many radians either side of base direction particles can deviate
  // spread=0 → ~8°, spread=1 → 90°, spread=2 → 180° (full)
  var halfCone = 0.14 + Math.PI * Math.min(spread, 1) * 0.86 + (spread > 1 ? Math.PI * (spread - 1) : 0);
  halfCone = Math.min(halfCone, Math.PI);
  var s01 = Math.max(0, Math.min(1, spread));
  var spawnW = lerpNum(0.08, 1.15, s01) * W;
  var spawnH = lerpNum(0.08, 1.15, s01) * H;

  var baseAngle, spawnEdge;

  if (mode === 'up') {
    // Spawn along bottom edge, travel upward
    baseAngle = -Math.PI / 2;
    if (!velOnly) { p.x = (W/2) + (Math.random()-0.5) * spawnW; p.y = H + 10; }
  } else if (mode === 'down') {
    // Spawn along top edge, travel downward
    baseAngle = Math.PI / 2;
    if (!velOnly) { p.x = (W/2) + (Math.random()-0.5) * spawnW; p.y = -10; }
  } else if (mode === 'left') {
    // Spawn along right edge, travel leftward
    baseAngle = Math.PI;
    if (!velOnly) { p.x = W + 10; p.y = Math.random() * H; }
  } else if (mode === 'right') {
    // Spawn along left edge, travel rightward
    baseAngle = 0;
    if (!velOnly) { p.x = -10; p.y = Math.random() * H; }
  } else if (mode === 'outward') {
    // Spawn at origin with tiny jitter, travel outward in all directions
    var jitter = Math.min(W, H) * 0.02;
    if (!velOnly) {
      p.x = ox + (Math.random() - 0.5) * jitter;
      p.y = oy + (Math.random() - 0.5) * jitter;
    }
    // Random outward direction — spread controls how full the burst is
    // At spread=1 it's already full 360, so always use full circle for outward
    baseAngle = Math.random() * Math.PI * 2;
    halfCone = 0; // already random full circle
  } else if (mode === 'inward') {
    // Spawn along a random canvas edge, travel toward origin
    var edge = Math.floor(Math.random() * 4);
    if (!velOnly) {
      if (edge === 0)      { p.x = (W/2) + (Math.random()-0.5) * spawnW; p.y = -10; }        // top
      else if (edge === 1) { p.x = (W/2) + (Math.random()-0.5) * spawnW; p.y = H + 10; }     // bottom
      else if (edge === 2) { p.x = -10;               p.y = (H/2) + (Math.random()-0.5) * spawnH; } // left
      else                 { p.x = W + 10;            p.y = (H/2) + (Math.random()-0.5) * spawnH; } // right
    }
    // Direction from spawn toward origin
    var idx = ox - p.x, idy = oy - p.y;
    baseAngle = Math.atan2(idy, idx);
  } else if (mode === 'angle') {
    // Custom angle: particles enter from the opposite edge
    var a = st.bgFx.flowAngle * Math.PI / 180;
    baseAngle = a;
    // Spawn on the edge that is "behind" the direction of travel
    var oppositeAngle = a + Math.PI;
    // Pick a spawn point along the canvas boundary in the opposite direction
    var cos = Math.cos(oppositeAngle), sin = Math.sin(oppositeAngle);
    // Intersect ray from canvas center in oppositeAngle direction with canvas edge
    var cx = W / 2, cy = H / 2;
    var tMax = 0;
    if (Math.abs(cos) > 0.001) { var tx = cos > 0 ? (W - cx) / cos : -cx / cos; if (tx > 0) tMax = Math.max(tMax, tx); }
    if (Math.abs(sin) > 0.001) { var ty = sin > 0 ? (H - cy) / sin : -cy / sin; if (ty > 0) tMax = Math.max(tMax, ty); }
    var edgeX = cx + cos * tMax, edgeY = cy + sin * tMax;
    // Scatter along the entry edge perpendicular to travel direction
    var perpX = -sin, perpY = cos;
    var scatter = (Math.random() - 0.5) * Math.max(W, H) * 1.2;
    if (!velOnly) { p.x = edgeX + perpX * scatter; p.y = edgeY + perpY * scatter; }
  } else {
    return;
  }

  
  // For top/bottom modes, aim toward the center of the screen (focal point)
  if (mode === 'up' || mode === 'down') {
    var cx0 = W / 2, cy0 = H / 2;
    baseAngle = Math.atan2(cy0 - p.y, cx0 - p.x);
  }
var deviation = (Math.random() - 0.5) * 2 * halfCone;
  var finalAngle = baseAngle + deviation;
  var tvx = Math.cos(finalAngle) * spd;
  var tvy = Math.sin(finalAngle) * spd;
  if (mode === 'outward' || mode === 'inward' || mode === 'up' || mode === 'down') {
    // Edge flows should be decisive so they visibly come from the chosen direction
    p.vx = tvx;
    p.vy = tvy;
    return;
  }
  var steer = 0.35; // keep directional flow strong but not snap-hard
  if (p.vx == null) p.vx = tvx; else p.vx = lerpNum(p.vx, tvx, steer);
  if (p.vy == null) p.vy = tvy; else p.vy = lerpNum(p.vy, tvy, steer);
}


export function spawnFlame(W, H) {
  var mode = st.bgFx.flowMode; if (mode === 'left' || mode === 'right') mode = 'default';
  var cols = Math.round(8 + st.bgFx.fireHeat * 12);
  var col  = Math.floor(Math.random() * cols);
  var cx   = (col + 0.5 + (Math.random()-0.5)*0.8) / cols * W;
  var turbX = turbulence(cx / W, performance.now() * 0.0001 * st.bgFx.speed, 3) * W * 0.06;
  var spd = (2.5 + Math.random() * 4.5) * st.bgFx.speed * st.bgFx.fireHeight;
  var p = {
    x: cx + turbX,
    y: H + Math.random() * 20,
    vx: (mode === 'default') ? ((Math.random() - 0.5) * 0.8 * st.bgFx.speed) : 0,
    vy: (mode === 'default') ? -spd : 0,
    life: 0.8 + Math.random() * 1.4,
    maxLife: 0,
    size: (W / cols) * (0.55 + Math.random() * 0.65) * st.bgFx.fireHeat,
    swayPhase: Math.random() * Math.PI * 2,
    swaySpeed: 1.5 + Math.random() * 2,
    type: 'flame',
    z: Math.random(),
    _flowVelOnly: false
  };
  applyFlowToParticle(p, W, H, spd);
  var z = (p.z != null) ? p.z : 0.5;
  var zS = lerpNum(0.7, 1.35, z);
  p.size *= zS;
  p.vx *= lerpNum(0.75, 1.4, z);
  p.vy *= lerpNum(0.75, 1.4, z);
  return p;
}

export function spawnSmoke(W, H) {
  var mode = st.bgFx.flowMode; if (mode === 'left' || mode === 'right') mode = 'default';
  var spd = (0.35 + Math.random() * 0.6) * st.bgFx.speed;
  var p = {
    x: Math.random() * W,
    y: H * (0.55 + Math.random() * 0.5),
    vx: (mode === 'default') ? ((Math.random() - 0.5) * 0.5 * st.bgFx.speed) : 0,
    vy: (mode === 'default') ? -spd : 0,
    life: 5 + Math.random() * 8,
    maxLife: 0,
    size: W * (0.06 + Math.random() * 0.12) * st.bgFx.smokeAmount,
    swayPhase: Math.random() * Math.PI * 2,
    swaySpeed: 0.3 + Math.random() * 0.6,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.008 * st.bgFx.speed,
    type: 'smoke',
    z: Math.random(),
    _flowVelOnly: false
  };
  applyFlowToParticle(p, W, H, spd);
  return p;
}

export function spawnBgParticle(W, H, t) {
  var type = st.bgFx.type;
  if (type === 'shadow') {
    var ang = Math.random() * Math.PI * 2;
    var spd = 0.4 * st.bgFx.speed;
    var p = {
      x: W * 0.5 + Math.cos(ang) * (W * 0.4 + Math.random() * W * 0.2),
      y: H * 0.5 + Math.sin(ang) * (H * 0.4 + Math.random() * H * 0.2),
      vx: (Math.random() - 0.5) * spd,
      vy: (Math.random() - 0.5) * spd,
      life: 3 + Math.random() * 4, maxLife: 0,
      size: 20 + Math.random() * 60 * st.bgFx.shadowDepth,
      z: Math.random(),
      // depth-scaled size
      _zSize: 0,
      type: 'shadow', swayPhase: Math.random() * Math.PI * 2,
      mix: Math.random(), hueDrift: (Math.random()*2 - 1) * 10, spark: (Math.random() < 0.04)
    };
    if (st.bgFx.flowMode !== 'default') { p.vx = 0; p.vy = 0; }
    applyFlowToParticle(p, W, H, spd);
    var zS = lerpNum(0.7, 1.35, p.z);
    p.size *= zS;
    p.vx *= lerpNum(0.75, 1.4, p.z);
    p.vy *= lerpNum(0.75, 1.4, p.z);
    return p;
  } else if (type === 'nature') {
    var leafColors = st.bgFx.particleColor1
      ? [st.bgFx.particleColor1, st.bgFx.particleColor2 || st.bgFx.particleColor1]
      : ['#2d7a3a','#3a8c2e','#4fa83d','#a8c84a','#c8a840','#8bc840'];
    var wSpd = 0.3 * st.bgFx.windStrength * st.bgFx.speed + (Math.random() - 0.3) * st.bgFx.windStrength;
    var fSpd = 0.8 + Math.random() * 1.4 * st.bgFx.speed;
    var p2 = {
      x: -20 + Math.random() * (W + 40), y: -20,
      vx: wSpd,
      vy: fSpd,
      life: 4 + Math.random() * 5, maxLife: 0,
      size: (4 + Math.random() * 10) * st.bgFx.leafSize,
      z: Math.random(),
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.04 * st.bgFx.speed,
      type: 'nature', swayPhase: Math.random() * Math.PI * 2,
      mix: Math.random(), hueDrift: (Math.random()*2 - 1) * 10, spark: (Math.random() < 0.04),
      leafColor: leafColors[Math.floor(Math.random() * leafColors.length)]
    };
    if (st.bgFx.flowMode !== 'default') { p2.vx = 0; p2.vy = 0; }
    applyFlowToParticle(p2, W, H, Math.sqrt(wSpd*wSpd + fSpd*fSpd));
    var zS2 = lerpNum(0.7, 1.35, p2.z);
    p2.size *= zS2;
    p2.vx *= lerpNum(0.75, 1.4, p2.z);
    p2.vy *= lerpNum(0.75, 1.4, p2.z);
    return p2;
  }
  return null;
}

// Persistent offscreen canvases — allocated once, resized only when dimensions change
// (st._bgOff lives in state.js) = null, st._bgOffCtx = null;
// (st._bgWarpOff lives in state.js) = null, st._bgWarpOffCtx = null;
// (st._bgOff lives in state.js)W = 0, st._bgOffH = 0;

export function _ensureBgOffscreen(W, H) {
  if (!st._bgOff || st._bgOffW !== W || st._bgOffH !== H) {
    st._bgOff = document.createElement('canvas');
    st._bgOff.width = W; st._bgOff.height = H;
    st._bgOffCtx = st._bgOff.getContext('2d');
    st._bgWarpOff = document.createElement('canvas');
    st._bgWarpOff.width = W; st._bgWarpOff.height = H;
    st._bgWarpOffCtx = st._bgWarpOff.getContext('2d');
    st._bgOffW = W; st._bgOffH = H;
  }
}

// BG effect throttle counter
// (st._bgFrameCounter lives in state.js) = 0;

export function drawBgEffects(tctx, W, H, t) {
  if (!st.bgFx.type) return;

  _ensureBgOffscreen(W, H);

  // Background FX throttled independently — mobile ~15fps, desktop ~20fps.
  st._bgFrameCounter = (st._bgFrameCounter + 1) % (st.MOBILE_PERF_QUERY.matches ? 4 : 3);
  if (st._bgFrameCounter !== 0) {
    tctx.save();
    tctx.globalCompositeOperation = st.bgFx.blend || 'source-over';
    tctx.globalAlpha = 1;
    tctx.drawImage(st._bgOff, 0, 0);
    tctx.restore();
    return;
  }

  st._bgOffCtx.clearRect(0, 0, W, H);

  if (st.bgFx.warp !== 'none') {
    st._bgWarpOffCtx.clearRect(0, 0, W, H);
    drawBgFxCore(st._bgWarpOffCtx, W, H, t);
    applyWarp(st._bgOffCtx, st._bgWarpOff, W, H, t);
  } else {
    drawBgFxCore(st._bgOffCtx, W, H, t);
  }

  tctx.save();
  tctx.globalCompositeOperation = st.bgFx.blend || 'source-over';
  tctx.globalAlpha = 1;
  tctx.drawImage(st._bgOff, 0, 0);
  tctx.restore();
}

// BG FX stacking renderer (max 3 layers). Uses shared offscreen buffers and per-layer opacity/blend.
// One layer per FX type (no duplicates) to avoid conflicting particle state.

export function _ensureBgLayerRuntime(layer) {
  if (!layer._rt) {
    layer._rt = {
      bgParticles: [], bgSmokeParticles: [], bgStars: [], bgStarsInit: false,
      _bgLastT: 0, _bgAccShadow: 0, _bgAccNature: 0, _bgAccCosmic: 0,
      _crystalPoints: [], _metaBalls: []
    };
  }
  return layer._rt;
}

export function _bindBgRuntime(rt){
  st.bgParticles = rt.bgParticles;
  st.bgSmokeParticles = rt.bgSmokeParticles;
  st.bgStars = rt.bgStars;
  st.bgStarsInit = rt.bgStarsInit;
  st._bgLastT = rt._bgLastT;
  st._bgAccShadow = rt._bgAccShadow;
  st._bgAccNature = rt._bgAccNature;
  st._bgAccCosmic = rt._bgAccCosmic;
  st._crystalPoints = rt._crystalPoints;
  st._metaBalls = rt._metaBalls;
}
export function _saveBgRuntime(rt){
  rt.bgParticles = st.bgParticles;
  rt.bgSmokeParticles = st.bgSmokeParticles;
  rt.bgStars = st.bgStars;
  rt.bgStarsInit = st.bgStarsInit;
  rt._bgLastT = st._bgLastT;
  rt._bgAccShadow = st._bgAccShadow;
  rt._bgAccNature = st._bgAccNature;
  rt._bgAccCosmic = st._bgAccCosmic;
  rt._crystalPoints = st._crystalPoints;
  rt._metaBalls = st._metaBalls;
}

export function drawBgEffectsStack(tctx, W, H, t) {
  if (!st.bgFxStack || !st.bgFxStack.length) return;

  _ensureBgOffscreen(W, H);

  // Save current global bg runtime (single-effect mode)
  var saved = {
    bgFx: st.bgFx,
    bgParticles: st.bgParticles,
    bgSmokeParticles: st.bgSmokeParticles,
    bgStars: st.bgStars,
    bgStarsInit: st.bgStarsInit,
    _bgLastT: st._bgLastT,
    _bgAccShadow: st._bgAccShadow,
    _bgAccNature: st._bgAccNature,
    _bgAccCosmic: st._bgAccCosmic,
    _crystalPoints: st._crystalPoints,
    _metaBalls: st._metaBalls
  };

  for (var i=0;i<st.bgFxStack.length;i++) {
    var layer = st.bgFxStack[i];
    if (!layer || !layer.enabled || !layer.params || !layer.params.type) continue;

    // Bind per-layer runtime so layers don't overwrite each other's particles/state
    var rt = _ensureBgLayerRuntime(layer);
    _bindBgRuntime(rt);

    st.bgFx = layer.params;

    st._bgOffCtx.clearRect(0, 0, W, H);

    if (st.bgFx.warp !== 'none') {
      st._bgWarpOffCtx.clearRect(0, 0, W, H);
      drawBgFxCore(st._bgWarpOffCtx, W, H, t);
      applyWarp(st._bgOffCtx, st._bgWarpOff, W, H, t);
    } else {
      drawBgFxCore(st._bgOffCtx, W, H, t);
    }

    // Save runtime back to layer (particles advanced this frame)
    _saveBgRuntime(rt);

    tctx.save();
    tctx.globalCompositeOperation = (layer.params && layer.params.blend) || 'source-over';
    tctx.globalAlpha = (layer.opacity != null ? (+layer.opacity) : 1);
    tctx.drawImage(st._bgOff, 0, 0);
    tctx.restore();
  }

  // Restore global runtime
  st.bgFx = saved.bgFx;
  st.bgParticles = saved.bgParticles;
  st.bgSmokeParticles = saved.bgSmokeParticles;
  st.bgStars = saved.bgStars;
  st.bgStarsInit = saved.bgStarsInit;
  st._bgLastT = saved._bgLastT;
  st._bgAccShadow = saved._bgAccShadow;
  st._bgAccNature = saved._bgAccNature;
  st._bgAccCosmic = saved._bgAccCosmic;
  st._crystalPoints = saved._crystalPoints;
  st._metaBalls = saved._metaBalls;
}

export function drawBgEffectsAny(tctx, W, H, t) {
  if (st.bgFxStack && st.bgFxStack.length) drawBgEffectsStack(tctx, W, H, t);
  else drawBgEffects(tctx, W, H, t);
}


export function drawBgFxCore(tctx, W, H, t) {
  var intensity = (st.bgFx.intensity != null && isFinite(+st.bgFx.intensity)) ? +st.bgFx.intensity : 1.0;
  try {
    initParticleSprites();
    var dtMs = (t - st._bgLastT);
    if (!isFinite(dtMs) || dtMs <= 0) dtMs = 16;
    if (dtMs > 80) dtMs = 80;
    st._bgLastT = t;
    // Adaptive quality (spawn throttling) to avoid overload
    var pCount = (st.bgParticles ? st.bgParticles.length : 0) + (st.bgSmokeParticles ? st.bgSmokeParticles.length : 0);
    var q = 1;
    if (dtMs > 24) q *= 0.85;
    if (dtMs > 36) q *= 0.75;
    if (pCount > 120) q *= 0.85;
    if (pCount > 180) q *= 0.7;
    st.bgFx._dt = dtMs;
    st.bgFx._q = Math.max(0.55, Math.min(1, q));

    if      (st.bgFx.type === 'fire')      drawBgFire(tctx, W, H, t, intensity);
    else if (st.bgFx.type === 'cosmic')    drawBgCosmic(tctx, W, H, t, intensity);
    else if (st.bgFx.type === 'shadow')    drawBgShadow(tctx, W, H, t, intensity);
    else if (st.bgFx.type === 'nature')    drawBgNature(tctx, W, H, t, intensity);
    else if (st.bgFx.type === 'crystal')   drawBgCrystal(tctx, W, H, t, intensity);
    else if (st.bgFx.type === 'metaballs') drawBgMetaballs(tctx, W, H, t, intensity);
    else if (st.bgFx.type === 'smokering') drawBgSmokeRing(tctx, W, H, t, intensity);
    else if (st.bgFx.type === 'godrays')   drawBgGodRays(tctx, W, H, t, intensity);
    else if (st.bgFx.type === 'magma')     drawBgMagma(tctx, W, H, t, intensity);

    // Subtle vignette + center bloom for cohesion (cheap)
    if (st.bgFx.type) {
      var v = Math.min(0.22, 0.06 + (isFinite(intensity) ? intensity : 1) * 0.12);
      // Vignette
      var vg = tctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.15, W/2, H/2, Math.max(W,H)*0.65);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,'+v+')');
      tctx.save();
      tctx.globalCompositeOperation = 'source-over';
      tctx.fillStyle = vg;
      tctx.fillRect(0,0,W,H);
      tctx.restore();
      // Center bloom (user controlled)
      var b = Math.max(0, Math.min(1, (st.bgFx.centerBloomOpacity != null ? st.bgFx.centerBloomOpacity : 0)));
      if (b > 0.001) {
        var cHex = st.bgFx.centerBloomColor || '#ffffff';
        var rgb = hexToRgbArr(cHex).join(',');
        var bg = tctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.min(W,H)*0.28);
        bg.addColorStop(0, 'rgba('+rgb+','+(b*(isFinite(intensity)?intensity:1))+')');
        bg.addColorStop(1, 'rgba('+rgb+',0)');
        tctx.save();
        tctx.globalCompositeOperation = 'lighter';
        tctx.fillStyle = bg;
        tctx.fillRect(0,0,W,H);
        tctx.restore();
      }
    }
  } catch (e) {
    // Prevent a single bg FX error from killing the whole render loop (cards disappearing)
    console.error('Background FX error:', st.bgFx.type, e);
    st.bgFx.type = '';
    try { if (typeof syncBgFxUI === 'function') syncBgFxUI(); } catch(_) {}
    try { showToast('⚠ Background effect error — disabled'); } catch(_) {}
  }
}

// Returns the canvas rotation (radians) that makes effect gradients face the flow direction.
// "Up" is the natural direction (fire rises, nature falls from top), so up = 0 rotation.
export function getFlowRotation() {
  var m = st.bgFx.flowMode;
  // Left/right removed; keep visuals upright for top/bottom and only rotate when custom angle is used.
  if (m === 'angle') return (st.bgFx.flowAngle || 0) * Math.PI / 180;
  return 0;
}

// Helper: HSL to RGB array [0..255] — shared by bg-fx-crystal and bg-fx-metaballs
export function hslToRgb(h, s, l) {
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function hue2rgb(p2, q2, t2) {
      if (t2 < 0) t2 += 1; if (t2 > 1) t2 -= 1;
      if (t2 < 1/6) return p2 + (q2 - p2) * 6 * t2;
      if (t2 < 1/2) return q2;
      if (t2 < 2/3) return p2 + (q2 - p2) * (2/3 - t2) * 6;
      return p2;
    }
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

// ── Tick + draw background particles (shadow, nature, cosmic) ────────────

export function drawBgParticle(tctx, p2, age2, alpha, W, H, t) {
  // assumes alpha already clamped
  alpha *= focalMask(p2.x, p2.y, W, H, 0.32);

  if (p2.type === 'shadow') {
    var sc1 = st.bgFx.particleColor1 ? hexToRgbArr(st.bgFx.particleColor1).join(',') : '60,0,80';
    var sc2 = st.bgFx.particleColor2 ? hexToRgbArr(st.bgFx.particleColor2).join(',') : '20,0,30';
    if (_spriteMote) {
      var rr = p2.size * lifeSize(age2);
      var sz = rr * 2;
      tctx.save();
      tctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      tctx.drawImage(_spriteMote, p2.x - sz, p2.y - sz, sz*2, sz*2);

      // Soft radial tint instead of fillRect, so no rectangular artifact appears
      var tint = lerpColor(st.bgFx.particleColor1 || '#3c0050', st.bgFx.particleColor2 || st.bgFx.particleColor1 || '#14001e', (p2.mix != null ? p2.mix : 0.5));
      var tintRgb = hexToRgbArr(tint).join(',');
      var tg = tctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, sz);
      tg.addColorStop(0, 'rgba(' + tintRgb + ',' + Math.max(0, Math.min(1, alpha * 0.85)) + ')');
      tg.addColorStop(0.6, 'rgba(' + tintRgb + ',' + Math.max(0, Math.min(1, alpha * 0.35)) + ')');
      tg.addColorStop(1, 'rgba(' + tintRgb + ',0)');
      tctx.globalCompositeOperation = 'lighter';
      tctx.fillStyle = tg;
      tctx.beginPath();
      tctx.arc(p2.x, p2.y, sz, 0, Math.PI * 2);
      tctx.fill();

      tctx.restore();
      return;
    }
    var sg2 = tctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, p2.size * lifeSize(age2));
    sg2.addColorStop(0,   'rgba('+sc1+','+(alpha*0.7)+')');
    sg2.addColorStop(0.5, 'rgba('+sc2+','+(alpha*0.4)+')');
    sg2.addColorStop(1,   'rgba(0,0,0,0)');
    tctx.fillStyle = sg2;
    tctx.beginPath();
    tctx.arc(p2.x, p2.y, p2.size * lifeSize(age2), 0, Math.PI * 2);
    tctx.fill();
  } else if (p2.type === 'nature') {
    tctx.save();
    tctx.translate(p2.x, p2.y);
    tctx.rotate(p2.rot);
    // Glow via radial gradient halo (no shadowBlur)
    var glowCol = st.bgFx.particleColor1 || '#80cc40';
    var glowRgb = hexToRgbArr(glowCol).join(',');
    var glowR = (p2.size * lifeSize(age2)) * 2.5;
    var lg2 = tctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    lg2.addColorStop(0,   'rgba('+glowRgb+','+(alpha*0.45)+')');
    lg2.addColorStop(1,   'rgba('+glowRgb+',0)');
    tctx.fillStyle = lg2;
    tctx.beginPath(); tctx.arc(0, 0, glowR, 0, Math.PI * 2); tctx.fill();
    // Leaf shape
    tctx.fillStyle = p2.leafColor;
    tctx.beginPath();
    tctx.ellipse(0, 0, (p2.size * lifeSize(age2)) * 0.5, (p2.size * lifeSize(age2)), 0, 0, Math.PI * 2);
    tctx.fill();
    tctx.strokeStyle = 'rgba(255,255,200,0.3)';
    tctx.lineWidth = 0.5;
    tctx.beginPath(); tctx.moveTo(0, -(p2.size * lifeSize(age2))); tctx.lineTo(0, (p2.size * lifeSize(age2))); tctx.stroke();
    tctx.restore();
  } else if (p2.type === 'cosmic') {
    var c1 = st.bgFx.particleColor1 || p2.color;
    var c2 = st.bgFx.particleColor2 || c1;
    var baseHex = lerpColor(c1, c2, (p2.mix != null ? p2.mix : 0.5));
    var ccRgb = driftRgbArr(hexToRgbArr(baseHex), p2.hueDrift || 0).join(',');
    var cGlowR = ((p2.size * lifeSize(age2)) * (p2.spark ? 0.7 : 1)) * (1 - age2 * 0.4) * 4;
    if (p2.spark && _spriteSpark) {
      var ss = cGlowR;
      tctx.drawImage(_spriteSpark, p2.x - ss, p2.y - ss, ss*2, ss*2);
      return;
    }
    var cg2 = tctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, cGlowR);
    cg2.addColorStop(0,   'rgba('+ccRgb+','+alpha+')');
    cg2.addColorStop(0.3, 'rgba('+ccRgb+','+(alpha*0.5)+')');
    cg2.addColorStop(1,   'rgba('+ccRgb+',0)');
    tctx.fillStyle = cg2;
    tctx.beginPath();
    tctx.arc(p2.x, p2.y, cGlowR, 0, Math.PI * 2);
    tctx.fill();
  }
}


export function tickDrawBgParticles(tctx, W, H, t, dt) {
  // Update (single pass)
  for (var i = st.bgParticles.length - 1; i >= 0; i--) {
    var p2 = st.bgParticles[i];
    p2.life -= dt / 1000;
    if (p2.life <= 0 || p2.x < -80 || p2.x > W + 80 || p2.y < -80 || p2.y > H + 80) {
      st.bgParticles.splice(i, 1); continue;
    }

    var age2 = 1 - p2.life / p2.maxLife;
    var alpha = lifeAlpha(age2) * st.bgFx.intensity;
    if (p2.spark) alpha = Math.min(1, alpha * 1.25);
    alpha = Math.max(0, Math.min(1, alpha));

    // Depth layering (cheap parallax / hierarchy)
    var z = (p2.z != null) ? p2.z : 0.5;
    var zA = lerpNum(0.55, 1.0, z);
    var zSpd = lerpNum(0.75, 1.4, z);
    alpha *= zA;
    alpha = Math.max(0, Math.min(1, alpha));

    var pSway = (st.bgFx.flowMode === 'default') ? 0.4 : 0.05;
    p2.x += (p2.vx * zSpd) + Math.sin(t * 0.001 * st.bgFx.speed + p2.swayPhase) * (pSway * lerpNum(0.6, 1.4, z));
    p2.y += (p2.vy * zSpd);
    if (p2.rotV) p2.rot += p2.rotV;

    // Micro-flow (adds organic motion; very cheap)
    if (st.bgFx.flowMode === 'default' && (p2.type === 'cosmic' || p2.type === 'nature' || p2.type === 'shadow')) {
      applyMicroFlow(p2, W, H, t, 0.035 * st.bgFx.speed * lerpNum(0.7,1.2,z), 0.004);
    }

    // Cache draw params for batching
    p2._age2 = age2;
    p2._alpha = alpha;
  }

  // Draw normal particles
  tctx.save();
  tctx.globalCompositeOperation = st.bgFx.blend || 'source-over';
  for (var j = 0; j < st.bgParticles.length; j++) {
    var q = st.bgParticles[j];
    if (q.spark) continue;
    var a = q._alpha || 0;
    if (a <= 0) continue;
    tctx.globalAlpha = 1;
    drawBgParticle(tctx, q, q._age2 || 0, a, W, H, t);
  }
  tctx.restore();

  // Draw sparks (additive, batched)
  tctx.save();
  tctx.globalCompositeOperation = 'lighter';
  for (var k = 0; k < st.bgParticles.length; k++) {
    var s = st.bgParticles[k];
    if (!s.spark) continue;
    var sa = s._alpha || 0;
    if (sa <= 0) continue;
    tctx.globalAlpha = 1;
    drawBgParticle(tctx, s, s._age2 || 0, sa, W, H, t);
  }
  tctx.restore();
}


// ── WARP PASS ────────────────────────────────────────────────────────────
export function applyWarp(tctx, srcCanvas, W, H, t) {
  var maxDisp = 14;
  var amp = st.bgFx.warpAmp * 30 * st.bgFx.intensity;
  if (amp > maxDisp) amp = maxDisp;
  var freq = st.bgFx.warpFreq;
  var spd = st.bgFx.speed * 0.001;
  var sliceH = 4;
  for (var sy = 0; sy < H; sy += sliceH) {
    var offX = 0, offY = 0;
    var cx3 = W / 2, cy3 = H / 2;
    var dx = (W / 2 - (sy / H) * W * 0.5), dy = sy - cy3;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var ang = Math.atan2(dy, dx);

    if (st.bgFx.warp === 'ripple') {
      offX = Math.sin(sy * 0.04 * freq + t * spd * 3) * amp;
      offY = Math.cos(sy * 0.03 * freq + t * spd * 2) * amp * 0.3;
    } else if (st.bgFx.warp === 'vortex') {
      var vortAng = ang + dist * 0.004 * freq + t * spd * 2;
      offX = Math.cos(vortAng) * amp * 0.6 - Math.cos(ang) * amp * 0.6;
      offY = Math.sin(sy * 0.02 * freq + t * spd) * amp * 0.3;
    } else if (st.bgFx.warp === 'pulse') {
      var pAmp = amp * (0.5 + 0.5 * Math.sin(t * spd * 4));
      offX = Math.sin(sy * 0.05 * freq + t * spd * 2) * pAmp;
      offY = Math.cos(sy * 0.04 * freq) * pAmp * 0.2;
    }

    offX = Math.max(-amp, Math.min(amp, offX));
    offY = Math.max(-amp, Math.min(amp, offY));
    tctx.drawImage(srcCanvas,
      Math.round(offX), sy,
      W, Math.min(sliceH, H - sy),
      0, sy,
      W, Math.min(sliceH, H - sy)
    );
  }
}

