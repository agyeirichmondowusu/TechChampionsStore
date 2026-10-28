// Timing helpers shared by the Arduino and Python runners.
export function makeClock() {
  const t0 = performance.now()
  let lastYield = t0
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0))
  return {
    t0,
    millis: () => Math.floor(performance.now() - t0),
    micros: () => Math.floor((performance.now() - t0) * 1000),
    // Called inside every loop: hands control back to the event loop every few milliseconds,
    // so input events and the Stop button are always handled.
    async yieldNow() {
      const now = performance.now()
      if (now - lastYield > 8) {
        lastYield = now
        await pause()
      }
    },
    async sleep(ms) {
      ms = Math.max(0, Number(ms) || 0)
      await new Promise((resolve) => setTimeout(resolve, ms))
      lastYield = performance.now()
    },
  }
}

// Turns a runtime error stack into a line number in the user's code.
export function errorLine(err, offset) {
  const m = String(err?.stack || '').match(/<anonymous>:(\d+):(\d+)/)
  return m ? Math.max(1, Number(m[1]) - offset) : null
}

export const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
