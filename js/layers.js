// ============================================================
//  ARCANA GLAM — Layer Management  (layers.js)
//  renderLayers, selectCard, duplicate, deselect, st.groups,
//  layer slots, drag-to-reorder.
// ============================================================

import { AppState as st } from './state.js';
import { markDirty, syncRefs, updateCardCount, hideEmpty, focusCamera } from './app.js';
import { clearParticlePool } from './fx-engine.js';
import { calcTotalDuration, renderTimeline, resetAnimOffsets, setPlayState, updateScrubber } from './timeline.js';
import { updateInspector } from './app.js';
import { showToast } from './app.js';

// ============================================================
//  LAYERS PANEL
// ============================================================
st.layerDrag = null;
// = null;    // for shift-range selection
// = null;    // for shift-range from group headers
// = {};              // slot (1-9) → card id OR 'group:N'
// = {};              // slot (1-9) → group id
// = [];                  // [{ id, name, collapsed }]
// = 1;
// = [];      // card ids in visual list order (for shift-select)

export function getCardLabel(card, idx) {
  if (card.label) return card.label;
  var base = 'Card ' + (idx + 1);
  if (card.showBack && card.backImg) return base + ' ↔';
  return base;
}

// ── Layer rendering helpers ────────────────────────────────────────────────

// Returns ordered list of layer rows in the visual order (front-to-back)
// Each entry: { type:'card'|'group', card?, group?, arrayIdx? }
export function buildLayerRows() {
  var rows = [];
  // Walk st.cards back-to-front (front = last in array)
  for (var i = st.cards.length - 1; i >= 0; i--) {
    rows.push({ type: 'card', card: st.cards[i], arrayIdx: i });
  }
  return rows;
}

// Get the list order index of a card id (for shift-range selection)
export function listIdxOfCard(id) {
  for (var i = st.cards.length - 1, li = 0; i >= 0; i--, li++) {
    if (st.cards[i].id === id) return li;
  }
  return -1;
}

export function makeInlineRenameInput(currentVal, onCommit) {
  var input = document.createElement('input');
  input.type = 'text';
  input.value = currentVal;
  input.style.cssText = 'width:100%;background:var(--panel2);border:1px solid var(--gold);'
    + 'color:var(--text);font-family:var(--font-body);font-size:11px;padding:1px 4px;'
    + 'border-radius:3px;outline:none;';
  input.addEventListener('blur', function() { onCommit(input.value.trim()); });
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter')  { input.blur(); }
    if (ev.key === 'Escape') { onCommit(null); }
    ev.stopPropagation();
  });
  return input;
}

// Module-level double-tap state — survives DOM rebuilds inside renderLayers()
var _focusTapId = null, _focusTapT = 0;

export function renderLayers() {
  var list = document.getElementById('layers-list');
  list.innerHTML = '';

  if (st.cards.length === 0) {
    list.innerHTML = '<div class="layers-empty">No st.cards yet</div>';
    return;
  }

  // ── Render group headers then their st.cards, or ungrouped st.cards ──────────

  // Collect st.groups that actually have st.cards
  var usedGroupIds = {};
  st.cards.forEach(function(c) { if (c.groupId) usedGroupIds[c.groupId] = true; });

  // Build display order: group blocks + ungrouped st.cards, both front-to-back
  // We'll render card items in reverse-array order (front first)
  var rendered = []; // track list-order for shift-select
  var groupSeen = {};
  st.renderedLayerOrder = []; // reset persistent order

  for (var i = st.cards.length - 1; i >= 0; i--) {
    var card = st.cards[i];
    var arrayIdx = i;

    if (card.groupId && usedGroupIds[card.groupId]) {
      var grp = st.groups.find(function(g) { return g.id === card.groupId; });
      if (!grp) { card.groupId = null; } // orphan — clear group
      else if (!groupSeen[card.groupId]) {
        groupSeen[card.groupId] = true;
        // ── Group header ──────────────────────────────────────────────────
        (function(g) {
          // Collect all card ids in this group (in visual order)
          var groupCardIds = [];
          for (var gi = st.cards.length - 1; gi >= 0; gi--) {
            if (st.cards[gi].groupId === g.id && !st.cards[gi].locked) groupCardIds.push(st.cards[gi].id);
          }
          var allGroupSelected = groupCardIds.length > 0 &&
            groupCardIds.every(function(id) { return st.selectedIds.indexOf(id) >= 0; });

          var hdr = document.createElement('div');
          hdr.className = 'layer-group-header';
          if (allGroupSelected) hdr.classList.add('group-selected');
          hdr.dataset.groupId = g.id;
          hdr.setAttribute('draggable', 'true');

          // Drag handle for group
          var gHandle = document.createElement('div');
          gHandle.className = 'layer-drag-handle';
          gHandle.title = 'Drag group to reorder';
          gHandle.innerHTML = '<span></span><span></span><span></span>';
          hdr.appendChild(gHandle);

          var chev = document.createElement('span');
          chev.className = 'layer-group-chevron' + (g.collapsed ? ' collapsed' : '');
          chev.textContent = '▾';
          hdr.appendChild(chev);

          // Group slot badge
          var gSlotNum = null;
          Object.keys(st.groupSlots).forEach(function(k) {
            if (st.groupSlots[k] === g.id) gSlotNum = k;
          });
          if (gSlotNum !== null) {
            var gBadge = document.createElement('span');
            gBadge.className = 'layer-slot-badge';
            gBadge.textContent = gSlotNum;
            gBadge.title = 'Press ' + gSlotNum + ' to select group  |  Ctrl+' + gSlotNum + ' to reassign';
            hdr.appendChild(gBadge);
          }

          var gname = document.createElement('div');
          gname.className = 'layer-group-name';
          gname.textContent = g.name || 'Group';
          gname.title = 'Click to select all · Double-click to rename';
          gname.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            var inp = makeInlineRenameInput(g.name || 'Group', function(val) {
              if (val !== null) g.name = val || 'Group';
              renderLayers();
            });
            gname.replaceWith(inp);
            inp.focus(); inp.select();
          });
          hdr.appendChild(gname);

          // Group actions
          var ga = document.createElement('div');
          ga.className = 'layer-actions';

          // Ungroup
          var ugBtn = document.createElement('button');
          ugBtn.className = 'layer-btn';
          ugBtn.title = 'Ungroup';
          ugBtn.textContent = '⊟';
          ugBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            st.cards.forEach(function(c) { if (c.groupId === g.id) c.groupId = null; });
            st.groups = st.groups.filter(function(x) { return x.id !== g.id; });
            // Clear any slot for this group
            Object.keys(st.groupSlots).forEach(function(k) { if (st.groupSlots[k] === g.id) delete st.groupSlots[k]; });
            renderLayers();
          });
          ga.appendChild(ugBtn);
          hdr.appendChild(ga);

          // ── Group header click: select all st.cards in group ────────────
          hdr.addEventListener('click', function(e) {
            if (e.target === ugBtn || ugBtn.contains(e.target)) return;
            if (e.target === chev || e.target.classList.contains('layer-group-chevron')) {
              g.collapsed = !g.collapsed;
              renderLayers();
              return;
            }
            if (e.target.classList.contains('layer-group-name') || e.target === gname) {
              // Name click: select all group st.cards
              if (e.shiftKey && st.lastClickedLayerId !== null) {
                // Extend range: find first & last visible card in this group and range-select
                var lo2 = Infinity, hi2 = -1;
                groupCardIds.forEach(function(gid) {
                  var pos = st.renderedLayerOrder.indexOf(gid);
                  if (pos >= 0) { lo2 = Math.min(lo2, pos); hi2 = Math.max(hi2, pos); }
                });
                var anchorPos = st.renderedLayerOrder.indexOf(st.lastClickedLayerId);
                if (anchorPos >= 0 && lo2 !== Infinity) {
                  var rangeStart = Math.min(anchorPos, lo2);
                  var rangeEnd   = Math.max(anchorPos, hi2);
                  if (!e.ctrlKey && !e.metaKey) st.selectedIds = [];
                  for (var ri2 = rangeStart; ri2 <= rangeEnd; ri2++) {
                    var rid2 = st.renderedLayerOrder[ri2];
                    var rc2 = st.cards.find(function(c) { return c.id === rid2; });
                    if (rc2 && !rc2.locked && st.selectedIds.indexOf(rid2) < 0) st.selectedIds.push(rid2);
                  }
                }
              } else if (e.ctrlKey || e.metaKey) {
                // Toggle all group st.cards
                if (allGroupSelected) {
                  groupCardIds.forEach(function(id) {
                    var idx2 = st.selectedIds.indexOf(id);
                    if (idx2 >= 0) st.selectedIds.splice(idx2, 1);
                  });
                } else {
                  groupCardIds.forEach(function(id) {
                    if (st.selectedIds.indexOf(id) < 0) st.selectedIds.push(id);
                  });
                }
              } else {
                // Plain click: select only this group's st.cards
                st.selectedIds = groupCardIds.slice();
              }
              // Set st.lastClickedLayerId to last card in group for subsequent shift-range
              if (groupCardIds.length > 0) st.lastClickedLayerId = groupCardIds[groupCardIds.length - 1];
              st.lastClickedGroupId = g.id;
              syncRefs(); updateInspector(); renderLayers();
              return;
            }
            // Click on header (not name, not chevron, not ugBtn) — toggle collapse
            g.collapsed = !g.collapsed;
            renderLayers();
          });

          // ── Group drag to reorder ──────────────────────────────────────
          hdr.addEventListener('dragstart', function(e) {
            st.layerDrag = { groupId: g.id, groupCardIds: groupCardIds };
            hdr.classList.add('dragging-layer');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
          });
          hdr.addEventListener('dragend', function() {
            hdr.classList.remove('dragging-layer');
            document.querySelectorAll('.layer-item, .layer-group-header').forEach(function(el) {
              el.classList.remove('drag-over-top', 'drag-over-bottom');
            });
            st.layerDrag = null;
            renderLayers();
          });
          hdr.addEventListener('dragover', function(e) {
            e.preventDefault();
            if (!st.layerDrag) return;
            document.querySelectorAll('.layer-item, .layer-group-header').forEach(function(el) {
              el.classList.remove('drag-over-top', 'drag-over-bottom');
            });
            hdr.classList.add('drag-over-top');
          });
          hdr.addEventListener('dragleave', function() {
            hdr.classList.remove('drag-over-top', 'drag-over-bottom');
          });
          hdr.addEventListener('drop', function(e) {
            e.preventDefault();
            hdr.classList.remove('drag-over-top', 'drag-over-bottom');
            if (!st.layerDrag) return;
            if (st.layerDrag.groupId != null) {
              // Group dragged onto another group: swap their positions
              var srcGId = st.layerDrag.groupId;
              var dstGId = g.id;
              if (srcGId === dstGId) return;
              // Find lowest array index of each group, then swap all st.cards
              var srcCards = st.cards.filter(function(c) { return c.groupId === srcGId; });
              var dstCards = st.cards.filter(function(c) { return c.groupId === dstGId; });
              var dstMinIdx = Math.min.apply(null, dstCards.map(function(c) { return st.cards.indexOf(c); }));
              // Remove src group st.cards and re-insert above dst group
              srcCards.forEach(function(c) { st.cards.splice(st.cards.indexOf(c), 1); });
              dstMinIdx = Math.min.apply(null, dstCards.map(function(c) { return st.cards.indexOf(c); }));
              srcCards.forEach(function(c, i) { st.cards.splice(dstMinIdx + i, 0, c); });
            } else if (st.layerDrag.arrayIdx != null) {
              // Card dragged onto group header: add card to this group
              var movedCard = st.cards[st.layerDrag.arrayIdx];
              if (movedCard) movedCard.groupId = g.id;
            }
            syncRefs(); renderLayers();
          });

          list.appendChild(hdr);
        })(grp);
      }

      // If group collapsed, skip card rows
      var grp2 = st.groups.find(function(g2) { return g2.id === card.groupId; });
      if (grp2 && grp2.collapsed) continue;
    }

    // ── Card row ──────────────────────────────────────────────────────────
    rendered.push(card.id);
    st.renderedLayerOrder.push(card.id); // persistent for shift-select
    (function(card, arrayIdx, listPos) {
      var item = document.createElement('div');
      item.className = 'layer-item';
      if (card.groupId) item.classList.add('grouped');
      if (card.hidden)  item.classList.add('layer-hidden');
      if (card.locked)  item.classList.add('layer-locked');
      if (st.selectedIds.indexOf(card.id) >= 0) item.classList.add('selected');
      item.dataset.arrayIdx = arrayIdx;
      item.dataset.cardId   = card.id;

      // Drag handle
      var handle = document.createElement('div');
      handle.className = 'layer-drag-handle';
      handle.title = 'Drag to reorder';
      handle.innerHTML = '<span></span><span></span><span></span>';
      item.appendChild(handle);

      // Slot badge (numpad binding)
      var slotNum = null;
      Object.keys(st.layerSlots).forEach(function(k) {
        if (st.layerSlots[k] === card.id) slotNum = k;
      });
      if (slotNum !== null) {
        var badge = document.createElement('span');
        badge.className = 'layer-slot-badge';
        badge.textContent = slotNum;
        badge.title = 'Press ' + slotNum + ' to select  |  Ctrl+' + slotNum + ' to reassign';
        item.appendChild(badge);
      }

      // Type badge for text / rect objects
      if (card.kind === 'text' || card.kind === 'rect') {
        var typeBadge = document.createElement('span');
        typeBadge.className = 'layer-type-badge' + (card.kind === 'rect' ? ' rect-badge' : '');
        typeBadge.textContent = card.kind === 'text' ? 'T' : '▭';
        item.appendChild(typeBadge);
      }

      // Thumbnail
      var thumb = document.createElement('div');
      thumb.className = 'layer-thumb';
      if (card.kind === 'text') {
        thumb.textContent = 'T';
        thumb.style.color = '#FF9F45'; thumb.style.fontFamily = 'Cinzel,serif';
      } else if (card.kind === 'rect') {
        thumb.textContent = '▭';
        thumb.style.color = '#7a6fff'; thumb.style.fontSize = '12px';
      } else {
        var imgKey = card.showBack ? card.backImg : card.frontImg;
        if (imgKey && st.images[imgKey]) {
          var thumbImg = document.createElement('img');
          thumbImg.src = st.images[imgKey].src || st.images[imgKey];
          thumb.appendChild(thumbImg);
        } else {
          thumb.textContent = '✦';
        }
      }
      item.appendChild(thumb);

      // Name — double-click to rename
      var name = document.createElement('div');
      var defaultLabel = card.kind === 'text' ? (card.label || (card.content || 'Text').slice(0,16))
                       : card.kind === 'rect' ? (card.label || ('Rect ' + (arrayIdx+1)))
                       : getCardLabel(card, arrayIdx);
      name.className = 'layer-name' + (!card.kind && !card.frontImg && !card.backImg ? ' muted' : '');
      name.textContent = card.label || defaultLabel;
      name.title = 'Double-click to rename';
      name.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        var inp = makeInlineRenameInput(card.label || defaultLabel, function(val) {
          if (val !== null) card.label = val || null;
          renderLayers();
        });
        name.replaceWith(inp);
        inp.focus(); inp.select();
      });
      item.appendChild(name);

      // ── Icon buttons ─────────────────────────────────────────────────────
      var actions = document.createElement('div');
      actions.className = 'layer-actions';

      // Hide / Show
      var visBtn = document.createElement('button');
      visBtn.className = 'layer-btn' + (card.hidden ? '' : ' active');
      visBtn.title = card.hidden ? 'Show layer' : 'Hide layer';
      visBtn.textContent = card.hidden ? '🙈' : '👁';
      visBtn.style.fontSize = '9px';
      visBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        card.hidden = !card.hidden;
        renderLayers();
      });
      actions.appendChild(visBtn);

      // Lock / Unlock
      var lockBtn = document.createElement('button');
      lockBtn.className = 'layer-btn' + (card.locked ? ' active' : '');
      lockBtn.title = card.locked ? 'Unlock layer' : 'Lock layer';
      lockBtn.textContent = card.locked ? '🔒' : '🔓';
      lockBtn.style.fontSize = '9px';
      lockBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        card.locked = !card.locked;
        if (card.locked) {
          var si = st.selectedIds.indexOf(card.id);
          if (si >= 0) st.selectedIds.splice(si, 1);
        }
        renderLayers(); updateInspector();
      });
      actions.appendChild(lockBtn);

      // Delete
      var delBtn = document.createElement('button');
      delBtn.className = 'layer-btn del';
      delBtn.title = 'Delete layer';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        st.cards.splice(arrayIdx, 1);
        var si = st.selectedIds.indexOf(card.id);
        if (si >= 0) st.selectedIds.splice(si, 1);
        // Remove from any slot bindings
        Object.keys(st.layerSlots).forEach(function(k) {
          if (st.layerSlots[k] === card.id) delete st.layerSlots[k];
        });
        delete st.sequences[card.id];
        clearParticlePool(card.id);
        syncRefs(); updateCardCount(); hideEmpty();
        renderLayers(); updateInspector(); calcTotalDuration(); renderTimeline();
      });
      actions.appendChild(delBtn);
      item.appendChild(actions);

      // ── Click selection ───────────────────────────────────────────────────
      item.addEventListener('click', function(e) {
        var actionEls = [visBtn, lockBtn, delBtn];
        for (var ai = 0; ai < actionEls.length; ai++) {
          if (e.target === actionEls[ai] || actionEls[ai].contains(e.target)) return;
        }
        if (card.locked) return; // locked layers can't be selected from panel

        // Double-click / double-tap → focus camera on this card.
        // Must run here (before renderLayers rebuilds the DOM) using module-level state.
        var _now = Date.now();
        if (_focusTapId === card.id && _now - _focusTapT < 500) {
          focusCamera(card);
          _focusTapId = null; _focusTapT = 0;
          return; // don't change selection on the second tap
        }
        _focusTapId = card.id; _focusTapT = _now;

        if (e.shiftKey && st.lastClickedLayerId !== null) {
          // Range select between st.lastClickedLayerId and this card (using persistent order)
          var fromPos = st.renderedLayerOrder.indexOf(st.lastClickedLayerId);
          var toPos   = st.renderedLayerOrder.indexOf(card.id);
          if (fromPos < 0) fromPos = toPos;
          var lo = Math.min(fromPos, toPos), hi = Math.max(fromPos, toPos);
          if (!e.ctrlKey && !e.metaKey) st.selectedIds = [];
          for (var ri = lo; ri <= hi; ri++) {
            var rid = st.renderedLayerOrder[ri];
            var rc = st.cards.find(function(c) { return c.id === rid; });
            if (rc && !rc.locked && st.selectedIds.indexOf(rid) < 0) st.selectedIds.push(rid);
          }
        } else if (e.ctrlKey || e.metaKey) {
          // Toggle individual
          var idx2 = st.selectedIds.indexOf(card.id);
          if (idx2 >= 0) st.selectedIds.splice(idx2, 1);
          else st.selectedIds.push(card.id);
          st.lastClickedLayerId = card.id;
        } else {
          // Plain click — exclusive select
          st.selectedIds = [card.id];
          st.lastClickedLayerId = card.id;
        }

        syncRefs(); updateInspector(); renderLayers();
      });

      // ── Drag to reorder ───────────────────────────────────────────────────
      item.setAttribute('draggable', 'true');

      item.addEventListener('dragstart', function(e) {
        st.layerDrag = { arrayIdx: arrayIdx };
        item.classList.add('dragging-layer');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
      });
      item.addEventListener('dragend', function() {
        item.classList.remove('dragging-layer');
        document.querySelectorAll('.layer-item, .layer-group-header').forEach(function(el) {
          el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        st.layerDrag = null;
        renderLayers();
      });
      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (!st.layerDrag) return;
        if (st.layerDrag.arrayIdx === arrayIdx) return;
        var rect = item.getBoundingClientRect();
        document.querySelectorAll('.layer-item, .layer-group-header').forEach(function(el) {
          el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        if (e.clientY < rect.top + rect.height / 2) {
          item.classList.add('drag-over-top');
          st.layerDrag.targetArrayIdx = arrayIdx + 1;
        } else {
          item.classList.add('drag-over-bottom');
          st.layerDrag.targetArrayIdx = arrayIdx;
        }
      });
      item.addEventListener('dragleave', function() {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      item.addEventListener('drop', function(e) {
        e.preventDefault();
        item.classList.remove('drag-over-top', 'drag-over-bottom');
        if (!st.layerDrag) return;
        if (st.layerDrag.groupId != null) {
          // Group dragged onto a card: move whole group to this position
          if (st.layerDrag.targetArrayIdx == null) st.layerDrag.targetArrayIdx = arrayIdx;
          var srcGCards = st.cards.filter(function(c) { return c.groupId === st.layerDrag.groupId; });
          srcGCards.forEach(function(c) { st.cards.splice(st.cards.indexOf(c), 1); });
          var insertAt2 = Math.max(0, Math.min(st.cards.length, st.layerDrag.targetArrayIdx));
          srcGCards.forEach(function(c, ii) { st.cards.splice(insertAt2 + ii, 0, c); });
          syncRefs(); renderLayers();
          return;
        }
        if (st.layerDrag.arrayIdx === arrayIdx || st.layerDrag.targetArrayIdx == null) return;
        var fromIdx = st.layerDrag.arrayIdx;
        var toIdx   = st.layerDrag.targetArrayIdx;
        var moved   = st.cards.splice(fromIdx, 1)[0];
        var insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx;
        insertAt = Math.max(0, Math.min(st.cards.length, insertAt));
        st.cards.splice(insertAt, 0, moved);
        syncRefs(); renderLayers();
      });

      list.appendChild(item);
    })(card, arrayIdx, rendered.length - 1);
  }
}


// Layer order buttons (operate on selected st.cards, or last card)
export function getLayerTargetIdx() {
  if (st.selectedIds.length > 0) {
    var id = st.selectedIds[st.selectedIds.length - 1];
    return st.cards.findIndex(function(c) { return c.id === id; });
  }
  return -1;
}

document.getElementById('btn-layer-up').addEventListener('click', function() {
  var idx = getLayerTargetIdx(); if (idx < 0 || idx >= st.cards.length - 1) return;
  var tmp = st.cards[idx]; st.cards[idx] = st.cards[idx + 1]; st.cards[idx + 1] = tmp;
  syncRefs(); renderLayers();
});
document.getElementById('btn-layer-down').addEventListener('click', function() {
  var idx = getLayerTargetIdx(); if (idx <= 0) return;
  var tmp = st.cards[idx]; st.cards[idx] = st.cards[idx - 1]; st.cards[idx - 1] = tmp;
  syncRefs(); renderLayers();
});
document.getElementById('btn-layer-top').addEventListener('click', function() {
  var idx = getLayerTargetIdx(); if (idx < 0 || idx === st.cards.length - 1) return;
  var moved = st.cards.splice(idx, 1)[0]; st.cards.push(moved);
  syncRefs(); renderLayers();
});
document.getElementById('btn-layer-bottom').addEventListener('click', function() {
  var idx = getLayerTargetIdx(); if (idx <= 0) return;
  var moved = st.cards.splice(idx, 1)[0]; st.cards.unshift(moved);
  syncRefs(); renderLayers();
});

// ============================================================
//  SELECTION
// ============================================================
export function selectCard(id, multi) {
  if (!multi) {
    st.selectedIds = (id != null) ? [id] : [];
  } else if (id != null) {
    var ix = st.selectedIds.indexOf(id);
    if (ix === -1) st.selectedIds.push(id);
    else st.selectedIds.splice(ix, 1);
  }
  syncRefs();
  renderLayers();
  updateInspector();
  markDirty();
}

export function duplicateSelected() {
  var sel = getSelectedCards();
  if (!sel.length) return;
  var newIds = [];
  sel.forEach(function(c) {
    var copy = deepClone(c);
    copy.id = 'c' + (st.nextCardId++);
    copy.x = (c.x || 0) + 20;
    copy.y = (c.y || 0) + 20;
    st.cards.push(copy);
    newIds.push(copy.id);
  });
  st.selectedIds = newIds;
  syncRefs();
  renderLayers();
  updateInspector();
  markDirty();
}

export function deselectAll() {
  st.selectedIds = [];
  syncRefs();
  renderLayers();
  updateInspector();
  markDirty();
}

export function getSelectedCards() {
  return st.cards.filter(function(c) { return st.selectedIds.indexOf(c.id) !== -1; });
}

// ============================================================
//  HIT TESTING
// ============================================================

// Check if a world-space point is inside any card (from front to back)
export function cardAtPoint(wx, wy) {
  // Iterate through cardsRef in reverse (front-to-back in render order)
  for (var i = st.cardsRef.length - 1; i >= 0; i--) {
    var card = st.cardsRef[i];
    
    if (card.hidden) continue;

    // Card dimensions — text/rect use their own width/height
    var w, h;
    if (card.kind === 'text' || card.kind === 'rect') {
      w = card.width || 160; h = card.height || 100;
    } else {
      w = 110; h = 154;
    }
    
    // Card position and transforms
    var cx = card.x, cy = card.y;
    var scale = card.scale || 1;
    var rot = (card.rot || 0) * Math.PI / 180;
    
    // Translate point to card-local space
    var dx = wx - cx;
    var dy = wy - cy;
    
    // Unrotate
    var localX = dx * Math.cos(-rot) - dy * Math.sin(-rot);
    var localY = dx * Math.sin(-rot) + dy * Math.cos(-rot);
    
    // Unscale
    localX /= scale;
    localY /= scale;
    
    // Check if point is within card bounds
    if (localX >= -w/2 && localX <= w/2 && localY >= -h/2 && localY <= h/2) {
      return card;
    }
  }
  
  return null;
}

// Check which resize handle (if any) is at a given point
export function resizeHandleAtPoint(obj, wx, wy) {
  if (!obj || obj.kind !== 'text' && obj.kind !== 'rect') return null;
  
  var handleSize = 8;
  var objW = obj.width || 100;
  var objH = obj.height || 100;
  var rot = (obj.rot || 0) * Math.PI / 180;
  
  // Translate point to object-local space
  var dx = wx - obj.x;
  var dy = wy - obj.y;
  var localX = dx * Math.cos(-rot) - dy * Math.sin(-rot);
  var localY = dx * Math.sin(-rot) + dy * Math.cos(-rot);
  
  // Check corners and edges
  var corners = [
    { name: 'nw', x: -objW/2, y: -objH/2 },
    { name: 'ne', x: objW/2, y: -objH/2 },
    { name: 'sw', x: -objW/2, y: objH/2 },
    { name: 'se', x: objW/2, y: objH/2 },
    { name: 'n', x: 0, y: -objH/2 },
    { name: 's', x: 0, y: objH/2 },
    { name: 'w', x: -objW/2, y: 0 },
    { name: 'e', x: objW/2, y: 0 }
  ];
  
  for (var i = 0; i < corners.length; i++) {
    var c = corners[i];
    var dist = Math.sqrt((localX - c.x) * (localX - c.x) + (localY - c.y) * (localY - c.y));
    if (dist <= handleSize) return c.name;
  }
  
  return null;
}

// ============================================================
//  SCENES  (saveScene, applyScene, etc.)
// ============================================================


// ── Snapshot helpers ─────────────────────────────────────────────────────

// Deep-clone any plain object
export function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// Capture a single card's effect state

export function _sceneBgImageSrc() {
  try {
    if (st.images && st.images['__bg__'] && st.images['__bg__'].src) return st.images['__bg__'].src;
  } catch (_) {}
  return null;
}
export function _applySceneBgImage(src) {
  var row = document.getElementById('bg-opacity-row');
  var btn = document.getElementById('btn-remove-bg');
  if (src) {
    var img = new Image();
    img.src = src;
    st.images['__bg__'] = img;
    st.bgImage = true;
    if (row) row.style.display = 'flex';
    if (btn) btn.style.display = 'inline-block';
  } else {
    delete st.images['__bg__'];
    st.bgImage = null;
    if (row) row.style.display = 'none';
    if (btn) btn.style.display = 'none';
  }
}


export function _sceneCardState(card) {
  var out = { id: card.id };
  Object.keys(card).forEach(function(k) {
    // Skip transient/runtime fields; keep only stable visual state
    if (k === 'id') return;
    if (k.charAt(0) === '_') return;
    var v = card[k];
    if (typeof v === 'function' || v === undefined) return;
    try { out[k] = deepClone(v); } catch (_) {}
  });
  return out;
}

export function _applySceneCardState(live, state) {
  // Remove existing stable fields first so stale settings do not survive scene switches
  Object.keys(live).forEach(function(k) {
    if (k === 'id') return;
    if (k.charAt(0) === '_') return;
    delete live[k];
  });
  Object.keys(state).forEach(function(k) {
    if (k === 'id') return;
    live[k] = deepClone(state[k]);
  });

  // Ensure minimum defaults for expected render fields
  if (live.backImg == null) live.backImg = '__default_back__';
  if (live.scale == null) live.scale = 1;
  if (live.rot == null) live.rot = 0;
  if (live.hidden == null) live.hidden = false;
  if (live.locked == null) live.locked = false;
}

export function snapshotCardEffects(card) {
  return _sceneCardState(card);
}

// Capture a human-readable tag summary of what's active
export function sceneTagSummary(snap) {
  var tags = [];
  if (snap.bg.color && snap.bg.color !== '#0A0A0F') tags.push('bg');
  if (snap.bg.fxType) tags.push(snap.bg.fxType);
  if (snap.bg.texture) tags.push(snap.bg.texture);
  var fx = ['glare','shadow','glow','spell','shimmer','luster','grain','ripple','holo'];
  var cardFxOn = {};
  snap.cardEffects.forEach(function(ce) {
    fx.forEach(function(f) { if (ce[f] && ce[f].on) cardFxOn[f] = true; });
  });
  Object.keys(cardFxOn).forEach(function(f) { tags.push(f); });
  return tags.slice(0, 4).join(' · ') || 'empty scene';
}

// ── Save current state to a slot ────────────────────────────────────────
export function saveScene(slot) {
  var existing = st.scenes[slot];
  var defaultName = 'Scene ' + slot;
  var name = existing ? existing.name : defaultName;

  var snap = {
    name: name,
    bg: {
      color:          st.bgColor,
      imageSrc:       _sceneBgImageSrc(),
      imageOpacity:   st.bgOpacity,
      texture:        st.bgTexture,
      textureOpacity: st.bgTextureOpacity,
      fxType:         st.bgFx.type,
      fx:             deepClone(st.bgFx),
      fxStack:        deepClone(st.bgFxStack || []),
      selectedType:   st.bgFxSelectedType || st.bgFx.type || null
    },
    globalLight: deepClone(st.globalLight || {}),
    // Full card list (order preserved)
    cards: st.cards.map(snapshotCardEffects),
    // Camera
    camera: {
      zoom:   st.camZoom,
      offset: deepClone(st.camOffset),
      orbit:  deepClone(st.camOrbit)
    },
    // Legacy field kept for compat
    cardEffects: st.cards.map(snapshotCardEffects)
  };
  st.scenes[slot] = snap;
  renderSceneSlots();
  showToast('✦ Scene ' + slot + ' saved — "' + name + '"');
}

// ── Apply a scene snapshot to current state ──────────────────────────────
export function applyScene(slot) {
  var snap = st.scenes[slot];
  if (!snap) return;

  // ── Background ──
  if (snap.bg) {
    st.bgColor = (snap.bg.color != null ? snap.bg.color : st.bgColor);
    st.bgTexture = (snap.bg.texture !== undefined ? snap.bg.texture : st.bgTexture);
    st.bgTextureOpacity = (snap.bg.textureOpacity != null ? snap.bg.textureOpacity : st.bgTextureOpacity);
    st.bgOpacity = (snap.bg.imageOpacity != null ? snap.bg.imageOpacity : st.bgOpacity);
    _applySceneBgImage(snap.bg.imageSrc || null);

    // Restore stack if present, otherwise single FX
    st.bgFxStack = deepClone(snap.bg.fxStack || []);
    st.bgFxSelectedType = snap.bg.selectedType || null;

    if (st.bgFxStack && st.bgFxStack.length) {
      var selectedLayer = null;
      if (st.bgFxSelectedType) {
        for (var bi=0; bi<st.bgFxStack.length; bi++) {
          if (st.bgFxStack[bi] && st.bgFxStack[bi].type === st.bgFxSelectedType) { selectedLayer = st.bgFxStack[bi]; break; }
        }
      }
      if (!selectedLayer) selectedLayer = st.bgFxStack[0];
      st.bgFx = deepClone((selectedLayer && selectedLayer.params) ? selectedLayer.params : (snap.bg.fx || st.bgFx));
      if (selectedLayer && selectedLayer.params && selectedLayer.params.type) st.bgFx.type = selectedLayer.params.type;
    } else {
      var fxSnap = snap.bg.fx || {};
      Object.keys(fxSnap).forEach(function(k) { st.bgFx[k] = fxSnap[k]; });
      if (snap.bg.fxType !== undefined) st.bgFx.type = snap.bg.fxType;
      st.bgFxSelectedType = st.bgFx.type || null;
    }

    if (typeof _resetBgFxRuntime === 'function') _resetBgFxRuntime();
  }

  // ── Global light ──
  if (snap.globalLight) {
    Object.keys(snap.globalLight).forEach(function(k){ st.globalLight[k] = snap.globalLight[k]; });
  }

  // ── Card patch restore (does NOT replace card list; timelines remain independent) ──
  var cardData = snap.cards || snap.cardEffects || null;
  if (cardData && cardData.length > 0) {
    // Reorder live st.cards to match the scene snapshot, preserving any st.cards not in the snapshot at the end
    var orderMap = {};
    for (var oi = 0; oi < cardData.length; oi++) orderMap[cardData[oi].id] = oi;
    st.cards.sort(function(a, b) {
      var ai = (orderMap[a.id] != null) ? orderMap[a.id] : 999999;
      var bi = (orderMap[b.id] != null) ? orderMap[b.id] : 999999;
      return ai - bi;
    });

    cardData.forEach(function(ce) {
      var live = st.cards.find(function(c) { return c.id === ce.id; });
      if (!live) return;

      // Restore the full stable card state so the exact visual FX/settings come back
      _applySceneCardState(live, ce);

      // Clear effect runtime caches so visual state truly resets to the saved settings
      if (typeof clearParticlePool === 'function') clearParticlePool(live.id);
    });
  }

  // ── Camera ──
  if (snap.camera) {
    st.camZoom = snap.camera.zoom || 1;
    if (snap.camera.offset) { st.camOffset.x = snap.camera.offset.x; st.camOffset.y = snap.camera.offset.y; }
    if (snap.camera.orbit)  { st.camOrbit.yaw = snap.camera.orbit.yaw; st.camOrbit.pitch = snap.camera.orbit.pitch; }
    st.camZoomRef = st.camZoom;
    st.camOffsetRef.x = st.camOffset.x; st.camOffsetRef.y = st.camOffset.y;
    st.camOrbitRef.yaw = st.camOrbit.yaw; st.camOrbitRef.pitch = st.camOrbit.pitch;
  }

  // UI refresh
  var bgOp = document.getElementById('bg-opacity-slider');
  var bgOpVal = document.getElementById('bg-opacity-val');
  if (bgOp) bgOp.value = st.bgOpacity;
  if (bgOpVal) bgOpVal.textContent = Math.round(st.bgOpacity * 100) + '%';

  if (typeof syncBgFxUI === 'function') syncBgFxUI();
  if (typeof syncLightingUI === 'function') syncLightingUI();
  if (typeof renderLayers === 'function') renderLayers();
  if (typeof updateInspector === 'function') updateInspector();

  // ── Playback reset ──
  setPlayState(false);
  st.playhead = 0;
  updateScrubber();
  resetAnimOffsets();
  if (typeof applyAnimations === 'function') applyAnimations(0);

  showToast('↺ Applied "' + snap.name + '"');
}


// ── Rename a scene inline ─────────────────────────────────────────────────
export function renameScene(slot) {
  var snap = st.scenes[slot];
  if (!snap) return;
  var el = document.querySelector('#scene-slot-' + slot + ' .scene-slot-name');
  if (!el) return;
  var oldName = snap.name;
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.value = oldName;
  inp.style.cssText = 'width:100%;background:var(--panel2);border:1px solid var(--gold);'
    + 'color:var(--text);font-size:9px;font-family:var(--font-body);padding:1px 3px;'
    + 'border-radius:3px;outline:none;text-align:center;';
  inp.addEventListener('click', function(e) { e.stopPropagation(); });
  inp.addEventListener('keydown', function(e) {
    e.stopPropagation();
    if (e.key === 'Enter')  inp.blur();
    if (e.key === 'Escape') { snap.name = oldName; renderSceneSlots(); }
  });
  inp.addEventListener('blur', function() {
    snap.name = inp.value.trim() || oldName;
    renderSceneSlots();
  });
  el.replaceWith(inp);
  inp.focus(); inp.select();
}

// ── Render the 5 scene slot chips ────────────────────────────────────────
export function renderSceneSlots() {
  for (var s = 1; s <= 5; s++) {
    var slot = document.getElementById('scene-slot-' + s);
    if (!slot) continue;
    slot.innerHTML = '';
    var snap = st.scenes[s];

    if (!snap) {
      // Empty slot
      slot.className = 'scene-slot';
      slot.title = 'Click to save current scene to slot ' + s;

      var numDiv = document.createElement('div');
      numDiv.className = 'scene-slot-num';
      numDiv.textContent = s;
      slot.appendChild(numDiv);

      var addIcon = document.createElement('div');
      addIcon.className = 'scene-slot-add-icon';
      addIcon.textContent = '+';
      slot.appendChild(addIcon);

      var emptyLbl = document.createElement('div');
      emptyLbl.className = 'scene-slot-empty-label';
      emptyLbl.textContent = 'Save scene';
      slot.appendChild(emptyLbl);

      (function(sn) {
        slot.onclick = function() { saveScene(sn); };
      })(s);

    } else {
      // Filled slot
      slot.className = 'scene-slot filled';
      slot.title = 'Click to apply "' + snap.name + '"';

      var numDiv2 = document.createElement('div');
      numDiv2.className = 'scene-slot-num';
      numDiv2.textContent = s;
      slot.appendChild(numDiv2);

      var nameDiv = document.createElement('div');
      nameDiv.className = 'scene-slot-name';
      nameDiv.textContent = snap.name;
      slot.appendChild(nameDiv);

      var tagsDiv = document.createElement('div');
      tagsDiv.className = 'scene-slot-tags';
      tagsDiv.textContent = sceneTagSummary(snap);
      slot.appendChild(tagsDiv);

      // Action buttons (shown on hover via CSS)
      var actions = document.createElement('div');
      actions.className = 'scene-slot-actions';

      (function(sn2) {
        var renBtn = document.createElement('button');
        renBtn.className = 'scene-slot-action-btn';
        renBtn.title = 'Rename';
        renBtn.textContent = '✎';
        renBtn.addEventListener('click', function(e) { e.stopPropagation(); renameScene(sn2); });
        actions.appendChild(renBtn);

        var overBtn = document.createElement('button');
        overBtn.className = 'scene-slot-action-btn';
        overBtn.title = 'Overwrite with current state';
        overBtn.textContent = '↺';
        overBtn.addEventListener('click', function(e) { e.stopPropagation(); overwriteScene(sn2); });
        actions.appendChild(overBtn);

        var delBtn = document.createElement('button');
        delBtn.className = 'scene-slot-action-btn del';
        delBtn.title = 'Delete scene';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', function(e) { e.stopPropagation(); deleteScene(sn2); });
        actions.appendChild(delBtn);
      })(s);

      slot.appendChild(actions);

      (function(sn) {
        slot.onclick = function(e) {
          if (e.target.closest('.scene-slot-actions')) return;
          applyScene(sn);
        };
      })(s);
    }
  }
}

// Need a closure-safe version of overwrite/delete since slot index used in event handlers
export function overwriteScene(slot) {
  var snap = st.scenes[slot];
  var oldName = snap ? snap.name : ('Scene ' + slot);
  saveScene(slot);
  st.scenes[slot].name = oldName; // preserve name
  renderSceneSlots();
  showToast('↺ Scene ' + slot + ' updated');
}
export function deleteScene(slot) {
  st.scenes[slot] = null;
  renderSceneSlots();
  showToast('Scene ' + slot + ' cleared');
}

// ── Re-render slots when timeline opens ──────────────────────────────────
(function() {
  var origToggle = document.getElementById('btn-timeline-toggle');
  if (origToggle) {
    origToggle.addEventListener('click', function() {
      // Small delay so the section is visible before we render
      setTimeout(renderSceneSlots, 50);
    });
  }
  // Also render on load (timeline might be open)
  setTimeout(renderSceneSlots, 200);
})();

// ============================================================
//  SELECT ALL
// ============================================================
document.getElementById('btn-select-all').addEventListener('click', function() {
  st.selectedIds = st.cards.filter(function(c) { return !c.locked; }).map(function(c) { return c.id; });
  syncRefs(); updateInspector(); renderLayers();
});

// Group selected layers
document.getElementById('btn-group-layers').addEventListener('click', function() {
  var sel = getSelectedCards();
  if (sel.length < 2) { showToast('Select 2 or more layers to group'); return; }
  var grp = { id: st.nextGroupId++, name: 'Group ' + (st.groups.length + 1), collapsed: false };
  st.groups.push(grp);
  sel.forEach(function(c) { c.groupId = grp.id; });
  renderLayers();
  showToast('Grouped ' + sel.length + ' layers into "' + grp.name + '"');
});

// ============================================================
//  EXPORT — DRAGGABLE FRAME PICKER
// ============================================================
// Frame stored in CSS pixels relative to the page (fixed-position overlay)
// st.exportFrame and st.efActive are managed in AppState (see export.js)
