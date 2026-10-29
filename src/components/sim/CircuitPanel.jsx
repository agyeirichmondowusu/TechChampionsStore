import { AlertTriangle, Flame } from 'lucide-react'
import { CIRCUIT_PARTS, LED_COLORS, RESISTOR_VALUES, formatOhms } from '../../lib/sim/circuitParts'
import { WIRE_COLORS } from './Workbench'

const SLIDERS = { pot: [0, 100, '%', 'Knob'], ldr: [0, 100, '% light', 'Light'], temp: [-40, 125, ' °C', 'Temperature'] }

function PartControls({ part, state, onProps, onPress, compact }) {
  const p = part.props || {}
  const def = CIRCUIT_PARTS[part.type]
  return (
    <div className="space-y-2">
      {part.type === 'resistor' && (
        <label className="flex items-center justify-between gap-2 text-xs text-slate-500">Resistance
          <select value={p.ohms} onChange={(e) => onProps({ ohms: Number(e.target.value) })} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-navy-900">
            {RESISTOR_VALUES.map((r) => <option key={r} value={r}>{formatOhms(r)}</option>)}
          </select>
        </label>
      )}
      {part.type === 'led' && (
        <label className="flex items-center justify-between gap-2 text-xs text-slate-500">Colour
          <select value={p.color} onChange={(e) => onProps({ color: e.target.value })} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold capitalize text-navy-900">
            {Object.keys(LED_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
      {part.type === 'button' && (
        <button
          type="button"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPress(true) }}
          onPointerUp={() => onPress(false)}
          onPointerCancel={() => onPress(false)}
          onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); onPress(true) } }}
          onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') onPress(false) }}
          className={`w-full select-none rounded-lg py-2 text-xs font-bold transition ${p.pressed ? 'bg-navy-900 text-white' : 'bg-slate-100 text-navy-900 hover:bg-slate-200'}`}
        >{p.pressed ? 'Pressed' : compact ? 'Press and hold' : 'Press and hold (or click the button on the board)'}</button>
      )}
      {part.type === 'switch' && (
        <button type="button" onClick={() => onProps({ on: !p.on })} className={`w-full rounded-lg py-2 text-xs font-bold ${p.on ? 'bg-navy-900 text-white' : 'bg-slate-100 text-navy-900 hover:bg-slate-200'}`}>
          {p.on ? 'ON (tap to switch off)' : 'OFF (tap to switch on)'}
        </button>
      )}
      {SLIDERS[part.type] && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          {!compact && <span className="w-20">{SLIDERS[part.type][3]}</span>}
          <input type="range" min={SLIDERS[part.type][0]} max={SLIDERS[part.type][1]} value={p.value ?? 0} onChange={(e) => onProps({ value: Number(e.target.value) })} className="flex-1 accent-brand-600" />
          <span className="w-16 text-right font-semibold text-navy-900">{p.value}{SLIDERS[part.type][2]}</span>
        </label>
      )}
      {!compact && state && (
        <p className="text-[11px] text-slate-500">
          {part.type === 'led' && (state.burned ? 'Burned out. Add a resistor, then press Run again.' : `${(state.mA || 0).toFixed(1)} mA through the LED`)}
          {part.type === 'rgb' && `R ${(state.rmA || 0).toFixed(1)} mA · G ${(state.gmA || 0).toFixed(1)} mA · B ${(state.bmA || 0).toFixed(1)} mA`}
          {part.type === 'buzzer' && (state.freq ? `Playing ${Math.round(state.freq)} Hz` : 'Silent')}
          {part.type === 'servo' && (!state.powered ? 'No power: wire red to 5V and brown to GND.' : state.angle != null ? `Angle ${Math.round(state.angle)}°` : state.driven ? 'Waiting for a servo signal' : 'Wire orange to a PWM pin.')}
          {part.type === 'temp' && !state.powered && 'No power: +Vs to 3.3/5 V and GND to GND.'}
        </p>
      )}
      {!compact && <p className="text-[11px] leading-snug text-slate-400">{def.blurb}</p>}
    </div>
  )
}

export default function CircuitPanel({ board, circuit, selected, sim, running, onAdd, onChange, onPress, wireColor, onWireColor }) {
  const groups = Object.entries(CIRCUIT_PARTS).reduce((acc, [type, def]) => ((acc[def.group] ||= []).push([type, def]), acc), {})
  const part = selected?.kind === 'part' ? circuit.parts.find((p) => p.id === selected.id) : null
  const setProps = (id, patch) => onChange({ ...circuit, parts: circuit.parts.map((p) => (p.id === id ? { ...p, props: { ...p.props, ...patch } } : p)) })
  const interactive = circuit.parts.filter((p) => ['button', 'switch', 'pot', 'ldr', 'temp'].includes(p.type))
  const counts = {}

  return (
    <div className="space-y-4">
      {sim?.issues?.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {sim.issues.map((m) => <p key={m} className="flex gap-2">{/burn/i.test(m) ? <Flame size={14} className="shrink-0 text-red-500" /> : <AlertTriangle size={14} className="shrink-0" />}{m}</p>)}
        </div>
      )}

      {interactive.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-navy-900">Controls</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {interactive.map((p) => {
              counts[p.type] = (counts[p.type] || 0) + 1
              return (
                <div key={p.id} className={`rounded-xl border p-2.5 ${selected?.id === p.id ? 'border-brand-400 bg-brand-50/50' : 'border-slate-200 bg-white'}`}>
                  <p className="mb-1.5 text-xs font-bold text-navy-900">{CIRCUIT_PARTS[p.type].name} {counts[p.type] > 1 ? counts[p.type] : ''}</p>
                  <PartControls part={p} compact onProps={(patch) => setProps(p.id, patch)} onPress={(down) => onPress(p.id, down)} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {part && part.type !== 'breadboard' && (
        <div className="rounded-xl border border-brand-200 bg-white p-3">
          <p className="mb-2 text-sm font-bold text-navy-900">{CIRCUIT_PARTS[part.type].name}</p>
          <PartControls part={part} state={sim?.parts[part.id]} onProps={(patch) => setProps(part.id, patch)} onPress={(down) => onPress(part.id, down)} />
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-navy-900">Add components</h3>
          <div className="flex items-center gap-1" title="Colour for new wires">
            {WIRE_COLORS.slice(0, 6).map((c) => <button key={c} type="button" onClick={() => onWireColor(c)} className={`h-4 w-4 rounded-full border ${wireColor === c ? 'ring-2 ring-brand-500 ring-offset-1' : 'border-slate-300'}`} style={{ background: c }} aria-label="New wire colour" />)}
          </div>
        </div>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-2">
            <p className="px-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group}</p>
            <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {items.map(([type, def]) => (
                <button key={type} type="button" onClick={() => onAdd(type)} title={def.blurb} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-semibold text-navy-900 hover:border-brand-300 hover:bg-brand-50">
                  {def.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-[11px] leading-snug text-slate-400">
          New parts appear in the middle of the workbench. Drag them onto the breadboard; legs snap into the holes. {board.vref < 4 ? `The ${board.short} runs at 3.3 V.` : `The ${board.short} runs at 5 V.`}
          {running ? '' : ' Press Run to power the board.'}
        </p>
      </div>
    </div>
  )
}
