// Runs one simulation off the main thread. The page terminates the worker to stop it.
import { PinStore } from './pinStore'
import { runArduino } from './runtimeArduino'
import { runPython } from './runtimePython'
import { runAvr } from './runtimeAvr'

let store = null
const post = (msg) => self.postMessage(msg)

self.onmessage = (event) => {
  const msg = event.data
  try {
    if (msg.type === 'start') {
      store = new PinStore(msg.board, post)
      for (const [num, input] of Object.entries(msg.inputs || {})) store.inputs[num] = input
      if (msg.engine === 'avr') runAvr(msg.board, msg.hex, store, post)
      else if (msg.language === 'arduino') runArduino(msg.board, msg.code, store, post)
      else runPython(msg.board, msg.code, store, post)
    } else if (msg.type === 'input' && store) {
      store.setInput(msg.pin, msg.patch)
      store.onInput?.()
    } else if (msg.type === 'serial' && store) {
      const bytes = [...msg.text].map((c) => c.charCodeAt(0))
      if (store.onSerialIn) store.onSerialIn(bytes)
      else store.serialIn.push(...bytes)
    }
  } catch (err) {
    post({ type: 'error', message: err?.message || String(err), line: null })
  }
}
