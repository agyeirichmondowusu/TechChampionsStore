import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Cpu } from 'lucide-react'
import { BOARDS, LANGUAGES } from '../../lib/sim/boards'
import { boardThumbnail } from './boardScene'

// Renders the board thumbnails one at a time after first paint so the page stays responsive.
function useThumbnails() {
  const [thumbs, setThumbs] = useState({})
  useEffect(() => {
    let cancelled = false
    const queue = BOARDS.map((b) => b.id)
    const next = () => {
      if (cancelled || !queue.length) return
      const id = queue.shift()
      try {
        const url = boardThumbnail(id)
        setThumbs((t) => ({ ...t, [id]: url }))
      } catch {
        // WebGL unavailable: the picker falls back to an icon.
      }
      setTimeout(next, 30)
    }
    const start = setTimeout(next, 200)
    return () => {
      cancelled = true
      clearTimeout(start)
    }
  }, [])
  return thumbs
}

export default function BoardPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(0)
  const thumbs = useThumbnails()
  const root = useRef(null)
  const list = useRef(null)
  const current = BOARDS.find((b) => b.id === value) || BOARDS[0]

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!root.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    setFocus(Math.max(0, BOARDS.findIndex((b) => b.id === value)))
    requestAnimationFrame(() => list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
    return () => document.removeEventListener('pointerdown', close)
  }, [open, value])

  const choose = (id) => {
    setOpen(false)
    if (id !== value) onChange(id)
  }

  const onKey = (e) => {
    if (!open) {
      if (['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true) }
      return
    }
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(BOARDS.length - 1, f + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(BOARDS[focus].id) }
  }

  useEffect(() => {
    if (open) list.current?.children[focus]?.scrollIntoView({ block: 'nearest' })
  }, [focus, open])

  const Thumb = ({ id, className }) => (thumbs[id]
    ? <img src={thumbs[id]} alt="" className={`${className} object-contain`} draggable="false" />
    : <span className={`${className} grid place-items-center rounded-lg bg-white/10 text-brand-200`}><Cpu size={18} /></span>)

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-100/70">Board</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-[15rem] items-center gap-3 rounded-xl border border-white/15 bg-white/10 py-1.5 pl-1.5 pr-3 text-left text-white transition hover:bg-white/15 disabled:opacity-60"
      >
        <Thumb id={current.id} className="h-10 w-14 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{current.name}</span>
          <span className="block truncate text-[11px] text-brand-100/70">{current.chip}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          aria-label="Choose a board"
          className="absolute left-0 z-40 mt-2 max-h-[min(70vh,28rem)] w-[min(92vw,24rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl"
        >
          {BOARDS.map((b, i) => (
            <li
              key={b.id}
              role="option"
              aria-selected={b.id === value}
              onPointerEnter={() => setFocus(i)}
              onClick={() => choose(b.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl p-2 transition ${i === focus ? 'bg-brand-50' : ''}`}
            >
              <span className="rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 p-1"><Thumb id={b.id} className="h-16 w-24" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
                  {b.name}
                  {b.id === value && <Check size={14} className="text-brand-600" />}
                </span>
                <span className="block text-[11px] text-slate-500">{b.chip}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {b.languages.map((l) => <span key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{LANGUAGES[l].label}</span>)}
                  {b.engine === 'avr' && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Real firmware</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
