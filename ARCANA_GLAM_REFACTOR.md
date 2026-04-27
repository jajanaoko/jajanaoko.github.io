# Arcana Glam — Refactor Guide
**For Claude Code (VS Code integration)**  
Last updated: April 2026 | Codebase: `Arcana_Glam/` | ~14,500 lines JS · 141 KB CSS

---

## HOW TO USE THIS DOCUMENT

This file lives in the project root and is the single source of truth for all planned changes.
Work through phases **in order**. Each phase is designed to be **one focused Claude Code session**.
Before starting any phase, re-read its section header and checklist.
After completing a phase, check off items and commit before moving on.

**Token economy rules (Pro plan):**
- Never ask Claude to rewrite an entire file from scratch. Always edit in place with targeted diffs.
- One phase per session. Stop and commit before starting a new conversation.
- Prefer `str_replace` / targeted edits over full-file regeneration.
- If a task feels too large for one session, split it at the nearest logical boundary.

---

## PROJECT OVERVIEW

Arcana Glam is a browser-based animated trading-card visual editor. Key capabilities:

- 2D Canvas editor with layered card assets
- Surface FX system: shimmer, luster, grain, ripple, holo (four modes)
- Spell particle system (fire, moonlight, arc, shadow, nature, neural)
- WebGL background shaders (magma, god-rays, smoke-ring)
- Three.js showcase mode with spring physics and gyro/tilt
- Timeline sequence editor with easing
- PNG + MP4/WebM export

**Entry point:** `Arcana_Glam_Mobile.html` (index.html redirects here)  
**State:** `js/state.js` → `AppState` object (single source of truth)

---

## CURRENT ARCHITECTURE PROBLEMS

Understanding these is essential before touching any code.

### Problem 1 — Three separate, unsynchronised render loops
- `app.js` → `loop()` → 2D canvas render
- `showcase-3d.js` → `_loop()` → Three.js render
- `video-export.js` → composite recording RAF

These run independently. Showcase mode uses `window._showcase3DActive` as a flag to suppress 2D card drawing. This is fragile and caused a past bug where custom cards weren't suppressed.

### Problem 2 — Cross-module communication via `window.*` globals
15+ implicit contracts cross module boundaries via `window._gyroTiltX`, `window._showcase3DActive`, `window._showcase3DParticleCtx`, etc. These are invisible to any tooling and make refactoring unpredictable.

Full list of globals in use:
```
window._gyroActive          set: mobile.js    read: app.js, showcase-3d.js
window._gyroTiltX/Y         set: mobile.js    read: showcase-3d.js, renderer.js
window._gyroVelocity        set: mobile.js    read: renderer.js, showcase-3d.js
window._gyroDeltaGamma/Beta set: mobile.js    read: showcase-3d.js
window._gyroAccelX/Y/Mag    set: mobile.js    read: showcase-3d.js
window._showcase3DActive    set: showcase-3d  read: app.js
window._showcase3DCanvas    set: showcase-3d  read: video-export.js
window._showcase3DParticleEl set: showcase-3d read: video-export.js
window._showcase3DParticleCtx set: showcase-3d read: app.js
window._showcase3DCardPositions set: showcase-3d read: mobile.js
window._tryStartGyro        set: mobile.js    read: showcase.js
window._deactivateGyro      set: mobile.js    read: showcase.js
window._collapseTimeline    set: timeline.js  read: mobile.js
window._expandTimeline      set: timeline.js  read: mobile.js
window._syncPlaybackRow     set: canvas-engine.js read: timeline.js
```

### Problem 3 — `app.js` is a god object (2,266 lines)
Responsibilities mixed inside one file:
- Render loop + update loop
- Card CRUD (createCard, createText, createRect, createCustomCard)
- Asset management (loadProject, saveProject, refreshAssetGrids)
- UI event wiring (inspector updates, DOM bindings)
- Background FX controls
- Autosave + undo/redo
- Animation easing functions
- Texture overlay drawing

### Problem 4 — Full 2D card re-render every frame in showcase mode
In Three.js showcase mode, `drawCard()` runs the entire surface FX pipeline (shimmer + grain + holo + luster + ripple) into a 440×616 offscreen canvas at 4× resolution **every frame**, even when nothing has changed. No dirty flag exists.

### Problem 5 — 73 KB monolithic `main.css`
No design tokens. Colors hardcoded as hex throughout. Mobile overrides duplicate selectors. Specificity hacks with `!important` scattered in.

### Problem 6 — 2D Canvas particles in a Three.js world
Spell particles split across two systems:
- Editor mode: 2D Canvas (`fx-engine.js`) — uses `shadowBlur` per particle (expensive GPU composite pass)
- Showcase mode: Three.js `Points` (`showcase-3d.js`) — correct GPU approach

The 2D system also has an O(N²) neural-web filament loop.

---

## WHAT TO NEVER CHANGE

These parts work correctly and touch performance-critical code. Do not refactor them unless a phase explicitly calls for it.

- Spring physics constants in `showcase-3d.js` (`ROT_STIFFNESS`, `ROT_DAMPING`, etc.)
- The three-level Three.js scene hierarchy: `anchor → floatGroup → rotGroup`
- The gyro/tilt hybrid model in `mobile.js` (pose + impulse channels, neutral baseline adaptation, deadband)
- WebGL shader GLSL source in `bg-fx-magma.js`, `bg-fx-godrays.js`, `bg-fx-smokering.js`
- Timeline sequence data model (`effect | wait | scene` step types with easing)
- Video export composite canvas approach in `video-export.js`
- `AppState` shape in `state.js` — only add fields, never rename or remove existing ones

---

## PHASES

---

## PHASE 1 — Quick wins: performance guards
**Estimated session length:** Medium (focused edits to 3 files)  
**Risk:** Low — additive only, no structural change  
**Commit message:** `perf: mobile guards, dirty flag texture bake, shadowBlur removal`

These are the highest ROI changes. They improve performance immediately without any architectural risk.

### 1A — Add a `PerfProfile` to `state.js`

Add this block to `AppState` in `js/state.js`, just after the `MAX_DPR` line:

```javascript
// ── Performance profile (computed once at startup) ────────────────────────
PERF_TIER: (function() {
  var mobile = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  var lowEnd = mobile && (navigator.hardwareConcurrency || 4) <= 4;
  return lowEnd ? 'low' : mobile ? 'mid' : 'high';
})(),
// Derived caps — read by all subsystems, never hardcode these inline
get PERF() {
  var t = this.PERF_TIER;
  return {
    maxParticles:   t === 'high' ? 200  : t === 'mid' ? 100  : 60,
    shaderOctaves:  t === 'high' ? 7    : t === 'mid' ? 5    : 4,
    texScale:       t === 'high' ? 4    : t === 'mid' ? 2    : 2,
    grainFps:       t === 'high' ? 6    : t === 'mid' ? 3    : 2,
    shadowBlur:     t === 'high',
    iridescentPass: t === 'high',
    neuralNodeCap:  t === 'high' ? 40   : 24,
    maxRays:        t === 'high' ? 72   : 32,
  };
}
```

### 1B — Version-counter texture baking in `showcase-3d.js`

**Design principle — read this before writing code:**

Dirty-flag systems are fragile. A single missed setter anywhere in the codebase produces a "only updates when I tap the canvas" bug — exactly the failure mode we fought in early development. The rules below are designed so that even if every `markCardDirty()` call site is wrong, **the canvas still feels alive** — stale cards correct themselves within 250 ms via a safety floor. The perf win comes from skipping 26 of every 30 frames on truly static cards, not from trusting dev discipline.

Three layers, stacked:

1. **Version counter** (not a boolean). Each card has `_version`; each Three.js mesh tracks `_bakedVersion`. Stale = `_bakedVersion !== _version`. Cannot "get stuck" — once bumped, the counter stays ahead until a bake catches up. Also naturally handles two mutations between bakes.
2. **Centralized `markCardDirty()` helper.** One function, called from every mutation site. One place to audit. Much safer than grepping the codebase for card property writes.
3. **Safety floor: 4 fps re-bake even when "static".** If a mutation site is ever missed, the card updates within 250 ms automatically. The user never sees a frozen card. Still ~87 % cheaper than the current every-frame bake.

---

#### Step 1 — Add `markCardDirty()` helper in `state.js`

Add to `js/state.js`, after the `AppState` object:

```javascript
// ── Card mutation tracking ────────────────────────────────────────────────
// Call this helper whenever any property of a card changes that could affect
// its baked texture (surface FX, text, colors, border, overlays, etc.).
// The version counter is read by the showcase-3d texture baker. A missed
// call here degrades gracefully to the 4fps safety-floor rebake — it will
// never freeze the card, only make the update slightly less immediate.
export function markCardDirty(card) {
  if (!card) return;
  card._version = (card._version | 0) + 1;
}
```

#### Step 2 — Add version fields in `createCard()` / `createCustomCard()` / `createText()` / `createRect()` in `app.js`

Add to every new card object, alongside existing fields:

```javascript
_version: 1,       // bumped by markCardDirty() on any mutation
```

(Meshes get `_bakedVersion: -1` at creation time in `showcase-3d.js` — see Step 4.)

#### Step 3 — Wire `markCardDirty()` into mutation sites

These are the minimum call sites. A missed one only costs up to 250 ms of lag (safety floor), not correctness.

**`renderer.js → applySurface()`** — at the end of the function:
```javascript
import { markCardDirty } from './state.js';
// ...
markCardDirty(card);
```

**`renderer.js` inspector handlers** — any input event handler that writes to card properties (text content, colors, border, luster toggle, grain toggle, etc.) should end with `markCardDirty(card);`.

**`timeline.js → applyAnimations()`** — when a sequence step mutates card properties, call `markCardDirty(card)` once per affected card per frame. Positional-only animations (`_ax`, `_ay`, `_ar`) that do not change the baked texture can skip this — those move the Three.js mesh, not the texture.

**`layers.js`** — when scene changes swap the active card set, call `markCardDirty()` on each newly-visible card.

**`card-builder.js`** — any finalize/apply step should call `markCardDirty()` on the resulting card.

#### Step 4 — Update `_captureCardTexture` in `showcase-3d.js`

**Find** `_captureCardTexture` (around line 420–480). Add this guard **at the very top**, before any drawing:

```javascript
function _captureCardTexture(obj) {
  var card = obj.card;
  if (obj._bakedVersion === undefined) obj._bakedVersion = -1;

  var now = performance.now();

  // ── hasAnim: anything that mutates the texture every frame ──────────────
  // Missing something here is not fatal — it just downgrades that card to
  // the 4fps safety floor (still 250ms max latency).
  var hasAnim =
    (card.shimmer && card.shimmer.on) ||
    (card.holo    && card.holo.on)    ||
    (card.ripple  && card.ripple.on)  ||
    (card.luster  && card.luster.on && st.globalLight && st.globalLight.on) ||
    (card.grain   && card.grain.on)   ||                         // grain ticks at PERF.grainFps
    (st.playback && st.playback.playing);                        // timeline may be easing this card

  var stale = obj._bakedVersion !== card._version;

  if (hasAnim) {
    // Animated: throttle to ~30fps (high) / ~20fps (mid, low)
    var fpsLimitMs = st.PERF_TIER === 'high' ? 33 : 50;
    if (!stale && obj._lastTexCapture && (now - obj._lastTexCapture) < fpsLimitMs) return;
  } else {
    // Static: rebake only if version bumped, OR if safety floor has elapsed.
    // The safety floor (250ms = 4fps) guarantees any missed markCardDirty()
    // call surfaces within a quarter second. This is what keeps the canvas
    // feeling alive even if mutation tracking drifts.
    var SAFETY_FLOOR_MS = 250;
    var aged = !obj._lastTexCapture || (now - obj._lastTexCapture) > SAFETY_FLOOR_MS;
    if (!stale && !aged) return;
  }

  obj._lastTexCapture = now;
  obj._bakedVersion   = card._version;

  // ... rest of existing function unchanged ...
```

**Also**, wherever a new mesh/obj is created in `showcase-3d.js`, initialize `obj._bakedVersion = -1;` so the first frame always bakes.

---

**Why not a pure dirty flag?** See the design principle at the top of this section. Short version: the boolean version of this code was proposed first and rejected because it reintroduces exactly the class of bug ("only updates on tap") we fixed earlier in the project. The version counter + safety floor is only a few lines more code and makes that bug category impossible.

### 1C — Remove `shadowBlur` from 2D particles

**In `js/fx-engine.js`**, find the section where `shadowBlur` is applied to particles (search for `shadowBlur`). It looks like:

```javascript
if (sz < 4 && shape !== 'smoke') {
  ctx.shadowBlur = sz * 4;
  ctx.shadowColor = col;
}
```

Replace with:

```javascript
// shadowBlur replaced: use larger glow gradient instead (avoids GPU composite pass)
// On high-perf tier only, shadowBlur is applied
if (sz < 4 && shape !== 'smoke' && st.PERF.shadowBlur) {
  ctx.shadowBlur = sz * 4;
  ctx.shadowColor = col;
}
```

Then ensure `ctx.shadowBlur = 0;` is reset after any particle draw call that uses it (search for wherever `shadowBlur` is cleaned up).

### 1D — Cap Neural Web node count

**In `js/fx-engine.js`**, find `drawNeuralWebAura` or where `countRaw` is set for the neural preset. Find the line like:
```javascript
var countRaw = card.spell.count || 40;
```

Replace with:
```javascript
var countRaw = Math.min(card.spell.count || 40, st.PERF.neuralNodeCap);
```

### 1E — Cap god-rays ray count on mobile

**In `js/bg-fx-godrays.js`**, find where `nRays` is computed:
```javascript
var nRays = 8 + density * 64;
```

Replace with:
```javascript
var rawRays = 8 + density * 64;
var nRays   = Math.min(rawRays, st.PERF.maxRays);
```

(Add `import { AppState as st } from './state.js';` at the top if not already present.)

### 1F — Disable shimmer iridescent pass on non-high tier

**In `js/renderer.js`**, find the shimmer iridescent condition (search for `shBlend === 'screen'` or `iridescent`):

```javascript
if (sh.blend === 'screen') { // iridescent pass
```

Replace with:

```javascript
if (sh.blend === 'screen' && st.PERF.iridescentPass) { // iridescent pass (high-tier only)
```

### Phase 1 checklist
- [ ] `PerfProfile` added to `state.js`
- [ ] `markCardDirty(card)` helper exported from `state.js`
- [ ] `_version: 1` added to `createCard` / `createCustomCard` / `createText` / `createRect` in `app.js`
- [ ] New Three.js mesh objects initialize `_bakedVersion = -1` in `showcase-3d.js`
- [ ] `applySurface()` in `renderer.js` calls `markCardDirty(card)` at end
- [ ] Inspector handlers in `renderer.js` that mutate card props call `markCardDirty(card)`
- [ ] `timeline.js → applyAnimations()` calls `markCardDirty(card)` when a step mutates texture-affecting props
- [ ] `layers.js` scene-swap path calls `markCardDirty()` on newly-visible cards
- [ ] `card-builder.js` finalize path calls `markCardDirty()` on the resulting card
- [ ] `_captureCardTexture` in `showcase-3d.js` uses version counter + `hasAnim` + 250 ms safety floor
- [ ] `hasAnim` check includes: shimmer, holo, ripple, luster, **grain**, **timeline playback**
- [ ] `shadowBlur` gated behind `st.PERF.shadowBlur` in `fx-engine.js`
- [ ] Neural Web node count capped in `fx-engine.js`
- [ ] God-rays ray count capped in `bg-fx-godrays.js`
- [ ] Shimmer iridescent pass gated behind `st.PERF.iridescentPass`
- [ ] Tested in editor mode: no visual regression
- [ ] Tested in showcase mode: cards still update when effects change (no "tap to update" bug)
- [ ] Tested in showcase mode: grain-only card still animates (validates `hasAnim` coverage)
- [ ] Tested in showcase mode: timeline playback updates card surface live
- [ ] Manually removed a `markCardDirty()` call and confirmed card still updates within ~250 ms (safety floor works)
- [ ] Committed

---

## PHASE 2 — Kill the `window.*` globals
**Estimated session length:** Medium  
**Risk:** Medium — touches 5 files, but only routing changes, not logic  
**Commit message:** `refactor: replace window._ globals with AppState and typed EventBus`

All cross-module communication moves through `AppState` or a small event bus. No logic changes — only how data is transported.

### 2A — Add namespaced state sections to `state.js`

Add to `AppState` in `js/state.js`:

```javascript
// ── Gyro / tilt (previously window._gyro*) ───────────────────────────────
gyro: {
  active:       false,
  tiltX:        0,      // -24..+24 range
  tiltY:        0,
  depth:        0,
  velocity:     0,
  deltaGamma:   0,
  deltaBeta:    0,
  accelX:       0,
  accelY:       0,
  accelMag:     0,
},

// ── Showcase 3D (previously window._showcase3D*) ─────────────────────────
showcase3d: {
  active:         false,
  canvas:         null,   // Three.js renderer canvas element
  particleEl:     null,   // particle overlay canvas element
  particleCtx:    null,   // 2D context of particle overlay
  cardPositions:  [],     // [{card, ndcX, ndcY}] — updated each frame
},

// ── UI callbacks (previously window._collapse/expandTimeline etc.) ───────
uiCallbacks: {
  collapseTimeline: null,
  expandTimeline:   null,
  syncPlaybackRow:  null,
},
```

### 2B — Update `mobile.js`

**Find every** `window._gyro*` assignment. Replace with `st.gyro.*`:

```javascript
// OLD:
window._gyroActive  = true;
window._gyroTiltX   = (_smoothX + wX) * _tiltStrength;
window._gyroVelocity = Math.sqrt(_velX * _velX + _velY * _velY);

// NEW:
st.gyro.active   = true;
st.gyro.tiltX    = (_smoothX + wX) * _tiltStrength;
st.gyro.velocity = Math.sqrt(_velX * _velX + _velY * _velY);
```

Similarly replace:
- `window._tryStartGyro = tryStart` → `st.uiCallbacks.tryStartGyro = tryStart`
- `window._deactivateGyro = deactivate` → `st.uiCallbacks.deactivateGyro = deactivate`
- `window._collapseTimeline` reads → `st.uiCallbacks.collapseTimeline && st.uiCallbacks.collapseTimeline()`

### 2C — Update `showcase-3d.js`

Replace all `window._gyroTiltX` reads with `st.gyro.tiltX` etc.
Replace all `window._showcase3DActive = true` assignments with `st.showcase3d.active = true`.
Replace all `window._showcase3DCanvas = ...` with `st.showcase3d.canvas = ...`.

### 2D — Update `app.js`

Replace all `window._showcase3DActive` reads with `st.showcase3d.active`.
Replace all `window._showcase3DParticleCtx` reads with `st.showcase3d.particleCtx`.
Replace `window._gyroActive` reads with `st.gyro.active`.

### 2E — Update `renderer.js`

Replace `window._gyroTiltX/Y` reads with `st.gyro.tiltX/Y`.
Replace `window._gyroVelocity` reads with `st.gyro.velocity`.

### 2F — Update `canvas-engine.js` and `timeline.js`

`window._syncPlaybackRow` → `st.uiCallbacks.syncPlaybackRow`
`window._collapseTimeline` / `window._expandTimeline` → `st.uiCallbacks.*`

### Phase 2 checklist
- [ ] New `gyro`, `showcase3d`, `uiCallbacks` sections added to `state.js`
- [ ] `mobile.js` — all `window._gyro*` replaced with `st.gyro.*`
- [ ] `mobile.js` — callback assignments updated
- [ ] `showcase-3d.js` — all `window._showcase3D*` replaced with `st.showcase3d.*`
- [ ] `showcase-3d.js` — all `window._gyro*` reads updated
- [ ] `app.js` — all `window._showcase3D*` reads updated
- [ ] `app.js` — `window._gyroActive` reads updated
- [ ] `renderer.js` — `window._gyroTiltX/Y/Velocity` reads updated
- [ ] `canvas-engine.js` — `window._syncPlaybackRow` updated
- [ ] `mobile.js` — timeline callback reads updated
- [ ] Grep for any remaining `window._` references (should be zero)
- [ ] Tested in editor mode
- [ ] Tested in showcase mode with mouse tilt
- [ ] Tested on mobile (gyro) if available
- [ ] Committed

---

## PHASE 3 — Split `app.js`
**Estimated session length:** Large — split into two sub-sessions (3A then 3B)  
**Risk:** Medium-High — many circular imports exist; resolve carefully  
**Commit message:** `refactor: split app.js into card-manager, asset-manager, render-loop`

`app.js` is 2,266 lines. The goal is to extract clearly bounded domains into separate files while keeping `app.js` as a thin bootstrap.

**IMPORTANT:** Do NOT change any function signatures or behavior during this phase. Pure extraction only.

### 3A — Extract `js/card-manager.js` (sub-session 1)

Move these functions from `app.js` to a new file `js/card-manager.js`:
- `createCard(frontImgId)`
- `createText()`
- `createRect()`
- `createCustomCard()`
- `syncRefs()`
- `updateCardCount()`
- `hideEmpty()`

New file header:
```javascript
// ============================================================
//  ARCANA GLAM — Card Manager  (card-manager.js)
//  Card CRUD: create, sync, count, empty-state helpers.
// ============================================================
import { AppState as st } from './state.js';
import { renderLayers } from './layers.js';
import { renderTimeline } from './timeline.js';

// paste extracted functions here
export { createCard, createText, createRect, createCustomCard,
         syncRefs, updateCardCount, hideEmpty };
```

In `app.js`, remove those functions and add:
```javascript
import { createCard, createText, createRect, createCustomCard,
         syncRefs, updateCardCount, hideEmpty } from './card-manager.js';
export { createCard, createText, createRect, createCustomCard,
         syncRefs, updateCardCount, hideEmpty }; // keep re-exports for existing consumers
```

### 3B — Extract `js/asset-manager.js` (sub-session 2)

Move from `app.js`:
- `saveProject()`
- `loadProject()`
- `clearSave()`
- `_scheduleSave()`
- `_serializeCards()`
- `_serializeBgFxStack()`
- `_flashSaveIndicator()`
- `refreshAssetGrids()`
- `renderStockGrid()`

New file: `js/asset-manager.js`  
Same pattern: import from state, export functions, re-export from app.js.

### 3C — Extract render loop to `js/render-loop.js`

Move from `app.js`:
- `loop(t)` (the RAF callback)
- `update(t)` (internal, make private to module)
- `render(t, dt)` (internal, make private)
- `registerAfterRenderHook(fn)`
- `registerUpdateInspectorHook(fn)`
- `drawTextureOverlay()`
- The easing functions (`easeLinear`, `easeOutCubic`, etc.)

`app.js` keeps `loop` exported as `renderFrame` for the legacy alias.

### Phase 3 checklist
- [ ] `js/card-manager.js` created with all card CRUD functions
- [ ] `app.js` imports from `card-manager.js` and re-exports
- [ ] `js/asset-manager.js` created with all persistence functions
- [ ] `app.js` imports from `asset-manager.js` and re-exports
- [ ] `js/render-loop.js` created with loop + render functions
- [ ] No circular import errors (check browser console)
- [ ] `makeSliderRow` moved to `js/ui-utils.js` (utility function — does not belong in any of the above)
- [ ] All existing imports from other modules (`renderer.js`, `layers.js`, etc.) still resolve
- [ ] Full smoke test: create card, add effects, play timeline, showcase mode
- [ ] Committed

---

## PHASE 4 — CSS tokens and `main.css` reduction
**Estimated session length:** Medium  
**Risk:** Low — purely additive tokens, then mechanical substitution  
**Commit message:** `style: design tokens, reduce main.css bloat`

### 4A — Create `css/tokens.css`

New file `css/tokens.css`:

```css
/* ============================================================
   ARCANA GLAM — Design Tokens
   All hardcoded values should reference these variables.
   ============================================================ */

:root {
  /* ── Colors ──────────────────────────────────────────────── */
  --color-bg-base:       #0A0A0F;
  --color-bg-panel:      #14141C;
  --color-bg-panel-alt:  #1C1C28;
  --color-bg-surface:    #20202E;
  --color-border:        rgba(255, 255, 255, 0.08);
  --color-border-mid:    rgba(255, 255, 255, 0.14);
  --color-accent-gold:   #C9A84C;
  --color-accent-gold-dim: rgba(201, 168, 76, 0.3);
  --color-text-primary:  #F0EAD6;
  --color-text-secondary: rgba(240, 234, 214, 0.6);
  --color-text-muted:    rgba(240, 234, 214, 0.35);

  /* ── Spacing ─────────────────────────────────────────────── */
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  12px;
  --space-lg:  16px;
  --space-xl:  24px;
  --space-2xl: 32px;

  /* ── Radii ───────────────────────────────────────────────── */
  --radius-sm:  4px;
  --radius-md:  8px;
  --radius-lg:  12px;
  --radius-xl:  16px;
  --radius-pill: 999px;

  /* ── Typography ──────────────────────────────────────────── */
  --font-ui:    'Inter', system-ui, sans-serif;
  --font-card:  'Cinzel', serif;
  --font-size-xs:  11px;
  --font-size-sm:  13px;
  --font-size-md:  14px;
  --font-size-lg:  16px;

  /* ── Transitions ─────────────────────────────────────────── */
  --transition-fast:   150ms ease;
  --transition-mid:    250ms ease;
  --transition-slow:   400ms ease;

  /* ── Shadows ─────────────────────────────────────────────── */
  --shadow-panel: 0 4px 24px rgba(0, 0, 0, 0.5);
  --shadow-card:  0 8px 32px rgba(0, 0, 0, 0.6);
}
```

### 4B — Import tokens in HTML

In `Arcana_Glam_Mobile.html`, add before all other CSS links:
```html
<link rel="stylesheet" href="css/tokens.css">
```

### 4C — Audit and shrink `main.css`

This is the high-effort step. Do it incrementally — one panel section at a time:

1. Search `main.css` for hardcoded hex values that match token colors. Replace with `var(--color-*)`.
2. Search for duplicated selectors that also exist in `components.css` or `effects.css`. Remove duplicates from `main.css`.
3. Search for all `!important` — most can be removed by increasing selector specificity properly.

**Target:** Reduce `main.css` from 73KB to under 40KB.  
**Do not** chase 100% token coverage in one session. Prioritize panel backgrounds, borders, and text colors.

### Phase 4 checklist
- [ ] `css/tokens.css` created
- [ ] Linked in `Arcana_Glam_Mobile.html` (first CSS import)
- [ ] All `#0A0A0F` / `#14141C` bg values in `main.css` → `var(--color-bg-*)`
- [ ] All `#C9A84C` accent values → `var(--color-accent-gold)`
- [ ] Obvious duplicate selectors removed between `main.css` and `components.css`
- [ ] `!important` count reduced (track: before/after grep count)
- [ ] No visual regression on desktop
- [ ] No visual regression on mobile
- [ ] Committed

---

## PHASE 5 — Unified Three.js particle system
**Estimated session length:** Large — most complex phase  
**Risk:** High — touches both render paths, creates new module  
**Commit message:** `feat: unified Three.js GPU particle system for editor + showcase`

This phase eliminates the split between 2D-canvas particles (editor) and Three.js particles (showcase). All spell particles move to a single GPU-based system visible in both modes.

**Pre-condition:** Phases 1–2 must be complete.

### 5A — Understand the existing 3D particle system

Before writing any code, read and understand `showcase-3d.js` lines ~800-1000 (the `_PART_MAX`, `Float32Array` pools, `ShaderMaterial`, and `_tickParticles` function). The new unified system is an extension of this, not a replacement.

### 5B — Create `js/particle-system.js`

New file. Move particle pool logic out of `showcase-3d.js` and `fx-engine.js` into a unified module:

```javascript
// ============================================================
//  ARCANA GLAM — Particle System  (particle-system.js)
//  Unified GPU particle pool for all spell effects.
//  Works in both 2D editor mode and Three.js showcase mode.
// ============================================================
import { AppState as st } from './state.js';
import { SPELL_PRESETS, FIRE_PALETTES } from './fx-engine.js';
```

Key design:
- In **editor mode** (no Three.js active): particles still draw to the 2D canvas using the existing `tickAndDrawParticles` path from `fx-engine.js`. Do NOT change this in Phase 5 — it's a fallback.
- In **showcase mode**: particles use Three.js `Points` exactly as they do today.
- Phase 5 only needs to ensure the same `SPELL_PRESETS` config drives both systems, and that particles are not drawn twice.

**Specifically fix the shadowBlur issue** (already done in Phase 1C) and the **O(N²) Neural Web** issue:

In `fx-engine.js`, find `drawNeuralWebAura`. The filament drawing loop currently creates a new path per filament. Batch it:

```javascript
// BEFORE (simplified):
nodes.forEach(function(n1) {
  nodes.forEach(function(n2) {
    if (dist(n1, n2) < threshold) {
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.quadraticCurveTo(mid.x, mid.y, n2.x, n2.y);
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  });
});

// AFTER — single path, flat color:
ctx.beginPath();
ctx.strokeStyle = baseColor; // one color for all filaments
nodes.forEach(function(n1) {
  nodes.forEach(function(n2) {
    if (dist(n1, n2) < threshold) {
      ctx.moveTo(n1.x, n1.y);
      ctx.quadraticCurveTo(mid.x, mid.y, n2.x, n2.y);
    }
  });
});
ctx.stroke(); // single draw call for all filaments
```

This reduces N² draw calls to 1 draw call. Color variation per filament is sacrificed — the visual result is still good.

### 5C — Prevent double particle draw

In `app.js` render function, the particle draw already checks `!window._showcase3DActive` (now `!st.showcase3d.active`). Verify this check is correct after Phase 2 changes.

### Phase 5 checklist
- [ ] Phase 1 and Phase 2 complete
- [ ] Neural Web filament loop batched into single `beginPath` / `stroke` call
- [ ] Single-path neural web tested visually (should look similar, not identical)
- [ ] No double particle draw in showcase mode
- [ ] Particle pool correctly cleans up on card delete
- [ ] Tested: fire preset in editor mode
- [ ] Tested: neural preset in showcase mode
- [ ] Committed

---

## PHASE 6 — Visual improvements (Three.js first)
**Estimated session length:** Medium per item — do one at a time  
**Risk:** Low — additive visual changes  
**Commit message:** `visual: [description of specific improvement]`

These are the "make it more lively and cohesive" improvements. Tackle them independently.

### 6A — Bloom post-processing on the Three.js scene

Three.js ships `UnrealBloomPass` in its examples. This adds glow to bright card surfaces and particles with a single post-processing pass, replacing the manual `shadowBlur` glow hacks.

```javascript
// In showcase-3d.js, after renderer init:
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

var _composer = null;
// In _initThree():
_composer = new EffectComposer(_renderer);
_composer.addPass(new RenderPass(_scene, _camera));
_composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.4,   // strength
  0.3,   // radius
  0.85   // threshold
));

// In _loop(), replace _renderer.render(_scene, _camera) with:
_composer.render();
```

Only enable on `st.PERF_TIER === 'high'`. On mid/low, fall back to `_renderer.render()`.

### 6B — Improve card idle breathing animation

The current breathing animation (`breathX/Y/Z` in `showcase-3d.js`) uses independent sine waves. Add a subtle **z-axis drift** to simulate the card floating:

Find the breathing block and increase the z-component slightly:
```javascript
// Increase breathZ amplitude from 0.003 to 0.006 for more noticeable float
breathZ = sin(t × 0.51) × 0.006 × breathMag;
// Also add a slow rotation shimmer around Y when idle:
var idleYSway = sin(t × 0.15) × 0.008 × breathMag;
rotGroup.rotation.y += idleYSway * (1 - ROT_DAMPING); // blend into spring
```

### 6C — Particle color themes tied to card holo mode

When a card has holo mode active, sync the spell particle color palette to the holo color:

In `fx-engine.js`, `getSpellPreset()` function:
```javascript
// After resolving the preset, if card.holo.on, tint the particle colors:
if (card.holo && card.holo.on && card.holo.refColor) {
  // Blend 30% toward holo color for visual cohesion
  preset.color  = blendHex(preset.color,  card.holo.refColor, 0.3);
  preset.color2 = blendHex(preset.color2, card.holo.refColor, 0.2);
}
```

### 6D — Background shader blend modes

Currently all BG FX stack items use `source-over`. Add a `blend` mode selector to the stack item UI so effects can be layered with `screen`, `overlay`, or `multiply`. The infrastructure exists (`bgFxStack[i].blend`) but may not be fully wired in the UI.

Check `fx-engine.js → drawBgEffectsStack()` to verify `ctx.globalCompositeOperation = layer.blend` is applied. If missing, add it.

### Phase 6 checklist
- [ ] 6A: Bloom pass working in showcase mode on high-tier devices
- [ ] 6A: Graceful fallback to plain render on mid/low tier
- [ ] 6B: Improved breathing tested — not too much, not too little
- [ ] 6C: Particle-holo color sync tested with fire + glass holo
- [ ] 6D: BG FX blend modes verified wired in stack
- [ ] Committed per item

---

## PHASE 7 — `main.css` continued reduction + mobile polish
**Estimated session length:** Medium  
**Risk:** Low  
**Commit message:** `style: continued CSS cleanup, mobile panel polish`

Continue from Phase 4. Now that tokens exist:

- Complete token substitution in `effects.css` and `components.css`
- Audit `mobile.css` for selectors that duplicate `main.css` — remove duplicates, keep mobile-only overrides
- Check that panel open/close transitions feel smooth on mobile (test on actual device or Chrome DevTools mobile emulator)
- Ensure timeline panel doesn't overlap canvas on small screens

---

## APPENDIX A — File map (current)

```
Arcana_Glam/
├── index.html                    # Redirect only
├── Arcana_Glam_Mobile.html       # Entry point
├── css/
│   ├── base.css                  # Reset + root
│   ├── layout.css                # Grid/flex layout
│   ├── main.css                  # 73KB — largest file, needs splitting (Phase 4)
│   ├── components.css            # UI components
│   ├── effects.css               # Effect toggles
│   ├── canvas.css                # Canvas wrapper
│   ├── layers.css                # Layers panel
│   ├── timeline.css              # Timeline editor
│   ├── panels.css                # Panel chrome
│   └── mobile.css                # Mobile overrides
├── js/
│   ├── state.js                  # AppState — single source of truth
│   ├── app.js                    # 2266 lines — god object (Phase 3 target)
│   ├── renderer.js               # drawCard + all surface FX + inspector UI
│   ├── fx-engine.js              # Spell particles + bg effect dispatcher
│   ├── showcase-3d.js            # Three.js overlay (showcase mode only)
│   ├── showcase.js               # Showcase enter/exit logic
│   ├── layers.js                 # Layer panel + scene CRUD
│   ├── timeline.js               # Sequence editor + playback
│   ├── card-builder.js           # Custom card builder UI
│   ├── canvas-engine.js          # Canvas resize + coordinate transforms
│   ├── input-controls.js         # Keyboard + pointer event handlers
│   ├── mobile.js                 # Touch/gyro input
│   ├── export.js                 # PNG export
│   ├── video-export.js           # MP4/WebM recording
│   ├── performance.js            # Perf mode init (thin wrapper)
│   ├── border-presets.js         # Border preset definitions
│   ├── icon-presets.js           # SVG icon preset definitions
│   ├── bg-fx-magma.js            # WebGL magma shader
│   ├── bg-fx-godrays.js          # WebGL god-rays shader
│   ├── bg-fx-smokering.js        # WebGL smoke-ring shader
│   ├── bg-fx-fire.js             # Canvas fire particles
│   ├── bg-fx-cosmic.js           # Canvas cosmic/stars
│   ├── bg-fx-crystal.js          # Canvas crystal points
│   ├── bg-fx-metaballs.js        # Canvas metaballs
│   ├── bg-fx-nature.js           # Canvas leaf particles
│   └── bg-fx-shadow.js           # Canvas shadow smoke
└── assets/
    ├── images/stock/             # 8 stock card PNGs (~18-31KB each)
    └── icons/presets/            # 8 SVG icon presets (tiny — inline these)
```

---

## APPENDIX B — Data flow diagram

```
User Input
    │
    ├─ Pointer/Touch ──► input-controls.js ──► AppState (selectedIds, drag state)
    │
    └─ Gyro/Mouse ──────► mobile.js ──────────► AppState.gyro (after Phase 2)

AppState
    │
    ├─ st.cards ──► renderer.js ──── drawCard() ──► 2D Canvas
    │                              └─ drawCustomCard()
    │
    ├─ st.cards ──► showcase-3d.js ── Three.js mesh textures ──► WebGL canvas
    │
    ├─ st.bgFxStack ──► fx-engine.js ──► bg-fx-*.js (WebGL shaders)
    │                                               └─► 2D Canvas drawImage
    │
    ├─ st.sequences ──► timeline.js ──► applyAnimations() ──► card _ax/_ay/_ar
    │
    └─ st.gyro ──────► showcase-3d.js ──► spring physics ──► rotGroup.rotation

Render Output
    ├─ st.canvas          (2D: background + overlays)
    ├─ _renderer.domElement (Three.js: 3D cards in showcase mode)
    └─ _particleEl         (2D overlay: spell particles in showcase mode)
```

---

## APPENDIX C — Known bugs to fix alongside refactor

| Bug | Where | Fix |
|-----|-------|-----|
| Custom cards not always suppressed in showcase mode | `app.js` render loop | Verify `!st.showcase3d.active` check covers `kind === 'custom'` |
| Grain texture allocated per-card, not shared | `renderer.js` | Create one grain source in AppState, reference in drawCard |
| Timeline scrubber doesn't update on mobile during playback | `timeline.js` | Check `updateScrubber()` call path in mobile RAF context |
| Video export sometimes produces black frame at start | `video-export.js` | Delay `captureStream` start by 1 frame after composite canvas renders |
| `hue-rotate` filter not reset between cards | `renderer.js` | Add `ctx.filter = 'none'` after each holo glass draw |

---

## APPENDIX D — Testing checklist (run after each phase)

**Editor mode:**
- [ ] Add a card from stock assets
- [ ] Enable shimmer + grain + holo (glass mode)
- [ ] Enable spell particles (fire preset)
- [ ] Play a timeline sequence
- [ ] Export PNG

**Showcase mode:**
- [ ] Enter showcase (tap showcase button)
- [ ] Verify cards display with 3D tilt
- [ ] Verify spell particles appear and animate
- [ ] Tilt/gyro input moves cards
- [ ] Cards flip on fast swipe gesture
- [ ] Exit showcase without errors

**Performance:**
- [ ] Open Chrome DevTools → Performance tab
- [ ] Record 3 seconds with shimmer + fire particles active
- [ ] Verify main thread frame budget under 16ms on desktop
- [ ] Test on mobile emulator (set to mid-tier device)

---

## APPENDIX E — Commit strategy

Work in small, testable increments. Suggested commit sequence:

```
perf: add PerfProfile to state.js
perf: dirty-flag texture bake in showcase-3d
perf: remove shadowBlur from 2D particles  
perf: cap neural web and god-rays on mobile
refactor: add gyro/showcase3d namespaces to AppState
refactor: migrate mobile.js window globals to AppState
refactor: migrate showcase-3d.js window globals to AppState
refactor: migrate app.js / renderer.js window global reads
refactor: extract card-manager.js from app.js
refactor: extract asset-manager.js from app.js
refactor: extract render-loop.js from app.js
style: create css/tokens.css
style: replace hex colors in main.css with tokens
feat: bloom post-processing in showcase mode
fix: hue-rotate filter not reset between cards
fix: grain texture shared via AppState
```

---

*End of document. When starting a new Claude Code session, load this file first and state which phase you are working on.*


---

## ADDENDUM — Hand Tracking Pre-wiring
**Source:** `interactive_camera_hand_tracking_feature_plan.md`  
**Decision:** Do NOT build the feature now. Wire the seams during the refactor so it slots in cleanly later.

---

### Why act on this now

The hand tracking plan defines a clean 3-layer architecture:

```
Camera Input → Tracking/Interpretation → Visual Response
```

That third layer — Visual Response — hooks directly into the **particle system** and the **physics spring**. Both of those are touched by our refactor. If we wire the seams correctly during the refactor, hand tracking becomes a matter of filling in the camera and tracking layers later. If we don't, adding it post-refactor means reopening the particle tick, the shader, and AppState all over again.

The cost of pre-wiring now: about 60 lines across 3 files.  
The cost of doing it later without pre-wiring: a second structural refactor of the same files.

---

### What the hand tracking feature actually needs from the engine

Cross-referencing the plan against the actual code:

| Feature need | Engine touch point | Current state |
|---|---|---|
| Attractor position (fingertip → particles) | `_tickParticles()` in `showcase-3d.js` — the `vx/vy/vz` update loop | **No force input exists.** Only gravity + sway + drag. |
| Velocity impulse (fast hand → turbulence) | Same tick loop — intensity scalar on sway/gravity | **No external intensity input.** Hardcoded from preset only. |
| Bloom / compression modes | Particle spawn rate + size scalar | **No external spawn/size multiplier.** |
| Fade to idle (hand lost) | All above should lerp to zero | **No input state bus at all.** |
| World-space hand position | Coordinate mapping (camera → Three.js world) | **No mapping utility exists.** |
| Particle shader attractor | `_PART_VERT` / `_PART_FRAG` GLSL | **No uniforms for external force.** Only per-particle attributes. |
| Pause tracking when tab hidden | `Page Visibility API` + tracking lifecycle | **Not present anywhere.** |
| Input state store | AppState or dedicated module | **Nothing.** Would be `window.*` globals again if added ad-hoc. |

---

### Changes to make during the refactor (not after)

#### STEP A — Add `handInteraction` to `AppState` (do in Phase 2 alongside `gyro`)

Add to `js/state.js`, in the new `gyro`/`showcase3d` block from Phase 2:

```javascript
// ── Hand interaction state (consumed by particle tick + spring physics) ──────
// Populated by hand-tracking module when built. All values default to
// "no interaction" so the particle system degrades gracefully without the feature.
handInteraction: {
  enabled:      false,   // master toggle — set true when camera mode is on
  active:       false,   // true only when a hand is currently detected
  
  // World-space attractor (Three.js coordinates, z = depth in front of card)
  // When active=false, particles ignore this.
  attractorX:   0,
  attractorY:   0,
  attractorZ:   0.15,    // default: slightly in front of card face
  
  // Force scalars — all 0 = no influence, 1 = full effect
  attractStrength:    0, // fingertip pull on nearby particles
  turbulence:         0, // velocity-based scatter (fast hand = high turbulence)
  bloom:              0, // open palm radial lift
  compression:        0, // pinch inward force
  
  // Interaction radius in Three.js world units (card is ~1 unit wide)
  radius: 0.6,
  
  // Fade multiplier — lerps to 0 when hand is lost, to 1 when detected
  // The particle tick multiplies all forces by this scalar.
  fade:   0,
}
```

**Why this shape:** It exactly matches the `ParticleControlSignals` interface from the feature plan. The tracking module writes to this object. The particle tick reads from it. Neither knows about the other.

---

#### STEP B — Add force application to `_tickParticles()` in `showcase-3d.js` (do in Phase 5)

Phase 5 already touches `showcase-3d.js` for the particle system. At that point, add attractor force reading inside the particle tick loop.

Find the per-particle physics block inside `_tickParticles` (the loop over `_PART_MAX`):

```javascript
// Current code (simplified):
ps.pos[i*3]   += ps.vx[i] * dtS;
ps.pos[i*3+1] += ps.vy[i] * dtS;
ps.pos[i*3+2] += ps.vz[i] * dtS;
ps.vy[i] += accelY * dtS;
ps.vx[i] += sway * dtS;
ps.vx[i] *= drag;
ps.vy[i] *= drag;
ps.vz[i] *= drag;
```

Add **after** the existing physics, still inside the loop:

```javascript
// ── Hand interaction force (reads from AppState.handInteraction) ──────────
// This block is a no-op when handInteraction.fade === 0 (default).
// When the hand tracking module is built, it writes to AppState.handInteraction
// and this code activates automatically — no changes needed here.
var hi = st.handInteraction;
if (hi.fade > 0.001) {
  var hFade = hi.fade; // 0..1 — lerps in when hand detected
  
  // Attractor force — pull toward fingertip position
  if (hi.attractStrength > 0) {
    var dx = hi.attractorX - ps.pos[i*3];
    var dy = hi.attractorY - ps.pos[i*3+1];
    var dz = hi.attractorZ - ps.pos[i*3+2];
    var dist2 = dx*dx + dy*dy + dz*dz;
    var r2 = hi.radius * hi.radius;
    if (dist2 < r2 && dist2 > 0.0001) {
      var strength = hi.attractStrength * hFade * (1.0 - dist2 / r2);
      ps.vx[i] += dx * strength * dtS * 2.0;
      ps.vy[i] += dy * strength * dtS * 2.0;
      ps.vz[i] += dz * strength * dtS * 2.0;
    }
  }
  
  // Turbulence — adds noise to velocity (velocity impulse from fast hand)
  if (hi.turbulence > 0.001) {
    var tScale = hi.turbulence * hFade * 0.08;
    ps.vx[i] += (Math.random() - 0.5) * tScale;
    ps.vy[i] += (Math.random() - 0.5) * tScale;
    ps.vz[i] += (Math.random() - 0.5) * tScale * 0.4;
  }
}
// ── End hand interaction ──────────────────────────────────────────────────
```

**This code costs exactly zero CPU when `hi.fade === 0`** — the `if (hi.fade > 0.001)` guard exits immediately. So it's safe to ship in Phase 5 with no performance impact.

---

#### STEP C — Add `fade` lerp to the showcase render loop (do in Phase 5)

The `fade` scalar needs to lerp smoothly toward 1 when a hand is active and toward 0 when it's lost. Add this to the top of `_loop()` or the physics tick in `showcase-3d.js`:

```javascript
// Lerp hand interaction fade — runs every frame, cheap
var hi = st.handInteraction;
if (hi.enabled) {
  var fadeTarget = hi.active ? 1 : 0;
  hi.fade += (fadeTarget - hi.fade) * 0.06; // ~10 frame smooth transition
  if (hi.fade < 0.001) hi.fade = 0; // snap to zero to re-enable the guard
}
```

This is the entire "graceful recovery when hand disappears" behavior from the plan, implemented in 4 lines.

---

#### STEP D — Add coordinate mapping utility to `js/showcase-3d.js` (do in Phase 5)

The plan requires mapping normalized camera coordinates (0..1 range, mirrored) to Three.js world space. Add this as a pure utility function — it doesn't need to run until the tracking module calls it:

```javascript
// ── Camera → World coordinate mapper ─────────────────────────────────────────
// Converts normalized camera-space hand position (0..1, top-left origin, mirrored)
// to Three.js world coordinates in the interaction volume in front of the card.
//
// Called by the future hand tracking module.
// interactionDepth: z distance in front of card face (default 0.15)
export function cameraToInteractionWorld(normX, normY, normZ, interactionDepth) {
  // Mirror X so moving hand left feels like left in the scene
  var wx = (0.5 - normX) * 1.8;    // spans roughly ±0.9 world units (card is 1 unit wide)
  var wy = (0.5 - normY) * 2.5;    // spans roughly ±1.25 world units
  // normZ: treat as force depth modifier (0 = far, 1 = very close)
  // Rather than exact depth, use it to modulate force intensity
  var wz = (interactionDepth || 0.15) + normZ * 0.1;
  return { x: wx, y: wy, z: wz, depthScale: 0.5 + normZ * 0.5 };
}
```

When the tracking module is built, it calls `cameraToInteractionWorld(palm.x, palm.y, palm.z)` and writes the result into `st.handInteraction.attractorX/Y/Z`.

---

#### STEP E — Add `Page Visibility` pause hook (do in Phase 2 alongside window globals cleanup)

The plan explicitly requires pausing tracking when the tab is hidden. Add the hook to `app.js` bootstrap (or `render-loop.js` after Phase 3):

```javascript
// Page Visibility — pause expensive tracking when tab is hidden
document.addEventListener('visibilitychange', function() {
  st.handInteraction.enabled && (st.handInteraction.active = false);
  // When tracking module exists: it will also hook this to pause camera input
  // For now this just zeroes the fade naturally via the fade lerp
});
```

---

### What is explicitly NOT pre-wired

These belong in a future dedicated session, not the refactor:

| Component | Why not now |
|---|---|
| `cameraController` module | Needs `getUserMedia` + permission UI — a separate feature scope |
| `handTrackingService` (MediaPipe) | 3rd party library load, separate bundle concern |
| `gestureInterpreter` | Pure logic on top of tracking data — no engine hooks needed |
| UI states (permission denied, loading, hand lost) | Pure UI work in HTML/CSS |
| Debug overlay (landmark visualizer) | Dev tool only |

---

### Summary: what changes in which phase

| Phase | File | Addition |
|---|---|---|
| Phase 2 | `state.js` | `handInteraction` state block (Step A) |
| Phase 2 | `app.js` / `render-loop.js` | Page Visibility hook (Step E) |
| Phase 5 | `showcase-3d.js` | Attractor force loop in `_tickParticles` (Step B) |
| Phase 5 | `showcase-3d.js` | `fade` lerp in render loop (Step C) |
| Phase 5 | `showcase-3d.js` | `cameraToInteractionWorld()` utility export (Step D) |

**Total new lines added across the refactor: ~65**  
**Future hand tracking module entry points: write to `st.handInteraction.*`, call `cameraToInteractionWorld()`**

---

### How to start the hand tracking feature later (when ready)

When you open that future project, here is the exact integration checklist:

1. Create `js/camera-controller.js` — `getUserMedia`, stream lifecycle, readiness state
2. Create `js/hand-tracking-service.js` — MediaPipe wrapper, returns raw landmarks
3. Create `js/gesture-interpreter.js` — computes palm center, pinch, openness, velocity from landmarks
4. In `js/showcase.js` (or new `js/showcase-mode-controller.js`):
   - Wire toggle UI → `st.handInteraction.enabled = true`
   - On each tracking frame: call `gestureInterpreter`, call `cameraToInteractionWorld()`, write results to `st.handInteraction.*`
   - Set `st.handInteraction.active = true/false` based on hand presence
5. The particle system and fade lerp already respond — no changes needed to `showcase-3d.js`

