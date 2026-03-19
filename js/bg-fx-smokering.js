// ============================================================
//  ARCANA GLAM — Background FX: Smoke Ring  (bg-fx-smokering.js)
//  WebGL fBm shader — full-canvas fractional Brownian motion
//  noise in polar coordinates.
// ============================================================

import { AppState as st } from './state.js';

// ── Private WebGL state ───────────────────────────────────────────────────

var _SR_VERT = 'attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.0,1.0);}';

var _SR_FRAG = [
  'precision mediump float;',
  'uniform vec2  u_res;',
  'uniform float u_time;',
  'uniform float u_radius;',
  'uniform float u_thickness;',
  'uniform float u_inner;',
  'uniform float u_nscale;',
  'uniform int   u_niter;',
  'uniform float u_zoom;',
  'uniform vec3  u_c1;',
  'uniform vec3  u_c2;',
  'uniform vec3  u_c3;',
  'vec2 h2(vec2 p){',
  '  p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));',
  '  return fract(sin(p)*43758.5453);}',
  'float gn(vec2 p){',
  '  vec2 i=floor(p),f=fract(p);',
  '  vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);',
  '  return 0.5+0.5*mix(',
  '    mix(dot(h2(i)*2.0-1.0,f),dot(h2(i+vec2(1,0))*2.0-1.0,f-vec2(1,0)),u.x),',
  '    mix(dot(h2(i+vec2(0,1))*2.0-1.0,f-vec2(0,1)),dot(h2(i+vec2(1,1))*2.0-1.0,f-vec2(1,1)),u.x),',
  '  u.y);}',
  'float fbm(vec2 p,int oct){',
  '  float v=0.0,a=0.5,f=1.0,tot=0.0;',
  '  for(int i=0;i<8;i++){if(i>=oct)break;',
  '    v+=gn(p*f)*a; tot+=a; a*=0.5; f*=2.1;}',
  '  return v/tot;}',
  'void main(){',
  '  vec2 uv=(gl_FragCoord.xy/u_res)*2.0-1.0;',
  '  float asp=u_res.x/u_res.y;',
  '  uv.x*=asp;',
  '  uv/=u_zoom;',
  '  float r=length(uv);',
  '  float ang=atan(uv.y,uv.x);',
  '  float ts=u_time*0.00035;',
  '  vec2 nc=vec2(cos(ang)*r*u_nscale+ts*0.8,sin(ang)*r*u_nscale+ts*0.55);',
  '  float w1=fbm(nc,u_niter);',
  '  float w2=fbm(nc+vec2(3.7,1.9)+ts*0.3,u_niter);',
  '  vec2 wc=nc+vec2(w1*1.8-0.9,w2*1.8-0.9);',
  '  float n=fbm(wc+ts*0.45,u_niter);',
  '  float hT=u_thickness*0.5;',
  '  float ring=1.0-smoothstep(hT*0.25,hT,abs(r-u_radius));',
  '  float inner=u_inner>0.0?(1.0-smoothstep(0.0,u_radius+0.01,r))*u_inner*0.3:0.0;',
  '  float d=clamp((ring+inner)*n,0.0,1.0);',
  '  vec3 col=mix(u_c1,u_c2,smoothstep(0.0,0.55,n));',
  '  col=mix(col,u_c3,smoothstep(0.5,1.0,n));',
  '  col=pow(clamp(col,0.0,1.0),vec3(0.85));',
  '  gl_FragColor=vec4(col*d,d);',
  '}'
].join('\n');

function _srCompile(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('SmokeRing shader error:', gl.getShaderInfoLog(s)); return null;
  }
  return s;
}

function _srGetGL(W, H) {
  if (st._srGL && st._srGL.W === W && st._srGL.H === H) return st._srGL;

  var canvas = (st._srGL && st._srGL.canvas) ? st._srGL.canvas : document.createElement('canvas');
  canvas.width = W; canvas.height = H;

  var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) return null;

  var vs = _srCompile(gl, gl.VERTEX_SHADER,  _SR_VERT);
  var fs = _srCompile(gl, gl.FRAGMENT_SHADER, _SR_FRAG);
  if (!vs || !fs) return null;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('SmokeRing link error:', gl.getProgramInfoLog(prog)); return null;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  var ap = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(ap);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

  st._srGL = {
    gl: gl, canvas: canvas, prog: prog, W: W, H: H,
    u: {
      res:  gl.getUniformLocation(prog, 'u_res'),
      time: gl.getUniformLocation(prog, 'u_time'),
      rad:  gl.getUniformLocation(prog, 'u_radius'),
      thk:  gl.getUniformLocation(prog, 'u_thickness'),
      inn:  gl.getUniformLocation(prog, 'u_inner'),
      nsc:  gl.getUniformLocation(prog, 'u_nscale'),
      nit:  gl.getUniformLocation(prog, 'u_niter'),
      zoom: gl.getUniformLocation(prog, 'u_zoom'),
      c1:   gl.getUniformLocation(prog, 'u_c1'),
      c2:   gl.getUniformLocation(prog, 'u_c2'),
      c3:   gl.getUniformLocation(prog, 'u_c3')
    }
  };
  return st._srGL;
}

function _srHexV3(hex) {
  var h = (hex || '#ffffff').replace('#','');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}

// ── Public ────────────────────────────────────────────────────────────────

export function drawBgSmokeRing(tctx, W, H, t, intensity) {
  var radius    = st.bgFx.srRadius    != null ? st.bgFx.srRadius    : 0.28;
  var thickness = st.bgFx.srThickness != null ? st.bgFx.srThickness : 0.7;
  var inner     = st.bgFx.srInner     != null ? st.bgFx.srInner     : 0.7;
  var gl = _srGetGL(W, H);
  if (!gl) return;
  var u = gl.u; var g = gl.gl;
  g.viewport(0, 0, W, H);
  g.clearColor(0,0,0,0); g.clear(g.COLOR_BUFFER_BIT);
  g.uniform2f(u.res, W, H);
  g.uniform1f(u.time, t);
  g.uniform1f(u.rad, radius); g.uniform1f(u.thk, thickness); g.uniform1f(u.inn, inner);
  var nsc = st.bgFx.srNscale != null ? st.bgFx.srNscale : 1.5;
  var nit = Math.round(st.bgFx.srNiter != null ? st.bgFx.srNiter : 4);
  var zm  = st.bgFx.srScale  != null ? st.bgFx.srScale  : 1.0;
  g.uniform1f(u.nsc, nsc); g.uniform1i(u.nit, nit); g.uniform1f(u.zoom, zm);
  var c1 = _srHexV3(st.bgFx.particleColor1 || '#00eeff');
  var c2 = _srHexV3(st.bgFx.particleColor2 || '#8800ff');
  var c3 = _srHexV3(st.bgFx.centerBloomColor || '#ffffff');
  g.uniform3fv(u.c1, c1); g.uniform3fv(u.c2, c2); g.uniform3fv(u.c3, c3);
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  tctx.save();
  tctx.globalAlpha = intensity * (st.bgFx.srOpacity != null ? st.bgFx.srOpacity : 1.0);
  tctx.globalCompositeOperation = st.bgFx.blend || 'screen';
  tctx.drawImage(gl.canvas, 0, 0, W, H);
  tctx.restore();
}
