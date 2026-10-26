// Printer, material and quality presets for the in-browser slicer.

// Speeds follow Cura's printer definitions (speed_print, speed_layer_0, travel, machine_acceleration, jerk),
// so the same settings give the same estimates as Ultimaker Cura. See speedsFor() for how per-feature speeds derive.
export const PRINTERS = [
  {
    id: 'ender3', name: 'Creality Ender-3 / Pro / V2', bed: [220, 220, 250], flavor: 'marlin',
    print: 50, first: 20, travel: 150, accel: 500, jerk: 10, innerWall: 0.5,
    retract: { length: 6.5, speed: 25 },
  },
  {
    id: 'ender3v3se', name: 'Creality Ender-3 V3 SE', bed: [220, 220, 250], flavor: 'marlin',
    print: 180, first: 30, travel: 250, accel: 500, jerk: 10, innerWall: 0.5,
    retract: { length: 0.8, speed: 40 },
  },
  {
    id: 'k1c', name: 'Creality K1C', bed: [220, 220, 250], flavor: 'klipper',
    print: 250, first: 50, travel: 400, accel: 8000, jerk: 10, innerWall: 1,
    retract: { length: 0.8, speed: 40 },
  },
  {
    id: 'mk4', name: 'Prusa MK4', bed: [250, 210, 220], flavor: 'marlin',
    print: 120, first: 30, travel: 200, accel: 2500, jerk: 8, innerWall: 1,
    retract: { length: 0.7, speed: 35 },
  },
  {
    id: 'a1', name: 'Bambu Lab A1 (generic G-code)', bed: [256, 256, 256], flavor: 'marlin',
    print: 250, first: 50, travel: 500, accel: 10000, jerk: 9, innerWall: 1,
    retract: { length: 0.8, speed: 30 },
  },
  {
    id: 'generic', name: 'Generic Marlin printer (Cura Custom FFF)', bed: [200, 200, 200], flavor: 'marlin',
    print: 60, first: 30, travel: 120, accel: 4000, jerk: 20, innerWall: 1,
    retract: { length: 6.5, speed: 25 },
  },
]

/**
 * Per-feature speeds the way Cura derives them from "Print Speed": infill at print speed, outer wall,
 * top/bottom skin and supports at half, inner walls at half on Creality profiles (full on Cura's generic one).
 */
export function speedsFor(printer, print, first) {
  const half = print / 2
  return { infill: print, outer: half, inner: print * printer.innerWall, top: half, solid: half, support: half, skirt: first, first, travel: printer.travel }
}

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
  { id: 'cubic', name: 'Cubic' },
]

// Defaults mirror Cura's Creality "Standard Quality" profile with Generic PLA and a 0.4 mm nozzle.
export const DEFAULTS = {
  printer: 'ender3',
  material: 'pla',
  nozzle: 0.4,
  layerHeight: 0.2,
  firstLayerHeight: 0.2,
  walls: 2,
  topLayers: 4,
  bottomLayers: 4,
  infillDensity: 0.2,
  infillPattern: 'cubic',
  infillOverlap: 0.3, // fraction of the line width, Cura's infill_overlap on Creality printers
  skinOverlap: 0.1, // Cura's skin_overlap on Creality printers
  supports: 'none',
  supportAngle: 50,
  supportSpacing: 2,
  supportXYGap: 0.8,
  supportZGap: 1,
  adhesion: 'skirt',
  skirtLoops: 3,
  skirtDistance: 10,
  brimWidth: 8,
  seam: 'rear',
  printSpeed: null, // mm/s; null = the printer's Cura default
  firstLayerSpeed: null,
  minLayerTime: 10, // s; small layers are slowed down so they can cool, as in Cura
  minSpeed: 10,
  slowdownLayers: 2, // layers over which speed ramps up from the first-layer speed
  nozzleTemp: null, // null = material default
  bedTemp: null,
  filamentDiameter: 1.75,
  retractLength: null, // null = printer default
}

/** Merges UI settings with the chosen printer and material into what the slicer and G-code writer need. */
export function resolveSettings(ui) {
  const printer = PRINTERS.find((p) => p.id === ui.printer) || PRINTERS[0]
  const material = MATERIALS.find((m) => m.id === ui.material) || MATERIALS[0]
  const cap = material.maxSpeed || Infinity
  const print = Math.min(ui.printSpeed || printer.print, cap)
  const first = Math.min(ui.firstLayerSpeed || printer.first, cap)
  return {
    ...ui,
    printer,
    material,
    speeds: speedsFor(printer, print, first),
    lineWidth: ui.nozzle,
    firstLayerHeight: Math.max(ui.firstLayerHeight, ui.layerHeight * 0.5),
    nozzleTemp: ui.nozzleTemp ?? material.nozzle,
    bedTemp: ui.bedTemp ?? material.bed,
    retract: { length: ui.retractLength ?? printer.retract.length, speed: printer.retract.speed },
    bedCenter: [printer.bed[0] / 2, printer.bed[1] / 2],
  }
}
