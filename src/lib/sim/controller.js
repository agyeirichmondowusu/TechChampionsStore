// Page-side handle for a running simulation: starts the worker, forwards inputs, plays buzzers.

export function startSimulation({ board, language, code, hex, inputs, onPins, onSerial, onError, onStatus }) {
  const worker = new Worker(new URL('./simWorker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    if (data.type === 'pins') onPins(data.pins)
    else if (data.type === 'serial') onSerial(data.text)
    else if (data.type === 'error') onError(data)
    else if (data.type === 'status') onStatus?.(data.text)
  }
  worker.onerror = (e) => onError({ message: e.message || 'The simulator stopped unexpectedly.' })
  const plain = JSON.parse(JSON.stringify(board))
  worker.postMessage({ type: 'start', board: plain, engine: board.engine, language, code, hex, inputs })
  return {
    input: (pin, patch) => worker.postMessage({ type: 'input', pin, patch }),
    serial: (text) => worker.postMessage({ type: 'serial', text }),
    stop: () => worker.terminate(),
  }
}

// One oscillator per buzzer part; frequencies follow the pin.
export class BuzzerAudio {
  constructor() {
    this.ctx = null
    this.voices = new Map()
    this.muted = false
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) this.ctx = new Ctx()
    }
    this.ctx?.resume?.()
  }

  set(id, freq) {
    if (!this.ctx) return
    let voice = this.voices.get(id)
    const on = !this.muted && freq > 20 && freq < 20000
    if (!voice) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'square'
      gain.gain.value = 0
      osc.connect(gain).connect(this.ctx.destination)
      osc.start()
      voice = { osc, gain }
      this.voices.set(id, voice)
    }
    const t = this.ctx.currentTime
    if (on) voice.osc.frequency.setTargetAtTime(freq, t, 0.005)
    voice.gain.gain.setTargetAtTime(on ? 0.04 : 0, t, 0.01)
  }

  stopAll() {
    for (const { osc, gain } of this.voices.values()) {
      gain.gain.value = 0
      osc.stop()
    }
    this.voices.clear()
  }
}

// Servo angle from a pin: set directly by a servo library, or measured from the pulse width.
export function servoAngle(pin, board) {
  if (!pin) return null
  if (pin.a != null) return pin.a
  if (pin.d != null && pin.pf >= 30 && pin.pf <= 400) {
    const us = (pin.d / pin.pf) * 1e6
    const [lo, hi] = board.engine === 'avr' ? [544, 2400] : [500, 2500]
    if (us > 300 && us < 3000) return Math.min(180, Math.max(0, ((us - lo) / (hi - lo)) * 180))
  }
  return null
}
