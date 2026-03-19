// ============================================================
//  ARCANA GLAM — Input Controls  (input-controls.js)
//  Mouse events, keyboard shortcuts, card drag, resize drag,
//  lighting UI.
// ============================================================

import { AppState as st } from './state.js';
import { screenToWorld } from './canvas-engine.js';
import { markDirty, showToast, syncRefs, haptic, updateCardCount, hideEmpty } from './app.js';
import { cardAtPoint, resizeHandleAtPoint, selectCard, deselectAll,
         getSelectedCards, duplicateSelected, renderLayers, getCardLabel } from './layers.js';
import { syncLightingUI } from './renderer.js';
import { calcTotalDuration, renderTimeline } from './timeline.js';
import { updateInspector } from './app.js';
import { clearParticlePool } from './fx-engine.js';
import { doUndo, doRedo } from './app.js';

export function initInputControls() {

// ============================================================
//  CANVAS MOUSE EVENTS
// ============================================================
st.canvas.addEventListener('mousedown', function(e) {
  var world = screenToWorld(e.clientX, e.clientY);

  // Check resize handles first (only when one text/rect is selected)
  var selObj = st.selectedRef.length === 1 ? st.cards.find(function(c) { return c.id === st.selectedRef[0]; }) : null;
  if (selObj && (selObj.kind === 'text' || selObj.kind === 'rect')) {
    var h = resizeHandleAtPoint(selObj, world.x, world.y);
    if (h) {
      st.resizeDragging = true;
      st.resizeHandle   = h;
      st.resizeObj      = selObj;
      st.resizeStartW   = selObj.width;
      st.resizeStartH   = selObj.height;
      st.resizeStartX   = selObj.x;
      st.resizeStartY   = selObj.y;
      st.resizeStartCX  = e.clientX;
      st.resizeStartCY  = e.clientY;
      e.preventDefault();
      return;
    }
  }

  var hit = cardAtPoint(world.x, world.y);
  if (hit) {
    var alreadySelected = st.selectedIds.indexOf(hit.id) >= 0;
    if (e.shiftKey) {
      selectCard(hit.id, true);
    } else if (!alreadySelected) {
      selectCard(hit.id, false);
    }
    startCardDrag(hit, e.clientX, e.clientY);
  } else {
    if (!e.shiftKey) deselectAll();
    if (st.orbitMode) {
      st.isOrbiting = true;
      st.orbitStartX = e.clientX; st.orbitStartY = e.clientY;
      st.orbitStartYaw = st.camOrbit.yaw; st.orbitStartPitch = st.camOrbit.pitch;
    } else {
      st.isPanning = true;
      st.panStartX = e.clientX; st.panStartY = e.clientY;
      st.panStartOff = { x: st.camOffset.x, y: st.camOffset.y };
    }
  }
  e.preventDefault();
});

st.canvas.addEventListener('mousemove', function(e) {
  var rect = st.canvas.getBoundingClientRect();
  st.mouseCanvasX = e.clientX - rect.left;
  st.mouseCanvasY = e.clientY - rect.top;
  var world = screenToWorld(e.clientX, e.clientY);

  // Cursor: check resize handles on selected text/rect
  var selObj2 = st.selectedRef.length === 1 ? st.cards.find(function(c) { return c.id === st.selectedRef[0]; }) : null;
  var hndl = selObj2 ? resizeHandleAtPoint(selObj2, world.x, world.y) : null;
  if (hndl) {
    var cursors = { nw:'nwse-resize', ne:'nesw-resize', se:'nwse-resize', sw:'nesw-resize', n:'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize' };
    st.canvas.style.cursor = cursors[hndl] || 'default';
  } else {
    var hit = cardAtPoint(world.x, world.y);
    st.hoverCardId = hit ? hit.id : null;
    st.canvas.style.cursor = hit ? 'pointer' : (st.orbitMode ? 'crosshair' : (st.isPanning ? 'grabbing' : 'grab'));
  }
});

st.canvas.addEventListener('mouseleave', function() {
  st.hoverCardId = null;
});

st.canvas.addEventListener('wheel', function(e) {
  if (st.orbitMode) return;
  var delta = e.deltaY > 0 ? 0.9 : 1.1;
  st.camZoom = Math.max(0.3, Math.min(3, st.camZoom * delta));
  st.camZoomRef = st.camZoom;
  e.preventDefault();
}, { passive: false });

window.addEventListener('mousemove', function(e) {
  if (st.resizeDragging && st.resizeObj) {
    var ddx = (e.clientX - st.resizeStartCX) / st.camZoomRef;
    var ddy = (e.clientY - st.resizeStartCY) / st.camZoomRef;
    // Rotate delta into object-local space
    var rot = (st.resizeObj.rot || 0) * Math.PI / 180;
    var ldx = ddx * Math.cos(rot) + ddy * Math.sin(rot);
    var ldy = -ddx * Math.sin(rot) + ddy * Math.cos(rot);
    var h = st.resizeHandle;
    var newW = st.resizeStartW, newH = st.resizeStartH;
    var newX = st.resizeStartX, newY = st.resizeStartY;
    var minDim = 20;

    if (h === 'e'  || h === 'ne' || h === 'se') newW = Math.max(minDim, st.resizeStartW + ldx * 2);
    if (h === 'w'  || h === 'nw' || h === 'sw') newW = Math.max(minDim, st.resizeStartW - ldx * 2);
    if (h === 's'  || h === 'se' || h === 'sw') newH = Math.max(minDim, st.resizeStartH + ldy * 2);
    if (h === 'n'  || h === 'ne' || h === 'nw') newH = Math.max(minDim, st.resizeStartH - ldy * 2);

    st.resizeObj.width  = newW;
    st.resizeObj.height = newH;
    st.resizeObj.x      = newX;
    st.resizeObj.y      = newY;
    markDirty(); updateInspector();
    return;
  }
  if (st.isPanning) {
    st.camOffset.x = st.panStartOff.x + (e.clientX - st.panStartX) / st.camZoomRef;
    st.camOffset.y = st.panStartOff.y + (e.clientY - st.panStartY) / st.camZoomRef;
    st.camOffsetRef.x = st.camOffset.x; st.camOffsetRef.y = st.camOffset.y;
  }
  if (st.isOrbiting) {
    var dx = e.clientX - st.orbitStartX, dy = e.clientY - st.orbitStartY;
    st.camOrbit.yaw = Math.max(-58, Math.min(58, st.orbitStartYaw + dx * 0.3));
    st.camOrbit.pitch = Math.max(-42, Math.min(42, st.orbitStartPitch + dy * 0.3));
    st.camOrbitRef.yaw = st.camOrbit.yaw; st.camOrbitRef.pitch = st.camOrbit.pitch;
    document.getElementById('orbit-badge').textContent = Math.round(st.camOrbit.yaw) + '° / ' + Math.round(st.camOrbit.pitch) + '°';
  }
  if (st.cardDragging) {
    var dx2 = (e.clientX - st.cardDragStartClientX) / st.camZoomRef;
    var dy2 = (e.clientY - st.cardDragStartClientY) / st.camZoomRef;
    st.cardDragGroup.forEach(function(entry) {
      entry.card.x = entry.startX + dx2;
      entry.card.y = entry.startY + dy2;
    });
  }
});

window.addEventListener('mouseup', function() {
  st.isPanning = false; st.isOrbiting = false; st.cardDragging = false; st.cardDragGroup = [];
  if (st.resizeDragging) { st.resizeDragging = false; st.resizeObj = null; markDirty(); }
});

} // end initInputControls

// Card dragging — st.cardDragging, st.cardDragStartClientX/Y, st.cardDragGroup are in AppState

export function startCardDrag(hitCard, clientX, clientY) {
  st.cardDragging = true;
  st.cardDragStartClientX = clientX;
  st.cardDragStartClientY = clientY;
  // If the hit card is part of the selection, drag all selected st.cards
  var dragIds = (st.selectedIds.indexOf(hitCard.id) >= 0) ? st.selectedIds : [hitCard.id];
  st.cardDragGroup = st.cards
    .filter(function(c) { return dragIds.indexOf(c.id) >= 0; })
    .map(function(c) { return { card: c, startX: c.x, startY: c.y }; });
}

//  KEYBOARD SHORTCUTS
// ============================================================
window.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Escape — deselect
  if (e.key === 'Escape') { deselectAll(); return; }

  // Space — play/pause
  if (e.key === ' ') { e.preventDefault(); document.getElementById('btn-play').click(); return; }

  // Ctrl / Cmd combos
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+Z — undo
    if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
    // Ctrl+Shift+Z / Ctrl+Y — redo
    if ((e.key === 'z' || e.key === 'Z') && e.shiftKey)  { e.preventDefault(); doRedo(); return; }
    if (e.key === 'y' || e.key === 'Y')                   { e.preventDefault(); doRedo(); return; }
    // Ctrl+D — duplicate
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    // Ctrl+A — select all unlocked
    if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      st.selectedIds = st.cards.filter(function(c) { return !c.locked; }).map(function(c) { return c.id; });
      syncRefs(); updateInspector(); renderLayers();
      return;
    }
    // Ctrl+G — group selected
    if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      document.getElementById('btn-group-layers').click();
      return;
    }
    // Ctrl+1–9 — ASSIGN selected card/group to slot
    var numMatch = e.key.match(/^([1-9])$/);
    if (numMatch) {
      e.preventDefault();
      var slot = numMatch[1];
      if (st.selectedIds.length > 0) {
        // Check if all selected st.cards are in the same group
        var firstGroupId = st.cards.find(function(c) { return c.id === st.selectedIds[0]; });
        firstGroupId = firstGroupId && firstGroupId.groupId;
        var allSameGroup = firstGroupId && st.selectedIds.every(function(id) {
          var c = st.cards.find(function(c2) { return c2.id === id; });
          return c && c.groupId === firstGroupId;
        });
        // Also check if the selection covers the whole group
        var groupSize = firstGroupId ? st.cards.filter(function(c) { return c.groupId === firstGroupId; }).length : 0;
        var wholeGroup = allSameGroup && st.selectedIds.length === groupSize;

        if (wholeGroup) {
          // Assign slot to the group
          Object.keys(st.groupSlots).forEach(function(k) {
            if (st.groupSlots[k] === firstGroupId || k === slot) delete st.groupSlots[k];
          });
          st.groupSlots[slot] = firstGroupId;
          var grpObj = st.groups.find(function(g) { return g.id === firstGroupId; });
          renderLayers();
          showToast('✦ Slot ' + slot + ' → ' + (grpObj ? grpObj.name : 'Group'));
        } else {
          // Assign slot to last selected card
          var id = st.selectedIds[st.selectedIds.length - 1];
          Object.keys(st.layerSlots).forEach(function(k) {
            if (st.layerSlots[k] === id || k === slot) delete st.layerSlots[k];
          });
          st.layerSlots[slot] = id;
          renderLayers();
          var c = st.cards.find(function(c2) { return c2.id === id; });
          showToast('✦ Assigned slot ' + slot + ' → ' + getCardLabel(c, st.cards.indexOf(c)));
        }
      }
      return;
    }
  }

  // 1–9 bare (no modifier) — JUMP to assigned slot (card or group)
  var bareNum = e.key.match(/^([1-9])$/);
  if (bareNum && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    var slot2 = bareNum[1];
    // Check group slot first
    if (st.groupSlots[slot2] != null) {
      e.preventDefault();
      var tgId = st.groupSlots[slot2];
      var tgCards = st.cards.filter(function(c2) { return c2.groupId === tgId && !c2.locked && !c2.hidden; });
      if (tgCards.length > 0) {
        st.selectedIds = tgCards.map(function(c2) { return c2.id; });
        st.lastClickedLayerId = st.selectedIds[st.selectedIds.length - 1];
        st.lastClickedGroupId = tgId;
        syncRefs(); updateInspector(); renderLayers();
        var tgrp = st.groups.find(function(g) { return g.id === tgId; });
        showToast('→ Slot ' + slot2 + ': ' + (tgrp ? tgrp.name : 'Group'));
      }
      return;
    }
    if (st.layerSlots[slot2] != null) {
      e.preventDefault();
      var tc = st.cards.find(function(c2) { return c2.id === st.layerSlots[slot2]; });
      if (tc && !tc.locked && !tc.hidden) {
        st.selectedIds = [tc.id];
        st.lastClickedLayerId = tc.id;
        syncRefs(); updateInspector(); renderLayers();
        showToast('→ Slot ' + slot2 + ': ' + getCardLabel(tc, st.cards.indexOf(tc)));
      }
    }
    return;
  }

  // Delete / Backspace — delete selected (non-locked)
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (st.selectedIds.length > 0) {
      var toDelete = st.selectedIds.filter(function(id) {
        var c = st.cards.find(function(c2) { return c2.id === id; });
        return c && !c.locked;
      });
      toDelete.forEach(function(id) {
        Object.keys(st.layerSlots).forEach(function(k) { if (st.layerSlots[k] === id) delete st.layerSlots[k]; });
        delete st.sequences[id];
        clearParticlePool(id);
      });
      st.cards = st.cards.filter(function(c) { return toDelete.indexOf(c.id) < 0; });
      st.selectedIds = st.selectedIds.filter(function(id) { return toDelete.indexOf(id) < 0; });
      syncRefs(); updateCardCount(); hideEmpty(); updateInspector(); renderLayers();
      calcTotalDuration(); renderTimeline();

      calcTotalDuration(); renderTimeline();
    }
  }
});


// ============================================================
//  LIGHTING UI
// ============================================================
(function(){
  var tog = document.getElementById('toggle-lighting');
  var sli = document.getElementById('sl-light-intensity');
  var slr = document.getElementById('sl-light-radius');
  var pick = document.getElementById('pick-light-color');
  var pad = document.getElementById('light-pad');

  if (tog) tog.addEventListener('click', function(){
    st.globalLight.on = !st.globalLight.on;
    syncLightingUI();
    markDirty();
  });
  if (sli) sli.addEventListener('input', function(){
    st.globalLight.intensity = Math.max(0, Math.min(1, parseFloat(sli.value) || 0));
    markDirty();
  });
  if (slr) slr.addEventListener('input', function(){
    st.globalLight.radius = Math.max(0.1, Math.min(1.2, parseFloat(slr.value) || 0.55));
    markDirty();
  });
  if (pick) pick.addEventListener('input', function(){
    st.globalLight.color = pick.value || '#ffffff';
    markDirty();
  });
  document.querySelectorAll('.light-mode-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      st.globalLight.mode = btn.dataset.lightMode || 'glow';
      syncLightingUI();
      markDirty();
    });
  });

  var dragging = false;
  function setPadPos(ev){
    if (!pad) return;
    var r = pad.getBoundingClientRect();
    st.globalLight.x = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width)));
    st.globalLight.y = Math.max(0, Math.min(1, (ev.clientY - r.top) / Math.max(1, r.height)));
    syncLightingUI();
    markDirty();
  }

  if (pad) {
    pad.addEventListener('mousedown', function(ev){ dragging = true; setPadPos(ev); });
    window.addEventListener('mousemove', function(ev){ if (dragging) setPadPos(ev); });
    window.addEventListener('mouseup', function(){ dragging = false; });
  }
})();


// Bootstrap initialization runs in app.js — not duplicated here.
