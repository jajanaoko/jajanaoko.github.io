// ============================================================
//  ARCANA GLAM — Border Presets  (border-presets.js)
//  Preset definitions for the Custom Card Builder.
// ============================================================

export var BORDER_PRESETS = [
  {
    id: 'neutral_plain',
    name: 'Plain',
    category: 'Neutral',
    baseStyle: {
      outerStrokeColor: '#888888',
      innerStrokeColor: '#555555',
      accentColor: '#aaaaaa',
      thickness: 1,
      inset: 3,
      glow: 0
    },
    editableFields: ['outerStrokeColor', 'innerStrokeColor', 'thickness'],
    lockedFields: []
  },
  {
    id: 'arcane_gold',
    name: 'Arcane',
    category: 'Arcane',
    baseStyle: {
      outerStrokeColor: '#c9a84c',
      innerStrokeColor: '#8a6a2a',
      accentColor: '#f0d080',
      thickness: 2,
      inset: 3,
      glow: 14
    },
    editableFields: ['outerStrokeColor', 'innerStrokeColor', 'glow'],
    lockedFields: []
  },
  {
    id: 'fire_ember',
    name: 'Fire',
    category: 'Fire',
    baseStyle: {
      outerStrokeColor: '#e05515',
      innerStrokeColor: '#8a2000',
      accentColor: '#ff8040',
      thickness: 2,
      inset: 3,
      glow: 12
    },
    editableFields: ['outerStrokeColor', 'innerStrokeColor', 'glow'],
    lockedFields: []
  },
  {
    id: 'nature_forest',
    name: 'Nature',
    category: 'Nature',
    baseStyle: {
      outerStrokeColor: '#4a9a4a',
      innerStrokeColor: '#2a5a2a',
      accentColor: '#80d080',
      thickness: 2,
      inset: 3,
      glow: 8
    },
    editableFields: ['outerStrokeColor', 'innerStrokeColor', 'glow'],
    lockedFields: []
  },
  {
    id: 'shadow_void',
    name: 'Shadow',
    category: 'Shadow',
    baseStyle: {
      outerStrokeColor: '#6040a0',
      innerStrokeColor: '#2a1050',
      accentColor: '#9060d0',
      thickness: 2,
      inset: 3,
      glow: 10
    },
    editableFields: ['outerStrokeColor', 'innerStrokeColor', 'glow'],
    lockedFields: []
  },
  {
    id: 'lunar_silver',
    name: 'Lunar',
    category: 'Lunar',
    baseStyle: {
      outerStrokeColor: '#9090d0',
      innerStrokeColor: '#4060a0',
      accentColor: '#c0c0ff',
      thickness: 2,
      inset: 3,
      glow: 14
    },
    editableFields: ['outerStrokeColor', 'innerStrokeColor', 'glow'],
    lockedFields: []
  },
  {
    id: 'divine_radiant',
    name: 'Divine',
    category: 'Divine',
    baseStyle: {
      outerStrokeColor: '#f8f0a0',
      innerStrokeColor: '#d0a840',
      accentColor: '#ffffff',
      thickness: 2,
      inset: 3,
      glow: 18
    },
    editableFields: ['outerStrokeColor', 'innerStrokeColor', 'glow'],
    lockedFields: []
  },
  {
    id: 'corrupted_rift',
    name: 'Corrupted',
    category: 'Corrupted',
    baseStyle: {
      outerStrokeColor: '#8020a0',
      innerStrokeColor: '#2a0030',
      accentColor: '#c040ff',
      thickness: 2,
      inset: 3,
      glow: 16
    },
    editableFields: ['outerStrokeColor', 'innerStrokeColor', 'glow'],
    lockedFields: []
  }
];

export function resolveBorder(card) {
  var preset = BORDER_PRESETS.find(function(p) {
    return p.id === (card.border && card.border.presetId);
  });
  if (!preset) preset = BORDER_PRESETS[1]; // default arcane_gold
  return Object.assign({}, preset.baseStyle, (card.border && card.border.overrides) || {});
}
