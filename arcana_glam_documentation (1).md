# Arcana Glam --- Comprehensive Technical Documentation

## Overview

Arcana Glam is a browser-based visual sandbox used for designing
animated card visuals and effects. The application combines a card
renderer, visual effects engine, timeline editor, and export tool.

Primary capabilities: - Place and manipulate card assets on a canvas -
Apply layered visual effects - Animate cards using a timeline system -
Control lighting and background effects - Preview interactive motion
(tilt, tap, orbit) - Export frames or animations

------------------------------------------------------------------------

# System Architecture

## Canvas Renderer

Responsible for drawing all visual elements to the screen.

Render order: 1. Background 2. Background FX 3. Cards 4. Card Surface FX
5. Particles 6. Lighting 7. UI overlays

Typical render loop: requestAnimationFrame → update() → render()

------------------------------------------------------------------------

# Card System

Each card contains: - front image - back image - transform data -
lighting parameters - surface FX stack - animation state

Transform parameters: positionX, positionY, rotationZ, tiltX, tiltY,
scale, translateZ

------------------------------------------------------------------------

# Timeline System

Timeline allows sequencing animations per card.

Structure: Card Track → Step → Step → Step

Step types: Effect Step -- triggers animation preset Wait Step -- pauses
playback Scene Step -- loads stored scene state

Step properties: duration, easing, parameters

------------------------------------------------------------------------

# Surface Effects

## Glare

Reflective highlight across card surface.

Parameters: intensity, spread, angle, opacity

## Holographic

Rainbow foil effect.

Parameters: intensity, shiftSpeed, bandCount, angle

## Shimmer

Moving highlight streak.

Parameters: speed, width, brightness

## Luster

Soft glow aura.

Parameters: strength, pulseSpeed, tint

## Ripple

Distortion ripple across card.

Parameters: amplitude, frequency, speed

## Grain

Texture overlay.

Parameters: intensity, scale, animated

------------------------------------------------------------------------

# Background Effects

## Warp

Space distortion background.

Parameters: strength, speed, frequency

## Flow

Energy motion background.

Parameters: speed, scale, intensity

## Rays

Light rays radiating from center.

Parameters: count, spread, intensity

------------------------------------------------------------------------

# Spell Effects

Particle shapes: spark, ring, orb, flare

Particle parameters: count, speed, size, lifetime, spread, color

Example presets: Arcane Burst Fire Spark Energy Pulse Mystic Glow

------------------------------------------------------------------------

# Lighting System

Modes: none directional radial

Parameters: intensity radius falloff angle

------------------------------------------------------------------------

# Motion Systems

## Orbit Mode

Cards rotate around a center point. Parameters: radius, speed, phase

## Gyro Interaction

Mobile tilt applies: rotateX, rotateY, translateX, translateY,
translateZ

## Tap Interaction

Tap applies impulse force away from touch point.

------------------------------------------------------------------------

# Performance Mode

Reduces GPU cost while maintaining smooth animation.

Changes: lower DPR reduced particles simplified grain reduced lighting
slower background FX updates

Goal: smooth visuals at \~60fps.

------------------------------------------------------------------------

# Export System

Supports: PNG export frame sequences animation capture

Export overlay allows cropping and resizing output area.

------------------------------------------------------------------------

# Recommended Project Structure

arcana-glam/ index.html

css/ base.css layout.css panels.css timeline.css layers.css canvas.css
effects.css

js/ app.js state.js renderer/ fx/ timeline/ ui/

assets/ textures/ icons/

------------------------------------------------------------------------

# Developer Guidelines

Avoid heavy pixel operations. Prefer GPU filters. Render only when
necessary. Scale particle count with performance mode.

------------------------------------------------------------------------

# Future Improvements

WebGL renderer node-based FX system 3D card materials plugin FX
architecture
