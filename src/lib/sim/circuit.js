// Electrical model of the workbench circuit. Wires, breadboard strips and part internals are merged
// into nets, then a DC nodal analysis gives every net's voltage. LEDs are diodes (forward voltage
// plus series resistance), so a missing resistor really does burn one out, a floating input really
// does read LOW, and a sensor without power reads 0 V.
import { CIRCUIT_PARTS, LED_COLORS, breadboardStrip, ldrOhms, partTerminals } from './circuitParts'
import { servoAngle } from './controller'

const PIN_R = 25 // output pin resistance, ohms
const PULL_R = 35000
const LED_R = 15
const BIG = 1e3 // a closed switch, in siemens
const LED_MAX = 0.05 // above 50 mA an LED burns out
const PIN_MAX = 0.04 // the ATmega's absolute maximum per pin

export function boardTerminalKind(board, id) {
  const base = id.replace(/#\d+$/, '')
  const pin = board.pins.find((p) => p.id === base && !p.hidden)
  if (pin) return { kind: 'gpio', pin }
  if (/^GND/.test(base)) return { kind: 'gnd' }
  if (/^(5V|VIN|VBUS|VSYS)$/.test(base)) return { kind: 'supply', volts: 5 }
  if (base === '3V3') return { kind: 'supply', volts: 3.3 }
  return { kind: 'nc' }
}

class UnionFind {
  constructor() { this.parent = new Map() }
  find(a) {
    if (!this.parent.has(a)) this.parent.set(a, a)
    let r = a
    while (this.parent.get(r) !== r) r = this.parent.get(r)
    while (this.parent.get(a) !== r) { const n = this.parent.get(a); this.parent.set(a, r); a = n }
    return r
  }
  union(a, b) { const ra = this.find(a); const rb = this.find(b); if (ra !== rb) this.parent.set(ra, rb) }
}

const key = (x, y) => `${Math.round(x * 4)},${Math.round(y * 4)}`

// Which net every terminal belongs to.
export function buildNets(circuit) {
  const uf = new UnionFind()
  const holes = new Map()
  for (const part of circuit.parts) {
    if (part.type !== 'breadboard') continue
    for (const t of partTerminals(part)) {
      const ref = `${part.id}:${t.id}`
      uf.union(ref, `${part.id}:strip:${breadboardStrip(t.id)}`)
      holes.set(key(t.x, t.y), ref)
    }
  }
  for (const part of circuit.parts) {
    if (part.type === 'breadboard') continue
    const def = CIRCUIT_PARTS[part.type]
    for (const t of partTerminals(part)) {
      const ref = `${part.id}:${t.id}`
      uf.find(ref)
      // A leg plugged into a breadboard hole joins that hole's strip.
      const kx = Math.round(t.x * 4)
      const ky = Math.round(t.y * 4)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const hole = holes.get(`${kx + dx},${ky + dy}`)
          if (hole) uf.union(ref, hole)
        }
      }
    }
    for (const group of def.internal || []) group.slice(1).forEach((id) => uf.union(`${part.id}:${group[0]}`, `${part.id}:${id}`))
  }
  for (const w of circuit.wires) uf.union(w.from, w.to)
  return uf
}

function solveLinear(G, I) {
  const n = I.length
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(G[r][c]) > Math.abs(G[p][c])) p = r
    if (Math.abs(G[p][c]) < 1e-15) continue
    if (p !== c) { [G[p], G[c]] = [G[c], G[p]]; [I[p], I[c]] = [I[c], I[p]] }
    for (let r = c + 1; r < n; r++) {
      const f = G[r][c] / G[c][c]
      if (!f) continue
      for (let k = c; k < n; k++) G[r][k] -= f * G[c][k]
      I[r] -= f * I[c]
    }
  }
  const v = new Float64Array(n)
  for (let r = n - 1; r >= 0; r--) {
    let s = I[r]
    for (let k = r + 1; k < n; k++) s -= G[r][k] * v[k]
    v[r] = Math.abs(G[r][r]) < 1e-15 ? 0 : s / G[r][r]
  }
  return v
}

const ledBrightness = (amps) => (amps < 0.0002 ? 0 : Math.min(1, Math.sqrt(amps / 0.012)))

/**
 * circuit: { parts, wires }; pins: live pin states from the simulation; running: board powered.
 * Returns { inputs: {pinNum: volts}, parts: {partId: state}, voltage(ref), wiredPins, issues, burned }.
 */
export function solveCircuit({ board, circuit, pins = {}, running, burned = new Set() }) {
  const uf = buildNets(circuit)
  const net = (ref) => uf.find(ref)
  const boardRefs = new Set()
  circuit.wires.forEach((w) => [w.from, w.to].forEach((r) => r.startsWith('board:') && boardRefs.add(r)))

  // ---------- nets that carry something electrical ----------
  const members = new Map() // net -> count of electrical terminals
  const bump = (ref) => { const n = net(ref); members.set(n, (members.get(n) || 0) + 1) }
  const groundNets = new Set()
  const supplies = []
  const gpio = [] // { ref, pin }
  for (const ref of boardRefs) {
    const k = boardTerminalKind(board, ref.slice(6))
    if (k.kind === 'nc') continue
    bump(ref)
    if (k.kind === 'gnd') groundNets.add(net(ref))
    else if (k.kind === 'supply') supplies.push({ ref, volts: k.volts })
    else gpio.push({ ref, pin: k.pin })
  }
  for (const part of circuit.parts) {
    if (part.type === 'breadboard') continue
    for (const t of CIRCUIT_PARTS[part.type].terminals) bump(`${part.id}:${t.id}`)
  }

  const index = new Map()
  for (const n of members.keys()) if (!groundNets.has(n)) index.set(n, index.size)
  const node = (ref) => { const n = net(ref); return groundNets.has(n) ? -1 : index.has(n) ? index.get(n) : -2 }
  const N = index.size
  const issues = []

  // ---------- elements ----------
  const conductances = [] // [a, b, g]
  const diodes = [] // { a, k, vf, part, ch }
  const sources = [] // { a, b, v, g, tag }
  const tmps = []
  for (const part of circuit.parts) {
    const t = (id) => node(`${part.id}:${id}`)
    const p = part.props || {}
    switch (part.type) {
      case 'resistor': conductances.push([t('1'), t('2'), 1 / Math.max(1, p.ohms || 220)]); break
      case 'led': if (!burned.has(part.id)) diodes.push({ a: t('a'), k: t('k'), vf: (LED_COLORS[p.color] || LED_COLORS.red).vf, part: part.id, ch: 'led' }); break
      case 'rgb':
        for (const [ch, vf] of [['r', 1.9], ['g', 2.8], ['b', 2.8]]) if (!burned.has(`${part.id}:${ch}`)) diodes.push({ a: t(ch), k: t('k'), vf, part: part.id, ch })
        break
      case 'buzzer': conductances.push([t('p'), t('n'), 1 / 1000]); break
      case 'servo': conductances.push([t('vcc'), t('gnd'), 1 / 500]); break
      case 'button': if (p.pressed) conductances.push([t('1a'), t('2a'), BIG]); break
      case 'switch': conductances.push([t('c'), t(p.on ? 'b' : 'a'), BIG]); break
      case 'pot': {
        const f = Math.min(1, Math.max(0, (p.value ?? 50) / 100))
        const R = p.ohms || 10000
        conductances.push([t('1'), t('w'), 1 / Math.max(1, R * (1 - f))], [t('w'), t('3'), 1 / Math.max(1, R * f)])
        break
      }
      case 'ldr': conductances.push([t('1'), t('2'), 1 / ldrOhms(p.value ?? 60)]); break
      case 'temp': tmps.push({ vs: t('vs'), out: t('out'), gnd: t('gnd'), v: 0.5 + 0.01 * (p.value ?? 25), part: part.id }); break
      default:
    }
  }

  if (running) {
    for (const s of supplies) {
      const a = node(s.ref)
      if (a === -1) { issues.push(`Short circuit: ${s.ref.slice(6).replace(/#\d+$/, '')} is wired straight to GND.`); continue }
      sources.push({ a, b: -1, v: s.volts, g: 100, tag: s.ref })
    }
  }

  // Output levels: PWM and tone pins are solved both fully on and averaged.
  const modulated = []
  const pinSource = (pin, level) => {
    const s = pins[pin.num]
    if (!s) return null
    if (s.m === 'out') return { v: level * board.vref, g: 1 / PIN_R }
    if (s.m === 'pullup') return { v: board.vref, g: 1 / PULL_R }
    if (s.m === 'pulldown') return { v: 0, g: 1 / PULL_R }
    return null
  }
  if (running) {
    for (const { pin } of gpio) {
      const s = pins[pin.num]
      if (s?.m === 'out' && ((s.d != null && s.d > 0 && s.d < 1) || s.f > 0)) modulated.push({ num: pin.num, duty: s.d ?? 0.5, f: s.f || 0, pf: s.pf || 0 })
    }
  }
  const baseLevel = (num, mode) => {
    const s = pins[num]
    if (!s) return 0
    const m = modulated.find((x) => x.num === num)
    if (m) return mode === 'avg' ? m.duty : mode === num ? 0 : 1
    return s.d != null ? (s.d > 0 ? 1 : 0) : s.v ? 1 : 0
  }

  const solve = (mode) => {
    const pinSrc = running ? gpio.map(({ ref, pin }) => ({ a: node(ref), pin, src: pinSource(pin, baseLevel(pin.num, mode)) })).filter((x) => x.src && x.a !== -2) : []
    const on = diodes.map(() => false)
    const tOn = tmps.map(() => false)
    let v = new Float64Array(N)
    const V = (i) => (i < 0 ? 0 : v[i])
    for (let iter = 0; iter < 30; iter++) {
      const G = Array.from({ length: N }, () => new Float64Array(N))
      const I = new Float64Array(N)
      const g2 = (a, b, g) => {
        if (a >= 0) G[a][a] += g
        if (b >= 0) G[b][b] += g
        if (a >= 0 && b >= 0) { G[a][b] -= g; G[b][a] -= g }
      }
      const src2 = (a, b, vv, g) => { g2(a, b, g); if (a >= 0) I[a] += g * vv; if (b >= 0) I[b] -= g * vv }
      for (let i = 0; i < N; i++) G[i][i] += 1e-9
      for (const [a, b, g] of conductances) if (a > -2 && b > -2) g2(a, b, g)
      for (const s of sources) src2(s.a, s.b, s.v, s.g)
      for (const p of pinSrc) src2(p.a, -1, p.src.v, p.src.g)
      diodes.forEach((d, i) => { if (on[i] && d.a > -2 && d.k > -2) src2(d.a, d.k, d.vf, 1 / LED_R) })
      tmps.forEach((t, i) => { if (tOn[i] && t.out > -2 && t.gnd > -2) src2(t.out, t.gnd, t.v, 1 / 50) })
      v = solveLinear(G, I)
      let changed = false
      diodes.forEach((d, i) => {
        if (d.a === -2 || d.k === -2) return
        const vd = V(d.a) - V(d.k)
        const next = on[i] ? (vd - d.vf) / LED_R > 0 : vd > d.vf
        if (next !== on[i]) { on[i] = next; changed = true }
      })
      tmps.forEach((t, i) => {
        if (t.vs === -2 || t.gnd === -2) return
        const next = V(t.vs) - V(t.gnd) >= 2.7
        if (next !== tOn[i]) { tOn[i] = next; changed = true }
      })
      if (!changed) break
    }
    const current = diodes.map((d, i) => (on[i] ? Math.max(0, (V(d.a) - V(d.k) - d.vf) / LED_R) : 0))
    const pinCurrent = pinSrc.map((p) => ({ num: p.pin.num, id: p.pin.id, amps: (p.src.v - V(p.a)) * p.src.g }))
    return { V, current, pinCurrent }
  }

  const full = solve('full')
  const avg = modulated.length ? solve('avg') : full
  const without = new Map(modulated.slice(0, 8).map((m) => [m.num, solve(m.num)]))

  // ---------- results ----------
  const partStates = {}
  const newlyBurned = []
  const dependsOn = (fn) => modulated.filter((m) => without.has(m.num) && fn(without.get(m.num)))
  diodes.forEach((d, i) => {
    const amps = full.current[i]
    const deps = dependsOn((w) => w.current[i] < amps * 0.5)
    const duty = deps.reduce((acc, m) => acc * m.duty, 1)
    const id = d.ch === 'led' ? d.part : `${d.part}:${d.ch}`
    if (amps > LED_MAX) { newlyBurned.push(id); issues.push(`An LED is burning out: ${Math.round(amps * 1000)} mA is far too much.`) }
    const st = (partStates[d.part] ||= {})
    st[d.ch === 'led' ? 'level' : d.ch] = ledBrightness(amps * duty)
    st[d.ch === 'led' ? 'mA' : `${d.ch}mA`] = amps * duty * 1000
  })
  if (burned.size) issues.push('An LED burned out from too much current. Add a resistor (220 Ω is typical), then press Run to replace it.')
  for (const id of burned) {
    const [pid, ch] = id.split(':')
    const st = (partStates[pid] ||= {})
    if (ch) st[`${ch}Burned`] = true
    else st.burned = true
  }
  for (const part of circuit.parts) {
    const t = (id) => node(`${part.id}:${id}`)
    const Vf = (id) => { const i = t(id); return i < 0 ? 0 : full.V(i) }
    if (part.type === 'buzzer') {
      const dv = Vf('p') - Vf('n')
      const deps = dependsOn((w) => Math.abs(dv - ((t('p') < 0 ? 0 : w.V(t('p'))) - (t('n') < 0 ? 0 : w.V(t('n'))))) > 1)
      const m = deps[0]
      partStates[part.id] = { freq: running && dv > 1.5 && m ? m.f || m.pf : 0 }
    } else if (part.type === 'servo') {
      const powered = running && Vf('vcc') - Vf('gnd') >= 3
      const sigNet = net(`${part.id}:sig`)
      const driver = gpio.find((g) => net(g.ref) === sigNet)
      partStates[part.id] = { powered, angle: powered && driver ? servoAngle(pins[driver.pin.num], board) : null, driven: Boolean(driver) }
    } else if (part.type === 'temp') {
      partStates[part.id] = { powered: running && Vf('vs') - Vf('gnd') >= 2.7 }
    }
  }
  for (const p of full.pinCurrent) {
    if (Math.abs(p.amps) > PIN_MAX) issues.push(`Pin ${p.id} is overloaded (${Math.round(Math.abs(p.amps) * 1000)} mA). Real pins are damaged above 40 mA.`)
  }

  // ---------- what the board's inputs read ----------
  // A net counts as driven when a conducting path reaches GND, a supply, an output pin or a powered
  // sensor. Undriven inputs are left to the board's own pull-up or pull-down, as on real hardware.
  const adj = new Map()
  const link = (a, b) => { if (a === -2 || b === -2) return; (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a) }
  conductances.forEach(([a, b, g]) => g > 1e-7 && link(a, b))
  const seeds = [-1, ...sources.map((s) => s.a)]
  if (running) gpio.forEach(({ ref, pin }) => pins[pin.num]?.m === 'out' && seeds.push(node(ref)))
  tmps.forEach((t) => partStates[t.part]?.powered && seeds.push(t.out))
  const driven = new Set(seeds)
  const queue = [...seeds]
  while (queue.length) for (const nb of adj.get(queue.pop()) || []) if (!driven.has(nb)) { driven.add(nb); queue.push(nb) }

  const inputs = {}
  const wiredPins = new Set()
  for (const { ref, pin } of gpio) {
    const n = net(ref)
    if ((members.get(n) || 0) < 2 && !groundNets.has(n)) continue
    wiredPins.add(pin.num)
    if (!driven.has(node(ref))) continue
    const i = node(ref)
    inputs[pin.num] = Math.max(0, Math.min(board.vref, i < 0 ? 0 : avg.V(i)))
  }

  const voltage = (ref) => {
    const n = net(ref)
    if (groundNets.has(n)) return 0
    if (!index.has(n)) return null
    return avg.V(index.get(n))
  }
  return { inputs, parts: partStates, voltage, net, wiredPins, issues: [...new Set(issues)], burned: newlyBurned }
}
