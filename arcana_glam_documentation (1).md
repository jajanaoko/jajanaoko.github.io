# Arcana Glam — Technical Documentation

## Overview

Arcana Glam is a browser-based visual sandbox for designing animated trading-card visuals. It combines a 2D Canvas renderer, a Three.js WebGL card showcase, a particle/spell FX engine, background WebGL shaders, a timeline editor, and a video export pipeline.

Primary capabilities:
- Place and transform card assets on a zoomable 2D canvas
- Apply a stacked surface effects system (shimmer, luster, grain, ripple, holo, glare)
- Animate cards using a timeline with sequenced steps
- Trigger spell particle effects per card
- Control global lighting and animated background effects
- View cards in an interactive 3D showcase with gyroscope or mouse tilt
- Export PNG frames or MP4/WebM video recordings

---

## Module Map

| File | Responsibility |
|------|---------------|
| `app.js` | Main loop, render pipeline, card CRUD, asset management, 2D event handling |
| `state.js` | Shared mutable state (`AppState`) — single source of truth |
| `renderer.js` | `drawCard` and all surface FX; `drawCustomCard`; surface/inspector UI |
| `fx-engine.js` | Spell particle pool, neural web aura, fire palette definitions |
| `bg-fx-magma.js` | WebGL magma/lava background shader |
| `bg-fx-godrays.js` | WebGL god-rays background shader |
| `bg-fx-smokering.js` | WebGL smoke-ring background shader |
| `showcase-3d.js` | Three.js overlay, card physics, 3D particle system, texture capture |
| `mobile.js` | Touch/gyro input, drawer UI, showcase tilt spring |
| `canvas-engine.js` | Canvas resize observer, coordinate transforms, panel resizers |
| `timeline.js` | Sequence editor, step types, easing, playback |
| `video-export.js` | `MediaRecorder` recording with composite canvas for 3D mode |
| `layers.js` | Layer panel, scene save/restore, card selection |
| `export.js` | PNG frame export pipeline |
| `card-builder.js` | Custom card builder UI |

---

## Rendering Pipeline

### 2D Render Loop (`app.js → loop() → render()`)

Every animation frame:

```
1. Background fill
   └─ solid st.bgColor OR linear gradient preset

2. Background image (st.bgImage)
   └─ cover-fit drawImage at st.bgOpacity

3. Background FX (WebGL shaders, see below)
   └─ drawBgEffectsStack() OR drawBgEffects()
   └─ Each shader renders to an offscreen WebGL canvas, then drawImage onto main canvas

4. Global lighting (drawGlobalLighting)
   └─ mode 'glow'  → lighter composite radial gradient
   └─ mode 'shade' → multiply composite radial gradient
   └─ mode 'both'  → both passes

5. Cards (per-card, sorted by _orbitDepth if any card has orbit)
   └─ kind='text'   → drawTextObj
   └─ kind='rect'   → drawRectObj
   └─ kind='custom' → drawCustomCard  [skipped if _showcase3DActive]
   └─ kind=default  → drawCard        [skipped if _showcase3DActive]
   └─ spell.on      → tickAndDrawParticles

6. Resize/selection handles
```

When `window._showcase3DActive` is `true`, steps 5–6 card drawing is suppressed for all non-custom card types. The Three.js overlay takes over that responsibility. Custom card drawing was previously unsuppressed (bug, now fixed).

### Three.js Render Loop (`showcase-3d.js → _loop()`)

Runs in a separate `requestAnimationFrame` chain alongside the 2D loop:

```
1. Per-card texture capture (drawCard/drawCustomCard → 440×616 offscreen canvas → THREE.Texture)
2. Per-card sheen texture capture (sheen gradients → 440×616 canvas → sheenTex)
3. _tickPhysics() — spring physics, flip detection, breathing
4. 3D particle tick + GPU buffer upload
5. Global light sync → keyLight color/intensity
6. _renderer.render(scene, camera)
7. NDC position export → window._showcase3DCardPositions (for tap targeting)
```

### Video Recording Compositing (`video-export.js`)

`captureStream()` can only record one canvas. In showcase mode three canvases are stacked:

| Z-order | Canvas | Content |
|---------|--------|---------|
| 1 (bottom) | `st.canvas` | Background, BG FX, 2D elements |
| 2 | `_renderer.domElement` | Three.js 3D cards |
| 3 (top) | `_particleEl` | 2D spell particles on top of 3D |

When `_showcase3DActive` is true, recording creates an offscreen composite canvas matching `st.canvas` pixel dimensions, runs a `requestAnimationFrame` loop to `drawImage` all three layers in order, and records the composite via `captureStream(60)`.

---

## Surface Effects System

Surface effects are applied inside `drawCard` in `renderer.js`, all clipped to the card's rounded-rect boundary. They stack in this draw order:

```
Card body (image or placeholder gradient)
  → Glare
  → Shimmer  (+optional iridescent pass)
  → Luster   (+conditional rim-light)
  → Grain
  → Ripple
  → Holo     (one of four modes)
```

All effects use Canvas 2D compositing operations (`globalCompositeOperation`). Effects are drawn over the card image and blend with it using the modes described below.

---

### Glare

A radial gradient hotspot representing a direct specular highlight.

- **Technique**: `createRadialGradient` centered on `gl.x, gl.y`, blended with `screen`
- **Reactivity**: Driven by `st.globalLight` position; only rendered when `gl.on && gl.intensity > 0.01`
- **Parameters**: intensity, spread (radius), x, y position

---

### Shimmer

Animated diagonal light sweep bands moving across the card.

- **Technique**: Linear gradients at 45° angle, full-card `fillRect` per band
- **Blend mode**: `soft-light` (default) or `screen` (iridescent variant)
- **Iridescent pass**: When `shBlend === 'screen'`, a second pass draws a 9-stop HSL rainbow gradient per band at `screen` blend — this is the most expensive shimmer variant
- **Reactivity**: Tilt boost via `hov.tilt`; velocity flash boost from `_gyroVelocity`
- **Parameters**: width (0.2), speed (0.7), bands (2), opacity (0.22), blend mode
- **Per-frame cost**: `bands × 2` `fillRect` calls if iridescent; `bands` otherwise

---

### Luster

Soft atmospheric depth glow with an optional rim-light on the edge toward the tilt.

- **Technique**: Primary — large `createRadialGradient` center glow; secondary — smaller rim gradient
- **Blend mode**: `overlay`
- **Rim condition**: Only rendered when `|tiltFrac| > 0.05` (avoids drawing when card is at rest)
- **Parameters**: radius (0.75), opacity (0.35), pulse (0.3), color (#c9a84c)

---

### Grain

Animated film-grain noise texture overlaid on the card.

- **Technique**: Per-pixel sin-hash noise via `createImageData` + `putImageData`, then `drawImage` scaled to card size
- **Update rate**: Quantized to ~6 fps (`seed = Math.floor(t × 0.006 × (0.1 + grAnim))`) — does **not** regenerate every frame
- **Caching**: `c._grainCache` keyed by seed; evicts oldest entry when two entries exist
- **Blend mode**: `overlay`
- **Parameters**: amount (0.12), scale (1.0), anim speed (0.4)
- **Mobile note**: Full-resolution pixel operation. Most expensive at high DPR. The ~6 fps quantization is the primary guard against this being a bottleneck.

---

### Ripple

Concentric animated rings emanating from the card center.

- **Technique**: Per-ring `ctx.scale` + elliptical `arc` path + fill
- **Reactivity**: Origin shifts toward tilt direction; rings compress on tilt axis (elliptical distortion)
- **Blend mode**: `screen`
- **Parameters**: rings (0–3), spread (0.5), speed (0.8), color (#88bbff), opacity (0.18)

---

### Holo (four modes)

The most complex surface effect — four distinct rendering modes behind one toggle.

#### Glass (default)
Parallax overlay of the card's own front image, animated with a cycling hue-rotate filter to produce the iridescent foil look. A second additive pass draws a 9-stop rainbow gradient wash.

- **Performance note**: `ctx.filter = 'hue-rotate(...)'` triggers a full-canvas GPU filter compositing operation. This is applied per-card, per-frame, when enabled.

#### Sparkle
70+ pre-computed scatter points (cached — only regenerated if count changes). 38% are 4-point cross stars, the rest are dots. Each point independently flashes via `sin(t × speed + phase)²` — the square sharpens the pulse into a glitter snap.

- **Per-frame cost**: O(sparkle count) path draws + alpha math; no gradient creation

#### Hex Foil
Tessellated hexagonal grid covering the card surface. Each cell has an independent animated hue driven by `hxPhase + spatial offset`. Both fill (32% alpha) and stroke (72% alpha) are drawn per hex.

- **Per-frame cost**: O(grid cells) — scales with cell size. Smaller cells = more draw calls.

#### Aurora
Two overlapping diagonal linear gradients (9 stops each) at slight opposing angles (0.38 and -0.22 rad), sweeping at different speeds to create a Northern Lights shimmer.

- **Per-frame cost**: 2 gradient objects + 2 `fillRect` — cheap

---

## Background Effects

All three background effects use WebGL shaders. They render to a persistent offscreen WebGL canvas at a fraction of screen resolution, then are scaled up via `drawImage` to fill the main canvas.

### Resolution Scaling

| Effect | Desktop | Mobile (`≤768px`) |
|--------|---------|------------------|
| Magma | 0.50× | 0.35× |
| God Rays | 0.60× | 0.45× |
| Smoke Ring | 1.00× | 1.00× |

At 390×844 (iPhone 15), Magma renders at **~137×296 pixels** — reducing per-pixel shader cost by ~8× vs full resolution.

---

### Magma

Procedural lava/magma convection field.

- **Technique**: GLSL fragment shader — domain-warped FBM (Fractional Brownian Motion)
- **Octaves**: 7 (most expensive BG effect)
- **Key passes**:
  1. Domain warp: FBM used to distort the sample coordinates before the main noise pass — creates the flowing lava-plate look
  2. Voronoi crust: 3×3 grid cell iteration with sub-crack FBM for plate boundaries
  3. Temperature ramp: smoothstep color map from dark red → orange → yellow → white core
  4. Ridged FBM veins: secondary texture layer for bright hairline cracks
  5. Hot-spot flares + breathing oscillation
  6. Tonemap + gamma (0.95, 1.0, 1.1)
- **Uniforms**: `u_intensity`, `u_crust` (0–1 voronoi blend), `u_scale` (3.0), `u_color1/2` (tint)
- **State**: `st._magmaGL` — single WebGL canvas reused across frames, only resized if dimensions change

---

### God Rays

Radial light beams streaming from a configurable source point.

- **Technique**: GLSL fragment shader — angular stripe sampling
- **Ray count**: `8 + density × 64` — up to 72 rays at max density
- **Key passes**:
  1. Angular ray bands: atan2-based angular coordinate, slot-quantized with smoothstep edges
  2. Duty cycle + spotty randomization (hash function) — avoids mechanical regularity
  3. Radial fade: `exp(-r × 0.6)` falloff + near-origin `smoothstep` clip
  4. 4-stop color ramp
  5. Bloom layer + mid-glow secondary radial gradient
- **Uniforms**: `u_intensity`, `u_density`, `u_spotty`, `u_midSize`, `u_midInt`, `u_grOffsetX/Y`, `u_speed`
- **Performance note**: At `density = 1.0`, 72 ray evaluations per pixel — the most GPU-intensive BG effect per pixel. Mitigated by 0.45–0.60× resolution downscale.

---

### Smoke Ring

Animated concentric smoke/energy toroid.

- **Technique**: GLSL fragment shader — FBM in polar coordinates
- **Octaves**: 4
- **Key passes**:
  1. Polar FBM: noise computed in (r, θ) space for organic ring warping
  2. Ring mask: `smoothstep` annulus at `u_radius` with `u_thickness` width
  3. Optional inner fill at lower opacity
  4. 3-stop color ramp (c1 → c2 → c3)
  5. Gamma correction (0.85)
- **Uniforms**: `u_radius` (0.28), `u_thickness` (0.7), `u_inner` (0.7), `u_nscale` (1.5), `u_niter` (4), `u_zoom` (1.0)

### Background Effect Stack

Multiple background effects can be layered simultaneously via `drawBgEffectsStack()`. Each enabled effect renders its WebGL canvas and `drawImage`s it onto the main canvas in sequence. Blend mode and opacity per layer can be configured.

---

## Spell Particle System

### 2D Particles (Canvas mode, `fx-engine.js`)

**Presets** (defined in `SPELL_PRESETS`):

| Preset | Spawn edge | Max particles | Blend | Notable behaviour |
|--------|-----------|---------------|-------|-------------------|
| Fire | bottom 65%, sides 17.5% each | 40 × 3 = 120 | screen | Gravity -0.038, drag 0.976, rises upward |
| Nature | around perimeter | pool | screen | Gentle -0.015 gravity, petal shapes |
| Moonlight | around perimeter | pool | screen | Long lifespan 1.8–3.5s, orb shapes |
| Shadow | base (bottom) | pool | multiply | Smoke billows, dark palette, 16–30px |
| Arc | edge-out | pool | screen | Fast sparks, 0.35s lifespan, tiny 0.5–1.3px |
| Neural | (no particles) | — | screen | Filament aura only, no particle pool |

**Fire Palettes** (`FIRE_PALETTES`): 5 palettes (fire, ice, poison, arcane, soul), each with core / mid / tip color zones. Palette is sampled by particle age to produce temperature-correct coloring.

**Pool management**:
```
Max pool size = card.spell.count × 3
Spawn rate    = count × intensity × 0.016 × (dt / 16)  particles per frame
Lifetime      = random between preset lifeMin / lifeMax
```

Each particle tick: `life -= dt/1000`, physics (velocity + gravity + drag + sway), fade envelope, draw.

**Per-particle draw**:
- `ctx.save / ctx.translate / ctx.rotate / ctx.restore`
- `createRadialGradient` for glow halo
- `shadowBlur` enabled when `sz < 4px` and shape ≠ smoke — this is the most expensive per-particle operation

**Neural Web Aura** (activated by Neural preset):
- Nodes: 60% perimeter-orbiting, 40% interior-wandering
- Connections: Quadratic Bézier lines between nodes within distance threshold — O(N²) line draws
- Background: Radial gradient nebula glow
- Node visuals: Large soft glow + white core dot
- Per-frame cost scales quadratically with node count (`countRaw = 40` default → ~12 perimeter × 12 interior = 144 filaments)

---

### 3D Particles (Showcase mode, `showcase-3d.js`)

In showcase mode, spell particles are handled by a Three.js `Points` object per card, attached to `rotGroup` so they rotate with the card.

**Pool per card** (`_PART_MAX = 200`):
```javascript
pos:   Float32Array(200 × 3)   // x, y, z positions
col:   Float32Array(200 × 3)   // r, g, b
alpha: Float32Array(200)
psize: Float32Array(200)
vx/vy/vz: Float32Array(200)   // velocity
age/life/isize: Float32Array(200)
active: Uint8Array(200)
```

**Spawn rate**: `55 × spell.intensity` particles/second

**Shader material** (custom GLSL):
- Vertex: Positions + point size from `a_psize` attribute, `gl_PointSize` set in clip space
- Fragment: Circular soft-edge disc with per-particle color + alpha
- Blend: Additive (`THREE.AdditiveBlending`), `depthWrite: false`

**GPU upload**: Every tick that has active particles, four `BufferGeometry` attributes are marked `needsUpdate = true` — this uploads the full Float32Array buffers to the GPU each frame.

---

## Three.js Showcase System

### Transform Hierarchy

Each card object has a three-level scene graph hierarchy:

```
anchor (Group)       — fixed at layout position, never moves
  └─ floatGroup (Group)  — receives position drift (lean consequence)
       └─ rotGroup (Group)  — receives rotations; all geometry lives here
            ├─ bodyMesh   (ExtrudeGeometry — card thickness + bevel)
            ├─ faceMesh   (ShapeGeometry @ z = +0.006 — front face)
            ├─ sheenMesh  (ShapeGeometry @ z = +0.008 — additive sheen overlay)
            ├─ backMesh   (ShapeGeometry @ z = -0.006, rotation.y = π — back face)
            └─ partPoints (THREE.Points — spell particles)
```

**Materials**:
- Body: `MeshStandardMaterial` (color `#1a1025`, roughness 0.55, metalness 0.28)
- Face/Back: `MeshBasicMaterial` (texture from canvas capture, `toneMapped: false`)
- Sheen: `MeshBasicMaterial` (additive blend, opacity 0.18)
- Particles: Custom `ShaderMaterial` (additive blend, `depthWrite: false`)

---

### Texture Capture

Every frame, each card's face texture is regenerated by calling the full 2D renderer into an offscreen canvas:

```
1. Temporarily move card to canvas center: x = TEX_W/2, y = TEX_H/2, scale = 4, rot = 0
2. Suppress glare (tilt-reactive effect, handled by separate sheen layer instead)
3. Call drawCard() / drawCustomCard() onto capCtx (440 × 616 px)
4. Restore card transform
5. THREE.Texture.needsUpdate = true
```

This means the full surface FX pipeline (shimmer, luster, grain, ripple, holo) runs into an offscreen canvas at 4× resolution every frame. This is intentional — effects are baked into the texture and follow the 3D card geometry exactly.

**Sheen texture** is captured separately into a second 440×616 canvas: specular hotspot gradients driven by tilt and `_gyroVelocity`, then applied to `sheenMesh` as an additive overlay. This separates tilt-reactive glare from the static baked face texture.

---

### Physics

Spring physics govern card rotation, position, and flip state.

**Spring constants**:
```
ROT_STIFFNESS = 0.032   ROT_DAMPING = 0.92
POS_STIFFNESS = 0.020   POS_DAMPING = 0.90
Z_STIFFNESS   = 0.030   Z_DAMPING   = 0.90
```

**Rotation limits**:
```
MAX_PITCH (rotX) = 0.17 rad   MAX_YAW (rotY)  = 0.17 rad
MAX_ROLL  (rotZ) = 0.055 rad
```

**Tilt input**: Reads `window._gyroTiltX/Y` (set by `mobile.js` from either the gyroscope or the mouse position, normalized to -24..+24 range). Divided by `GYRO_NORM = 24` to produce a -1..1 input.

**Position drift**: Derived from rotation — the float position is a consequence of tilt, not independent:
```
targetPX = -rotY × 0.16
targetPY =  rotX × 0.12
targetPZ = (|rotX| + |rotY|) × MAX_DRIFT_Z × 0.5
```

**Breathing**: 3-axis sinusoidal idle oscillation that fades out as tilt increases:
```
breathMag = max(0, 1 - (|rotX| + |rotY|) × 3.5)
breathX = sin(t × 0.38) × 0.006 × breathMag
breathY = cos(t × 0.29) × 0.004 × breathMag
breathZ = sin(t × 0.51) × 0.003 × breathMag
```

**Card flip**: Triggered when `|velY| > 0.13 rad/frame` with a 45-frame cooldown. When flipped, the spring target shifts by `Math.PI`, driving the card through 180°. Face/back visibility swaps at the 90° crossing via `Math.cos(rotY) >= 0`.

---

### Global Light → 3D

When `st.globalLight.on` is true, the 3D scene's `keyLight` and `ambientLight` are synced every frame:

```
keyLight.color    = RGB from st.globalLight.color
keyLight.intensity = st.globalLight.intensity × 0.8
ambientLight.color = lerp(white, keyLight.color, intensity × 0.35)
ambientLight.intensity = 0.40 base
```

When the light is off: ambient falls back to `0.60` white.

---

## Gyroscope / Tilt Input System (`mobile.js`)

### Hybrid Orientation Model

The tilt system uses a **hybrid approach** combining two input channels:

**Pose channel** — Absolute orientation relative to a dynamic neutral baseline:
```
relGamma = rawGamma - neutralGamma   (left/right tilt)
relBeta  = rawBeta  - neutralBeta    (forward/back tilt)

poseX = clamp(relGamma / 30, -1, 1)
poseY = clamp(-relBeta / 40, -1, 1)
```

**Impulse channel** — Delta-based angular velocity for lively responsive kicks:
```
impulseX += deltaGamma / 90   (clamped to ±0.4)
impulseY -= deltaBeta  / 90
```
Impulse decays at `0.94` per tick when the phone is still.

**Combined target** (weights tunable):
```
targetX = poseX × 0.70 + impulseX × 0.30
targetY = poseY × 0.70 + impulseY × 0.30
```

**Neutral baseline** (`neutralGamma/Beta`):
- Set once on showcase enter — 300ms settle window averages 5–20 readings
- Slowly adapts when still: `neutral += (raw - neutral) × 0.02` after 17 consecutive still frames (~340ms at 50Hz)
- Stillness condition: `|deltaGamma| + |deltaBeta| < 0.5` AND `gyroAccelMag < 1.5`

This means the card is always neutral at whatever posture the user opens the showcase in (on table or held upright), and re-centers silently when they pause.

**Deadband**: `|relGamma| < 1.2°` and `|relBeta| < 1.5°` → clamped to zero (suppresses hand tremor).

**High-pass accelerometer**: `accelerationIncludingGravity` includes gravity bias. A low-pass filter (`alpha = 0.08`) estimates the gravity component; the high-pass result (`raw - LP`) is what's exported to `window._gyroAccelX/Y` for 3D physics impulses.

**Spring** (`mobile.js tick()`):
- Stiffness `0.06`, damping `0.88` — slow, heavy, barely overshooting
- Exports `window._gyroTiltX/Y` = `smoothX/Y × 24` to the rest of the app

**Mouse** (desktop): `onMouseMove` maps cursor to `-1..1` directly via `setTarget()`. Mouse path uses the same spring, bypassing the pose/impulse split entirely. Decay `targetX × 0.96` per tick returns the card to center when the mouse is still.

---

## Performance Analysis & Mobile Bottlenecks

### Effect Cost Table

| Effect | Technology | Resolution | Per-frame CPU | Per-frame GPU | Notes |
|--------|-----------|------------|--------------|--------------|-------|
| Magma | WebGL GLSL | 35–50% | Low | **HIGH** — 7-octave FBM + Voronoi | Biggest BG cost |
| God Rays | WebGL GLSL | 45–60% | Low | **HIGH** at density=1 — 72 ray samples | |
| Smoke Ring | WebGL GLSL | 100% | Low | Medium — 4-octave FBM | |
| Shimmer | Canvas 2D | 100% | Medium | Low | +iridescent doubles cost |
| Luster | Canvas 2D | 100% | Low | Low | Rim-light conditional |
| Grain | Canvas 2D | 100% | **Medium** — ImageData alloc | Low | Quantized to ~6fps |
| Ripple | Canvas 2D | 100% | Low | Low | |
| Holo (glass) | Canvas 2D | 100% | Medium | **Medium** — hue-rotate filter | Per card per frame |
| Holo (sparkle) | Canvas 2D | 100% | Low | Low | Cached positions |
| Holo (hex) | Canvas 2D | 100% | Medium | Medium | Scales with cell count |
| Holo (aurora) | Canvas 2D | 100% | Low | Low | |
| Spell particles | Canvas 2D | 100% | **HIGH** | Medium | shadowBlur expensive |
| Neural Web | Canvas 2D | 100% | **HIGH** | Medium | O(N²) filament draws |
| 3D Texture capture | Canvas 2D | 4× offscreen | **HIGH** | Medium | Full card render/frame |
| 3D Sheen capture | Canvas 2D | 4× offscreen | Low | Low | 2–3 gradients |
| 3D Particles | Three.js GPU | Full | Medium | Medium | 4 buffer uploads/frame |

---

### Known Bottlenecks

#### 1. Magma Shader — 7-Octave FBM + Voronoi
The most GPU-intensive effect. Each pixel executes: domain warp (3 nested FBM calls) + main FBM (7 octaves) + Voronoi (3×3 grid with sub-crack FBM) + ridged FBM veins.

**Current mitigation**: Mobile renders at 0.35× = ~8× fewer pixels than desktop. Still ~40,000 pixels at 375×812.

**Improvement options**:
- Reduce to 5 octaves on mobile
- Add a quality slider: "Low / Medium / High" octave count
- Cache noise tiles (reuse between frames for low-motion regions)

#### 2. Neural Web — O(N²) Filament Draws
At `count = 40`: 12 perimeter nodes × 12 interior nodes = 144 `strokePath` calls per frame per card. Each filament sets `strokeStyle`, `lineWidth`, creates a `quadraticBezier` path.

**Improvement options**:
- Batch all filaments into a single `beginPath` (lose per-filament color, but major speed gain)
- Reduce `countRaw` on mobile (e.g., cap at 24 on `window.innerWidth < 768`)
- Use a CanvasGradient per segment only if count is below threshold, otherwise flat colour

#### 3. God Rays at High Density
`density = 1.0` → 72 ray evaluations per pixel. At 0.45× resolution on mobile this is ~350K pixels, each with 72 iterations.

**Improvement options**:
- Cap `nRays` at 32 on mobile
- Clamp the density UI slider to 0.5 on mobile

#### 4. Spell Particle `shadowBlur`
`shadowBlur` on Canvas 2D triggers a separate GPU compositing pass. Applied per-particle for small (`sz < 4px`) non-smoke particles — up to 120 particles/card.

**Improvement options**:
- Disable `shadowBlur` entirely on mobile (replace with a slightly larger radial gradient radius instead)
- Add a `window._perfMode` check before applying shadow blur

#### 5. 3D Texture Capture — Full Card Render Every Frame
Each showcase card runs the complete surface FX pipeline (`drawCard` with shimmer, luster, grain, ripple, holo) into a 440×616 offscreen canvas every animation frame, then uploads the result to GPU memory as a texture.

**Improvement options**:
- **Dirty flag**: Only re-capture when card state changes (effect parameters, image) or every N ms; use a still frame otherwise
- **Split static / dynamic layers**: Bake the image and static effects once; composite only the animated layer (shimmer sweep, holo phase) each frame at lower resolution
- **Reduce capture resolution**: Use TEX_SCALE = 2 on mobile instead of 4 (halves linear dimensions = 4× fewer pixels)

#### 6. Grain Texture — Full-Resolution ImageData
At 1440×900 DPR 2× main canvas, grain allocates a ~2.8M pixel ImageData. The per-pixel sin-hash loop is CPU-bound.

**Improvement options**:
- Lower quantization on mobile: reduce from `t × 0.006` to `t × 0.003` (update 3×/sec instead of 6×/sec)
- Or reuse the same `_grainTex` generated by `showcase-3d.js` (already pre-built noise texture) as the source image

#### 7. Holo Glass `hue-rotate` Filter
`ctx.filter = 'hue-rotate(Xdeg)'` forces a full canvas-image compositing pass through the GPU image filter pipeline. Applied once per card per frame when holo glass + iridescent is enabled.

**Improvement options**:
- Skip iridescent hue cycling when `_gyroVelocity < 0.001` (card is still)
- Cache the filter string; skip reassigning if unchanged

---

### Recommended Mobile-Specific Guards

All of these could be gated behind a single `_isMobile = window.innerWidth <= 768` flag or a `_perfMode` flag:

```
- Magma shader: max 5 FBM octaves
- God Rays: cap nRays at 32
- Neural Web: cap node count at 24
- Spell particles: disable shadowBlur
- Shimmer: disable iridescent pass
- 3D texture capture: TEX_SCALE = 2, dirty-flag updates
- Grain: update rate ÷ 2
```

---

## Card Data Model

```javascript
{
  id:       number,         // unique card ID
  kind:     string,         // undefined (standard) | 'custom' | 'text' | 'rect'
  x:        number,         // world-space position
  y:        number,
  rot:      number,         // rotation in radians
  scale:    number,         // size multiplier
  frontImg: string | null,  // key in st.images
  backImg:  string,         // key in st.images (default: '__default_back__')
  showBack: boolean,        // render back face
  glare:    { on, intensity, spread, x, y },
  shimmer:  { on, width, speed, bands, opacity, blend },
  luster:   { on, radius, opacity, pulse, color },
  grain:    { on, amount, scale, anim },
  ripple:   { on, rings, spread, speed, color, opacity, blend },
  holo:     { on, mode, ... },
  spell:    { on, preset, intensity, count, color, color2, color3, ... },
  label:    string | undefined,
  hidden:   boolean,
  // Animation state (runtime only):
  _ax, _ay, _as,          // animated transform offsets
  _ar,                    // animated rotation
  _orbitDepth,            // orbit z-depth for sorting
  _grainCache,            // grain texture cache object
  _sparkleCache,          // holo sparkle position cache
}
```

The default back image is `'__default_back__'` → loaded from `assets/images/card-back-default.png` at startup.

---

## Timeline & Sequence System

Sequences are stored in `st.sequences` keyed by card ID. Each sequence is an ordered array of steps:

| Step type | Description |
|-----------|-------------|
| `effect` | Triggers an animation preset for a specified duration with easing |
| `wait` | Pauses playback for N milliseconds |
| `scene` | Loads a saved scene snapshot (card states, bg, lighting) |

**Playback** (`timeline.js`): Per-card playback state advances through steps on each tick. Effect steps interpolate card parameters (rotation, scale, position, FX intensities) using the step's easing curve.

**Presets** (`PRESET_DEFAULTS`): Named animation presets (e.g., `flip`, `orbit`, `pulse`) define parameter targets and durations. Custom step parameters override preset defaults.

---

## Export

### PNG Export (`export.js`)
Renders the full scene to a temporary canvas at target resolution, then downloads as PNG. Suppresses gyro transforms and animation offsets (`isExport = true` flag).

### Video Export (`video-export.js`)
- 3-second countdown → N-second recording (default 6s) → download
- Format: `video/mp4` on Safari iOS (H.264 Baseline via `avc1.42E01E`), `video/webm` on Chrome Android
- Bitrate: 8 Mbps
- In standard mode: `st.canvas.captureStream(60)`
- In showcase mode: composite canvas approach (see Rendering Pipeline above)
- Fallback: If preferred codec unavailable, retries without codec constraint

---

## Asset System

Assets are stored in `st.images` as `{ [id]: HTMLImageElement }`. Special keys:

| Key | Content |
|-----|---------|
| `'__default_back__'` | Default card back (loaded from `assets/images/card-back-default.png`) |
| `'__bg__'` | Scene background image |
| `'__stock__:<name>'` | Built-in stock card images |
| `'preset:<id>'` | Built-in corner icon SVGs |
| `'a<n>'` | User-uploaded assets |

User-uploaded assets are embedded as data URLs in saved scene JSON (`_frontDataURL`, `_backDataURL`) and re-inflated on load.

---

## State & Globals

Key `window.*` globals used for cross-module communication:

| Global | Set by | Read by | Purpose |
|--------|--------|---------|---------|
| `_gyroActive` | mobile.js | showcase-3d.js, renderer.js | Whether gyro/tilt is running |
| `_gyroTiltX/Y` | mobile.js | showcase-3d.js, renderer.js | Current tilt (-24..+24) |
| `_gyroVelocity` | mobile.js | renderer.js, showcase-3d.js | Spring velocity magnitude |
| `_gyroDeltaGamma/Beta` | mobile.js | showcase-3d.js | Per-frame orientation delta |
| `_gyroAccelX/Y/Mag` | mobile.js | showcase-3d.js | High-pass accelerometer |
| `_showcase3DActive` | showcase-3d.js | app.js | Suppress 2D card drawing |
| `_showcase3DCanvas` | showcase-3d.js | video-export.js | Three.js canvas for composite recording |
| `_showcase3DParticleEl` | showcase-3d.js | video-export.js | Particle canvas for composite recording |
| `_showcase3DCardPositions` | showcase-3d.js | mobile.js | NDC card centers for tap targeting |
| `_showcase3DParticleCtx` | showcase-3d.js | app.js | 2D ctx above Three.js for particles |
| `_tryStartGyro` | mobile.js | showcase.js | Start gyro on showcase enter |
| `_deactivateGyro` | mobile.js | showcase.js | Stop gyro on showcase exit |
