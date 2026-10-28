// Put code on a real board over Web Serial (Chrome / Edge on HTTPS or localhost).
//   Uno / Nano: flash the compiled firmware through the Optiboot (STK500) bootloader.
//   ESP32 / Pico with MicroPython: write main.py through the raw REPL, then soft-reset to run it.
import { BOARDS as FLASH_BOARDS, STK500, WebSerialTransport } from 'webserial-flasher'

export const canUseSerial = () => typeof navigator !== 'undefined' && 'serial' in navigator

export async function flashAvr(hex, boardKey, onProgress) {
  const profile = FLASH_BOARDS[boardKey]
  if (!profile) throw new Error(`No upload profile for ${boardKey}.`)
  const transport = await WebSerialTransport.requestPort()
  try {
    await transport.open(profile.baudRate)
    const programmer = new STK500(transport, profile)
    await programmer.bootload(hex, (stage, pct) => onProgress?.(stage, pct))
  } finally {
    await transport.close().catch(() => {})
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function uploadMicroPython(code, onProgress, filename = 'main.py') {
  const port = await navigator.serial.requestPort()
  await port.open({ baudRate: 115200 })
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const writer = port.writable.getWriter()
  const reader = port.readable.getReader()
  let received = ''
  let reading = true
  const pump = (async () => {
    while (reading) {
      const { value, done } = await reader.read().catch(() => ({ done: true }))
      if (done) break
      received += decoder.decode(value)
    }
  })()
  const send = (s) => writer.write(encoder.encode(s))
  const until = async (marker, ms = 4000) => {
    const end = Date.now() + ms
    while (!received.includes(marker)) {
      if (Date.now() > end) throw new Error(`The board did not answer (waiting for "${marker.replace(/[\x00-\x1f]/g, '')}"). Is MicroPython installed?`)
      await wait(20)
    }
    const at = received.indexOf(marker) + marker.length
    const before = received.slice(0, at)
    received = received.slice(at)
    return before
  }
  try {
    onProgress?.('Stopping the running program', 5)
    await send('\r\x03\x03')
    await wait(150)
    received = ''
    await send('\r\x01')
    await until('raw REPL; CTRL-B to exit\r\n>')
    const lines = [`f=open(${JSON.stringify(filename)},'w')`]
    for (let i = 0; i < code.length; i += 200) lines.push(`f.write(${JSON.stringify(code.slice(i, i + 200))})`)
    lines.push('f.close()')
    // Each statement runs as its own raw-REPL command so large files never overflow the board's buffer.
    for (let i = 0; i < lines.length; i++) {
      const cmd = encoder.encode(lines[i])
      for (let k = 0; k < cmd.length; k += 64) {
        await writer.write(cmd.slice(k, k + 64))
        await wait(4)
      }
      await send('\x04')
      await until('OK')
      const out = await until('\x04>')
      const err = out.split('\x04')[1]
      if (err?.trim()) throw new Error(err.trim())
      onProgress?.(`Writing ${filename}`, Math.round(10 + (85 * (i + 1)) / lines.length))
    }
    await send('\x02')
    await wait(100)
    await send('\x04') // soft reset runs main.py
    onProgress?.('Restarting the board', 100)
    await wait(300)
  } finally {
    reading = false
    await reader.cancel().catch(() => {})
    reader.releaseLock()
    writer.releaseLock()
    await pump
    await port.close().catch(() => {})
  }
}
