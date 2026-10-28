// Arduino API for the script runner (Mega, ESP32, Pico in Arduino mode).
import { AsyncFunction, errorLine, makeClock } from './runtimeCommon'
import { transpileArduino } from './transpileArduino'

const HIGH = 1
const LOW = 0
const INPUT = 0
const OUTPUT = 1
const INPUT_PULLUP = 2
const INPUT_PULLDOWN = 3
const MEGA_INTERRUPTS = { 0: 2, 1: 3, 2: 21, 3: 20, 4: 19, 5: 18 }

function formatNumber(v, fmt) {
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v !== 'number') return String(v)
  if ([2, 8, 10, 16].includes(fmt) && fmt !== undefined && Number.isInteger(v)) {
    const n = v < 0 ? (v >>> 0) : v
    return n.toString(fmt).toUpperCase()
  }
  if (!Number.isInteger(v)) return v.toFixed(fmt ?? 2)
  return String(v)
}

function printf(fmt, args) {
  let i = 0
  return String(fmt).replace(/%(-?)(0?)(\d*)(?:\.(\d+))?([dilufFsxXcob%])/g, (m, left, zero, width, prec, type) => {
    if (type === '%') return '%'
    const a = args[i++]
    let s
    if ('dilu'.includes(type)) s = String(Math.trunc(Number(a)))
    else if (type === 'f' || type === 'F') s = Number(a).toFixed(prec ? Number(prec) : 6)
    else if (type === 'x') s = (Number(a) >>> 0).toString(16)
    else if (type === 'X') s = (Number(a) >>> 0).toString(16).toUpperCase()
    else if (type === 'o') s = (Number(a) >>> 0).toString(8)
    else if (type === 'b') s = (Number(a) >>> 0).toString(2)
    else if (type === 'c') s = typeof a === 'number' ? String.fromCharCode(a) : String(a)
    else s = String(a)
    if (width) s = left ? s.padEnd(Number(width)) : s.padStart(Number(width), zero ? '0' : ' ')
    return s
  })
}

export function runArduino(board, source, store, post) {
  const { code } = transpileArduino(source)
  const clock = makeClock()
  const isAvrStyle = board.id === 'mega' || board.id === 'uno' || board.id === 'nano'
  const analogPins = board.pins.filter((p) => p.adc != null)
  let readBits = board.adcBits
  let writeBits = 8
  const ledc = { channels: {}, pinBits: {} }
  const toneTimers = {}

  const resolveAnalog = (pin) => {
    if (isAvrStyle && pin < analogPins.length && !board.pins.some((p) => p.num === pin && p.adc != null)) return analogPins[pin].num
    if (board.id === 'pico' && pin >= 0 && pin <= 3) return 26 + pin
    return pin
  }

  const pwmFreq = board.id === 'esp32' ? 1000 : board.id === 'pico' ? 1000 : 490

  const writeDuty = (pin, duty, freq = pwmFreq) => {
    duty = Math.min(1, Math.max(0, duty))
    store.set(pin, { m: 'out', d: duty > 0 && duty < 1 ? duty : null, v: duty >= 1 ? 1 : 0, pf: freq })
  }

  const rx = store.serialIn
  const takeNumber = (float) => {
    const text = String.fromCharCode(...rx)
    const m = text.match(float ? /-?\d+(\.\d+)?/ : /-?\d+/)
    if (!m) { rx.length = 0; return 0 }
    rx.splice(0, m.index + m[0].length)
    return float ? parseFloat(m[0]) : parseInt(m[0], 10)
  }

  const Serial = {
    begin() {},
    end() {},
    flush() {},
    setTimeout() {},
    print(v, fmt) { store.serial(formatNumber(v, fmt)); return String(v).length },
    println(v = '', fmt) { store.serial(formatNumber(v, fmt) + '\n') },
    printf(fmt, ...args) { store.serial(printf(fmt, args)) },
    write(v) { store.serial(typeof v === 'number' ? String.fromCharCode(v) : String(v)) },
    available: () => rx.length,
    read: () => (rx.length ? rx.shift() : -1),
    peek: () => (rx.length ? rx[0] : -1),
    readString() { const s = String.fromCharCode(...rx); rx.length = 0; return s },
    readStringUntil(c) {
      const code = typeof c === 'number' ? c : String(c).charCodeAt(0)
      const idx = rx.indexOf(code)
      const take = idx < 0 ? rx.length : idx
      const s = String.fromCharCode(...rx.slice(0, take))
      rx.splice(0, idx < 0 ? take : take + 1)
      return s
    },
    parseInt: () => takeNumber(false),
    parseFloat: () => takeNumber(true),
  }

  class Servo {
    constructor() { this.pin = null; this.angle = 90; this.min = 544; this.max = 2400 }
    attach(pin, min = 544, max = 2400) { this.pin = pin; this.min = min; this.max = max; store.set(pin, { m: 'out' }); return 1 }
    detach() { if (this.pin != null) store.set(this.pin, { a: null }); this.pin = null }
    attached() { return this.pin != null }
    write(v) {
      if (v >= this.min / 2) return this.writeMicroseconds(v)
      this.angle = Math.min(180, Math.max(0, Math.round(v)))
      if (this.pin != null) store.set(this.pin, { a: this.angle, m: 'out' })
    }
    writeMicroseconds(us) { this.write(((us - this.min) / (this.max - this.min)) * 180) }
    read() { return this.angle }
  }

  let wifiAt = 0
  const WiFi = {
    mode() {},
    begin(ssid) { wifiAt = performance.now() + 1500; store.serial(''); this.ssid = ssid || 'Wokwi-GUEST' },
    status: () => (wifiAt && performance.now() >= wifiAt ? 3 : 6),
    isConnected: () => Boolean(wifiAt && performance.now() >= wifiAt),
    localIP: () => ({ toString: () => '192.168.4.23' }),
    macAddress: () => '24:6F:28:AB:CD:EF',
    RSSI: () => -52,
    SSID() { return this.ssid || '' },
    disconnect() { wifiAt = 0 },
  }

  const interrupts = []
  const onEdge = (num, level) => {
    for (const it of interrupts) {
      if (it.pin !== num) continue
      const fire = it.mode === 'CHANGE' || (it.mode === 'RISING' && level) || (it.mode === 'FALLING' && !level) || (it.mode === 'LOW' && !level) || (it.mode === 'HIGH' && level)
      if (fire) Promise.resolve(it.fn()).catch(report)
    }
  }
  store.edgeListeners.add(onEdge)

  const constants = {
    HIGH, LOW, INPUT, OUTPUT, INPUT_PULLUP, INPUT_PULLDOWN, true: true, false: false,
    LED_BUILTIN: board.builtinLed, BUILTIN_LED: board.builtinLed,
    DEC: 10, HEX: 16, OCT: 8, BIN: 2,
    PI: Math.PI, HALF_PI: Math.PI / 2, TWO_PI: Math.PI * 2, DEG_TO_RAD: Math.PI / 180, RAD_TO_DEG: 180 / Math.PI,
    CHANGE: 'CHANGE', RISING: 'RISING', FALLING: 'FALLING',
    WL_CONNECTED: 3, WL_DISCONNECTED: 6, WL_IDLE_STATUS: 0, WIFI_STA: 1, WIFI_AP: 2,
    LSBFIRST: 0, MSBFIRST: 1,
  }
  for (const p of board.pins) if (p.adc != null && /^A\d+$/.test(p.id)) constants[p.id] = p.num
  if (board.id === 'pico') Object.assign(constants, { A0: 26, A1: 27, A2: 28, A3: 29 })
  if (board.id === 'esp32') Object.assign(constants, { A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35, A10: 4, A12: 2, A13: 15, A14: 13, A15: 12, A16: 14, A17: 27, A18: 25, A19: 26 })

  const api = {
    ...constants,
    __y: clock.yieldNow,
    __int: (v) => (typeof v === 'number' ? Math.trunc(v) : typeof v === 'boolean' ? Number(v) : v),
    __arr: (...dims) => {
      const make = (d) => (d.length ? Array.from({ length: Number(d[0]) || 0 }, () => make(d.slice(1))) : 0)
      return make(dims)
    },
    __sizeof: (v) => (Array.isArray(v) ? v.length : typeof v === 'string' ? v.length + 1 : 1),
    F: (s) => s,
    Serial, Serial1: Serial, Serial2: Serial, SerialUSB: Serial,
    Servo, WiFi,
    pinMode(pin, mode) {
      const m = mode === OUTPUT ? 'out' : mode === INPUT_PULLUP ? 'pullup' : mode === INPUT_PULLDOWN ? 'pulldown' : 'in'
      if (m === 'out') store.set(pin, { m, d: null })
      else store.setMode(pin, m)
    },
    digitalWrite(pin, value) {
      const p = store.pin(pin)
      const v = value ? 1 : 0
      if (p.m === 'in' || p.m === 'pullup') store.setMode(pin, v ? 'pullup' : 'in')
      else store.set(pin, { v, d: null, m: 'out' })
    },
    digitalRead: (pin) => store.read(pin),
    analogRead(pin) {
      const num = resolveAnalog(pin)
      const max = 2 ** readBits - 1
      return Math.min(max, Math.max(0, Math.floor((store.volts(num) / board.vref) * (max + 1))))
    },
    analogReadResolution(bits) { readBits = bits },
    analogWriteResolution(bits) { writeBits = bits },
    analogSetAttenuation() {},
    analogWrite(pin, value) { writeDuty(pin, value / (2 ** writeBits - 1)) },
    // ESP32 LEDC, both the old channel API and the 3.x pin API
    ledcSetup(ch, freq, bits) { ledc.channels[ch] = { ...(ledc.channels[ch] || { pins: [] }), freq, bits }; return freq },
    ledcAttachPin(pin, ch) { (ledc.channels[ch] ||= { pins: [], freq: 5000, bits: 8 }).pins.push(pin) },
    ledcAttach(pin, freq, bits) { ledc.pinBits[pin] = { freq, bits }; return true },
    ledcAttachChannel(pin, freq, bits, ch) { ledc.channels[ch] = { pins: [pin], freq, bits }; return true },
    ledcDetachPin() {},
    ledcDetach() {},
    ledcWrite(target, duty) {
      const ch = ledc.channels[target]
      if (ch?.pins.length) ch.pins.forEach((pin) => writeDuty(pin, duty / (2 ** ch.bits - 1), ch.freq))
      else { const cfg = ledc.pinBits[target] || { freq: 5000, bits: 8 }; writeDuty(target, duty / (2 ** cfg.bits - 1), cfg.freq) }
    },
    ledcWriteTone(target, freq) {
      const pins = ledc.channels[target]?.pins.length ? ledc.channels[target].pins : [target]
      pins.forEach((pin) => store.set(pin, { m: 'out', f: freq || 0 }))
    },
    tone(pin, freq, duration) {
      clearTimeout(toneTimers[pin])
      store.set(pin, { m: 'out', f: freq })
      if (duration) toneTimers[pin] = setTimeout(() => store.set(pin, { f: 0 }), duration)
    },
    noTone(pin) { clearTimeout(toneTimers[pin]); store.set(pin, { f: 0 }) },
    pulseIn: async () => 0,
    delay: (ms) => clock.sleep(ms),
    delayMicroseconds: (us) => (us >= 1000 ? clock.sleep(us / 1000) : clock.yieldNow()),
    yield: clock.yieldNow,
    millis: clock.millis,
    micros: clock.micros,
    map: (x, a, b, c, d) => Math.trunc(((x - a) * (d - c)) / (b - a) + c),
    constrain: (x, a, b) => Math.min(b, Math.max(a, x)),
    min: Math.min, max: Math.max, abs: Math.abs, fabs: Math.abs, pow: Math.pow, sqrt: Math.sqrt, sq: (x) => x * x,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2, asin: Math.asin, acos: Math.acos,
    exp: Math.exp, log: Math.log, log10: Math.log10, floor: Math.floor, ceil: Math.ceil, round: Math.round, fmod: (a, b) => a % b,
    radians: (d) => (d * Math.PI) / 180, degrees: (r) => (r * 180) / Math.PI,
    random: (a, b) => (b === undefined ? Math.floor(Math.random() * a) : Math.floor(a + Math.random() * (b - a))),
    randomSeed() {},
    bitRead: (x, n) => (x >> n) & 1, bit: (n) => 1 << n, lowByte: (x) => x & 0xff, highByte: (x) => (x >> 8) & 0xff,
    bitSet: (x, n) => x | (1 << n), bitClear: (x, n) => x & ~(1 << n), bitWrite: (x, n, b) => (b ? x | (1 << n) : x & ~(1 << n)),
    isDigit: (c) => c >= 48 && c <= 57, isAlpha: (c) => /[A-Za-z]/.test(String.fromCharCode(c)), isSpace: (c) => c === 32 || (c >= 9 && c <= 13),
    digitalPinToInterrupt: (pin) => ({ pin }),
    attachInterrupt(target, fn, mode) {
      const pin = target?.pin ?? (board.id === 'mega' ? MEGA_INTERRUPTS[target] : target)
      interrupts.push({ pin, fn, mode })
    },
    detachInterrupt(target) {
      const pin = target?.pin ?? target
      for (let i = interrupts.length - 1; i >= 0; i--) if (interrupts[i].pin === pin) interrupts.splice(i, 1)
    },
    interrupts() {}, noInterrupts() {},
    shiftOut() {},
    String: (v, fmt) => (v === undefined ? '' : typeof v === 'number' ? formatNumber(v, fmt) : String(v)),
  }

  // Arduino String methods
  Object.assign(String.prototype, {
    toInt() { return parseInt(this, 10) || 0 },
    toFloat() { return parseFloat(this) || 0 },
    equals(o) { return String(this) === String(o) },
    equalsIgnoreCase(o) { return String(this).toLowerCase() === String(o).toLowerCase() },
    startsWith: String.prototype.startsWith,
    c_str() { return String(this) },
  })

  function report(err) {
    post({ type: 'error', message: err?.message || String(err), line: errorLine(err, 3) })
  }

  const body = `with (__api) {\n${code}\nreturn { setup: typeof setup === 'function' ? setup : null, loop: typeof loop === 'function' ? loop : null };\n}`
  let program
  try {
    program = new AsyncFunction('__api', body)
  } catch (err) {
    throw new Error(`The sketch could not be translated: ${err.message}. The Uno and Nano support full C++.`)
  }

  ;(async () => {
    try {
      const { setup, loop } = await program(api)
      if (!setup || !loop) throw new Error('A sketch needs both setup() and loop().')
      post({ type: 'status', text: 'running' })
      await setup()
      for (;;) {
        await loop()
        await clock.yieldNow()
      }
    } catch (err) {
      report(err)
    }
  })()
}
