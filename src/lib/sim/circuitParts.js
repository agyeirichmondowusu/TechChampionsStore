// Components you can place on the circuit workbench. Units are millimetres; legs sit on the 2.54 mm
// breadboard grid so parts plug straight into it. Each terminal is { id, x, y, label }.
export const P = 2.54

export const LED_COLORS = {
  red: { hex: '#ff3b3b', vf: 1.9 },
  orange: { hex: '#ff8a1f', vf: 2.0 },
  yellow: { hex: '#ffd23b', vf: 2.0 },
  green: { hex: '#22e35a', vf: 2.2 },
  blue: { hex: '#3b82ff', vf: 2.9 },
  white: { hex: '#f8fafc', vf: 2.9 },
}

export const RESISTOR_VALUES = [100, 220, 330, 470, 1000, 2200, 4700, 10000, 22000, 47000, 100000]

export const formatOhms = (r) => (r >= 1e6 ? `${+(r / 1e6).toFixed(2)} MΩ` : r >= 1000 ? `${+(r / 1000).toFixed(2)} kΩ` : `${r} Ω`)

// ---------- breadboard (30 columns, a–j, two power rails each side) ----------
export const BB = {
  cols: 30,
  width: 83.82,
  height: 50.8,
  colX: (c) => 5.08 + c * P,
  rowY: (r) => 11.43 + (r < 5 ? r : r + 2) * P, // rows a–e, a 3-pitch gap, then f–j
  railX: (k) => 5.08 + (k + Math.floor(k / 5)) * P, // 25 holes per rail in groups of five
  rails: { tn: 3.81, tp: 6.35, bp: 44.45, bn: 46.99 }, // top minus/plus, bottom plus/minus
}
const ROWS = 'abcdefghij'

function breadboardTerminals() {
  const t = []
  for (let c = 0; c < BB.cols; c++) {
    for (let r = 0; r < 10; r++) t.push({ id: `${ROWS[r]}${c + 1}`, x: BB.colX(c), y: BB.rowY(r), label: `${ROWS[r]}${c + 1}` })
  }
  for (const [rail, y] of Object.entries(BB.rails)) {
    for (let k = 0; k < 25; k++) t.push({ id: `${rail}${k + 1}`, x: BB.railX(k), y, label: rail.endsWith('p') ? '+ rail' : '− rail' })
  }
  return t
}

// Which breadboard holes are joined inside the board: each half-column of five, and each rail.
export function breadboardStrip(holeId) {
  const m = holeId.match(/^([a-j])(\d+)$/)
  if (m) return `${ROWS.indexOf(m[1]) < 5 ? 'top' : 'bot'}${m[2]}`
  return holeId.replace(/\d+$/, '')
}

export const bbHole = (row, col) => `${row}${col + 1}` // col is 0-based
export const bbRail = (rail, k) => `${rail}${k + 1}`

export const CIRCUIT_PARTS = {
  breadboard: {
    name: 'Breadboard', group: 'Build',
    blurb: 'Half-size breadboard. Each column of five holes is joined, and the rails run the full length.',
    terminals: breadboardTerminals(),
    box: [0, 0, BB.width, BB.height],
    layer: 0,
  },
  resistor: {
    name: 'Resistor', group: 'Build', blurb: 'Limits current. Every LED needs one.',
    terminals: [{ id: '1', x: 0, y: 0, label: 'Leg 1' }, { id: '2', x: 4 * P, y: 0, label: 'Leg 2' }],
    box: [-0.6, -1.3, 4 * P + 0.6, 1.3],
    props: { ohms: 220 },
  },
  led: {
    name: 'LED', group: 'Outputs', blurb: 'Lights when current flows from the anode (+, long leg) to the cathode.',
    terminals: [{ id: 'a', x: 0, y: 0, label: 'Anode (+)' }, { id: 'k', x: P, y: 0, label: 'Cathode (−)' }],
    box: [-1.6, -7.5, P + 1.6, 0.6],
    props: { color: 'red' },
  },
  rgb: {
    name: 'RGB LED', group: 'Outputs', blurb: 'Common cathode: one resistor on each colour leg, the long leg to GND.',
    terminals: [{ id: 'r', x: 0, y: 0, label: 'Red' }, { id: 'k', x: P, y: 0, label: 'Common cathode (−)' }, { id: 'g', x: 2 * P, y: 0, label: 'Green' }, { id: 'b', x: 3 * P, y: 0, label: 'Blue' }],
    box: [-1, -8.5, 3 * P + 1, 0.6],
  },
  buzzer: {
    name: 'Piezo buzzer', group: 'Outputs', blurb: 'Plays the tone on its + leg. The − leg goes to GND.',
    terminals: [{ id: 'p', x: 0, y: 0, label: '+' }, { id: 'n', x: 3 * P, y: 0, label: '−' }],
    box: [1.5 * P - 6, -6, 1.5 * P + 6, 6],
  },
  servo: {
    name: 'Servo (SG90)', group: 'Outputs', blurb: 'Brown = GND, red = 5V, orange = signal (a PWM pin).',
    terminals: [{ id: 'gnd', x: 0, y: 0, label: 'GND (brown)' }, { id: 'vcc', x: P, y: 0, label: 'V+ (red)' }, { id: 'sig', x: 2 * P, y: 0, label: 'Signal (orange)' }],
    box: [-6, -1.5, 11, 30.5],
  },
  button: {
    name: 'Push button', group: 'Inputs', blurb: 'The two top legs are joined, as are the two bottom legs. Pressing joins top to bottom.',
    terminals: [{ id: '1a', x: 0, y: 0, label: 'Top left' }, { id: '1b', x: 3 * P, y: 0, label: 'Top right' }, { id: '2a', x: 0, y: 3 * P, label: 'Bottom left' }, { id: '2b', x: 3 * P, y: 3 * P, label: 'Bottom right' }],
    internal: [['1a', '1b'], ['2a', '2b']],
    box: [-0.8, -0.8, 3 * P + 0.8, 3 * P + 0.8],
    props: { pressed: false },
  },
  switch: {
    name: 'Slide switch', group: 'Inputs', blurb: 'The middle leg connects to the left leg when OFF and to the right leg when ON.',
    terminals: [{ id: 'a', x: 0, y: 0, label: 'Left (OFF side)' }, { id: 'c', x: P, y: 0, label: 'Common' }, { id: 'b', x: 2 * P, y: 0, label: 'Right (ON side)' }],
    box: [-2.5, -4.5, 2 * P + 2.5, 0.8],
    props: { on: false },
  },
  pot: {
    name: 'Potentiometer', group: 'Sensors', blurb: '10 kΩ knob. Outer legs to + and GND, the middle (wiper) to an analog pin.',
    terminals: [{ id: '1', x: 0, y: 0, label: 'Leg 1' }, { id: 'w', x: P, y: 0, label: 'Wiper' }, { id: '3', x: 2 * P, y: 0, label: 'Leg 3' }],
    box: [P - 5.5, -11, P + 5.5, 0.8],
    props: { value: 50, ohms: 10000 },
  },
  ldr: {
    name: 'Light sensor (LDR)', group: 'Sensors', blurb: 'Resistance falls in bright light. Use it with a 10 kΩ resistor as a voltage divider.',
    terminals: [{ id: '1', x: 0, y: 0, label: 'Leg 1' }, { id: '2', x: 2 * P, y: 0, label: 'Leg 2' }],
    box: [P - 2.8, -6, P + 2.8, 0.6],
    props: { value: 60 },
  },
  temp: {
    name: 'Temperature (TMP36)', group: 'Sensors', blurb: 'Flat side facing you: +Vs, Vout, GND. Vout = 0.5 V + 10 mV/°C.',
    terminals: [{ id: 'vs', x: 0, y: 0, label: '+Vs' }, { id: 'out', x: P, y: 0, label: 'Vout' }, { id: 'gnd', x: 2 * P, y: 0, label: 'GND' }],
    box: [-1.3, -5.5, 2 * P + 1.3, 0.6],
    props: { value: 25 },
  },
}

// LDR resistance for 0–100 % light: about 200 kΩ in the dark down to 1 kΩ in bright light.
export const ldrOhms = (pct) => 200000 ** (1 - pct / 100) * 1000 ** (pct / 100)

export function rotatePoint(x, y, rot) {
  switch (((rot % 360) + 360) % 360) {
    case 90: return [-y, x]
    case 180: return [-x, -y]
    case 270: return [y, -x]
    default: return [x, y]
  }
}

// World position of every terminal of a placed part.
export function partTerminals(part) {
  const def = CIRCUIT_PARTS[part.type]
  return def.terminals.map((t) => {
    const [x, y] = rotatePoint(t.x, t.y, part.rot || 0)
    return { ...t, x: part.x + x, y: part.y + y }
  })
}

let seq = 0
export const newCircuitId = (prefix = 'c') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`
