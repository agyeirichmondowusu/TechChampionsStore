import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Box, Cable, Download, FileUp, Loader2, Play, RotateCcw, Send, Square, Trash2, Usb, Volume2, VolumeX } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { Decoration, EditorView } from '@codemirror/view'
import { StateEffect, StateField } from '@codemirror/state'
import BoardPicker from '../components/sim/BoardPicker'
import Board3D from '../components/sim/Board3D'
import Workbench from '../components/sim/Workbench'
import CircuitPanel from '../components/sim/CircuitPanel'
import { boardTopView } from '../components/sim/boardScene'
import { boardById, LANGUAGES } from '../lib/sim/boards'
import { buildExample, examplesFor } from '../lib/sim/examples'
import { autoCircuit } from '../lib/sim/autoCircuit'
import { solveCircuit } from '../lib/sim/circuit'
import { CIRCUIT_PARTS, newCircuitId } from '../lib/sim/circuitParts'
import { BuzzerAudio, startSimulation } from '../lib/sim/controller'
import { canUseSerial, flashAvr, uploadMicroPython } from '../lib/sim/upload'
import { prepareSketch } from '../lib/sim/sketch'

const STORE_KEY = 'tcs_simulator_v2'
const SERIAL_LIMIT = 20000

const loadSaved = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {} } catch { return {} }
}

const topView = (board) => {
  try { return boardTopView(board.id) } catch { return null } // no WebGL
}

// An example's code plus its circuit, already wired up on a breadboard.
function freshProject(board, language, exampleId) {
  const ex = buildExample(board, language, exampleId)
  const top = topView(board)
  return { language, exampleId: ex.id, code: ex.code, circuit: top ? autoCircuit(board, ex.parts, top) : { parts: [], wires: [] }, circuitEdited: false }
}

const toInputs = (volts) => Object.fromEntries(Object.entries(volts).map(([num, v]) => [num, { volts: Math.round(v * 1000) / 1000 }]))

// ---------- error line highlight in the editor ----------
const setErrorLine = StateEffect.define()
const errorLineField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setErrorLine)) continue
      if (e.value == null || e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none
      const line = tr.state.doc.line(e.value)
      return Decoration.set([Decoration.line({ class: 'cm-sim-error' }).range(line.from)])
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})
const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  '.cm-sim-error': { backgroundColor: 'rgba(239, 68, 68, 0.22)' },
})

const Editor = memo(function Editor({ value, language, onChange, onReady }) {
  const extensions = useMemo(() => [language === 'arduino' ? cpp() : python(), errorLineField, editorTheme, EditorView.lineWrapping], [language])
  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={oneDark}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={onReady}
      basicSetup={{ foldGutter: false, highlightActiveLineGutter: true }}
      className="h-full"
    />
  )
})

// avr-gcc reports "sketch.ino:12:5: error: ..."; keep the first error and its line.
function parseCompileError(message) {
  const m = message.match(/:(\d+):(?:\d+:)?\s*(?:fatal )?error:\s*(.+)/)
  if (!m) return { message: message.split('\n').slice(-6).join('\n'), line: null }
  return { message: m[2].trim(), line: Number(m[1]) }
}

export default function Simulator() {
  const saved = useRef(loadSaved())
  const [boardId, setBoardId] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('board')
    return boardById(q || saved.current.boardId || 'uno').id
  })
  const board = useMemo(() => boardById(boardId), [boardId])
  const [project, setProject] = useState(() => (saved.current.projects?.[boardId]?.circuit ? saved.current.projects[boardId] : freshProject(boardById(boardId), boardById(boardId).languages[0])))
  const { language, code, circuit } = project
  const top = useMemo(() => topView(board), [board])

  const [status, setStatus] = useState('idle') // idle | compiling | running | uploading
  const [pins, setPins] = useState({})
  const [serial, setSerial] = useState('')
  const [serialTick, setSerialTick] = useState(0)
  const [serialInput, setSerialInput] = useState('')
  const [error, setError] = useState(null)
  const [note, setNote] = useState('')
  const [ranCode, setRanCode] = useState(null)
  const [muted, setMuted] = useState(false)
  const [nanoOld, setNanoOld] = useState(false)
  const [selected, setSelected] = useState(null)
  const [wireColor, setWireColor] = useState('#16a34a')
  const [burned, setBurned] = useState(() => new Set())
  const [tab, setTab] = useState('circuit')
  const workbench = useRef(null)

  const sim = useRef(null)
  const audio = useRef(null)
  const view = useRef(null)
  const hexCache = useRef(new Map())
  const sentInputs = useRef({})
  const pending = useRef(null)
  const serialEnd = useRef(null)
  const fileInput = useRef(null)
  const running = status === 'running'

  // Save each board's project in this browser.
  useEffect(() => {
    const t = setTimeout(() => {
      const data = loadSaved()
      data.boardId = boardId
      data.projects = { ...(data.projects || {}), [boardId]: project }
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)) } catch { /* storage full or blocked */ }
    }, 400)
    return () => clearTimeout(t)
  }, [boardId, project])

  const showError = useCallback((err) => {
    setError(err)
    view.current?.dispatch({ effects: setErrorLine.of(err?.line ?? null) })
    if (err?.line && view.current) {
      const line = view.current.state.doc.line(Math.min(err.line, view.current.state.doc.lines))
      view.current.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
    }
  }, [])

  // The circuit decides what every input pin sees; it is re-solved whenever an output changes.
  const solved = useMemo(() => solveCircuit({ board, circuit, pins, running, burned }), [board, circuit, pins, running, burned])
  useEffect(() => {
    if (solved.burned.length) setBurned((b) => new Set([...b, ...solved.burned]))
  }, [solved])
  const inputs = useMemo(() => toInputs(solved.inputs), [solved])

  useEffect(() => {
    if (!sim.current) return
    const before = sentInputs.current
    for (const num of new Set([...Object.keys(before), ...Object.keys(inputs)])) {
      const a = before[num]
      const b = inputs[num]
      if (JSON.stringify(a) === JSON.stringify(b)) continue
      sim.current.input(Number(num), b || { pressed: null, volts: null })
    }
    sentInputs.current = inputs
  }, [inputs])

  // Buzzers play whatever tone reaches them through the circuit.
  useEffect(() => {
    if (!audio.current) return
    audio.current.muted = muted
    for (const part of circuit.parts) {
      if (part.type === 'buzzer') audio.current.set(part.id, running ? solved.parts[part.id]?.freq || 0 : 0)
    }
  }, [solved, circuit, running, muted])

  const stop = useCallback(() => {
    sim.current?.stop()
    sim.current = null
    audio.current?.stopAll()
    cancelAnimationFrame(pending.current?.raf)
    pending.current = null
    setStatus((s) => (s === 'running' ? 'idle' : s))
  }, [])

  useEffect(() => () => stop(), [stop])

  const compileAvr = async (source) => {
    if (hexCache.current.has(source)) return hexCache.current.get(source)
    setStatus('compiling')
    setNote('Compiling with avr-gcc in your browser. The first build downloads the toolchain (about 54 MB) and is cached after that.')
    const { compile } = await import('@horang-corp/avr-gcc-wasm')
    const result = await compile({ source: prepareSketch(source), assetsBase: `${window.location.origin}/avr/` })
    if (!result.fitsTarget) throw new Error(`The sketch uses ${result.flashBytes} bytes but the ${board.short} has ${board.flash}.`)
    hexCache.current.set(source, { hex: result.hex, bytes: result.flashBytes })
    return hexCache.current.get(source)
  }

  const run = async () => {
    stop()
    showError(null)
    setPins({})
    setSerial('')
    setBurned(new Set())
    audio.current ||= new BuzzerAudio()
    audio.current.unlock()
    let hex = null
    try {
      if (board.engine === 'avr') {
        const built = await compileAvr(code)
        hex = built.hex
        setNote(`Compiled · ${built.bytes.toLocaleString()} of ${board.flash.toLocaleString()} bytes of flash. Running the real firmware on an emulated ATmega328P.`)
      } else {
        setNote(board.id === 'rpi5' ? 'Running your Python with simulated gpiozero, RPi.GPIO and time.' : `Running on the built-in ${LANGUAGES[language].label} runtime for the ${board.short}.`)
      }
    } catch (err) {
      setStatus('idle')
      setNote('')
      showError(parseCompileError(err.message || String(err)))
      return
    }
    // Pin updates arrive up to 60 times a second; apply at most one per frame.
    pending.current = { pins: null, raf: 0 }
    const startInputs = toInputs(solveCircuit({ board, circuit, pins: {}, running: true }).inputs)
    const handle = startSimulation({
      board,
      language,
      code,
      hex,
      inputs: startInputs,
      onPins: (next) => {
        const p = pending.current
        if (!p) return
        p.pins = next
        if (!p.raf) p.raf = requestAnimationFrame(() => { p.raf = 0; setPins(p.pins) })
      },
      onSerial: (text) => {
        setSerial((s) => (s + text).slice(-SERIAL_LIMIT))
        setSerialTick((t) => t + 1)
      },
      onError: (err) => {
        showError(err)
        stop()
      },
    })
    sim.current = handle
    sentInputs.current = startInputs
    setRanCode(code)
    setStatus('running')
  }

  useEffect(() => {
    const el = serialEnd.current
    if (el) el.scrollTop = el.scrollHeight
  }, [serial])

  const switchBoard = (id) => {
    stop()
    showError(null)
    setNote('')
    setPins({})
    setSerial('')
    const next = boardById(id)
    const data = loadSaved()
    const savedProject = data.projects?.[id]
    setBoardId(id)
    setSelected(null)
    setProject(savedProject?.circuit && next.languages.includes(savedProject.language) ? savedProject : freshProject(next, next.languages[0]))
    const url = new URL(window.location.href)
    url.searchParams.set('board', id)
    window.history.replaceState(null, '', url)
  }

  const isEdited = () => {
    const ex = buildExample(board, language, project.exampleId)
    return ex.code.trim() !== code.trim() || project.circuitEdited
  }

  const loadExample = (exampleId, lang = language) => {
    if (isEdited() && !window.confirm('Replace your code and circuit with this example? Your changes on this board will be lost.')) return
    stop()
    showError(null)
    setSelected(null)
    setProject(freshProject(board, lang, exampleId))
  }

  const setCode = useCallback((value) => setProject((p) => ({ ...p, code: value })), [])
  const setCircuit = useCallback((next) => setProject((p) => ({ ...p, circuit: next, circuitEdited: true })), [])
  const pressPart = useCallback((id, down) => setProject((p) => ({ ...p, circuit: { ...p.circuit, parts: p.circuit.parts.map((x) => (x.id === id ? { ...x, props: { ...x.props, pressed: down } } : x)) } })), [])
  const addPart = (type) => {
    const def = CIRCUIT_PARTS[type]
    const [cx, cy] = workbench.current?.center() || [0, 0]
    const [x0, y0, x1, y1] = def.box
    const id = newCircuitId(type === 'breadboard' ? 'bb' : 'p')
    const snap = (v) => Math.round(v / 1.27) * 1.27
    setCircuit({ ...circuit, parts: [...circuit.parts, { id, type, x: snap(cx - (x0 + x1) / 2), y: snap(cy - (y0 + y1) / 2), rot: 0, props: { ...(def.props || {}) } }] })
    setSelected({ kind: 'part', id })
    setTab('circuit')
  }

  const sendSerial = (e) => {
    e.preventDefault()
    if (!sim.current) return
    sim.current.serial(`${serialInput}\n`)
    setSerial((s) => `${s}> ${serialInput}\n`.slice(-SERIAL_LIMIT))
    setSerialInput('')
  }

  const download = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = LANGUAGES[language].file
    a.click()
    URL.revokeObjectURL(url)
  }

  const openFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    const lang = /\.py$/i.test(file.name) ? (board.languages.find((l) => l !== 'arduino') || language) : board.languages.includes('arduino') ? 'arduino' : language
    stop()
    setProject((p) => ({ ...p, language: lang, code: text, exampleId: null }))
  }

  const uploadKind = board.engine === 'avr' ? 'avr' : language === 'micropython' ? 'micropython' : null
  const upload = async () => {
    if (!uploadKind) return
    stop()
    showError(null)
    setStatus('uploading')
    try {
      if (uploadKind === 'avr') {
        const built = await compileAvr(code)
        setStatus('uploading')
        setNote(`Choose your ${board.short} in the browser's serial port list…`)
        const key = board.id === 'nano' ? (nanoOld ? 'arduino-nano-old' : 'arduino-nano') : 'arduino-uno'
        await flashAvr(built.hex, key, (stage, pct) => setNote(`${stage} · ${pct}%`))
        setNote(`Uploaded and verified. Your ${board.short} is running the sketch.`)
      } else {
        setNote(`Choose your ${board.short} in the browser's serial port list. It needs MicroPython firmware already installed.`)
        await uploadMicroPython(code, (stage, pct) => setNote(`${stage} · ${pct}%`))
        setNote(`main.py saved on your ${board.short} and the board restarted to run it.`)
      }
    } catch (err) {
      if (err?.name === 'NotFoundError') setNote('No port chosen, so nothing was uploaded.')
      else showError({ message: `Upload failed: ${err.message || err}`, line: null })
    } finally {
      setStatus('idle')
    }
  }

  const examples = examplesFor(board, language)
  const busy = status === 'compiling' || status === 'uploading'
  const stale = running && ranCode !== code
  const uploadHint = board.id === 'rpi5'
    ? 'Copy main.py to your Pi and run: python3 main.py'
    : language === 'arduino' && board.engine !== 'avr'
      ? `Download the sketch and upload it to the ${board.short} with the Arduino IDE.`
      : !canUseSerial() ? 'USB upload needs Chrome or Edge on a computer.' : ''

  return (
    <div className="bg-slate-50 pb-16">
      <section className="bg-gradient-to-br from-navy-900 via-navy-800 to-brand-800 text-white">
        <div className="container-x py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">TechChampion Lab</p>
              <h1 className="font-display text-2xl font-black sm:text-3xl">Board simulator</h1>
              <p className="mt-1 max-w-2xl text-sm text-brand-100/80">Pick a board, build a real circuit on the breadboard and run your code right in the browser. Then upload it to the real thing over USB.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <BoardPicker value={boardId} onChange={switchBoard} disabled={busy} />
            {board.languages.length > 1 && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-100/70">Language</span>
                <select value={language} disabled={busy} onChange={(e) => loadExample(project.exampleId, e.target.value)} className="h-[3.25rem] rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white outline-none [&>option]:text-navy-900">
                  {board.languages.map((l) => <option key={l} value={l}>{LANGUAGES[l].label}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-100/70">Example</span>
              <select value={project.exampleId || ''} disabled={busy} onChange={(e) => loadExample(e.target.value)} className="h-[3.25rem] max-w-[16rem] rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white outline-none [&>option]:text-navy-900">
                {!project.exampleId && <option value="">Your own code</option>}
                {examples.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {running ? (
                <button type="button" onClick={stop} className="btn h-[3.25rem] bg-red-500 px-5 text-white hover:bg-red-600"><Square size={16} /> Stop</button>
              ) : (
                <button type="button" onClick={run} disabled={busy} className="btn h-[3.25rem] bg-emerald-500 px-5 text-white hover:bg-emerald-600 disabled:opacity-60">
                  {status === 'compiling' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {status === 'compiling' ? 'Compiling…' : 'Run'}
                </button>
              )}
              <button type="button" onClick={upload} disabled={busy || !uploadKind || !canUseSerial()} title={uploadHint || `Upload to a real ${board.short}`} className="btn h-[3.25rem] bg-white/10 px-4 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">
                {status === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <Usb size={16} />} Upload
              </button>
            </div>
          </div>
          {board.id === 'nano' && (
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-brand-100/80">
              <input type="checkbox" checked={nanoOld} onChange={(e) => setNanoOld(e.target.checked)} className="accent-brand-400" /> My Nano uses the old bootloader (most clones)
            </label>
          )}
        </div>
      </section>

      <div className="container-x mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="card overflow-hidden p-0">
            <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1.5">
              {[['circuit', 'Circuit', Cable], ['3d', '3D board', Box]].map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${tab === id ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={14} /> {label}</button>
              ))}
              <span className="ml-auto pr-2 text-[11px] text-slate-400">{circuit.parts.filter((p) => p.type !== 'breadboard').length} parts · {circuit.wires.length} wires</span>
            </div>
            <div className="h-[26rem] sm:h-[34rem]">
              {tab === 'circuit' ? (
                top ? (
                  <Workbench board={board} top={top} circuit={circuit} onChange={setCircuit} sim={solved} running={running} pins={pins} selected={selected} onSelect={setSelected} onPress={pressPart} wireColor={wireColor} apiRef={workbench} />
                ) : (
                  <p className="grid h-full place-items-center p-6 text-center text-sm text-slate-500">The circuit workbench needs WebGL, which this browser has turned off.</p>
                )
              ) : (
                <Board3D board={board} pins={pins} wired={solved.wiredPins} running={running} serialTick={serialTick} />
              )}
            </div>
          </div>
          <div className="card p-4">
            <CircuitPanel board={board} circuit={circuit} selected={selected} sim={solved} running={running} onAdd={addPart} onChange={setCircuit} onPress={pressPart} wireColor={wireColor} onWireColor={setWireColor} />
          </div>
        </div>

        <div className="space-y-5">
          <div className="card overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
              <p className="text-sm font-bold text-navy-900">{LANGUAGES[language].file} <span className="font-normal text-slate-400">· {board.short}</span></p>
              <div className="flex items-center gap-1">
                <input ref={fileInput} type="file" accept=".ino,.cpp,.c,.h,.py,.txt" className="hidden" onChange={openFile} />
                <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-900" title="Open a file"><FileUp size={16} /></button>
                <button type="button" onClick={download} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-900" title="Download"><Download size={16} /></button>
                <button type="button" onClick={() => loadExample(project.exampleId || examples[0]?.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-900" title="Reset to the example"><RotateCcw size={16} /></button>
              </div>
            </div>
            <div className="h-[24rem] sm:h-[28rem]">
              <Editor value={code} language={language} onChange={setCode} onReady={(v) => { view.current = v }} />
            </div>
            {(error || note || stale) && (
              <div className={`border-t px-3 py-2 text-xs ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                {error ? (
                  <p className="flex items-start gap-2 whitespace-pre-wrap">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{error.line ? <button type="button" className="font-bold underline" onClick={() => showError(error)}>Line {error.line}:</button> : null} {error.message}</span>
                  </p>
                ) : (
                  <p>{stale ? 'You changed the code. Press Run to restart with it. ' : ''}{note}</p>
                )}
              </div>
            )}
          </div>

          <div className="card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
                Serial monitor
                <span className={`h-2 w-2 rounded-full ${running ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setMuted((m) => !m)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={muted ? 'Unmute buzzers' : 'Mute buzzers'}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
                <button type="button" onClick={() => setSerial('')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Clear"><Trash2 size={16} /></button>
              </div>
            </div>
            <pre ref={serialEnd} className="h-44 overflow-auto whitespace-pre-wrap break-words bg-navy-900 px-3 py-2 font-mono text-xs leading-relaxed text-emerald-200">{serial || (running ? '' : 'Output from Serial.print() and print() appears here.')}</pre>
            <form onSubmit={sendSerial} className="flex gap-2 border-t border-slate-200 p-2">
              <input value={serialInput} onChange={(e) => setSerialInput(e.target.value)} disabled={!running} placeholder={running ? 'Send text to the board' : 'Run the code to send serial input'} className="input py-2" />
              <button type="submit" disabled={!running} className="btn-primary px-3 py-2 disabled:opacity-50" aria-label="Send"><Send size={15} /></button>
            </form>
          </div>
          {uploadHint && <p className="px-1 text-xs text-slate-500">{uploadHint}</p>}
        </div>
      </div>
    </div>
  )
}
