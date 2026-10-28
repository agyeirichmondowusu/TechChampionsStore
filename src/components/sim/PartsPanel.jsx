import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { LED_COLORS, PARTS, pinFits } from '../../lib/sim/parts'
import { pinById } from '../../lib/sim/boards'
import { brightness, buzzerFreq, servoAngle } from '../../lib/sim/controller'

// ---------- part drawings ----------
function LedArt({ color, level }) {
  const c = LED_COLORS[color] || LED_COLORS.red
  return (
    <svg viewBox="0 0 40 56" className="h-14 w-10" aria-hidden="true">
      <defs>
        <radialGradient id={`g-${color}`}><stop offset="0" stopColor={c} stopOpacity="0.9" /><stop offset="1" stopColor={c} stopOpacity="0" /></radialGradient>
      </defs>
      {level > 0.02 && <circle cx="20" cy="17" r="20" fill={`url(#g-${color})`} opacity={Math.min(1, level * 1.2)} />}
      <rect x="13" y="28" width="2" height="26" fill="#a3a8b0" />
      <rect x="25" y="28" width="2" height="22" fill="#a3a8b0" />
      <path d="M9 30V17a11 11 0 0 1 22 0v13z" fill={c} opacity={0.35 + level * 0.65} stroke="#0002" />
      <rect x="7" y="28" width="26" height="3" rx="1" fill={c} opacity={0.55 + level * 0.45} />
      <ellipse cx="15" cy="14" rx="3" ry="5" fill="#fff" opacity="0.45" />
    </svg>
  )
}

function RgbArt({ r, g, b }) {
  const mix = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
  const lit = Math.max(r, g, b)
  return (
    <svg viewBox="0 0 40 56" className="h-14 w-10" aria-hidden="true">
      {lit > 0.02 && <circle cx="20" cy="17" r="20" fill={mix} opacity={lit * 0.5} />}
      {[10, 16, 22, 28].map((x, i) => <rect key={x} x={x} y="28" width="2" height={i === 1 ? 28 : 24} fill="#a3a8b0" />)}
      <path d="M9 30V17a11 11 0 0 1 22 0v13z" fill={lit > 0.02 ? mix : '#e7e9ee'} stroke="#0002" opacity="0.92" />
      <rect x="7" y="28" width="26" height="3" rx="1" fill="#d7dae0" />
      <ellipse cx="15" cy="14" rx="3" ry="5" fill="#fff" opacity="0.5" />
    </svg>
  )
}

function BuzzerArt({ freq }) {
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
      <circle cx="28" cy="28" r="20" fill="#18181b" />
      <circle cx="28" cy="28" r="15" fill="#27272a" />
      <circle cx="28" cy="28" r="3" fill="#0b0b0c" />
      <text x="28" y="14" fontSize="6" textAnchor="middle" fill="#a1a1aa">+</text>
      {freq > 0 && [24, 28].map((r) => <circle key={r} cx="28" cy="28" r={r} fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.6" className="animate-ping" style={{ transformOrigin: '28px 28px', animationDuration: '0.9s' }} />)}
    </svg>
  )
}

function ServoArt({ angle }) {
  const a = angle == null ? 90 : angle
  return (
    <svg viewBox="0 0 80 56" className="h-14 w-20" aria-hidden="true">
      <rect x="8" y="16" width="64" height="30" rx="3" fill="#1d4ed8" />
      <rect x="2" y="26" width="76" height="8" rx="2" fill="#1e40af" />
      <circle cx="26" cy="31" r="9" fill="#e2e8f0" />
      <g transform={`rotate(${a - 90} 26 31)`}>
        <path d="M26 31 m-3 0 l1.5 -26 a1.6 1.6 0 0 1 3 0 l1.5 26 a3 3 0 0 1 -6 0z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
        <circle cx="26" cy="31" r="3" fill="#94a3b8" />
      </g>
      <text x="54" y="35" fontSize="7" fill="#dbeafe" textAnchor="middle" fontWeight="700">SG90</text>
    </svg>
  )
}

function ButtonArt({ pressed }) {
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
      {[[9, 9], [47, 9], [9, 47], [47, 47]].map(([x, y]) => <rect key={`${x}${y}`} x={x - 2} y={y - 2} width="4" height="4" fill="#a3a8b0" />)}
      <rect x="10" y="10" width="36" height="36" rx="3" fill="#b8bec7" />
      <circle cx="28" cy="28" r={pressed ? 10 : 11} fill={pressed ? '#0f172a' : '#1f2937'} />
      <circle cx="25" cy="25" r="3" fill="#fff" opacity={pressed ? 0.05 : 0.15} />
    </svg>
  )
}

function SwitchArt({ on }) {
  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16" aria-hidden="true">
      <rect x="4" y="8" width="56" height="22" rx="3" fill="#334155" />
      <rect x={on ? 34 : 10} y="11" width="20" height="16" rx="2" fill="#e2e8f0" className="transition-all" />
      {[16, 32, 48].map((x) => <rect key={x} x={x - 1} y="30" width="2" height="9" fill="#a3a8b0" />)}
    </svg>
  )
}

function SensorArt({ type, value }) {
  if (type === 'pot') {
    const a = -135 + (value / 100) * 270
    return (
      <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
        <rect x="8" y="8" width="40" height="40" rx="4" fill="#2563eb" />
        <circle cx="28" cy="28" r="14" fill="#e5e7eb" />
        <g transform={`rotate(${a} 28 28)`}><rect x="26.5" y="15" width="3" height="11" rx="1" fill="#334155" /></g>
      </svg>
    )
  }
  if (type === 'ldr') {
    return (
      <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
        <circle cx="28" cy="26" r="20" fill="#fde68a" opacity={value / 140} />
        <circle cx="28" cy="26" r="13" fill="#f3e8d2" stroke="#c2a878" />
        <path d="M19 22h6v4h6v4h6" fill="none" stroke="#b45309" strokeWidth="2" />
        <rect x="21" y="38" width="2" height="16" fill="#a3a8b0" /><rect x="33" y="38" width="2" height="16" fill="#a3a8b0" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
      <path d="M16 30V18a12 12 0 0 1 24 0v12z" fill="#111827" />
      <text x="28" y="24" fontSize="6" textAnchor="middle" fill="#9ca3af">TMP36</text>
      {[20, 28, 36].map((x) => <rect key={x} x={x - 1} y="30" width="2" height="22" fill="#a3a8b0" />)}
    </svg>
  )
}

const SENSOR_RANGE = { pot: [0, 100, '%'], ldr: [0, 100, '% light'], temp: [-40, 125, '°C'] }

function PartCard({ part, board, pins, usedBy, onChange, onRemove, onPress, running }) {
  const def = PARTS[part.type]
  const pinState = (role) => {
    const p = pinById(board, part.pins[role])
    return p ? pins?.[p.num] : null
  }
  let art
  if (part.type === 'led') art = <LedArt color={part.props?.color} level={brightness(pinState('pin'))} />
  else if (part.type === 'rgb') art = <RgbArt r={brightness(pinState('r'))} g={brightness(pinState('g'))} b={brightness(pinState('b'))} />
  else if (part.type === 'buzzer') art = <BuzzerArt freq={buzzerFreq(pinState('pin'))} />
  else if (part.type === 'servo') art = <ServoArt angle={servoAngle(pinState('pin'), board)} />
  else if (part.type === 'button') art = <ButtonArt pressed={part.props?.pressed} />
  else if (part.type === 'switch') art = <SwitchArt on={part.props?.on} />
  else art = <SensorArt type={part.type} value={part.type === 'temp' ? ((part.props.value + 40) / 165) * 100 : part.props?.value ?? 0} />

  const setProp = (k, v) => onChange({ ...part, props: { ...part.props, [k]: v } })
  const freq = part.type === 'buzzer' ? buzzerFreq(pinState('pin')) : 0
  const angle = part.type === 'servo' ? servoAngle(pinState('pin'), board) : null

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="grid h-16 w-20 shrink-0 place-items-center rounded-lg bg-slate-50">{art}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-navy-900">{def.name}</p>
            <button type="button" onClick={onRemove} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${def.name}`}><Trash2 size={14} /></button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {def.roles.map((role) => (
              <label key={role.key} className="flex items-center gap-1 text-[11px] text-slate-500">
                {def.roles.length > 1 ? role.label : 'Pin'}
                <select
                  value={part.pins[role.key] || ''}
                  onChange={(e) => onChange({ ...part, pins: { ...part.pins, [role.key]: e.target.value } })}
                  className={`rounded-md border bg-white px-1.5 py-0.5 text-xs font-semibold text-navy-900 outline-none focus:border-brand-500 ${part.pins[role.key] ? 'border-slate-200' : 'border-amber-400'}`}
                >
                  <option value="">Choose…</option>
                  {board.pins.filter((p) => !p.hidden && pinFits(p, role.need)).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id}{p.note ? ` (${p.note})` : ''}{usedBy[p.id] && usedBy[p.id] !== part.id ? ' · in use' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {part.type === 'led' && (
              <select value={part.props?.color || 'red'} onChange={(e) => setProp('color', e.target.value)} className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold capitalize text-navy-900" aria-label="LED colour">
                {Object.keys(LED_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>
      {(part.type === 'button' || part.type === 'switch') && (
        <button
          type="button"
          onPointerDown={part.type === 'button' ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); onPress(true) } : undefined}
          onPointerUp={part.type === 'button' ? () => onPress(false) : undefined}
          onPointerCancel={part.type === 'button' ? () => onPress(false) : undefined}
          onKeyDown={part.type === 'button' ? (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); onPress(true) } } : undefined}
          onKeyUp={part.type === 'button' ? (e) => { if (e.key === ' ' || e.key === 'Enter') onPress(false) } : undefined}
          onClick={part.type === 'switch' ? () => setProp('on', !part.props?.on) : undefined}
          className={`mt-2 w-full select-none rounded-lg py-2 text-xs font-bold transition ${(part.props?.pressed || part.props?.on) ? 'bg-navy-900 text-white' : 'bg-slate-100 text-navy-900 hover:bg-slate-200'}`}
        >
          {part.type === 'button' ? (part.props?.pressed ? 'Pressed' : 'Press and hold') : part.props?.on ? 'Switch is ON (tap to turn off)' : 'Switch is OFF (tap to turn on)'}
        </button>
      )}
      {SENSOR_RANGE[part.type] && (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <input
            type="range"
            min={SENSOR_RANGE[part.type][0]}
            max={SENSOR_RANGE[part.type][1]}
            value={part.props?.value ?? 0}
            onChange={(e) => setProp('value', Number(e.target.value))}
            className="flex-1 accent-brand-600"
          />
          <span className="w-16 text-right font-semibold text-navy-900">{part.props?.value}{SENSOR_RANGE[part.type][2]}</span>
        </label>
      )}
      {running && part.type === 'buzzer' && <p className="mt-1 text-[11px] text-slate-500">{freq ? `Playing ${Math.round(freq)} Hz` : 'Silent'}</p>}
      {running && part.type === 'servo' && <p className="mt-1 text-[11px] text-slate-500">{angle != null ? `Angle ${Math.round(angle)}°` : 'Waiting for a servo signal'}</p>}
    </li>
  )
}

export default function PartsPanel({ board, parts, pins, running, onChange, onPress }) {
  const [adding, setAdding] = useState(false)
  const usedBy = {}
  parts.forEach((p) => Object.values(p.pins).forEach((id) => { if (id) usedBy[id] = p.id }))
  const groups = Object.entries(PARTS).reduce((acc, [type, def]) => ((acc[def.group] ||= []).push([type, def]), acc), {})

  const add = (type) => {
    const def = PARTS[type]
    const taken = new Set(Object.keys(usedBy))
    const pinsFor = {}
    for (const role of def.roles) {
      const free = board.pins.find((p) => !p.hidden && pinFits(p, role.need) && !taken.has(p.id) && p.num > 1)
      if (free) { pinsFor[role.key] = free.id; taken.add(free.id) } else pinsFor[role.key] = ''
    }
    onChange([...parts, { id: `p${Date.now().toString(36)}`, type, pins: pinsFor, props: { ...(def.props || {}) } }])
    setAdding(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy-900">Components <span className="font-normal text-slate-400">({parts.length})</span></h3>
        <button type="button" onClick={() => setAdding((a) => !a)} className="btn-ghost px-3 py-1.5 text-xs"><Plus size={14} /> Add</button>
      </div>
      {adding && (
        <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/60 p-2">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="mb-1.5 last:mb-0">
              <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{group}</p>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {items.map(([type, def]) => {
                  const possible = def.roles.every((r) => board.pins.some((p) => pinFits(p, r.need)))
                  return (
                    <button key={type} type="button" disabled={!possible} onClick={() => add(type)} title={possible ? def.blurb : `${board.short} has no pins for this part`} className="rounded-lg bg-white px-2 py-1.5 text-left text-xs font-semibold text-navy-900 shadow-sm hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40">
                      {def.name}
                      <span className="block text-[10px] font-normal leading-tight text-slate-500">{possible ? def.blurb : 'Needs analog inputs'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {parts.length ? (
        <ul className="space-y-2">
          {parts.map((part) => (
            <PartCard
              key={part.id}
              part={part}
              board={board}
              pins={pins}
              usedBy={usedBy}
              running={running}
              onChange={(next) => onChange(parts.map((p) => (p.id === part.id ? next : p)))}
              onRemove={() => onChange(parts.filter((p) => p.id !== part.id))}
              onPress={(down) => onPress(part, down)}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">No components yet. Add an LED, button or sensor and pick the pin it connects to.</p>
      )}
    </div>
  )
}
