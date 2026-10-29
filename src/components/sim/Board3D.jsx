import { useEffect, useRef, useState } from 'react'
import { Focus, RotateCw } from 'lucide-react'
import { BoardScene } from './boardScene'

const describe = (s) => {
  if (!s) return 'Not used yet'
  if (s.m === 'out') {
    if (s.f) return `Output · tone ${Math.round(s.f)} Hz`
    if (s.d != null) return `Output · PWM ${Math.round(s.d * 100)}%`
    return `Output · ${s.v ? 'HIGH' : 'LOW'}`
  }
  return `Input${s.m === 'pullup' ? ' (pull-up)' : s.m === 'pulldown' ? ' (pull-down)' : ''} · reads ${s.v ? 'HIGH' : 'LOW'}`
}

export default function Board3D({ board, pins, wired, running, serialTick, labels }) {
  const host = useRef(null)
  const scene = useRef(null)
  const [hover, setHover] = useState(null)
  const [failed, setFailed] = useState(false)
  const [spin, setSpin] = useState(true)

  useEffect(() => {
    try {
      scene.current = new BoardScene(host.current)
      scene.current.onHover = setHover
    } catch {
      setFailed(true)
    }
    return () => scene.current?.dispose()
  }, [])

  useEffect(() => {
    if (!scene.current) return
    scene.current.setBoard(board)
    setSpin(true)
  }, [board])

  useEffect(() => { scene.current?.setPins(pins || {}, wired) }, [pins, wired])
  useEffect(() => { if (scene.current) scene.current.running = running }, [running])
  useEffect(() => { if (serialTick) scene.current?.pulseSerial() }, [serialTick])
  useEffect(() => { if (scene.current) scene.current.controls.autoRotate = spin }, [spin])

  const state = hover ? pins?.[hover.pin.num] : null

  return (
    <div className="relative h-full min-h-[18rem] overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_top,#f8fbff,#dfe7f3)]">
      <div ref={host} className="absolute inset-0" />
      {failed && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">3D needs WebGL, which this browser has turned off. The simulator still works.</p>}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-bold text-navy-900 shadow-sm backdrop-blur">{board.name}</div>
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button type="button" onClick={() => setSpin((s) => !s)} title={spin ? 'Stop rotating' : 'Rotate'} className={`rounded-lg p-2 shadow-sm backdrop-blur transition ${spin ? 'bg-brand-600 text-white' : 'bg-white/80 text-navy-900 hover:bg-white'}`}><RotateCw size={15} /></button>
        <button type="button" onClick={() => { scene.current?.resetView(); setSpin(false) }} title="Reset view" className="rounded-lg bg-white/80 p-2 text-navy-900 shadow-sm backdrop-blur hover:bg-white"><Focus size={15} /></button>
      </div>
      <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-500">Drag to rotate · scroll to zoom · hover a pin</p>
      {hover && (
        <div className="pointer-events-none absolute z-10 w-max max-w-[14rem] -translate-x-1/2 -translate-y-full rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: hover.x, top: hover.y - 10 }}>
          <span className="font-bold">{hover.pin.id}</span>
          {hover.pin.note && <span className="text-brand-200"> · {hover.pin.note}</span>}
          <span className="block text-[11px] text-brand-100/80">{describe(state)}</span>
          {labels?.[hover.pin.num] && <span className="block text-[11px] text-emerald-300">Wired to {labels[hover.pin.num]}</span>}
        </div>
      )}
    </div>
  )
}
