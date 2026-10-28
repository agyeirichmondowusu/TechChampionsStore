// Shared pin state inside the simulation worker.
// Each pin: m = mode ('in' | 'pullup' | 'pulldown' | 'out'), v = digital level, d = PWM duty (0..1) or null,
// pf = PWM frequency, f = tone frequency, a = servo angle set directly by a library (or null).

export class PinStore {
  constructor(board, post) {
    this.board = board
    this.post = post
    this.state = {}
    this.inputs = {} // num -> { pressed?: boolean, volts?: number }
    this.edgeListeners = new Set() // (num, level) => void
    this.dirty = true
    this.serialOut = ''
    this.serialIn = []
    this.flushTimer = setInterval(() => this.flush(), 16)
  }

  pin(num) {
    return (this.state[num] ||= { m: 'in', v: 0, d: null, pf: 0, f: 0, a: null })
  }

  set(num, patch) {
    const p = this.pin(num)
    for (const k in patch) {
      if (p[k] !== patch[k]) {
        p[k] = patch[k]
        this.dirty = true
      }
    }
  }

  // Level the code reads from a pin, given buttons and pull resistors.
  read(num) {
    const p = this.pin(num)
    if (p.m === 'out') return p.v
    const input = this.inputs[num]
    if (input?.pressed != null) return p.m === 'pullup' ? (input.pressed ? 0 : 1) : (input.pressed ? 1 : 0)
    if (input?.volts != null) return input.volts > this.board.vref / 2 ? 1 : 0
    return p.m === 'pullup' ? 1 : 0
  }

  volts(num) {
    const input = this.inputs[num]
    if (input?.volts != null) return input.volts
    return this.read(num) ? this.board.vref : 0
  }

  setInput(num, patch) {
    const before = this.read(num)
    this.inputs[num] = { ...this.inputs[num], ...patch }
    const after = this.read(num)
    if (before !== after) this.edgeListeners.forEach((fn) => fn(num, after))
  }

  // Pull mode changes can flip what a pin reads; tell listeners.
  setMode(num, m) {
    const before = this.read(num)
    this.set(num, { m })
    const after = this.read(num)
    if (before !== after) this.edgeListeners.forEach((fn) => fn(num, after))
  }

  serial(text) {
    this.serialOut += text
  }

  flush() {
    if (this.serialOut) {
      this.post({ type: 'serial', text: this.serialOut })
      this.serialOut = ''
    }
    if (this.dirty) {
      this.dirty = false
      this.post({ type: 'pins', pins: this.state })
    }
  }
}
