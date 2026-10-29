// MicroPython (machine, time) and Raspberry Pi Python (gpiozero, RPi.GPIO) for the script runner.
import { AsyncFunction, errorLine, makeClock } from './runtimeCommon'
import { transpilePython } from './transpilePython'

// Raspberry Pi 40-pin header: physical pin -> BCM GPIO
const BOARD_TO_BCM = { 3: 2, 5: 3, 7: 4, 8: 14, 10: 15, 11: 17, 12: 18, 13: 27, 15: 22, 16: 23, 18: 24, 19: 10, 21: 9, 22: 25, 23: 11, 24: 8, 26: 7, 27: 0, 28: 1, 29: 5, 31: 6, 32: 12, 33: 13, 35: 19, 36: 16, 37: 26, 38: 20, 40: 21 }
const NOTE_INDEX = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }

const kwargs = (args) => (args.length && args[args.length - 1]?.__kw ? args.pop() : {})

function pyStr(v, nested = false) {
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (v == null) return 'None'
  if (Array.isArray(v)) return `[${v.map((x) => pyStr(x, true)).join(', ')}]`
  if (typeof v === 'string') return nested ? `'${v}'` : v
  if (typeof v === 'object' && !(v instanceof Error) && v.constructor === Object) return `{${Object.entries(v).map(([k, x]) => `'${k}': ${pyStr(x, true)}`).join(', ')}}`
  if (typeof v === 'object' && v.__str__) return v.__str__()
  return String(v)
}

function fmt(v, spec = '') {
  if (!spec) return pyStr(v)
  const m = spec.match(/^([<>^])?([+ ])?(0)?(\d+)?(,)?(?:\.(\d+))?([fdxXbeso%])?$/)
  if (!m) return pyStr(v)
  const [, align, sign, zero, width, comma, prec, type] = m
  let s
  if (type === 'f' || (prec && !type)) s = Number(v).toFixed(prec ? Number(prec) : 6)
  else if (type === 'd') s = String(Math.trunc(Number(v)))
  else if (type === 'x') s = Math.trunc(v).toString(16)
  else if (type === 'X') s = Math.trunc(v).toString(16).toUpperCase()
  else if (type === 'b') s = Math.trunc(v).toString(2)
  else if (type === 'o') s = Math.trunc(v).toString(8)
  else if (type === 'e') s = Number(v).toExponential(prec ? Number(prec) : 6)
  else if (type === '%') s = (Number(v) * 100).toFixed(prec ? Number(prec) : 6) + '%'
  else s = pyStr(v)
  if (comma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (sign === '+' && Number(v) >= 0) s = '+' + s
  if (width) {
    const w = Number(width)
    if (zero) s = s.padStart(w, '0')
    else if (align === '<') s = s.padEnd(w)
    else if (align === '^') { const pad = Math.max(0, w - s.length); s = ' '.repeat(Math.floor(pad / 2)) + s + ' '.repeat(Math.ceil(pad / 2)) } else s = s.padStart(w)
  }
  return s
}

function installPythonMethods() {
  const def = (proto, name, fn) => Object.defineProperty(proto, name, { value: fn, configurable: true, writable: true })
  def(Array.prototype, 'append', function (x) { this.push(x) })
  def(Array.prototype, 'extend', function (xs) { this.push(...xs) })
  def(Array.prototype, 'insert', function (i, x) { this.splice(i, 0, x) })
  def(Array.prototype, 'remove', function (x) { const i = this.indexOf(x); if (i >= 0) this.splice(i, 1) })
  def(Array.prototype, 'index', function (x) { return this.indexOf(x) })
  def(Array.prototype, 'count', function (x) { return this.filter((y) => y === x).length })
  def(Array.prototype, 'copy', function () { return [...this] })
  def(Array.prototype, 'clear', function () { this.length = 0 })
  const origSplit = String.prototype.split
  const origReplace = String.prototype.replace
  def(String.prototype, 'split', function (sep, max) { return sep == null ? this.trim().split(/\s+/).filter(Boolean) : origSplit.call(this, sep, max) })
  def(String.prototype, 'replace', function (a, b) { return typeof a === 'string' && typeof b === 'string' ? origSplit.call(this, a).join(b) : origReplace.call(this, a, b) })
  def(String.prototype, 'upper', function () { return this.toUpperCase() })
  def(String.prototype, 'lower', function () { return this.toLowerCase() })
  def(String.prototype, 'strip', function () { return this.trim() })
  def(String.prototype, 'lstrip', function () { return this.trimStart() })
  def(String.prototype, 'rstrip', function () { return this.trimEnd() })
  def(String.prototype, 'startswith', function (s) { return this.startsWith(s) })
  def(String.prototype, 'endswith', function (s) { return this.endsWith(s) })
  def(String.prototype, 'find', function (s) { return this.indexOf(s) })
  def(String.prototype, 'isdigit', function () { return /^\d+$/.test(this) })
  def(String.prototype, 'join', function (xs) { return [...xs].map((x) => pyStr(x)).join(this) })
  def(String.prototype, 'format', function (...args) {
    const kw = kwargs(args)
    let auto = 0
    return origReplace.call(this, /\{([^{}:]*)(?::([^{}]*))?\}/g, (m, key, spec) => {
      const v = key === '' ? args[auto++] : /^\d+$/.test(key) ? args[Number(key)] : kw[key]
      return fmt(v, spec)
    })
  })
}

export function runPython(board, source, store, post) {
  const { code } = transpilePython(source)
  const clock = makeClock()
  installPythonMethods()
  const forever = () => new Promise(() => {})
  const listeners = [] // { pin, fn(level) }
  store.edgeListeners.add((num, level) => listeners.forEach((l) => l.pin === num && Promise.resolve(l.fn(level)).catch(report)))
  const watch = (pin, fn) => { const l = { pin, fn }; listeners.push(l); return () => listeners.splice(listeners.indexOf(l), 1) }

  const output = (pin, v) => store.set(pin, { m: 'out', v: v ? 1 : 0, d: null })
  const duty = (pin, d, pf) => store.set(pin, { m: 'out', d: d > 0 && d < 1 ? d : null, v: d >= 1 ? 1 : 0, pf })

  // ---------- builtins ----------
  const range = (a, b, step = 1) => {
    if (b === undefined) { b = a; a = 0 }
    const out = []
    if (step > 0) for (let i = a; i < b && out.length < 1e6; i += step) out.push(i)
    else for (let i = a; i > b && out.length < 1e6; i += step) out.push(i)
    return out
  }
  const iter = (x) => (Array.isArray(x) || typeof x === 'string' ? x : x && typeof x === 'object' ? Object.keys(x) : (() => { throw new TypeError(`'${typeof x}' object is not iterable`) })())
  const builtins = {
    print: (...args) => {
      const kw = kwargs(args)
      store.serial(args.map((a) => pyStr(a)).join(kw.sep ?? ' ') + (kw.end ?? '\n'))
    },
    range, len: (x) => (x?.length ?? Object.keys(x).length),
    int: (x, base) => (typeof x === 'string' ? parseInt(x, base || 10) : Math.trunc(Number(x))),
    float: (x) => parseFloat(x), str: (x) => pyStr(x), bool: (x) => Boolean(x) && !(Array.isArray(x) && !x.length),
    abs: Math.abs, round: (x, n) => (n ? Number(Number(x).toFixed(n)) : Math.round(x)),
    min: (...a) => (a.length === 1 ? Math.min(...a[0]) : Math.min(...a)), max: (...a) => (a.length === 1 ? Math.max(...a[0]) : Math.max(...a)),
    sum: (xs) => xs.reduce((s, x) => s + x, 0), list: (xs = []) => [...iter(xs)], tuple: (xs = []) => [...iter(xs)],
    sorted: (xs) => [...xs].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0)), reversed: (xs) => [...xs].reverse(),
    enumerate: (xs, start = 0) => [...iter(xs)].map((x, i) => [i + start, x]),
    zip: (...xs) => xs[0].map((_, i) => xs.map((x) => x[i])),
    any: (xs) => xs.some(Boolean), all: (xs) => xs.every(Boolean),
    hex: (n) => '0x' + n.toString(16), bin: (n) => '0b' + n.toString(2), chr: (n) => String.fromCharCode(n), ord: (c) => c.charCodeAt(0),
    isinstance: () => true, input: () => '', dict: (o = {}) => ({ ...o }), set: (xs = []) => [...new Set(xs)],
    __fmt: fmt, __iter: iter, __fdiv: (a, b) => Math.floor(a / b),
    __in: (a, b) => (Array.isArray(b) || typeof b === 'string' ? b.includes(a) : b != null && a in b),
    __y: clock.yieldNow,
    KeyboardInterrupt: Error, Exception: Error, OSError: Error, ValueError: Error,
  }

  // ---------- time ----------
  const time = {
    sleep: (s) => clock.sleep(s * 1000),
    sleep_ms: (ms) => clock.sleep(ms),
    sleep_us: (us) => clock.sleep(us / 1000),
    ticks_ms: clock.millis, ticks_us: clock.micros, ticks_diff: (a, b) => a - b, ticks_add: (a, b) => a + b,
    time: () => Date.now() / 1000, monotonic: () => performance.now() / 1000, perf_counter: () => performance.now() / 1000,
    localtime: () => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getDay(), 0] },
  }

  // ---------- machine (MicroPython) ----------
  const pinNumber = (id) => {
    if (id && typeof id === 'object' && 'id' in id) return id.id
    if (typeof id === 'string') {
      if (/^LED$/i.test(id) || /^WL_GPIO0$/i.test(id)) return board.builtinLed
      const m = id.match(/\d+/)
      return m ? Number(m[0]) : -1
    }
    return id
  }
  class Pin {
    static IN = 0
    static OUT = 1
    static OPEN_DRAIN = 2
    static PULL_UP = 1
    static PULL_DOWN = 2
    static IRQ_FALLING = 4
    static IRQ_RISING = 8
    constructor(id, ...args) {
      const kw = kwargs(args)
      this.id = pinNumber(id)
      this.init(args[0] ?? kw.mode ?? -1, args[1] ?? kw.pull ?? -1, kw.value)
    }
    init(mode = -1, pull = -1, value) {
      if (mode === Pin.OUT || mode === Pin.OPEN_DRAIN) output(this.id, value ?? store.pin(this.id).v)
      else if (mode === Pin.IN) store.setMode(this.id, pull === Pin.PULL_UP ? 'pullup' : pull === Pin.PULL_DOWN ? 'pulldown' : 'in')
    }
    value(v) { if (v === undefined) return store.read(this.id); output(this.id, v) }
    on() { output(this.id, 1) }
    off() { output(this.id, 0) }
    high() { output(this.id, 1) }
    low() { output(this.id, 0) }
    toggle() { output(this.id, !store.read(this.id)) }
    irq(...args) {
      const kw = kwargs(args)
      const handler = args[0] ?? kw.handler
      const trigger = args[1] ?? kw.trigger ?? (Pin.IRQ_FALLING | Pin.IRQ_RISING)
      this.unwatch?.()
      if (handler) this.unwatch = watch(this.id, (level) => { if ((level && trigger & Pin.IRQ_RISING) || (!level && trigger & Pin.IRQ_FALLING)) return handler(this) })
    }
    __str__() { return `Pin(GPIO${this.id})` }
  }
  class PWM {
    constructor(pin, ...args) {
      const kw = kwargs(args)
      this.id = pinNumber(pin)
      this.f = kw.freq ?? 1000
      this.d = 0
      if (kw.duty_u16 != null) this.duty_u16(kw.duty_u16)
      else if (kw.duty_ns != null) this.duty_ns(kw.duty_ns)
      else this.apply()
    }
    apply() { duty(this.id, this.d, this.f) }
    freq(f) { if (f === undefined) return this.f; this.f = f; this.apply() }
    duty_u16(v) { if (v === undefined) return Math.round(this.d * 65535); this.d = v / 65535; this.apply() }
    duty_ns(ns) { if (ns === undefined) return Math.round((this.d / this.f) * 1e9); this.d = (ns * this.f) / 1e9; this.apply() }
    duty(v) { if (v === undefined) return Math.round(this.d * 1023); this.d = v / 1023; this.apply() }
    deinit() { this.d = 0; store.set(this.id, { d: null, v: 0, pf: 0 }) }
  }
  class ADC {
    static ATTN_0DB = 0
    static ATTN_2_5DB = 1
    static ATTN_6DB = 2
    static ATTN_11DB = 3
    static WIDTH_12BIT = 3
    constructor(id) {
      let n = pinNumber(id)
      if (board.id === 'pico' && n >= 0 && n <= 4) n = n === 4 ? 'temp' : 26 + n
      this.id = n
    }
    volts() { return this.id === 'temp' ? 0.706 : store.volts(this.id) }
    read_u16() { return Math.min(65535, Math.max(0, Math.round((this.volts() / board.vref) * 65535))) }
    read() { return Math.min(4095, Math.round((this.volts() / board.vref) * 4095)) }
    read_uv() { return Math.round(this.volts() * 1e6) }
    atten() {}
    width() {}
  }
  class Timer {
    static ONE_SHOT = 0
    static PERIODIC = 1
    constructor(...args) { const kw = kwargs(args); if (kw.period || kw.freq) this.init(kw) }
    init(...args) {
      const kw = kwargs(args)
      this.deinit()
      const period = kw.period ?? (kw.freq ? 1000 / kw.freq : 1000)
      const run = () => Promise.resolve(kw.callback?.(this)).catch(report)
      this.handle = (kw.mode ?? Timer.PERIODIC) === Timer.PERIODIC ? setInterval(run, period) : setTimeout(run, period)
    }
    deinit() { clearInterval(this.handle); clearTimeout(this.handle) }
  }
  const machine = { Pin, PWM, ADC, Timer, reset() {}, soft_reset() {}, freq: () => (board.id === 'esp32' ? 240000000 : 125000000), unique_id: () => [0xe6, 0x61, 0x41, 0x04] }

  const network = {
    STA_IF: 0, AP_IF: 1,
    WLAN: class { constructor() { this.at = 0 } active() { return true } connect() { this.at = performance.now() + 1500 } isconnected() { return Boolean(this.at && performance.now() > this.at) } ifconfig() { return ['192.168.4.23', '255.255.255.0', '192.168.4.1', '8.8.8.8'] } status() { return this.isconnected() ? 3 : 1 } disconnect() { this.at = 0 } },
  }

  // ---------- gpiozero ----------
  const gpio = (p) => {
    if (typeof p === 'number') return p
    const s = String(p).toUpperCase()
    let m = s.match(/^(?:GPIO|BCM)(\d+)$/)
    if (m) return Number(m[1])
    m = s.match(/^(?:BOARD|J8:)(\d+)$/)
    if (m && BOARD_TO_BCM[m[1]] != null) return BOARD_TO_BCM[m[1]]
    if (/^\d+$/.test(s)) return Number(s)
    throw new Error(`Unknown pin ${p}`)
  }
  class Tone {
    constructor(value, ...args) {
      const kw = value?.__kw ? value : kwargs(args)
      if (kw.frequency) this.frequency = kw.frequency
      else if (kw.midi != null) this.frequency = 440 * 2 ** ((kw.midi - 69) / 12)
      else if (typeof value === 'string' || kw.note) {
        const m = (kw.note || value).match(/^([A-G])([#b♯♭]?)(-?\d)$/)
        if (!m) throw new Error(`Invalid note ${value}`)
        const semis = NOTE_INDEX[m[1]] + (m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0) + (Number(m[3]) - 4) * 12
        this.frequency = 440 * 2 ** (semis / 12)
      } else this.frequency = value < 128 && Number.isInteger(value) ? 440 * 2 ** ((value - 69) / 12) : value
    }
  }
  class Device {
    constructor(pin) { this.pin = gpio(pin); this.token = 0 }
    close() { this.token++ }
  }
  class LED extends Device {
    constructor(pin, ...args) {
      super(pin)
      const kw = kwargs(args)
      this.activeHigh = kw.active_high ?? true
      this.set(kw.initial_value ? 1 : 0)
    }
    set(v) { this._v = v; output(this.pin, this.activeHigh ? v : !v) }
    on = () => { this.token++; this.set(1) }
    off = () => { this.token++; this.set(0) }
    toggle = () => { this.token++; this.set(this._v ? 0 : 1) }
    get value() { return this._v }
    set value(v) { this.token++; this.set(v ? 1 : 0) }
    get is_lit() { return Boolean(this._v) }
    get is_active() { return Boolean(this._v) }
    blink = (...args) => {
      const kw = kwargs(args)
      const on = args[0] ?? kw.on_time ?? 1
      const off = args[1] ?? kw.off_time ?? 1
      const n = args[2] ?? kw.n ?? null
      const token = ++this.token
      const run = (async () => {
        for (let i = 0; n == null || i < n; i++) {
          if (token !== this.token) return
          this.set(1)
          await clock.sleep(on * 1000)
          if (token !== this.token) return
          this.set(0)
          await clock.sleep(off * 1000)
        }
      })()
      return (kw.background ?? args[3] ?? true) ? undefined : run
    }
  }
  class PWMLED extends Device {
    constructor(pin, ...args) {
      super(pin)
      const kw = kwargs(args)
      this.activeHigh = kw.active_high ?? true
      this.freq = kw.frequency ?? 100
      this.set(kw.initial_value ?? 0)
    }
    set(v) { this._v = Math.min(1, Math.max(0, v)); duty(this.pin, this.activeHigh ? this._v : 1 - this._v, this.freq) }
    on = () => { this.token++; this.set(1) }
    off = () => { this.token++; this.set(0) }
    toggle = () => { this.token++; this.set(1 - this._v) }
    get value() { return this._v }
    set value(v) { this.token++; this.set(v) }
    get is_lit() { return this._v > 0 }
    pulse = (...args) => {
      const kw = kwargs(args)
      return this.fade(args[0] ?? kw.fade_in_time ?? 1, args[1] ?? kw.fade_out_time ?? 1, 0, 0, args[2] ?? kw.n ?? null, kw.background ?? args[3] ?? true)
    }
    blink = (...args) => {
      const kw = kwargs(args)
      return this.fade(kw.fade_in_time ?? 0, kw.fade_out_time ?? 0, args[0] ?? kw.on_time ?? 1, args[1] ?? kw.off_time ?? 1, kw.n ?? null, kw.background ?? true)
    }
    fade(fadeIn, fadeOut, onTime, offTime, n, background) {
      const token = ++this.token
      const ramp = async (from, to, secs) => {
        const steps = Math.max(1, Math.round(secs * 50))
        for (let i = 1; i <= steps; i++) { if (token !== this.token) return false; this.set(from + ((to - from) * i) / steps); await clock.sleep((secs * 1000) / steps) }
        return true
      }
      const run = (async () => {
        for (let i = 0; n == null || i < n; i++) {
          if (fadeIn) { if (!(await ramp(0, 1, fadeIn))) return } else this.set(1)
          if (onTime) await clock.sleep(onTime * 1000)
          if (token !== this.token) return
          if (fadeOut) { if (!(await ramp(1, 0, fadeOut))) return } else this.set(0)
          if (offTime) await clock.sleep(offTime * 1000)
          if (token !== this.token) return
        }
      })()
      return background ? undefined : run
    }
  }
  class Button extends Device {
    constructor(pin, ...args) {
      super(pin)
      const kw = kwargs(args)
      this.pullUp = args[0] ?? kw.pull_up ?? true
      store.setMode(this.pin, this.pullUp ? 'pullup' : 'pulldown')
      this._pressed = null
      this._released = null
      watch(this.pin, () => {
        const fn = this.is_pressed ? this._pressed : this._released
        if (fn) return fn.length ? fn(this) : fn()
      })
    }
    get is_pressed() { return this.pullUp ? store.read(this.pin) === 0 : store.read(this.pin) === 1 }
    get is_active() { return this.is_pressed }
    get value() { return this.is_pressed ? 1 : 0 }
    get when_pressed() { return this._pressed }
    set when_pressed(fn) { this._pressed = fn }
    get when_released() { return this._released }
    set when_released(fn) { this._released = fn }
    get when_activated() { return this._pressed }
    set when_activated(fn) { this._pressed = fn }
    get when_deactivated() { return this._released }
    set when_deactivated(fn) { this._released = fn }
    wait = async (want, timeout) => {
      const end = timeout == null ? Infinity : performance.now() + timeout * 1000
      while (this.is_pressed !== want) { if (performance.now() > end) return false; await clock.sleep(10) }
      return true
    }
    wait_for_press = (timeout) => this.wait(true, timeout)
    wait_for_release = (timeout) => this.wait(false, timeout)
    wait_for_active = (timeout) => this.wait(true, timeout)
    wait_for_inactive = (timeout) => this.wait(false, timeout)
  }
  class Buzzer extends LED {
    set(v) { this._v = v; store.set(this.pin, { m: 'out', v: v ? 1 : 0, f: v ? 2300 : 0 }) }
    beep = (...args) => this.blink(...args)
  }
  class TonalBuzzer extends Device {
    constructor(pin, ...args) { super(pin); kwargs(args); this._tone = null; store.set(this.pin, { m: 'out', f: 0 }) }
    play = (tone) => { this._tone = tone instanceof Tone ? tone : new Tone(tone); store.set(this.pin, { f: this._tone.frequency, v: 1 }) }
    stop = () => { this._tone = null; store.set(this.pin, { f: 0, v: 0 }) }
    get tone() { return this._tone }
    set tone(t) { if (t == null) this.stop(); else this.play(t) }
    get is_active() { return Boolean(this._tone) }
  }
  class Servo extends Device {
    constructor(pin, ...args) {
      super(pin)
      const kw = kwargs(args)
      this.minPulse = kw.min_pulse_width ?? 1 / 1000
      this.maxPulse = kw.max_pulse_width ?? 2 / 1000
      this.value = args[0] ?? kw.initial_value ?? 0
    }
    get value() { return this._v }
    set value(v) {
      this._v = v
      if (v == null) return store.set(this.pin, { a: null, d: null })
      const pulse = this.minPulse + ((v + 1) / 2) * (this.maxPulse - this.minPulse)
      store.set(this.pin, { m: 'out', a: ((v + 1) / 2) * 180, pf: 50, d: pulse * 50 })
    }
    min = () => { this.value = -1 }
    mid = () => { this.value = 0 }
    max = () => { this.value = 1 }
    detach = () => { this.value = null }
  }
  class AngularServo extends Servo {
    constructor(pin, ...args) {
      const kw = kwargs(args)
      super(pin, { __kw: true, ...kw, initial_value: null })
      this.minAngle = kw.min_angle ?? -90
      this.maxAngle = kw.max_angle ?? 90
      this.angle = kw.initial_angle ?? 0
    }
    get angle() { return this._angle }
    set angle(a) {
      this._angle = a
      if (a == null) { this.value = null; return }
      this.value = ((a - this.minAngle) / (this.maxAngle - this.minAngle)) * 2 - 1
    }
  }
  class RGBLED {
    constructor(...args) {
      const kw = kwargs(args)
      this.pins = [args[0] ?? kw.red, args[1] ?? kw.green, args[2] ?? kw.blue].map(gpio)
      this.activeHigh = kw.active_high ?? true
      this.token = 0
      this.color = kw.initial_value ?? [0, 0, 0]
    }
    get color() { return this._c }
    set color(c) {
      this._c = [...c]
      this._c.forEach((v, i) => duty(this.pins[i], this.activeHigh ? v : 1 - v, 100))
    }
    get red() { return this._c[0] }
    set red(v) { this.color = [v, this._c[1], this._c[2]] }
    get green() { return this._c[1] }
    set green(v) { this.color = [this._c[0], v, this._c[2]] }
    get blue() { return this._c[2] }
    set blue(v) { this.color = [this._c[0], this._c[1], v] }
    get value() { return this._c }
    set value(c) { this.color = c }
    on = () => { this.token++; this.color = [1, 1, 1] }
    off = () => { this.token++; this.color = [0, 0, 0] }
    toggle = () => { this.token++; this.color = this._c.map((v) => 1 - v) }
    blink = (...args) => {
      const kw = kwargs(args)
      const on = args[0] ?? kw.on_time ?? 1
      const off = args[1] ?? kw.off_time ?? 1
      const color = kw.on_color ?? [1, 1, 1]
      const token = ++this.token
      ;(async () => {
        for (let i = 0; kw.n == null || i < kw.n; i++) {
          if (token !== this.token) return
          this.color = color
          await clock.sleep(on * 1000)
          if (token !== this.token) return
          this.color = [0, 0, 0]
          await clock.sleep(off * 1000)
        }
      })()
    }
    close() { this.token++ }
  }
  class TrafficLights {
    constructor(...args) {
      const kw = kwargs(args)
      this.red = new LED(args[0] ?? kw.red)
      this.amber = new LED(args[1] ?? kw.amber ?? kw.yellow)
      this.yellow = this.amber
      this.green = new LED(args[2] ?? kw.green)
    }
    on = () => [this.red, this.amber, this.green].forEach((l) => l.on())
    off = () => [this.red, this.amber, this.green].forEach((l) => l.off())
    close() {}
  }
  class LEDBoard {
    constructor(...args) { kwargs(args); this.leds = args.map((p) => new LED(p)) }
    on = (...i) => (i.length ? i : this.leds.map((_, k) => k)).forEach((k) => this.leds[k].on())
    off = (...i) => (i.length ? i : this.leds.map((_, k) => k)).forEach((k) => this.leds[k].off())
    toggle = (...i) => (i.length ? i : this.leds.map((_, k) => k)).forEach((k) => this.leds[k].toggle())
    get value() { return this.leds.map((l) => l.value) }
    set value(vs) { vs.forEach((v, k) => { this.leds[k].value = v }) }
    close() {}
  }
  const gpiozero = { LED, PWMLED, Button, Buzzer, TonalBuzzer, Servo, AngularServo, RGBLED, TrafficLights, LEDBoard, Tone, MotionSensor: Button, LineSensor: Button, OutputDevice: LED, DigitalOutputDevice: LED, PWMOutputDevice: PWMLED, DigitalInputDevice: Button }

  // ---------- RPi.GPIO ----------
  let gpioMode = 11
  const ch = (c) => (gpioMode === 10 ? BOARD_TO_BCM[c] : c)
  const GPIO = {
    BCM: 11, BOARD: 10, OUT: 0, IN: 1, HIGH: 1, LOW: 0, PUD_UP: 22, PUD_DOWN: 21, PUD_OFF: 20, RISING: 31, FALLING: 32, BOTH: 33,
    setmode(m) { gpioMode = m },
    getmode: () => gpioMode,
    setwarnings() {},
    setup(chan, mode, ...args) {
      const kw = kwargs(args)
      for (const c of [].concat(chan)) {
        if (mode === 0) output(ch(c), kw.initial ?? 0)
        else store.setMode(ch(c), (args[0] ?? kw.pull_up_down) === 22 ? 'pullup' : (args[0] ?? kw.pull_up_down) === 21 ? 'pulldown' : 'in')
      }
    },
    output(chan, v) { [].concat(chan).forEach((c, i) => output(ch(c), Array.isArray(v) ? v[i] : v)) },
    input: (c) => store.read(ch(c)),
    cleanup() {},
    add_event_detect(c, edge, ...args) {
      const kw = kwargs(args)
      const cb = args[0] ?? kw.callback
      if (cb) watch(ch(c), (level) => { if (edge === 33 || (edge === 31 && level) || (edge === 32 && !level)) return cb(c) })
    },
    add_event_callback(c, cb) { watch(ch(c), () => cb(c)) },
    remove_event_detect() {},
    async wait_for_edge(c, edge) {
      const start = store.read(ch(c))
      for (;;) { await clock.sleep(5); const now = store.read(ch(c)); if (now !== start && (edge === 33 || (edge === 31 && now) || (edge === 32 && !now))) return c }
    },
    PWM: class {
      constructor(c, freq) { this.pin = ch(c); this.f = freq; this.dc = 0 }
      start(dc) { this.dc = dc; this.apply() }
      ChangeDutyCycle(dc) { this.dc = dc; this.apply() }
      ChangeFrequency(f) { this.f = f; this.apply() }
      apply() {
        const d = this.dc / 100
        const servo = this.f >= 40 && this.f <= 60
        store.set(this.pin, { m: 'out', d: d > 0 && d < 1 ? d : null, v: d >= 1 ? 1 : 0, pf: this.f, ...(servo ? { a: null } : {}) })
      }
      stop() { store.set(this.pin, { d: null, v: 0, pf: 0 }) }
    },
  }

  // Python creates objects by calling the class; JavaScript needs `new`. A Proxy allows both.
  const callable = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'function' && /^class\b/.test(Function.prototype.toString.call(v)) ? new Proxy(v, { apply: (C, _, args) => new C(...args) }) : v]))
  const modules = {
    machine: callable(machine), time, utime: time, gpiozero: callable(gpiozero), 'gpiozero.tones': callable({ Tone }), 'RPi.GPIO': callable(GPIO), RPi: { GPIO: callable(GPIO) }, network: callable(network),
    signal: { pause: forever }, math: { ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, Math[k]])), pi: Math.PI, e: Math.E }, random: { random: Math.random, randint: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), uniform: (a, b) => a + Math.random() * (b - a), choice: (xs) => xs[Math.floor(Math.random() * xs.length)] },
    sys: { exit: () => { throw new Error('SystemExit') }, platform: board.id === 'rpi5' ? 'linux' : 'rp2' }, os: {}, gc: { collect() {}, mem_free: () => 180000 },
  }
  modules.gpiozero.pause = forever

  const star = {}
  const api = {
    ...builtins,
    __import(name) {
      if (!(name in modules)) throw new Error(`No module named '${name}'`)
      return modules[name]
    },
    __importStar(name) { Object.assign(star, api.__import(name)) },
  }

  function report(err) {
    post({ type: 'error', message: err?.message || String(err), line: errorLine(err, 3) })
  }

  let program
  try {
    program = new AsyncFunction('__api', '__star', `with (__api) { with (__star) {\n${code}\n} }`)
  } catch (err) {
    throw new Error(`The script could not be translated: ${err.message}`)
  }
  post({ type: 'status', text: 'running' })
  program(api, star).then(() => post({ type: 'status', text: 'finished' }), report)
}
