// ============================================================
//  ARCANA GLAM — Shared State  (state.js)
//  All mutable application state is exported via AppState so
//  that mutations are visible across all modules.
// ============================================================

export const AppState = {

  // ── Global light ─────────────────────────────────────────────
  globalLight: {
    on: false,
    color: '#ffffff',
    intensity: 0.6,
    radius: 0.55,
    mode: 'glow',
    x: 0.5,
    y: 0.35
  },

  // ── Default card back ID ─────────────────────────────────────
  DEFAULT_BACK_ID: '__default_back__',

  // ── Card / asset collections ─────────────────────────────────
  cards: [],
  selectedIds: [],
  images: {},           // { id: HTMLImageElement }

  // ── Background ───────────────────────────────────────────────
  bgColor: '#0A0A0F',
  bgImage: null,
  bgOpacity: 0.6,
  bgTexture: null,
  bgTextureOpacity: 0.45,
  bgTextureCanvas: {},
  bgTextureImages: {},
  TEXTURE_SRCS: {
    space: 'assets/textures/space.jpg',
    wood:  'assets/textures/wood.jpg'
  },

  // ── Sequences ────────────────────────────────────────────────
  sequences: {},
  nextCardId: 1,
  nextAssetId: 1,

  // ── Render loop refs ─────────────────────────────────────────
  cardsRef: [],
  selectedRef: [],

  // ── Camera ───────────────────────────────────────────────────
  camOffset: { x: 0, y: 0 },
  camZoom: 1,
  camOrbit: { yaw: 0, pitch: 0 },
  camOffsetRef: { x: 0, y: 0 },
  camZoomRef: 1,
  camOrbitRef: { yaw: 0, pitch: 0 },
  orbitMode: false,

  // ── Playback ─────────────────────────────────────────────────
  isPlaying: false,
  loopMode: false,
  playStart: 0,
  playhead: 0,
  totalDuration: 0,
  timelineOpen: false,

  // ── Surface / layout ─────────────────────────────────────────
  activeSurface: 'front',
  layoutParams: {
    grid:  { spacing: 1.2, cols: 0, rows: 0 },
    fan:   { spread: 60, arc: 0.5 },
    stack: { offset: 8, scatter: 12 }
  },

  // ── Asset drag ───────────────────────────────────────────────
  draggingAssetId: null,
  dragX: 0,
  dragY: 0,

  // ── Camera interaction ────────────────────────────────────────
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panStartOff: { x: 0, y: 0 },
  isOrbiting: false,
  orbitStartX: 0,
  orbitStartY: 0,
  orbitStartYaw: 0,
  orbitStartPitch: 0,

  // ── Canvas references (initialized in app.js bootstrap) ───────
  canvas: null,
  ctx: null,
  canvasWrap: null,

  // ── Hover ────────────────────────────────────────────────────
  hoverCardId: null,
  mouseCanvasX: 0,
  mouseCanvasY: 0,
  hoverData: {},

  // ── Performance ──────────────────────────────────────────────
  MOBILE_PERF_QUERY: window.matchMedia('(max-width: 900px), (max-height: 900px), (pointer: coarse)'),
  MAX_DPR: window.matchMedia('(max-width: 900px), (max-height: 900px), (pointer: coarse)').matches ? 1.0 : 1.5,
  _lastGoodCanvasW: 0,
  _lastGoodCanvasH: 0,

  // ── Layer panel ──────────────────────────────────────────────
  layerDrag: null,
  lastClickedLayerId: null,
  lastClickedGroupId: null,
  layerSlots: {},
  groupSlots: {},
  groups: [],
  nextGroupId: 1,
  renderedLayerOrder: [],

  // ── Resize handle drag ───────────────────────────────────────
  resizeDragging: false,
  resizeHandle: null,
  resizeObj: null,
  resizeStartW: 0,
  resizeStartH: 0,
  resizeStartX: 0,
  resizeStartY: 0,
  resizeStartCX: 0,
  resizeStartCY: 0,

  // ── Card drag ────────────────────────────────────────────────
  cardDragging: false,
  cardDragStartClientX: 0,
  cardDragStartClientY: 0,
  cardDragGroup: [],

  // ── Render timing ────────────────────────────────────────────
  lastT: 0,
  _lastRenderT: 0,
  needsRedraw: true,

  // ── Undo / redo ──────────────────────────────────────────────
  _undoStack: [],
  _redoStack: [],
  _undoPaused: false,
  MAX_UNDO: 20,
  SAVE_KEY: 'arcana_glam_v2',
  _saveTimer: null,
  _RT_KEYS: ['_rt', '_grGL', '_grShader', '_grBuf', '_grPos', '_grUV'],

  // ── Timeline / animation ─────────────────────────────────────
  _activeDropdown: null,
  openStepEditor: null,
  _sceneFreezeCache: {},
  blockDrag: null,
  _lastActiveUpdate: 0,

  // ── Background FX ────────────────────────────────────────────
  bgFx: {
    type: null,
    warp: 'none',
    blend: 'source-over',
    intensity:   0.85,
    speed:       1.0,
    particleColor1: null,
    particleColor2: null,
    centerBloomColor: '#ffffff',
    centerBloomOpacity: 0.0,
    metaRimOpacity: 0.35,
    crystalSpecOpacity: 0.35,
    fireHeat:    0.7,
    fireHeight:  0.6,
    smokeAmount: 0.6,
    smokeDensity: 1.0,
    smokeScale: 1.2,
    smokeCurl: 0.9,
    smokeViscosity: 1.1,
    smokeTongues: 1.1,
    smokeEdgeGlow: 0.35,
    starCount:   180,
    moonSize:    0.5,
    nebulaBloom: 0.6,
    shadowDepth: 0.7,
    shadowPulse: 0.5,
    leafCount:   60,
    windStrength:0.5,
    leafSize:    1.0,
    warpAmp:     0.4,
    warpFreq:    1.0,
    crystalFacets: 0.5,
    metaCount:   0.5,
    flowMode:   'default',
    flowAngle:  270,
    flowSpread: 0.6,
    originX:    0.5,
    originY:    0.5
  },

  bgFxStack: [],
  bgFxSelectedType: null,

  // ── BG particle / runtime state ───────────────────────────────
  bgParticles: [],
  _bgLastT: 0,
  _bgAccShadow: 0,
  _bgAccNature: 0,
  _bgAccCosmic: 0,
  bgSmokeParticles: [],
  bgStars: [],
  bgStarsInit: false,
  _bgOff: null,
  _bgOffCtx: null,
  _bgWarpOff: null,
  _bgWarpOffCtx: null,
  _bgOffW: 0,
  _bgOffH: 0,
  _bgFrameCounter: 0,

  // ── GL shader instances ───────────────────────────────────────
  _srGL: null,
  _grGL: null,

  // ── Crystal / metaball state ──────────────────────────────────
  _crystalPoints: [],
  _metaBalls: [],

  // ── Particle sprites ─────────────────────────────────────────
  _spriteEmber: null,
  _spriteSmoke: null,
  _smokeBuf: null,
  _smokeCtx: null,
  _smokeBW: 0,
  _smokeBH: 0,

  // ── Card particle pools ───────────────────────────────────────
  particlePools: {},

  // ── Scenes ───────────────────────────────────────────────────
  scenes: { 1: null, 2: null, 3: null, 4: null, 5: null },

  // ── Export frame ─────────────────────────────────────────────
  exportFrame: {
    x: 200, y: 100, w: 400, h: 400,
    outW: 1080, outH: 1080
  },
  efActive: false,
  efDrag: null,

  // ── Asset gallery drag ────────────────────────────────────────
  assetDragId: null,
  assetDragImg: null,

  // ── Background gradients ──────────────────────────────────────
  BG_GRADIENTS: {
    forest:   { stops: ['#050f05', '#0d2e0d'], angle: 135 },
    ember:    { stops: ['#1a0505', '#2e0d00'], angle: 135 },
    ash:      { stops: ['#111111', '#252525'], angle: 135 },
    abyss:    { stops: ['#000510', '#001030'], angle: 135 }
  },
  _activeGradPreset: null,
  _origBgColorFill: null,
  eyedropActive: false,

  // ── Toast ────────────────────────────────────────────────────
  toastTimer: null,

  // ── UI constants ─────────────────────────────────────────────
  HANDLE_SIZE: 7,

  // ── Hex cache ────────────────────────────────────────────────
  _hexToRgbCache: {}

};

// BGFX_DEFAULTS must be computed after AppState is defined
AppState.BGFX_DEFAULTS = JSON.parse(JSON.stringify(AppState.bgFx));

// ── Stock cards (built-in assets) — separate constant, not part of AppState ──
export var STOCK_CARDS = [
  { name: 'Combust', src: "assets/images/stock/combust.png" },
  { name: 'Exhume', src: "assets/images/stock/exhume.png" },
  { name: 'Moonchant', src: "assets/images/stock/moonchant.png" },
  { name: 'Pyroball', src: "assets/images/stock/pyroball.png" },
  { name: 'Refract', src: "assets/images/stock/refract.png" },
  { name: 'Thornsong', src: "assets/images/stock/thornsong.png" },
  { name: 'Thornwhip', src: "assets/images/stock/thornwhip.png" },
  { name: 'Wither', src: "assets/images/stock/wither.png" },

];

// Pre-load stock images into the images map on startup
(function() {
  STOCK_CARDS.forEach(function(sc) {
    var id = "__stock__" + sc.name.toLowerCase();
    var img = new Image();
    img.src = sc.src;
    AppState.images[id] = img;
    sc.id = id;
  });
})();
