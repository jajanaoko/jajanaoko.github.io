// ============================================================
//  ARCANA GLAM — Background FX: Metaballs  (bg-fx-metaballs.js)
//  Overlapping radial gradients with screen blend for organic
//  metaball look without pixel-level math.
// ============================================================

import { AppState as st } from './state.js';
import {
  lerp as lerpNum,
  hexToRgbArr,
  getFlowRotation,
  hslToRgb
} from './fx-engine.js';

export function initMetaBalls() {
  st._metaBalls = [];
  var count = Math.round(4 + (st.bgFx.metaCount || 0.5) * 6);
  for (var i = 0; i < count; i++) {
    var spd = 0.1 + Math.random() * 0.3;
    st._metaBalls.push({
      cx: Math.random(), cy: Math.random(),
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * spd, vy: (Math.random() - 0.5) * spd,
      r: 0.08 + Math.random() * 0.18,
      z: Math.random(),
      hue: Math.random() * 360,
      freqX: 0.5 + Math.random() * 1.5, freqY: 0.5 + Math.random() * 1.5,
      phaseX: Math.random() * Math.PI * 2, phaseY: Math.random() * Math.PI * 2,
      ampX: 0.05 + Math.random() * 0.2, ampY: 0.05 + Math.random() * 0.2
    });
  }
}

export function drawBgMetaballs(tctx, W, H, t, intensity) {
  var spd = st.bgFx.speed;
  if (!st._metaBalls || st._metaBalls.length === 0) initMetaBalls();

  var useCustom = !!(st.bgFx.particleColor1);
  var col1 = useCustom ? hexToRgbArr(st.bgFx.particleColor1) : null;
  var col2 = (useCustom && st.bgFx.particleColor2) ? hexToRgbArr(st.bgFx.particleColor2) : null;
  var ts = t * 0.001 * spd;
  var mode = st.bgFx.flowMode; if (mode === 'left' || mode === 'right') mode = 'default';

  var _rot = getFlowRotation();
  tctx.save();
  if (_rot !== 0) { tctx.translate(W/2, H/2); tctx.rotate(_rot); tctx.translate(-W/2, -H/2); }
  tctx.globalCompositeOperation = st.bgFx.blend || 'screen';

  var minDim = Math.min(W, H);
  for (var bi = 0; bi < st._metaBalls.length; bi++) {
    var ball = st._metaBalls[bi];
    var z = (ball.z != null) ? ball.z : 0.5;
    var zA = lerpNum(0.55, 1.0, z);
    var zS = lerpNum(0.7, 1.35, z);
    var zSpd = lerpNum(0.75, 1.4, z);
    ball.hue = (ball.hue + 0.08 * spd) % 360;

    var bx, by;
    if (mode === 'default') {
      bx = (ball.cx + Math.sin(ts * ball.freqX + ball.phaseX) * ball.ampX) * W;
      by = (ball.cy + Math.cos(ts * ball.freqY + ball.phaseY) * ball.ampY) * H;
    } else {
      if (ball.x == null) {
        ball.x = Math.random() * W;
        ball.y = Math.random() * H;
        if (mode === 'down') ball.y = -80;
        if (mode === 'up')   ball.y = H + 80;
        ball.vx = 0; ball.vy = 0;
      }
      var cx = W/2, cy = H/2;
      if (mode === 'inward') { cx = st.bgFx.originX*W; cy = st.bgFx.originY*H; }
      if (mode === 'outward') { var ox=st.bgFx.originX*W, oy=st.bgFx.originY*H; cx = ball.x + (ball.x-ox); cy = ball.y + (ball.y-oy); }
      if (mode === 'angle') { var ang=(st.bgFx.flowAngle||0)*Math.PI/180; cx = ball.x + Math.cos(ang)*1000; cy = ball.y + Math.sin(ang)*1000; }
      if (mode === 'down' && ball.y > H + 80) { ball.y = -80; ball.x = Math.random()*W; }
      if (mode === 'up' && ball.y < -80) { ball.y = H + 80; ball.x = Math.random()*W; }
      var dx = cx - ball.x, dy = cy - ball.y;
      var d = Math.sqrt(dx*dx + dy*dy) || 1;
      dx/=d; dy/=d;
      var z2 = (ball.z!=null)?ball.z:0.5;
      var sp = (0.8 + st.bgFx.speed*1.1) * lerpNum(0.75,1.35,z2);
      ball.vx = dx*sp + Math.sin(ts + ball.phaseX)*0.25;
      ball.vy = dy*sp + Math.cos(ts + ball.phaseY)*0.25;
      ball.x += ball.vx;
      ball.y += ball.vy;
      bx = ball.x;
      by = ball.y;
    }
    var br = ball.r * minDim * zS;

    var r, g, b;
    if (useCustom) {
      var c = col1 || [80,160,255];
      var c2b = col2 || [160,80,255];
      var mix = bi / st._metaBalls.length;
      r = Math.round(c[0] * (1-mix) + c2b[0] * mix);
      g = Math.round(c[1] * (1-mix) + c2b[1] * mix);
      b = Math.round(c[2] * (1-mix) + c2b[2] * mix);
    } else {
      var rgb3 = hslToRgb(ball.hue / 360, 0.85, 0.55);
      r = rgb3[0]; g = rgb3[1]; b = rgb3[2];
    }

    var rg = tctx.createRadialGradient(bx, by, 0, bx, by, br * 1.4);
    rg.addColorStop(0,    'rgba(255,255,255,' + (0.5 * intensity * zA) + ')');
    rg.addColorStop(0.25, 'rgba('+r+','+g+','+b+','+(0.7 * intensity * zA)+')');
    rg.addColorStop(0.6,  'rgba('+r+','+g+','+b+','+(0.25 * intensity * zA)+')');
    rg.addColorStop(1,    'rgba('+r+','+g+','+b+',0)');
    tctx.fillStyle = rg;
    tctx.beginPath();
    tctx.arc(bx, by, br * 1.4, 0, Math.PI * 2);
    tctx.fill();

    // Rim highlight
    tctx.save();
    tctx.globalCompositeOperation = 'lighter';
    tctx.globalAlpha = (0.12 * intensity * (0.7 + 0.6 * zA)) * (st.bgFx.metaRimOpacity != null ? st.bgFx.metaRimOpacity : 0.35);
    tctx.strokeStyle = 'rgba(255,255,255,0.8)';
    tctx.lineWidth = Math.max(0.8, br * 0.03);
    tctx.beginPath(); tctx.arc(bx, by, br*0.86, 0, Math.PI*2); tctx.stroke();
    tctx.restore();
  }

  tctx.restore();
}
