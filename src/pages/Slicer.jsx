import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as THREE from 'three'
import {
  Box, ChevronDown, Clock, Download, Eye, EyeOff, FileUp, Focus, Layers, Loader2, MessageCircle, Pause, Play,
  Printer, RotateCcw, RotateCw, Ruler, Scale, ShoppingBag, Sparkles, Weight, Wallet, X, MousePointerClick,
} from 'lucide-react'
import { SlicerScene } from '../components/slicer/scene'
import { DEFAULTS, MATERIALS, PATTERNS, PRINTERS, QUALITY, resolveSettings } from '../lib/slicer/profiles'
import { FEATURES, formatTime } from '../lib/slicer/gcode'
import { useStore } from '../context/StoreContext'
import { cedi, waNumber } from '../lib/format'

const SETTINGS_KEY = 'tcs_slicer_settings_v2'
const loadSettings = () => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }
  } catch {
    return DEFAULTS
  }
}

// Sample models are generated on the fly so visitors can try the slicer without a file.
const SAMPLES = [
  { id: 'cube', name: '20 mm calibration cube', make: () => new THREE.BoxGeometry(20, 20, 20) },
  { id: 'knot', name: 'Torus knot', make: () => new THREE.TorusKnotGeometry(18, 6, 300, 40) },
  { id: 'sphere', name: 'Sphere (needs supports)', make: () => new THREE.SphereGeometry(15, 96, 64) },
]

function geometryToSTL(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo
  const p = g.attributes.position.array
  const n = p.length / 9
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, n, true)
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + i * 50 + 12 + k * 4, p[i * 9 + k], true)
  return buf
}

/** Rotation and scale from the UI, then a translation that centres the part on the bed and sits it at z = 0. */
function placement(positions, quat, scale, bed) {
  const m0 = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion(...quat), new THREE.Vector3(scale, scale, scale))
  const e = m0.elements
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2]
    const tx = e[0] * x + e[4] * y + e[8] * z
    const ty = e[1] * x + e[5] * y + e[9] * z
    const tz = e[2] * x + e[6] * y + e[10] * z
    if (tx < x0) x0 = tx
    if (tx > x1) x1 = tx
    if (ty < y0) y0 = ty
    if (ty > y1) y1 = ty
    if (tz < z0) z0 = tz
    if (tz > z1) z1 = tz
  }
  const dx = bed[0] / 2 - (x0 + x1) / 2, dy = bed[1] / 2 - (y0 + y1) / 2, dz = -z0
  const matrix = new THREE.Matrix4().makeTranslation(dx, dy, dz).multiply(m0)
  const box = new THREE.Box3(new THREE.Vector3(x0 + dx, y0 + dy, 0), new THREE.Vector3(x1 + dx, y1 + dy, z1 + dz))
  const size = [x1 - x0, y1 - y0, z1 - z0]
  const out = box.min.x < -0.01 || box.min.y < -0.01 || box.max.x > bed[0] + 0.01 || box.max.y > bed[1] + 0.01 || box.max.z > bed[2] + 0.01
  return { matrix, box, size, outOfBounds: out }
}

const IDENTITY = [0, 0, 0, 1]

export default function Slicer() {
  const { settings: site, products } = useStore()
  const hostRef = useRef(null)
  const sceneRef = useRef(null)
  const workerRef = useRef(null)
  const reqId = useRef(0)
  const fileInput = useRef(null)

  const [model, setModel] = useState(null) // { name, size, triangles, volume, positions }
  const [quat, setQuat] = useState(IDENTITY)
  const [scalePct, setScalePct] = useState(100)
  const [ui, setUi] = useState(loadSettings)
  const [status, setStatus] = useState({ state: 'idle' })
  const [result, setResult] = useState(null)
  const [stale, setStale] = useState(false)
  const [view, setView] = useState('model')
  const [layer, setLayer] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hidden, setHidden] = useState(['travel'])
  const [picking, setPicking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  const s = useMemo(() => resolveSettings(ui), [ui])
  const bed = s.printer.bed
  const place = useMemo(() => (model ? placement(model.positions, quat, scalePct / 100, bed) : null), [model, quat, scalePct, bed])

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(ui))
    } catch {
      /* storage unavailable */
    }
  }, [ui])

  // Scene and worker live for the lifetime of the page.
  useEffect(() => {
    const scene = new SlicerScene(hostRef.current)
    sceneRef.current = scene
    const worker = new Worker(new URL('../lib/slicer/slicer.worker.js', import.meta.url), { type: 'module' })
    workerRef.current = worker
    return () => {
      worker.terminate()
      scene.dispose()
    }
  }, [])

  useEffect(() => {
    const sc = sceneRef.current
    sc.setBed(bed)
    if (!model) sc.frame(null, 'iso')
  }, [bed, model])

  useEffect(() => {
    sceneRef.current.setModel(model?.positions || null)
  }, [model])

  useEffect(() => {
    if (place) sceneRef.current.setModelMatrix(place.matrix, place.outOfBounds)
  }, [place])

  // Re-frame the camera when a new model arrives or the part is re-oriented.
  const frameKey = model ? `${model.id}:${quat.join()}:${scalePct}` : ''
  const lastFrame = useRef('')
  useEffect(() => {
    if (!place || lastFrame.current === frameKey) return
    lastFrame.current = frameKey
    sceneRef.current.frame(place.box, 'iso')
  }, [frameKey, place])

  useEffect(() => {
    sceneRef.current.setMode(view)
  }, [view])

  useEffect(() => {
    sceneRef.current.setPreview(result?.preview || null, { lineWidth: s.lineWidth, hidden, showTravel: !hidden.includes('travel') })
    sceneRef.current.setLayer(layer)
    // Layer changes are applied by the next effect; only rebuild when the data or visibility changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, hidden])

  useEffect(() => {
    sceneRef.current.setLayer(layer)
  }, [layer])

  const layerCount = result?.preview.layerZ.length || 0
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setLayer((l) => {
        if (l >= layerCount - 1) {
          setPlaying(false)
          return l
        }
        return l + 1
      })
    }, Math.max(16, 4000 / Math.max(layerCount, 1)))
    return () => clearInterval(t)
  }, [playing, layerCount])

  // Anything that changes the toolpaths marks the last slice as out of date.
  useEffect(() => {
    if (result) setStale(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui, quat, scalePct])

  useEffect(() => {
    const sc = sceneRef.current
    sc.onPick = picking
      ? (n) => {
          // Rotate so the clicked face points straight down onto the bed.
          const q = new THREE.Quaternion().setFromUnitVectors(n.normalize(), new THREE.Vector3(0, 0, -1))
          const next = q.multiply(new THREE.Quaternion(...quat))
          setQuat(next.toArray())
          setPicking(false)
        }
      : null
  }, [picking, quat])

  const callWorker = useCallback((msg, transfer = [], onProgress) => {
    const id = ++reqId.current
    const worker = workerRef.current
    return new Promise((resolve, reject) => {
      const handler = (ev) => {
        const d = ev.data
        if (d.id !== id) return
        if (d.type === 'progress') return onProgress?.(d)
        worker.removeEventListener('message', handler)
        if (d.type === 'error') reject(new Error(d.message))
        else resolve(d)
      }
      worker.addEventListener('message', handler)
      worker.postMessage({ ...msg, id }, transfer)
    })
  }, [])

  const loadBuffer = useCallback(
    async (buffer, name, size) => {
      setStatus({ state: 'loading', stage: `Reading ${name}` })
      setResult(null)
      setStale(false)
      setView('model')
      setPicking(false)
      try {
        const d = await callWorker({ type: 'load', buffer }, [buffer])
        setQuat(IDENTITY)
        setScalePct(100)
        setModel({ id: Date.now(), name, size, triangles: d.triangles, volume: d.volume, positions: d.positions })
        setStatus({ state: 'idle' })
      } catch (e) {
        setStatus({ state: 'error', message: e.message })
      }
    },
    [callWorker],
  )

  const onFiles = async (files) => {
    const f = files?.[0]
    if (!f) return
    if (!/\.stl$/i.test(f.name)) {
      setStatus({ state: 'error', message: 'Please choose an .stl file.' })
      return
    }
    loadBuffer(await f.arrayBuffer(), f.name, f.size)
  }

  const loadSample = (sm) => {
    const buf = geometryToSTL(sm.make())
    loadBuffer(buf, `${sm.name}.stl`, buf.byteLength)
  }

  const slice = async () => {
    if (!model || !place) return
    setStatus({ state: 'slicing', stage: 'Starting', pct: 0 })
    setPlaying(false)
    try {
      const d = await callWorker(
        { type: 'slice', settings: ui, matrix: place.matrix.elements, name: model.name },
        [],
        (p) => setStatus({ state: 'slicing', stage: p.stage, pct: p.pct }),
      )
      setResult({ gcode: d.gcode, stats: d.stats, preview: d.preview })
      setStale(false)
      setLayer(d.preview.layerZ.length - 1)
      setView('preview')
      setStatus({ state: 'idle' })
    } catch (e) {
      setStatus({ state: 'error', message: e.message })
    }
  }

  const download = () => {
    const blob = new Blob([result.gcode], { type: 'text/x-gcode' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = model.name.replace(/\.stl$/i, '') + '.gcode'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  const rotate = (axis, deg) => {
    const ax = new THREE.Vector3(...{ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis])
    const q = new THREE.Quaternion().setFromAxisAngle(ax, (deg * Math.PI) / 180)
    setQuat(q.multiply(new THREE.Quaternion(...quat)).toArray())
  }

  const set = (k) => (v) => setUi((u) => ({ ...u, [k]: v }))
  const busy = status.state === 'loading' || status.state === 'slicing'
  const st = result?.stats
  const pricePerGram = Number(site.print_price_per_gram) || 0
  const filamentProduct = products.find((p) => p.slug === s.material.slug)
  const waText = model && st
    ? `Hi TechChampionStore, I'd like this part printed:\n• File: ${model.name}\n• Size: ${place.size.map((v) => v.toFixed(1)).join(' x ')} mm\n• Material: ${s.material.name}, ${Math.round(ui.infillDensity * 100)}% infill, ${ui.layerHeight} mm layers\n• Estimate: ${formatTime(st.time)}, ${st.grams.toFixed(0)} g, ${cedi(st.grams * pricePerGram)}\nI'll send the STL file here.`
    : ''

  return (
    <div className="pb-16">
      <section className="relative overflow-hidden bg-navy-950 py-8 text-white">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(77,147,255,.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(77,147,255,.10)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="container-x relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="chip bg-white/10 text-brand-200"><Printer size={14} className="mr-1" /> 3D print studio</span>
            <h1 className="mt-3 font-display text-3xl font-black sm:text-4xl">Slice your STL right here</h1>
            <p className="mt-2 max-w-2xl text-brand-100">
              Drop in a model, pick your printer and material, and get printer-ready G-code with a layer-by-layer preview, print time and cost. Everything runs in your browser, so your file never leaves your device.
            </p>
          </div>
          <button onClick={() => fileInput.current.click()} className="btn-primary" disabled={busy}>
            <FileUp size={16} /> Upload STL
          </button>
        </div>
      </section>

      <input ref={fileInput} type="file" accept=".stl,model/stl,application/sla" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          onFiles(f ? [f] : null)
        }} />

      <div className="container-x mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Viewer */}
        <div className="lg:sticky lg:top-[calc(var(--header-h,140px)+1rem)] lg:self-start">
          <div
            className={`relative h-[58vh] min-h-[380px] overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_top,#1b2c5c,#070f24_70%)] shadow-card ring-1 lg:h-[calc(100vh-var(--header-h,140px)-2rem)] ${dragging ? 'ring-4 ring-brand-400' : 'ring-slate-200'}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              onFiles(e.dataTransfer.files)
            }}
          >
            <div ref={hostRef} className={`absolute inset-0 ${picking ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`} />

            {!model && status.state !== 'loading' && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
                <div className="pointer-events-auto max-w-sm rounded-3xl bg-navy-900/80 p-6 text-center text-white ring-1 ring-white/10 backdrop-blur">
                  <FileUp className="mx-auto text-brand-300" size={34} />
                  <p className="mt-3 font-display text-lg font-bold">Drag and drop an STL file</p>
                  <p className="mt-1 text-sm text-brand-100">Binary and ASCII STL are supported. Or try a sample:</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SAMPLES.map((sm) => (
                      <button key={sm.id} onClick={() => loadSample(sm)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">
                        {sm.name}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => fileInput.current.click()} className="btn-primary mt-5">Choose file</button>
                </div>
              </div>
            )}

            {busy && (
              <div className="absolute inset-x-0 top-0 z-10 p-4">
                <div className="mx-auto max-w-md rounded-2xl bg-navy-900/90 p-4 text-white ring-1 ring-white/10 backdrop-blur">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Loader2 size={16} className="animate-spin" /> {status.stage}…</p>
                  {status.state === 'slicing' && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${Math.round((status.pct || 0) * 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {model && (
              <>
                <div className="absolute left-3 top-3 flex rounded-full bg-navy-900/80 p-1 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur">
                  {[['model', 'Model', Box], ['preview', 'Layer preview', Layers]].map(([id, label, Icon]) => (
                    <button
                      key={id}
                      disabled={id === 'preview' && !result}
                      onClick={() => setView(id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition disabled:opacity-40 ${view === id ? 'bg-brand-600' : 'hover:bg-white/10'}`}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>
                <div className="absolute right-3 top-14 flex gap-1 rounded-full sm:top-3 bg-navy-900/80 p-1 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur">
                  {['iso', 'top', 'front', 'side'].map((v) => (
                    <button key={v} onClick={() => sceneRef.current.frame(place?.box, v)} className="rounded-full px-2.5 py-1.5 capitalize hover:bg-white/10">
                      {v === 'iso' ? <Focus size={14} /> : v}
                    </button>
                  ))}
                </div>
                {picking && (
                  <div className="absolute inset-x-0 top-28 flex justify-center px-3 sm:top-16">
                    <span className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-glow">
                      <MousePointerClick size={14} /> Click the face that should sit on the bed
                      <button onClick={() => setPicking(false)} aria-label="Cancel"><X size={14} /></button>
                    </span>
                  </div>
                )}
                {place?.outOfBounds && view === 'model' && (
                  <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
                    <span className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white">
                      The model is bigger than the {s.printer.name} build volume ({bed.join(' x ')} mm). Scale it down or rotate it.
                    </span>
                  </div>
                )}
              </>
            )}

            {view === 'preview' && result && (
              <div className="absolute inset-x-0 bottom-0 space-y-2 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(FEATURES).map(([id, f]) => {
                    const off = hidden.includes(id)
                    return (
                      <button
                        key={id}
                        onClick={() => setHidden((h) => (off ? h.filter((x) => x !== id) : [...h, id]))}
                        className={`inline-flex items-center gap-1.5 rounded-full bg-navy-900/80 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/10 backdrop-blur ${off ? 'opacity-45' : ''}`}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${f.color.map((c) => Math.round(c * 255)).join(',')})` }} />
                        {f.label}
                        {off ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-navy-900/85 px-3 py-2 text-white ring-1 ring-white/10 backdrop-blur">
                  <button
                    onClick={() => {
                      if (!playing && layer >= layerCount - 1) setLayer(0)
                      setPlaying(!playing)
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 hover:bg-brand-500"
                    aria-label={playing ? 'Pause' : 'Play layers'}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={layerCount - 1}
                    value={layer}
                    onChange={(e) => setLayer(+e.target.value)}
                    className="h-2 flex-1 cursor-pointer accent-brand-400"
                    aria-label="Layer"
                  />
                  <span className="w-36 shrink-0 text-right text-xs tabular-nums">
                    Layer {layer + 1} / {layerCount} · Z {result.preview.layerZ[layer]?.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
          {status.state === 'error' && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-100">{status.message}</p>
          )}
        </div>

        {/* Controls */}
        <aside className="space-y-4">
          <Panel icon={Box} title="Model">
            {model ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold" title={model.name}>{model.name}</p>
                    <p className="text-xs text-slate-500">
                      {model.triangles.toLocaleString()} triangles · {(model.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button onClick={() => fileInput.current.click()} className="btn-ghost shrink-0 px-3 py-1.5 text-xs" disabled={busy}>Replace</button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {['X', 'Y', 'Z'].map((a, i) => (
                    <div key={a} className="rounded-xl bg-slate-50 px-2 py-2 ring-1 ring-slate-100">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{a}</p>
                      <p className="text-sm font-bold tabular-nums">{place.size[i].toFixed(1)} <span className="text-xs font-medium text-slate-400">mm</span></p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Volume {((model.volume * (scalePct / 100) ** 3) / 1000).toFixed(2)} cm³
                </p>
                <div>
                  <span className="label">Scale</span>
                  <div className="flex items-center gap-2">
                    <input type="range" min={10} max={400} value={Math.min(scalePct, 400)} onChange={(e) => setScalePct(+e.target.value)} className="flex-1 accent-brand-600" />
                    <NumberBox value={scalePct} onChange={setScalePct} min={1} max={10000} step={1} suffix="%" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <MiniBtn onClick={() => setScalePct(2540)} title="Model was exported in inches">Inches → mm</MiniBtn>
                    <MiniBtn
                      onClick={() => {
                        const k = Math.min(...bed.map((b, i) => (b * 0.95) / (place.size[i] / (scalePct / 100))))
                        setScalePct(Math.floor(k * 100))
                      }}
                    >
                      Fit to bed
                    </MiniBtn>
                    <MiniBtn onClick={() => setScalePct(100)}>100%</MiniBtn>
                  </div>
                </div>
                <div>
                  <span className="label">Orientation</span>
                  <div className="flex flex-wrap gap-1.5">
                    {['x', 'y', 'z'].map((a) => (
                      <MiniBtn key={a} onClick={() => rotate(a, 90)}>
                        <RotateCw size={12} /> {a.toUpperCase()} 90°
                      </MiniBtn>
                    ))}
                    <MiniBtn onClick={() => setPicking(!picking)} active={picking}>
                      <MousePointerClick size={12} /> Place on face
                    </MiniBtn>
                    <MiniBtn onClick={() => setQuat(IDENTITY)}>
                      <RotateCcw size={12} /> Reset
                    </MiniBtn>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button onClick={() => fileInput.current.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50">
                  <FileUp className="text-brand-600" />
                  <span className="text-sm font-semibold text-navy-900">Upload an STL file</span>
                  <span className="text-xs text-slate-500">or drop it on the build plate</span>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLES.map((sm) => (
                    <MiniBtn key={sm.id} onClick={() => loadSample(sm)}>
                      <Sparkles size={12} /> {sm.name}
                    </MiniBtn>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel icon={Printer} title="Printer and material">
            <div className="space-y-3">
              <Select label="Printer" value={ui.printer} onChange={(v) => setUi((u) => ({ ...u, printer: v, printSpeed: null, firstLayerSpeed: null, retractLength: null }))} options={PRINTERS.map((p) => [p.id, `${p.name} (${p.bed.join('×')})`])} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Material" value={ui.material} onChange={set('material')} options={MATERIALS.map((m) => [m.id, m.name])} />
                <Select label="Nozzle" value={String(ui.nozzle)} onChange={(v) => set('nozzle')(+v)} options={[0.2, 0.4, 0.6, 0.8].map((n) => [String(n), `${n} mm`])} />
              </div>
            </div>
          </Panel>

          <Panel icon={Layers} title="Print settings">
            <div className="space-y-4">
              <div>
                <span className="label">Layer height</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {QUALITY.map((q) => {
                    const lh = Math.min(q.layerHeight, ui.nozzle * 0.75)
                    return (
                      <button
                        key={q.id}
                        onClick={() => setUi((u) => ({ ...u, layerHeight: lh, firstLayerHeight: Math.max(lh, Math.min(0.2, ui.nozzle * 0.6)) }))}
                        className={`rounded-xl px-2 py-2 text-xs font-semibold ring-1 transition ${Math.abs(ui.layerHeight - lh) < 1e-6 ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-navy-800 ring-slate-200 hover:ring-brand-300'}`}
                      >
                        {q.name}
                        <span className="block text-[10px] font-medium opacity-75">{lh} mm</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="label">Infill</span>
                  <span className="text-xs font-bold text-brand-700">{Math.round(ui.infillDensity * 100)}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={Math.round(ui.infillDensity * 100)} onChange={(e) => set('infillDensity')(+e.target.value / 100)} className="w-full accent-brand-600" />
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {PATTERNS.map((p) => (
                    <button key={p.id} onClick={() => set('infillPattern')(p.id)} className={`rounded-lg px-1 py-1.5 text-[11px] font-semibold ring-1 transition ${ui.infillPattern === p.id ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-navy-800 ring-slate-200 hover:ring-brand-300'}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <NumberField label="Walls" value={ui.walls} onChange={set('walls')} min={1} max={10} />
                <NumberField label="Top layers" value={ui.topLayers} onChange={set('topLayers')} min={0} max={20} />
                <NumberField label="Bottom" value={ui.bottomLayers} onChange={set('bottomLayers')} min={0} max={20} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Print speed" value={ui.printSpeed ?? s.printer.print} onChange={set('printSpeed')} min={5} max={600} suffix="mm/s" />
                <NumberField label="First layer speed" value={ui.firstLayerSpeed ?? s.printer.first} onChange={set('firstLayerSpeed')} min={5} max={300} suffix="mm/s" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Supports" value={ui.supports} onChange={set('supports')} options={[['none', 'Off'], ['buildplate', 'From build plate'], ['everywhere', 'Everywhere']]} />
                <Select label="Bed adhesion" value={ui.adhesion} onChange={set('adhesion')} options={[['none', 'None'], ['skirt', 'Skirt'], ['brim', 'Brim']]} />
              </div>

              <button onClick={() => setAdvanced(!advanced)} className="flex w-full items-center justify-between text-xs font-semibold text-brand-700">
                Advanced settings <ChevronDown size={14} className={`transition ${advanced ? 'rotate-180' : ''}`} />
              </button>
              {advanced && (
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                  <NumberField label="Layer height" value={ui.layerHeight} onChange={set('layerHeight')} min={0.04} max={ui.nozzle * 0.8} step={0.02} suffix="mm" />
                  <NumberField label="First layer" value={ui.firstLayerHeight} onChange={set('firstLayerHeight')} min={0.08} max={ui.nozzle * 0.9} step={0.02} suffix="mm" />
                  <NumberField label="Nozzle temp" value={ui.nozzleTemp ?? s.material.nozzle} onChange={set('nozzleTemp')} min={150} max={320} suffix="°C" />
                  <NumberField label="Bed temp" value={ui.bedTemp ?? s.material.bed} onChange={set('bedTemp')} min={0} max={120} suffix="°C" />
                  <NumberField label="Min layer time" value={ui.minLayerTime} onChange={set('minLayerTime')} min={0} max={60} suffix="s" />
                  <NumberField label="Retraction" value={ui.retractLength ?? s.printer.retract.length} onChange={set('retractLength')} min={0} max={10} step={0.1} suffix="mm" />
                  <NumberField label="Support angle" value={ui.supportAngle} onChange={set('supportAngle')} min={20} max={80} suffix="°" />
                  <NumberField label="Brim width" value={ui.brimWidth} onChange={set('brimWidth')} min={1} max={20} suffix="mm" />
                  <Select label="Seam" value={ui.seam} onChange={set('seam')} options={[['rear', 'Aligned (rear)'], ['nearest', 'Nearest']]} />
                  <div className="flex items-end">
                    <button
                      onClick={() => setUi({ ...DEFAULTS, printer: ui.printer, material: ui.material })}
                      className="btn-ghost w-full px-3 py-2 text-xs"
                    >
                      Reset defaults
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <button onClick={slice} disabled={!model || busy || place?.outOfBounds} className="btn-primary w-full py-3.5 text-base">
            {status.state === 'slicing' ? <Loader2 size={18} className="animate-spin" /> : <Layers size={18} />}
            {status.state === 'slicing' ? `Slicing… ${Math.round((status.pct || 0) * 100)}%` : result && !stale ? 'Slice again' : 'Slice model'}
          </button>

          {st && (
            <Panel icon={Clock} title={stale ? 'Last slice (settings changed)' : 'Print estimate'}>
              <div className={`grid grid-cols-2 gap-2 ${stale ? 'opacity-60' : ''}`}>
                <Stat icon={Clock} label="Print time" value={formatTime(st.time)} />
                <Stat icon={Weight} label="Filament" value={`${st.grams.toFixed(1)} g`} sub={`${(st.filamentMm / 1000).toFixed(2)} m`} />
                <Stat icon={Wallet} label="Print cost" value={cedi(st.grams * pricePerGram)} sub={`${cedi(pricePerGram)} per gram`} />
                <Stat icon={Ruler} label="Layers" value={st.layers.toLocaleString()} sub={`${st.height.toFixed(2)} mm tall`} />
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Sliced in {(st.sliceMs / 1000).toFixed(1)} s. Time is estimated with the same motion model as Cura and doesn't include heating up.</p>
              <div className="mt-4 space-y-2">
                <button onClick={download} className="btn-dark w-full">
                  <Download size={16} /> Download G-code
                </button>
                <a href={`https://wa.me/${waNumber(site.whatsapp_number)}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer" className="btn-ghost w-full">
                  <MessageCircle size={16} /> Get it printed by us
                </a>
                {filamentProduct && (
                  <Link to={`/product/${filamentProduct.slug}`} className="flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
                    <ShoppingBag size={13} /> Need {s.material.name}? Shop {filamentProduct.name}
                  </Link>
                )}
              </div>
            </Panel>
          )}

          <p className="flex items-start gap-2 px-1 text-xs text-slate-500">
            <Scale size={14} className="mt-0.5 shrink-0" />
            G-code targets {s.printer.name} with a {ui.nozzle} mm nozzle and {ui.filamentDiameter} mm filament. Check the first layer on your printer before leaving a long print running.
          </p>
        </aside>
      </div>
    </div>
  )
}

function Panel({ icon: Icon, title, children }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-navy-900">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon size={15} /></span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function MiniBtn({ children, active, ...rest }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold ring-1 transition ${active ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-navy-800 ring-slate-200 hover:bg-brand-50 hover:ring-brand-300'}`}
    >
      {children}
    </button>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input py-2">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  )
}

/** Number input that lets people type freely and commits a clamped value on blur or Enter. */
function NumberBox({ value, onChange, min, max, step = 1, suffix }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(+(+value).toFixed(3))), [value])
  const commit = () => {
    const n = parseFloat(text)
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
    else setText(String(value))
  }
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        style={suffix ? { paddingRight: 14 + suffix.length * 7 } : undefined}
        className="input w-full min-w-[84px] py-2 tabular-nums"
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </div>
  )
}

function NumberField({ label, ...rest }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <NumberBox {...rest} />
    </label>
  )
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Icon size={11} /> {label}</p>
      <p className="mt-0.5 text-base font-bold text-navy-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}
