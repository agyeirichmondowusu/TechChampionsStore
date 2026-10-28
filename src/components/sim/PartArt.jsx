// SVG drawings of the workbench parts, in millimetres, in each part's own (unrotated) coordinates.
import { memo } from 'react'
import { BB, LED_COLORS } from '../../lib/sim/circuitParts'

const LEG = '#b9bec6'
const ROWS = 'abcdefghij'

export const BreadboardArt = memo(function BreadboardArt() {
  const holes = []
  for (let c = 0; c < BB.cols; c++) {
    for (let r = 0; r < 10; r++) holes.push(<rect key={`${r}-${c}`} x={BB.colX(c) - 0.55} y={BB.rowY(r) - 0.55} width="1.1" height="1.1" rx="0.15" fill="#3f4652" />)
  }
  const rails = []
  for (const [rail, y] of Object.entries(BB.rails)) {
    for (let k = 0; k < 25; k++) rails.push(<rect key={`${rail}${k}`} x={BB.railX(k) - 0.55} y={y - 0.55} width="1.1" height="1.1" rx="0.15" fill="#3f4652" />)
  }
  return (
    <g>
      <rect x="0" y="0" width={BB.width} height={BB.height} rx="1.6" fill="#f4f2ec" stroke="#d6d1c4" strokeWidth="0.3" />
      <rect x="1.2" y={BB.rowY(4) + 2.2} width={BB.width - 2.4} height={BB.rowY(5) - BB.rowY(4) - 4.4} rx="0.5" fill="#e4e0d5" />
      {[[BB.rails.tn - 1.9, '#2563eb'], [BB.rails.tp + 1.9, '#dc2626'], [BB.rails.bp - 1.9, '#dc2626'], [BB.rails.bn + 1.9, '#2563eb']].map(([y, c]) => (
        <line key={y} x1="3" x2={BB.width - 3} y1={y} y2={y} stroke={c} strokeWidth="0.3" />
      ))}
      {[['−', BB.rails.tn, '#2563eb'], ['+', BB.rails.tp, '#dc2626'], ['+', BB.rails.bp, '#dc2626'], ['−', BB.rails.bn, '#2563eb']].map(([t, y, c]) => (
        <text key={`l${y}`} x="1.6" y={y + 0.7} fontSize="2" fill={c} fontWeight="700">{t}</text>
      ))}
      {Array.from({ length: 10 }, (_, r) => (
        <g key={`r${r}`}>
          <text x="2.2" y={BB.rowY(r) + 0.55} fontSize="1.5" fill="#8a8478">{ROWS[r]}</text>
          <text x={BB.width - 3.4} y={BB.rowY(r) + 0.55} fontSize="1.5" fill="#8a8478">{ROWS[r]}</text>
        </g>
      ))}
      {Array.from({ length: BB.cols }, (_, c) => ((c + 1) % 5 === 0 || c === 0) && (
        <text key={`c${c}`} x={BB.colX(c)} y={BB.rowY(0) - 1.6} fontSize="1.4" fill="#8a8478" textAnchor="middle">{c + 1}</text>
      ))}
      {holes}
      {rails}
    </g>
  )
})

const BAND = ['#111111', '#7c3f12', '#dc2626', '#f97316', '#facc15', '#16a34a', '#2563eb', '#7c3aed', '#6b7280', '#f8fafc']
function bands(ohms) {
  const exp = Math.max(0, Math.floor(Math.log10(ohms)) - 1)
  const sig = Math.round(ohms / 10 ** exp)
  return [BAND[Math.floor(sig / 10) % 10], BAND[sig % 10], BAND[exp] || BAND[0]]
}

function ResistorArt({ props }) {
  const L = 10.16
  return (
    <g>
      <line x1="0" y1="0" x2={L} y2="0" stroke={LEG} strokeWidth="0.5" strokeLinecap="round" />
      <rect x="2.1" y="-1.15" width={L - 4.2} height="2.3" rx="1.1" fill="#e8cf9b" stroke="#c4a76c" strokeWidth="0.15" />
      {bands(props.ohms || 220).map((c, i) => <rect key={i} x={3.0 + i * 0.95} y="-1.12" width="0.5" height="2.24" fill={c} />)}
      <rect x={L - 3.6} y="-1.12" width="0.5" height="2.24" fill="#c9a227" />
    </g>
  )
}

function Dome({ cx, color, level, burned, base = '#e5e7eb' }) {
  return (
    <g>
      {level > 0.02 && !burned && <circle cx={cx} cy="-5" r={4 + level * 4} fill={color} opacity={0.18 + level * 0.4} style={{ filter: 'blur(1.2px)' }} />}
      <path d={`M${cx - 2.5} -2.2 V-5.3 a2.5 2.5 0 0 1 5 0 V-2.2 z`} fill={burned ? '#3f3f46' : level > 0.02 ? color : base} opacity={burned ? 1 : 0.55 + Math.min(1, level) * 0.45} stroke="#0003" strokeWidth="0.15" />
      <rect x={cx - 2.9} y="-2.6" width="5.8" height="0.8" rx="0.3" fill={burned ? '#27272a' : color} opacity="0.8" />
      <ellipse cx={cx - 1} cy="-5.6" rx="0.6" ry="1.1" fill="#fff" opacity="0.5" />
      {burned && <text x={cx} y="-7.6" fontSize="2" textAnchor="middle" fill="#ef4444" fontWeight="700">✕</text>}
    </g>
  )
}

function LedArt({ props, state }) {
  const c = (LED_COLORS[props.color] || LED_COLORS.red).hex
  return (
    <g>
      <path d="M0 0 V-1.2 L0.4 -1.8 V-2.2" fill="none" stroke={LEG} strokeWidth="0.45" />
      <line x1="2.54" y1="0" x2="2.54" y2="-2.2" stroke={LEG} strokeWidth="0.45" />
      <Dome cx={1.27} color={c} level={state?.level || 0} burned={state?.burned} />
    </g>
  )
}

function RgbArt({ state }) {
  const r = state?.rBurned ? 0 : state?.r || 0
  const g = state?.gBurned ? 0 : state?.g || 0
  const b = state?.bBurned ? 0 : state?.b || 0
  const lit = Math.max(r, g, b)
  const mix = `rgb(${Math.round(80 + r * 175)}, ${Math.round(80 + g * 175)}, ${Math.round(80 + b * 175)})`
  return (
    <g>
      {[0, 1, 2, 3].map((i) => <line key={i} x1={i * 2.54} y1="0" x2={i * 2.54} y2="-2.2" stroke={LEG} strokeWidth="0.45" />)}
      <g transform="translate(1.27 0) scale(1.15 1.15) translate(-1.27 0)"><Dome cx={2.54} color={mix} level={lit} base="#f1f5f9" /></g>
      <text x="0" y="1.6" fontSize="1.1" textAnchor="middle" fill="#dc2626">R</text>
      <text x="2.54" y="1.6" fontSize="1.1" textAnchor="middle" fill="#334155">−</text>
      <text x="5.08" y="1.6" fontSize="1.1" textAnchor="middle" fill="#16a34a">G</text>
      <text x="7.62" y="1.6" fontSize="1.1" textAnchor="middle" fill="#2563eb">B</text>
    </g>
  )
}

function BuzzerArt({ state }) {
  const cx = 3.81
  return (
    <g>
      {state?.freq > 0 && [7.5, 9].map((r) => <circle key={r} cx={cx} cy="0" r={r} fill="none" stroke="#3b82f6" strokeWidth="0.35" opacity="0.6"><animate attributeName="r" from="6" to={r + 2} dur="0.6s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.7" to="0" dur="0.6s" repeatCount="indefinite" /></circle>)}
      <circle cx={cx} cy="0" r="6" fill="#18181b" />
      <circle cx={cx} cy="0" r="4.2" fill="#27272a" />
      <circle cx={cx} cy="0" r="1" fill="#09090b" />
      <text x={cx - 3.6} y="-3" fontSize="2" fill="#a1a1aa">+</text>
    </g>
  )
}

function ServoArt({ state }) {
  const a = state?.angle ?? 90
  return (
    <g>
      <rect x="-1.4" y="-1.2" width="7.88" height="2.4" rx="0.3" fill="#111827" />
      {['#78350f', '#dc2626', '#f97316'].map((c, i) => <path key={c} d={`M${i * 2.54} 1 C${i * 2.54} 4, 2.54 4, ${1.6 + i * 0.9} 8`} fill="none" stroke={c} strokeWidth="0.7" />)}
      <rect x="-3.5" y="8" width="12.1" height="22.5" rx="1" fill="#1d4ed8" />
      <rect x="-5.8" y="11.5" width="16.7" height="2.2" rx="0.5" fill="#1e40af" />
      <circle cx="2.54" cy="14.5" r="3" fill="#e2e8f0" />
      <g transform={`rotate(${a - 90} 2.54 14.5)`}>
        <path d="M2.54 14.5 m-1.2 0 l0.55 -9.5 a0.65 0.65 0 0 1 1.3 0 l0.55 9.5 a1.2 1.2 0 0 1 -2.4 0z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.2" />
        <circle cx="2.54" cy="14.5" r="1" fill="#94a3b8" />
      </g>
      <text x="2.54" y="26" fontSize="2" fill="#dbeafe" textAnchor="middle" fontWeight="700">SG90</text>
      {state && !state.powered && <text x="2.54" y="29" fontSize="1.5" fill="#fde68a" textAnchor="middle">no power</text>}
    </g>
  )
}

function ButtonArt({ props }) {
  const s = 7.62
  return (
    <g>
      <rect x="-0.4" y="-0.4" width={s + 0.8} height={s + 0.8} rx="0.6" fill="#9aa1ab" />
      <rect x="0.2" y="0.2" width={s - 0.4} height={s - 0.4} rx="0.4" fill="#2b2f36" />
      <circle cx={s / 2} cy={s / 2} r={props.pressed ? 2.1 : 2.4} fill={props.pressed ? '#0b0d10' : '#1a1d22'} stroke="#000" strokeWidth="0.15" />
      <circle cx={s / 2 - 0.7} cy={s / 2 - 0.7} r="0.7" fill="#fff" opacity={props.pressed ? 0.04 : 0.14} />
    </g>
  )
}

function SwitchArt({ props }) {
  return (
    <g>
      <rect x="-2.4" y="-4.2" width="9.88" height="3.6" rx="0.4" fill="#334155" />
      <rect x={props.on ? 2.9 : -0.2} y="-3.8" width="2.4" height="2.8" rx="0.3" fill="#e2e8f0" />
      <text x="-1.6" y="-4.6" fontSize="1.2" fill="#64748b">OFF</text>
      <text x="5.6" y="-4.6" fontSize="1.2" fill="#64748b">ON</text>
    </g>
  )
}

function PotArt({ props }) {
  const a = -135 + ((props.value ?? 50) / 100) * 270
  return (
    <g>
      {[0, 2.54, 5.08].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="-1.6" stroke={LEG} strokeWidth="0.5" />)}
      <rect x="-2.95" y="-10.8" width="10.98" height="9.6" rx="0.8" fill="#2563eb" />
      <circle cx="2.54" cy="-6" r="3.6" fill="#e5e7eb" stroke="#cbd5e1" strokeWidth="0.2" />
      <g transform={`rotate(${a} 2.54 -6)`}><rect x="2.14" y="-9.2" width="0.8" height="3" rx="0.3" fill="#334155" /></g>
    </g>
  )
}

function LdrArt({ props }) {
  return (
    <g>
      <line x1="0" y1="0" x2="0" y2="-1.6" stroke={LEG} strokeWidth="0.45" />
      <line x1="5.08" y1="0" x2="5.08" y2="-1.6" stroke={LEG} strokeWidth="0.45" />
      <circle cx="2.54" cy="-3.2" r="5" fill="#fde68a" opacity={(props.value ?? 60) / 200} />
      <circle cx="2.54" cy="-3.2" r="2.7" fill="#f3e8d2" stroke="#c2a878" strokeWidth="0.2" />
      <path d="M0.8 -4.4 h1.2 v0.8 h1.2 v0.8 h1.2 v0.8 h0.6" fill="none" stroke="#b45309" strokeWidth="0.4" />
    </g>
  )
}

function TempArt({ state }) {
  return (
    <g>
      {[0, 2.54, 5.08].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="-1.4" stroke={LEG} strokeWidth="0.45" />)}
      <path d="M-1.1 -1.4 V-3.4 a3.64 2.6 0 0 1 7.28 0 V-1.4 z" fill="#111827" />
      <text x="2.54" y="-2.2" fontSize="1" fill="#9ca3af" textAnchor="middle">TMP36</text>
      {state && !state.powered && <text x="2.54" y="-6.6" fontSize="1.2" fill="#b45309" textAnchor="middle">no power</text>}
    </g>
  )
}

const ARTS = { resistor: ResistorArt, led: LedArt, rgb: RgbArt, buzzer: BuzzerArt, servo: ServoArt, button: ButtonArt, switch: SwitchArt, pot: PotArt, ldr: LdrArt, temp: TempArt }

export default function PartArt({ part, state }) {
  if (part.type === 'breadboard') return <BreadboardArt />
  const Art = ARTS[part.type]
  return Art ? <Art props={part.props || {}} state={state} /> : null
}
