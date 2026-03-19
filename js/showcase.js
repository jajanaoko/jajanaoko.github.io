// ============================================================
//  ARCANA GLAM — Showcase  (showcase.js)
//  Floating entry button, Showcase Mode enter/exit,
//  HUD wiring: close, play/pause, screenshot, record.
// ============================================================

import { AppState as st } from './state.js';
import { markDirty, showToast, focusCamera } from './app.js';
import { deselectAll } from './layers.js';
import { setPlayState } from './timeline.js';
import { showFrameSelector, hideFrameSelector } from './export.js';
import { startVideoRecording } from './video-export.js';

// ── Enter / Exit ──────────────────────────────────────────────────────────────

function centerCameraOnShowcase() {
  var targets = st.cards.filter(function(c) { return !c.hidden; });
  if (targets.length === 0) return;
  focusCamera(targets);
}

export function enterShowcase() {
  deselectAll();
  document.body.classList.add('showcase-mode');
  // Defer camera centering so CSS layout transitions settle first
  setTimeout(centerCameraOnShowcase, 160);
  // _tryStartGyro is set by mobile.js — activates gyro on Android / touch,
  // shows the iOS permission overlay, or starts mouse-driven tilt on desktop.
  window._tryStartGyro && window._tryStartGyro();
}

export function exitShowcase() {
  document.body.classList.remove('showcase-mode');
  document.body.classList.remove('gyro-awaiting-permission');
  hideFrameSelector();
  window._deactivateGyro && window._deactivateGyro();
  markDirty();
}

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.body.classList.contains('showcase-mode')) {
    exitShowcase();
  }
});

// ── Floating "Showcase" button ────────────────────────────────────────────────
// Visibility is driven by the `has-cards` class on <body>,
// toggled by updateCardCount() in app.js.

var floatBtn = document.getElementById('sc-float-btn');
if (floatBtn) {
  floatBtn.addEventListener('click', function() { enterShowcase(); });
}

// ── Showcase HUD buttons ──────────────────────────────────────────────────────

var closeBtn      = document.getElementById('sc-close');
var playPauseBtn  = document.getElementById('sc-playpause');
var screenshotBtn = document.getElementById('sc-screenshot');
var recordBtn     = document.getElementById('sc-record');

if (closeBtn) {
  closeBtn.addEventListener('click', function() { exitShowcase(); });
}

// Play / Pause — toggles st.isPlaying; icon tracks state
if (playPauseBtn) {
  playPauseBtn.addEventListener('click', function() {
    setPlayState(!st.isPlaying);
    syncPlayPauseIcon();
  });
}

export function syncPlayPauseIcon() {
  if (!playPauseBtn) return;
  playPauseBtn.textContent = st.isPlaying ? '⏸' : '▶';
  playPauseBtn.title = st.isPlaying ? 'Pause animation' : 'Play animation';
}

// Screenshot — shows frame selector overlay
if (screenshotBtn) {
  screenshotBtn.addEventListener('click', function() {
    showFrameSelector();
  });
}

// Record — delegate to video-export module
if (recordBtn) {
  recordBtn.addEventListener('click', function() {
    startVideoRecording(10);
  });
}

// Sync play/pause icon whenever showcase mode activates (via MutationObserver below)
// and on startup
syncPlayPauseIcon();

// ── Sync HUD on showcase-mode class change ────────────────────────────────────
// Re-sync the play/pause icon each time showcase is entered (playback state may
// have changed while outside showcase mode).
new MutationObserver(function() {
  if (document.body.classList.contains('showcase-mode')) {
    syncPlayPauseIcon();
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
