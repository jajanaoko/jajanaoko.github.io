// ============================================================
//  ARCANA GLAM — Background FX: Cosmic  (bg-fx-cosmic.js)
//  fBm nebula clouds, drifting stars, moon, shooting star.
// ============================================================

import { AppState as st } from './state.js';
import {
  lerp as lerpNum,
  hexToRgbArr,
  initBgStars,
  fbm2,
  warpedFbm,
  tickDrawBgParticles,
  applyFlowToParticle
} from './fx-engine.js';

export function drawBgCosmic(tctx, W, H, t, intensity) {
  if (!st.bgStarsInit) initBgStars(W, H);

  var spd    = st.bgFx.speed;
  var bloom  = st.bgFx.nebulaBloom != null ? st.bgFx.nebulaBloom : 1.0;
  var depth  = Math.round(st.bgFx.nebulaDensity != null ? 2 + st.bgFx.nebulaDensity * 3 : 3);
  var drift  = st.bgFx.nebulaDrift != null ? st.bgFx.nebulaDrift : 0.15;
  var ts     = t * 0.00006 * spd;

  var colA = st.bgFx.particleColor1 ? hexToRgbArr(st.bgFx.particleColor1) : [80,  0, 140];
  var colB = st.bgFx.particleColor2 ? hexToRgbArr(st.bgFx.particleColor2) : [ 0, 45, 130];
  var colC = [Math.round((colA[0]+colB[0])*0.4), Math.round((colA[1]+colB[1])*0.3 + 40), Math.round((colA[2]+colB[2])*0.5)];
  var palette = [colA, colB, colC];

  // ── Nebula v2: fBm-driven drifting cloud layers ──────────────────────
  tctx.save();
  tctx.globalCompositeOperation = 'screen';
  for (var li = 0; li < depth; li++) {
    var layerCol = palette[li % palette.length];
    var layerScale  = 0.8 + li * 0.35;
    var layerOpacity = (0.20 - li * 0.035) * intensity * bloom;
    var blobsPerLayer = 3 + (depth > 2 ? 1 : 0);
    for (var bi = 0; bi < blobsPerLayer; bi++) {
      var bBase = bi / blobsPerLayer;
      var fbmX  = fbm2(bBase * 3.1 + li * 1.7 + ts * 0.4, ts * 0.6) * drift;
      var fbmY  = fbm2(bBase * 2.3 + li * 2.1 + ts * 0.35, ts * 0.5 + 1.5) * drift;
      var bx = (0.1 + bBase * 0.8 + fbmX) * W;
      var by = (0.15 + (li / Math.max(depth-1,1)) * 0.7 + fbmY) * H;
      var pulse = 0.82 + 0.18 * Math.sin(ts * 1.3 + bi * 2.1 + li * 0.8);
      var br    = W * (0.28 + li * 0.12 + bi * 0.04) * bloom * layerScale * pulse;
      var warpX = warpedFbm(bx/W*2 + ts*0.3, ts*0.2) * W * 0.06;
      var warpY = warpedFbm(by/H*2 + ts*0.25 + 5, ts*0.18) * H * 0.06;
      var cx2 = bx + warpX, cy2 = by + warpY;
      var ng = tctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, br);
      ng.addColorStop(0,    'rgba('+layerCol[0]+','+layerCol[1]+','+layerCol[2]+','+(layerOpacity * 1.4)+')');
      ng.addColorStop(0.35, 'rgba('+layerCol[0]+','+layerCol[1]+','+layerCol[2]+','+(layerOpacity * 0.7)+')');
      ng.addColorStop(0.7,  'rgba('+layerCol[0]+','+layerCol[1]+','+layerCol[2]+','+(layerOpacity * 0.25)+')');
      ng.addColorStop(1,    'rgba('+layerCol[0]+','+layerCol[1]+','+layerCol[2]+',0)');
      tctx.fillStyle = ng;
      tctx.fillRect(0, 0, W, H);
    }
  }
  tctx.restore();

  // Stars — glow via radial gradient
  st.bgStars.forEach(function(s) {
    var z = (s.z != null) ? s.z : 0.5;
    var tw = 0.55 + 0.45 * Math.sin((t * 0.001) * (0.9 + 0.6 * z) + (s.twPhase||0));
    var zA = lerpNum(0.35, 1.0, z);
    s.x += 0.015 * s.speed * st.bgFx.speed * lerpNum(0.4, 1.2, z);
    s.y += 0.004 * s.speed * st.bgFx.speed * lerpNum(0.3, 0.9, z);
    if (s.x > W+10) s.x = -10; if (s.x < -10) s.x = W+10;
    if (s.y > H+10) s.y = -10; if (s.y < -10) s.y = H+10;
    var sAlpha = tw * intensity * 0.9 * zA;
    var sR = s.r * (0.7 + 0.3 * tw);
    var sGlowR = sR + s.r * 3;
    var sRgb = hexToRgbArr(s.color).join(',');
    tctx.save();
    tctx.globalAlpha = 1;
    var sg = tctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sGlowR);
    sg.addColorStop(0,   'rgba(255,255,255,'+sAlpha+')');
    sg.addColorStop(sR / sGlowR, 'rgba('+sRgb+','+sAlpha+')');
    sg.addColorStop(1,   'rgba('+sRgb+',0)');
    tctx.fillStyle = sg;
    tctx.beginPath();
    tctx.arc(s.x, s.y, sGlowR, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();
  });

  // Shooting star
  var sst = (t * 0.0003 * st.bgFx.speed) % 1;
  if (sst < 0.08) {
    var sp = sst / 0.08;
    var sx1 = W * 0.8 - sp * W * 0.6, sy1 = H * 0.1 + sp * H * 0.15;
    tctx.save();
    tctx.globalAlpha = Math.sin(sp * Math.PI) * intensity * 0.9;
    tctx.strokeStyle = 'rgba(200,230,255,0.9)';
    tctx.lineWidth = 2;
    tctx.beginPath();
    tctx.moveTo(sx1, sy1);
    tctx.lineTo(sx1 + 30, sy1 - 14);
    tctx.stroke();
    tctx.restore();
  }

  // Moon
  var moonX = W * 0.78, moonY = H * 0.18;
  var moonR = Math.min(W, H) * 0.07 * st.bgFx.moonSize;
  var moonPulse = 1 + 0.04 * Math.sin(t * 0.0006 * st.bgFx.speed);
  tctx.save();
  tctx.globalAlpha = intensity * 0.85;
  var moonGlow = tctx.createRadialGradient(moonX, moonY, moonR * 0.6, moonX, moonY, moonR * 3 * moonPulse);
  moonGlow.addColorStop(0,   'rgba(200,220,255,0.18)');
  moonGlow.addColorStop(0.4, 'rgba(180,200,255,0.08)');
  moonGlow.addColorStop(1,   'rgba(180,200,255,0)');
  tctx.fillStyle = moonGlow;
  tctx.fillRect(moonX - moonR * 3, moonY - moonR * 3, moonR * 6, moonR * 6);
  var moonFill = tctx.createRadialGradient(moonX - moonR * 0.25, moonY - moonR * 0.25, 0, moonX, moonY, moonR);
  moonFill.addColorStop(0, 'rgba(255,255,240,1)');
  moonFill.addColorStop(0.7, 'rgba(220,230,255,1)');
  moonFill.addColorStop(1, 'rgba(180,200,240,0.9)');
  tctx.fillStyle = moonFill;
  tctx.beginPath();
  tctx.arc(moonX, moonY, moonR * moonPulse, 0, Math.PI * 2);
  tctx.fill();
  tctx.restore();

  // Moonbeam rays
  tctx.save();
  tctx.globalAlpha = 0.07 * intensity * moonPulse;
  for (var ri = 0; ri < 8; ri++) {
    var rayAngle = ri * Math.PI / 4 + t * 0.0001 * st.bgFx.speed;
    var rayLen = Math.min(W, H) * 0.45;
    var rx2 = moonX + Math.cos(rayAngle) * moonR;
    var ry2 = moonY + Math.sin(rayAngle) * moonR;
    var rg = tctx.createLinearGradient(rx2, ry2, rx2 + Math.cos(rayAngle) * rayLen, ry2 + Math.sin(rayAngle) * rayLen);
    rg.addColorStop(0, 'rgba(200,220,255,0.4)');
    rg.addColorStop(1, 'rgba(200,220,255,0)');
    tctx.strokeStyle = rg;
    tctx.lineWidth = 2 + ri % 2;
    tctx.beginPath();
    tctx.moveTo(rx2, ry2);
    tctx.lineTo(rx2 + Math.cos(rayAngle) * rayLen, ry2 + Math.sin(rayAngle) * rayLen);
    tctx.stroke();
  }
  tctx.restore();

  // Cosmic dust particles
  var rate = (intensity * 1.5) * 60 * (st.bgFx._q || 1);
  st._bgAccCosmic += rate * ((st.bgFx._dt || 16) / 1000);
  var dustSpawn = Math.floor(st._bgAccCosmic);
  if (dustSpawn > 12) dustSpawn = 12;
  st._bgAccCosmic -= dustSpawn;
  for (var di = 0; di < dustSpawn; di++) {
    if (st.bgParticles.length < 50) {
      var cSpd = (0.2 + Math.random() * 0.6) * st.bgFx.speed;
      var cp = {
        x: Math.random() * W, y: H + 10,
        vx: (Math.random() - 0.5) * 0.3 * st.bgFx.speed,
        vy: -cSpd,
        life: 6 + Math.random() * 8, maxLife: 0,
        size: 1 + Math.random() * 3,
        type: 'cosmic',
        z: Math.random(),
        mix: Math.random(), hueDrift: (Math.random()*2 - 1) * 10, spark: (Math.random() < 0.04),
        color: Math.random() < 0.5 ? '#aabbff' : '#ffccff',
        swayPhase: Math.random() * Math.PI * 2
      };
      if (st.bgFx.flowMode !== 'default') { cp.vx = 0; cp.vy = 0; }
      applyFlowToParticle(cp, W, H, cSpd);
      var zS3 = lerpNum(0.7, 1.35, cp.z);
      cp.size *= zS3;
      cp.vx *= lerpNum(0.75, 1.4, cp.z);
      cp.vy *= lerpNum(0.75, 1.4, cp.z);
      cp.maxLife = cp.life;
      st.bgParticles.push(cp);
    }
  }
  tickDrawBgParticles(tctx, W, H, t, (st.bgFx._dt || 16));
}
