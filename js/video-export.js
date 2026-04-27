// ============================================================
//  ARCANA GLAM — Video Export  (video-export.js)
//  3-second countdown → 6-second canvas recording → download.
//  Format: video/mp4 on Safari iOS, video/webm on Chrome Android.
//
//  NOTE: mux.js (cdn.jsdelivr.net/npm/mux.js) is loaded in <head>
//  per spec and handles TS→MP4 remux. For canvas MediaRecorder output
//  we rely on native format selection: video/mp4 on Safari, webm on
//  Chrome. Both save directly to disk — no sharing.
// ============================================================

import { AppState as st } from './state.js';
import { showToast } from './app.js';

var _recTimer = null;
var _countdownTimer = null;
var _compositeCanvas = null;
var _compositeCtx    = null;
var _compositeRafId  = null;

// Draw all visible layers onto _compositeCanvas each frame while recording
function _compositeFrame() {
  if (!_compositeCtx) return;
  var cw = _compositeCanvas.width, ch = _compositeCanvas.height;
  _compositeCtx.clearRect(0, 0, cw, ch);
  // Layer 1 — main 2D canvas (background, BG FX)
  if (st.canvas) _compositeCtx.drawImage(st.canvas, 0, 0, cw, ch);
  // Layer 2 — Three.js WebGL card overlay
  if (st.showcase3d.canvas) _compositeCtx.drawImage(st.showcase3d.canvas, 0, 0, cw, ch);
  // Layer 3 — 2D spell particles above the card
  if (st.showcase3d.particleEl) _compositeCtx.drawImage(st.showcase3d.particleEl, 0, 0, cw, ch);
  _compositeRafId = requestAnimationFrame(_compositeFrame);
}

function _stopComposite() {
  if (_compositeRafId) { cancelAnimationFrame(_compositeRafId); _compositeRafId = null; }
  _compositeCanvas = null;
  _compositeCtx    = null;
}

// ── Best available MIME type ──────────────────────────────────────────────────
function getBestMime() {
  var candidates = [
    'video/mp4;codecs=avc1.42E01E',  // H.264 Baseline — iOS Safari 14.5+
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',          // Chrome Android
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i]; }
    catch (_) {}
  }
  return '';
}

// ── HUD recording status helpers ─────────────────────────────────────────────

function setRecStatus(html) {
  var el = document.getElementById('sc-rec-status');
  if (el) { el.innerHTML = html; el.style.display = html ? 'flex' : 'none'; }
}

function setRecBtnState(disabled, label) {
  var btn = document.getElementById('sc-record');
  if (!btn) return;
  btn.disabled = disabled;
  btn.textContent = label;
  btn.classList.toggle('sc-btn-rec-active', disabled);
}

// ── Main export function ──────────────────────────────────────────────────────

export function startVideoRecording(durationSecs) {
  durationSecs = durationSecs || 6;
  if (st._recordingActive) return;

  if (!window.MediaRecorder) {
    showToast('Video recording not supported on this browser.');
    return;
  }

  var mime = getBestMime();
  if (!mime) {
    showToast('No supported video format found.');
    return;
  }

  // In showcase mode the 3D card lives on a separate WebGL canvas overlaid on
  // st.canvas. captureStream() only sees one canvas, so we composite all layers
  // onto a scratch canvas and record that instead.
  var captureTarget = st.canvas;
  if (st.showcase3d.active && st.showcase3d.canvas) {
    _compositeCanvas = document.createElement('canvas');
    _compositeCanvas.width  = st.canvas.width;
    _compositeCanvas.height = st.canvas.height;
    _compositeCtx = _compositeCanvas.getContext('2d');
    captureTarget = _compositeCanvas;
    _compositeRafId = requestAnimationFrame(_compositeFrame);
  }

  var stream;
  try { stream = captureTarget.captureStream(60); }
  catch (e) { _stopComposite(); showToast('Canvas capture failed.'); return; }

  var chunks = [];
  var recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
  } catch (e) {
    try {
      recorder = new MediaRecorder(stream);
      mime = recorder.mimeType || 'video/webm';
    } catch (e2) {
      showToast('Recording unavailable on this device.');
      stream.getTracks().forEach(function(t) { t.stop(); });
      return;
    }
  }

  recorder.ondataavailable = function(e) {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = function() {
    st._recordingActive = false;
    _stopComposite();
    setRecStatus('');
    setRecBtnState(false, '●');

    var isMP4 = mime.toLowerCase().indexOf('mp4') >= 0;
    var ext  = isMP4 ? 'mp4' : 'webm';
    var type = isMP4 ? 'video/mp4' : 'video/webm';
    var blob = new Blob(chunks, { type: type });
    var fname = 'arcana-' + Date.now() + '.' + ext;

    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fname; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    showToast('✦ Video saved!');
  };

  // ── 3-second pre-recording countdown ─────────────────────────────────────
  setRecBtnState(true, '3');
  var countdown = 3;

  _countdownTimer = setInterval(function() {
    countdown--;
    if (countdown <= 0) {
      clearInterval(_countdownTimer); _countdownTimer = null;
      _beginRecording(recorder, stream, durationSecs);
    } else {
      setRecBtnState(true, String(countdown));
    }
  }, 1000);
}

function _beginRecording(recorder, stream, durationSecs) {
  st._recordingActive = true;
  recorder.start(100);

  var remaining = durationSecs;
  setRecStatus('<span id="_rec-dot"></span>' + remaining + 's');
  setRecBtnState(true, '●');

  _recTimer = setInterval(function() {
    remaining--;
    if (remaining <= 0) {
      clearInterval(_recTimer); _recTimer = null;
      recorder.stop();
      stream.getTracks().forEach(function(t) { t.stop(); });
    } else {
      setRecStatus('<span id="_rec-dot"></span>' + remaining + 's');
    }
  }, 1000);
}
