# Arcana Glam — FX System v2
### Source of Truth for all visual effects, parameters, presets, and architecture

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FX Registry                       │
│  (central catalogue: schema, presets, defaults)      │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┴──────────────┐
         ▼                            ▼
  ┌─────────────┐             ┌──────────────┐
  │  Card FX    │             │   BG FX      │
  │  Stack      │             │   Stack      │
  │  (per-card) │             │  (global)    │
  └──────┬──────┘             └──────┬───────┘
         │                           │
         ▼                           ▼
  ┌─────────────────────────────────────────┐
  │           Renderer Pool                  │
  │  canvas2d  │  shader (WebGL)  │  hybrid  │
  └──────────────────────┬──────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Performance Governor │
              │  full / reduced /     │
              │  minimal              │
              └──────────────────────┘
```

### Layers
1. **FX Registry** — static catalogue of every effect. Contains schema, preset catalogue, default values, perf policy, renderer type.
2. **Effect Stack** — per-card (ordered list of surface + particle effects) and global BG stack.
3. **Renderer Pool** — typed renderers: `canvas2d` (2D API), `shader` (WebGL offscreen), `hybrid` (canvas2d + WebGL composite).
4. **Performance Governor** — 3 tiers based on device capability, sets particle caps, DPR, throttle rates.
5. **Inspector UI Model** — stack panel, per-effect param groups, preset pills, drag-to-reorder.

---

## 2. FX Registry Structure

```js
FX_REGISTRY = {
  [effectId]: {
    id: string,           // e.g. 'fire', 'shimmer'
    label: string,        // display name
    family: 'surface' | 'particle' | 'bg',
    renderer: 'canvas2d' | 'shader' | 'hybrid',
    stackable: boolean,   // can multiple instances exist on one card?
    blendMode: string,    // default compositing blend mode
    perfPolicy: {
      full:    { maxParticles?, renderScale?, throttle? },
      reduced: { maxParticles?, renderScale?, throttle? },
      minimal: { maxParticles?, renderScale?, throttle? },
    },
    params: ParamDef[],   // ordered list of parameter definitions
    presets: Preset[],    // named preset configurations
  }
}
```

---

## 3. Parameter Schema (ParamDef)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | machine key, e.g. `'intensity'` |
| `label` | string | inspector display name |
| `type` | `'range'` \| `'color'` \| `'select'` \| `'toggle'` \| `'vec2'` | control type |
| `min` | number | range min |
| `max` | number | range max |
| `step` | number | range step |
| `default` | any | default value |
| `group` | string | collapsible group name in inspector |
| `options` | string[] | for `select` type |
| `hidden` | boolean | advanced param, collapsed by default |

---

## 4. Preset System

Resolution order (highest priority first):
1. Per-instance overrides (user edits in inspector)
2. Named preset (user picks a preset pill)
3. Effect defaults (FX Registry `params[n].default`)

Presets are stored by name and contain only the params they override. Partial presets are valid.

---

## 5. Performance Governor

| Tier | Trigger | DPR cap | Particle cap | BG throttle |
|------|---------|---------|--------------|-------------|
| `full` | Desktop, hi-DPI | 1.5 | 900 | every 3 frames |
| `reduced` | Mobile / `max-width: 900px` | 1.0 | 500 | every 4 frames |
| `minimal` | Low battery / explicit user cap | 0.75 | 200 | every 6 frames |

---

## 6. Effect Families

| Family | Contains |
|--------|---------|
| **Surface** | Shimmer, Luster, Grain, Ripple, Holo |
| **Particle** | Spell, Fire, Smoke, Aura, Arc/Lightning |
| **Background** | Nebula, BG Smoke/Veil, BG Warp, Aurora, Prism, Grid |

---

## 7. Card Surface Effects

### 7.1 Shimmer v2
Animated prismatic highlight band that sweeps across the card.

**Renderer:** `canvas2d`
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `speed` | range | 0.5 | 0–2 | Band sweep speed |
| `width` | range | 0.35 | 0.05–0.8 | Highlight band width (fraction of card) |
| `angle` | range | 30 | –90–90 | Sweep angle in degrees |
| `intensity` | range | 0.7 | 0–1 | Peak highlight brightness |
| `color` | color | `#ffffff` | — | Tint of the highlight |
| `iridescent` | toggle | false | — | Rainbow hue shift along band |
| `hueRange` | range | 60 | 0–180 | Degrees of hue shift when iridescent |

**Presets:** `Soft Glow`, `Diamond`, `Aurora`, `Holographic`

**Rendering notes:**
- Band = linear gradient perpendicular to `angle`, animates t from 0→1 looping.
- When `iridescent` on: `hsl(hue + t * hueRange, 90%, 80%)` per scanline slice.
- Composite over card at `screen` blend.

---

### 7.2 Luster v2
Soft, breathing, colour-shifting glow that pulses from the card surface.

**Renderer:** `canvas2d`
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `color` | color | `#C9A84C` | — | Glow tint |
| `pulse` | range | 0.4 | 0–1 | Pulse amplitude (0 = static) |
| `speed` | range | 0.6 | 0–2 | Pulse frequency |
| `spread` | range | 0.5 | 0–1 | How far glow extends past card edges |
| `intensity` | range | 0.6 | 0–1 | Base opacity |
| `reactive` | toggle | true | — | Intensity boosts on hover/tilt |

**Presets:** `Gold Glow`, `Ice Blue`, `Crimson`, `Void Purple`

**Rendering notes:**
- Radial gradient centred on card, radius = `card.w * 0.5 * (1 + spread)`.
- Opacity = `intensity * (1 + pulse * sin(t * speed * 2π))`.
- On hover: opacity += 0.15 (lerped).

---

### 7.3 Grain v2
Animated film grain / noise texture overlaid on card.

**Renderer:** `canvas2d`
**Blend mode:** `overlay`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `amount` | range | 0.4 | 0–1 | Grain density/opacity |
| `scale` | range | 0.7 | 0.2–2 | Noise grain size |
| `speed` | range | 0.4 | 0–1 | How fast grain pattern refreshes (0 = static) |
| `color` | color | `#ffffff` | — | Grain tint |
| `blendMode` | select | `overlay` | `overlay`, `screen`, `multiply` | Compositing mode |

**Presets:** `Film`, `Heavy Grain`, `Dust`, `Subtle Texture`

**Rendering notes:**
- Seed = `Math.floor(t * 0.006 * (0.1 + speed))` — quantised so grain doesn't scroll continuously.
- `ctx.filter = 'contrast(1.4) brightness(1.1)'` after drawing noise patch.
- Noise patch generated once per seed change via `feTurbulence` SVG or typed array fill.

---

### 7.4 Ripple v2
Concentric water-ripple rings radiating from card centre or pointer position.

**Renderer:** `canvas2d`
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `speed` | range | 0.6 | 0.1–2 | Ring expansion speed |
| `rings` | range | 3 | 1–6 | Number of simultaneous rings |
| `thickness` | range | 2 | 0.5–5 | Ring stroke width (px at 1x) |
| `color` | color | `#88ccff` | — | Ring colour |
| `intensity` | range | 0.5 | 0–1 | Peak ring opacity |
| `origin` | select | `center` | `center`, `pointer`, `random` | Ring spawn point |
| `decay` | range | 0.7 | 0–1 | Opacity fade rate as ring expands |

**Presets:** `Calm Pond`, `Deep Wave`, `Pulse`, `Neon Ring`

**Rendering notes:**
- Each ring: `phase = (t * speed + i/rings) % 1`. Radius = `phase * maxR`. Opacity = `intensity * (1 - phase) ^ decay`.
- `origin: pointer` shifts centre to last known pointer position on card.

---

### 7.5 Holo v2
Holographic foil: iridescent scattered light dots + chromatic sweep.

**Renderer:** `canvas2d`
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `density` | range | 0.6 | 0–1 | Number of sparkle points |
| `size` | range | 0.5 | 0.1–1 | Sparkle radius |
| `speed` | range | 0.4 | 0–1.5 | Sparkle shimmer speed |
| `sweep` | toggle | true | — | Enable chromatic sweep band |
| `sweepSpeed` | range | 0.3 | 0–1 | Sweep band traverse speed |
| `hueShift` | range | 180 | 0–360 | Hue rotation range across sweep |
| `tiltReactive` | toggle | true | — | Sparkle positions shift with tilt |

**Presets:** `Holographic Foil`, `Rainbow Prism`, `Opal`, `Subtle Holo`

**Rendering notes:**
- Spawn `Math.round(70 + density * 100)` sparkle points, stable positions seeded by card ID.
- Each dot: `hsl((baseHue + x/w * hueShift + t * speed * 60) % 360, 100%, 75%)`, radius peaks at sin(t).
- When `tiltReactive`: offset positions by `tiltX * 0.1 * cardW`, `tiltY * 0.1 * cardH`.
- Sweep: semi-transparent gradient band moving across card at `sweepSpeed`, tinted with hue rotation.

---

## 8. Card Particle Effects

### 8.1 Spell v2
Magical floating particles — runes, sparkles, or elemental motes orbiting the card.

**Renderer:** `canvas2d`
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `count` | range | 40 | 5–120 | Particle count |
| `color` | color | `#C9A84C` | — | Primary particle colour |
| `colorB` | color | `#ffffff` | — | Secondary colour (blended randomly) |
| `size` | range | 3 | 1–8 | Max particle radius |
| `speed` | range | 0.5 | 0–2 | Drift speed |
| `spread` | range | 0.4 | 0–1 | How far particles stray from card |
| `shape` | select | `dot` | `dot`, `star`, `rune`, `cross` | Particle glyph |
| `orbit` | toggle | false | — | Particles orbit card perimeter |
| `gravity` | range | 0 | –1–1 | Upward (–) or downward (+) drift |
| `twinkle` | range | 0.6 | 0–1 | Opacity flicker intensity |

**Presets:** `Golden Motes`, `Arcane Runes`, `Starfall`, `Ember Drift`

**Rendering notes:**
- Particle pool: objects with `x, y, vx, vy, life, maxLife, hue, r`.
- Each frame: advance position, apply gravity, fade by `life/maxLife`.
- `orbit` mode: position locked to card edge + small radial wobble.
- `shape: rune` draws a random Unicode rune character at particle position.

---

### 8.2 Fire v2
Realistic flame simulation rising from card bottom edge.

**Renderer:** `canvas2d` (radial gradient per particle)
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `intensity` | range | 0.7 | 0–1 | Flame density + height |
| `height` | range | 0.5 | 0.1–1.5 | Max flame height as fraction of card height |
| `spread` | range | 0.8 | 0.3–1 | Horizontal spread fraction of card width |
| `color` | select | `fire` | `fire`, `ice`, `poison`, `arcane`, `soul` | Flame palette |
| `turbulence` | range | 0.6 | 0–1 | Horizontal wind jitter |
| `flicker` | range | 0.5 | 0–1 | Per-particle opacity flicker |
| `coreGlow` | toggle | true | — | Extra bright core at flame base |
| `embers` | range | 0.3 | 0–1 | Detached ember particle count |

**Palettes:**
| Name | Core | Mid | Tip |
|------|------|-----|-----|
| `fire` | `#fff7aa` | `#ff6600` | `#ff2200` |
| `ice` | `#e0f8ff` | `#4dd0e1` | `#0077aa` |
| `poison` | `#ccffaa` | `#66dd22` | `#1a8800` |
| `arcane` | `#eeddff` | `#9955ff` | `#440099` |
| `soul` | `#ffffff` | `#88aaff` | `#2233cc` |

**Presets:** `Camp Fire`, `Blue Flame`, `Poison Vent`, `Arcane Blaze`, `Soul Burn`

**Rendering notes:**
- Spawn particles at base of card, distributed across `spread * cardW`.
- Each particle: `createRadialGradient(x, y, 0, x, y, r)` — core colour → mid → transparent.
- Particles rise: `vy -= 0.4 + intensity * 0.4`. Horizontal: `vx += (Math.random()-0.5) * turbulence`.
- Colour interpolated core→tip based on `1 - life/maxLife`.
- Embers: small bright dots that detach when `life < 0.3`, drift sideways.

---

### 8.3 Smoke v2
Volumetric smoke / vapour clouds billowing from card.

**Renderer:** `canvas2d` (large soft radial gradients)
**Blend mode:** `screen` (light) or `multiply` (dark)

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `density` | range | 0.5 | 0–1 | Puff count and size |
| `color` | color | `#aaaacc` | — | Smoke tint |
| `opacity` | range | 0.3 | 0.05–0.7 | Max puff opacity |
| `rise` | range | 0.4 | 0–1 | Upward drift speed |
| `spread` | range | 0.6 | 0.1–1 | Horizontal diffusion rate |
| `growthRate` | range | 0.5 | 0–1 | How fast puffs expand as they rise |
| `turbulence` | range | 0.4 | 0–1 | Swirl / wind distortion |
| `blendMode` | select | `screen` | `screen`, `multiply`, `overlay` | Compositing mode |
| `origin` | select | `bottom` | `bottom`, `top`, `center`, `edges` | Emission origin |

**Presets:** `Ethereal Mist`, `Dark Fog`, `Steam Vent`, `Toxic Cloud`, `Wisp`

**Rendering notes:**
- Puffs are large soft circles (r = 40–120px). Each puff: radial gradient color → transparent.
- `turbulence` adds a slow sin-wave horizontal displacement over lifetime.
- `growthRate`: r increases by `(life/maxLife) * growthRate * 40` each frame.
- Max pool: 600 particles (reduced: 300, minimal: 120).
- Opacity fades in for first 20% of life, out for last 40%.

---

### 8.4 Aura v2
Pulsing energy field emanating from card edges and corners.

**Renderer:** `canvas2d`
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `color` | color | `#9966ff` | — | Aura colour |
| `colorB` | color | `#ff44aa` | — | Secondary oscillating colour |
| `pulse` | range | 0.7 | 0–1 | Pulse amplitude |
| `pulseSpeed` | range | 0.8 | 0.1–3 | Pulse frequency |
| `thickness` | range | 0.4 | 0.05–1 | Aura ring thickness |
| `spikes` | range | 0 | 0–1 | Energy spike protrusions on edges |
| `rotate` | range | 0 | 0–1 | Continuous rotation speed |
| `innerGlow` | toggle | true | — | Fill card with soft colour wash |

**Presets:** `Divine Halo`, `Shadow Aura`, `Electric`, `Corrupted`, `Celestial`

**Rendering notes:**
- Draw inset-stroked rounded-rect following card shape, offset outward by `thickness * 30px`.
- Opacity = `pulse * (0.5 + 0.5 * sin(t * pulseSpeed * 2π))`.
- Color lerps between `color` and `colorB` over pulse cycle.
- `spikes`: at random edge intervals, draw thin elongated gradient protrusions.
- `innerGlow`: fill card rect with radial gradient, colour at centre → transparent at edges.

---

### 8.5 Arc / Lightning v2
Electrical arcs and lightning bolts that crackle around or between cards.

**Renderer:** `canvas2d` (recursive midpoint displacement)
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `color` | color | `#88ccff` | — | Arc core colour |
| `glowColor` | color | `#2244ff` | — | Outer glow tint |
| `frequency` | range | 0.6 | 0.05–2 | How often new arcs fire |
| `branches` | range | 2 | 0–5 | Sub-branch count per arc |
| `length` | range | 0.5 | 0.1–1 | Arc reach as fraction of card diagonal |
| `thickness` | range | 1.5 | 0.5–4 | Stroke width (px) |
| `jitter` | range | 0.5 | 0–1 | Midpoint displacement roughness |
| `glow` | range | 0.7 | 0–1 | Outer glow blur radius |
| `flicker` | range | 0.8 | 0–1 | Frame-to-frame flicker intensity |
| `target` | select | `self` | `self`, `adjacent`, `random` | Arc destination |

**Presets:** `Static Charge`, `Divine Bolt`, `Corrupted Arc`, `Storm`, `Plasma`

**Rendering notes:**
- Recursive midpoint displacement: split line segment, displace midpoint by `jitter * len * 0.5`, recurse to depth 5.
- Glow: draw arc twice — thick stroke at low opacity first (glow), then thin bright stroke on top.
- `flicker`: each frame, arc has `flicker * 80%` chance of being skipped entirely (gives natural flicker).
- `branches`: at random midpoints, split off sub-arcs at ±30° with 60% length.
- Arc lifetime: 80–200ms, then respawns from new origin point.

---

## 9. Background Effects

### 9.1 Nebula v2
Deep space nebula: layered coloured gas clouds with star field.

**Renderer:** `shader` (WebGL offscreen)
**Blend mode:** `normal` (replaces BG)

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `colorA` | color | `#1a0533` | — | Primary nebula cloud colour |
| `colorB` | color | `#002244` | — | Secondary nebula cloud colour |
| `colorC` | color | `#330011` | — | Tertiary accent colour |
| `density` | range | 0.6 | 0–1 | Cloud density / opacity |
| `scale` | range | 0.5 | 0.1–2 | Nebula scale (zoom) |
| `drift` | range | 0.15 | 0–1 | Slow pan/drift speed |
| `stars` | range | 0.5 | 0–1 | Star field density |
| `starBrightness` | range | 0.7 | 0–1 | Star peak brightness |
| `twinkle` | range | 0.4 | 0–1 | Star twinkle speed |
| `depth` | range | 3 | 1–5 | Cloud layer count |

**Presets:** `Deep Space`, `Crimson Nebula`, `Void`, `Cosmic Ocean`, `Stellar Nursery`

**Rendering notes:**
- Fragment shader: layered fBm (fractal Brownian motion) noise for each cloud layer.
- Stars: high-frequency noise threshold above `1 - starDensity`. Twinkle via sin wave on brightness.
- Drift: UV offset increments each frame at `drift * 0.00003`.
- Render at `reduced` scale: `0.45` mobile, `0.6` desktop. Upscale to fill.

---

### 9.2 BG Smoke / Veil v2
Slow drifting atmospheric fog or gossamer veil.

**Renderer:** `canvas2d`
**Blend mode:** `normal`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `color` | color | `#1a1a2e` | — | Smoke / fog tint |
| `layers` | range | 3 | 1–5 | Number of depth layers |
| `opacity` | range | 0.4 | 0.05–0.8 | Max layer opacity |
| `speed` | range | 0.2 | 0–1 | Drift speed |
| `direction` | range | 0 | –180–180 | Wind direction in degrees |
| `turbulence` | range | 0.3 | 0–1 | Swirl distortion |
| `scale` | range | 0.6 | 0.2–2 | Puff size scale |

**Presets:** `Thin Mist`, `Dense Fog`, `Shadow Veil`, `Drift`, `Shroud`

**Rendering notes:**
- Large overlapping radial gradient puffs tiling to fill canvas, each drifting in `direction`.
- Layers have different scales (0.5×, 1×, 1.5×) and speeds (0.3×, 1×, 1.7×) for parallax depth.

---

### 9.3 BG Warp v2
Screen-space distortion / displacement warping the background.

**Renderer:** `shader` (WebGL — displacement map)
**Blend mode:** `normal`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `strength` | range | 0.5 | 0–1 | Max displacement magnitude |
| `scale` | range | 0.5 | 0.1–2 | Warp noise frequency |
| `speed` | range | 0.3 | 0–1 | Warp animation speed |
| `type` | select | `fluid` | `fluid`, `vortex`, `wave`, `ripple` | Warp pattern |
| `color` | color | `#000000` | — | Tint applied over warp (transparent = none) |
| `chromatic` | toggle | false | — | Separate R/G/B displacement (chromatic aberration) |
| `aberration` | range | 0.3 | 0–1 | Chromatic shift magnitude (requires `chromatic`) |

**Presets:** `Fluid Distort`, `Vortex`, `Deep Warp`, `Subtle Wave`, `Glitch`

**Rendering notes:**
- Two noise octaves drive UV displacement. `vortex` type adds curl noise.
- `chromatic`: R channel shifted +aberration, B channel shifted –aberration.
- Displacement capped at `strength * 14px`.

---

### 9.4 Aurora v2
Northern lights: ribbons of flowing coloured light across the background.

**Renderer:** `shader` (WebGL)
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `colorA` | color | `#00ff88` | — | First ribbon colour |
| `colorB` | color | `#0044ff` | — | Second ribbon colour |
| `colorC` | color | `#ff00aa` | — | Third ribbon colour |
| `bands` | range | 3 | 1–6 | Number of aurora bands |
| `height` | range | 0.5 | 0.1–1 | Vertical coverage (fraction of screen) |
| `speed` | range | 0.3 | 0–1 | Flow animation speed |
| `wave` | range | 0.6 | 0–1 | Band undulation amplitude |
| `softness` | range | 0.7 | 0–1 | Band edge softness |
| `brightness` | range | 0.6 | 0–1 | Overall brightness |

**Presets:** `Northern Lights`, `Southern Cross`, `Solar Flare`, `Deep Ocean`, `Midnight`

**Rendering notes:**
- Each band: sin wave with different phase, frequency, amplitude.
- Per-band colour is interpolated from palette based on band index.
- Fragment shader composites all bands with `screen` blend in-shader.
- Animate phase offset per band each frame.

---

### 9.5 Prism v2
Lens / crystal prism light dispersion — coloured shafts and rainbow caustics.

**Renderer:** `shader` (WebGL)
**Blend mode:** `screen`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `shafts` | range | 5 | 2–12 | Number of light shafts |
| `angle` | range | 45 | 0–180 | Shaft orientation degrees |
| `spread` | range | 0.6 | 0.1–1 | Fan spread angle |
| `speed` | range | 0.2 | 0–1 | Rotation / drift speed |
| `hueRange` | range | 270 | 60–360 | Rainbow hue span across shafts |
| `intensity` | range | 0.5 | 0–1 | Shaft peak opacity |
| `softEdge` | range | 0.6 | 0–1 | Edge falloff sharpness |
| `caustics` | toggle | true | — | Add sparkle caustic overlay |
| `causticDensity` | range | 0.4 | 0–1 | Caustic sparkle count |

**Presets:** `Crystal`, `Rainbow Burst`, `Subtle Refraction`, `Disco`, `Solar`

**Rendering notes:**
- Each shaft: thin wedge gradient from origin point, hue offset by `hueRange / shafts * i`.
- Caustics: high-frequency noise masked by shaft coverage, flickering at 8fps cadence.
- Origin point drifts slowly around screen centre.

---

### 9.6 Grid v2
Geometric grid / wireframe / hex pattern background.

**Renderer:** `canvas2d`
**Blend mode:** `normal`

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `pattern` | select | `square` | `square`, `hex`, `triangle`, `dots`, `circuit` | Grid type |
| `color` | color | `#1a1a2e` | — | Background fill |
| `lineColor` | color | `#2a2a4e` | — | Grid line colour |
| `size` | range | 40 | 10–120 | Grid cell size in px |
| `lineWidth` | range | 1 | 0.5–3 | Line thickness |
| `opacity` | range | 0.8 | 0.1–1 | Grid line opacity |
| `pulse` | range | 0 | 0–1 | Animated glow pulse on lines |
| `pulseColor` | color | `#C9A84C` | — | Pulse glow colour |
| `perspective` | range | 0 | 0–1 | Vanishing-point perspective warp |
| `scroll` | range | 0 | 0–1 | Slow grid scroll speed |
| `scanlines` | toggle | false | — | Add horizontal scan-line overlay |

**Presets:** `Dark Grid`, `Hex Matrix`, `Circuit Board`, `Dot Field`, `Neon Grid`

**Rendering notes:**
- `square`: standard rect grid. `hex`: offset rows by 50%. `triangle`: equilateral triangles.
- `circuit`: square grid + occasional right-angle branch decorations at intersections.
- `perspective`: apply CSS `perspective(800px) rotateX(angle)` to grid canvas or do UV transform in draw.
- `pulse`: animate a travelling glow along grid lines — each line segment has phase offset.
- `scanlines`: draw thin semi-transparent horizontal lines every 3px.

---

## 10. Implementation Priority

| Priority | Effect | Reason |
|----------|--------|--------|
| P0 | Fire v2 | Most visible, current version is bad |
| P0 | Smoke v2 | Most visible, current version is bad |
| P1 | Shimmer v2 | Core card effect, used on almost every card |
| P1 | Aura v2 | Popular effect, current glow is flat |
| P1 | Nebula v2 | Primary BG, shader needed |
| P2 | Holo v2 | Premium feel, often requested |
| P2 | Aurora v2 | Visually striking BG |
| P2 | Arc/Lightning v2 | Dramatic effect |
| P3 | Luster v2 | Nice-to-have improvement |
| P3 | Grain v2 | Minor improvement |
| P3 | Ripple v2 | Minor improvement |
| P3 | Spell v2 | Incremental improvement |
| P3 | BG Warp v2 | Existing works adequately |
| P4 | Prism v2 | New effect |
| P4 | Grid v2 | New effect |
| P4 | BG Smoke v2 | New effect |

---

## 11. File Map (Implementation)

```
js/
  fx-engine.js        — orchestrates all effects, BG + card dispatch
  effects/
    shimmer.js        — Shimmer v2
    luster.js         — Luster v2
    grain.js          — Grain v2
    ripple.js         — Ripple v2
    holo.js           — Holo v2
    spell.js          — Spell v2
    fire.js           — Fire v2
    smoke.js          — Smoke v2
    aura.js           — Aura v2
    arc.js            — Arc/Lightning v2
    nebula.js         — Nebula v2 (WebGL)
    bg-smoke.js       — BG Smoke/Veil v2
    bg-warp.js        — BG Warp v2 (WebGL)
    aurora.js         — Aurora v2 (WebGL)
    prism.js          — Prism v2 (WebGL)
    grid.js           — Grid v2
  fx-registry.js      — central FX_REGISTRY definition
  fx-presets.js       — all named presets
  perf-governor.js    — Performance Governor (tiers + policy)
```

---

*Last updated: 2026-03-18*
