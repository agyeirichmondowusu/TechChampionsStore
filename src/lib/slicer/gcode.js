// Writes G-code from sliced layers and builds the toolpath preview buffers in the same pass.
import { lineSpacing } from './slicer.js'

export const FEATURES = {
  outer: { label: 'Outer wall', color: [0.97, 0.36, 0.36] },
  inner: { label: 'Inner wall', color: [0.98, 0.78, 0.25] },
  top: { label: 'Top skin', color: [0.93, 0.33, 0.85] },
  solid: { label: 'Solid infill', color: [0.62, 0.38, 0.98] },
  infill: { label: 'Infill', color: [0.2, 0.83, 0.6] },
  support: { label: 'Support', color: [0.25, 0.75, 0.98] },
  skirt: { label: 'Skirt / brim', color: [0.6, 0.66, 0.76] },
  travel: { label: 'Travel', color: [0.55, 0.6, 0.7] },
}
const TYPE_IDS = Object.keys(FEATURES)
const CURA_TYPE = { outer: 'WALL-OUTER', inner: 'WALL-INNER', top: 'SKIN', solid: 'SKIN', infill: 'FILL', support: 'SUPPORT', skirt: 'SKIRT' }

const f3 = (n) => (Math.round(n * 1000) / 1000).toString()
const f5 = (n) => (Math.round(n * 100000) / 100000).toString()

/** Time for a straight move of length d at speed v with acceleration a (trapezoid / triangle profile). */
const moveTime = (d, v, a) => (d <= 0 ? 0 : d < (v * v) / a ? 2 * Math.sqrt(d / a) : d / v + v / a)

export function writeGcode(sliced, s, info = {}) {
  const { layers } = sliced
  const { printer, material, speeds } = s
  const filArea = Math.PI * (s.filamentDiameter / 2) ** 2
  const a = printer.accel
  const lines = []
  const g = (l) => lines.push(l)

  // Preview buffers: extrusion segments [x0,y0,z,x1,y1,z] with a type id per segment, plus travels.
  const seg = []
  const segType = []
  const trv = []
  const layerSeg = []
  const layerTrv = []

  let time = 0
  let filament = 0
  let x = s.bedCenter[0], y = s.bedCenter[1], z = 0
  let retracted = false

  if (printer.flavor === 'klipper') {
    g(`START_PRINT EXTRUDER_TEMP=${s.nozzleTemp} BED_TEMP=${s.bedTemp}`)
    g('M83 ; relative extrusion')
    g('G90')
  } else {
    g(`M140 S${s.bedTemp}`)
    g(`M104 S${s.nozzleTemp}`)
    g(`M190 S${s.bedTemp}`)
    g(`M109 S${s.nozzleTemp}`)
    g('G28 ; home all axes')
    g('G90')
    g('M83 ; relative extrusion')
    g('M107')
    g('G92 E0')
    g('G1 Z2 F3000')
    // Purge line along the left edge of the bed.
    g('G1 X5 Y20 Z0.28 F5000')
    g('G1 X5 Y120 E10 F1500')
    g('G1 X5.4 Y120 F5000')
    g('G1 X5.4 Y20 E10 F1500')
    g(`G1 E-${s.retract.length} F${s.retract.speed * 60}`)
    g('G1 Z2 F3000')
    filament += 20
    retracted = true
    x = 5.4
    y = 20
  }

  const fanOn = Math.round((material.fan / 100) * 255)
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li]
    const w = s.lineWidth
    const ePerMm = (L.h * lineSpacing(w, L.h)) / filArea
    g(`;LAYER_CHANGE`)
    g(`;Z:${f3(L.z)}`)
    g(`;LAYER:${li}`)
    g(`M73 P${Math.round((li / layers.length) * 100)}`)
    if (li === 1 && fanOn) g(`M106 S${fanOn}`)
    g(`G1 Z${f3(L.z)} F${li ? 1200 : 600}`)
    time += Math.abs(L.z - z) / 10
    z = L.z

    let curType = null
    for (const p of L.paths) {
      const pts = p.pts
      const n = pts.length / 2
      // Travel to the start of the path, retracting when the hop is long enough to ooze.
      const dx = pts[0] - x, dy = pts[1] - y
      const dist = Math.hypot(dx, dy)
      if (dist > 0.01) {
        if (dist > 1.5 && !retracted) {
          g(`G1 E-${s.retract.length} F${s.retract.speed * 60}`)
          time += s.retract.length / s.retract.speed
          retracted = true
        }
        g(`G0 X${f3(pts[0])} Y${f3(pts[1])} F${speeds.travel * 60}`)
        trv.push(x, y, z, pts[0], pts[1], z)
        time += moveTime(dist, speeds.travel, a)
        x = pts[0]
        y = pts[1]
      }
      if (retracted) {
        g(`G1 E${s.retract.length} F${s.retract.speed * 60}`)
        time += s.retract.length / s.retract.speed
        retracted = false
      }
      if (curType !== p.type) {
        g(`;TYPE:${CURA_TYPE[p.type]}`)
        curType = p.type
      }
      const v = li === 0 ? Math.min(speeds.first, speeds[p.type]) : speeds[p.type]
      let first = true
      const tid = TYPE_IDS.indexOf(p.type)
      const visit = (nx, ny) => {
        const d = Math.hypot(nx - x, ny - y)
        if (d < 0.005) return
        const e = d * ePerMm
        g(`G1 X${f3(nx)} Y${f3(ny)} E${f5(e)}${first ? ` F${Math.round(v * 60)}` : ''}`)
        first = false
        seg.push(x, y, z, nx, ny, z)
        segType.push(tid)
        filament += e
        time += moveTime(d, v, a)
        x = nx
        y = ny
      }
      for (let k = 1; k < n; k++) visit(pts[k * 2], pts[k * 2 + 1])
      if (p.closed) visit(pts[0], pts[1])
    }
    layerSeg.push(segType.length)
    layerTrv.push(trv.length / 6)
  }

  g(`G1 E-${s.retract.length} F${s.retract.speed * 60}`)
  if (printer.flavor === 'klipper') g('END_PRINT')
  else {
    const top = Math.min(z + 10, printer.bed[2])
    g(`G1 Z${f3(top)} F600`)
    g(`G1 X0 Y${printer.bed[1]} F3000 ; present the print`)
    g('M107')
    g('M104 S0')
    g('M140 S0')
    g('M84')
  }
  g('M73 P100')

  time += 120 // heating, homing and purge
  const grams = (filament * filArea * material.density) / 1000
  const stats = {
    time,
    filamentMm: filament,
    grams,
    layers: layers.length,
    height: layers.length ? layers[layers.length - 1].z : 0,
  }
  const header = [
    ';FLAVOR:' + (printer.flavor === 'klipper' ? 'Klipper' : 'Marlin'),
    `;TIME:${Math.round(time)}`,
    `;Filament used: ${f3(filament / 1000)}m`,
    `;Layer height: ${s.layerHeight}`,
    `;LAYER_COUNT:${layers.length}`,
    `;Generated with TechChampionStore Slicer`,
    `;Model: ${info.name || 'model.stl'}`,
    `;Printer: ${printer.name} | Material: ${material.name} | Nozzle ${s.nozzle} mm`,
    `;Walls: ${s.walls} | Top/Bottom: ${s.topLayers}/${s.bottomLayers} | Infill: ${Math.round(s.infillDensity * 100)}% ${s.infillPattern} | Supports: ${s.supports}`,
    `;Estimated print time: ${formatTime(time)} | Filament: ${grams.toFixed(1)} g`,
    '',
  ]

  return {
    gcode: header.join('\n') + lines.join('\n') + '\n',
    stats,
    preview: {
      seg: new Float32Array(seg),
      segType: new Uint8Array(segType),
      trv: new Float32Array(trv),
      layerSeg: new Uint32Array(layerSeg),
      layerTrv: new Uint32Array(layerTrv),
      layerZ: new Float32Array(layers.map((l) => l.z)),
      types: TYPE_IDS,
    },
  }
}

export function formatTime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}
