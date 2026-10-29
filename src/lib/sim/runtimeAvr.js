// Cycle-accurate ATmega328P emulation (Uno, Nano) with avr8js.
// Pin edges are timed in CPU cycles, so PWM duty, tone() frequency and servo pulses are measured
// from the real firmware output rather than guessed.
import {
  avrInstruction, AVRADC, AVRIOPort, AVRTimer, AVRUSART, CPU, PinState,
  adcConfig, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, usart0Config,
} from 'avr8js'

const CLOCK = 16_000_000
const CYCLES_PER_MS = CLOCK / 1000

function loadHex(hex, bytes) {
  let upper = 0
  for (const line of hex.split(/\r?\n/)) {
    if (!line.startsWith(':')) continue
    const count = parseInt(line.slice(1, 3), 16)
    const address = parseInt(line.slice(3, 7), 16)
    const type = parseInt(line.slice(7, 9), 16)
    if (type === 0) {
      for (let i = 0; i < count; i++) {
        const at = upper + address + i
        if (at >= bytes.length) throw new Error('The sketch is larger than the program memory.')
        bytes[at] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16)
      }
    } else if (type === 4) upper = parseInt(line.slice(9, 13), 16) << 16
    else if (type === 1) break
  }
}

export function runAvr(board, hex, store, post) {
  const program = new Uint16Array(0x4000)
  loadHex(hex, new Uint8Array(program.buffer))
  const cpu = new CPU(program)
  const ports = { B: new AVRIOPort(cpu, portBConfig), C: new AVRIOPort(cpu, portCConfig), D: new AVRIOPort(cpu, portDConfig) }
  new AVRTimer(cpu, timer0Config)
  new AVRTimer(cpu, timer1Config)
  new AVRTimer(cpu, timer2Config)
  const usart = new AVRUSART(cpu, usart0Config, CLOCK)
  const adc = new AVRADC(cpu, adcConfig)

  // Arduino pin number -> port and bit
  const map = {}
  for (let n = 0; n < 8; n++) map[n] = { port: ports.D, bit: n }
  for (let n = 8; n < 14; n++) map[n] = { port: ports.B, bit: n - 8 }
  for (let n = 14; n < 20; n++) map[n] = { port: ports.C, bit: n - 14 }
  const digitalPins = Object.keys(map).map(Number)

  const edges = {} // num -> { level, rise, fall, period, high }
  const levelOf = (st) => (st === PinState.High ? 1 : 0)

  const syncInputs = () => {
    for (const num of digitalPins) {
      const { port, bit } = map[num]
      const st = port.pinState(bit)
      if (st === PinState.Input || st === PinState.InputPullUp) {
        const p = store.pin(num)
        p.m = st === PinState.InputPullUp ? 'pullup' : 'in'
        const want = store.read(num)
        if (p._in !== want) {
          p._in = want
          port.setPin(bit, Boolean(want))
        }
      }
    }
  }

  const onPortChange = (port) => {
    const now = cpu.cycles
    for (const num of digitalPins) {
      if (map[num].port !== port) continue
      const st = port.pinState(map[num].bit)
      const level = st === PinState.High ? 1 : 0
      const e = (edges[num] ||= { level, rise: 0, fall: 0, period: 0, high: 0, last: 0 })
      if (level !== e.level) {
        if (level) {
          if (e.rise) e.period = now - e.rise
          e.rise = now
        } else if (e.rise) {
          e.high = now - e.rise
          e.fall = now
        }
        e.level = level
        e.last = now
      }
    }
    syncInputs()
  }
  Object.values(ports).forEach((port) => port.addListener(() => onPortChange(port)))
  syncInputs()

  let serialText = ''
  usart.onByteTransmit = (b) => { serialText += String.fromCharCode(b) }
  const rxQueue = []

  // Publish pin modes, levels and measured waveforms.
  const report = () => {
    const now = cpu.cycles
    for (const num of digitalPins) {
      const { port, bit } = map[num]
      const st = port.pinState(bit)
      const isOut = st === PinState.High || st === PinState.Low
      const e = edges[num]
      let d = null
      let pf = 0
      let f = 0
      if (isOut && e && e.period && now - e.last < Math.max(e.period * 3, CYCLES_PER_MS * 30) && e.period < CLOCK / 15) {
        d = Math.min(1, e.high / e.period)
        pf = CLOCK / e.period
        // A square wave from tone() or a buzzer: report its pitch.
        if (Math.abs(d - 0.5) < 0.08) f = pf
      }
      store.set(num, { m: isOut ? 'out' : st === PinState.InputPullUp ? 'pullup' : 'in', v: levelOf(st), d, pf, f })
    }
    for (let ch = 0; ch < 8; ch++) {
      const num = 14 + ch
      adc.channelValues[ch] = store.inputs[num]?.volts ?? (store.read(num) ? 5 : 0)
    }
    if (serialText) { store.serial(serialText); serialText = '' }
  }

  store.onInput = () => syncInputs()
  store.onSerialIn = (bytes) => rxQueue.push(...bytes)

  let base = performance.now()
  let baseCycles = 0
  let lastReport = 0
  const channel = new MessageChannel()
  const step = () => {
    const now = performance.now()
    let target = baseCycles + (now - base) * CYCLES_PER_MS
    if (target - cpu.cycles > CYCLES_PER_MS * 200) {
      // Too far behind (slow device or a long pause): drop the backlog instead of racing.
      base = now
      baseCycles = cpu.cycles
      target = cpu.cycles + CYCLES_PER_MS * 16
    }
    const limit = Math.min(target, cpu.cycles + CYCLES_PER_MS * 25)
    while (cpu.cycles < limit) {
      avrInstruction(cpu)
      cpu.tick()
    }
    if (rxQueue.length && usart.writeByte(rxQueue[0])) rxQueue.shift()
    if (now - lastReport > 30) {
      lastReport = now
      report()
    }
    if (cpu.cycles >= target - CYCLES_PER_MS) setTimeout(step, 2)
    else channel.port2.postMessage(0)
  }
  channel.port1.onmessage = step
  post({ type: 'status', text: 'running' })
  step()
}
