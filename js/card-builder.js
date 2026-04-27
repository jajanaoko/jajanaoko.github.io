// ============================================================
//  ARCANA GLAM — Card Builder  (card-builder.js)
//  Inspector UI logic for custom cards.
// ============================================================

import { BORDER_PRESETS, resolveBorder } from './border-presets.js';
import { ICON_PRESETS } from './icon-presets.js';
import { AppState as st, markCardDirty } from './state.js';
import { markDirty as _globalMarkDirty, syncRefs, updateCardCount, hideEmpty } from './app.js';
import { renderLayers, getSelectedCards } from './layers.js';
import { setSyncCustomInspector, refreshInspectorContent } from './renderer.js';

// Local wrapper: every time we signal the canvas is dirty from the card
// builder, also bump the currently-selected custom card's version counter
// so the showcase texture baker re-renders. This makes all 25+ builder
// mutation sites version-aware without modifying each call site.
function markDirty() {
  var c = getSelectedCards()[0];
  if (c && c.kind === 'custom') markCardDirty(c);
  _globalMarkDirty();
}

// ─── syncCustomInspector ──────────────────────────────────────────────────
export function syncCustomInspector() {
  var sel = getSelectedCards();
  var c = sel[0];
  if (!c || c.kind !== 'custom') return;

  var nameEl = document.getElementById('cb-card-name');
  if (nameEl) nameEl.value = c.label || '';

  // Art
  var artPreview = document.getElementById('cb-art-preview');
  var artEmpty   = document.getElementById('cb-art-empty');
  if (artPreview && artEmpty) {
    var artImg = c.art && c.art.src ? st.images[c.art.src] : null;
    if (artImg) {
      artPreview.src = artImg.src;
      artPreview.style.display = 'block';
      artEmpty.style.display = 'none';
    } else {
      artPreview.style.display = 'none';
      artEmpty.style.display = 'block';
    }
  }
  document.querySelectorAll('.cb-fit-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.fit === ((c.art && c.art.fit) || 'cover'));
  });

  // Headline
  var hlText = document.getElementById('cb-headline-text');
  if (hlText) hlText.value = (c.headline && c.headline.text) || '';
  var hlSize = document.getElementById('cb-headline-size');
  var hlSizeVal = document.getElementById('cb-headline-size-val');
  if (hlSize) hlSize.value = (c.headline && c.headline.fontSize) || 14;
  if (hlSizeVal) hlSizeVal.textContent = ((c.headline && c.headline.fontSize) || 14) + 'px';
  var hlColor = document.getElementById('cb-headline-color');
  if (hlColor) hlColor.value = (c.headline && c.headline.color) || '#c9a84c';
  document.querySelectorAll('.cb-align-btn[data-layer="headline"]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.align === ((c.headline && c.headline.align) || 'center'));
  });
  var hlY = document.getElementById('cb-headline-y');
  var hlYVal = document.getElementById('cb-headline-y-val');
  if (hlY) hlY.value = Math.round(((c.headline && c.headline.yPct) || 0.08) * 100);
  if (hlYVal) hlYVal.textContent = Math.round(((c.headline && c.headline.yPct) || 0.08) * 100) + '%';
  var hlX = document.getElementById('cb-headline-x');
  var hlXVal = document.getElementById('cb-headline-x-val');
  if (hlX) hlX.value = Math.round(((c.headline && c.headline.xOff) || 0) * 100);
  if (hlXVal) hlXVal.textContent = Math.round(((c.headline && c.headline.xOff) || 0) * 100) + '%';

  // Body
  var bodyText = document.getElementById('cb-body-text');
  if (bodyText) bodyText.value = (c.body && c.body.text) || '';
  var bodySize = document.getElementById('cb-body-size');
  var bodySizeVal = document.getElementById('cb-body-size-val');
  if (bodySize) bodySize.value = (c.body && c.body.fontSize) || 9;
  if (bodySizeVal) bodySizeVal.textContent = ((c.body && c.body.fontSize) || 9) + 'px';
  var bodyColor = document.getElementById('cb-body-color');
  if (bodyColor) bodyColor.value = (c.body && c.body.color) || '#d0c0a0';
  var bodyY = document.getElementById('cb-body-y');
  var bodyYVal = document.getElementById('cb-body-y-val');
  if (bodyY) bodyY.value = Math.round(((c.body && c.body.yPct) || 0.62) * 100);
  if (bodyYVal) bodyYVal.textContent = Math.round(((c.body && c.body.yPct) || 0.62) * 100) + '%';
  var bodyX = document.getElementById('cb-body-x');
  var bodyXVal = document.getElementById('cb-body-x-val');
  if (bodyX) bodyX.value = Math.round(((c.body && c.body.xOff) || 0) * 100);
  if (bodyXVal) bodyXVal.textContent = Math.round(((c.body && c.body.xOff) || 0) * 100) + '%';

  // Border preset highlight
  var presetId = (c.border && c.border.presetId) || 'arcane_gold';
  document.querySelectorAll('.cb-border-tile').forEach(function(tile) {
    tile.classList.toggle('active', tile.dataset.presetId === presetId);
  });

  // Border overrides
  var bs = resolveBorder(c);
  var outerEl = document.getElementById('cb-border-outer');
  if (outerEl) outerEl.value = bs.outerStrokeColor || '#c9a84c';
  var innerEl = document.getElementById('cb-border-inner');
  if (innerEl) innerEl.value = bs.innerStrokeColor || '#8a6a2a';
  var glowEl = document.getElementById('cb-border-glow');
  var glowVal = document.getElementById('cb-border-glow-val');
  if (glowEl) glowEl.value = bs.glow != null ? bs.glow : 14;
  if (glowVal) glowVal.textContent = bs.glow != null ? bs.glow : 14;
  var thickEl = document.getElementById('cb-border-thick');
  var thickVal = document.getElementById('cb-border-thick-val');
  if (thickEl) thickEl.value = bs.thickness != null ? bs.thickness : 2;
  if (thickVal) thickVal.textContent = (bs.thickness != null ? bs.thickness : 2) + 'px';

  // Icons — update slot button labels
  ['tl','tr','bl','br'].forEach(function(corner) {
    var btn = document.querySelector('.cb-icon-slot[data-corner="' + corner + '"]');
    if (!btn) return;
    var icon = c.icons && c.icons[corner];
    var arrowMap = { tl: '↖', tr: '↗', bl: '↙', br: '↘' };
    var sideMap  = { tl: 'L', tr: 'R', bl: 'L', br: 'R' };
    var rowMap   = { tl: 'T', tr: 'T', bl: 'B', br: 'B' };
    var label = corner.toUpperCase();
    if (icon && icon.imgKey) {
      var preset = ICON_PRESETS.find(function(p) { return 'preset:' + p.id === icon.imgKey; });
      btn.textContent = (preset ? preset.label : 'IMG') + ' ' + arrowMap[corner];
      btn.style.borderColor = icon.color || '#ffffff';
    } else {
      btn.textContent = arrowMap[corner] + ' ' + label;
      btn.style.borderColor = '';
    }
  });

  // Background
  var col1 = document.getElementById('cb-base-color1');
  if (col1) col1.value = (c.base && c.base.color) || '#1a1a2e';
  var col2 = document.getElementById('cb-base-color2');
  if (col2) col2.value = (c.base && c.base.color2) || '#0a0a18';
}

// ─── Register with renderer to avoid circular dep ────────────────────────
setSyncCustomInspector(syncCustomInspector);

// ─── Helper: get first selected custom card ──────────────────────────────
function getCustomCard() {
  var sel = getSelectedCards();
  return (sel[0] && sel[0].kind === 'custom') ? sel[0] : null;
}

// ─── Build border preset thumbnail strip ─────────────────────────────────
(function() {
  var container = document.getElementById('cb-border-presets');
  if (!container) return;

  BORDER_PRESETS.forEach(function(preset) {
    var tile = document.createElement('div');
    tile.className = 'cb-border-tile';
    tile.dataset.presetId = preset.id;

    var cvs = document.createElement('canvas');
    cvs.width  = 44;
    cvs.height = 62;
    var ctx = cvs.getContext('2d');

    // Dark gradient background
    var bg = ctx.createLinearGradient(0, 0, 44, 62);
    bg.addColorStop(0, '#1a1a2e');
    bg.addColorStop(1, '#0a0a12');
    ctx.fillStyle = bg;
    ctx.beginPath();
    roundRectPath2d(ctx, 0, 0, 44, 62, 4);
    ctx.fill();

    var bs = preset.baseStyle;

    // Outer glow + stroke
    if (bs.glow > 0) {
      ctx.save();
      ctx.shadowColor = bs.accentColor;
      ctx.shadowBlur  = bs.glow * 0.5;
      ctx.strokeStyle = bs.outerStrokeColor;
      ctx.lineWidth   = bs.thickness || 2;
      ctx.beginPath();
      roundRectPath2d(ctx, 1, 1, 42, 60, 3);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = bs.outerStrokeColor;
      ctx.lineWidth   = bs.thickness || 1;
      ctx.beginPath();
      roundRectPath2d(ctx, 1, 1, 42, 60, 3);
      ctx.stroke();
    }

    // Inner stroke
    if (bs.inset > 0) {
      var ins = bs.inset * 0.5;
      ctx.strokeStyle = bs.innerStrokeColor;
      ctx.lineWidth   = 0.75;
      ctx.beginPath();
      roundRectPath2d(ctx, ins + 1, ins + 1, 42 - ins * 2, 60 - ins * 2, Math.max(1, 3 - ins));
      ctx.stroke();
    }

    // Category label
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(preset.category, 22, 58);

    tile.appendChild(cvs);

    var label = document.createElement('div');
    label.textContent = preset.name;
    label.style.fontSize = '8px';
    tile.appendChild(label);

    tile.addEventListener('click', function() {
      var c = getCustomCard();
      if (!c) return;
      if (!c.border) c.border = { presetId: preset.id, overrides: {} };
      else c.border.presetId = preset.id;
      document.querySelectorAll('.cb-border-tile').forEach(function(t) { t.classList.remove('active'); });
      tile.classList.add('active');
      syncCustomInspector();
      markDirty();
    });

    container.appendChild(tile);
  });
})();

// ─── Inline rounded rect path helper (no dep on fx-engine) ───────────────
function roundRectPath2d(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ─── Wire all inspector event handlers ───────────────────────────────────
(function() {

  // Card name
  var nameEl = document.getElementById('cb-card-name');
  if (nameEl) {
    nameEl.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.label = this.value;
      renderLayers();
    });
  }

  // Art file upload
  var artFile = document.getElementById('cb-art-file');
  if (artFile) {
    artFile.addEventListener('change', function() {
      var c = getCustomCard(); if (!c) return;
      var file = this.files[0]; if (!file) return;
      var id = 'a' + (st.nextAssetId++);
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.src = e.target.result;
        st.images[id] = img;
        img.onload = function() {
          c.art.src = id;
          var artPreview = document.getElementById('cb-art-preview');
          var artEmpty   = document.getElementById('cb-art-empty');
          if (artPreview) { artPreview.src = img.src; artPreview.style.display = 'block'; }
          if (artEmpty)   { artEmpty.style.display = 'none'; }
          markDirty();
        };
      };
      reader.readAsDataURL(file);
      this.value = '';
    });
  }

  // Art fit buttons
  document.querySelectorAll('.cb-fit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var c = getCustomCard(); if (!c) return;
      c.art.fit = this.dataset.fit;
      document.querySelectorAll('.cb-fit-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      markDirty();
    });
  });

  // Headline text
  var hlText = document.getElementById('cb-headline-text');
  if (hlText) {
    hlText.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.headline.text = this.value;
      markDirty();
    });
  }

  // Headline size
  var hlSize = document.getElementById('cb-headline-size');
  if (hlSize) {
    hlSize.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.headline.fontSize = parseFloat(this.value);
      var val = document.getElementById('cb-headline-size-val');
      if (val) val.textContent = this.value + 'px';
      markDirty();
    });
  }

  // Headline color
  var hlColor = document.getElementById('cb-headline-color');
  if (hlColor) {
    hlColor.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.headline.color = this.value;
      markDirty();
    });
  }

  // Headline alignment
  document.querySelectorAll('.cb-align-btn[data-layer="headline"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var c = getCustomCard(); if (!c) return;
      c.headline.align = this.dataset.align;
      document.querySelectorAll('.cb-align-btn[data-layer="headline"]').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      markDirty();
    });
  });

  // Body text
  var bodyText = document.getElementById('cb-body-text');
  if (bodyText) {
    bodyText.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.body.text = this.value;
      markDirty();
    });
  }

  // Body size
  var bodySize = document.getElementById('cb-body-size');
  if (bodySize) {
    bodySize.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.body.fontSize = parseFloat(this.value);
      var val = document.getElementById('cb-body-size-val');
      if (val) val.textContent = this.value + 'px';
      markDirty();
    });
  }

  // Body color
  var bodyColor = document.getElementById('cb-body-color');
  if (bodyColor) {
    bodyColor.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.body.color = this.value;
      markDirty();
    });
  }

  // Headline Y position
  var hlYSlider = document.getElementById('cb-headline-y');
  if (hlYSlider) {
    hlYSlider.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.headline.yPct = parseFloat(this.value) / 100;
      var val = document.getElementById('cb-headline-y-val');
      if (val) val.textContent = this.value + '%';
      markDirty();
    });
  }

  // Headline X offset
  var hlXSlider = document.getElementById('cb-headline-x');
  if (hlXSlider) {
    hlXSlider.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.headline.xOff = parseFloat(this.value) / 100;
      var val = document.getElementById('cb-headline-x-val');
      if (val) val.textContent = this.value + '%';
      markDirty();
    });
  }

  // Body Y position
  var bodyYSlider = document.getElementById('cb-body-y');
  if (bodyYSlider) {
    bodyYSlider.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.body.yPct = parseFloat(this.value) / 100;
      var val = document.getElementById('cb-body-y-val');
      if (val) val.textContent = this.value + '%';
      markDirty();
    });
  }

  // Body X offset
  var bodyXSlider = document.getElementById('cb-body-x');
  if (bodyXSlider) {
    bodyXSlider.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.body.xOff = parseFloat(this.value) / 100;
      var val = document.getElementById('cb-body-x-val');
      if (val) val.textContent = this.value + '%';
      markDirty();
    });
  }

  // Border outer color
  var borderOuter = document.getElementById('cb-border-outer');
  if (borderOuter) {
    borderOuter.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      if (!c.border.overrides) c.border.overrides = {};
      c.border.overrides.outerStrokeColor = this.value;
      markDirty();
    });
  }

  // Border inner color
  var borderInner = document.getElementById('cb-border-inner');
  if (borderInner) {
    borderInner.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      if (!c.border.overrides) c.border.overrides = {};
      c.border.overrides.innerStrokeColor = this.value;
      markDirty();
    });
  }

  // Border glow
  var borderGlow = document.getElementById('cb-border-glow');
  if (borderGlow) {
    borderGlow.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      if (!c.border.overrides) c.border.overrides = {};
      c.border.overrides.glow = parseFloat(this.value);
      var val = document.getElementById('cb-border-glow-val');
      if (val) val.textContent = this.value;
      markDirty();
    });
  }

  // Border thickness
  var borderThick = document.getElementById('cb-border-thick');
  if (borderThick) {
    borderThick.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      if (!c.border.overrides) c.border.overrides = {};
      c.border.overrides.thickness = parseFloat(this.value);
      var val = document.getElementById('cb-border-thick-val');
      if (val) val.textContent = this.value + 'px';
      markDirty();
    });
  }

  // Base color 1
  var baseColor1 = document.getElementById('cb-base-color1');
  if (baseColor1) {
    baseColor1.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.base.color = this.value;
      markDirty();
    });
  }

  // Base color 2
  var baseColor2 = document.getElementById('cb-base-color2');
  if (baseColor2) {
    baseColor2.addEventListener('input', function() {
      var c = getCustomCard(); if (!c) return;
      c.base.color2 = this.value;
      markDirty();
    });
  }

  // ── Icon picker ──────────────────────────────────────────────────────────
  (function() {
    var picker      = document.getElementById('cb-icon-picker');
    var pickerLabel = document.getElementById('cb-icon-picker-label');
    var presetGrid  = document.getElementById('cb-icon-preset-grid');
    var colorPick   = document.getElementById('cb-icon-color');
    var uploadInput = document.getElementById('cb-icon-upload');
    var btnClear    = document.getElementById('cb-icon-clear');
    if (!picker || !presetGrid) return;

    var activeCorner = null;
    var cornerNames = { tl: 'TOP LEFT', tr: 'TOP RIGHT', bl: 'BOT LEFT', br: 'BOT RIGHT' };

    // Build preset swatches once
    ICON_PRESETS.forEach(function(preset) {
      var swatch = document.createElement('div');
      swatch.className = 'cb-icon-preset-swatch';
      swatch.dataset.presetId = preset.id;
      swatch.title = preset.label;
      // Mini canvas with tinted icon
      var cvs = document.createElement('canvas'); cvs.width = 28; cvs.height = 28;
      var ctx2 = cvs.getContext('2d');
      // Draw the swatch using the preloaded image via a timeout (image may not be ready yet)
      function drawSwatch() {
        var imgRef = st.images['preset:' + preset.id];
        if (!imgRef || !imgRef.complete) { setTimeout(drawSwatch, 100); return; }
        ctx2.clearRect(0, 0, 28, 28);
        ctx2.drawImage(imgRef, 0, 0, 28, 28);
        ctx2.globalCompositeOperation = 'source-in';
        ctx2.fillStyle = preset.color;
        ctx2.fillRect(0, 0, 28, 28);
      }
      drawSwatch();
      swatch.appendChild(cvs);
      swatch.addEventListener('click', function() {
        if (!activeCorner) return;
        var c = getCustomCard(); if (!c) return;
        if (!c.icons) c.icons = {};
        var curColor = (colorPick && colorPick.value) || preset.color;
        c.icons[activeCorner] = { imgKey: 'preset:' + preset.id, color: curColor };
        markDirty();
        syncCustomInspector();
        updateActiveSwatches();
      });
      presetGrid.appendChild(swatch);
    });

    function updateActiveSwatches() {
      var c = getCustomCard(); if (!c || !activeCorner) return;
      var icon = c.icons && c.icons[activeCorner];
      presetGrid.querySelectorAll('.cb-icon-preset-swatch').forEach(function(sw) {
        sw.classList.toggle('active', !!(icon && icon.imgKey === 'preset:' + sw.dataset.presetId));
      });
      if (colorPick && icon && icon.color) colorPick.value = icon.color;
    }

    // Open/close picker when slot is clicked
    document.querySelectorAll('.cb-icon-slot').forEach(function(slot) {
      slot.addEventListener('click', function() {
        var corner = this.dataset.corner;
        if (activeCorner === corner && picker.style.display !== 'none') {
          picker.style.display = 'none';
          activeCorner = null;
          document.querySelectorAll('.cb-icon-slot').forEach(function(s) { s.classList.remove('active'); });
          return;
        }
        activeCorner = corner;
        document.querySelectorAll('.cb-icon-slot').forEach(function(s) {
          s.classList.toggle('active', s.dataset.corner === corner);
        });
        if (pickerLabel) pickerLabel.textContent = 'PICK ICON — ' + (cornerNames[corner] || corner.toUpperCase());
        picker.style.display = 'block';
        updateActiveSwatches();
      });
    });

    // Color change — update the active corner's icon tint
    if (colorPick) {
      colorPick.addEventListener('input', function() {
        if (!activeCorner) return;
        var c = getCustomCard(); if (!c) return;
        if (c.icons && c.icons[activeCorner]) {
          c.icons[activeCorner].color = this.value;
          if (c.icons[activeCorner]._cache) { c.icons[activeCorner]._cache = null; }
          markDirty();
          syncCustomInspector();
        }
      });
    }

    // Upload custom icon
    if (uploadInput) {
      uploadInput.addEventListener('change', function() {
        if (!activeCorner || !this.files || !this.files[0]) return;
        var c = getCustomCard(); if (!c) return;
        var file = this.files[0];
        var reader = new FileReader();
        reader.onload = function(ev) {
          var imgKey = 'icon_upload_' + Date.now();
          var img2 = new Image();
          img2.onload = function() {
            st.images[imgKey] = img2;
            if (!c.icons) c.icons = {};
            var col = (colorPick && colorPick.value) || '#ffffff';
            c.icons[activeCorner] = { imgKey: imgKey, color: col };
            markDirty();
            syncCustomInspector();
            updateActiveSwatches();
          };
          img2.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        this.value = '';
      });
    }

    // Clear icon
    if (btnClear) {
      btnClear.addEventListener('click', function() {
        if (!activeCorner) return;
        var c = getCustomCard(); if (!c) return;
        if (c.icons) c.icons[activeCorner] = null;
        markDirty();
        syncCustomInspector();
        updateActiveSwatches();
        picker.style.display = 'none';
        activeCorner = null;
        document.querySelectorAll('.cb-icon-slot').forEach(function(s) { s.classList.remove('active'); });
      });
    }
  }());

  // Done / Save button — finalize the card and switch to effects inspector
  var btnDone = document.getElementById('btn-cb-done');
  if (btnDone) {
    btnDone.addEventListener('click', function() {
      var c = getCustomCard(); if (!c) return;
      c.finalized = true;
      markDirty();
      refreshInspectorContent();
    });
  }

})();
