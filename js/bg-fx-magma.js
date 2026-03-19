// ============================================================
//  ARCANA GLAM — Background FX: Magma  (bg-fx-magma.js)
//  WebGL lava lake — domain-warped FBM + Voronoi crust plates.
// ============================================================

import { AppState as st } from './state.js';

// ── Shaders ──────────────────────────────────────────────────────────────────

var _VERT = 'attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.0,1.0);}';

var _FRAG = [
  'precision highp float;',
  'uniform float u_time;',
  'uniform vec2  u_res;',
  'uniform float u_intensity;',
  'uniform float u_crustAmount;',
  'uniform float u_scale;',
  'uniform vec3  u_color1;',
  'uniform vec3  u_color2;',

  '#define PI 3.14159265359',

  'float hash(vec2 p){',
  '  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);',
  '}',
  'vec2 hash2(vec2 p){',
  '  return vec2(',
  '    fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453),',
  '    fract(sin(dot(p,vec2(269.5,183.3)))*43758.5453)',
  '  );',
  '}',

  'float noise(vec2 p){',
  '  vec2 i=floor(p); vec2 f=fract(p);',
  '  f=f*f*(3.0-2.0*f);',
  '  float a=hash(i);',
  '  float b=hash(i+vec2(1.0,0.0));',
  '  float c=hash(i+vec2(0.0,1.0));',
  '  float d=hash(i+vec2(1.0,1.0));',
  '  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);',
  '}',

  'float fbm(vec2 p,int octaves){',
  '  float val=0.0; float amp=0.5; float freq=1.0;',
  '  for(int i=0;i<8;i++){',
  '    if(i>=octaves) break;',
  '    val+=amp*noise(p*freq);',
  '    freq*=2.03; amp*=0.49;',
  '    p+=vec2(1.7,9.2);',
  '  }',
  '  return val;',
  '}',

  'float ridgedNoise(vec2 p){ return 1.0-abs(noise(p)*2.0-1.0); }',

  'float ridgedFBM(vec2 p,int octaves){',
  '  float val=0.0; float amp=0.5; float freq=1.0; float prev=1.0;',
  '  for(int i=0;i<6;i++){',
  '    if(i>=octaves) break;',
  '    float n=ridgedNoise(p*freq); n=n*n;',
  '    val+=n*amp*prev; prev=n;',
  '    freq*=2.2; amp*=0.5;',
  '    p+=vec2(1.3,7.1);',
  '  }',
  '  return val;',
  '}',

  'float voronoi(vec2 p,out vec2 cellCenter){',
  '  vec2 i=floor(p); vec2 f=fract(p);',
  '  float minDist=1.0; float secondDist=1.0;',
  '  cellCenter=vec2(0.0);',
  '  for(int y=-1;y<=1;y++){',
  '    for(int x=-1;x<=1;x++){',
  '      vec2 neighbor=vec2(float(x),float(y));',
  '      vec2 point=hash2(i+neighbor);',
  '      vec2 diff=neighbor+point-f;',
  '      float d=dot(diff,diff);',
  '      if(d<minDist){ secondDist=minDist; minDist=d; cellCenter=i+neighbor+point; }',
  '      else if(d<secondDist){ secondDist=d; }',
  '    }',
  '  }',
  '  return sqrt(secondDist)-sqrt(minDist);',
  '}',

  'vec2 warpDomain(vec2 p,float t){',
  '  vec2 q=vec2(',
  '    fbm(p+t*vec2(0.12,-0.08),5),',
  '    fbm(p+vec2(5.2,1.3)+t*vec2(-0.09,0.14),5)',
  '  );',
  '  vec2 r=vec2(',
  '    fbm(p+3.5*q+vec2(1.7,9.2)+t*vec2(0.06,0.05),5),',
  '    fbm(p+3.5*q+vec2(8.3,2.8)+t*vec2(-0.07,0.08),5)',
  '  );',
  '  return p+2.5*r;',
  '}',

  'vec3 magmaColor(float temp){',
  '  vec3 c;',
  '  if(temp<0.15){',
  '    float t=temp/0.15;',
  '    c=mix(vec3(0.02,0.005,0.0),vec3(0.15,0.02,0.005),t);',
  '  } else if(temp<0.35){',
  '    float t=(temp-0.15)/0.2;',
  '    c=mix(vec3(0.15,0.02,0.005),vec3(0.55,0.08,0.01),t*t);',
  '  } else if(temp<0.55){',
  '    float t=(temp-0.35)/0.2;',
  '    c=mix(vec3(0.55,0.08,0.01),vec3(0.9,0.3,0.02),t);',
  '  } else if(temp<0.72){',
  '    float t=(temp-0.55)/0.17;',
  '    c=mix(vec3(0.9,0.3,0.02),vec3(1.0,0.65,0.08),t);',
  '  } else if(temp<0.88){',
  '    float t=(temp-0.72)/0.16;',
  '    c=mix(vec3(1.0,0.65,0.08),vec3(1.0,0.9,0.4),t);',
  '  } else {',
  '    float t=(temp-0.88)/0.12;',
  '    c=mix(vec3(1.0,0.9,0.4),vec3(1.0,1.0,0.85),t);',
  '  }',
  '  return c;',
  '}',

  'void main(){',
  '  vec2 fragCoord=gl_FragCoord.xy;',
  '  vec2 p=(fragCoord-u_res*0.5)/min(u_res.x,u_res.y);',
  '  float t=u_time;',

  '  vec2 magmaUV=p*u_scale;',

  '  vec2 warped=warpDomain(magmaUV,t*0.4);',
  '  float baseFlow=fbm(warped,7);',
  '  vec2 warped2=warpDomain(magmaUV*1.3+vec2(50.0),t*0.35);',
  '  float flow2=fbm(warped2,6);',
  '  float convection=baseFlow*0.6+flow2*0.4;',

  '  vec2 crustUV=magmaUV*0.8+t*vec2(0.03,-0.02);',
  '  crustUV+=vec2(baseFlow,flow2)*0.6;',
  '  vec2 cellCenter;',
  '  float crustEdge=voronoi(crustUV,cellCenter);',
  '  vec2 cellCenter2;',
  '  float subCracks=voronoi(crustUV*2.5+vec2(30.0),cellCenter2);',

  '  float temp=convection;',
  '  float crackGlow=smoothstep(0.12*u_crustAmount,0.0,crustEdge);',
  '  float subCrackGlow=smoothstep(0.08*u_crustAmount,0.0,subCracks)*0.4;',
  '  float crustMask=smoothstep(0.0,0.15*u_crustAmount,crustEdge);',
  '  float cellCool=hash(floor(cellCenter*100.0))*0.3+0.5;',
  '  float crustCooling=crustMask*cellCool*u_crustAmount;',
  '  temp=temp-crustCooling*0.6;',
  '  temp=max(temp,crackGlow*0.85);',
  '  temp=max(temp,subCrackGlow*0.5+temp*0.5);',

  '  float hotSpotNoise=fbm(magmaUV*0.5+t*vec2(0.08,-0.06),4);',
  '  float hotSpots=smoothstep(0.55,0.85,hotSpotNoise);',
  '  temp+=hotSpots*0.35*u_intensity;',

  '  float breathe=sin(t*0.6)*0.5+0.5;',
  '  float breathe2=sin(t*0.37+2.0)*0.5+0.5;',
  '  temp+=breathe*0.08+breathe2*0.05;',

  '  float veins=ridgedFBM(warped*1.5+t*0.1,5);',
  '  float veinMask=smoothstep(0.2,0.4,temp)*smoothstep(0.8,0.5,temp);',
  '  temp+=veins*veinMask*0.15;',

  '  float flareNoise=noise(magmaUV*1.2+t*vec2(0.3,-0.2));',
  '  float flare=pow(max(flareNoise-0.65,0.0)/0.35,3.0);',
  '  temp+=flare*0.25*u_intensity;',

  '  temp=clamp(temp*u_intensity,0.0,1.0);',

  '  vec3 col=magmaColor(temp);',
  '  vec3 userTint=mix(u_color2,u_color1,smoothstep(0.25,0.75,temp));',
  '  col*=userTint;',

  '  float glow=smoothstep(0.6,1.0,temp);',
  '  col+=vec3(0.3,0.08,0.01)*glow*glow*0.5;',

  '  float crustDetail=fbm(magmaUV*8.0+vec2(cellCool*20.0),4);',
  '  col*=mix(1.0,0.7+crustDetail*0.3,crustMask*u_crustAmount*0.5);',

  '  float haze=fbm(p*2.0+t*vec2(0.15,0.4),3);',
  '  float hazeStrength=smoothstep(0.5,1.0,temp)*0.08;',
  '  col+=vec3(0.15,0.04,0.0)*haze*hazeStrength;',

  '  float edgeDist=length(p*vec2(1.0,1.3));',
  '  float edgeFade=smoothstep(0.7,1.4,edgeDist);',
  '  col=mix(col,col*vec3(0.3,0.1,0.08),edgeFade*0.3);',

  '  float vignette=1.0-smoothstep(0.5,1.5,edgeDist);',
  '  col*=0.65+vignette*0.35;',

  '  col=col/(1.0+col*0.15);',
  '  col=pow(col,vec3(0.95,1.0,1.1));',

  '  gl_FragColor=vec4(col,1.0);',
  '}'
].join('\n');

// ── GL setup ─────────────────────────────────────────────────────────────────

function _compile(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('Magma shader error:', gl.getShaderInfoLog(s)); return null;
  }
  return s;
}

function _getGL(W, H) {
  if (st._magmaGL && st._magmaGL.W === W && st._magmaGL.H === H) return st._magmaGL;

  var canvas = (st._magmaGL && st._magmaGL.canvas) ? st._magmaGL.canvas : document.createElement('canvas');
  canvas.width = W; canvas.height = H;

  var gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl) return null;

  var vs = _compile(gl, gl.VERTEX_SHADER, _VERT);
  var fs = _compile(gl, gl.FRAGMENT_SHADER, _FRAG);
  if (!vs || !fs) return null;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('Magma link error:', gl.getProgramInfoLog(prog)); return null;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var ap = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(ap);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

  function ul(n) { return gl.getUniformLocation(prog, n); }
  st._magmaGL = {
    gl: gl, canvas: canvas, prog: prog, W: W, H: H,
    u: {
      res: ul('u_res'), time: ul('u_time'), int: ul('u_intensity'),
      crust: ul('u_crustAmount'), scale: ul('u_scale'),
      color1: ul('u_color1'), color2: ul('u_color2')
    }
  };
  return st._magmaGL;
}

// ── Public ────────────────────────────────────────────────────────────────────

function _parseColor(hex, defR, defG, defB) {
  if (!hex) return [defR, defG, defB];
  var r = parseInt(hex.slice(1,3),16)/255;
  var g = parseInt(hex.slice(3,5),16)/255;
  var b = parseInt(hex.slice(5,7),16)/255;
  return [r, g, b];
}

export function drawBgMagma(tctx, W, H, t, intensity) {
  var crust      = st.bgFx.magmaCrust  != null ? st.bgFx.magmaCrust  : 1.0;
  var spd        = st.bgFx.speed       != null ? st.bgFx.speed       : 0.6;
  var waveScale  = st.bgFx.magmaScale  != null ? st.bgFx.magmaScale  : 3.0;
  var col1       = _parseColor(st.bgFx.magmaColor1, 1, 1, 1);  // default: white = no tint
  var col2       = _parseColor(st.bgFx.magmaColor2, 1, 1, 1);

  // Render at reduced resolution for performance (upscaled via drawImage)
  var perfScale = st.MOBILE_PERF_QUERY && st.MOBILE_PERF_QUERY.matches ? 0.35 : 0.5;
  var rW = Math.max(64, Math.round(W * perfScale));
  var rH = Math.max(64, Math.round(H * perfScale));

  var mg = _getGL(rW, rH);
  if (!mg) return;

  var gl = mg.gl;
  gl.viewport(0, 0, rW, rH);
  gl.uniform2f(mg.u.res, rW, rH);
  gl.uniform1f(mg.u.time, t * 0.001 * spd);
  gl.uniform1f(mg.u.int, intensity);
  gl.uniform1f(mg.u.crust, crust);
  gl.uniform1f(mg.u.scale, waveScale);
  gl.uniform3f(mg.u.color1, col1[0], col1[1], col1[2]);
  gl.uniform3f(mg.u.color2, col2[0], col2[1], col2[2]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  tctx.save();
  tctx.globalAlpha = 1.0;
  tctx.globalCompositeOperation = 'source-over';
  tctx.drawImage(mg.canvas, 0, 0, W, H);
  tctx.restore();
}
