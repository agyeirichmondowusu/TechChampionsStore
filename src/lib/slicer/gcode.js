// Writes G-code from sliced layers and builds the toolpath preview buffers in the same pass.
import { estimateTime } from './timing.js'

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

export function writeGcode(sliced, s, info = {}) {
  const { layers } = sliced
  const { printer, material, speeds } = s
  const filArea = Math.PI * (s.filamentDiameter / 2) ** 2
  const limits = { accel: printer.accel, jerk: printer.jerk }
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
    // Purge line along the left edge of the bed (not counted in the estimates, as in Cura).
    g('G1 X5 Y20 Z0.28 F5000')
    g('G1 X5 Y120 E10 F1500')
    g('G1 X5.4 Y120 F5000')
    g('G1 X5.4 Y20 E10 F1500')
    g(`G1 E-${s.retract.length} F${s.retract.speed * 60}`)
    g('G1 Z2 F3000')
    retracted = true
    x = 5.4
    y = 20
  }

  const fanOn = Math.round((material.fan / 100) * 255)
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li]
    const w = s.lineWidth
    const ePerMm = (w * L.h) / filArea
    // First layers print slowly, then speed ramps up over `slowdownLayers` (Cura's "Number of Slower Layers").
    const ramp = Math.min(1, li / Math.max(1, s.slowdownLayers))
    const speedOf = (type) => (type === 'skirt' && li === 0 ? speeds.skirt : speeds.first + (speeds[type] - speeds.first) * ramp)

    // Plan the layer as a list of moves first, so it can be timed and slowed down if it is too quick to cool.
    const moves = []
    let cx = x, cy = y
    let ret = retracted
    for (const p of L.paths) {
      const pts = p.pts
      const n = pts.length / 2
      const dist = Math.hypot(pts[0] - cx, pts[1] - cy)
      if (dist > 0.01) {
        if (dist > 1.5 && !ret) {
          moves.push({ kind: 'retract', dx: 0, dy: 0, de: -s.retract.length, v: s.retract.speed })
          ret = true
        }
        moves.push({ kind: 'travel', x: pts[0], y: pts[1], dx: pts[0] - cx, dy: pts[1] - cy, de: 0, v: li ? speeds.travel : Math.min(speeds.travel, speeds.first * 5) })
        cx = pts[0]
        cy = pts[1]
      }
      if (ret) {
        moves.push({ kind: 'prime', dx: 0, dy: 0, de: s.retract.length, v: s.retract.speed })
        ret = false
      }
      const v = speedOf(p.type)
      const tid = TYPE_IDS.indexOf(p.type)
      const visit = (nx, ny) => {
        const d = Math.hypot(nx - cx, ny - cy)
        if (d < 0.005) return
        moves.push({ kind: 'extrude', x: nx, y: ny, dx: nx - cx, dy: ny - cy, de: d * ePerMm, v, tid, type: p.type })
        cx = nx
        cy = ny
      }
      for (let k = 1; k < n; k++) visit(pts[k * 2], pts[k * 2 + 1])
      if (p.closed) visit(pts[0], pts[1])
    }

    let layerTime = estimateTime(moves, limits)
    if (layerTime < s.minLayerTime && layerTime > 0) {
      // Minimum layer time: stretch the extrusion moves (not below the minimum speed) so the layer can cool.
      const ex = moves.filter((m) => m.kind === 'extrude')
      const exTime = estimateTime(ex, limits)
      const k = exTime / (exTime + s.minLayerTime - layerTime)
      for (const m of ex) m.v = Math.max(Math.min(s.minSpeed, m.v), m.v * k)
      layerTime = estimateTime(moves, limits)
    }
    time += layerTime + Math.abs(L.z - z) / 10

    g(`;LAYER_CHANGE`)
    g(`;Z:${f3(L.z)}`)
    g(`;LAYER:${li}`)
    g(`M73 P${Math.round((li / layers.length) * 100)}`)
    if (li === 1 && fanOn) g(`M106 S${fanOn}`)
    g(`G1 Z${f3(L.z)} F${li ? 1200 : 600}`)
    z = L.z

    let curType = null
    let lastF = 0
    for (const m of moves) {
      if (m.kind === 'retract' || m.kind === 'prime') {
        g(`G1 E${m.kind === 'retract' ? '-' : ''}${s.retract.length} F${s.retract.speed * 60}`)
        retracted = m.kind === 'retract'
        lastF = 0
        continue
      }
      if (m.kind === 'travel') {
        g(`G0 X${f3(m.x)} Y${f3(m.y)} F${Math.round(m.v * 60)}`)
        trv.push(x, y, z, m.x, m.y, z)
        lastF = 0
      } else {
        if (curType !== m.type) {
          g(`;TYPE:${CURA_TYPE[m.type]}`)
          curType = m.type
        }
        const f = Math.round(m.v * 60)
        g(`G1 X${f3(m.x)} Y${f3(m.y)} E${f5(m.de)}${f !== lastF ? ` F${f}` : ''}`)
        lastF = f
        seg.push(x, y, z, m.x, m.y, z)
        segType.push(m.tid)
        filament += m.de
      }
      x = m.x
      y = m.y
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
