// Builds a complete, correctly wired breadboard circuit for an example: parts plugged into a
// breadboard next to the board, current-limiting resistors, and wires to the right pins and rails.
import { BB, CIRCUIT_PARTS, newCircuitId, rotatePoint } from './circuitParts'

const SIGNAL_COLORS = ['#f97316', '#eab308', '#2563eb', '#16a34a', '#9333ea', '#0891b2', '#db2777']
const ROWS = 'abcdefghij'

// Find the rotation and origin that put a part's legs on the given world points.
function placeByLegs(type, legs, props = {}) {
  const def = CIRCUIT_PARTS[type]
  const ids = Object.keys(legs)
  const term = (id) => def.terminals.find((t) => t.id === id)
  const a = term(ids[0])
  const [wx, wy] = legs[ids[0]]
  const fits = (r) => ids.slice(1).every((id) => {
    const t = term(id)
    const [dx, dy] = rotatePoint(t.x - a.x, t.y - a.y, r)
    return Math.abs(dx - (legs[id][0] - wx)) < 0.05 && Math.abs(dy - (legs[id][1] - wy)) < 0.05
  })
  const rot = [0, 90, 180, 270].find(fits) ?? 0
  const [ox, oy] = rotatePoint(a.x, a.y, rot)
  return { id: newCircuitId('p'), type, x: wx - ox, y: wy - oy, rot, props: { ...(def.props || {}), ...props } }
}

export function autoCircuit(board, exampleParts, top) {
  const parts = []
  const wires = []
  const pinAt = (id) => top.pins[id]

  // Put the breadboard on the side of the board where most of the used pins are.
  const used = exampleParts.flatMap((p) => Object.values(p.pins)).filter(Boolean).map(pinAt).filter(Boolean)
  const avgY = used.length ? used.reduce((s, p) => s + p[1], 0) / used.length : top.height
  const above = avgY < top.height / 2
  const bbX = Math.round((top.width / 2 - BB.width / 2) / 2.54) * 2.54
  const bbY = above ? -(BB.height + 24) : top.height + 24
  const bb = { id: newCircuitId('bb'), type: 'breadboard', x: bbX, y: bbY, rot: 0, props: {} }
  parts.push(bb)

  // Layouts are written with the board-side rail at the top; mirror them when the board is below.
  const mirrorRow = (r) => (above ? 9 - r : r)
  const near = above ? { minus: 'bn', plus: 'bp' } : { minus: 'tn', plus: 'tp' }
  const far = above ? { minus: 'tn', plus: 'tp' } : { minus: 'bn', plus: 'bp' }
  const holePos = (row, col) => [bbX + BB.colX(col), bbY + BB.rowY(mirrorRow(ROWS.indexOf(row)))]
  const holeRef = (row, col) => `${bb.id}:${ROWS[mirrorRow(ROWS.indexOf(row))]}${col + 1}`
  const usedRail = new Set()
  const railRef = (rail, col) => {
    let best = 0
    let bestD = Infinity
    for (let k = 0; k < 25; k++) {
      const d = Math.abs(BB.railX(k) - BB.colX(col)) + (usedRail.has(`${rail}${k}`) ? 100 : 0)
      if (d < bestD) { bestD = d; best = k }
    }
    usedRail.add(`${rail}${best}`)
    return { ref: `${bb.id}:${rail}${best + 1}`, x: bbX + BB.railX(best), y: bbY + BB.rails[rail] }
  }

  let channel = 0
  const boardEdge = above ? 0 : top.height
  const bbEdge = above ? bbY + BB.height : bbY
  const wire = (from, to, color, points = []) => wires.push({ id: newCircuitId('w'), from, to, color, points })
  // A wire from a board pin to the breadboard, routed through the gap between them.
  const boardWire = (pinId, row, col, color) => {
    const p = pinAt(pinId)
    if (!p) return
    const [hx, hy] = holePos(row, col)
    const lane = (boardEdge + bbEdge) / 2 + (above ? -1 : 1) * ((channel++ % 7) - 3) * 1.6
    wire(`board:${pinId}`, holeRef(row, col), color, [[p[0], lane], [hx, lane]])
    void hy
  }
  const railWire = (row, col, rail, color) => {
    const r = railRef(rail, col)
    wire(holeRef(row, col), r.ref, color)
  }

  // Power: GND to both minus rails; the supply to both plus rails, if anything needs it.
  const nearestBoardPin = (re) => Object.keys(top.pins)
    .filter((id) => re.test(id.replace(/#\d+$/, '')))
    .sort((a, b) => Math.abs(top.pins[a][1] - (above ? 0 : top.height)) - Math.abs(top.pins[b][1] - (above ? 0 : top.height)))[0]
  const gndPin = nearestBoardPin(/^GND$|^GND\d$/)
  const supplyPin = nearestBoardPin(board.vref < 4 ? /^3V3$/ : /^5V$/)
  const needsPlus = exampleParts.some((p) => ['pot', 'ldr', 'temp', 'servo', 'switch'].includes(p.type))
  const powerWire = (pinId, rail, color) => {
    const p = pinAt(pinId)
    if (!p) return
    const r = railRef(rail, 0)
    const lane = (boardEdge + bbEdge) / 2 + (above ? 1 : -1) * 5
    wire(`board:${pinId}`, r.ref, color, [[p[0], lane], [bbX - 3, lane], [bbX - 3, r.y]])
  }
  if (gndPin) {
    powerWire(gndPin, near.minus, '#111827')
    wire(railRef(near.minus, 0).ref, railRef(far.minus, 0).ref, '#111827', [[bbX - 1.5, bbY + BB.rails[near.minus]], [bbX - 1.5, bbY + BB.rails[far.minus]]].map(([x, y]) => [x, y]))
  }
  if (needsPlus && supplyPin) {
    powerWire(supplyPin, near.plus, '#dc2626')
    const n = railRef(near.plus, 29)
    const f = railRef(far.plus, 29)
    wire(n.ref, f.ref, '#dc2626', [[bbX + BB.width + 1.5, n.y], [bbX + BB.width + 1.5, f.y]])
  }

  let col = 1
  let color = 0
  const nextColor = () => SIGNAL_COLORS[color++ % SIGNAL_COLORS.length]
  for (const ex of exampleParts) {
    const P = ex.pins
    const c = col
    switch (ex.type) {
      case 'led': {
        boardWire(P.pin, 'a', c, nextColor())
        parts.push(placeByLegs('resistor', { 1: holePos('d', c), 2: holePos('f', c) }, { ohms: 220 }))
        parts.push(placeByLegs('led', { a: holePos('h', c), k: holePos('h', c + 1) }, ex.props))
        railWire('j', c + 1, far.minus, '#111827')
        col += 4
        break
      }
      case 'rgb': {
        const legCols = { r: c, g: c + 2, b: c + 3 }
        for (const ch of ['r', 'g', 'b']) {
          boardWire(P[ch], 'a', legCols[ch], { r: '#dc2626', g: '#16a34a', b: '#2563eb' }[ch])
          parts.push(placeByLegs('resistor', { 1: holePos('d', legCols[ch]), 2: holePos('f', legCols[ch]) }, { ohms: 220 }))
        }
        parts.push(placeByLegs('rgb', { r: holePos('h', c), k: holePos('h', c + 1), g: holePos('h', c + 2), b: holePos('h', c + 3) }))
        railWire('j', c + 1, far.minus, '#111827')
        col += 6
        break
      }
      case 'button':
      case 'switch': {
        if (ex.type === 'button') {
          // The button is symmetric, so name its legs by where they land.
          const [upper, lower] = ['e', 'f'].sort((r1, r2) => holePos(r1, c)[1] - holePos(r2, c)[1])
          parts.push(placeByLegs('button', { '1a': holePos(upper, c), '1b': holePos(upper, c + 3), '2a': holePos(lower, c), '2b': holePos(lower, c + 3) }))
          boardWire(P.pin, 'a', c, nextColor())
          railWire('j', c, far.minus, '#111827')
          col += 6
        } else {
          parts.push(placeByLegs('switch', { a: holePos('e', c), c: holePos('e', c + 1), b: holePos('e', c + 2) }))
          railWire('a', c, near.plus, '#dc2626')
          boardWire(P.pin, 'b', c + 1, nextColor())
          railWire('a', c + 2, near.minus, '#111827')
          col += 4
        }
        break
      }
      case 'pot':
      case 'temp': {
        const legs = ex.type === 'pot' ? ['1', 'w', '3'] : ['vs', 'out', 'gnd']
        parts.push(placeByLegs(ex.type, { [legs[0]]: holePos('e', c), [legs[1]]: holePos('e', c + 1), [legs[2]]: holePos('e', c + 2) }, ex.props))
        railWire('a', c, near.plus, '#dc2626')
        boardWire(P.pin, 'b', c + 1, nextColor())
        railWire('a', c + 2, near.minus, '#111827')
        col += 4
        break
      }
      case 'ldr': {
        parts.push(placeByLegs('ldr', { 1: holePos('e', c), 2: holePos('e', c + 2) }, ex.props))
        parts.push(placeByLegs('resistor', { 1: holePos('c', c + 2), 2: holePos('c', c + 6) }, { ohms: 10000 }))
        railWire('a', c, near.plus, '#dc2626')
        boardWire(P.pin, 'b', c + 2, nextColor())
        railWire('a', c + 6, near.minus, '#111827')
        col += 8
        break
      }
      case 'buzzer': {
        parts.push(placeByLegs('buzzer', { p: holePos('e', c), n: holePos('e', c + 3) }))
        boardWire(P.pin, 'a', c, nextColor())
        railWire('b', c + 3, near.minus, '#111827')
        col += 5
        break
      }
      case 'servo': {
        // The servo sits beside the breadboard; its connector is wired to the rails and the pin.
        const sx = bbX + BB.width + 10
        const sy = above ? bbY + 6 : bbY + 6
        const servo = { id: newCircuitId('p'), type: 'servo', x: sx, y: sy, rot: 0, props: {} }
        parts.push(servo)
        const gnd = railRef(near.minus, 29)
        const vcc = railRef(near.plus, 28)
        wire(gnd.ref, `${servo.id}:gnd`, '#78350f', [[gnd.x, sy - 4], [sx, sy - 4]])
        wire(vcc.ref, `${servo.id}:vcc`, '#dc2626', [[vcc.x, sy - 6], [sx + 2.54, sy - 6]])
        const p = pinAt(P.pin)
        if (p) {
          const lane = (boardEdge + bbEdge) / 2 + (above ? -1 : 1) * 4.5
          wire(`board:${P.pin}`, `${servo.id}:sig`, '#f97316', [[p[0], lane], [sx + 5.08 + 4, lane], [sx + 5.08 + 4, sy - 8], [sx + 5.08, sy - 8]])
        }
        break
      }
      default:
    }
  }
  return { parts, wires }
}
