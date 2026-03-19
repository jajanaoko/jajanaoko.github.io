// ============================================================
//  ARCANA GLAM — Background FX: God Rays  (bg-fx-godrays.js)
//  WebGL angular-stripe ray shader with colour ramp.
// ============================================================

import { AppState as st } from './state.js';

// ── Private WebGL state ───────────────────────────────────────────────────

var _GR_VERT = 'attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.0,1.0);}';

var _GR_FRAG = [
  'precision highp float;',
  'uniform vec2  u_res;',
  'uniform float u_time;',
  'uniform float u_intensity;',
  'uniform float u_density;',
  'uniform float u_spotty;',
  'uniform float u_midSize;',
  'uniform float u_midInt;',
  'uniform float u_bloom;',
  'uniform vec2  u_origin;',
  'uniform vec3  u_c0;',
  'uniform vec3  u_c1;',
  'uniform vec3  u_c2;',
  'uniform vec3  u_c3;',
  'uniform vec3  u_cBack;',
  'uniform vec3  u_cBloom;',

  'vec3 ramp(float t){',
  '  t=fract(t);',
  '  if(t<0.333) return mix(u_c0,u_c1,t*3.0);',
  '  if(t<0.667) return mix(u_c1,u_c2,(t-0.333)*3.0);',
  '  return mix(u_c2,u_c3,(t-0.667)*3.0);',
  '}',
  'float h1(float n){ return fract(sin(n*127.1)*43758.5453); }',

  'void main(){',
  '  vec2 uv = (gl_FragCoord.xy/u_res)*2.0-1.0;',
  '  float asp = u_res.x/u_res.y;',
  '  uv.x *= asp;',
  '  vec2 p = uv - vec2(u_origin.x*asp, u_origin.y);',
  '  float r  = length(p);',
  '  float ang = atan(p.y,p.x);',
  '  float ts  = u_time*0.00014;',
  '  float angS = ang+ts;',

  '  float nRays = 8.0+u_density*64.0;',
  '  float slot  = (angS/(2.0*3.14159265)+0.5)*nRays;',
  '  float slotI = floor(slot);',
  '  float slotF = fract(slot);',
  '  float rawW = 0.3+0.4*h1(slotI+3.7);',
  '  float duty = clamp(rawW*mix(0.1,1.0,u_spotty),0.06,0.98);',
  '  float edge = 0.015+duty*0.01;',
  '  float stripe = smoothstep(edge,edge*2.5,slotF)*smoothstep(duty+edge,duty-edge,slotF);',
  '  float bright  = 0.6+0.4*h1(slotI+91.7);',
  '  float flicker = 0.85+0.15*sin(u_time*0.001*(0.4+h1(slotI))+h1(slotI)*31.4);',

  '  float nearClip = smoothstep(0.0,0.03,r);',
  '  float radFade  = exp(-r*0.6);',
  '  float rayA     = stripe*bright*flicker*radFade*nearClip*u_intensity;',

  '  float colT  = fract(angS/(2.0*3.14159265)+0.5+ts*0.03);',
  '  vec3 rayCol = ramp(colT);',

  '  float midA  = smoothstep(u_midSize*1.1,0.0,r)*u_midInt*2.5*u_intensity;',
  '  vec3 midCol = mix(u_c0,u_c3,0.5);',

  '  float alpha = clamp(rayA+midA,0.0,1.0);',
  '  vec3 col = (rayCol*rayA + midCol*midA) / max(alpha,0.001);',
  '  col = pow(clamp(col,0.0,1.0),vec3(0.88));',
  '  gl_FragColor = vec4(col*alpha, alpha);',
  '}'
].join('\n');

function _grCompile(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('GodRays shader error:', gl.getShaderInfoLog(s)); return null;
  }
  return s;
}

function _grGetGL(W, H) {
  if (st._grGL && st._grGL.W === W && st._grGL.H === H) return st._grGL;

  var canvas = (st._grGL && st._grGL.canvas) ? st._grGL.canvas : document.createElement('canvas');
  canvas.width = W; canvas.height = H;

  var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
  if (!gl) return null;

  var vs = _grCompile(gl, gl.VERTEX_SHADER,  _GR_VERT);
  var fs = _grCompile(gl, gl.FRAGMENT_SHADER, _GR_FRAG);
  if (!vs || !fs) return null;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('GodRays link error:', gl.getProgramInfoLog(prog)); return null;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  var ap = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(ap);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

  function ul(n){ return gl.getUniformLocation(prog, n); }
  st._grGL = {
    gl: gl, canvas: canvas, prog: prog, W: W, H: H,
    u: {
      res: ul('u_res'), time: ul('u_time'),
      int: ul('u_intensity'), den: ul('u_density'), spt: ul('u_spotty'),
      msz: ul('u_midSize'),  mit: ul('u_midInt'),   blm: ul('u_bloom'),
      org: ul('u_origin'),
      c0: ul('u_c0'), c1: ul('u_c1'), c2: ul('u_c2'), c3: ul('u_c3'),
      cb: ul('u_cBack'), cbl: ul('u_cBloom')
    }
  };
  return st._grGL;
}

function _grHex(hex) {
  var h = (hex || '#ffffff').replace('#','');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}

// ── Public ────────────────────────────────────────────────────────────────

export function drawBgGodRays(tctx, W, H, t, intensity) {
  var den    = st.bgFx.grDensity  != null ? st.bgFx.grDensity  : 0.3;
  var spt    = st.bgFx.grSpotty   != null ? st.bgFx.grSpotty   : 0.3;
  var msz    = st.bgFx.grMidSize  != null ? st.bgFx.grMidSize  : 0.2;
  var mit    = st.bgFx.grMidInt   != null ? st.bgFx.grMidInt   : 0.4;
  var offX   = st.bgFx.grOffsetX  != null ? st.bgFx.grOffsetX  : 0.0;
  var offY   = st.bgFx.grOffsetY  != null ? st.bgFx.grOffsetY  : -0.55;
  var spd    = st.bgFx.speed      != null ? st.bgFx.speed      : 0.75;
  var opac   = st.bgFx.grOpacity  != null ? st.bgFx.grOpacity  : 0.5;

  var c0H  = st.bgFx.grColorPrimary   || st.bgFx.particleColor1 || '#a600f6';
  var c3H  = st.bgFx.grColorSecondary || st.bgFx.particleColor2 || '#33fff5';
  function _lerpHex(a, b, f) {
    var ah = _grHex(a), bh = _grHex(b);
    function lc(x,y){ return Math.round((x + (y-x)*f)*255).toString(16).padStart(2,'0'); }
    return '#'+lc(ah[0],bh[0])+lc(ah[1],bh[1])+lc(ah[2],bh[2]);
  }
  var c1H  = _lerpHex(c0H, c3H, 0.33);
  var c2H  = _lerpHex(c0H, c3H, 0.67);
  var cbH  = st.bgFx.grColorBack || '#000000';

  var scale = st.MOBILE_PERF_QUERY.matches ? 0.45 : 0.6;
  var rW = Math.max(64, Math.round(W * scale));
  var rH = Math.max(64, Math.round(H * scale));

  var gr = _grGetGL(rW, rH);
  if (!gr) return;

  var gl = gr.gl;
  gl.viewport(0, 0, rW, rH);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  gl.uniform2f(gr.u.res,  rW, rH);
  gl.uniform1f(gr.u.time, t * spd);
  gl.uniform1f(gr.u.int,  opac);
  gl.uniform1f(gr.u.den,  den);
  gl.uniform1f(gr.u.spt,  spt);
  gl.uniform1f(gr.u.msz,  msz);
  gl.uniform1f(gr.u.mit,  mit);
  gl.uniform1f(gr.u.blm,  0.0);
  gl.uniform2f(gr.u.org,  offX, offY);
  gl.uniform3fv(gr.u.c0,  _grHex(c0H));
  gl.uniform3fv(gr.u.c1,  _grHex(c1H));
  gl.uniform3fv(gr.u.c2,  _grHex(c2H));
  gl.uniform3fv(gr.u.c3,  _grHex(c3H));
  gl.uniform3fv(gr.u.cb,  _grHex(cbH));
  gl.uniform3fv(gr.u.cbl, _grHex(c3H));

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  tctx.save();
  tctx.globalAlpha = 1.0;
  tctx.globalCompositeOperation = 'source-over';
  tctx.drawImage(gr.canvas, 0, 0, W, H);
  tctx.restore();
}
