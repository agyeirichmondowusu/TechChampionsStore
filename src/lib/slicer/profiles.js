// Printer, material and quality presets for the in-browser slicer.

export const PRINTERS = [
  {
    id: 'ender3v3se', name: 'Creality Ender-3 V3 SE', bed: [220, 220, 250], flavor: 'marlin', accel: 2500,
    speeds: { outer: 60, inner: 100, infill: 120, solid: 80, top: 60, support: 100, skirt: 60, travel: 200, first: 30 },
    retract: { length: 0.8, speed: 40 }, // direct drive
  },
  {
    id: 'k1c', name: 'Creality K1C', bed: [220, 220, 250], flavor: 'klipper', accel: 8000,
    speeds: { outer: 150, inner: 250, infill: 270, solid: 200, top: 150, support: 200, skirt: 120, travel: 400, first: 50 },
    retract: { length: 0.8, speed: 40 },
  },
  {
    id: 'ender3', name: 'Creality Ender-3 / Pro / V2', bed: [220, 220, 250], flavor: 'marlin', accel: 500,
    speeds: { outer: 40, inner: 60, infill: 70, solid: 50, top: 40, support: 60, skirt: 40, travel: 150, first: 20 },
    retract: { length: 5, speed: 45 }, // Bowden
  },
  {
    id: 'mk4', name: 'Prusa MK4', bed: [250, 210, 220], flavor: 'marlin', accel: 2500,
    speeds: { outer: 80, inner: 120, infill: 150, solid: 120, top: 80, support: 120, skirt: 60, travel: 200, first: 30 },
    retract: { length: 0.7, speed: 35 },
  },
  {
    id: 'a1', name: 'Bambu Lab A1 (generic G-code)', bed: [256, 256, 256], flavor: 'marlin', accel: 10000,
    speeds: { outer: 200, inner: 300, infill: 270, solid: 250, top: 200, support: 150, skirt: 100, travel: 500, first: 50 },
    retract: { length: 0.8, speed: 30 },
  },
  {
    id: 'generic', name: 'Generic Marlin printer', bed: [200, 200, 200], flavor: 'marlin', accel: 1000,
    speeds: { outer: 40, inner: 60, infill: 70, solid: 50, top: 40, support: 60, skirt: 40, travel: 150, first: 20 },
    retract: { length: 2, speed: 40 },
  },
]

export const MATERIALS = [
  { id: 'pla', name: 'PLA', nozzle: 205, bed: 60, fan: 100, density: 1.24, slug: 'pla-filament-1-75mm-1kg-blue' },
  { id: 'petg', name: 'PETG', nozzle: 235, bed: 75, fan: 40, density: 1.27, slug: 'petg-filament-1-75mm-1kg-black' },
  { id: 'abs', name: 'ABS', nozzle: 245, bed: 100, fan: 0, density: 1.04 },
  { id: 'tpu', name: 'TPU (flexible)', nozzle: 225, bed: 50, fan: 60, density: 1.21, maxSpeed: 30 },
]

export const QUALITY = [
  { id: 'fine', name: 'Fine', layerHeight: 0.12 },
  { id: 'standard', name: 'Standard', layerHeight: 0.2 },
  { id: 'draft', name: 'Draft', layerHeight: 0.28 },
]

export const PATTERNS = [
  { id: 'grid', name: 'Grid' },
  { id: 'lines', name: 'Lines' },
  { id: 'triangles', name: 'Triangles' },
  { id: 'concentric', name: 'Concentric' },
]

export const DEFAULTS = {
  printer: 'ender3v3se',
  material: 'pla',
  nozzle: 0.4,
  layerHeight: 0.2,
  firstLayerHeight: 0.2,
  walls: 3,
  topLayers: 4,
  bottomLayers: 4,
  infillDensity: 0.15,
  infillPattern: 'grid',
  infillOverlap: 0.15,
  supports: 'none',
  supportAngle: 50,
  supportSpacing: 2,
  supportXYGap: 0.7,
  supportZGap: 1,
  adhesion: 'skirt',
  skirtLoops: 2,
  skirtDistance: 4,
  brimWidth: 6,
  seam: 'rear',
  speedFactor: 1,
  nozzleTemp: null, // null = material default
  bedTemp: null,
  filamentDiameter: 1.75,
  retractLength: null, // null = printer default
}

/** Merges UI settings with the chosen printer and material into what the slicer and G-code writer need. */
export function resolveSettings(ui) {
  const printer = PRINTERS.find((p) => p.id === ui.printer) || PRINTERS[0]
  const material = MATERIALS.find((m) => m.id === ui.material) || MATERIALS[0]
  const k = ui.speedFactor || 1
  const speeds = Object.fromEntries(Object.entries(printer.speeds).map(([t, v]) => [t, t === 'travel' ? v : Math.min(v * k, material.maxSpeed || Infinity)]))
  return {
    ...ui,
    printer,
    material,
    speeds,
    lineWidth: +(ui.nozzle * 1.125).toFixed(3),
    firstLayerHeight: Math.max(ui.firstLayerHeight, ui.layerHeight * 0.5),
    nozzleTemp: ui.nozzleTemp ?? material.nozzle,
    bedTemp: ui.bedTemp ?? material.bed,
    retract: { length: ui.retractLength ?? printer.retract.length, speed: printer.retract.speed },
    bedCenter: [printer.bed[0] / 2, printer.bed[1] / 2],
  }
}
