import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus, RotateCw, Trash2 } from 'lucide-react'
import { CIRCUIT_PARTS, newCircuitId, partTerminals, rotatePoint } from '../../lib/sim/circuitParts'
import { boardTerminalKind } from '../../lib/sim/circuit'
import PartArt from './PartArt'

export const WIRE_COLORS = ['#16a34a', '#2563eb', '#f97316', '#eab308', '#9333ea', '#dc2626', '#111827', '#f8fafc']

function partBounds(part) {
  const [x0, y0, x1, y1] = CIRCUIT_PARTS[part.type].box
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => rotatePoint(x, y, part.rot || 0))
  const xs = pts.map((p) => p[0] + part.x)
  const ys = pts.map((p) => p[1] + part.y)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

const snap = (v, step) => Math.round(v / step) * step

export default function Workbench({ board, top, circuit, onChange, sim, running, pins, selected, onSelect, onPress, wireColor, apiRef }) {
  const host = useRef(null)
  const [view, setView] = useState({ tx: 0, ty: 0, s: 6 })
  const [drawing, setDrawing] = useState(null) // { from, points, cursor, start, drag }
  const [hover, setHover] = useState(null)
  const action = useRef(null)
  const fitted = useRef(null)

  // Every connectable point: board pins, part legs and breadboard holes.
  const terminals = useMemo(() => {
    const list = []
    for (const [id, [x, y]] of Object.entries(top.pins)) {
      const kind = boardTerminalKind(board, id)
      const name = id.replace(/#\d+$/, '')
      list.push({ ref: `board:${id}`, x, y, label: kind.kind === 'gpio' && kind.pin.note ? `${name} (${kind.pin.note})` : name, board: true, kind: kind.kind })
    }
    for (const part of circuit.parts) {
      const def = CIRCUIT_PARTS[part.type]
      for (const t of partTerminals(part)) list.push({ ref: `${part.id}:${t.id}`, x: t.x, y: t.y, label: part.type === 'breadboard' ? `Breadboard ${t.label}` : `${def.name} · ${t.label}`, hole: part.type === 'breadboard' })
    }
    return list
  }, [board, top, circuit.parts])
  const termPos = useMemo(() => new Map(terminals.map((t) => [t.ref, t])), [terminals])

  const toWorld = useCallback((e) => {
    const r = host.current.getBoundingClientRect()
    return [(e.clientX - r.left - view.tx) / view.s, (e.clientY - r.top - view.ty) / view.s]
  }, [view])

  const nearest = useCallback(([x, y]) => {
    const tol = Math.max(0.9, 7 / view.s)
    let best = null
    let bestD = tol * tol
    for (const t of terminals) {
      const d = (t.x - x) ** 2 + (t.y - y) ** 2
      // Part legs win over the breadboard hole underneath them.
      if (d < bestD || (best?.hole && !t.hole && d <= bestD + 0.01)) { best = t; bestD = d }
    }
    return best
  }, [terminals, view.s])

  const fit = useCallback(() => {
    const el = host.current
    if (!el) return
    let [x0, y0, x1, y1] = [0, 0, top.width, top.height]
    for (const p of circuit.parts) {
      const b = partBounds(p)
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3])
    }
    for (const w of circuit.wires) {
      for (const [x, y] of w.points || []) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    }
    const pad = 8
    const s = Math.min((el.clientWidth - 2 * pad) / (x1 - x0), (el.clientHeight - 2 * pad) / (y1 - y0))
    setView({ s, tx: (el.clientWidth - (x1 - x0) * s) / 2 - x0 * s, ty: (el.clientHeight - (y1 - y0) * s) / 2 - y0 * s })
  }, [circuit.parts, top])

  // Fit when the board changes or a new example arrives.
  const signature = `${board.id}:${circuit.parts.length ? circuit.parts[0].id : ''}`
  useEffect(() => {
    if (fitted.current === signature) return
    fitted.current = signature
    fit()
  }, [signature, fit])

  // Lets the page drop new parts in the middle of what is on screen.
  if (apiRef) {
    apiRef.current = {
      center: () => {
        const el = host.current
        return el ? [(el.clientWidth / 2 - view.tx) / view.s, (el.clientHeight / 2 - view.ty) / view.s] : [0, 0]
      },
    }
  }

  const zoomAt = useCallback((factor, cx, cy) => {
    setView((v) => {
      const s = Math.min(40, Math.max(1.5, v.s * factor))
      const k = s / v.s
      return { s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }
    })
  }, [])

  useEffect(() => {
    const el = host.current
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const update = (patch) => onChange({ ...circuit, ...patch })
  const updatePart = (id, patch) => update({ parts: circuit.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  const finishWire = (to) => {
    const from = drawing.from
    setDrawing(null)
    if (!to || to === from) return
    if (circuit.wires.some((w) => (w.from === from && w.to === to) || (w.from === to && w.to === from))) return
    const kinds = [from, to].map((r) => termPos.get(r)?.kind)
    const color = kinds.includes('gnd') ? '#111827' : kinds.includes('supply') ? '#dc2626' : wireColor
    const id = newCircuitId('w')
    update({ wires: [...circuit.wires, { id, from, to, color, points: drawing.points }] })
    onSelect({ kind: 'wire', id })
  }

  const remove = useCallback(() => {
    if (!selected) return
    if (selected.kind === 'wire') onChange({ ...circuit, wires: circuit.wires.filter((w) => w.id !== selected.id) })
    else onChange({ parts: circuit.parts.filter((p) => p.id !== selected.id), wires: circuit.wires.filter((w) => !w.from.startsWith(`${selected.id}:`) && !w.to.startsWith(`${selected.id}:`)) })
    onSelect(null)
  }, [selected, circuit, onChange, onSelect])

  const rotate = useCallback(() => {
    if (selected?.kind !== 'part') return
    const part = circuit.parts.find((p) => p.id === selected.id)
    if (!part || part.type === 'breadboard') return
    onChange({ ...circuit, parts: circuit.parts.map((p) => (p.id === part.id ? { ...p, rot: ((p.rot || 0) + 90) % 360 } : p)) })
  }, [selected, circuit, onChange])

  // Drop a part so its legs land in breadboard holes when they are close.
  const settle = (part) => {
    if (part.type === 'breadboard') return { x: snap(part.x, 2.54), y: snap(part.y, 2.54) }
    const legs = partTerminals(part)
    const holes = terminals.filter((t) => t.hole && !t.ref.startsWith(`${part.id}:`))
    let best = null
    for (const h of holes) {
      const d = Math.hypot(h.x - legs[0].x, h.y - legs[0].y)
      if (d < 2 && (!best || d < best.d)) best = { d, dx: h.x - legs[0].x, dy: h.y - legs[0].y }
    }
    if (best) return { x: part.x + best.dx, y: part.y + best.dy }
    return { x: part.x + snap(legs[0].x, 1.27) - legs[0].x, y: part.y + snap(legs[0].y, 1.27) - legs[0].y }
  }

  const onPointerDown = (e) => {
    if (e.button === 2) return
    host.current.focus({ preventScroll: true })
    const p = toWorld(e)
    const term = nearest(p)
    const target = e.target
    e.currentTarget.setPointerCapture(e.pointerId)
    if (drawing) {
      if (term && term.ref !== drawing.from) finishWire(term.ref)
      else if (!term) setDrawing({ ...drawing, points: [...drawing.points, [snap(p[0], 1.27), snap(p[1], 1.27)]] })
      action.current = { kind: 'none' }
      return
    }
    const control = target.closest?.('[data-control]')
    if (control) {
      const id = control.dataset.control
      const part = circuit.parts.find((x) => x.id === id)
      if (part?.type === 'button') { onPress(id, true); action.current = { kind: 'press', id } }
      else if (part?.type === 'switch') { updatePart(id, { props: { ...part.props, on: !part.props.on } }); action.current = { kind: 'none' } }
      onSelect({ kind: 'part', id })
      return
    }
    if (term) {
      setDrawing({ from: term.ref, points: [], cursor: p, start: p })
      action.current = { kind: 'wire', start: p }
      return
    }
    const partEl = target.closest?.('[data-part]')
    const wireEl = target.closest?.('[data-wire]')
    if (partEl) {
      const part = circuit.parts.find((x) => x.id === partEl.dataset.part)
      onSelect({ kind: 'part', id: part.id })
      action.current = { kind: 'drag', id: part.id, dx: p[0] - part.x, dy: p[1] - part.y, moved: false }
    } else if (wireEl) {
      onSelect({ kind: 'wire', id: wireEl.dataset.wire })
      action.current = { kind: 'none' }
    } else {
      onSelect(null)
      action.current = { kind: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
    }
  }

  const onPointerMove = (e) => {
    const p = toWorld(e)
    const a = action.current
    if (a?.kind === 'pan') { setView((v) => ({ ...v, tx: a.tx + e.clientX - a.x, ty: a.ty + e.clientY - a.y })); return }
    if (a?.kind === 'drag') {
      a.moved = true
      updatePart(a.id, { x: p[0] - a.dx, y: p[1] - a.dy })
      return
    }
    if (drawing) setDrawing((d) => d && { ...d, cursor: p })
    const term = nearest(p)
    const r = host.current.getBoundingClientRect()
    setHover(term ? { term, x: e.clientX - r.left, y: e.clientY - r.top } : null)
  }

  const onPointerUp = (e) => {
    const a = action.current
    action.current = null
    if (!a) return
    if (a.kind === 'press') onPress(a.id, false)
    else if (a.kind === 'drag' && a.moved) {
      const part = circuit.parts.find((x) => x.id === a.id)
      if (part) updatePart(a.id, settle(part))
    } else if (a.kind === 'wire' && drawing) {
      const p = toWorld(e)
      // Dragged from one terminal to another: finish right away. A click keeps drawing.
      if (Math.hypot(p[0] - a.start[0], p[1] - a.start[1]) > 2) {
        const term = nearest(p)
        if (term && term.ref !== drawing.from) finishWire(term.ref)
      }
    }
  }

  // Shortcuts work wherever focus is, except while typing (inputs, the code editor).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') { setDrawing(null); onSelect(null) }
      else if (!selected) return
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove() }
      else if (e.key === 'r' || e.key === 'R') rotate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, remove, rotate, onSelect])

  // ---------- drawing helpers ----------
  const wirePoints = (w) => {
    const a = termPos.get(w.from)
    const b = termPos.get(w.to)
    if (!a || !b) return null
    return [[a.x, a.y], ...(w.points || []), [b.x, b.y]]
  }
  const volts = (ref) => (running && sim ? sim.voltage(ref) : null)
  const builtin = board.builtinLed != null ? pins?.[board.builtinLed] : null
  const builtinLevel = running && builtin?.m === 'out' ? (builtin.d != null ? builtin.d : builtin.v) : 0
  const selectedPart = selected?.kind === 'part' ? circuit.parts.find((p) => p.id === selected.id) : null

  return (
    <div
      ref={host}
      tabIndex={0}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-2xl bg-[#e9edf3] outline-none [background-image:radial-gradient(#c8d0dc_0.8px,transparent_0.8px)] [background-size:16px_16px]"
      style={{ cursor: drawing ? 'crosshair' : hover ? 'pointer' : 'default' }}
    >
      <svg className="absolute inset-0 h-full w-full" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onContextMenu={(e) => { e.preventDefault(); setDrawing(null) }}>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
          <image href={top.url} x="0" y="0" width={top.width} height={top.height} style={{ filter: 'drop-shadow(0 1.5px 2px rgba(15,23,42,.35))' }} />
          {top.leds.builtin && builtinLevel > 0.02 && <circle cx={top.leds.builtin[0]} cy={top.leds.builtin[1]} r={2.2} fill="#ffb000" opacity={0.35 + builtinLevel * 0.55} style={{ filter: 'blur(0.8px)' }} />}
          {top.leds.power && running && <circle cx={top.leds.power[0]} cy={top.leds.power[1]} r={1.6} fill={board.id === 'esp32' || board.id === 'rpi5' ? '#ff3030' : '#2fff6a'} opacity="0.75" style={{ filter: 'blur(0.6px)' }} />}
          {running && board.pins.map((pin) => {
            const s = pins?.[pin.num]
            const at = top.pins[pin.id]
            if (!at || s?.m !== 'out') return null
            const lvl = s.d != null ? s.d : s.v
            return lvl > 0.02 ? <circle key={pin.id} cx={at[0]} cy={at[1]} r="1.2" fill="#ff9a2e" opacity={0.35 + lvl * 0.5} pointerEvents="none" /> : null
          })}

          {[...circuit.parts].sort((a, b) => (a.type === 'breadboard' ? -1 : 0) - (b.type === 'breadboard' ? -1 : 0)).map((part) => {
            const [x0, y0, x1, y1] = CIRCUIT_PARTS[part.type].box
            const isSel = selected?.kind === 'part' && selected.id === part.id
            return (
              <g key={part.id} data-part={part.id} data-type={part.type} transform={`translate(${part.x} ${part.y}) rotate(${part.rot || 0})`} style={{ cursor: 'move' }}>
                <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="transparent" />
                <PartArt part={part} state={sim?.parts[part.id]} />
                {part.type === 'button' && <circle data-control={part.id} cx={3.81} cy={3.81} r={2.6} fill="transparent" style={{ cursor: 'pointer' }} />}
                {part.type === 'switch' && <rect data-control={part.id} x={-2.4} y={-4.2} width={9.88} height={3.6} fill="transparent" style={{ cursor: 'pointer' }} />}
                {isSel && <rect x={x0 - 0.8} y={y0 - 0.8} width={x1 - x0 + 1.6} height={y1 - y0 + 1.6} rx="0.8" fill="none" stroke="#2563eb" strokeWidth={1.6 / view.s * 1.2} strokeDasharray={`${4 / view.s} ${3 / view.s}`} />}
              </g>
            )
          })}

          {circuit.wires.map((w) => {
            const pts = wirePoints(w)
            if (!pts) return null
            const d = pts.map((p) => p.join(',')).join(' ')
            const isSel = selected?.kind === 'wire' && selected.id === w.id
            return (
              <g key={w.id} data-wire={w.id} style={{ cursor: 'pointer' }}>
                <polyline points={d} fill="none" stroke="transparent" strokeWidth={Math.max(2, 10 / view.s)} strokeLinejoin="round" />
                {isSel && <polyline points={d} fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />}
                <polyline points={d} fill="none" stroke="#0f172a" strokeOpacity="0.35" strokeWidth="1.05" strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={d} fill="none" stroke={w.color} strokeWidth="0.75" strokeLinejoin="round" strokeLinecap="round" />
                {[pts[0], pts[pts.length - 1]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.55" fill={w.color} stroke="#0f172a" strokeOpacity="0.5" strokeWidth="0.15" />)}
              </g>
            )
          })}

          {drawing && (() => {
            const a = termPos.get(drawing.from)
            if (!a) return null
            const pts = [[a.x, a.y], ...drawing.points, drawing.cursor].map((p) => p.join(',')).join(' ')
            return <polyline points={pts} fill="none" stroke={wireColor} strokeWidth="0.75" strokeDasharray="1.2 0.8" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          })()}

          {hover && <circle cx={hover.term.x} cy={hover.term.y} r="1.1" fill="none" stroke="#2563eb" strokeWidth="0.35" pointerEvents="none" />}
        </g>
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button type="button" onClick={() => zoomAt(1.25, host.current.clientWidth / 2, host.current.clientHeight / 2)} className="rounded-lg bg-white/90 p-2 text-navy-900 shadow-sm hover:bg-white" title="Zoom in"><Plus size={15} /></button>
        <button type="button" onClick={() => zoomAt(0.8, host.current.clientWidth / 2, host.current.clientHeight / 2)} className="rounded-lg bg-white/90 p-2 text-navy-900 shadow-sm hover:bg-white" title="Zoom out"><Minus size={15} /></button>
        <button type="button" onClick={fit} className="rounded-lg bg-white/90 p-2 text-navy-900 shadow-sm hover:bg-white" title="Fit everything"><Maximize size={15} /></button>
      </div>
      {selected && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-xl bg-white/95 p-1.5 shadow-md">
          {selectedPart && selectedPart.type !== 'breadboard' && <button type="button" onClick={rotate} className="rounded-lg p-1.5 text-navy-900 hover:bg-slate-100" title="Rotate (R)"><RotateCw size={15} /></button>}
          {selected.kind === 'wire' && WIRE_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => update({ wires: circuit.wires.map((w) => (w.id === selected.id ? { ...w, color: c } : w)) })} className="h-5 w-5 rounded-full border border-slate-300" style={{ background: c }} aria-label="Wire colour" />
          ))}
          <button type="button" onClick={remove} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Delete (Del)"><Trash2 size={15} /></button>
        </div>
      )}
      {hover && (
        <div className="pointer-events-none absolute z-10 w-max max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: hover.x, top: hover.y - 12 }}>
          <span className="font-bold">{hover.term.label}</span>
          {volts(hover.term.ref) != null && <span className="text-emerald-300"> · {volts(hover.term.ref).toFixed(2)} V</span>}
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-3 right-3 truncate text-[11px] text-slate-500">
        {drawing ? 'Click a pin or hole to connect · click empty space to add a bend · Esc cancels' : 'Click a pin or hole to start a wire · drag parts onto the breadboard · scroll to zoom'}
      </p>
    </div>
  )
}
