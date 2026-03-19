// ============================================================
//  ARCANA GLAM — Background FX: Nature  (bg-fx-nature.js)
//  Ground glow, will-o-wisps, leaf/spore particles.
// ============================================================

import { AppState as st } from './state.js';
import {
  getFlowRotation,
  spawnBgParticle,
  tickDrawBgParticles
} from './fx-engine.js';

export function drawBgNature(tctx, W, H, t, intensity) {
  // Soft ground glow — rotated to face flow direction
  var _nrot = getFlowRotation();
  tctx.save();
  if (_nrot !== 0) { tctx.translate(W/2, H/2); tctx.rotate(_nrot); tctx.translate(-W/2, -H/2); }
  var gg = tctx.createLinearGradient(0, H, 0, H * 0.5);
  gg.addColorStop(0,   'rgba(20,80,10,' + (0.3 * intensity) + ')');
  gg.addColorStop(0.5, 'rgba(30,60,5,' + (0.12 * intensity) + ')');
  gg.addColorStop(1,   'rgba(0,0,0,0)');
  tctx.fillStyle = gg; tctx.fillRect(0, 0, W, H);
  tctx.restore();

  // Will-o-wisps
  for (var oi = 0; oi < 5; oi++) {
    var ox = W * (0.1 + oi * 0.18) + Math.sin(t * 0.0006 * st.bgFx.speed + oi * 1.7) * W * 0.07;
    var oy = H * (0.3 + 0.4 * Math.sin(t * 0.0004 * st.bgFx.speed + oi * 2.3));
    var or2 = W * 0.05 * (0.8 + 0.2 * Math.sin(t * 0.001 + oi));
    var opulse = 0.6 + 0.4 * Math.sin(t * 0.0012 * st.bgFx.speed + oi);
    var og = tctx.createRadialGradient(ox, oy, 0, ox, oy, or2);
    og.addColorStop(0,   'rgba(120,220,80,' + (0.35 * intensity * opulse) + ')');
    og.addColorStop(0.4, 'rgba(60,160,30,' + (0.15 * intensity) + ')');
    og.addColorStop(1,   'rgba(0,0,0,0)');
    tctx.fillStyle = og; tctx.fillRect(0, 0, W, H);
  }

  // Leaf/spore particles
  var lSpawn = Math.round(intensity * st.bgFx.windStrength * 2);
  for (var li = 0; li < lSpawn; li++) {
    if (st.bgParticles.length < 90) {
      var lp = spawnBgParticle(W, H, t);
      if (lp) { lp.maxLife = lp.life; st.bgParticles.push(lp); }
    }
  }
  tickDrawBgParticles(tctx, W, H, t, (st.bgFx._dt || 16));
}
