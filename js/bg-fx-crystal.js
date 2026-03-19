// ============================================================
//  ARCANA GLAM — Background FX: Crystal  (bg-fx-crystal.js)
//  Voronoi-style glowing gem diamonds with screen blend.
// ============================================================

import { AppState as st } from './state.js';
import {
  lerp as lerpNum,
  hexToRgbArr,
  getFlowRotation,
  hslToRgb
} from './fx-engine.js';

export function initCrystalPoints(W, H) {
  var mode = st.bgFx.flowMode; if (mode === 'left' || mode === 'right') mode = 'default';
  st._crystalPoints = [];
  var count = Math.round(8 + (st.bgFx.crystalFacets || 0) * 18);
  for (var i = 0; i < count; i++) {
    var spd = 0.12 + Math.random() * 0.25;
    var cp = {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * spd, vy: (Math.random() - 0.5) * spd,
      size: 8 + Math.random() * 24, z: Math.random(),
      hue: Math.random() * 360,
      phase: Math.random() * Math.PI * 2,
      color: Math.random() < 0.5 ? '#aabbff' : '#ffccff',
      swayPhase: Math.random() * Math.PI * 2
    };
    if (mode !== 'default') { cp.vx = 0; cp.vy = 0; }
    st._crystalPoints.push(cp);
  }
}

export function drawBgCrystal(tctx, W, H, t, intensity) {
  var spd = st.bgFx.speed;
  var mode = st.bgFx.flowMode; if (mode === 'left' || mode === 'right') mode = 'default';
  if (st._crystalPoints.length === 0) initCrystalPoints(W, H);

  var useCustom = !!(st.bgFx.particleColor1);
  var col1 = useCustom ? hexToRgbArr(st.bgFx.particleColor1) : null;
  var col2 = (useCustom && st.bgFx.particleColor2) ? hexToRgbArr(st.bgFx.particleColor2) : null;

  var _rot = getFlowRotation();
  tctx.save();
  tctx.globalCompositeOperation = st.bgFx.blend || 'screen';
  if (_rot !== 0) { tctx.translate(W/2, H/2); tctx.rotate(_rot); tctx.translate(-W/2, -H/2); }

  var pts = st._crystalPoints;
  for (var i = 0; i < pts.length; i++) {
    var pt = pts[i];
    if (mode !== 'default' && !pt._dirInit) {
      pt._dirInit = true;
      if (mode === 'down') { pt.x = Math.random()*W; pt.y = -80; }
      else if (mode === 'up') { pt.x = Math.random()*W; pt.y = H + 80; }
      else if (mode === 'inward') {
        var e = (Math.random()*4)|0;
        if (e===0){pt.x=Math.random()*W; pt.y=-80;} else if(e===1){pt.x=Math.random()*W; pt.y=H+80;} else if(e===2){pt.x=-80; pt.y=Math.random()*H;} else {pt.x=W+80; pt.y=Math.random()*H;}
      } else if (mode === 'outward') {
        pt.x = st.bgFx.originX*W + (Math.random()-0.5)*40;
        pt.y = st.bgFx.originY*H + (Math.random()-0.5)*40;
      }
    }
    if (mode !== 'default') {
      var cx = W/2, cy = H/2;
      if (mode === 'down' && pt.y > H + 80) { pt.x = Math.random()*W; pt.y = -80; }
      if (mode === 'up' && pt.y < -80) { pt.x = Math.random()*W; pt.y = H + 80; }
      if (mode === 'outward') {
        var ox = st.bgFx.originX * W, oy = st.bgFx.originY * H;
        cx = pt.x + (pt.x - ox); cy = pt.y + (pt.y - oy);
      }
      if (mode === 'inward') {
        cx = st.bgFx.originX * W; cy = st.bgFx.originY * H;
      }
      if (mode === 'angle') {
        var ang = (st.bgFx.flowAngle||0) * Math.PI/180;
        cx = pt.x + Math.cos(ang)*1000; cy = pt.y + Math.sin(ang)*1000;
      }
      var dx = cx - pt.x, dy = cy - pt.y;
      var d = Math.sqrt(dx*dx + dy*dy) || 1;
      dx/=d; dy/=d;
      var sp = (0.6 + st.bgFx.speed*0.9) * lerpNum(0.75,1.35,(pt.z!=null?pt.z:0.5));
      pt.vx = dx * sp;
      pt.vy = dy * sp;
    }
    var z = (pt.z != null) ? pt.z : 0.5;
    var zSpd = lerpNum(0.75, 1.4, z);
    var zA = lerpNum(0.55, 1.0, z);
    var zS = lerpNum(0.7, 1.35, z);
    pt.x += pt.vx * spd * zSpd;
    pt.y += pt.vy * spd * zSpd;
    if (pt.x < -W * 0.2) pt.x += W * 1.4;
    if (pt.x > W * 1.2)  pt.x -= W * 1.4;
    if (pt.y < -H * 0.2) pt.y += H * 1.4;
    if (pt.y > H * 1.2)  pt.y -= H * 1.4;
    pt.hue = (pt.hue + 0.15 * spd) % 360;

    var pulse = 0.7 + 0.3 * Math.sin(t * 0.001 * spd + pt.phase);
    var sz = pt.size * pulse * zS;

    var r, g, b;
    if (useCustom) {
      var c = col1 || [100,200,255];
      var c2b = col2 || [200,100,255];
      var mix = i / pts.length;
      r = Math.round(c[0] * (1-mix) + c2b[0] * mix);
      g = Math.round(c[1] * (1-mix) + c2b[1] * mix);
      b = Math.round(c[2] * (1-mix) + c2b[2] * mix);
    } else {
      var rgb2 = hslToRgb(pt.hue / 360, 0.8, 0.6);
      r = rgb2[0]; g = rgb2[1]; b = rgb2[2];
    }

    var rg = tctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, sz);
    rg.addColorStop(0,   'rgba(255,255,255,'    + (0.6 * intensity * pulse * zA) + ')');
    rg.addColorStop(0.15,'rgba('+r+','+g+','+b+','+(0.85 * intensity * pulse * zA)+')');
    rg.addColorStop(0.5, 'rgba('+r+','+g+','+b+','+(0.35 * intensity * zA)+')');
    rg.addColorStop(1,   'rgba('+r+','+g+','+b+',0)');
    tctx.fillStyle = rg;

    tctx.save();
    tctx.translate(pt.x, pt.y);
    tctx.rotate(Math.PI / 4 + t * 0.0001 * spd + pt.phase);
    tctx.beginPath();
    tctx.rect(-sz, -sz, sz * 2, sz * 2);
    tctx.restore();

    tctx.beginPath();
    tctx.arc(pt.x, pt.y, sz, 0, Math.PI * 2);
    tctx.fill();

    // Specular highlight
    tctx.save();
    tctx.globalCompositeOperation = 'lighter';
    tctx.globalAlpha = (0.22 * intensity * pulse * lerpNum(0.7,1.1,(pt.z!=null?pt.z:0.5))) * (st.bgFx.crystalSpecOpacity != null ? st.bgFx.crystalSpecOpacity : 0.35);
    tctx.strokeStyle = 'rgba(255,255,255,0.9)';
    tctx.lineWidth = Math.max(0.8, sz * 0.015);
    tctx.beginPath();
    tctx.moveTo(pt.x - sz*0.25, pt.y - sz*0.15);
    tctx.lineTo(pt.x + sz*0.12, pt.y - sz*0.38);
    tctx.stroke();
    tctx.restore();

    // Edge sparkle cross
    tctx.save();
    tctx.globalAlpha = 0.4 * intensity * pulse * zA;
    tctx.strokeStyle = 'rgba('+r+','+g+','+b+',0.9)';
    tctx.lineWidth = 1;
    tctx.beginPath();
    tctx.moveTo(pt.x - sz * 0.9, pt.y);
    tctx.lineTo(pt.x + sz * 0.9, pt.y);
    tctx.moveTo(pt.x, pt.y - sz * 0.9);
    tctx.lineTo(pt.x, pt.y + sz * 0.9);
    tctx.stroke();
    tctx.restore();
  }

  // Crystal facet grid lines
  tctx.save();
  tctx.globalAlpha = 0.06 * intensity;
  tctx.strokeStyle = 'rgba(200,220,255,0.8)';
  tctx.lineWidth = 0.5;
  for (var a = 0; a < pts.length; a++) {
    for (var b2 = a + 1; b2 < pts.length; b2++) {
      var ddx = pts[a].x - pts[b2].x, ddy = pts[a].y - pts[b2].y;
      var dist = Math.sqrt(ddx*ddx + ddy*ddy);
      if (dist < W * 0.22) {
        var fade = 1 - dist / (W * 0.22);
        tctx.globalAlpha = fade * 0.08 * intensity;
        tctx.beginPath();
        tctx.moveTo(pts[a].x, pts[a].y);
        tctx.lineTo(pts[b2].x, pts[b2].y);
        tctx.stroke();
      }
    }
  }
  tctx.restore();

  tctx.restore();
}
