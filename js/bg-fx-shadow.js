// ============================================================
//  ARCANA GLAM — Background FX: Shadow  (bg-fx-shadow.js)
//  Vignette, floor creep, ceiling tendrils, wisps + particles.
// ============================================================

import { AppState as st } from './state.js';
import {
  hexToRgbArr,
  spawnBgParticle,
  tickDrawBgParticles
} from './fx-engine.js';

export function drawBgShadow(tctx, W, H, t, intensity) {
  if (!st.bgParticles) st.bgParticles = [];
  var pulse = 0.7 + 0.3 * Math.sin(t * 0.0015 * st.bgFx.speed * st.bgFx.shadowPulse);
  var shA = hexToRgbArr(st.bgFx.particleColor1 || '#640096').join(',');
  var shB = hexToRgbArr(st.bgFx.particleColor2 || '#28003c').join(',');

  // Deep vignette
  var vig = tctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
  vig.addColorStop(0,   'rgba(0,0,0,0)');
  vig.addColorStop(0.5, 'rgba(0,0,0,' + (0.2 * intensity * st.bgFx.shadowDepth) + ')');
  vig.addColorStop(1,   'rgba(0,0,0,' + (0.7 * intensity * st.bgFx.shadowDepth * pulse) + ')');
  tctx.fillStyle = vig;
  tctx.fillRect(0, 0, W, H);

  // Shadow floor creep
  var floorRise = H * (0.28 + 0.14 * st.bgFx.shadowDepth);
  var floorWave = Math.sin(t * 0.0006 * st.bgFx.speed) * H * 0.03;
  var floorGrad = tctx.createLinearGradient(0, H, 0, H - floorRise - floorWave);
  floorGrad.addColorStop(0,   'rgba('+shB+',' + (0.7 * intensity * st.bgFx.shadowDepth) + ')');
  floorGrad.addColorStop(0.4, 'rgba('+shA+',' + (0.35 * intensity) + ')');
  floorGrad.addColorStop(1,   'rgba(0,0,0,0)');
  tctx.fillStyle = floorGrad;
  tctx.fillRect(0, 0, W, H);

  // Ceiling shadow
  var ceilRise = H * (0.18 + 0.08 * st.bgFx.shadowDepth);
  var ceilGrad = tctx.createLinearGradient(0, 0, 0, ceilRise);
  ceilGrad.addColorStop(0,   'rgba('+shB+',' + (0.5 * intensity * st.bgFx.shadowDepth) + ')');
  ceilGrad.addColorStop(0.5, 'rgba('+shA+',' + (0.2 * intensity) + ')');
  ceilGrad.addColorStop(1,   'rgba(0,0,0,0)');
  tctx.fillStyle = ceilGrad;
  tctx.fillRect(0, 0, W, H);

  // Drifting shadow tendrils
  for (var ti = 0; ti < 6; ti++) {
    var tx2 = W * (0.08 + ti * 0.16)
      + Math.sin(t * 0.0005 * st.bgFx.speed + ti * 1.3) * W * 0.09
      + Math.sin(t * 0.0013 * st.bgFx.speed + ti * 2.8) * W * 0.04;
    var ty2 = H * (0.3 + 0.4 * ((ti % 2 === 0) ? 0.5 : 0.7))
      + Math.cos(t * 0.0007 * st.bgFx.speed + ti * 0.9) * H * 0.22
      + Math.sin(t * 0.0011 * st.bgFx.speed + ti * 3.1) * H * 0.09;
    var tr2 = W * (0.12 + 0.07 * Math.sin(t * 0.001 + ti)) * st.bgFx.shadowDepth;
    var tg = tctx.createRadialGradient(tx2, ty2, 0, tx2, ty2, tr2 * pulse);
    tg.addColorStop(0,   'rgba('+shB+',' + (0.38 * intensity * st.bgFx.shadowDepth) + ')');
    tg.addColorStop(0.5, 'rgba('+shA+',' + (0.18 * intensity) + ')');
    tg.addColorStop(1,   'rgba(0,0,0,0)');
    tctx.fillStyle = tg;
    tctx.fillRect(0, 0, W, H);
  }

  // Ceiling micro-tendrils
  for (var ti2 = 0; ti2 < 4; ti2++) {
    var ctx2 = W * (0.15 + ti2 * 0.22)
      + Math.sin(t * 0.0004 * st.bgFx.speed + ti2 * 1.9) * W * 0.07;
    var cty2 = H * 0.12 + Math.sin(t * 0.0009 * st.bgFx.speed + ti2 * 2.2) * H * 0.1;
    var ctr2 = W * (0.09 + 0.04 * Math.sin(t * 0.0012 + ti2)) * st.bgFx.shadowDepth;
    var ctg = tctx.createRadialGradient(ctx2, cty2, 0, ctx2, cty2, ctr2 * pulse);
    ctg.addColorStop(0,   'rgba('+shB+',' + (0.3 * intensity * st.bgFx.shadowDepth) + ')');
    ctg.addColorStop(0.55,'rgba('+shA+',' + (0.12 * intensity) + ')');
    ctg.addColorStop(1,   'rgba(0,0,0,0)');
    tctx.fillStyle = ctg;
    tctx.fillRect(0, 0, W, H);
  }

  // Eerie wisps
  for (var wi = 0; wi < 4; wi++) {
    var wx2 = W * (0.2 + wi * 0.2)
      + Math.sin(t * 0.0006 * st.bgFx.speed + wi) * W * 0.1
      + Math.sin(t * 0.0014 * st.bgFx.speed + wi * 2.3) * W * 0.04;
    var wy2 = H * 0.4 + Math.sin(t * 0.0009 * st.bgFx.speed + wi * 2.1) * H * 0.25;
    var wg = tctx.createRadialGradient(wx2, wy2, 0, wx2, wy2, W * 0.14 * pulse);
    wg.addColorStop(0,  'rgba('+shA+',' + (0.18 * intensity * st.bgFx.shadowDepth) + ')');
    wg.addColorStop(0.6,'rgba('+shB+',' + (0.08 * intensity) + ')');
    wg.addColorStop(1,  'rgba(0,0,0,0)');
    tctx.fillStyle = wg;
    tctx.fillRect(0, 0, W, H);
  }

  // Shadow particles
  var sSpawn = Math.round(intensity * st.bgFx.shadowDepth * 2);
  for (var ssi = 0; ssi < sSpawn; ssi++) {
    if (st.bgParticles.length < 50) {
      var sp2 = spawnBgParticle(W, H, t);
      if (sp2) { sp2.maxLife = sp2.life; st.bgParticles.push(sp2); }
    }
  }
  tickDrawBgParticles(tctx, W, H, t, (st.bgFx._dt || 16));
}
