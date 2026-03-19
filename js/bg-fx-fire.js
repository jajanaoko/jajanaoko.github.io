// ============================================================
//  ARCANA GLAM — Background FX: Fire  (bg-fx-fire.js)
// ============================================================

import { AppState as st } from './state.js';
import {
  lerp as lerpNum,
  hexToRgbArr,
  lifeAlpha,
  applyMicroFlow,
  smokeColor,
  FIRE_PALETTES,
  spawnFlame,
  spawnSmoke,
  initParticleSprites
} from './fx-engine.js';

export function drawBgFire(tctx, W, H, t, intensity) {
  var spd = st.bgFx.speed;
  initParticleSprites();
  var heat = st.bgFx.fireHeat;
  var useCustom = !!(st.bgFx.particleColor1);
  var bgPal = FIRE_PALETTES[st.bgFx.firePalette || 'fire'];

  // ── Layer 1: Deep heat bed ───────────────────────────────────────────
  tctx.save();
  tctx.globalCompositeOperation = 'screen';
  var bedH = H * (0.38 + st.bgFx.fireHeight * 0.45);
  var bed = tctx.createLinearGradient(0, H, 0, H - bedH);
  if (useCustom) {
    var c1b = hexToRgbArr(st.bgFx.particleColor1);
    bed.addColorStop(0,   'rgba('+c1b[0]+','+c1b[1]+','+c1b[2]+','+(0.9*intensity)+')');
    bed.addColorStop(0.5, 'rgba('+c1b[0]+','+Math.floor(c1b[1]*0.5)+','+Math.floor(c1b[2]*0.3)+','+(0.5*intensity)+')');
    bed.addColorStop(1,   'rgba(0,0,0,0)');
  } else {
    bed.addColorStop(0,   'rgba('+bgPal.tip[0]+','+bgPal.tip[1]+','+bgPal.tip[2]+','+(0.88*intensity)+')');
    bed.addColorStop(0.3, 'rgba('+bgPal.mid[0]+','+bgPal.mid[1]+','+bgPal.mid[2]+','+(0.55*intensity)+')');
    bed.addColorStop(0.65,'rgba('+bgPal.core[0]+','+bgPal.core[1]+','+bgPal.core[2]+','+(0.22*intensity)+')');
    bed.addColorStop(1,   'rgba(0,0,0,0)');
  }
  tctx.fillStyle = bed;
  tctx.fillRect(0, 0, W, H);
  tctx.restore();

  // ── Layer 2: Flame particles — large rising radial gradients ─────────
  var flameCount = 0, emberCount = 0;
  for (var pi = 0; pi < st.bgParticles.length; pi++) {
    if (st.bgParticles[pi].type === 'flame') flameCount++;
    else if (st.bgParticles[pi].type === 'ember') emberCount++;
  }
  var flameTarget = Math.round(55 + heat * 90 + intensity * 35);
  var flameSpawnN = Math.round(intensity * heat * 8);
  for (var fs = 0; fs < flameSpawnN; fs++) {
    if (flameCount >= flameTarget) break;
    var fp = spawnFlame(W, H);
    fp.type  = 'flame';
    fp.maxLife = fp.life;
    fp.size  = W * (0.038 + Math.random() * 0.052) * (0.5 + heat * 0.7);
    fp.palette = st.bgFx.firePalette || 'fire';
    st.bgParticles.push(fp);
    flameCount++;
  }

  tctx.save();
  tctx.globalCompositeOperation = 'screen';
  for (var fi = st.bgParticles.length - 1; fi >= 0; fi--) {
    var fp2 = st.bgParticles[fi];
    if (fp2.type !== 'flame') continue;
    fp2.life -= 16 / 1000;
    if (fp2.life <= 0) { st.bgParticles.splice(fi, 1); continue; }
    var fAge = 1 - fp2.life / fp2.maxLife;
    var fz   = (fp2.z != null) ? fp2.z : 0.5;
    var fzSpd = lerpNum(0.75, 1.35, fz);
    fp2.vy -= 0.025 * spd;
    fp2.vx += (Math.random() - 0.5) * heat * 0.22 * spd;
    fp2.vx *= 0.97;
    fp2.x  += fp2.vx * fzSpd + Math.sin(t * 0.0005 * spd + fp2.swayPhase) * 0.7 * spd;
    fp2.y  += fp2.vy * fzSpd;

    var fzS = lerpNum(0.7, 1.35, fz);
    var r   = fp2.size * (1 - fAge * 0.55) * fzS;
    if (r < 2) continue;

    var hot = Math.max(0, 1 - fAge * 1.5);
    var fPal = FIRE_PALETTES[fp2.palette || 'fire'];
    var cR = Math.round(fPal.core[0] * hot + fPal.mid[0] * (1 - hot));
    var cG = Math.round(fPal.core[1] * hot + fPal.mid[1] * (1 - hot));
    var cB = Math.round(fPal.core[2] * hot + fPal.mid[2] * (1 - hot));

    var fzA = lerpNum(0.45, 1.0, fz);
    var fAlpha = fAge < 0.08
      ? (fAge / 0.08) * 0.88 * intensity * fzA
      : (1 - (fAge - 0.08) / 0.92) * 0.88 * intensity * fzA;
    fAlpha = Math.max(0, fAlpha);
    if (fAlpha < 0.01) continue;

    var hotOffY = -r * 0.22;
    var fg2 = tctx.createRadialGradient(fp2.x, fp2.y + hotOffY, r * 0.05, fp2.x, fp2.y + hotOffY, r);
    fg2.addColorStop(0,    'rgba(255,255,220,' + Math.min(1, fAlpha * 1.2) + ')');
    fg2.addColorStop(0.18, 'rgba(' + cR + ',' + cG + ',' + cB + ',' + fAlpha + ')');
    fg2.addColorStop(0.55, 'rgba(' + fPal.tip[0] + ',' + fPal.tip[1] + ',' + fPal.tip[2] + ',' + (fAlpha * 0.5) + ')');
    fg2.addColorStop(1,    'rgba(0,0,0,0)');
    tctx.fillStyle = fg2;
    tctx.beginPath();
    tctx.arc(fp2.x, fp2.y, r, 0, Math.PI * 2);
    tctx.fill();

    if (fp2.life < fp2.maxLife * 0.3 && Math.random() < 0.07 * heat) {
      var eb = {
        type: 'ember', x: fp2.x, y: fp2.y,
        vx: fp2.vx + (Math.random() - 0.5) * 2.2,
        vy: fp2.vy - Math.random() * 1.8,
        life: 0.5 + Math.random() * 0.9, maxLife: 0,
        size: (2 + Math.random() * 3.5 * heat) * fzS,
        z: fz, swayPhase: Math.random() * Math.PI * 2, swaySpeed: 2 + Math.random() * 2
      };
      eb.maxLife = eb.life;
      st.bgParticles.push(eb);
    }
  }
  tctx.restore();

  // ── Layer 3: Smoke puffs ─────────────────────────────────────────────
  var smokeSpawn = Math.round(intensity * st.bgFx.smokeAmount * 2.5);
  for (var ss = 0; ss < smokeSpawn; ss++) {
    if (st.bgSmokeParticles.length < Math.round(50 * st.bgFx.smokeAmount)) {
      var sm = spawnSmoke(W, H);
      sm.maxLife = sm.life;
      st.bgSmokeParticles.push(sm);
    }
  }
  tctx.save();
  tctx.globalCompositeOperation = 'multiply';
  for (var si2 = st.bgSmokeParticles.length - 1; si2 >= 0; si2--) {
    var sm2 = st.bgSmokeParticles[si2];
    sm2.life -= 16 / 1000;
    if (sm2.life <= 0) { st.bgSmokeParticles.splice(si2, 1); continue; }
    var sAge = 1 - sm2.life / sm2.maxLife;
    var sAlpha = sAge < 0.12
      ? (sAge / 0.12) * 0.45 * intensity * st.bgFx.smokeAmount
      : (1 - (sAge - 0.12) / 0.88) * 0.45 * intensity * st.bgFx.smokeAmount;
    sAlpha = Math.max(0, sAlpha);
    var sz = (sm2.z != null) ? sm2.z : 0.5;
    var szA = lerpNum(0.45, 1.0, sz);
    var szSpd = lerpNum(0.75, 1.35, sz);
    var szS = lerpNum(0.7, 1.35, sz);
    sAlpha *= szA;
    var sSize = sm2.size * (1 + sAge * 1.8) * szS;
    var smokeSway = (st.bgFx.flowMode === 'default') ? 0.6 : 0.1;
    if (st.bgFx.flowMode === 'default') applyMicroFlow(sm2, W, H, t, 0.025 * spd * lerpNum(0.7,1.2,sz), 0.003);
    sm2.x += sm2.vx * szSpd + Math.sin(t * 0.0003 * spd + sm2.swayPhase) * (smokeSway * lerpNum(0.6,1.4,sz));
    sm2.y += sm2.vy * szSpd;
    sm2.rot += sm2.rotV;
    var sRgb = smokeColor(sAge, useCustom);
    var sg = tctx.createRadialGradient(sm2.x, sm2.y, 0, sm2.x, sm2.y, sSize);
    sg.addColorStop(0,    'rgba('+sRgb+','+sAlpha+')');
    sg.addColorStop(0.45, 'rgba('+sRgb+','+(sAlpha*0.55)+')');
    sg.addColorStop(1,    'rgba('+sRgb+',0)');
    tctx.fillStyle = sg;
    tctx.save();
    tctx.translate(sm2.x, sm2.y); tctx.rotate(sm2.rot); tctx.translate(-sm2.x, -sm2.y);
    tctx.beginPath();
    tctx.arc(sm2.x, sm2.y, sSize, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();
  }
  tctx.restore();

  // ── Layer 4: Ember sparks ─────────────────────────────────────────────
  var emberSpawnN = Math.round(intensity * heat * 4);
  for (var es = 0; es < emberSpawnN; es++) {
    if (emberCount >= Math.round(80 * heat)) break;
    var em = spawnFlame(W, H);
    em.type = 'ember';
    em.size = (2 + Math.random() * 5 * heat) * lerpNum(0.7, 1.35, Math.random());
    em.life = 0.6 + Math.random() * 1.2;
    em.maxLife = em.life;
    em.z = Math.random();
    em.vy *= 1.5;
    st.bgParticles.push(em);
    emberCount++;
  }
  tctx.save();
  tctx.globalCompositeOperation = 'screen';
  for (var ei = st.bgParticles.length - 1; ei >= 0; ei--) {
    var em2 = st.bgParticles[ei];
    if (em2.type !== 'ember') continue;
    em2.life -= 16 / 1000;
    if (em2.life <= 0) { st.bgParticles.splice(ei, 1); continue; }
    var eAge = 1 - em2.life / em2.maxLife;
    var ez   = (em2.z != null) ? em2.z : 0.5;
    var ezSpd = lerpNum(0.75, 1.4, ez);
    var ezS  = lerpNum(0.7, 1.35, ez);
    var ezA  = lerpNum(0.55, 1.0, ez);
    var eAlpha = lifeAlpha(eAge) * intensity * ezA;
    if (st.bgFx.flowMode === 'default') applyMicroFlow(em2, W, H, t, 0.04 * spd * lerpNum(0.7,1.25,ez), 0.004);
    var eHot = Math.max(0, 1 - eAge * 1.4);
    var eSway = (st.bgFx.flowMode === 'default') ? 1.2 : 0.2;
    em2.x += em2.vx * ezSpd + Math.sin(t * 0.001 * spd * (em2.swaySpeed||2) + em2.swayPhase) * (eSway * lerpNum(0.6,1.4,ez));
    em2.y += em2.vy * ezSpd;
    em2.vy += (st.bgFx.flowMode === 'default') ? 0.04 : 0;

    var eSize = em2.size * (1 - eAge * 0.6) * ezS;
    var eRgb = useCustom && st.bgFx.particleColor1 ? hexToRgbArr(st.bgFx.particleColor1).join(',') : '255,' + Math.floor(100 + 155*eHot) + ',0';
    var r0 = eSize * 2.2;
    tctx.globalAlpha = Math.max(0, Math.min(1, eAlpha));
    var eSpd2 = Math.sqrt(em2.vx*em2.vx + em2.vy*em2.vy);
    if (eSpd2 > 0.3) {
      var tLen = eSpd2 * 7 * (1 - eAge * 0.6);
      var tAng = Math.atan2(-em2.vy, -em2.vx);
      var tG = tctx.createLinearGradient(em2.x, em2.y, em2.x + Math.cos(tAng)*tLen, em2.y + Math.sin(tAng)*tLen);
      tG.addColorStop(0, 'rgba('+eRgb+','+Math.min(1, eAlpha*0.85)+')');
      tG.addColorStop(1, 'rgba('+eRgb+',0)');
      tctx.strokeStyle = tG;
      tctx.lineWidth = Math.max(0.5, eSize * 0.45);
      tctx.lineCap = 'round';
      tctx.beginPath();
      tctx.moveTo(em2.x, em2.y);
      tctx.lineTo(em2.x + Math.cos(tAng)*tLen, em2.y + Math.sin(tAng)*tLen);
      tctx.stroke();
    }
    var eg = tctx.createRadialGradient(em2.x, em2.y, 0, em2.x, em2.y, r0);
    eg.addColorStop(0,   'rgba(255,220,140,'+eAlpha+')');
    eg.addColorStop(0.4, 'rgba('+eRgb+','+(eAlpha*0.8)+')');
    eg.addColorStop(1,   'rgba('+eRgb+',0)');
    tctx.fillStyle = eg;
    tctx.beginPath();
    tctx.arc(em2.x, em2.y, r0, 0, Math.PI * 2);
    tctx.fill();
  }
  tctx.globalAlpha = 1;
  tctx.restore();
}
